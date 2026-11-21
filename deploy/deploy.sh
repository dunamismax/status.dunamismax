#!/bin/bash
# Release steps 2-8, as root, inside ONE with-deploy-lock process:
#   with-deploy-lock bash /home/sawyer/web-work/status.dunamismax.com-COMMIT/src/deploy/deploy.sh COMMIT
# Fix forward only. A failure before "switch" leaves the previous release serving; a
# failure in "switch" or "verify" means the new release is live and unhealthy. Never
# point current at an older release; read the journal, fix it in a new commit, deploy that.
set -Eeuo pipefail
umask 077
# shellcheck source=deploy/lib.sh
source "$(dirname "$0")/lib.sh"
require_lock
cd /
commit=${1:-}
[[ $commit =~ ^[0-9a-f]{40}$ ]] || die 'usage: deploy.sh COMMIT (the full 40-character SHA)'
built=$work_root/$site-$commit/release
release=$base/releases/$commit
candidate=/run/systemd/system/$unit-candidate.service
quiet=/run/systemd/system/$collector.service.d/deploy-no-notify.conf
as_web=(systemd-run --wait --collect --pipe --quiet -p User="$service_user" -p Group="$service_user"
 -p EnvironmentFile="$settings/migration.env" -p WorkingDirectory="$release"
 -p NoNewPrivileges=true -p ProtectSystem=strict -p ProtectHome=true -p PrivateTmp=true)
as_sawyer=(runuser -u sawyer --)
step=start
trap 'echo "deploy: failed in step \"$step\". Live: $(readlink -f "$base/current"). If the collector timer was paused it stays paused until a deploy succeeds." >&2' ERR
cleanup() {
 systemctl stop "$unit-candidate.service" 2>/dev/null || true
 local reload=0
 [[ -e $candidate ]] && { rm -f "$candidate"; reload=1; }
 [[ -e $quiet ]] && { rm -f "$quiet"; reload=1; }
 if ((reload)); then systemctl daemon-reload; fi
}
trap cleanup EXIT
[[ -f $built/REVISION && $(cat "$built/REVISION") == "$commit" ]] || die "no build for $commit; run deploy/build.sh first"
for file in web app collector collector-settings migration; do
 [[ -f $settings/$file.env ]] || die "missing $settings/$file.env"
done
id "$service_user" >/dev/null

step=stage
if [[ -e $release ]]; then
 diff -r --no-dereference "$built" "$release" >/dev/null || die "$release exists and differs from the build"
else
 rm -rf "$release.staging"
 cp -a "$built" "$release.staging"
 chown -R root:root "$release.staging"
 chmod -R u=rwX,go=rX "$release.staging"
 mv -T "$release.staging" "$release"
fi
echo "Staged $release"

step=migrate
# The collector writes history; pause it so the digests bracket a quiet database.
systemctl stop "$collector.timer"
while [[ $(systemctl show "$collector.service" -p ActiveState --value) =~ ^(active|activating|deactivating|reloading)$ ]]; do sleep 1; done
install -d -m 0700 "$dumps"
runuser -u postgres -- pg_dump -Fc --create "$database" > "$dumps/pre-migrate-$commit.dump"
before=$("${as_web[@]}" --unit="$unit-digest" "$node" "$release/build/scripts/history.js" digest)
adopt=()
[[ $(runuser -u postgres -- psql -d "$database" -XAtc "SELECT to_regclass('app.drizzle_migrations') IS NOT NULL") == t ]] || adopt=(--adopt-baseline)
migration=$("${as_web[@]}" --unit="$unit-migrate" "$node" "$release/build/src/db/migrate.js" "${adopt[@]}")
echo "$migration"
after=$("${as_web[@]}" --unit="$unit-digest" "$node" "$release/build/scripts/history.js" digest)
# A no-op or adoption run must leave every history row exactly as it was.
if [[ $migration == *'applied=none'* && $before != "$after" ]]; then die 'history digests changed during a no-op migration'; fi
applied=$(runuser -u postgres -- psql -d "$database" -XAtc 'SELECT count(*) FROM app.drizzle_migrations')
expected=$("$node" -e 'console.log(JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).entries.length)' "$release/drizzle/meta/_journal.json")
[[ $applied == "$expected" ]] || die "migration journal has $applied rows; the release has $expected migrations"
echo "History digests unchanged: $([[ $before == "$after" ]] && echo yes || echo 'no (migrations applied)'); journal $applied of $expected"

step=candidate
candidate_port=
for p in {4400..4499}; do
 if [[ -z $(ss -Htln "sport = :$p") ]]; then candidate_port=$p; break; fi
done
[[ -n $candidate_port ]] || die 'no free candidate port in 4400-4499'
sed -e "s|$base/current|$release|g" -e "s|PORT=$port\\b|PORT=$candidate_port|" "$release/deploy/$unit.service" > "$candidate"
grep -q "PORT=$candidate_port" "$candidate" || die 'candidate unit has no candidate port'
systemctl daemon-reload
systemctl start "$unit-candidate.service"
if ! wait_health "http://127.0.0.1:$candidate_port" "$commit"; then
 journalctl -u "$unit-candidate.service" -n 30 --no-pager >&2
 die "candidate on port $candidate_port did not report $commit with a working database"
fi
"${as_sawyer[@]}" bash "$release/deploy/smoke.sh" "http://127.0.0.1:$candidate_port"
cleanup

step=switch
for file in "$unit.service" "$collector.service" "$collector.timer" status-dunamismax-backup.service; do
 cmp -s "$release/deploy/$file" "/etc/systemd/system/$file" || install -m 0644 "$release/deploy/$file" "/etc/systemd/system/$file"
done
cmp -s "$release/deploy/backup.sh" /usr/local/sbin/status-dunamismax-backup ||
 install -m 0755 "$release/deploy/backup.sh" /usr/local/sbin/status-dunamismax-backup
systemd-analyze verify "/etc/systemd/system/$unit.service" "/etc/systemd/system/$collector.service" "/etc/systemd/system/$collector.timer"
systemctl daemon-reload
ln -sfn "$release" "$base/current.next"
mv -Tf "$base/current.next" "$base/current"
systemctl restart "$unit.service"

step=verify
wait_health "http://127.0.0.1:$port" "$commit" || die "$unit.service does not report $commit with a working database"
"${as_sawyer[@]}" bash "$release/deploy/smoke.sh" "http://127.0.0.1:$port"
live=$(bash /home/sawyer/github/ubuntu-vm-backup/bin/web-live "$unit.service")
[[ $live == "$unit.service"$'\t'"$node_dir/bin/node"$'\t'"$release"$'\t'"$commit"$'\t'current ]] || die "web-live reports: $live"
echo "Live: $live"
# One collector run on the new release, without notifications (and any timer run
# while this drop-in exists is notification-free too).
install -d -m 0755 "${quiet%/*}"
printf '[Service]\nExecStart=\nExecStart=%s %s/build/src/collector/cli.js collect --no-notify\n' "$node" "$release" > "$quiet"
systemctl daemon-reload
systemctl enable --now "$collector.timer"
systemctl start "$collector.service"
[[ $(systemctl show "$collector.service" -p Result --value) == success ]] || die 'collector verification run failed'

step=caddy
if ! cmp -s "$release/deploy/Caddyfile" "/etc/caddy/sites/$fragment.caddy"; then
 caddy-apply "$fragment" "$release/deploy/Caddyfile"
fi

step=record
"${as_sawyer[@]}" bash "$release/deploy/smoke.sh" "https://$site"
bash "$release/deploy/run-command.sh" record-deployment --service-id status-dunamismax --repo-name status.dunamismax --commit-sha "$commit"
cleanup
logger -t web-deploy "$site $commit live"
printf 'Deployed %s\n' "$commit"
