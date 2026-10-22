# Astro/PostgreSQL migration verification

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
