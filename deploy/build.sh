#!/bin/bash
# Release step 1, outside the lock, as sawyer. Builds and checks COMMIT (default
# origin/main) from `git archive` and assembles the release payload:
#   bash deploy/build.sh [COMMIT]
# Nothing on the host changes here; any failure stops the release.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=deploy/lib.sh
source deploy/lib.sh
[[ $(id -un) == sawyer ]] || die 'run as sawyer'
git fetch --quiet origin main
main=$(git rev-parse origin/main)
commit=$(git rev-parse --verify "${1:-$main}^{commit}")
[[ $commit == "$main" ]] || die "$commit is not origin/main ($main)"
work=$work_root/$site-$commit
[[ ! -e $work ]] || die "$work already exists; inspect or remove it rather than reuse it"
mkdir -p "$work/src"
git archive "$commit" | tar -x -C "$work/src"
cd "$work/src"
node-26 pnpm install --frozen-lockfile
node-26 pnpm run check
node-26 pnpm run db:check
# Builds, then runs every test, the PostgreSQL ones in a disposable PostgreSQL 18 cluster.
bash tests/postgres.sh
# /healthz reports the commit (vite.config.ts); REVISION below records the same one.
STATUS_REVISION=$commit node-26 pnpm run build
for file in deploy/*.sh tests/postgres.sh; do bash -n "$file"; done
python3 -m py_compile scripts/external-probe.py scripts/http3-probe.py
# The release holds only what runs: no source, no build toolchain, no credentials.
# Production dependencies are installed fresh, because `install --prod` over the
# build tree leaves the dev packages in pnpm's virtual store.
release=$work/release
mkdir "$release"
cp -a .node-version package.json pnpm-lock.yaml pnpm-workspace.yaml "$release/"
(cd "$release" && node-26 pnpm install --frozen-lockfile --prod --ignore-scripts)
rm "$release/pnpm-lock.yaml" "$release/pnpm-workspace.yaml"
cp -a dist build deploy drizzle "$release/"
printf '%s\n' "$commit" > "$release/REVISION"
printf 'Built %s\nDeploy: sudo with-deploy-lock bash %s/deploy/deploy.sh %s\n' "$commit" "$work/src" "$commit"
