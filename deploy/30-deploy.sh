#!/bin/bash
# 30 — Deploy: build a release from the checkout's committed HEAD, run the
# checks as the web user, activate it, install the PHP collector and backup
# units (replacing the Rust collector), collect one snapshot, smoke-test every
# route, and record the deployment. Also the routine release procedure.
# Before cutover, Caddy still serves the Rust site; the new release is private.
# Safe to re-run: an existing release directory is reused, not overwritten.
set -euo pipefail
# shellcheck source-path=SCRIPTDIR source=lib.sh
source "$(dirname "$0")/lib.sh"
require_root

[[ -f $ETC/web.env && -f $ETC/collector.env && -L $POOL_LINK ]] || die "Run 10-provision.sh first."
owner=$(stat -c %U "$REPO")
as_owner_git() { runuser -u "$owner" -- git -C "$REPO" "$@"; }
[[ -z $(as_owner_git status --porcelain) ]] || die "The checkout has uncommitted changes; deploy only committed work."
commit=$(as_owner_git rev-parse HEAD)
release=$BASE/releases/$commit

if [[ ! -d $release ]]; then
    say "Building release $commit"
    partial=$BASE/releases/.$commit.partial
    rm -rf "$partial"
    install -d -m 0755 -o root -g root "$partial"
    as_owner_git archive "$commit" | tar -x -C "$partial"
    chown -R root:root "$partial"
    # Readable by everyone, writable by no one but root; tracked executables keep their x bit.
    chmod -R u=rwX,go=rX "$partial"
    ln -s "$ETC/web.env" "$partial/.env"
    say "Checks, as $WEB_USER"
    (cd "$partial" && runuser -u "$WEB_USER" -- env HOME=/tmp php bin/check.php \
        && runuser -u "$WEB_USER" -- env HOME=/tmp php tests/run.php) || { rm -rf "$partial"; die "Release checks failed."; }
    mv -T "$partial" "$release"
else
    say "Release $commit already exists; reusing it"
fi

say "Collector and backup units"
units=(status-dunamismax-collector.service status-dunamismax-collector.timer status-dunamismax-backup.service status-dunamismax-backup.timer)
for unit in "${units[@]}"; do
    backup "/etc/systemd/system/$unit"
    install -m 0644 -o root -g root "$release/deploy/$unit" "/etc/systemd/system/$unit"
done
backup /usr/local/sbin/status-dunamismax-backup
install -m 0750 -o root -g root "$release/deploy/backup.sh" /usr/local/sbin/status-dunamismax-backup
systemctl daemon-reload

say "Activating the release"
previous=$(readlink -f "$BASE/current" 2>/dev/null || true)
changed=
if [[ $previous != "$release" ]]; then
    if [[ -n $previous ]]; then printf '%s\n' "$previous" > "/root/$SITE-previous-release"; fi
    ln -sfn "$release" "$BASE/current.next"
    mv -Tf "$BASE/current.next" "$BASE/current"
    changed=1
fi
fpm_reload

rollback_release() {
    if [[ -n $changed && -n $previous && -d $previous ]]; then
        ln -sfn "$previous" "$BASE/current.rollback"
        mv -Tf "$BASE/current.rollback" "$BASE/current"
        fpm_reload
        say "Switched back to $previous."
    fi
}

say "Collecting one snapshot"
if ! systemctl start status-dunamismax-collector.service; then
    journalctl -u status-dunamismax-collector.service -n 20 --no-pager || true
    rollback_release
    die "The collector failed. Earlier unit files are in $BACKUP_DIR."
fi
journalctl -u status-dunamismax-collector.service -n 1 --no-pager -o cat | sed 's/^/  /'
systemctl enable status-dunamismax-collector.timer status-dunamismax-backup.timer
systemctl restart status-dunamismax-collector.timer
systemctl start status-dunamismax-backup.timer

say "Smoke test of every route, as $WEB_USER"
if ! runuser -u "$WEB_USER" -- php "$release/bin/smoke.php" | sed 's/^/  /'; then
    rollback_release
    die "The smoke test failed."
fi

if [[ -n $changed ]]; then
    say "Recording the deployment"
    runuser -u "$COLLECTOR_USER" -- env STATUS_ENV_FILE="$ETC/collector.env" php "$release/bin/record-deployment.php" \
        --service-id status-dunamismax --repo-name status.dunamismax --commit-sha "$commit" \
        --summary "status.dunamismax deployed to production" | sed 's/^/  /'
fi

finish
if grep -q "reverse_proxy 127.0.0.1:8095" /etc/caddy/Caddyfile 2>/dev/null; then
    echo
    echo "Caddy still serves the Rust site. Next: sudo $REPO/deploy/40-cutover.sh"
fi
cat <<EOF

Verify:
  systemctl list-timers status-dunamismax-collector.timer status-dunamismax-backup.timer
  journalctl -u status-dunamismax-collector.service -n 5 --no-pager
  sudo -u $WEB_USER php $BASE/current/bin/smoke.php

Rollback:
  Code: point $BASE/current back at the release in /root/$SITE-previous-release, then:
    sudo systemctl reload php8.5-fpm
  First deploy only (restore the Rust collector units):
    sudo cp -a $BACKUP_DIR/etc/systemd/system/status-dunamismax-collector.* /etc/systemd/system/
    sudo systemctl daemon-reload && sudo systemctl restart status-dunamismax-collector.timer
EOF
