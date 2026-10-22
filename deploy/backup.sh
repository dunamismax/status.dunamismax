#!/bin/bash
# Root-only archives contain credentials. Keep the retained legacy MySQL recovery path.
set -Eeuo pipefail
umask 077
[[ $EUID == 0 ]] || exit 1
if [[ ! -e /proc/$$/fd/9 ]]; then exec /usr/local/sbin/with-deploy-lock "$0" "$@"; fi
flock -n 9
base=/srv/www/status.dunamismax.com
destination=/var/backups/status-dunamismax
install -d -o root -g sawyer -m 0750 "$destination"
work=$(mktemp -d "$destination/.building.XXXXXXXX")
trap 'rm -rf -- "$work"' EXIT
stamp=$(date -u +%Y%m%dT%H%M%SZ)
mkdir "$work/postgresql"
runuser -u postgres -- pg_dumpall --roles-only > "$work/postgresql/roles.sql"
runuser -u postgres -- pg_dump -Fc --create status_dunamismax > "$work/postgresql/status_dunamismax.dump"
digest=$(sha256sum "$work/postgresql/status_dunamismax.dump"); digest=${digest%% *}
printf 'status_dunamismax status_dunamismax_owner %s\n' "$digest" > "$work/postgresql/databases.tsv"
/home/sawyer/github/ubuntu-vm-backup/bin/postgres-verify "$work/postgresql"
mysqldump --single-transaction --no-tablespaces --set-gtid-purged=OFF status_dunamismax | gzip > "$work/legacy-mysql.sql.gz"
gzip -t "$work/legacy-mysql.sql.gz"
cp -a /etc/status-dunamismax "$work/settings"
cp -a /etc/astro-apps/status_dunamismax "$work/pg-credentials"
cp /etc/caddy/sites/status.dunamismax.com.caddy "$work/"
cp /etc/systemd/system/astro-status-dunamismax* /etc/systemd/system/status-dunamismax-* "$work/"
cp /usr/local/sbin/status-dunamismax-backup "$work/backup.sh"
readlink -f "$base/current" > "$work/release.txt"
tar -czf "$work/application.tar.gz" -C "$base/current" --exclude=./.env .
tar -czf "$destination/.status-$stamp.partial" -C "$work" .
mv "$destination/.status-$stamp.partial" "$destination/status-$stamp.tar.gz"
cd "$destination"
sha256sum "status-$stamp.tar.gz" > "status-$stamp.tar.gz.sha256"
chmod 0600 "status-$stamp.tar.gz" "status-$stamp.tar.gz.sha256"
find "$destination" -maxdepth 1 -type f -name 'status-*.tar.gz*' -mtime +14 -delete
printf 'Verified PostgreSQL + legacy recovery backup created.\n'
