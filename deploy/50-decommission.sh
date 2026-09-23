#!/bin/bash
# 50 — Decommission, run last: only after cutover verifies, take a final
# pg_dump, then remove the Rust unit and binary, the Rust-era env file and
# stray Caddy copy, and the PostgreSQL database and role. Does not touch the
# PostgreSQL server or any other database. Safe to re-run.
set -euo pipefail
# shellcheck source-path=SCRIPTDIR source=lib.sh
source "$(dirname "$0")/lib.sh"
require_root

say "Confirming cutover"
if ! grep -qs 'php_fastcgi unix//run/php/status-dunamismax.sock' "$SITE_CADDYFILE"; then
    die "$SITE_CADDYFILE is not the PHP site; run 40-cutover.sh first."
fi
! grep -qx "$DOMAIN {" /etc/caddy/Caddyfile || die "The main Caddyfile still defines $DOMAIN; run 40-cutover.sh first."
! systemctl is-active --quiet "$RUST_UNIT" || die "$RUST_UNIT is still running; run 40-cutover.sh first."
! systemctl cat status-dunamismax-collector.service 2>/dev/null | grep -qF "$RUST_BINARY" || die "The collector still runs the Rust binary; run 30-deploy.sh first."
ready=$(public_get /readyz 2>/dev/null) || ready=
[[ $ready == *'"database":"ready"'* && $ready == *mysql-ready* ]] || die "https://$DOMAIN/readyz does not report MySQL ready."
age=$(latest_rollup_age_minutes)
[[ $age -ge 0 && $age -lt 15 ]] || die "The latest MySQL snapshot is missing or ${age} minutes old."
if pgrep -u "$COLLECTOR_USER" -f "$RUST_BINARY" >/dev/null; then die "A Rust status-web process is still running."; fi
echo '  ok    PHP site, MySQL readiness, fresh snapshots, no Rust process'

pg_role=
if pg_exists; then
    say "Final PostgreSQL backup"
    install -d -m 0750 -o root -g sawyer "$BACKUPS"
    dump=$BACKUPS/postgresql-$PG_DB-final-$STAMP.sql.gz
    runuser -u postgres -- pg_dump "$PG_DB" | gzip > "$dump.partial"
    gzip -t "$dump.partial"
    [[ $(gzip -dc "$dump.partial" | grep -c '^COPY ') -ge 7 ]] || die "The dump does not contain the expected tables; nothing was removed."
    mv "$dump.partial" "$dump"
    chown root:sawyer "$dump"
    chmod 0640 "$dump"
    printf '  %s (%s)\n' "$dump" "$(du -h "$dump" | cut -f1)"
    pg_role=$(runuser -u postgres -- psql -XAtq -d postgres -c "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = '$PG_DB'")
fi

say "Removing the Rust service"
if [[ -e /etc/systemd/system/$RUST_UNIT || -d /etc/systemd/system/$RUST_UNIT.d ]]; then
    systemctl disable "$RUST_UNIT" 2>/dev/null || true
    backup "/etc/systemd/system/$RUST_UNIT"
    rm -f "/etc/systemd/system/$RUST_UNIT"
    if [[ -d /etc/systemd/system/$RUST_UNIT.d ]]; then
        install -d -m 0700 "$BACKUP_DIR/etc/systemd/system"
        cp -a "/etc/systemd/system/$RUST_UNIT.d" "$BACKUP_DIR/etc/systemd/system/"
        rm -rf "/etc/systemd/system/$RUST_UNIT.d"
    fi
    systemctl daemon-reload
    systemctl reset-failed "$RUST_UNIT" 2>/dev/null || true
fi
for path in "$RUST_BINARY" "$ETC/status.env" /etc/caddy/status.dunamismax.caddy; do
    if [[ -e $path ]]; then
        if [[ $path == /etc/caddy/* ]] && grep -rqF "$path" /etc/caddy/Caddyfile /etc/caddy/sites 2>/dev/null; then
            say "Keeping $path: a Caddy file still imports it."
            continue
        fi
        backup "$path"
        rm -f "$path"
        printf '  removed %s\n' "$path"
    fi
done
rm -rf /var/lib/status-dunamismax-migration

if pg_exists; then
    say "Dropping PostgreSQL database $PG_DB"
    runuser -u postgres -- psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "DROP DATABASE \"$PG_DB\""
fi
old_url_role=
if [[ -f $BACKUP_DIR$ETC/status.env ]]; then
    old_url_role=$(env_value "$BACKUP_DIR$ETC/status.env" STATUS_DATABASE_URL | sed -n 's#^postgres\(ql\)\?://\([^:@/]*\).*#\2#p')
fi
for role in $(printf '%s\n' "$pg_role" "$old_url_role" "$COLLECTOR_USER" | sort -u); do
    [[ -n $role && $role != postgres ]] || continue
    exists=$(runuser -u postgres -- psql -XAtq -d postgres -c "SELECT 1 FROM pg_roles WHERE rolname = '$role'")
    [[ $exists == 1 ]] || continue
    say "Dropping PostgreSQL role $role"
    # Fails, and changes nothing, if the role still owns objects in another database.
    if ! runuser -u postgres -- psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "DROP ROLE \"$role\""; then
        say "Role $role still owns objects elsewhere and was kept; inspect it by hand."
    fi
done

say "Verification"
failed=0
report() {   # report <label> <command...>
    local label=$1
    shift
    if "$@"; then echo "  ok    $label"; else echo "  FAIL  $label"; failed=1; fi
}
report "$RUST_UNIT is gone" bash -c "! systemctl cat '$RUST_UNIT' >/dev/null 2>&1"
report "$RUST_BINARY is gone" test ! -e "$RUST_BINARY"
report "PostgreSQL database $PG_DB is gone" bash -c "! runuser -u postgres -- psql -XAtq -d postgres -c \"SELECT 1 FROM pg_database WHERE datname = '$PG_DB'\" | grep -qx 1"
report "https://$DOMAIN/healthz" bash -c "[[ \$(curl -fsS --max-time 15 --resolve '$DOMAIN:443:127.0.0.1' 'https://$DOMAIN/healthz') == ok ]]"
(( failed == 0 )) || die "Verification failed; see above."

finish
cat <<EOF

Rollback (restores the Rust service and its PostgreSQL history):
  sudo -u postgres createuser ${pg_role:-status-dunamismax} && sudo -u postgres createdb -O ${pg_role:-status-dunamismax} $PG_DB
  gunzip -c ${dump:-$BACKUPS/postgresql-$PG_DB-final-<stamp>.sql.gz} | sudo -u postgres psql -d $PG_DB
  sudo cp -a $BACKUP_DIR$RUST_BINARY $RUST_BINARY
  sudo cp -a $BACKUP_DIR/etc/systemd/system/$RUST_UNIT /etc/systemd/system/ && sudo systemctl daemon-reload
  sudo cp -a $BACKUP_DIR$ETC/status.env $ETC/status.env
  (then set the role's password to match STATUS_DATABASE_URL in status.env, and follow the 40-cutover.sh rollback)
EOF
