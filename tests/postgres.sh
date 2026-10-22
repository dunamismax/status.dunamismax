#!/bin/bash
set -euo pipefail
work=$(mktemp -d /tmp/status-pg-test.XXXXXXXX)
cleanup() { /usr/lib/postgresql/18/bin/pg_ctl -D "$work/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf -- "$work"; }
trap cleanup EXIT
/usr/lib/postgresql/18/bin/initdb -D "$work/data" --no-locale --encoding=UTF8 --auth=trust >/dev/null
/usr/lib/postgresql/18/bin/pg_ctl -D "$work/data" -o "-k $work -p 55436 -c listen_addresses=''" -l "$work/log" start >/dev/null
STATUS_TEST_PG=1 PGHOST="$work" PGPORT=55436 astro-runtime npm test
