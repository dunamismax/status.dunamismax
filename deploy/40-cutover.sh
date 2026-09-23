#!/bin/bash
# 40 — Cutover: move status.dunamismax.com out of the main Caddyfile into
# /etc/caddy/sites/status.dunamismax.com.caddy (PHP-FPM instead of the Rust
# proxy), validate as caddy, reload, verify over HTTPS, and only then stop the
# Rust web service and remove status-dunamismax from the docker group. Any
# failed step restores the previous Caddy configuration. Safe to re-run.
set -euo pipefail
# shellcheck source-path=SCRIPTDIR source=lib.sh
source "$(dirname "$0")/lib.sh"
require_root

main=/etc/caddy/Caddyfile
[[ -L $BASE/current && -f $BASE/current/public/index.php ]] || die "Run 30-deploy.sh first."
age=$(latest_rollup_age_minutes)
[[ $age -ge 0 && $age -lt 15 ]] || die "The latest collector snapshot is missing or ${age} minutes old; fix the collector before cutover."
[[ -S /run/php/status-dunamismax.sock ]] || die "The PHP-FPM socket is missing; run 10-provision.sh."

say "Caddy site block"
backup "$main"
backup "$SITE_CADDYFILE"
block=$(mktemp)
rewritten=$(mktemp)
trap 'rm -f "$block" "$rewritten"' EXIT
# Remove only this domain's top-level block: from "status.dunamismax.com {" to the next "}" at column 0.
awk -v start="$DOMAIN {" -v blockfile="$block" '
    state == 0 && $0 == start { state = 1; print > blockfile; next }
    state == 1 { print > blockfile; if ($0 == "}") { state = 2; ended = 1 }; next }
    ended && $0 == "" { ended = 0; next }
    { ended = 0; print }
    END { if (state == 1) exit 2 }
' "$main" > "$rewritten" || die "Could not find the end of the $DOMAIN block in $main."

if [[ -s $block ]]; then
    grep -qx $'\treverse_proxy 127.0.0.1:8095' "$block" || die "The inline $DOMAIN block is not the expected Rust proxy; inspect $main by hand."
    install -m 0644 -o root -g root "$rewritten" "$main"
    say "Removed the inline $DOMAIN block from $main"
elif ! grep -q 'php_fastcgi unix//run/php/status-dunamismax.sock' "$SITE_CADDYFILE" 2>/dev/null; then
    die "No inline $DOMAIN block and no PHP site file; inspect $main by hand."
fi
grep -qxF 'import /etc/caddy/sites/*.caddy' "$main" || { restore "$main"; die "$main does not import /etc/caddy/sites/*.caddy."; }
install -m 0644 -o root -g root "$BASE/current/deploy/Caddyfile" "$SITE_CADDYFILE"

restore_caddy() {
    restore "$main"
    restore "$SITE_CADDYFILE"
    caddy_validate >/dev/null 2>&1 && systemctl reload caddy || true
}
if ! caddy_validate; then
    restore_caddy
    die "Caddy rejected the new configuration; the previous one was restored."
fi
if ! systemctl reload caddy; then
    restore_caddy
    die "Caddy failed to reload; the previous configuration was restored."
fi

say "Verifying the public site is served by PHP"
sleep 1
failed=0
# Capture each body first: piping curl into grep -q under pipefail can fail on SIGPIPE.
expect_body() {   # expect_body <label> <path> <substring> [curl option]
    local body
    body=$(curl -fsS ${4:+"$4"} --max-time 15 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN$2" 2>/dev/null) || body=
    if [[ ${body,,} == *"${3,,}"* ]]; then printf '  ok    %s\n' "$1"; else printf '  FAIL  %s\n' "$1"; failed=1; fi
}
expect_body '/healthz is ok' /healthz 'ok'
expect_body '/readyz reports MySQL ready' /readyz '"dependencies":"mysql-ready,collector-snapshot-fresh","database":"ready"'
expect_body '/api/status.json has a rollup' /api/status.json '"overall_state":'
expect_body '/ renders the status page' / 'Self-hosted ecosystem status'
expect_body '/assets/status.css is served statically' /assets/status.css 'cache-control: public, max-age=300, must-revalidate' --head
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/missing" || true)
if [[ $code == 404 ]]; then echo '  ok    /missing is 404'; else echo "  FAIL  /missing returned $code"; failed=1; fi
if (( failed )); then
    restore_caddy
    die "The PHP site did not verify; Caddy was restored and the Rust service is still running."
fi

say "Stopping the Rust web service"
if systemctl cat "$RUST_UNIT" >/dev/null 2>&1; then
    systemctl disable --now "$RUST_UNIT"
fi

say "Removing $COLLECTOR_USER from the docker group"
if id -nG "$COLLECTOR_USER" | tr ' ' '\n' | grep -qx docker; then
    backup /etc/group
    backup /etc/gshadow
    gpasswd -d "$COLLECTOR_USER" docker
fi
id -nG "$COLLECTOR_USER" | tr ' ' '\n' | grep -qx docker && die "$COLLECTOR_USER is still in the docker group."

finish
cat <<EOF

status.dunamismax.com is served by PHP-FPM. The Rust binary, its unit, and the
PostgreSQL database remain until 50-decommission.sh.

Verify:
  curl -fsS https://$DOMAIN/healthz
  curl -fsS https://$DOMAIN/readyz
  curl -fsS https://$DOMAIN/api/status.json | head -c 300; echo
  id $COLLECTOR_USER        # no docker group
  systemctl is-active $RUST_UNIT   # inactive

Rollback:
  sudo cp -a $BACKUP_DIR/etc/caddy/Caddyfile /etc/caddy/Caddyfile
  sudo rm $SITE_CADDYFILE
  sudo runuser -u caddy -- env HOME=/var/lib/caddy $CADDY validate --config /etc/caddy/Caddyfile --adapter caddyfile && sudo systemctl reload caddy
  sudo systemctl enable --now $RUST_UNIT
  sudo usermod -aG docker $COLLECTOR_USER
EOF
