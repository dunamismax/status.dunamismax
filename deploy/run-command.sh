#!/bin/bash
# Root launches only the bounded application commands as the unprivileged writer.
set -euo pipefail
[[ $EUID == 0 ]] || { echo 'root required' >&2; exit 1; }
if [[ ! -e /proc/$$/fd/9 ]]; then exec /usr/local/sbin/with-deploy-lock "$0" "$@"; fi
flock -n 9
case ${1:-} in
 collect|record-deployment)
   settings=(--property=EnvironmentFile=/etc/web-apps/status_dunamismax/collector.env
             --property=EnvironmentFile=/etc/web-apps/status_dunamismax/collector-settings.env)
   ;;
 test-delivery)
   [[ $# == 2 && ( $2 == alert || $2 == heartbeat ) ]] || { echo 'Expected test-delivery alert or heartbeat' >&2; exit 64; }
   test_settings=/etc/status-dunamismax/delivery-test.env
   [[ -f $test_settings && ! -L $test_settings && $(stat -c '%u:%a' "$test_settings") == 0:600 ]] || {
     echo 'Install the root-owned, mode 0600 delivery test settings for approved test destinations' >&2; exit 1;
   }
   settings=(--property="EnvironmentFile=$test_settings")
   ;;
 *) echo 'Expected collect, record-deployment, or test-delivery' >&2; exit 64 ;;
esac
release=$(cd "$(dirname "$0")/.." && pwd -P)
exec systemd-run --quiet --wait --pipe --collect --unit="status-command-$$" \
 --property=User=status-dunamismax --property=Group=status-dunamismax \
 "${settings[@]}" \
 --property=StateDirectory=status-dunamismax-collector --property=StateDirectoryMode=0700 \
 --property=RuntimeMaxSec=4min --property=UMask=0077 --property=NoNewPrivileges=true --property=ProtectSystem=strict \
 --property=ProtectHome=read-only --property=PrivateTmp=true --property=PrivateDevices=true \
 /opt/node-26/bin/node "$release/build/src/collector/cli.js" "$@"
