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
[[ $candidate == /home/sawyer/astro-work/status-release-* && -f $candidate/RELEASE ]] || exit 1
commit=$(cat "$candidate/RELEASE")
[[ $commit =~ ^[0-9a-f]{40}$ && $candidate == *"$commit" && -s $candidate/dist/server/entry.mjs && -s $candidate/build/src/collector/cli.js ]] || exit 1
release="$base/releases/$commit"
if [[ -d $release ]]; then
 ( cd "$release" && sha256sum --quiet --check MANIFEST.sha256 )
 if [[ $previous == "$release" ]]; then "$release/deploy/smoke.sh" https://status.dunamismax.com; exit 0; fi
fi
backup="/root/status-astro-rollback-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -m 0700 "$backup"
printf '%s\n' "$previous" > "$backup/previous"
cp -a /etc/caddy/sites/status.dunamismax.com.caddy "$backup/site.caddy"
cp -a /etc/systemd/system/status-dunamismax-* "$backup/"
cp -a /etc/systemd/system/astro-status-dunamismax* "$backup/" 2>/dev/null || true
cp -a /usr/local/sbin/status-dunamismax-backup "$backup/backup.sh"
cp -a /etc/status-dunamismax "$backup/settings"
systemctl is-enabled status-dunamismax-collector.timer > "$backup/legacy-enabled" || true
systemctl is-active status-dunamismax-collector.timer > "$backup/legacy-active" || true
if [[ -f $previous/public/index.php ]]; then touch "$backup/legacy"; fi
( cd "$candidate" && sha256sum --quiet --check MANIFEST.sha256 )
if [[ ! -d $release ]]; then
 install -d -m 0755 "$release"
 cp -a "$candidate/." "$release/"
 chown -R root:root "$release"
 chmod -R a-w "$release"
fi
failed() { code=$?; trap - ERR; echo 'Cutover failed; restoring previous release' >&2; "$release/deploy/rollback.sh" "$backup" || echo 'Rollback failed; inspect root-only diagnostics' >&2; exit "$code"; }
trap failed ERR
# Stop only owning writers; retain shared services and legacy configuration.
systemctl stop status-dunamismax-collector.timer
while [[ $(systemctl show status-dunamismax-collector.service -p ActiveState --value) =~ ^(active|activating|deactivating|reloading)$ ]]; do sleep 1; done
systemctl stop astro-status-dunamismax-collector.timer 2>/dev/null || true
while [[ $(systemctl show astro-status-dunamismax-collector.service -p ActiveState --value) =~ ^(active|activating|deactivating|reloading)$ ]]; do sleep 1; done
# Preserve both databases and credentials before schema or data changes.
runuser -u postgres -- pg_dump -Fc --create status_dunamismax > "$backup/pre-postgresql.dump"
mysqldump --single-transaction --no-tablespaces --set-gtid-purged=OFF status_dunamismax | gzip > "$backup/pre-mysql.sql.gz"
gzip -t "$backup/pre-mysql.sql.gz"
set -a; source /etc/astro-apps/status_dunamismax/migration.env; set +a
psql -X -1 -v ON_ERROR_STOP=1 -f "$release/database/schema.sql" > "$backup/schema.log" 2>&1
if [[ -e $backup/legacy ]]; then
 "$release/deploy/history-transfer.py" export "$backup/history"
 /opt/astro-runtime/bin/node "$release/build/scripts/history.js" import "$backup/history" --replace > "$backup/reconciliation.json"
 touch "$backup/imported"
fi
unset PGPASSWORD DATABASE_URL PGUSER PGDATABASE PGHOST PGPORT
# Copy only role-appropriate settings; secrets never enter the release.
python3 - <<'CONFIG'
import os,shlex
from pathlib import Path
base=Path('/etc/status-dunamismax')
for role,keys in [('web',['STATUS_OPERATOR_TOKEN','STATUS_STALE_AFTER_MINUTES','STATUS_REPO_ROOT']),('collector',['STATUS_ALERT_WEBHOOK_URL','STATUS_RETENTION_DAYS','STATUS_ALERT_REPEAT_AFTER_MINUTES','STATUS_ALERT_MAX_NOTIFICATIONS_PER_RUN','STATUS_REPO_ROOT'])]:
 target=base/('astro-'+role+'.env')
 if target.exists():continue
 values={}
 for line in (base/(role+'.env')).read_text().splitlines():
  if '=' not in line or line.lstrip().startswith('#'):continue
  k,v=line.split('=',1)
  if k in keys:
   parts=shlex.split(v,comments=True);values[k]=parts[0] if parts else ''
 target.write_text(''.join(k+'='+shlex.quote(v)+'\n' for k,v in values.items()))
 os.chmod(target,0o600)
CONFIG
# Reuse the already separate nologin accounts and existing read-only collector ACLs.
[[ $(id -nG status-dunamismax) != *docker* ]]
for unit in astro-status-dunamismax.service astro-status-dunamismax-collector.service astro-status-dunamismax-collector.timer status-dunamismax-backup.service; do install -m 0644 "$release/deploy/$unit" "/etc/systemd/system/$unit"; done
install -m 0755 "$release/deploy/backup.sh" /usr/local/sbin/status-dunamismax-backup
systemd-analyze verify /etc/systemd/system/astro-status-dunamismax{,-collector}.service /etc/systemd/system/astro-status-dunamismax-collector.timer
systemctl daemon-reload
# Candidate is exercised behind a distinct temporary loopback port before activation.
sed -e "s|/srv/www/status.dunamismax.com/current|$release|g" -e 's/PORT=4313/PORT=14313/' "$release/deploy/astro-status-dunamismax.service" > /run/systemd/system/astro-status-candidate.service
systemctl daemon-reload
systemctl start astro-status-candidate.service
"$release/deploy/smoke.sh" http://127.0.0.1:14313
if [[ -e $backup/legacy ]]; then
 for path in status incidents; do
  curl -fsS "https://status.dunamismax.com/api/$path.json" > "$backup/legacy-$path.json"
  curl -fsS "http://127.0.0.1:14313/api/$path.json" > "$backup/candidate-$path.json"
  python3 - "$backup" "$path" <<'COMPARE'
import json,sys
from pathlib import Path
p=Path(sys.argv[1]);kind=sys.argv[2]
assert json.loads((p/('legacy-'+kind+'.json')).read_text()) == json.loads((p/('candidate-'+kind+'.json')).read_text()), 'API compatibility mismatch'
COMPARE
 done
 for path in assets/status.css icon.svg robots.txt; do cmp "$previous/public/$path" "$release/public/$path"; done
fi
systemctl stop astro-status-candidate.service
rm /run/systemd/system/astro-status-candidate.service
systemctl daemon-reload
ln -s "$release" "$base/current.next"
mv -Tf "$base/current.next" "$base/current"
systemctl enable --now astro-status-dunamismax.service
systemctl restart astro-status-dunamismax.service
install -m 0644 "$release/deploy/Caddyfile" /etc/caddy/sites/status.dunamismax.com.caddy
runuser -u caddy -- /usr/local/lib/caddy/caddy validate --config /etc/caddy/Caddyfile > "$backup/caddy-validation.log" 2>&1
systemctl reload caddy
# Any timer-triggered verification run is also notification-free.
install -d /run/systemd/system/astro-status-dunamismax-collector.service.d
printf '[Service]\nExecStart=\nExecStart=/opt/astro-runtime/bin/node %s/build/src/collector/cli.js collect --no-notify\n' "$release" > /run/systemd/system/astro-status-dunamismax-collector.service.d/migration.conf
systemctl daemon-reload
systemctl enable --now astro-status-dunamismax-collector.timer
systemctl start astro-status-dunamismax-collector.service
if [[ -e $backup/imported ]]; then touch "$backup/pg-writes"; fi
"$release/deploy/smoke.sh" https://status.dunamismax.com
"$release/deploy/run-command.sh" record-deployment --service-id status-dunamismax --repo-name status.dunamismax --commit-sha "$commit"
systemctl disable status-dunamismax-collector.timer
rm /run/systemd/system/astro-status-dunamismax-collector.service.d/migration.conf
systemctl daemon-reload
trap - ERR
printf '%s\n' "$backup" > /root/status-astro-latest-rollback
printf 'Deployed %s; rollback: %s/deploy/rollback.sh %s\n' "$commit" "$release" "$backup"
