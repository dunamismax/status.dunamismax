#!/bin/bash
# Installed as /usr/local/sbin/status-dunamismax-backup and run daily by
# status-dunamismax-backup.timer. Archives contain credentials: never commit or publish them.
set -euo pipefail
umask 077

base=/srv/www/status.dunamismax.com
destination=/var/backups/status-dunamismax
install -d -o root -g sawyer -m 0750 "$destination"
work=$(mktemp -d "$destination/.building.XXXXXXXX")
trap 'rm -rf -- "$work"' EXIT
stamp=$(date -u +%Y%m%dT%H%M%SZ)

mysqldump --single-transaction --no-tablespaces --set-gtid-purged=OFF status_dunamismax | gzip > "$work/database.sql.gz"
gzip -t "$work/database.sql.gz"
cp /etc/status-dunamismax/web.env /etc/status-dunamismax/collector.env /etc/status-dunamismax/php-fpm.conf "$work/"
if [ -f /etc/caddy/sites/status.dunamismax.com.caddy ]; then
    cp /etc/caddy/sites/status.dunamismax.com.caddy "$work/"
fi
cp /etc/systemd/system/status-dunamismax-collector.{service,timer} /etc/systemd/system/status-dunamismax-backup.{service,timer} "$work/"
cp /usr/local/sbin/status-dunamismax-backup "$work/backup.sh"
readlink -f "$base/current" > "$work/release.txt"
tar -czf "$work/application.tar.gz" -C "$base/current" --exclude=./.env .

tar -czf "$destination/.status-$stamp.partial" -C "$work" .
mv "$destination/.status-$stamp.partial" "$destination/status-$stamp.tar.gz"
cd "$destination"
sha256sum "status-$stamp.tar.gz" > "status-$stamp.tar.gz.sha256"
chown root:sawyer "status-$stamp.tar.gz" "status-$stamp.tar.gz.sha256"
chmod 0640 "status-$stamp.tar.gz" "status-$stamp.tar.gz.sha256"
# Status history is replaceable evidence, so keep two weeks of archives.
find "$destination" -maxdepth 1 -type f -name 'status-*.tar.gz*' -mtime +14 -delete
printf 'Backup created: %s/status-%s.tar.gz\n' "$destination" "$stamp"
