# Shared settings and helpers for the numbered sudo scripts. Sourced, never run.
# shellcheck shell=bash disable=SC2034

SITE=status-dunamismax
DOMAIN=status.dunamismax.com
BASE=/srv/www/$DOMAIN
ETC=/etc/status-dunamismax
WEB_USER=status-dunamismax-web
COLLECTOR_USER=status-dunamismax
DB_NAME=status_dunamismax
DB_WEB_USER=status_web
DB_COLLECTOR_USER=status_collector
PG_DB=status_dunamismax
BACKUPS=/var/backups/status-dunamismax
CADDY=/usr/local/lib/caddy/caddy
POOL_LINK=/etc/php/8.5/fpm/pool.d/status-dunamismax.conf
SITE_CADDYFILE=/etc/caddy/sites/$DOMAIN.caddy
RUST_BINARY=/opt/status-dunamismax/status-web
RUST_UNIT=status-dunamismax.service
REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_DIR=/root/$SITE-backup-$STAMP

# New files are private unless a step sets a mode explicitly.
umask 077

say() { printf '==> %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

require_root() {
    [[ $EUID -eq 0 ]] || die "Run as root: sudo $0"
}

# Copy a file, keeping its absolute path, into this run's backup directory
# before it is changed. Records files that did not exist, so restore can remove them.
backup() {
    local path=$1
    install -d -m 0700 "$BACKUP_DIR"
    if [[ -e $path || -L $path ]]; then
        cp -a --parents "$path" "$BACKUP_DIR/"
    else
        printf '%s\n' "$path" >> "$BACKUP_DIR/.absent"
    fi
}

# Put a file back exactly as backup() found it.
restore() {
    local path=$1
    if [[ -e $BACKUP_DIR$path || -L $BACKUP_DIR$path ]]; then
        cp -a "$BACKUP_DIR$path" "$path"
    elif grep -qxF "$path" "$BACKUP_DIR/.absent" 2>/dev/null; then
        rm -f "$path"
    fi
}

# Validate as the caddy user so validation can open (and never re-own) Caddy's log files.
caddy_validate() {
    runuser -u caddy -- env HOME=/var/lib/caddy "$CADDY" validate --config /etc/caddy/Caddyfile --adapter caddyfile
}

# Other sites share php8.5-fpm: test first, then reload, never restart.
fpm_reload() {
    php-fpm8.5 -t && systemctl reload php8.5-fpm
}

# The last KEY=value in an env file, without surrounding quotes. Never printed by callers.
env_value() {
    sed -n "s/^$2=//p" "$1" 2>/dev/null | tail -n 1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

public_get() {
    curl -fsS --max-time 15 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN$1"
}

pg_exists() {
    [[ $(runuser -u postgres -- psql -XAtq -d postgres -c "SELECT 1 FROM pg_database WHERE datname = '$PG_DB'" 2>/dev/null) == 1 ]]
}

# MySQL as the local administrator (root over auth_socket).
mysql_admin() {
    mysql --batch --skip-column-names "$@"
}

latest_rollup_age_minutes() {
    mysql_admin "$DB_NAME" -e "SELECT COALESCE(TIMESTAMPDIFF(MINUTE, MAX(checked_at), UTC_TIMESTAMP(6)), -1) FROM rollups"
}

finish() {
    say "Done. Files changed by this run were backed up to $BACKUP_DIR (if any)."
}
