#!/bin/bash
# 10 — Provision: web user, directories, MySQL database/schema/accounts,
# protected env files, and the PHP-FPM pool. Nothing public changes yet: Caddy
# still proxies to the Rust service. Safe to re-run; existing accounts,
# passwords, and env files are kept.
set -euo pipefail
# shellcheck source-path=SCRIPTDIR source=lib.sh
source "$(dirname "$0")/lib.sh"
require_root

say "System users"
id "$COLLECTOR_USER" >/dev/null 2>&1 || die "$COLLECTOR_USER must already exist; it runs the collector."
if ! id "$WEB_USER" >/dev/null 2>&1; then
    useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin "$WEB_USER"
fi
if id -nG "$WEB_USER" | tr ' ' '\n' | grep -qvx "$WEB_USER"; then
    die "$WEB_USER must belong to no other groups."
fi

say "Directories"
install -d -m 0755 -o root -g root /srv/www "$BASE" "$BASE/releases" "$ETC"
install -d -m 0750 -o root -g sawyer "$BACKUPS"

say "Protected environment files"
old_env=$ETC/status.env   # Rust-era file: only optional settings are carried forward.
carry() { if [[ -r $old_env ]]; then env_value "$old_env" "$1"; fi; }
new_password() { php -r 'echo bin2hex(random_bytes(24));'; }

write_env() {   # write_env <path> <group>; content on stdin
    local tmp
    tmp=$(mktemp "$ETC/.env.XXXXXX")
    cat > "$tmp"
    chown root:"$2" "$tmp"
    chmod 0640 "$tmp"
    mv -f "$tmp" "$1"
}

repo_root=$(carry STATUS_REPO_ROOT)
repo_root=${repo_root:-/home/sawyer/github}

if [[ ! -f $ETC/web.env ]]; then
    token=$(carry STATUS_OPERATOR_TOKEN)
    if [[ -n $token && ${#token} -lt 32 ]]; then
        say "The old STATUS_OPERATOR_TOKEN is shorter than 32 characters and was not carried over; /operator stays disabled."
        token=
    fi
    {
        printf 'APP_ENV=production\nDB_HOST=127.0.0.1\nDB_PORT=3306\nDB_NAME=%s\nDB_USER=%s\nDB_PASSWORD=%s\n' \
            "$DB_NAME" "$DB_WEB_USER" "$(new_password)"
        printf 'STATUS_REPO_ROOT=%s\nSTATUS_STALE_AFTER_MINUTES=15\n' "$repo_root"
        if [[ -n $token ]]; then printf 'STATUS_OPERATOR_TOKEN=%s\n' "$token"; fi
    } | write_env "$ETC/web.env" "$WEB_USER"
fi

if [[ ! -f $ETC/collector.env ]]; then
    webhook=$(carry STATUS_ALERT_WEBHOOK_URL)
    {
        printf 'APP_ENV=production\nDB_HOST=127.0.0.1\nDB_PORT=3306\nDB_NAME=%s\nDB_USER=%s\nDB_PASSWORD=%s\n' \
            "$DB_NAME" "$DB_COLLECTOR_USER" "$(new_password)"
        printf 'STATUS_REPO_ROOT=%s\n' "$repo_root"
        printf 'STATUS_RETENTION_DAYS=%s\n' "$(carry STATUS_RETENTION_DAYS | grep -E '^[1-9][0-9]*$' || echo 30)"
        printf 'STATUS_ALERT_REPEAT_AFTER_MINUTES=%s\n' "$(carry STATUS_ALERT_REPEAT_AFTER_MINUTES | grep -E '^[0-9]+$' || echo 60)"
        printf 'STATUS_ALERT_MAX_NOTIFICATIONS_PER_RUN=%s\n' "$(carry STATUS_ALERT_MAX_NOTIFICATIONS_PER_RUN | grep -E '^[0-9]+$' || echo 5)"
        if [[ -n $webhook ]]; then printf 'STATUS_ALERT_WEBHOOK_URL=%s\n' "$webhook"; fi
    } | write_env "$ETC/collector.env" "$COLLECTOR_USER"
fi
chown root:"$WEB_USER" "$ETC/web.env" && chmod 0640 "$ETC/web.env"
chown root:"$COLLECTOR_USER" "$ETC/collector.env" && chmod 0640 "$ETC/collector.env"

say "MySQL database, schema, and least-privilege accounts"
web_password=$(env_value "$ETC/web.env" DB_PASSWORD)
collector_password=$(env_value "$ETC/collector.env" DB_PASSWORD)
[[ $web_password =~ ^[0-9a-f]{48}$ && $collector_password =~ ^[0-9a-f]{48}$ ]] || die "Unexpected DB_PASSWORD format in $ETC; inspect the env files."
mysql_admin -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"
mysql_admin "$DB_NAME" < "$REPO/database/schema.sql"
# Passwords travel on stdin, never in a process argument.
{
    for account in "$DB_WEB_USER:$web_password" "$DB_COLLECTOR_USER:$collector_password"; do
        printf "CREATE USER IF NOT EXISTS '%s'@'127.0.0.1' IDENTIFIED BY '%s';\n" "${account%%:*}" "${account#*:}"
        printf "ALTER USER '%s'@'127.0.0.1' IDENTIFIED BY '%s';\n" "${account%%:*}" "${account#*:}"
    done
    for table in rollups incidents maintenance_windows deployment_events; do
        printf "GRANT SELECT ON \`%s\`.\`%s\` TO '%s'@'127.0.0.1';\n" "$DB_NAME" "$table" "$DB_WEB_USER"
    done
    printf "GRANT SELECT, INSERT, UPDATE, DELETE ON \`%s\`.* TO '%s'@'127.0.0.1';\n" "$DB_NAME" "$DB_COLLECTOR_USER"
} | mysql_admin

say "PHP-FPM pool"
backup "$ETC/php-fpm.conf"
backup "$POOL_LINK"
install -m 0644 -o root -g root "$REPO/deploy/php-fpm.conf" "$ETC/php-fpm.conf"
ln -sfn "$ETC/php-fpm.conf" "$POOL_LINK"
if ! fpm_reload; then
    restore "$ETC/php-fpm.conf"
    restore "$POOL_LINK"
    php-fpm8.5 -t && systemctl reload php8.5-fpm
    die "PHP-FPM rejected the pool; the previous configuration was restored."
fi
for _ in 1 2 3 4 5 6 7 8 9 10; do [[ -S /run/php/status-dunamismax.sock ]] && break; sleep 0.5; done

say "Verification"
failed=0
check() { if "$@"; then printf '  ok    %s\n' "${*: -1}"; else printf '  FAIL  %s\n' "${*: -1}"; failed=1; fi; }
check test -S /run/php/status-dunamismax.sock
if [[ $(stat -c '%U %a' /run/php/status-dunamismax.sock 2>/dev/null) == 'caddy 600' ]]; then
    echo '  ok    socket is caddy-only (0600)'
else
    echo '  FAIL  socket owner/mode'
    failed=1
fi
check runuser -u "$WEB_USER" -- test -r "$ETC/web.env"
check runuser -u "$COLLECTOR_USER" -- test -r "$ETC/collector.env"
if runuser -u "$WEB_USER" -- test -r "$ETC/collector.env"; then echo '  FAIL  web user can read collector.env'; failed=1; else echo '  ok    web user cannot read collector.env'; fi
if runuser -u "$COLLECTOR_USER" -- test -r "$ETC/web.env"; then echo '  FAIL  collector can read web.env'; failed=1; else echo '  ok    collector cannot read web.env'; fi
mysql_admin -e "SHOW GRANTS FOR '$DB_WEB_USER'@'127.0.0.1'; SHOW GRANTS FOR '$DB_COLLECTOR_USER'@'127.0.0.1';" | sed 's/^/  /'
mysql_admin "$DB_NAME" -e 'SHOW TABLES' | tr '\n' ' ' | sed 's/^/  tables: /'; echo
(( failed == 0 )) || die "Verification failed."

finish
cat <<EOF

Next: sudo $REPO/deploy/20-migrate-history.sh

Rollback (nothing public uses these yet):
  sudo rm $POOL_LINK && sudo systemctl reload php8.5-fpm
  sudo mysql -e "DROP USER '$DB_WEB_USER'@'127.0.0.1', '$DB_COLLECTOR_USER'@'127.0.0.1'; DROP DATABASE $DB_NAME;"   # only before 20-migrate-history
  sudo rm $ETC/web.env $ETC/collector.env $ETC/php-fpm.conf && sudo userdel $WEB_USER
EOF
