# Dunamis Status

Public operational status for Stephen Sawyer's self-hosted ecosystem at
<https://status.dunamismax.com>. Astro 7 renders semantic HTML and stable JSON
from PostgreSQL 18. Strict TypeScript runs both the public application and the
bounded background collector on the shared Node 24.22.1/npm 11.19.1 runtime.
The browser receives no JavaScript; the existing responsive stylesheet follows
`prefers-color-scheme`.

Caddy → loopback Astro → four permitted PostgreSQL read models.
The five-minute systemd collector → bounded probes → PostgreSQL history.
The separate web and collector users never receive each other's credentials.

## Routes and behavior

| Route | Contract |
| --- | --- |
| `/` | Service rollup, attention, groups and categorized service cards |
| `/services` | Every service check and its evidence timestamp |
| `/projects` | Branch, upstream, ahead/behind, dirty state, commit age and BUILD progress |
| `/incidents` | Incidents and recent/upcoming maintenance |
| `/deployments` | Latest 50 deployment records |
| `/operator` | 404 while token unset; otherwise constant-time bearer authorization, 401 on failure and noindex |
| `/healthz` | `ok`, no database query |
| `/readyz` | Existing status/dependencies/database shape; database dependency names now `postgresql-*` |
| `/api/status.json` | Existing overall_state/checked_at/summary/services/projects shape |
| `/api/incidents.json` | Existing incidents/maintenance shape, latest 25 each; maintenance ends within 30 days |
| `/assets/status.css`, `/icon.svg`, `/robots.txt` | Preserved static bytes |

Known dynamic routes accept GET/HEAD only; other methods return 405 with Allow.
Unknown/private paths return 404. Database failures return redacted 503s;
readiness retains its degraded JSON/200 convention. Missing snapshots are
unknown; snapshots at least 15 minutes old are labelled stale on snapshot pages.
Timestamps retain the established fixed UTC-05:00 EST display and UTC API format.

## Collection and history

`src/collector/inventory.ts` is the reviewed probe inventory: all five active
public HTTPS targets, systemd services/timers, RustDesk TCP 21115–21117, Caddy
parse/reload evidence, Cloudflare DDNS recency, root disk capacity, memory PSI/available RAM, certificate expiry, backup
Git size, and the six active application repository targets. It additionally monitors the new status Node
service and PostgreSQL. Retired PHP/MySQL targets remain only in historical snapshots.
No Docker socket, restart action, fetch/pull/reset, remote shell or raw journal
is exposed. Quiet repositories remain healthy.

Every snapshot and its individual check rows are transactional. Check rows
expire after the configured retention (30 days default). Rollups, incidents,
maintenance, deployments and alert history remain. Down alerts are critical;
degraded/unknown alerts are warnings; maintenance/operational states are silent.
Failure and recovery deliveries require two matching observations within 20 minutes.
Existing failure dedup keys, repeat window (60 minutes) and per-run limit (5)
remain. A delivered failure receives one confirmed recovery; a subsequent failure
is a new event even inside the repeat window. Delivery remains unconfigured at
the owner’s request; loopback and disposable-database tests cover this behavior. Webhook delivery failure fails the run and never records a sent alert.
A collector advisory lock prevents overlapping notification runs.

## Development

On ubuntu-vm use `astro-runtime npm ci`, `astro-runtime npm run check`,
`astro-runtime npm test`, `bash tests/postgres.sh`, and `astro-runtime npm run build`.
The PostgreSQL test starts a disposable private Unix-socket cluster with no TCP.
Use the same pinned runtime elsewhere; commit only `package-lock.json`.
`make check` runs strict checks, tests and deployment syntax validation.

`deploy/run-command.sh collect --dry-run` probes without writes or alerts;
`collect --no-notify` records/prunes without notifications. Production operator
commands run as root through this wrapper, which launches the separate collector
identity and loads only its role environment via systemd. Deployment flags and
the legacy `STATUS_DEPLOYMENT_*` environment names are preserved by the CLI.

See [production operations](docs/production.md), [architecture](docs/architecture.md),
and [migration evidence](docs/migration.md). The old PHP implementation is removed
from this source tree. Legacy resources are protected recovery material; use PostgreSQL and Astro releases for active recovery.
