#!/bin/bash
set -euo pipefail
base=${1:-https://status.dunamismax.com}
for path in / /services /projects /incidents /deployments /healthz /readyz /api/status.json /api/incidents.json /assets/status.css /icon.svg /robots.txt; do
 curl -fsS --retry 15 --retry-connrefused --retry-delay 1 --max-time 10 "$base$path" >/dev/null
 curl -fsSI --max-time 10 "$base$path" >/dev/null
done
[[ $(curl -sS -o /dev/null -w '%{http_code}' "$base/.env") == 404 ]]
[[ $(curl -sS -o /dev/null -w '%{http_code}' "$base/src/lib/db.ts") == 404 ]]
[[ $(curl -sS -o /dev/null -w '%{http_code}' -X POST "$base/api/status.json") == 405 ]]
operator=$(curl -sS -o /dev/null -w '%{http_code}' "$base/operator")
[[ $operator == 401 || $operator == 404 ]]
printf 'Route smoke passed: %s\n' "$base"
