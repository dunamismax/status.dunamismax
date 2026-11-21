#!/bin/bash
# Disposable, socket-only PostgreSQL 18 cluster for the database suite. The
# server and CI use Debian's PostgreSQL path and the node-runtime wrapper.
# Elsewhere, set STATUS_PG_BIN to a PostgreSQL 18 bin directory and run this
# under the pinned Node, for example:
#   STATUS_PG_BIN=/opt/homebrew/opt/postgresql@18/bin mise exec node@24.22.3 -- bash tests/postgres.sh
set -euo pipefail
bin=${STATUS_PG_BIN:-/usr/lib/postgresql/18/bin}
[[ -x $bin/initdb && -x $bin/pg_ctl && -x $bin/pg_dump && -x $bin/psql ]] || { echo "No PostgreSQL 18 tools in $bin; set STATUS_PG_BIN" >&2; exit 1; }
[[ $("$bin/pg_ctl" --version) == *' 18.'* ]] || { echo 'The database suite needs PostgreSQL 18' >&2; exit 1; }
runtime=()
if command -v node-runtime >/dev/null 2>&1; then runtime=(node-runtime); fi
work=$(mktemp -d /tmp/status-pg-test.XXXXXXXX)
cleanup() { "$bin/pg_ctl" -D "$work/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf -- "$work"; }
trap cleanup EXIT
# The cluster is --no-locale and UTC like production, whatever the caller's
# locale and time zone; a fixed LC_ALL also lets macOS's postmaster start.
export LC_ALL=C
"$bin/initdb" -D "$work/data" --no-locale --encoding=UTF8 --auth=trust >/dev/null
"$bin/pg_ctl" -D "$work/data" -o "-k $work -p 55436 -c listen_addresses='' -c timezone=UTC" -l "$work/log" start >/dev/null
STATUS_TEST_PG=1 STATUS_PG_BIN="$bin" PGHOST="$work" PGPORT=55436 ${runtime[@]+"${runtime[@]}"} npm test
