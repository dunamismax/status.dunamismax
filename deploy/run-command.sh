#!/bin/bash
# Root launches only the bounded application commands as the unprivileged writer.
set -euo pipefail
[[ $EUID == 0 ]] || { echo 'root required' >&2; exit 1; }
if [[ ! -e /proc/$$/fd/9 ]]; then exec /usr/local/sbin/with-deploy-lock "$0" "$@"; fi
flock -n 9
[[ ${1:-} == collect || ${1:-} == record-deployment ]] || { echo 'Expected collect or record-deployment' >&2; exit 64; }
release=$(cd "$(dirname "$0")/.." && pwd -P)
exec systemd-run --quiet --wait --pipe --collect --unit="astro-status-command-$$" \
 --property=User=status-dunamismax --property=Group=status-dunamismax \
 --property=EnvironmentFile=/etc/astro-apps/status_dunamismax/collector.env \
 --property=EnvironmentFile=/etc/status-dunamismax/astro-collector.env \
 --property=StateDirectory=astro-status-dunamismax-collector --property=StateDirectoryMode=0700 \
 --property=UMask=0077 --property=NoNewPrivileges=true --property=ProtectSystem=strict \
 --property=ProtectHome=read-only --property=PrivateTmp=true --property=PrivateDevices=true \
 /opt/astro-runtime/bin/node "$release/build/src/collector/cli.js" "$@"
