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
