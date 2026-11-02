# Astro/PostgreSQL migration verification

The first section records the November 2, 2026 Drizzle adoption. The remainder is
historical acceptance evidence for the October 22, 2026 migration and does not
satisfy [BUILD.md Phase 0](../BUILD.md) gates by itself.

## Drizzle adoption acceptance (November 2, 2026 UTC)

Source `1811438` (schema, queries, runner), `5fb1713` (runner-based deploys) and
`50da380` (journal probe fix). Private evidence: root-only
`/root/status-astro-rollback-20261102T2017*`, `…T2019*`, `…T2020*` and
`/root/status-phase0-evidence/`; nothing private is committed.

- Pre-change baseline: release `1149ae6`, 16/16 tests on the pinned runtime; roles,
  HBA, ownership, grants and default ACLs matched the documented contract.
- Private no-TCP restore of production: the first adoption attempt was refused
  because dump/restore re-parses six CHECK constraints into equivalent text; the
  live catalog has the original form. After normalizing to the restored fixpoint
  form, adoption recorded only the baseline with identical every-row digests and
  sequence positions, a repeat was a no-op, and the web role passed 4 reads/13
  denials. Old (`1149ae6`) and new releases served byte-identical bodies/headers on
  every HTML/API/readiness/operator route; both collectors wrote on adopted data.
- Production deploy `5fb1713`: collector drained, safety dump, digests, then
  `--adopt-baseline` recorded `0000_baseline` without DDL. Digests for 60 targets,
  315,862 checks, 20,327 rollups, 78 deployments, three empty tables and all
  sequences were byte-identical. The helper's `to_regclass` journal probe failed
  for the NOINHERIT migration login and fell through to the (correct) adoption;
  `50da380` probes pg_catalog and aborts on failure.
- Deploy `50da380`: journal present, `applied=none`, digests identical (production
  repeat no-op). Rollback via `rollback.sh` to pre-Drizzle `1149ae6`: smoke passed,
  its collector wrote rollup 44035; roll-forward to `50da380` (no-op, identical
  digests) kept that row and all deployment records.
- Production checks: web role 4 reads/13 denials with read-only default off; runner
  policy 0 violations, 0 catalog differences; web process runs `--permission` as
  its own user with only web role env; static bytes identical, headers identical
  apart from ETag/Last-Modified; private/source paths 404, other methods 405;
  0 failed units; Caddy/PostgreSQL/Docker/bot/other site PIDs unchanged except a
  concurrent, lock-serialized dunamismax.com deployment by another session.
- Scheduled collector (20:26 UTC) on `50da380`: operational, 48 services/6 projects,
  0 alerts, 32 expired checks pruned; readiness fresh.
- Injected failed activation: candidate port 14313 held by a loopback 404 listener;
  deploying `5fb1713` over `50da380` failed candidate smoke (exit 22) and the ERR trap
  restored `50da380` automatically. No deployment row or latest-rollback change; its
  migration step was a no-op with identical digests. Listener and candidate unit removed.
- Backups: status site backup with isolated restore succeeded; host snapshot `3d1d352`
  pushed to both remotes; 95 encrypted files decrypted, 0 failures; all 7 databases
  restored with owner/ACL replay; `applications-verify` served `50da380` HTTP 200
  from restored PostgreSQL with locked dependencies reinstalled.
- No notification destination exists; every run here used `--no-notify` or none.
- Limitations: alert delivery/recovery is proven only against loopback sinks in the
  disposable suite (no live webhook); the restore drill is logical, not a bare-metal
  rebuild; `ubuntu-vm-backup/docs/final-integration.md` still lists `51cb1c1` as the
  status release and belongs to the shared host repository.
 PostgreSQL remains authoritative. Retired PHP/MySQL recovery now belongs
in isolation under the current VM runbook, not an ordinary live rollback.

The migration replaces the PHP application, collector and operating commands.
The legacy code is removed from the source tree. Production legacy releases,
MySQL data/credentials and shared PHP/MySQL infrastructure remain as required by
the shared migration contract; their final retirement belongs to host integration.

Automated gates cover legacy API output from the PHP implementation, rollups,
freshness/missing data, routes/HEAD/methods, database failures, escaping, operator
authorization, subprocess deadlines/output bounds/minimal environments, HTTP/body
checks, one-shots/restarts, Caddy permission evidence, DDNS recency, disk thresholds,
quiet repositories, deployment validation and local-only webhook failure behavior.
The PostgreSQL suite uses a private disposable no-TCP cluster and migration login,
checks web denials after disabling its read-only default, writer atomicity,
suppression/caps/failures, retained rollups, Unicode/microseconds and full-table import.

Production acceptance evidence is recorded here after the cutover. Root-only
historical manifests, safety dumps and operational logs remain on the VM and are
never committed. Source baseline: `99babf8`; live PHP release at start:
`c2237919bc72c156166b6dc4c6781f65f721b748`.

Full-data rehearsal succeeded against an isolated PostgreSQL cluster with no TCP:
37 targets, 259,587 check rows, 17,312 rollups and 73 deployments. Incidents,
maintenance and alert tables were empty in that consistent snapshot. All seven
count/SHA256 comparisons passed. Synthetic nonempty tests cover these empty tables.
Migration credentials explicitly SET ROLE; the final SQL uses one transaction.

Production cutover acceptance (October 22, 2026 UTC):

- Initial activation exposed a race between a timer-triggered collector and a
  separately launched verification collector. Automatic rollback restored PHP,
  after copying subsequent PG writes back into MySQL and matching all seven
  row digests. Startup now uses one serialized systemd service job and waits for
  activating/deactivating jobs when draining writers.
- Successful cutover: `aaaff3f`; 38 targets, 259,591 checks, 17,314 rollups and
  73 deployments at final import, with empty incident/maintenance/alert tables.
  Synthetic tests cover nonempty versions of those tables. Identity sequences
  advanced; post-import checks/deployment writes succeeded. API status/incidents
  JSON and all three static files matched the prior PHP release before activation.
- Strict checks, build and all 15 automated tests passed, including isolated PG
  integration through the migration login and symlinked collector execution.
- Live web login read four permitted tables and passed 11 denial probes with its
  read-only default disabled. OS cross-role credential/repository reads were
  denied; Node denied child processes, outside-release reads and all writes.
- A separate temporary loopback service with a deliberately unavailable database
  kept health available, returned degraded readiness and redacted API 503s.
  Operator checks returned 401 before data access and 200/noindex with a synthetic
  valid bearer after database recovery. Temporary unit/env files were removed.
- Production operator token and webhook remained unset. Every verification run
  sent zero notifications. Alert delivery/failure tests used only a loopback sink.
- New hardened web unit active on loopback; successor timer active and legacy
  timer disabled. First new collector run: 30 services, four projects, operational.
- Shared Caddy/PHP/MySQL/Docker/PostgreSQL/bot service PIDs/state matched the baseline.
  An overlapping demo-site migration changed its own Caddy fragment; this migration
  touched only the status fragment. Other observed fragments matched.
- New daily backup service succeeded, including a nonempty PG restore with roles,
  ownership, ACLs and table reads in an isolated no-TCP cluster. Toolworks integration
  `bcf5483` is present on both GitHub and Codeberg.

Private acceptance artifacts remain in timestamped root-only rollback directories.
The runbook documents both PHP data reconciliation rollback and compatible Astro
code rollback. Retained MySQL/PHP recovery resources are intentionally available
for the final host cleanup assignment.

Post-cutover shared encrypted snapshot `7e87e22` was pushed to both remotes.
All 81 encrypted files decrypted without failures; PostgreSQL restored all eight
databases, including nonempty status history, with ownership and ACL replay,
then removed its private no-TCP verification cluster.

The normal five-minute timer fired again at 10:35:12 UTC after the verification
override was removed. It finished successfully with 30 services/four projects
operational, zero notifications, and 31 expired check rows pruned. Fresh readiness
remained ready. Static proxy cache headers use deferred replacement so Astro's
default cache header cannot duplicate the preserved Caddy policy; production
smoke now checks all three static header values and rejects duplicates.
