# Dunamis Status build plan

This file is the plan, the record of where work stands and the evidence for
every finished step. Start with **Now**. Read [AGENTS.md](AGENTS.md) before
changing the code or the live service.

The collector parses this file for the public `/projects` page, so its layout is
a contract: see [Format contract](#format-contract).

## Now

| | |
| --- | --- |
| **Current phase** | [Phase 1 · SvelteKit 3, Svelte 5 and Tailwind CSS 4](#phase-1--sveltekit-3-svelte-5-and-tailwind-css-4): deployed, two acceptance steps open |
| **Next step** | **1.2** encrypted backup and restore drill of the SvelteKit release, due with the scheduled ubuntu-vm-backup run on 2026-11-21 07:35 UTC; then **1.2** rollback rehearsal to the last Astro release and roll forward. After Phase 1, **2.1** waits on the owner (Q-1). |
| **In progress** | None. |
| **Blockers** | None. The drill waits on its schedule; Phase 2 waits on owner-approved destinations. |
| **Live site** | https://status.dunamismax.com serves SvelteKit release `8c72b37`, deployed 2026-11-20 13:45 UTC over Astro `cc3fc21` (rollback directory `/root/status-astro-rollback-20261120T134532Z`). The first scheduled collector run after it stored 56 services and 6 projects with no alerts. No alert webhook or heartbeat is configured. |
| **`main`** | `2d7199b` recorded the cutover. `1da4095` then moved the host names off `astro-` (units, `/opt/node-runtime`, `/etc/web-apps`, settings files, candidate and rollback directories, the `web-platform.md` runbook) and added five application units to the inventory; this file does not record whether it is deployed, so check `current` on the VM before relying on either. `main` pushes to GitHub and Codeberg together. |
| **Last updated** | 2026-11-20 |

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
| D-6 | **Hosting** stays on ubuntu-vm under systemd: immutable releases in `/srv/www/status.dunamismax.com/releases/<commit>` with an atomic `current`, web on 127.0.0.1:4313, candidates on 127.0.0.1:14313. Units are `status-dunamismax.service` and `status-dunamismax-collector.{timer,service}`, on the shared runtime `/opt/node-runtime`, with role env in `/etc/web-apps/status_dunamismax/` and settings in `/etc/status-dunamismax/` (renamed from the `astro-` host names in `1da4095`). No Compose or container migration. |
| D-7 | **Caddy and DNS.** DNS is owner-managed, DNS-only Cloudflare records pointing at the server; Caddy obtains its own Let's Encrypt certificates with the custom binary `/usr/local/lib/caddy/caddy`. There is no Cloudflare DNS challenge, plugin, token or proxy work, and agents never change Cloudflare settings. |
| D-8 | **Conditional additions.** Hydration, form actions, remote functions or shadcn-svelte need a concrete interactive feature plus a CSP and smoke review. Better Auth only for requested accounts, the Vercel AI SDK only for a needed LLM feature, Swift only for a requested Apple client (which would call the HTTPS APIs), Python with uv and ruff only where it is the right tool. None is needed now. |
| D-9 | **Privacy.** The source stays private. Public routes never show private paths, arguments, environment values, credentials, topology, database names, logs or stack traces. |
| D-10 | **History.** Check rows expire after 30 days by default; rollups, incidents, maintenance, deployments and alert history are kept indefinitely, with their original IDs and timestamps. Incidents and maintenance are written by the operator in SQL. |
| D-11 | **Alert semantics.** Two matching observations within 20 minutes confirm a failure or a recovery; 60-minute repeat window; at most five deliveries per run; a delivered failure gets one confirmed recovery. Alerts are tested only against mock or loopback endpoints, or with `--dry-run` or `--no-notify`. |

## Open questions

Use each default until the owner decides otherwise.

| ID | Question | Default until decided | Needed by |
| --- | --- | --- | --- |
| Q-1 | Where do failure alerts and the heartbeat go? | Leave `STATUS_ALERT_WEBHOOK_URL` and `STATUS_HEARTBEAT_URL` unset. Only the owner supplies and approves destinations, test ones first. | 2.1 |
| Q-2 | When should Drizzle move to 1.0? | Stay on ORM 0.45.4 and Kit 0.31.11 until 1.0 is stable and at least ten days old. Rehearse the upgrade, including its baseline mechanism, in the disposable cluster before production. | — |
| Q-3 | Should incidents and maintenance get an authoring tool? | No. Operator SQL under the deploy lock. If one is added, it is an owner-run CLI on the writer side, never a web route. | — |

## Phase overview

| Phase | What | State |
| --- | --- | --- |
| Baseline | PHP and MySQL to Astro, strict TypeScript and PostgreSQL | Complete 2026-10-22 |
| 0 | Drizzle ORM adopts the existing PostgreSQL history | Complete 2026-11-02 |
| 1 | Web layer to SvelteKit 3, Svelte 5 and Tailwind CSS 4 | Deployed 2026-11-20; two acceptance steps open |
| 2 | Live alert delivery and heartbeat | Waiting on the owner (Q-1) |

## Baseline · PHP and MySQL to Astro and PostgreSQL

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
to the live database without rebuilding its history, keeping the then-current
Astro Node server, native PostgreSQL, host systemd deployment and UI. The text
records the Astro-era decisions as they were made; Phase 1 replaced only the web
framework choices in 0.3. The file-by-file plan for the Astro-era sources is in
this file's history (`2d7199b`).

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

Replace Astro 7 with SvelteKit (adapter-node) and the hand-written stylesheet
pipeline with Tailwind CSS 4, keeping PostgreSQL and Drizzle, the collector,
roles, units, Caddy and every public contract from 0.1. Deployed 2026-11-20.
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
- [ ] Rehearse rollback to the last Astro release (unit and fragment restored
  from the backup; the new smoke passes against it), then roll forward, keeping
  every write made in between.
  Remaining: since `1da4095`, `rollback.sh` accepts only `/root/status-rollback-*`
  directories and installs the renamed units, while the cutover's directory is
  `/root/status-astro-rollback-20261120T134532Z` with the `astro-` unit files.
  Plan the rehearsal for that difference before running it.
- [x] Verify the no-script UI and unchanged icon and robots bytes.
  Evidence: icon and robots SHA-256 identical before and after; computed styles
  of all 147 overview elements and their `::before` markers match the Astro
  stylesheet in light and dark at 1280 px and 375 px (same markup and classes, so
  focus styles and the skip link are unchanged).
- [ ] Encrypted backup and restore drill (`bin/backup`, `restore
  applications-verify`) serving the SvelteKit release with its restricted web
  role; first due with the scheduled ubuntu-vm-backup run on 2026-11-21 07:35 UTC.

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
  under the same names in `/etc/status-dunamismax/collector.env` (root,
  0600) and nowhere else. The next scheduled run logs `heartbeat=sent` and the
  receiver shows a recent ping.
- [ ] README, `docs/production.md` and **Now** no longer say delivery is
  unconfigured, and record which variables are set (never their values).

## Ideas inbox

Not planned or counted. Triage an idea into a phase, with the owner where it
changes scope, when you pick it up.

- **Drizzle 1.0.** Its `pull --init` baseline would replace the runner's own
  baseline recording; see Q-2.
- **Host records.** The host's `final-integration.md` listed an older status
  release (`51cb1c1`) at Phase 0; check it names the current release, and fix it
  in ubuntu-vm-backup if not.
- **External probe evidence.** GitHub schedules are best effort. Check that
  `external-probe.yml` and `http3-probe.yml` actually run, and note gaps here.

## Handoff log

Newest first. Keep eight.

- **2026-11-20 · Documentation.** README, BUILD.md and AGENTS.md rewritten around
  the live SvelteKit service: BUILD.md gained **Now**, the format contract,
  settled decisions, open questions, Phase 2 (alert delivery, owner gated) and
  this log, with every earlier step and its evidence kept, and the host names
  from `1da4095`. No code or production change. Next: the 1.2 backup drill after 2026-11-21 07:35 UTC.
- **2026-11-20 · Host rename (`1da4095`).** Units, runtime, settings, candidate
  and rollback paths moved off the `astro-` names, CI's runtime wrapper became
  `node-runtime`, and the inventory gained five application units. Deployment
  state not recorded here.
- **2026-11-20 · Phase 1 cutover.** `8c72b37` deployed over Astro `cc3fc21` at
  13:45 UTC under the deploy lock and recorded in `2d7199b`. Open: the rollback
  rehearsal and the first backup drill.
- **2026-11-02 · Phase 0 complete.** Drizzle baseline adopted by `5fb1713` with
  byte-identical digests; `50da380` fixed the journal probe and is the active
  release. Evidence in [docs/migration.md](docs/migration.md).
- **2026-10-22 · Baseline.** PHP and MySQL replaced by Astro, strict TypeScript
  and PostgreSQL, with every history row reconciled.
