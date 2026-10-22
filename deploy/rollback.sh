#!/bin/bash
set -Eeuo pipefail
umask 077
[[ $EUID == 0 && $# == 1 ]] || exit 64
if [[ ! -e /proc/$$/fd/9 ]]; then exec /usr/local/sbin/with-deploy-lock "$0" "$@"; fi
flock -n 9
backup=$(realpath "$1")
[[ $backup == /root/status-astro-rollback-* && -f $backup/previous && -f $backup/site.caddy ]] || exit 1
release=$(cd "$(dirname "$0")/.." && pwd -P)
base=/srv/www/status.dunamismax.com
previous=$(cat "$backup/previous")
[[ $previous == "$base/releases/"* && -d $previous ]] || exit 1
if [[ -f /var/lib/astro-migration/legacy-retired && -e $backup/legacy ]]; then
 echo 'PHP/MySQL are retired; restore legacy resources in isolation only' >&2
 exit 1
fi
systemctl stop astro-status-dunamismax-collector.timer 2>/dev/null || true
while [[ $(systemctl show astro-status-dunamismax-collector.service -p ActiveState --value) =~ ^(active|activating|deactivating|reloading)$ ]]; do sleep 1; done
rm -f /run/systemd/system/astro-status-dunamismax-collector.service.d/migration.conf
systemctl stop astro-status-candidate.service 2>/dev/null || true
if [[ -e $backup/legacy && -e $backup/imported ]]; then
 runuser -u postgres -- pg_dump -Fc --create status_dunamismax > "$backup/rollback-postgresql.dump"
 "$release/deploy/history-transfer.py" reverse
 "$release/deploy/history-transfer.py" export "$backup/reverse-history"
 set -a; source /etc/astro-apps/status_dunamismax/migration.env; set +a
 /opt/astro-runtime/bin/node "$release/build/scripts/history.js" verify "$backup/reverse-history" > "$backup/reverse-reconciliation.txt"
 unset PGPASSWORD DATABASE_URL PGUSER PGDATABASE PGHOST PGPORT
fi
cp -a "$backup/site.caddy" /etc/caddy/sites/status.dunamismax.com.caddy
runuser -u caddy -- /usr/local/lib/caddy/caddy validate --config /etc/caddy/Caddyfile > "$backup/rollback-caddy.log" 2>&1
ln -s "$previous" "$base/current.rollback"
mv -Tf "$base/current.rollback" "$base/current"
for file in "$backup"/*.service "$backup"/*.timer; do [[ -f $file ]] && cp -a "$file" /etc/systemd/system/; done
cp -a "$backup/backup.sh" /usr/local/sbin/status-dunamismax-backup
systemctl daemon-reload
if [[ -e $backup/legacy ]]; then
 systemctl disable --now astro-status-dunamismax.service astro-status-dunamismax-collector.timer 2>/dev/null || true
 if grep -qx enabled "$backup/legacy-enabled"; then systemctl enable status-dunamismax-collector.timer; fi
 if grep -qx active "$backup/legacy-active"; then systemctl start status-dunamismax-collector.timer; fi
else
 systemctl restart astro-status-dunamismax.service
 systemctl enable --now astro-status-dunamismax-collector.timer
fi
systemctl reload caddy
"$release/deploy/smoke.sh" https://status.dunamismax.com
printf 'Restored previous release; PostgreSQL and both recovery archives retained.\n'
