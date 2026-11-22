# Dunamis Status build plan

This file is the plan, the record of where work stands and the evidence for
every finished step. Start with **Now**. Read [AGENTS.md](AGENTS.md) before
changing the code or the live service.

The collector parses this file for the public `/projects` page, so its layout is
a contract: see [Format contract](#format-contract).

## Now

| | |
| --- | --- |
| **Current phase** | [Phase 1 · SvelteKit 3, Svelte 5 and Tailwind CSS 4](#phase-1--sveltekit-3-svelte-5-and-tailwind-css-4): complete. [Phase 4](#phase-4--final-cleanup) (no rollback tooling, nothing from earlier stacks) is complete and deployed. [Phase 5](#phase-5--hsts) (an HSTS header, D-13) is complete and deployed. [Phase 6](#phase-6--host-platform-contract) (pnpm, Node 26 and fix-forward candidate deploys, D-14) is complete and deployed. [Phase 3](#phase-3--full-inventory-site-view-and-daily-history) is complete and deployed, including 3.5 (second reconciliation) and 3.6 (a retired unit removed from the inventory) and 3.7 (RiverMind Poker's health check reads the contract's JSON). 3.8 (third reconciliation: three unit checks, two database-aware health checks, deployed release named beside the checkout) is built and waits for its deploy |
| **Next step** | Deploy **3.8**. Then **2.1**: the owner supplies the healthchecks.io ping URL and the Discord webhook URL; then the test alert, a deliberately missed heartbeat and its recovery, and the production settings (2.2). Open with the owner: whether the four repositories with uncommitted work also lose their rollback tooling (4.3; dunamismax.com lost its own in its M.5, 2026-11-21). |
| **In progress** | None. |
| **Blockers** | None. Phase 2 waits on the two destination URLs from the owner. |
| **Live site** | https://status.dunamismax.com serves release `f941edc` on Node 26.13.1 (`/opt/node-26`), deployed 2026-11-21 20:03 UTC with the contract deploy (3.7: RiverMind Poker's health check); `/healthz` reports that commit. It sends `Strict-Transport-Security: max-age=31536000` (D-13); each run stores 100 services and 14 projects. Releases fix forward (D-12, D-14); the deploy prints its evidence and logs `web-deploy` to the journal, and keeps a pre-migration dump in `/var/backups/status.dunamismax.com/`. No alert webhook or heartbeat is configured. |
| **`main`** | `f941edc` is deployed; the 3.8 commit follows it and is not yet deployed. `main` pushes to GitHub and Codeberg together. |
| **Last updated** | 2026-11-22 |

## How to work this file

1. **Orient.** Read **Now** and [AGENTS.md](AGENTS.md). Run
   `git status --short --branch` and `git log -5 --oneline`. Before touching the
   live service, also read the host runbook named in AGENTS.md.
2. **Choose.** The owner's current request comes first. Otherwise take **Next
   step**, or the first unchecked step of the earliest open phase whose
   dependencies are done. Stop at **Owner gate** steps; for an open question, use
   its default.
3. **Claim.** For work that spans sessions, put the step and the date under **In
   progress** before you start.
4. **Verify.** Every step says what done means. Check it through the real entry
   point (the built server, the collector CLI, the VM or the public site) as well
   as through tests, and run the full verification in AGENTS.md before
   committing.
5. **Record.** Tick a box only when it is really done, in the same commit as the
   work. Add an indented `Evidence:` line with the commit, the checks run and the
   results. Partial work stays unchecked with a `Remaining:` line saying what is
   left and why.
6. **Advance.** Update **Now**: next step, in progress, blockers, live site, `main`
   and the date.
7. **Hand off.** Prepend a dated entry to the [handoff log](#handoff-log) and keep
   the newest eight.

**Changing the plan.** You may split a step, add one you discover is needed, or
reword criteria that turned out to be wrong; say why in the handoff entry. Do not
delete a step, lower a criterion or change a settled decision without the owner.
Raise an open question instead. Ideas that are not yet planned go in the
[ideas inbox](#ideas-inbox).

## Format contract

`buildProgress()` in `src/collector/probes.ts` reads this file on every
collector run. `/projects` shows `checked/total` and the title of the first `###`
heading with an unchecked box below it.

- A checkbox is any line that starts with `- [ ]` or `- [x]` after leading
  spaces, anywhere in the file. Put checkboxes only in phase steps, never in
  notes, tables, examples or the ideas inbox.
- `##` headings are phases and other sections. `###` headings are phase steps,
  numbered `<phase>.<n>`, and are the only `###` headings in the file.
- Step titles are public on `/projects`: keep them short and free of private
  paths, hosts and names.
- Never tick a box that is not done, and never untick a finished one except to
  record a regression, with the reason in its evidence.
- If the format must change, change the parser, its test in
  `tests/core.test.ts` and this section in the same commit.

## Settled decisions

These were decided with the owner. Build on them; change one only with the
owner's approval, and record the change here.

| ID | Decision |
| --- | --- |
| D-1 | **Observer only.** The service reports; it never restarts, deploys, runs remote commands or shows command output. The web side is read-only and there are no accounts beyond the bearer-only `/operator`. |
| D-2 | **Reality first.** No invented uptime, no hidden unknown or stale evidence, no claims for checks that did not run. A stale snapshot degrades readiness; never change a timestamp to make a check pass. |
| D-3 | **Stack** (Phase 1, 2026-11-20): SvelteKit 3 · Svelte 5 · TypeScript · Tailwind CSS 4 · PostgreSQL 18 + Drizzle ORM · Node (adapter-node) · Caddy. Every page is server-rendered with `csr = false` and ships no browser JavaScript. Prerendering and adapter-static are for content-only sites, not this live observer. |
| D-4 | **Database** (Phase 0, 2026-11-02): native, loopback-only PostgreSQL 18, database `status_dunamismax`, schema `app`, with separate owner (NOLOGIN), migration, web and collector roles. Drizzle owns the schema through reviewed migrations and the owner-only runner, never `drizzle-kit push` or startup migrations. The web role reads exactly four models, and future tables get no default web access. |
| D-5 | **Collector** stays the TypeScript CLI on a host systemd timer: no Python rewrite, no Docker access and no wider repository ACLs. Existing Python recovery and probe utilities stay. |
| D-6 | **Hosting** stays on ubuntu-vm under systemd: immutable releases in `/srv/www/status.dunamismax.com/releases/<commit>` with an atomic `current`, web on 127.0.0.1:4313, candidates on 127.0.0.1:14313. Units are `status-dunamismax.service` and `status-dunamismax-collector.{timer,service}`, on the shared runtime `/opt/node-runtime`, with role env in `/etc/web-apps/status_dunamismax/` and settings in `/etc/status-dunamismax/`. No Compose or container migration. |
| D-7 | **Caddy and DNS.** DNS is owner-managed, DNS-only Cloudflare records pointing at the server; Caddy obtains its own Let's Encrypt certificates with the custom binary `/usr/local/lib/caddy/caddy`. There is no Cloudflare DNS challenge, plugin, token or proxy work, and agents never change Cloudflare settings. |
| D-8 | **Conditional additions.** Hydration, form actions, remote functions or shadcn-svelte need a concrete interactive feature plus a CSP and smoke review. Better Auth only for requested accounts, the Vercel AI SDK only for a needed LLM feature, Swift only for a requested Apple client (which would call the HTTPS APIs), Python with uv and ruff only where it is the right tool. None is needed now. |
| D-9 | **Privacy.** The source stays private. Public routes never show private paths, arguments, environment values, credentials, topology, database names, logs or stack traces. |
| D-10 | **History.** Check rows expire after 30 days by default; rollups, incidents, maintenance, deployments and alert history are kept indefinitely, with their original IDs and timestamps. Incidents and maintenance are written by the operator in SQL. |
| D-11 | **Alert semantics.** Two matching observations within 20 minutes confirm a failure or a recovery; 60-minute repeat window; at most five deliveries per run; a delivered failure gets one confirmed recovery. Alerts are tested only against mock or loopback endpoints, or with `--dry-run` or `--no-notify`. |
| D-12 | **No rollback, SvelteKit only** (owner, 2026-11-21). Every site on the host runs well on SvelteKit and stays on it. There are no rollbacks: no rollback script, rehearsal or retained fallback release, and a deployment that fails is fixed forward. The host's final cleanup removed every earlier-framework, PHP and MySQL release, the retired MySQL data and the old rollback directories. Do not bring any of it back. |
| D-13 | **HSTS** (owner, 2026-11-21). The Caddy fragment sends `Strict-Transport-Security: max-age=31536000` on every response, without `includeSubDomains` or `preload`. Every other site on the host already sent that value, some with `includeSubDomains`. `deploy/smoke.sh` requires exactly one such header on the public site. |
| D-14 | **Host web-platform contract** (owner, 2026-11-21; `ubuntu-vm-backup/docs/web-platform.md`). pnpm 12.18.0 only, Node 26.13.1 only (`/opt/node-26`), every dependency pinned at the host baseline, every unit's settings in `/etc/web-apps/status_dunamismax/`, and each release checked as a candidate (its `/healthz` reports its commit and a working database) before it takes traffic. |

## Open questions

Use each default until the owner decides otherwise.

| ID | Question | Default until decided | Needed by |
| --- | --- | --- | --- |
| Q-1 | Where do failure alerts and the heartbeat go? | Answered by the owner on 2026-11-21: a healthchecks.io check for the heartbeat (five-minute period, ten minutes' grace) and a Discord channel webhook for alerts (`STATUS_ALERT_WEBHOOK_FORMAT=discord`). Both stay unset until the owner supplies the URLs. | 2.1 |
| Q-2 | When should Drizzle move to 1.0? | Stay on ORM 0.45.4 and Kit 0.31.11 until 1.0 is stable and at least ten days old. Rehearse the upgrade, including its baseline mechanism, in the disposable cluster before production. | — |
| Q-3 | Should incidents and maintenance get an authoring tool? | No. Operator SQL under the deploy lock. If one is added, it is an owner-run CLI on the writer side, never a web route. | — |

## Phase overview

| Phase | What | State |
| --- | --- | --- |
| Baseline | Migration to strict TypeScript and PostgreSQL | Complete 2026-10-22 |
| 0 | Drizzle ORM adopts the existing PostgreSQL history | Complete 2026-11-02 |
| 1 | Web layer to SvelteKit 3, Svelte 5 and Tailwind CSS 4 | Complete 2026-11-21 |
| 2 | Live alert delivery and heartbeat | Destinations chosen 2026-11-21 (Q-1); waiting on their URLs |
| 3 | Full inventory, site view and daily history | Complete and deployed 2026-11-21 |
| 4 | Final cleanup: no rollback tooling, nothing from earlier stacks | Complete and deployed 2026-11-21 |
| 5 | HSTS header from the Caddy fragment | Complete and deployed 2026-11-21 |
| 6 | Host platform contract: pnpm, Node 26, fix-forward candidate deploys | Complete and deployed 2026-11-21 |

## Baseline · Migration to PostgreSQL

Complete 2026-10-22. Results are in [docs/migration.md](docs/migration.md).
Rollups are kept indefinitely; incident and maintenance authoring stays an
operator SQL task (D-10, Q-3).

### B.1 Migration acceptance

- [x] Preserve routes, JSON structures, HTML/CSS behavior and operator boundary.
- [x] Separate public reads from bounded collector probes/writes.
- [x] Preserve incidents, maintenance, deployments, alerts, suppression and retention.
- [x] Add transactional history transfer with original IDs and every-row digests.
- [x] Add candidate deployment, shared-lock rollback and PostgreSQL backup verification.
- [x] Remove superseded PHP application, collectors, tests and deployment scripts.
- [x] Strict checks, automated behavior tests and isolated PostgreSQL integration.
- [x] Full historical-data rehearsal (259,587 checks, 17,312 rollups; all seven table digests).
- [x] Production reconciliation: all seven table digests match; subsequent writes retained.
- [x] Commit/dual-push, deploy, production/access checks and real reverse-migration rollback.
- [x] PostgreSQL-aware daily backup passed restore; Toolworks integration dual-pushed.
- [x] Encrypted shared backup/restore and normal timer observation (10:35:12 UTC).

## Phase 0 · Drizzle ORM on the existing PostgreSQL history

Complete 2026-11-02. Add typed Drizzle schemas, queries and reviewed migrations
to the live database without rebuilding its history, keeping native PostgreSQL,
host systemd deployment and the UI. The text records the decisions as they were
made; Phase 1 replaced only the web framework choices in 0.3.

### 0.1 Review reality and preserve contracts

- [x] Read AGENTS, README, the architecture, production and migration docs and
  the host runbook with its restore and final-integration references. Check
  local and host commits, the current release, units, roles, schema, timers,
  backups and port reservations; do not assume parity.
  Evidence (2026-11-02, read-only as sawyer): VM checkout clean at `1149ae6`,
  behind local `c5d1175` by documentation-only commits; active release `1149ae6`
  (final-integration.md's `51cb1c1` is a retained older release). Web, collector
  timer, backup timer and postgresql@18-main active; readiness
  `ready`/`postgresql-ready,collector-snapshot-fresh`; loopback 4311–4315 and
  5432 listening, 14313 free. As root: the four roles match the contract (NOLOGIN
  owner; NOINHERIT migration login with SET-only owner membership; web and
  collector without membership), HBA loopback SCRAM per role, database and schema
  owned by the owner, web SELECT on exactly four tables, collector revoked from
  `schema_migrations`, no web default ACLs; status backup succeeded at 06:32 UTC.
- [x] Run current pinned-runtime checks before implementation. Capture sanitized
  fixtures and private baseline digests and catalog evidence. Keep private
  snapshots, role credentials, env files and raw probe outputs out of Git.
  Evidence: pinned-runtime baseline passed on the VM in a scratch archive of
  `1149ae6` (npm ci, check 0 errors, 16/16 tests with PostgreSQL 18, build, shell
  and Python syntax). Private digests, catalog diffs and safety dumps are in
  root-only `/root/status-rollback-*` and `/root/status-phase0-evidence/`.

The contract every later phase keeps: all routes (`/`, `/services`, `/projects`,
`/incidents`, `/deployments`, `/operator`, `/healthz`, `/readyz`,
`/api/status.json`, `/api/incidents.json`) and the three static files; GET/HEAD
only, empty HEAD, 405 with `Allow` for other methods, 404 for unknown and private
paths, safe escaping and URLs, redacted 503 with `Retry-After`, static bytes and
cache headers. Operator: 404 with no token, 401 for a bad bearer before any
database read, `noindex` and only deliberate private metadata when valid; no
accounts. Health returns `ok` without the database; readiness keeps degraded/200
and its exact fields, including the `postgresql-*` labels. API fields, states and
IDs, the service-only summary and overview counts, the combined service and
project rollup, time and ID ordering, the latest 25 incidents and maintenance
windows and 50 deployments, maintenance's 30-day filter, the 15-minute stale
boundary, UTC in the APIs and fixed UTC-05:00 EST on pages.

### 0.2 Adopt Drizzle without rebuilding history

- [x] Refresh official docs for compatible Drizzle ORM and Kit and pg APIs. Pin
  exact versions with the npm lock; keep the shared Node and npm. Keep strict,
  `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` in the web and
  collector configurations.
  Evidence: drizzle-orm 0.45.4 and drizzle-kit 0.31.11 (latest stable; 1.0 was
  an RC), exact pins in the lockfile; Kit's deprecated `@esbuild-kit` esbuild is
  overridden to 0.25.12 so `npm audit --audit-level=moderate` stays clean.
- [x] Add the TypeScript `src/db/` schema, `drizzle.config.ts`, reviewed SQL and
  metadata under `drizzle/`, generate, check and migrate scripts and an explicit
  owner-only runner. No production schema push and no migration on startup.
  Evidence: `src/db/schema.ts`, `drizzle.config.ts`, `drizzle/0000_baseline.sql`
  and Kit metadata, `drizzle/baseline-catalog.json`, `src/db/{migrate,catalog}.ts`;
  scripts `db:generate`, `db:check` (Kit check and drift gate, in the Makefile and
  CI) and `db:migrate`.
- [x] Introspect a private disposable restore of schema `app` and compare it with
  the live catalogs and `database/schema.sql`. Preserve all seven history tables.
  Keep `app.schema_migrations` separate from the Drizzle journal.
  Evidence: a private no-TCP restore of production first refused adoption because
  dump/restore re-parses six CHECK constraints into equivalent text. Catalog
  comparison now uses the restored form, and the suite adopts a dump/restore
  copy. Re-run: adopted with identical every-row digests and sequences, repeat
  no-op; the journal is owner-only `app.drizzle_migrations`.
- [x] Rehearse a fresh install and adoption of an existing matching schema
  without recreating, truncating or reimporting tables. Apply only verified
  baseline entries under migration credentials; a repeat migrate is a no-op.
  Evidence (disposable PostgreSQL 18): fresh install, refusal without
  `--adopt-baseline`, catalog-gated adoption of a nonempty legacy database with
  unchanged digests and sequences, repeat no-op, refused re-adoption, refused
  drifted schema. Pinned Kit 0.31.11 has no `pull --init` (1.0-beta only), so the
  runner records the baseline itself in Drizzle's hash and timestamp format.
- [x] Preserve bigint identity IDs and next sequence values, timestamptz(6)
  microseconds, JSONB, Unicode, nulls, constraints, foreign keys, indexes,
  defaults and updated-at triggers, with lossless mappings: no JS Number IDs or
  Date truncation. Keep hand-reviewed SQL for DDL Kit cannot express.
  Evidence: string-mode timestamptz(6), `BigInt` IDs (tested past 2^53 through
  the sequence), JSONB `$type`s; grants, triggers and bookkeeping are
  hand-reviewed SQL.
- [x] Move PostgresSource to Drizzle over the existing pg pool, keeping the Source
  behavior, the max-3 pool and bounded timeouts. Port collector persistence with
  atomic snapshot writes, dedup and lock scope, and keep each transaction on one
  connection.
  Evidence: source and writer use the query builder; writes use `transaction()`
  on the caller's client; the advisory lock and history cursors stay
  parameterized SQL.
- [x] Keep the NOLOGIN owner and independent migration, web and collector logins.
  The runner SETs ROLE owner. Web SELECT stays on exactly four models, with no
  sequences, private tables, journals, writes, DDL or membership. Verify actual
  grants with the read-only default disabled.
  Evidence (disposable PostgreSQL 18): the runner `SET LOCAL ROLE`s owner and
  fails closed on access violations; tests prove real 42501 denials (future
  table, both journals, private tables, writes, sequences, SET ROLE). Production:
  the same policy check passes; the web role passed four reads and 13 denials.
- [x] Drain owning writers and compare every-column ordered counts and digests for
  all seven tables before and after adoption; verify triggers, constraints,
  sequences and journals separately, with synthetic nonempty data. Keep
  reconciliation files private. No MySQL or SQLite conversion.
  Evidence: synthetic cases pass in the disposable suite. Production adoption
  (deploy `5fb1713`, collector drained under the lock) recorded only
  `0000_baseline`; digests for 60 targets, 315,862 checks, 20,327 rollups, 78
  deployments, the empty incident, maintenance and alert tables and all sequences
  were byte-identical.

### 0.3 Keep only needed stack components

- [x] Keep Astro server output with @astrojs/node standalone, `src/pages`
  endpoints and server-only `src/lib`; this live observer is not a static export.
  Keep vanilla CSS and no scripts. (Superseded by Phase 1's SvelteKit move.)
- [x] Keep bearer-only operator access and a read-only web. Better Auth only for
  requested accounts, an AI SDK only for needed LLM features, form actions only
  for requested mutations; never a public restart, deploy or shell surface.
  Future clients use the HTTPS APIs, never the database.
- [x] Keep the host TypeScript collector and the useful Python recovery and probe
  scripts. Do not port working code to Python. Python work, if needed, uses uv,
  locked dependencies and ruff.
- [x] No native app exists or is needed. Requested Apple work would use
  Swift/SwiftUI with recorded versions and a working xcodebuild test command. No
  language template files in this repository.

### 0.4 Keep safe systemd deployment and recovery

- [x] Keep the host units and accounts, the collector timer, jitter and cap,
  private HOME, read-only repository ACLs, Node permission restrictions and
  root-only role env separation. No collector Docker access. Probes keep their
  bounds and behavior. No repository fetch, pull or reset.
  Evidence: units and accounts unchanged; web runs as `status-dunamismax-web`
  with `--permission` and only web role env; collector as `status-dunamismax`
  with only its role files (deploy asserts no docker group). Probe code unchanged.
- [x] Adapt build, deploy, rollback, the command wrapper and smoke for reviewed
  migrations, keeping `CANDIDATE EXPECTED_CURRENT`, exact-commit manifests,
  release/current and ports 4313 and 14313. Build and test outside the lock.
  Evidence: `deploy.sh` replaces raw `schema.sql` with the runner (adoption only
  without a journal), bracketed by digests that must match on no-op runs. The
  first adoption exposed a journal probe the NOINHERIT login could not run; fixed
  in `50da380` and redeployed.
- [x] Run every shared roles, schema, units, ACL, Caddy, release and rollback
  change in one VM transaction under `with-deploy-lock`, reusing FD 9: recheck,
  back up, drain, migrate and reconcile, validate the candidate, switch, smoke.
  Evidence: deploys of `5fb1713` (adoption), `50da380` (no-op) and its
  roll-forward each ran in one locked transaction: candidate smoke on 14313,
  atomic switch, custom-Caddy validation and reload, public smoke, `--no-notify`
  collector, recorded deployment. Shared service PIDs unchanged except a
  concurrent, lock-serialized deployment of another site.
- [x] Rehearse failure and rollback on current data with a compatible retained
  Astro release, keeping later writes and alert state; never restore an old dump
  over newer history.
  Evidence: the restore rehearsal served byte-identical HTML and API from
  pre-Drizzle `1149ae6` and the new build on adopted data. Live: `rollback.sh`
  restored `1149ae6`, whose collector wrote rollup 44035; roll-forward kept it and
  every deployment row.
- [x] Keep loopback-only PostgreSQL, nightly pg_dump with roles, ACLs and settings,
  encrypted off-host copies and an isolated full restore; verify the restored
  runtime and roles, not just the dump.
  Evidence: status backup with isolated restore succeeded; host snapshot `3d1d352`
  on both remotes; `restore check` decrypted 95 files, 0 failures;
  `postgres-verify` restored all 7 databases with owner and ACL replay;
  `applications-verify` reinstalled `50da380` and served HTTP 200 from restored
  PostgreSQL. No shared backup or Toolworks interface change was needed.
- [x] Keep the host Caddy paths, custom modules, TLS and route headers (D-7). No
  unrelated site edit, shared service restart or R2/Litestream requirement.
  Evidence: the unchanged fragment validated with the custom binary and reloaded;
  Caddy's MainPID unchanged; static cache headers pass without duplicates.

### 0.5 Acceptance and documentation

- [x] Run npm ci, check, test, `bash tests/postgres.sh`, build, shell and Python
  syntax and `git diff --check` on the pinned runtime; add Drizzle fresh,
  adoption and no-op tests to CI and the Makefile, in disposable no-TCP
  PostgreSQL only.
  Evidence: done on the VM's pinned runtime and in CI (`db:check` added; 17/17
  tests).
- [x] Verify route, API, static and header parity, escaping, auth before query,
  outage redaction, the no-script UI, freshness transitions, lossless times and
  IDs, the import graph and env isolation, and real denials.
  Evidence: old and new releases returned byte-identical bodies and headers for
  every HTML, API, readiness and operator route on the same data. The production
  web role passed four reads and 13 real denials; private paths 404, other
  methods 405 with `Allow: GET, HEAD`.
- [x] Verify the collector timer and freshness, confirmation, the advisory lock,
  repeat, caps and sent evidence, and retention, with real webhooks unconfigured.
  Rehearse a failed activation.
  Evidence: the scheduled 20:26 UTC run on `50da380` stored an operational
  snapshot (48 services, 6 projects), sent 0 alerts and pruned 32 expired checks.
  Injected failed activation (candidate port held by a loopback 404 listener)
  aborted at candidate smoke and the ERR trap restored `50da380` with no
  deployment row.
- [x] Replace raw-schema application with the tested Drizzle commands only after
  parity, keep historical recovery tooling, update all docs, scripts and CI in
  the same change, commit, dual-push and verify both remote tips.
  Evidence: `deploy.sh` uses the runner; `database/schema.sql`, history transfer
  and legacy tooling are kept for old releases and recovery. Active release
  `50da380`; both remote tips verified.

## Phase 1 · SvelteKit 3, Svelte 5 and Tailwind CSS 4

Move the web layer to SvelteKit (adapter-node) and Tailwind CSS 4, keeping
PostgreSQL and Drizzle, the collector, roles, units, Caddy and every public
contract from 0.1. Deployed 2026-11-20; complete 2026-11-21.
References: [SvelteKit 3 migration](https://svelte.dev/docs/kit/migrating-to-sveltekit-3),
[adapter-node](https://svelte.dev/docs/kit/adapter-node),
[Tailwind CSS preflight](https://tailwindcss.com/docs/preflight).

### 1.1 Source migration

- [x] Pin exact versions at least ten days old (2026-11-20): @sveltejs/kit 3.2.0,
  @sveltejs/adapter-node 6.0.2, @sveltejs/vite-plugin-svelte 7.3.1, svelte
  5.57.3, vite 8.3.7, tailwindcss and @tailwindcss/vite 4.3.5, svelte-check
  4.7.8; TypeScript 6.0.3, pg, Drizzle and Node 24.22.3/npm 11.19.1 unchanged.
  Framework packages are devDependencies (adapter-node bundles them); runtime
  `dependencies` stay pg and drizzle-orm. Config in the `sveltekit()` Vite
  plugin, `$app/tsconfig`, `#lib/*` subpath imports.
- [x] Port the Astro catch-all endpoint to routes: Svelte 5 pages with
  `+page.server.ts` loads, `+server.ts` for health, readiness and JSON,
  `+error.svelte` for 404 and 503, and `hooks.server.ts` for the 405 gate, the
  operator 401 before data access, empty HEAD, security headers, `Retry-After`
  and `noindex`. Every page sets `csr = false`; `dist/client` holds no
  JavaScript.
  Evidence: on identical fixture data every HTML route matches the Astro renderer
  except the stylesheet URL, whitespace and literal `>` in escaped text; API and
  readiness bodies are byte-identical. Trailing-slash page URLs now 308 to the
  canonical path (they were 404).
- [x] Move `public/` to `static/` and rebuild `status.css` as `src/app.css` on
  Tailwind CSS 4 (palette `@theme` tokens, the original component rules in the
  components layer, no preflight, explicit utility sources). The stylesheet is a
  content-hashed `/_app/immutable/assets/*.css`; Caddy keeps its icon and robots
  policies and leaves adapter-node's immutable header alone.
- [x] Keep `npm test` self-contained: it builds, then drives the built server in
  process with injected storage. Add tests for no client JS, inline style or
  hydration markers, header policy, escaping and the import graph over all
  routes and components.
  Evidence (macOS, pinned runtime): `npm run check` 0 errors and warnings,
  `npm run db:check` clean, `npm test` 21 passed and 2 PostgreSQL-only skipped,
  build, shell syntax and Python compile. A disposable Homebrew PostgreSQL 18
  cluster ran the database suite 22/23 (the last test needs Debian's `pg_dump`
  path). The built server then ran under `node --permission` as the restricted
  web role against that data and passed `deploy/smoke.sh`.
- [x] Adapt the deploy files: unit entry `dist/index.js` plus `ORIGIN`, the
  candidate check, the Caddy fragment and a smoke test that recognizes either
  stylesheet so it can also validate an Astro rollback target. Unit, account,
  port, env-file and runtime names stay.

### 1.2 Production cutover

- [x] On the VM, `deploy/build.sh` an exact candidate with the pinned runtime,
  including `bash tests/postgres.sh` (23/23 with Debian's `pg_dump`) there and in
  CI.
  Evidence (2026-11-20): candidate `8c72b37` (after `.astro/` was re-ignored so
  retained Astro-era checkouts stay clean); svelte-check 0/0, 23/23 tests with
  PostgreSQL 18.
- [x] Before deploying, check ubuntu-vm-backup's `applications-verify` and other
  host tooling for the Astro entry `dist/server/entry.mjs` or
  `/assets/status.css`, and update those consumers in their own repository first.
  Evidence: only `config/applications.json` named the entry (archive check and
  restore drill); ubuntu-vm-backup `78290e6` points it at `dist/index.js` and
  updates its runbook. A copy installed with the drill's `npm ci --omit=dev
  --ignore-scripts` served healthz and static 200 and a redacted 503 without a
  database.
- [x] Deploy under `with-deploy-lock`: candidate smoke on 14313, atomic switch,
  custom-Caddy validation and reload of the new fragment, public smoke (immutable
  stylesheet header, no duplicates), `--no-notify` collector run, recorded
  deployment.
  Evidence: 2026-11-20 13:45 UTC from `cc3fc21` (Astro) to `8c72b37`; rollback
  directory `/root/status-astro-rollback-20261120T134532Z`. The unit runs
  `dist/index.js` under `--permission`; readiness `ready` and fresh; home page
  script-free; stylesheet `public,max-age=31536000,immutable` once; `/services/`
  308, unknown and operator 404, form POST 405; web role 4 reads and 13 denials;
  the web process env holds only web keys. Caddy, PostgreSQL and the other three
  site services kept their PIDs. The first scheduled run (13:51 UTC) stored 56
  services and 6 projects with 0 alerts.

Dropped by the owner on 2026-11-21 (D-12): the rollback rehearsal that stood
here as this step's one unfinished item. It was never run; the release, unit
files and rollback directory it needed were deleted in step 4.1.

- [x] Verify the no-script UI and unchanged icon and robots bytes.
  Evidence: icon and robots SHA-256 identical before and after; computed styles
  of all 147 overview elements and their `::before` markers match the Astro
  stylesheet in light and dark at 1280 px and 375 px (same markup and classes, so
  focus styles and the skip link are unchanged).
- [x] Encrypted backup and restore drill (`bin/backup`, `restore
  applications-verify`) serving the SvelteKit release with its restricted web
  role; first due with the scheduled ubuntu-vm-backup run on 2026-11-21 07:35 UTC.
  Evidence (2026-11-21): the scheduled `bin/backup --push` ran 07:41 to 07:44
  UTC with release `fefd9ea` live. Its restore verification passed before it
  committed snapshot `5effb83`, and both mirrors verified that commit. Run again
  by hand against that snapshot at 13:23 UTC, on the owner's instruction:
  `bin/restore check` decrypted 133 files with 0 failures, and `bin/restore
  applications-verify` passed in about a minute (18 artifacts, 13 databases).
  It restored this database into a disposable cluster on a private Unix socket
  with no TCP listener (owner, archive digest, constraints, ACL replay and table
  reads passed), started the recovered `fefd9ea` release from `dist/index.js`
  in its own network namespace as the restricted web role, and got HTTP 200
  with `checked_at` from `/api/status.json`. The cluster was removed on exit,
  the backup checkout was left unchanged and live readiness stayed `ready`.
  The snapshot predates `cadc299`, which differs only in the collector's
  inventory; the next scheduled run (2026-11-22 07:31 UTC) covers it.

## Phase 2 · Live alert delivery

Turn on the off-site alerts and heartbeat that the collector already supports,
following [production operations](docs/production.md#offsite-alerts-and-heartbeat).
Owner gate: every destination comes from the owner (Q-1). Never inject a failure
into live backup, DDNS or Caddy to test delivery.

### 2.1 Test destinations

- [ ] **Owner gate.** The owner supplies an approved test alert recipient and a
  heartbeat monitor that expects a ping every five minutes with ten minutes'
  grace.
- [ ] With the test URLs in a root-only, mode 0600
  `/etc/status-dunamismax/delivery-test.env`, `run-command.sh test-delivery
  alert` and `test-delivery heartbeat` deliver; the marked test alert reaches the
  recipient, the receiver records the heartbeat, a missed deadline produces its
  message and a fresh ping its recovery.

### 2.2 Production destinations

- [ ] **Owner gate.** The owner approves the production URLs; they are installed
  under the same names in `/etc/web-apps/status_dunamismax/collector-settings.env`
  (root, 0600) and nowhere else. The next scheduled run logs `heartbeat=sent` and the
  receiver shows a recent ping.
- [ ] README, `docs/production.md` and **Now** no longer say delivery is
  unconfigured, and record which variables are set (never their values).

### 2.3 Discord format and off-site backup checks

- [x] Alerts can be sent as a Discord message: `STATUS_ALERT_WEBHOOK_FORMAT`
  is `json` (default, the existing payload) or `discord` (one message, no
  mentions possible); any other value stops the collector at startup.
  Evidence: `discordPayload` and the format setting, with a loopback test of
  the message shape, the 1,900-character cap and the rejected value; check,
  db:check, the full suite in a disposable PostgreSQL 18 cluster and the build
  pass on Node 26.13.1.
- [x] The collector watches the off-site media backup: `media-backup` (daily,
  26 hours) and `media-backup-verify` (first Sunday of the month, 37 days),
  each with its timer, on the vincentsawyer.org card.
  Evidence: inventory, catalog and the inventory test; both jobs write a
  completion marker in `/var/lib/ops-success`.
- [x] Deployed, and the first scheduled run stores the four new checks.
  Evidence: `1a44b24` deployed 2026-11-21 17:54 UTC with the contract deploy
  (candidate on 4400, no migration, history digests unchanged, smoke on the
  candidate, on 4313 and on the public site); `/healthz` reports that commit.
  The 17:55 UTC run stored 100 services and 14 projects, with `media-backup`,
  `media-backup-verify` and both timers operational. No destination is set, so
  no alert or heartbeat has been sent.

## Phase 3 · Full inventory, site view and daily history

The owner asked (2026-11-20) for every self-hosted project and site on the host
to be monitored and for the status site's design and usefulness to improve.
Contracts from 0.1 stay: no route, JSON field, state, header or grant changes;
pages stay script-free.

### 3.1 Inventory reconciliation

- [x] Inventory the host read-only (running and enabled units, timers, sockets,
  Caddy sites, containers, listening ports, `~/github` checkouts and their
  collector access) and add everything missing to the collector, with tests.
  Evidence (2026-11-21, read-only over SSH as root): added HTTP checks for
  cfromthegroundup.com (`/healthz` with its database), its Umami script,
  daybyword.com, rivermindpoker.com (`/healthz` and the table server's
  `/api/config`), vincentsawyer.org and data.xrayservice.net, which also adds
  five certificate checks; units `lorehallow-web`, `lorehallow-server`,
  `rivermind-poker-web` and `umami`; jobs and timers `cfromthegroundup-backup`,
  `vincentsawyer-backup`, `daybyword-backup` (26 h) and the monthly
  `daybyword-restore-check` (32 days); and seven repositories (azerothtrail,
  lorehallow, c-from-the-ground-up, daybyword, rivermind-poker, vincentsawyer.org,
  ubuntu-vm-backup), all already readable through the existing default ACL, so no
  ACL changed. Day by Word's Docker containers stay outside the collector's reach
  by design. Not added: `fieldcadence` (no running service) and the
  `dunamismax` profile repository (nothing self-hosted). A test checks every
  catalogued ID against the inventory and that service and project IDs are unique.

### 3.2 Site view and daily history

- [x] Present each site or app with its related checks, and add daily history
  from stored rollups without new tables, grants or contract changes.
  Evidence: `src/lib/catalog.ts` maps 13 sites and apps to their checks and
  repositories; `PostgresSource.history()` counts samples per EST day, target and
  state from `rollups` (0.8 s for 90 days of production data, run once per day per
  process; each request then reads only the current day). A history failure shows
  "unavailable" and never fails a page (tested). The PostgreSQL suite asserts the
  web role's aggregation and the completed-day cache.
- [x] Redesign the pages: overview headline with a state tally and scope, a full
  width attention panel, site and app cards with a 90-day bar, related-check chips
  and repository state, a 90-day bar per category; services grouped by category
  with jump links, a bar per category and a 90-day column; projects with a BUILD
  progress bar. Five-minute meta refresh on live pages, sticky header on wide
  screens, 30-day bars on phones. Still no JavaScript, inline style or fonts.
  Evidence: on macOS with Node 24.22.3, `npm run check` 0/0, `db:check` clean,
  `npm test` 25 passed and 2 PostgreSQL-only skipped, build, shell and Python
  syntax, `git diff --check`, `npm audit` clean; on the VM, `bash
  tests/postgres.sh` 27/27 in a scratch copy as sawyer. Previewed with the live
  snapshot, fresh public probes and real history at 1280 px dark and 375 px
  light, with no horizontal page scroll.

### 3.3 Production rollout

- [x] Deploy under `with-deploy-lock` with `deploy/build.sh` and
  `deploy/deploy.sh` (candidate smoke, atomic switch, Caddy validation, public
  smoke, `--no-notify` run, recorded deployment). The first scheduled run stores
  85 services and 13 projects; the public overview renders the history bars.
  Evidence (2026-11-21): `deploy/build.sh` built `35c43d1` on the VM with 27/27
  tests including PostgreSQL 18; `deploy/deploy.sh` from `1da4095` passed
  candidate and public smoke and recorded the deployment (rollback directory
  `/root/status-rollback-20261121T013320Z`). Readiness `ready` and fresh; the
  overview returned 200 in about 60 ms with all 13 site cards and history bars.
  The first scheduled run (01:39 UTC) stored 85 services and 13 projects in 2.0 s
  with 0 alerts; every check was operational except the root disk at 81%.

### 3.4 Review follow-ups

- [x] Fix what a review of the deployed release found, with tests.
  Evidence (2026-11-21): at 375 px the live overview scrolled sideways whenever
  a check needed attention (the redesign's three-column attention row overrode
  the narrow layout; measured 516 px in a 375 px viewport on the live site). The
  row now stacks on phones, and the built pages measure 375 px on the overview,
  services and projects at that width. The attention panel listed six checks and
  silently dropped the rest; it now counts the ones it does not list and links to
  the services page (worst state first, tested). "Public certificates" was
  missing from the category order and sorted last; it now follows "Public
  websites" (tested). The external probe covered five of eleven public sites; it
  now probes every catalogued site, a test keeps the two lists in step, and a run
  from a workstation passed all eleven plus collector freshness. `deploy.sh`'s
  settings check listed keys it never read; it is now a plain file test that still
  fires the rollback trap (exercised on bash 3.2 and 5.3). `tests/postgres.sh`
  takes `STATUS_PG_BIN`, pins the disposable cluster to UTC and a fixed locale,
  and so runs outside Debian. Checks on macOS with Node 24.22.3: `npm run check`
  0/0, `db:check` clean, `npm test` 27 passed and 2 PostgreSQL-only skipped,
  `tests/postgres.sh` 29/29 on Homebrew PostgreSQL 18.7, build, shell and Python
  syntax, `git diff --check`, `npm audit` clean.
- [x] Deploy the follow-ups under `with-deploy-lock` with `deploy/build.sh` and
  `deploy/deploy.sh`; the public overview has no sideways scroll at 375 px.
  Evidence (2026-11-21, on the owner's instruction): `deploy/build.sh` built
  `bf56806` on the VM with 29/29 tests including PostgreSQL 18; `deploy/deploy.sh`
  from `35c43d1` ran 02:55 to 02:56 UTC, passed the changed settings check,
  candidate and public smoke and Caddy validation, and recorded the deployment
  (rollback directory `/root/status-rollback-20261121T025518Z`). The migration
  was a no-op with identical every-row digests. Caddy, PostgreSQL and three other
  site services kept their PIDs. The web unit runs `dist/index.js` under
  `--permission` with 0 restarts and only web keys in its environment; the web
  role passed four reads and 13 denials. Readiness `ready` and fresh. The live
  stylesheet is byte-identical to the build verified locally, and the public
  overview at 375 px measures 375 px wide (the attention row ends at 342 px; it
  was 516 px), with no script. The first scheduled run (03:01 UTC) and the five
  after it each stored 85 services and 13 projects with 0 alerts.

### 3.5 Second inventory reconciliation

- [x] Reconcile the host again (the owner asked on 2026-11-21 for a review of
  everything running there) and add what is missing, with tests.
  Evidence (2026-11-21 04:51 to 04:59 UTC, read-only over SSH as root): no
  failed units, every application unit active with 0 restarts, and the live
  snapshot had 84 of 85 checks operational (root disk 81%). One site was missing:
  `fieldcadence.app` went live at about 04:12 UTC as a Docker Compose project
  behind its own Caddy fragment. Added its HTTP check (page title), its
  repository (readable through the existing default ACL, so no ACL changed), its
  site card and its external-probe entry. It has no health route, host unit,
  timer or backup job yet, so there is nothing else to check; its repository's
  jobs timer is not installed. Also missing: the ten `www.` host names Caddy
  redirects, each with its own certificate and none checked; all ten plus
  `fieldcadence.app` now get a certificate check (the `www.graceandfootnotes.com`
  certificate had 30 days left against the apex's 89, inside Caddy's renewal
  window). The Imaging Services demo was checked for HTTP 200 on its homepage
  only; it is now checked through `/healthz`, which loads its pages from its
  content store first. A collector run now stores 97 services and 14 projects
  (dry run from a workstation: every HTTP and certificate check operational
  except the Azeroth Trail tracker, which answered 503 for about 30 seconds
  while another deployment restarted it under the deploy lock). Tests: the demo
  health evidence, every redirect host maps to a probed site, and every
  certificate check is on a site card. `docs/production.md` no longer claims
  the current `rollback.sh` can restore the Astro release (see 1.2). Checks on
  macOS with Node 24.22.3: `npm run check` 0/0, `db:check` clean, `npm test` 28
  passed and 2 PostgreSQL-only skipped, `tests/postgres.sh` 30/30 on Homebrew
  PostgreSQL 18, build, shell and Python syntax, `git diff --check`, `npm audit`
  clean.
- [x] Deploy under `with-deploy-lock` with `deploy/build.sh` and
  `deploy/deploy.sh`; the first scheduled run stores 97 services and 14 projects
  and the overview shows the Field Cadence card.
  Evidence (2026-11-21, on the owner's instruction): `deploy/build.sh` built
  `fefd9ea` on the VM with 30/30 tests including PostgreSQL 18, and CI passed
  on the same commit. `deploy/deploy.sh` from `bf56806` ran 05:02 to 05:04 UTC,
  passed candidate and public smoke and Caddy validation, and recorded the
  deployment (rollback directory `/root/status-rollback-20261121T050258Z`). The
  migration was a no-op with identical every-row digests. Caddy, PostgreSQL and
  three other site services kept their PIDs. The web unit runs `dist/index.js`
  under `--permission` with 0 restarts and only web keys in its environment; the
  web role passed four reads and 13 denials. Readiness `ready` and fresh;
  unknown and operator paths 404, POST 405. The overview shows 14 site cards
  with Field Cadence (page, both certificates and repository operational),
  `/services` lists 97 checks with the ten `www.` certificates, and the
  overview, services and projects pages each measure 375 px wide at 375 px with
  no script. The external probe run from a workstation passed all twelve sites
  plus collector freshness. The first scheduled run (05:09 UTC) stored 97
  services and 14 projects with 0 alerts; every check was operational except the
  root disk at 82% and the backup repository's uncommitted snapshot files.

### 3.6 Retired table server unit

- [x] Stop reporting a unit that was retired on purpose, with a test.
  Evidence (2026-11-21 13:10 UTC, read-only over SSH as root): the overview had
  read `down` since the 06:52 UTC run because of one check, the
  `rivermind-poker.service` unit ("unit is inactive"). RiverMind Poker's own
  deployment at 06:50 UTC moved its tables into the Node server
  (`rivermind-poker-web`) and left the Python unit stopped and disabled, kept
  for rollback only; the web unit names it in `Conflicts=`, so the two never run
  together. The site was healthy throughout: `/healthz` and the table server's
  `/api/config` stayed operational and the external probe passed. Removed the
  unit from the inventory and from the RiverMind Poker card; its `/healthz`,
  `/api/config`, both certificates, the web unit and the repository remain. A
  run now stores 96 services and 14 projects. Test: the inventory no longer
  names the retired unit. Checks on macOS with Node 24.22.3: `npm run check`
  0/0, `db:check` clean, `npm test` 28 passed and 2 PostgreSQL-only skipped,
  `tests/postgres.sh` 30/30 on Homebrew PostgreSQL 18, build, shell and Python
  syntax, `git diff --check`, `npm audit` clean.
- [x] Deploy under `with-deploy-lock` with `deploy/build.sh` and
  `deploy/deploy.sh`; the first scheduled run stores 96 services and the
  overview no longer reads down for the retired unit.
  Evidence (2026-11-21, under the owner's standing request to fix what the
  review finds): `deploy/build.sh` built `cadc299` on the VM with 30/30 tests
  including PostgreSQL 18, and CI passed on the same commit. `deploy/deploy.sh`
  from `fefd9ea` ran 13:14 to 13:15 UTC, passed candidate and public smoke and
  the static cache checks, and recorded the deployment (rollback directory
  `/root/status-rollback-20261121T131405Z`). Caddy and PostgreSQL kept their
  PIDs; the web unit is active with 0 restarts and readiness is `ready` and
  fresh. The deploy's own run (13:14 UTC) and the first scheduled run (13:20
  UTC) each stored 96 services and 14 projects with 0 alerts, all operational,
  including the root disk at 73%. The overview's headline reads all public
  endpoints operational, with no script.

### 3.7 RiverMind Poker's health response

- [x] Read RiverMind Poker's `/healthz` as what it now sends, with a test.
  Evidence (2026-11-21, owner request, on the VM with Node 26.13.1 and pnpm
  12.18.0): `rivermindpoker-com` had read `degraded` on 42 runs since 16:07
  UTC ("expected RiverMind Poker web server health response was missing")
  while the site was healthy. Its deploy at 16:04 UTC moved `/healthz` to the
  host contract's JSON (`status`, `revision`, `database`), and the check still
  required a body of exactly `ok`. The check now requires `status` and
  `database` to be `ok`, as C From The Ground Up's does, so a database problem
  shows as degraded and a bare `ok` no longer passes; the target ID, the probe
  URL and the states are unchanged. `pnpm run check` 0/0, `db:check` clean,
  `pnpm test` 30 passed and 2 PostgreSQL-only skipped, `tests/postgres.sh`
  32/32, build, shell and Python syntax, `git diff --check`.
- [x] Deploy with `deploy/build.sh` and `deploy/deploy.sh`; the next scheduled
  run stores `rivermindpoker-com` as operational.
  Evidence (2026-11-21): `deploy/build.sh` built `f941edc` on the VM with
  32/32 tests including PostgreSQL 18, and CI (Verify and the external public
  probe) passed on the same commit. `deploy/deploy.sh` finished at 20:03 UTC:
  no migration, history digests unchanged, journal 1 of 1, route smoke passed
  on the candidate (port 4400), on 4313 and on the public URL, static cache
  and HSTS checks passed; `web-live` reports `releases/f941edc…` on
  `/opt/node-v26.13.1-linux-x64/bin/node`, state `current`. The deploy's own
  run (20:03:23 UTC) and the first scheduled run (20:08:45 UTC) stored
  `rivermindpoker-com` as operational ("RiverMind Poker web server and
  database health responses are OK") with every other check operational; the
  overview reads "All monitored public endpoints are operational", with no
  script. Caddy and PostgreSQL were not restarted; the web unit is active
  with 0 restarts, `/healthz` reports `f941edc` and `/readyz` is ready.

### 3.8 Third inventory reconciliation

- [x] Reconcile the host again and add what is missing, with tests; say what
  is deployed separately from what a working checkout holds.
  Evidence (2026-11-22, owner request after an outside review of the host, on
  the VM with Node 26.13.1 and pnpm 12.18.0): the review found three running
  units with no check and repository warnings that described checkouts, not
  releases. Added unit checks for `daybyword-web.service` and
  `fieldcadence.service` (both sites left Docker Compose for host units on
  2026-11-21) and `rivermind-poker-voice.service` (RiverMind's table voice,
  live since 2026-11-22 00:35 UTC), each on its site card, and a timer check
  for `caddy-release-check.timer`. Day by Word and Field Cadence are now
  probed through `/healthz`, which must report the app and its database as
  `ok`; their target IDs and public URLs are unchanged. The git probe reads
  each site's `current/REVISION` and names the deployed release in the
  reason beside the working checkout's state, which it never changes; reasons
  say "working checkout" and the probe version is `git-project-v2`. No JSON
  field, state or target ID changed. A trial run as the collector account
  without writing read 104 services and 14 projects: the three new units
  active, both health checks operational, and `daybyword` as "working
  checkout is 26 behind upstream; deployed release ce22517 is the upstream
  tip". `pnpm run check` 0/0, `db:check` clean, `pnpm test` 31 passed and 2
  PostgreSQL-only skipped, `tests/postgres.sh` 33/33, build, shell and Python
  syntax, `git diff --check`. Docs no longer say either site runs in Docker.
- [ ] Deploy with `deploy/build.sh` and `deploy/deploy.sh`; the next scheduled
  run stores 104 services and 14 projects with the three new unit checks
  operational.

## Phase 4 · Final cleanup

The owner's decision of 2026-11-21 (D-12): no rollbacks, and nothing kept from
the stacks before SvelteKit, on the host or in the repositories.

### 4.1 Remove rollback tooling and old releases

- [x] Delete the earlier-framework, PHP and MySQL leftovers and superseded
  deploy snapshots on the host, with the owner's confirmation of the list.
  Evidence (2026-11-21 13:33 UTC, one script under `with-deploy-lock`, explicit
  paths, after checking that no unit, Caddy site, process, pointer file or
  backup configuration named any of them): 81 paths removed. They were the last
  pre-SvelteKit release of this site and four of Azeroth Trail's, the old
  rollback and migration directories for them in root's home, the original PHP
  releases of three sites and four early XrayService releases with their
  pointer files, the retired MySQL data directory (2.4 GB) and its unused
  account, an old incident log folder, every superseded per-deploy snapshot
  (the newest one per site was kept), 1.4 GB of migration rehearsal data and old
  build candidates. Live releases and the releases the kept snapshots name were
  protected by the script. The root disk went from 73% to 68%; no unit failed,
  the external probe passed all twelve sites and the next two collector runs
  stored 96 services, all operational. The encrypted copies of the old MySQL
  dumps in the backup repository were not touched.
- [x] Remove rollback and earlier-stack tooling from this repository.
  Evidence: deleted `deploy/rollback.sh` and the MySQL history transfer tool;
  `deploy/deploy.sh` no longer copies units and settings for a rollback or calls
  one, keeps a root-only record directory (`/root/status-deploy-<time>`) with the
  pre-deployment dump, digests and logs, and on failure removes only its
  temporary units and prints what is live; `deploy/smoke.sh` accepts only the
  SvelteKit stylesheet. README, AGENTS.md and the architecture and production
  docs no longer describe rollback, legacy recovery or the earlier framework,
  and the rollback rehearsal left open in 1.2 is dropped. Completed steps keep
  their evidence as written. Checks on macOS with Node 24.22.3: `npm run check`
  0/0, `db:check` clean, `npm test` 28 passed and 2 PostgreSQL-only skipped,
  `tests/postgres.sh` 30/30 on Homebrew PostgreSQL 18, build, shell and Python
  syntax, `git diff --check`; the new smoke script passed against the live site.

### 4.2 Deploy with the new script

- [x] Deploy under `with-deploy-lock` with the rewritten `deploy/deploy.sh`; it
  completes, leaves a record directory and the site stays operational.
  Evidence (2026-11-21): `deploy/build.sh` built `a8e9b08` on the VM with 30/30
  tests including PostgreSQL 18, and CI passed on the same commit. The rewritten
  `deploy/deploy.sh` ran from `cadc299` between 13:39 and 13:40 UTC: candidate
  and public smoke and the static cache checks passed with the SvelteKit-only
  smoke script, the migration was a no-op, and the deployment was recorded. It
  left `/root/status-deploy-20261121T133937Z` (pre-deployment dump, both
  digests, migration and Caddy logs, the release it replaced), named by
  `/root/status-latest-deploy`; the last old rollback directory and its pointer
  were then deleted. No temporary unit or drop-in was left, the web unit is
  active with 0 restarts, the collector timer is active, readiness is `ready`
  and Caddy and PostgreSQL kept their PIDs. The scheduled runs at 13:46 and
  13:51 UTC each stored 96 services and 14 projects, all operational, and the
  external probe passed all twelve sites.

### 4.3 Other repositories

- [x] Retire rollback tooling in the owner's other clean repositories.
  Evidence (2026-11-21, each on `main` and pushed to its remotes): the backup
  repository lost its host rollback helper and its record of the earlier
  stack, and its docs no longer say the MySQL data is on the host. Azeroth
  Trail, C From The Ground Up, Grace and Footnotes, Imaging Services and
  XrayService each lost their website rollback script; their cutover scripts
  now record what they replace, stop on failure and print what is live.
  XrayService also lost its old Go updater units, and the card bot's runbook
  lost its rollback procedure. Where a repository has tests they pass
  (Imaging Services 20, XrayService 23, Grace and Footnotes 17), and two CI
  failures caused by these edits (a formatting check and a pinned checksum)
  were fixed the same hour. None of those sites was redeployed: no served code
  changed, so each one's next deploy is the first with its new cutover script.
  Lorehallow followed on the owner's go-ahead the same day: its server, client
  and website deploy scripts stop on a failed check and leave the new release
  live, its `make rollback-*` and rehearsal targets are gone, and its decision
  record 0020 says why. Its BUILD.md, docs and web linters and 50 website
  tests pass and CI passed; the three scripts have not been run against the
  host yet. Not changed: the five repositories with other sessions'
  uncommitted work (Day by Word, dunamismax.com, RiverMind Poker, Field
  Cadence, vincentsawyer.org).

## Phase 5 · HSTS

The owner's decision of 2026-11-21 (D-13). A review of the host found this was
the only site on it that sent no `Strict-Transport-Security` header.

### 5.1 Send an HSTS header

- [x] Add the header to the Caddy fragment, with a smoke check.
  Evidence (2026-11-21 14:00 UTC): `deploy/Caddyfile` sets
  `Strict-Transport-Security "max-age=31536000"` in its existing header block,
  so it applies to every response; nothing else in the fragment changed.
  `deploy/smoke.sh` now requires exactly one such header on `/`,
  `/api/status.json` and `/robots.txt` when it runs against the public site.
  Caddy 2.11.9 adapts the fragment with the header in the same deferred handler
  as the other three. Run against the live site before deployment, the new
  smoke passed its route and cache checks and failed only the HSTS assertion,
  as expected; the same assertion passed against another site on the host that
  already sends the value. Checks on macOS with Node 24.22.3: `npm run check`
  0/0, `db:check` clean, `npm test` 28 passed and 2 PostgreSQL-only skipped,
  `tests/postgres.sh` 30/30 on Homebrew PostgreSQL 18, build, shell and Python
  syntax, `git diff --check`, `npm audit` clean.
- [x] Deploy under `with-deploy-lock` with `deploy/build.sh` and
  `deploy/deploy.sh`; the public site sends the header once and every other
  header is unchanged.
  Evidence (2026-11-21): `deploy/build.sh` built `d0b96aa` on the VM with 30/30
  tests including PostgreSQL 18, and CI passed on the same commit. The
  candidate's fragment adapted with the custom Caddy binary and differed from
  the live one by the HSTS line only. `deploy/deploy.sh` ran from `a8e9b08`
  between 14:02 and 14:03 UTC: candidate and public smoke, the static cache
  checks and the new HSTS check passed, the migration was a no-op, Caddy
  validated and the deployment was recorded (`/root/status-deploy-20261121T140200Z`).
  Response headers for `/`, `/api/status.json`, `/robots.txt`, `/icon.svg` and
  `/healthz`, captured before and after, differ only by one added
  `strict-transport-security: max-age=31536000` line on each. Caddy and
  PostgreSQL kept their PIDs, the web unit is active with 0 restarts, the
  collector timer is active, readiness is `ready` and no temporary unit or
  drop-in file was left. The deploy's own run (14:02 UTC) and the first
  scheduled run (14:08 UTC) each stored 96 services and 14 projects with 0
  alerts, all operational. The smoke script also passed from outside the host.

## Phase 6 · Host platform contract

The owner's decision of 2026-11-21 (D-14): every web project on the host uses
one toolchain and one deploy flow. Tooling only; alerting and heartbeat
configuration are left as they are (a separate task).

### 6.1 Move to pnpm and Node 26

- [x] pnpm 12.18.0 and Node 26.13.1 everywhere, dependencies at the baseline.
  Evidence (2026-11-21): `pnpm-lock.yaml` from `pnpm import` (no
  `package-lock.json` or `.npmrc`), `pnpm-workspace.yaml` with `saveExact`,
  `engineStrict`, `allowBuilds` and the `@esbuild-kit` override; Node 26.13.1 in
  `.node-version`, `engines`, CI, both units and `run-command.sh`. Upgraded to
  the baseline: SvelteKit 3.2.0 → 3.4.0, adapter-node 6.0.2 → 6.0.5, Svelte
  5.57.3 → 5.58.1, Vite 8.3.7 → 8.3.8, `pg` 8.16.3 → 8.23.1, `@types/pg` 8.15.6
  → 8.23.1, `@types/node` 24.19.2 → 26.6.6. On the VM with `node-26`: check,
  db:check, `tests/postgres.sh` 30/30, build, shell and Python syntax,
  shellcheck, `git diff --check`; `web-conformance` conforms.
- [x] Fix-forward deploy with a candidate check, and a `/healthz` that proves it.
  Evidence (2026-11-21): `deploy/build.sh` builds `origin/main` from
  `git archive` and assembles the release (production dependencies only,
  `REVISION`); `deploy/deploy.sh` stages, dumps, migrates as the web account
  with only `migration.env` between the history digests, checks a candidate on
  a 4400–4499 port under the new unit, switches, verifies with `web-live`, runs
  one notification-free collection, applies Caddy through `caddy-apply` only
  if the fragment changed and records the deployment. No `/root` records or
  pointer files any more. `/healthz` now answers
  `{"status":"ok","revision":"<commit>","database":"ok"}` after one query (503
  without the database) instead of a plain `ok`; the commit is fixed at build
  time because the public web code has no filesystem access. The settings
  files moved unchanged to `/etc/web-apps/status_dunamismax/app.env` and
  `collector-settings.env`.
- [x] Deploy with the new scripts; the site and the collector run on Node 26.
  Evidence (2026-11-21): the first attempt (`9dbd2a9`, 15:51 UTC) stopped at
  the candidate: under Node 26 `--permission` also denies the network, so the
  candidate could not listen (`ERR_ACCESS_DENIED`). The live release was
  untouched, the migration was a no-op and the paused collector timer was
  resumed by hand. Fixed forward with `--allow-net` (`cd62b9c`, live 15:55 UTC)
  and `--disable-warning=ExperimentalWarning` for the warning that flag logs on
  Node 26 (`980d897`, live 15:57 UTC). Each deploy: `deploy/build.sh` 30/30
  tests including PostgreSQL 18; migration `applied=none`, history digests
  unchanged, journal 1 of 1; candidate on 4400 reported its commit with
  `"database":"ok"` and passed `deploy/smoke.sh`; 4313 and the public smoke
  (static cache and HSTS checks) passed; `web-live` reported
  `/opt/node-v26.13.1-linux-x64/bin/node`, the release and `current`; Caddy
  unchanged; deployment recorded. After `980d897`: the web journal has only
  its start lines; installed units equal the release's; no candidate unit or
  `--no-notify` drop-in left; readiness `ready`. The collector ran on Node 26
  for the deploy (15:57 UTC) and on its timer (16:02 UTC, notifications on,
  heartbeat not configured): 96 services, all operational. The snapshot's
  overall state is degraded only because two other repositories have
  uncommitted work. The old settings files in `/etc/status-dunamismax/` were
  removed after the move (the directory stays for the delivery-test
  settings), as were `/root/status-latest-deploy` and the `previous` files of
  the two earlier deployment records.

## Ideas inbox

Not planned or counted. Triage an idea into a phase, with the owner where it
changes scope, when you pick it up.

- **Drizzle 1.0.** Its `pull --init` baseline would replace the runner's own
  baseline recording; see Q-2.
- **Completion markers for the newer backup jobs.** The C From The Ground Up,
  vincentsawyer.org and Day by Word jobs do not write `/var/lib/ops-success`
  markers, so after a reboot they read unknown until their next run. Adding the
  `ExecStartPost` marker is host work in ubuntu-vm-backup.
- **External probe cadence.** Checked 2026-11-21: `external-probe.yml` asks for
  a run every 30 minutes, but GitHub started only 12 between 2026-11-17 and
  2026-11-20, six to nine hours apart, all passing. `http3-probe.yml` is manual
  only and last ran 2026-10-23. If an outside view within minutes matters, it
  needs a second scheduler, which is an owner decision (it may need an account).
- **Repositories in the attention panel.** The overview's attention list covers
  service checks only; a degraded repository shows only as a chip on its site
  card and on `/projects`, although it counts toward the API's `overall_state`.
- **Root disk.** 70% (82 GB of 124 GB) after the final cleanup on 2026-11-21;
  it warns at 80% and fails at 90%. The largest holder left is
  vincentsawyer.org's shared media in `/srv/www` (25 GB). The daily cleanup job
  removes build candidates only after 14 days, so busy deploy days fill the disk
  again; a shorter window is host work in ubuntu-vm-backup and the owner's call.
- **Field Cadence host evidence.** It has no backup job, no installed jobs
  timer and no health route that touches its database, so the status page can
  only vouch for its static page and certificates. When the project adds them,
  add the units and a health check to the inventory.
- **Backup repository worktree.** Between its snapshot commits the
  ubuntu-vm-backup checkout is dirty (refreshed dumps and completion markers
  not yet committed): 26 of its first 39 project checks on 2026-11-21 read
  degraded for that reason although nothing was wrong. Committing after each
  refresh is host work in ubuntu-vm-backup.

## Handoff log

Newest first. Keep eight.

- **2026-11-22 · Third reconciliation (3.8).** Owner request: fix what an
  outside review of the host found. Three running units had no check:
  `daybyword-web`, `fieldcadence` and `rivermind-poker-voice`; all three are
  checks now, on their site cards, with a timer check for the Caddy release
  comparison. Day by Word and Field Cadence are probed through `/healthz`
  with their database. Repository reasons say "working checkout" and name
  the deployed release separately, read from each release's revision file;
  states, IDs and JSON fields are unchanged. Docs no longer describe either
  site as a Docker workload. All checks pass on Node 26 (31 tests, 33 with
  PostgreSQL). Also done on the host, outside this repository: the backup
  manifest gained the voice unit and a boot check of the recovered voice
  service, and the three checkouts that deploys had left behind were
  fast-forwarded. Next: deploy 3.8, then 2.1, still waiting on the owner's
  healthchecks.io ping URL and Discord webhook URL.
- **2026-11-21 · RiverMind Poker's health check (3.7).** Owner request after
  a host reboot review: the overview had read "some public endpoints are
  degraded" since 16:07 UTC for one check, `rivermindpoker-com`, although the
  site was healthy. RiverMind's `/healthz` has answered the host contract's
  JSON since its 16:04 UTC deploy and the check still wanted a bare `ok`. It
  now requires `status` and `database` to be `ok`. Checks run: `pnpm run
  check`, `db:check`, `pnpm test` (30 passed, 2 skipped), `tests/postgres.sh`
  (32/32), build, shell and Python syntax, `git diff --check`. Noticed and not
  changed: `docs/production.md` and an inventory test comment still say Day by
  Word and Field Cadence run in Docker, and the inventory has no unit check
  for `fieldcadence.service` or `daybyword-web.service`; both sites moved to
  systemd units on 2026-11-21. Deployed `f941edc` at 20:03 UTC; the deploy's
  run and the next scheduled run both stored the check as operational and the
  overview reads all operational (evidence under 3.7). Next action: 2.1 as
  before.
- **2026-11-21 · Alert destinations chosen (2.3).** A host review confirmed
  that nothing off the server reports an outage: no webhook, no heartbeat,
  and the GitHub-hosted probe started 121 runs in 29 days (median gap 5.8
  hours, longest 10.9). The owner chose a healthchecks.io check for the
  heartbeat and a Discord channel webhook for alerts (Q-1). The collector
  gained a Discord message format (`STATUS_ALERT_WEBHOOK_FORMAT=discord`) and
  four checks for the new off-site media backup jobs. All checks pass on Node
  26. Next: 2.1 once the owner supplies the two URLs.
- **2026-11-21 · Host platform contract (6.1).** The owner adopted one
  standard for every web project (D-14). This repository moved to pnpm 12.18.0
  and Node 26.13.1 with baseline pins (SvelteKit, Svelte, Vite, adapter-node,
  `pg` and the type packages upgraded), a contract `/healthz`, and the
  contract's fix-forward deploy with a candidate check. The settings files
  moved to `/etc/web-apps/status_dunamismax/`, content unchanged; alerting and
  heartbeat settings are otherwise untouched. All checks pass on Node 26 and
  `web-conformance` conforms. Deployed as `980d897` after the candidate check
  caught Node 26 denying the network under `--permission` (fixed forward
  with `--allow-net`). Next: alert delivery (2.1) when the owner names
  destinations.
- **2026-11-21 · HSTS (5.1).** The owner approved the header after a host
  review found this the only site without one (D-13, moved out of the ideas
  inbox into Phase 5). The Caddy fragment now sets
  `Strict-Transport-Security: max-age=31536000` and the public smoke requires
  it. All checks pass, including PostgreSQL locally. `d0b96aa` deployed at
  14:02 UTC; every other response header is unchanged and the first scheduled
  run stored 96 services, all operational. Next: alert delivery (2.1) when the
  owner names destinations.
- **2026-11-21 · Final cleanup (Phase 4).** Owner decision D-12: no rollbacks,
  SvelteKit only, and nothing kept from earlier stacks. With the owner's
  confirmation, 81 old paths were deleted on the host (earlier-framework, PHP
  and MySQL releases and data, superseded deploy snapshots; root disk 68%).
  This repository lost its rollback script, MySQL history tool and every doc
  passage about rollback or legacy recovery; the 1.2 rollback rehearsal is
  dropped. `a8e9b08` deployed at 13:39 UTC with the rewritten deploy script and
  every check stayed operational. The backup repository and six other clean
  repositories lost their rollback tooling too, Lorehallow included (4.3).
  Not changed, and open with the owner: the five repositories with other
  sessions' uncommitted work. Next: alert delivery (2.1) when the owner names
  destinations.
- **2026-11-21 · Backup drill (1.2).** The owner asked for the overdue drill.
  The scheduled encrypted backup at 07:41 UTC had already restored and probed
  release `fefd9ea`; `restore check` and `restore applications-verify` run by
  hand at 13:23 UTC passed against the same snapshot, with the recovered release
  serving the API as the restricted web role from a disposable cluster. No code
  or production change. Next: the 1.2 rollback rehearsal, which needs a plan
  for the renamed units first.
- **2026-11-21 · Disk cleanup and 3.6.** The owner approved clearing old build
  candidates and the Docker build cache: the root disk went from 82% to 73% and
  its check is operational (details in the ideas inbox). The follow-up check
  found the overview reading down for `rivermind-poker.service`, which that
  project retired on purpose at 06:50 UTC when its Node server took over the
  tables. Step 3.6 removed the unit from the inventory and the site card;
  `cadc299` deployed at 13:14 UTC and the first scheduled run stored 96
  services, all operational. Next: the 1.2 backup drill, which is now due.
