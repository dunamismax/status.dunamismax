#!/bin/bash
set -Eeuo pipefail
umask 077
[[ $EUID == 0 && $# == 2 ]] || { echo 'Usage (root): deploy.sh CANDIDATE EXPECTED_CURRENT' >&2; exit 64; }
if [[ ! -e /proc/$$/fd/9 ]]; then exec /usr/local/sbin/with-deploy-lock "$0" "$@"; fi
flock -n 9
candidate=$(realpath "$1")
base=/srv/www/status.dunamismax.com
previous=$(readlink -f "$base/current")
[[ $previous == "$2" ]] || { echo 'Current release changed; recheck before deploying' >&2; exit 1; }
[[ $candidate == /home/sawyer/web-work/status-release-* && -f $candidate/RELEASE ]] || exit 1
commit=$(cat "$candidate/RELEASE")
[[ $commit =~ ^[0-9a-f]{40}$ && $candidate == *"$commit" && -s $candidate/dist/index.js && -s $candidate/build/src/collector/cli.js ]] || exit 1
release="$base/releases/$commit"
if [[ -d $release ]]; then
 ( cd "$release" && sha256sum --quiet --check MANIFEST.sha256 )
 if [[ $previous == "$release" ]]; then "$release/deploy/smoke.sh" https://status.dunamismax.com; exit 0; fi
fi
# Root-only records of this deployment: what it replaced, a database dump taken
# before any change, the every-row digests and the migration and Caddy logs.
record="/root/status-deploy-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -m 0700 "$record"
printf '%s\n' "$previous" > "$record/previous"
( cd "$candidate" && sha256sum --quiet --check MANIFEST.sha256 )
if [[ ! -d $release ]]; then
 install -d -m 0755 "$release"
 cp -a "$candidate/." "$release/"
 chown -R root:root "$release"
 chmod -R a-w "$release"
fi
# There is no rollback: a failed deployment stops where it is and is repaired by
# hand. Only this script's temporary units are removed.
failed() {
 code=$?; trap - ERR
 systemctl stop status-candidate.service 2>/dev/null || true
 rm -f /run/systemd/system/status-candidate.service /run/systemd/system/status-dunamismax-collector.service.d/migration.conf
 systemctl daemon-reload || true
 echo "Deployment of $commit failed; nothing was rolled back. Live release: $(readlink -f "$base/current") (before: $previous). The collector timer may be stopped. Records and the pre-deployment database dump: $record" >&2
 exit "$code"
}
trap failed ERR
# Ordinary SvelteKit deployment: PostgreSQL is authoritative; no legacy writer/import.
systemctl stop status-dunamismax-collector.timer 2>/dev/null || true
while [[ $(systemctl show status-dunamismax-collector.service -p ActiveState --value) =~ ^(active|activating|deactivating|reloading)$ ]]; do sleep 1; done
runuser -u postgres -- pg_dump -Fc --create status_dunamismax > "$record/pre-postgresql.dump"
set -a; source /etc/web-apps/status_dunamismax/migration.env; set +a
# Reviewed Drizzle migrations through the owner-only runner (never schema push).
# An existing schema without a journal is adopted only on an exact catalog match;
# every-row digests prove adoption/no-op runs leave history untouched.
node=/opt/node-runtime/bin/node
"$node" "$release/build/scripts/history.js" digest > "$record/pre-digest.json"
# The NOINHERIT migration login has no USAGE on app; probe the catalog instead.
# A failed probe must abort (ERR trap), never fall through to adoption.
journal=$(psql -X -At -v ON_ERROR_STOP=1 -c "SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relname='drizzle_migrations')")
[[ $journal == t || $journal == f ]]
adopt=()
[[ $journal == t ]] || adopt=(--adopt-baseline)
"$node" "$release/build/src/db/migrate.js" "${adopt[@]}" > "$record/migration.log" 2>&1
"$node" "$release/build/scripts/history.js" digest > "$record/post-digest.json"
if grep -q 'applied=none' "$record/migration.log"; then cmp -s "$record/pre-digest.json" "$record/post-digest.json"; fi
unset PGPASSWORD DATABASE_URL PGUSER PGDATABASE PGHOST PGPORT
# Each role keeps its own settings file on the host; secrets never enter the release.
for role in web collector; do
 [[ -f /etc/status-dunamismax/$role.env ]] || { echo 'Restore the separate web/collector role settings before deployment' >&2; false; }
done
# Reuse the already separate nologin accounts and existing read-only collector ACLs.
[[ $(id -nG status-dunamismax) != *docker* ]]
for unit in status-dunamismax.service status-dunamismax-collector.service status-dunamismax-collector.timer status-dunamismax-backup.service; do install -m 0644 "$release/deploy/$unit" "/etc/systemd/system/$unit"; done
install -m 0755 "$release/deploy/backup.sh" /usr/local/sbin/status-dunamismax-backup
systemd-analyze verify /etc/systemd/system/status-dunamismax{,-collector}.service /etc/systemd/system/status-dunamismax-collector.timer
systemctl daemon-reload
# Candidate is exercised behind a distinct temporary loopback port before activation.
sed -e "s|/srv/www/status.dunamismax.com/current|$release|g" -e 's/PORT=4313/PORT=14313/' "$release/deploy/status-dunamismax.service" > /run/systemd/system/status-candidate.service
systemctl daemon-reload
systemctl start status-candidate.service
"$release/deploy/smoke.sh" http://127.0.0.1:14313
systemctl stop status-candidate.service
rm /run/systemd/system/status-candidate.service
systemctl daemon-reload
ln -s "$release" "$base/current.next"
mv -Tf "$base/current.next" "$base/current"
systemctl enable --now status-dunamismax.service
systemctl restart status-dunamismax.service
install -m 0644 "$release/deploy/Caddyfile" /etc/caddy/sites/status.dunamismax.com.caddy
runuser -u caddy -- /usr/local/lib/caddy/caddy validate --config /etc/caddy/Caddyfile > "$record/caddy-validation.log" 2>&1
systemctl reload caddy
# Any timer-triggered verification run is also notification-free.
install -d /run/systemd/system/status-dunamismax-collector.service.d
printf '[Service]\nExecStart=\nExecStart=/opt/node-runtime/bin/node %s/build/src/collector/cli.js collect --no-notify\n' "$release" > /run/systemd/system/status-dunamismax-collector.service.d/migration.conf
systemctl daemon-reload
systemctl enable --now status-dunamismax-collector.timer
systemctl start status-dunamismax-collector.service
"$release/deploy/smoke.sh" https://status.dunamismax.com
"$release/deploy/run-command.sh" record-deployment --service-id status-dunamismax --repo-name status.dunamismax --commit-sha "$commit"
rm /run/systemd/system/status-dunamismax-collector.service.d/migration.conf
systemctl daemon-reload
trap - ERR
printf '%s\n' "$record" > /root/status-latest-deploy
printf 'Deployed %s; records: %s\n' "$commit" "$record"
