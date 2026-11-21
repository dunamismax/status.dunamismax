#!/bin/bash
# Names and helpers shared by deploy/build.sh and deploy/deploy.sh. The flow is the
# host contract's (ubuntu-vm-backup/docs/web-platform.md, section 8): fix forward,
# and every release is checked as a candidate before it takes traffic.
set -Eeuo pipefail
# shellcheck disable=SC2034  # used by the scripts that source this file
{
 site=status.dunamismax.com
 unit=status-dunamismax
 collector=status-dunamismax-collector
 service_user=status-dunamismax-web
 database=status_dunamismax
 settings=/etc/web-apps/status_dunamismax
 port=4313
 fragment=status.dunamismax.com
 base=/srv/www/$site
 node=/opt/node-26/bin/node
 node_dir=/opt/node-v26.13.1-linux-x64
 work_root=/home/sawyer/web-work
 dumps=/var/backups/$site
}
die() { printf '%s: %s\n' "${0##*/}" "$*" >&2; exit 1; }
require_lock() {
 [[ $EUID == 0 ]] || die 'root required'
 [[ -e /proc/$$/fd/9 && $(readlink /proc/$$/fd/9) == /run/web-deploy/lock ]] || die 'run the whole deploy inside one with-deploy-lock process'
 flock -n 9 || exit 75
}
# wait_health URL COMMIT: /healthz must report this release with a working database.
wait_health() {
 local expected="{\"status\":\"ok\",\"revision\":\"$2\",\"database\":\"ok\"}"
 for _ in {1..120}; do
  [[ $(curl -fsS --max-time 3 "$1/healthz" 2>/dev/null) == "$expected" ]] && return 0
  sleep 0.25
 done
 return 1
}
