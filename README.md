# Dunamis Status

**The public, read-only status page for Stephen Sawyer's self-hosted ecosystem.**
Every five minutes a bounded collector checks the websites, services, timers,
backups and repositories on one Ubuntu server, and
[status.dunamismax.com](https://status.dunamismax.com) shows what it found, as
plain server-rendered HTML and stable JSON.

It is an observer, never a control panel. It reports what was measured, labels
missing or old evidence as unknown or stale, and never invents uptime.

| | |
| --- | --- |
| **Live site** | [status.dunamismax.com](https://status.dunamismax.com) |
| **JSON** | [`/api/status.json`](https://status.dunamismax.com/api/status.json) · [`/api/incidents.json`](https://status.dunamismax.com/api/incidents.json) |
| **Progress** | [BUILD.md](BUILD.md) (start with **Now**) |
| **Source** | Private. `main` is pushed to GitHub and Codeberg together |

## Status

**Live, on SvelteKit since November 20, 2026.** The web layer moved from Astro 7
to SvelteKit 3, Svelte 5 and Tailwind CSS 4 with every route, JSON field and
header contract kept ([BUILD.md Phase 1](BUILD.md#phase-1--sveltekit-3-svelte-5-and-tailwind-css-4)).
Drizzle ORM has owned the PostgreSQL 18 schema since November 2, 2026
([Phase 0](BUILD.md#phase-0--drizzle-orm-on-the-existing-postgresql-history),
[evidence](docs/migration.md)).

**Still open from the cutover:** a rollback rehearsal to the last Astro release
and the first encrypted backup and restore drill of the SvelteKit release.
**Waiting to deploy:** review follow-ups, including a phone layout fix
([BUILD.md 3.4](BUILD.md#34-review-follow-ups)). **Then:** live alert delivery,
once the owner approves the destinations.

## How it works

```text
browser ──HTTPS──▶ Caddy ──▶ SvelteKit (adapter-node, 127.0.0.1:4313)
                                   │ SELECT on four read models only
                                   ▼
                          PostgreSQL 18 (schema app)
                                   ▲
                                   │ snapshots, checks, alerts, retention
systemd timer (5 min) ──▶ TypeScript collector ──▶ bounded probes
```

- **Two processes, two identities.** The web server and the collector run as
  separate nologin users with separate PostgreSQL roles and environment files.
  Neither ever receives the other's credentials.
- **The web side only reads.** It can select rollups, incidents, maintenance
  windows and deployments, and nothing else. It never runs commands, probes URLs
  or reads repositories, and Node's permission model stops it spawning processes
  or writing files.
- **The collector only observes.** Every probe runs a fixed program with an argv
  array, no shell, a minimal environment, a deadline and an output cap. It never
  restarts services or fetches, pulls or resets the repositories it watches.
- **No browser JavaScript.** Pages are rendered on the server with `csr = false`.
  The one stylesheet is built by Tailwind CSS 4 and follows
  `prefers-color-scheme`. There are no fonts, analytics or third-party requests.

## What it is not

- Not a restart panel, deploy orchestrator, remote shell or command-output feed.
- Not a source of uptime claims: a missing snapshot is **unknown**, and one at
  least 15 minutes old is labelled **stale**.
- Not a place for private detail. Public routes never show paths, arguments,
  environment values, credentials, topology, database names, logs or stack
  traces. Only the bearer-authenticated `/operator` page shows its deliberate
  private metadata.
- Not a hosted monitoring service, a container deployment or a static export.

## Routes

| Route | Contract |
| --- | --- |
| `/` | Public HTTP availability, backup and maintenance health, infrastructure, what needs attention, every site and app with its related checks and a 90-day daily history bar, and a 90-day bar per check category |
| `/services` | Every service check by category, with its evidence timestamp, the category's 90-day bar and each check's 90-day operational share |
| `/projects` | Branch, upstream, ahead/behind, dirty state, commit age and BUILD.md progress |
| `/incidents` | Incidents and recent or upcoming maintenance |
| `/deployments` | The latest 50 deployment records |
| `/operator` | 404 while no token is set; otherwise constant-time bearer check, 401 on failure, `noindex` |
| `/healthz` | `ok`, with no database query |
| `/readyz` | Status, dependencies and database fields; database dependency names are `postgresql-*` |
| `/api/status.json` | `overall_state`, `checked_at`, `summary`, `services`, `projects`. `overall_state` rolls up all services and projects |
| `/api/incidents.json` | Latest 25 incidents and 25 maintenance windows; maintenance that ended within 30 days |
| `/_app/immutable/assets/*.css` | The content-hashed stylesheet, `public,max-age=31536000,immutable` |
| `/icon.svg`, `/robots.txt` | Static files with their own Caddy cache policies |

Known routes accept GET and HEAD only; other methods get 405 with `Allow`.
Unknown and private paths get 404, and a page URL with a trailing slash
redirects (308) to the canonical one. Database failures return a redacted 503
with `Retry-After`; readiness keeps its degraded-JSON-with-200 convention. Pages
show times in fixed UTC-05:00 (EST); the APIs use UTC.

## What it watches

The reviewed inventory is [`src/collector/inventory.ts`](src/collector/inventory.ts).
It covers:

- **Public HTTPS:** every site on the host: dunamismax.com, Azeroth Trail (and
  its tracker's freshness), Lorehallow (website and game-server health), RiverMind
  Poker (web server health and the table server's public config), C From The
  Ground Up (health with its database, and its Umami analytics script), Day by
  Word, vincentsawyer.org, Grace and Footnotes, XrayService (site, email assets
  and the Windows installer, a two-byte range request that checks the executable
  signature), the Imaging Services demo and this status page.
- **Host services:** every application unit (including both Lorehallow units,
  both RiverMind Poker units and Umami), PostgreSQL, Caddy (including parse and
  reload evidence), Docker, access services, DDNS recency, RustDesk's three TCP
  listeners (connect only) and every maintenance, backup and restore-check job
  with its timer. Day by Word runs in Docker, which the collector cannot see by
  design, so it is covered by its public check and its backup jobs.
- **Host health:** root disk, available memory and memory pressure, certificate
  expiry and the size of the backup Git store.
- **Repositories:** the thirteen checkouts behind running sites, apps and backups,
  read-only: branch, upstream, dirty state, commit age and BUILD.md progress.
  Quiet repositories stay healthy.

Which checks belong to which site or app is the presentation catalog in
[`src/lib/catalog.ts`](src/lib/catalog.ts); a test keeps it in step with the
inventory. Backup jobs count as fresh only from a recorded successful completion, never
from an enabled timer. Thresholds and windows are listed in
[production operations](docs/production.md#monitoring-policy).

## History and alerts

Each snapshot and its check rows are written in one transaction. Check rows
expire after 30 days by default; rollups, incidents, maintenance, deployments
and alert history are kept. Down is critical, degraded and unknown are warnings,
and maintenance and operational are silent. A failure or recovery is delivered
only after two matching observations within 20 minutes, with a 60-minute repeat
window and at most five deliveries per run. A failed delivery fails the run and
is retried later. An optional heartbeat to an off-site dead-man receiver follows
each successful run. No delivery destination is configured yet
([setup and tests](docs/production.md#offsite-alerts-and-heartbeat)).

The daily history bars come from the stored rollups: each cell is one EST day,
colored by the worst state any check recorded that day, and empty when nothing
was recorded. The percentage is the share of recorded checks that were
operational, rounded down, so a missed collector run is never counted as uptime.
Pages reload themselves every five minutes with a meta refresh, still without
any JavaScript.

## Technology

| Layer | Choice |
| --- | --- |
| Web | SvelteKit 3.2.0 with `@sveltejs/adapter-node` 6.0.2, Svelte 5.57.3, Vite 8.3.7 |
| Styles | Tailwind CSS 4.3.5 through `@tailwindcss/vite`, palette tokens in `@theme`, no preflight |
| Language | TypeScript 6.0.3, strict, with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` |
| Database | PostgreSQL 18, native and loopback-only, through Drizzle ORM 0.45.4 on `pg` 8.16.3 (Drizzle Kit 0.31.11 for development) |
| Collector | TypeScript CLI on a systemd timer, on the same runtime |
| Runtime | Node 24.22.3 and npm 11.19.1, the host's shared runtime at `/opt/node-runtime` |
| Hosting | systemd units and immutable releases on ubuntu-vm, behind Caddy with its own Let's Encrypt certificates |
| CI | GitHub Actions: checks, tests, build, disposable PostgreSQL 18 suite and `npm audit`; a separate external probe of every public site, and a manual HTTP/3 probe |

## Repository layout

```text
status.dunamismax/
├── AGENTS.md           # Rules for working here: boundaries, workflow, verification
├── BUILD.md            # Plan, current state, decisions and evidence
├── src/
│   ├── hooks.server.ts # Method gate, operator bearer check, response headers
│   ├── routes/         # Pages (+page.server.ts loads) and endpoints (+server.ts)
│   ├── lib/            # Read models, view helpers, site catalog, config and the read-only source
│   │   └── components/ # Svelte 5 components
│   ├── app.css         # Tailwind CSS 4 entry: tokens and component rules
│   ├── collector/      # Probes, command runner, alerts, writer and CLI
│   └── db/             # Drizzle schema, catalog check and owner-only migration runner
├── drizzle/            # Reviewed migrations, Kit metadata and the baseline catalog
├── database/schema.sql # Legacy schema, kept for older releases and history tools
├── scripts/            # History digests, permission check, public probes
├── tests/              # Built-server tests and the disposable PostgreSQL suite
├── static/             # icon.svg and robots.txt
├── deploy/             # Build, deploy, rollback, smoke, backup, units and Caddy fragment
└── docs/               # Architecture, production operations, migration evidence
```

## Development

Use exactly Node 24.22.3 and npm 11.19.1 (`.npmrc` sets `engine-strict`). On the
server, prefix commands with `node-runtime`; elsewhere use any version manager
that provides those versions, for example `mise exec node@24.22.3 -- npm ci`.

```sh
npm ci
npm run check      # svelte-kit sync, svelte-check (warnings fail) and the CLI tsc
npm run db:check   # fails on Drizzle schema changes without a reviewed migration
npm test           # builds, then drives the built server in-process
npm run build
make check         # all of the above plus shell and Python syntax checks
```

`npm run dev` serves the app at http://127.0.0.1:8096. Data pages need
PostgreSQL settings; copy the variable names from [`.env.example`](.env.example).
`bash tests/postgres.sh` starts a disposable, socket-only PostgreSQL 18 cluster
and runs the database suite (fresh install, legacy adoption, repeat no-op and
real grant denials). It defaults to Debian's PostgreSQL paths and the
`node-runtime` wrapper, as on the server and in CI. Anywhere else, set
`STATUS_PG_BIN` to a PostgreSQL 18 bin directory, for example
`STATUS_PG_BIN=/opt/homebrew/opt/postgresql@18/bin mise exec node@24.22.3 -- bash tests/postgres.sh`.

To see what the collector would find without writing anything or sending alerts,
build and run `npm run collect -- --dry-run`. [AGENTS.md](AGENTS.md) has the
schema workflow and every rule for changing this repository.

## Documentation

- [Architecture](docs/architecture.md): process, data and access boundaries; the
  SvelteKit web layer and the Drizzle adoption.
- [Production operations](docs/production.md): releases, deploys, rollback,
  backups, monitoring policy and alert delivery.
- [Migration evidence](docs/migration.md): acceptance results for the PostgreSQL
  migration and the Drizzle adoption.

## License

[MIT](LICENSE). The repository is private; the license applies to anyone it is
shared with.
