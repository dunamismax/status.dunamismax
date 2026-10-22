#!/bin/bash
# Build outside the shared deployment lock. Candidate is an exact committed tree.
set -euo pipefail
repo=$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel)
[[ -z $(git -C "$repo" status --porcelain) ]] || { echo 'Commit source changes first' >&2; exit 1; }
commit=$(git -C "$repo" rev-parse HEAD)
candidate="/home/sawyer/astro-work/status-release-$commit"
if [[ -s $candidate/RELEASE && $(cat "$candidate/RELEASE") == "$commit" && -f $candidate/MANIFEST.sha256 ]]; then
 ( cd "$candidate" && sha256sum --quiet --check MANIFEST.sha256 )
 printf '%s\n' "$candidate"
 exit 0
fi
if [[ -e $candidate ]]; then rm -rf -- "$candidate"; fi
mkdir -p "$candidate"
git -C "$repo" archive HEAD | tar -x -C "$candidate"
cd "$candidate"
astro-runtime npm ci --no-audit >&2
astro-runtime npm run check >&2
bash tests/postgres.sh >&2
astro-runtime npm run build >&2
printf '%s\n' "$commit" > RELEASE
find . -type f ! -name MANIFEST.sha256 -print0 | sort -z | xargs -0 sha256sum > MANIFEST.sha256
printf '%s\n' "$candidate"
