#!/bin/bash
# 60 — Add access logging to the already cut-over status site without
# redeploying the PHP application or changing any other Caddy site.
set -euo pipefail
# shellcheck source-path=SCRIPTDIR source=lib.sh
source "$(dirname "$0")/lib.sh"
require_root

expected_sha256=51226c1d278609cca60f8891914817ab6a125fd1ee3532dcfce4a38fb5cd0d31
log_file=/var/log/caddy/status-dunamismax-access.log
source_file=$REPO/deploy/Caddyfile

[[ -f $SITE_CADDYFILE && -f $source_file ]] || die "The Caddy site or source file is missing."
[[ -d /var/log/caddy && $(stat -c %U /var/log/caddy) == caddy ]] || die "Caddy cannot own its access log directory."
[[ $(sha256sum "$SITE_CADDYFILE" | cut -d ' ' -f 1) == "$expected_sha256" ]] || {
    cmp -s "$source_file" "$SITE_CADDYFILE" || die "The installed site has changed since this script was prepared; inspect it before replacing it."
}

say "Checking PHP-FPM and backing up the current Caddy site"
php-fpm8.5 -t || die "PHP-FPM configuration failed its check."
backup "$SITE_CADDYFILE"
changed=
if ! cmp -s "$source_file" "$SITE_CADDYFILE"; then
    install -m 0644 -o root -g root "$source_file" "$SITE_CADDYFILE"
    changed=1
fi

rollback() {
    if [[ -n $changed ]]; then
        restore "$SITE_CADDYFILE"
        if ! caddy_validate || ! systemctl reload caddy; then
            die "The previous site file was restored, but Caddy could not reload it; inspect Caddy now."
        fi
    fi
}

say "Validating as caddy and reloading Caddy"
if ! caddy_validate || ! systemctl reload caddy; then
    rollback
    die "Caddy could not load the logging change; the previous site file was restored."
fi

say "Checking the site and its new access log"
probe="access_log_probe=$STAMP"
if ! curl -fsS --max-time 15 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/healthz?$probe" >/dev/null; then
    rollback
    die "The health check failed; the previous site file was restored."
fi
found=
for attempt in 1 2 3 4 5; do
    if [[ -f $log_file ]] && grep -qF "$probe" "$log_file"; then
        found=1
        break
    fi
    [[ $attempt == 5 ]] || sleep 1
done
if [[ -z $found ]]; then
    rollback
    die "No access log entry appeared for the health check; the previous site file was restored."
fi

finish
cat <<EOF

Verified: https://$DOMAIN/healthz and a matching entry in $log_file

Rollback:
  sudo cp -a $BACKUP_DIR$SITE_CADDYFILE $SITE_CADDYFILE
  sudo runuser -u caddy -- env HOME=/var/lib/caddy $CADDY validate --config /etc/caddy/Caddyfile --adapter caddyfile
  sudo systemctl reload caddy
EOF
