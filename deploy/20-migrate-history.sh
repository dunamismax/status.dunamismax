#!/bin/bash
# 20 — Migrate history: pause the Rust collector so PostgreSQL stops changing,
# take a safety dump, export every table as JSON lines, and import them into
# MySQL with their original ids. The Rust web service keeps serving meanwhile.
# Safe to re-run: rows already in MySQL are left alone.
set -euo pipefail
# shellcheck source-path=SCRIPTDIR source=lib.sh
source "$(dirname "$0")/lib.sh"
require_root

[[ -f $ETC/collector.env ]] || die "Run 10-provision.sh first."
mysql_admin -e "USE \`$DB_NAME\`" || die "MySQL database $DB_NAME is missing; run 10-provision.sh first."
if ! pg_exists; then
    say "PostgreSQL database $PG_DB does not exist (already decommissioned?). Nothing to migrate."
    exit 0
fi

tables=(targets check_runs rollups incidents maintenance_windows deployment_events alert_notifications)

say "Pausing the Rust collector"
if systemctl cat status-dunamismax-collector.service 2>/dev/null | grep -qF "$RUST_BINARY"; then
    systemctl stop status-dunamismax-collector.timer
    while systemctl is-active --quiet status-dunamismax-collector.service; do sleep 1; done
    paused_rust_collector=1
else
    say "The collector unit is no longer the Rust binary; PostgreSQL is already frozen."
fi

say "Safety dump of $PG_DB"
dump=$BACKUPS/postgresql-$PG_DB-premigration-$STAMP.dump
install -d -m 0750 -o root -g sawyer "$BACKUPS"
runuser -u postgres -- pg_dump --format=custom "$PG_DB" > "$dump.partial"
runuser -u postgres -- pg_restore --list < "$dump.partial" > /dev/null
mv "$dump.partial" "$dump"
chown root:sawyer "$dump"
chmod 0640 "$dump"
printf '  %s (%s)\n' "$dump" "$(du -h "$dump" | cut -f1)"

say "Exporting PostgreSQL rows as JSON lines"
export_dir=/var/lib/status-dunamismax-migration
rm -rf "$export_dir"
install -d -m 0750 -o root -g "$COLLECTOR_USER" "$export_dir"
cd /
declare -A pg_count
for table in "${tables[@]}"; do
    # FETCH_COUNT streams large tables instead of buffering them in psql.
    runuser -u postgres -- env PGTZ=UTC psql -X -q -A -t -v ON_ERROR_STOP=1 -d "$PG_DB" > "$export_dir/$table.jsonl" <<SQL
\set FETCH_COUNT 2000
SELECT row_to_json(t) FROM $table t ORDER BY t.id;
SQL
    pg_count[$table]=$(runuser -u postgres -- psql -XAtq -d "$PG_DB" -c "SELECT count(*) FROM $table")
    lines=$(grep -c . "$export_dir/$table.jsonl" || true)
    [[ $lines == "${pg_count[$table]}" ]] || die "$table: exported $lines rows but PostgreSQL has ${pg_count[$table]}."
    printf '  %-20s %s rows\n' "$table" "${pg_count[$table]}"
done
chown root:"$COLLECTOR_USER" "$export_dir"/*.jsonl
chmod 0640 "$export_dir"/*.jsonl

say "Importing into MySQL as $COLLECTOR_USER"
runuser -u "$COLLECTOR_USER" -- env STATUS_ENV_FILE="$ETC/collector.env" /usr/bin/php "$REPO/bin/import-history.php" "$export_dir" | sed 's/^/  /'

say "Verification"
failed=0
for table in "${tables[@]}"; do
    mysql_count=$(mysql_admin "$DB_NAME" -e "SELECT COUNT(*) FROM \`$table\`")
    if (( mysql_count >= pg_count[$table] )); then state=ok; else state=FAIL; failed=1; fi
    printf '  %-4s %-20s postgresql=%s mysql=%s\n' "$state" "$table" "${pg_count[$table]}" "$mysql_count"
done
pg_latest=$(runuser -u postgres -- env PGTZ=UTC psql -XAtq -d "$PG_DB" -c "SELECT to_char(max(checked_at), 'YYYY-MM-DD HH24:MI:SS') FROM rollups")
my_latest=$(mysql_admin "$DB_NAME" -e "SELECT DATE_FORMAT(MAX(checked_at), '%Y-%m-%d %H:%i:%s') FROM rollups")
printf '  latest rollup: postgresql=%s mysql=%s\n' "${pg_latest:-none}" "${my_latest:-none}"
(( failed == 0 )) || die "Row counts do not match; the export is kept in $export_dir for inspection."
rm -rf "$export_dir"

finish
cat <<EOF

The safety dump is $dump.
${paused_rust_collector:+The Rust collector timer is stopped; the Rust web service still serves live probes.}

Next: sudo $REPO/deploy/30-deploy.sh

Rollback (before 30-deploy): empty the MySQL history and resume the Rust collector:
  sudo mysql $DB_NAME -e 'DELETE FROM check_runs; DELETE FROM rollups; DELETE FROM alert_notifications; DELETE FROM deployment_events; DELETE FROM incidents; DELETE FROM maintenance_windows; DELETE FROM targets;'
  sudo systemctl start status-dunamismax-collector.timer
EOF
