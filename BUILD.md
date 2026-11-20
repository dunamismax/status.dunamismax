# Build plan

The final stack is SvelteKit 3 · Svelte 5 · TypeScript · Tailwind CSS 4 ·
PostgreSQL 18 + Drizzle ORM · Node (adapter-node) · Caddy. Phase 0 is complete
(November 2, 2026): production adopted the Drizzle baseline and deployment applies
reviewed migrations through the owner-only runner. Phase 1 moves the web layer from
Astro to SvelteKit; its source work is done and its production cutover is open.
Phase 0 text below records the Astro-era decisions as they were made; Phase 1
supersedes its web-framework choices (0.3) only. Python and Swift are used only for
an actual project need or explicit request. Keep the working TypeScript collector
and existing Python utilities.

### Phase 0 — Align Astro/PostgreSQL with Drizzle (complete)

Retain Astro Node standalone SSR, native PostgreSQL, host systemd deployment and
current UI. Add typed Drizzle schemas, queries and reviewed migrations. This phase
replaces the previous web rewrite plan. Work on main only; no branches/worktrees/PRs.

#### 0.1 Review reality and preserve contracts

- [x] Read AGENTS, README, architecture/production/migration docs and the current
  VM-owned `/home/sawyer/github/ubuntu-vm-backup/docs/astro-migration.md` plus its
  restore/final integration references. Check local/host commits, current release,
  units, roles, schema, timers, backups and port reservations; do not assume parity.
  - Progress (2026-11-02, read-only as sawyer): docs read. VM checkout clean at
    `1149ae6`, behind local `c5d1175` by documentation-only commits; active release
    `1149ae6` (final-integration.md's `51cb1c1` is now a retained older release).
    Web, collector timer, backup timer and postgresql@18-main active; collector ran
    on schedule; readiness `ready`/`postgresql-ready,collector-snapshot-fresh`;
    loopback 4311–4315 and 5432 listening, 14313 free. As root: four status roles
    match the contract (NOLOGIN owner; NOINHERIT migration login with SET-only owner
    membership; web/collector without membership), HBA loopback SCRAM per role,
    database/schema owned by the owner, web SELECT on exactly four tables, collector
    revoked from `schema_migrations`, no web default ACLs; status backup succeeded
    at 06:32 UTC.
- [x] Run current pinned-runtime checks before implementation. Capture sanitized
  fixtures and private baseline digests/catalog evidence. Keep private snapshots,
  role credentials, env files and raw probe outputs out of source control.
  - Progress: pinned-runtime baseline passed on the VM in a scratch archive of
    `1149ae6` (npm ci, check 0 errors, 16/16 tests with PG 18 integration, build,
    shell/Python syntax). Private every-row digests, catalog diffs and safety dumps are
    in root-only `/root/status-astro-rollback-*` and `/root/status-phase0-evidence/`.

| Current source | Work / retained contract |
| --- | --- |
| `package.json`, `package-lock.json`, `astro.config.mjs`, `tsconfig*.json`, `.node-version` | Astro 7.4.2, Node adapter 11.1.9, pg 8.16.3, strict TS 6.0.3, Node 24.22.3/npm 11.19.1. Retain supported pins; add compatible exact Drizzle pins/lock. |
| `src/pages/[...path].ts`, `src/lib/web.ts` | Retain SSR renderer/dispatch, semantic responsive HTML, no browser JS, current CSS/CSP and no-store responses. No React rewrite required. |
| `src/lib/{db,source,model,config}.ts` | Wrap existing pg pool with Drizzle, retain Source interface, lossless parsers, settings, freshness/state semantics. |
| `database/schema.sql` | Seven historical tables plus schema bookkeeping, explicit grants, triggers, identities/checks/indexes; adopt as reviewed Drizzle migration baseline. |
| `src/collector/{inventory,command,probes,alerts,writer,cli}.ts` | Keep TypeScript host probes/CLI; adapt persistence without changing bounded execution, alerting or retention. |
| `scripts/history.ts`, `deploy/history-transfer.py` | Preserve every-row fingerprints and legacy recovery tooling; do not reimport MySQL or move data to another engine. |
| `tests/{core,database}.test.ts`, fixtures, `tests/postgres.sh` | Extend compatibility and private disposable PostgreSQL integration for Drizzle. |
| `deploy/`, Makefile, CI, `scripts/verify-permissions.ts` | Adapt schema runner and permission acceptance; retain deployment/rollback/backup/public-probe interfaces. |

Preserve all routes: `/`, `/services`, `/projects`, `/incidents`, `/deployments`,
`/operator`, `/healthz`, `/readyz`, `/api/status.json`, `/api/incidents.json` and
all three static files. Preserve GET/HEAD, empty HEAD, 405/Allow for other methods,
404 unknown/private paths, safe escaping/URLs, redacted 503/Retry-After, static bytes
and cache headers. Operator remains unset-token 404, invalid bearer 401 before DB
reads, valid bearer/noindex with deliberate private metadata only. No new accounts.
Health returns `ok` without querying DB; readiness retains degraded/200 and exact
status/dependencies/database fields, including `postgresql-*` labels.

Preserve API fields/states/IDs, service-only summary and overview counts, combined
API service/project rollup, time/ID ordering, latest 25 incidents/maintenance and
50 deployments, maintenance's 30-day filter, 15-minute stale boundary, UTC API
and fixed UTC-05:00 EST display. Never invent uptime or conceal unknown evidence.

#### 0.2 Adopt Drizzle without rebuilding PostgreSQL history

- [x] Refresh official docs for compatible Drizzle ORM/Kit and pg APIs. Pin exact
  versions with npm lock/ci; retain shared Node/npm unless a demonstrated need
  requires an isolated, documented change. Keep strict/noUncheckedIndexedAccess/
  exactOptionalPropertyTypes in both web and collector configurations.
  - Done: drizzle-orm 0.45.4 and drizzle-kit 0.31.11 (latest stable; 1.0 is RC), exact
    pins in package-lock; Kit's deprecated `@esbuild-kit` esbuild is overridden to the
    tree's 0.25.12 so `npm audit --audit-level=moderate` stays clean. Shared Node/npm kept.
- [x] Add TypeScript `src/db/` schema, `drizzle.config.ts`, reviewed SQL and metadata
  under `drizzle/`, generation/check/migration scripts and an explicit owner-only
  runner. No production schema push and no migration on web/collector startup.
  - Done: `src/db/schema.ts`, `drizzle.config.ts`, `drizzle/0000_baseline.sql` + Kit
    metadata, `drizzle/baseline-catalog.json`, `src/db/{migrate,catalog}.ts`; scripts
    `db:generate`, `db:check` (Kit check + drift gate, in Makefile/CI), `db:migrate`.
- [x] Introspect a private disposable restore of schema `app`; compare with actual
  catalogs and `database/schema.sql`. Preserve targets, check_runs, rollups,
  incidents, maintenance_windows, deployment_events and alert_notifications.
  Keep `app.schema_migrations` distinct from Drizzle journal/version metadata.
  - Done: a private no-TCP restore of production first **refused** adoption because
    pg_dump/pg_restore re-parses the six CHECK constraints into an equivalent text form
    (the live catalog has the original form). Catalog comparison now uses the restored
    fixpoint form and the suite adopts a dump/restore copy. Re-run: adopted with
    identical every-row digests and sequences, repeat no-op; journal is owner-only
    `app.drizzle_migrations`, distinct from `app.schema_migrations`.
- [x] Rehearse a fresh empty install and adoption of an existing verified matching
  schema without recreating/truncating/reimporting tables. Confirm pinned Kit's
  baseline mechanism (documented pull --init can write bookkeeping). Apply only
  verified baseline entries under migration credentials; repeat migrate as a no-op.
  - Done in disposable PG 18: fresh install, refusal without `--adopt-baseline`,
    catalog-gated adoption of a nonempty legacy `schema.sql` database with unchanged
    every-row digests/sequences, repeat no-op, refused re-adoption, refused drifted
    schema. Pinned Kit 0.31.11 has no `pull --init` (1.0-beta only); the runner records
    the baseline itself in Drizzle's hash/timestamp format.
- [x] Preserve bigint identity IDs/next sequence values, timestamptz(6)/microseconds,
  JSONB types/order semantics, Unicode/nulls, constraints, FKs/cascade, indexes,
  defaults and updated-at triggers. Use lossless driver/Drizzle mappings: no unsafe
  JS Number IDs or Date truncation. Keep hand-reviewed SQL for unsupported DDL.
  - Done: string-mode timestamptz(6), `BigInt` IDs (tested past 2^53 through the
    sequence), JSONB `$type`s; grants/triggers/bookkeeping hand-reviewed SQL.
- [x] Adapt PostgresSource to Drizzle over the existing pg pool while retaining
  Source behavior, max-3 pool and bounded connection/query timeouts. Port collector
  persistence/transactions with Drizzle or parameterized SQL for cursor/advisory
  operations; retain atomic snapshot/check writes, dedup and lock scope. Ensure
  transaction callbacks use one connection, never a different pool query.
  - Done: source/writer on the query builder; writes use `transaction()` on the
    caller's single client; advisory lock and history cursors stay parameterized SQL.
- [x] Preserve NOLOGIN owner plus independent migration/web/collector logins.
  Runner explicitly SET ROLEs owner. Web SELECT remains exactly four permitted
  models; no sequences/private tables/journals/writes/DDL or owner/writer membership.
  Future tables get no default web access; collector cannot alter/read migration
  bookkeeping. Verify actual grants with read-only default disabled.
  - Done in disposable PG 18: runner `SET LOCAL ROLE`s owner and fails closed on
    access violations; tests prove actual 42501 denials (future table, both journals,
    private tables, writes, sequences, SET ROLE) with read-only default off.
    Production: same policy check passes; web role passed four reads and 13 denials.
- [x] Drain owning writers and compare every-column ordered counts/digests for all
  seven history tables before/after adoption; verify catalog triggers/constraints,
  sequences and migration journals separately. Include synthetic nonempty incidents,
  maintenance and alerts, big IDs, JSON types, Unicode and microseconds. Keep all
  reconciliation files private. No MySQL or SQLite conversion is part of this phase.
  - Done: synthetic nonempty cases pass in the disposable suite. Production adoption
    (deploy `5fb1713`, collector drained under the lock) recorded only `0000_baseline`;
    pre/post digests for 60 targets, 315,862 checks, 20,327 rollups, 78 deployments and
    the empty incident/maintenance/alert tables plus sequences were byte-identical.

#### 0.3 Keep only needed stack components

- [x] Keep Astro output server with @astrojs/node standalone, src/pages endpoints
  and server-only src/lib. This live DB-backed observer is not a static export.
  Retain vanilla CSS/no-script semantics. React islands/Tailwind/shadcn are optional
  for a concrete interactive need, not dependencies to install for uniformity.
- [x] Keep bearer-only operator access and read-only web. Better Auth with PG is
  conditional on requested user accounts; AI SDK inside Astro endpoints on needed
  LLM features. Astro Actions are for future forms/server mutations only when
  requested; never add a public restart/deploy/shell surface. Future clients use
  HTTPS APIs, never direct server database access.
- [x] Keep the host TypeScript collector and useful existing Python recovery/probe
  scripts. Do not port working code to Python merely because it has no UI. If
  Python work is actually needed/requested, use uv/locked dependencies and ruff,
  adding Typer/httpx/Pydantic only where useful and systemd timers for schedules.
- [x] No native app exists or is needed now. If Apple native work is requested,
  use Swift/SwiftUI, record Swift/minimum OS pins and working xcodebuild/tests,
  prefer @Observable where supported and choose SwiftData/GRDB only as needed.
  No mandatory Python/Swift project or language template files in this repo.

#### 0.4 Retain safe systemd deployment and recovery

- [x] Keep host units/accounts, collector timer/jitter/cap, private HOME, read-only
  repo ACLs, Node permission restrictions and root-only role env separation. No
  collector Docker group/socket. All subprocesses retain absolute argv/no shell,
  minimal env, deadlines/bounded output and process-group termination; preserve
  TLS/redirect/body limits, TCP connect-only, one-shot/restart/freshness evidence,
  custom Caddy binary and permission=unknown behavior. No repo fetch/pull/reset.
  - Verified: units/accounts unchanged; web runs as `status-dunamismax-web` with
    `--permission` and only web role env; collector as `status-dunamismax` with only
    its role files (deploy asserts no docker group). Probe code is unchanged.
- [x] Adapt deploy/build.sh, deploy/deploy.sh, rollback, command wrapper and smoke
  for reviewed Drizzle migrations, keeping CANDIDATE EXPECTED_CURRENT, exact-commit
  manifests, release/current and loopback 4313/candidate 14313. Build/test outside
  shared lock. No required Docker/Compose or reverse-proxy migration.
  - Done: `deploy.sh` replaces raw `schema.sql` with the runner (adoption only when
    the journal is absent, probed via pg_catalog), plus pre/post digests that must
    match on no-op runs. build/rollback/run-command/smoke interfaces are unchanged.
    The first adoption exposed a journal probe the NOINHERIT login could not run
    (fell through to the correct adoption); fixed in `50da380` and redeployed.
- [x] All shared roles/schema/units/ACL/Caddy/release/rollback changes run in one VM
  transaction under with-deploy-lock with inherited FD9. Recheck current, back up,
  drain collector/other owning writers, baseline/migrate/reconcile, validate candidate,
  atomic switch and public smoke. Restart only owning service; custom Caddy
  validation/reload as needed. Resume one collector and record deployment without
  notifications during acceptance. Alert tests only use mock/loopback/safety flags.
  - Done: deploys of `5fb1713` (adoption), `50da380` (no-op) and its roll-forward each
    ran in one with-deploy-lock transaction: candidate smoke on 14313, atomic switch,
    custom-Caddy validation/reload, public smoke, `--no-notify` collector, recorded
    deployment. Static bytes and non-ETag headers unchanged; shared service PIDs
    unchanged except a concurrent, lock-serialized dunamismax.com deployment by
    another session.
- [x] Rehearse failure/rollback using current PG data and a compatible retained Astro
  release. Preserve writes made after activation and alert sent/dedup/recovery state;
  never restore an old dump over newer history. Require a lossless reverse adapter
  before any incompatible schema change. Do not restart retired PHP/MySQL services.
  - Done: the production-restore rehearsal served byte-identical HTML/API from
    pre-Drizzle `1149ae6` and the new build on adopted data. Live: `rollback.sh` restored
    `1149ae6`, whose collector wrote rollup 44035 on the adopted database; roll-forward
    kept it and every deployment row. No alert rows exist (webhook unconfigured).
- [x] Preserve native loopback-only PostgreSQL, nightly pg_dump/role/ACL/config
  backups, encrypted off-host dual copies and isolated full restore. Update shared
  ubuntu-vm-backup/Toolworks interfaces only where migration metadata demands it;
  verify restored Astro runtime and restricted roles, not just dump success.
  - Done: status site backup (isolated restore) succeeded; host `bin/backup --push`
    snapshot `3d1d352` on both remotes; `restore check` decrypted 95 files, 0 failures;
    `postgres-verify` restored all 7 databases with owners/ACL replay;
    `applications-verify` reinstalled `50da380` with locked dependencies and served
    HTTP 200 from restored PG. No shared backup/Toolworks interface change was needed.
- [x] Keep host Caddy paths/custom modules/TLS and existing route headers. DNS is
  owner-managed DNS-only Cloudflare records pointing at the server; Caddy obtains
  its own Let's Encrypt certificates (no Cloudflare DNS challenge, plugin or
  token is part of the stack). No unrelated site edit
  or shared service restart; no R2/Litestream requirement for this PostgreSQL plan.
  - Verified: the unchanged status fragment validated with the custom binary and
    reloaded; Caddy MainPID unchanged; static cache headers pass without duplicates.

#### 0.5 Acceptance and final documentation

- [x] Run npm ci, npm run check, npm test, bash tests/postgres.sh, npm run build,
  shell syntax/Python compile and git diff --check with the pinned runtime. Extend
  CI/Makefile for Drizzle fresh/adoption/no-op tests in disposable no-TCP PG only.
  - Done on the VM pinned runtime and in CI (`db:check` added; 17/17 tests).
- [x] Verify route/API/static/header parity, escaping, auth-before-query, DB outage
  redaction, no-script mobile/light/dark/keyboard UI, stale/missing/fresh transitions
  without rebuild, lossless times/IDs, import graph and environment/file isolation.
  Test actual denials and future-table grants, not only ORM query conventions.
  - Done: old/new releases returned byte-identical bodies and headers for every HTML,
    API, readiness and operator route on the same data, so the no-script UI is unchanged.
    Escaping, auth-before-query, outage redaction and freshness remain covered by tests;
    production web role passed four reads and 13 real denials; private paths 404,
    other methods 405 with `Allow: GET, HEAD`.
- [x] Verify collector timer/freshness, failure/recovery confirmation, advisory lock,
  repeat/caps/sent evidence and retention. Keep real webhook delivery unconfigured.
  Rehearse failed activation, later-write rollback and encrypted off-host restore.
  - Done: scheduled 20:26 UTC run on `50da380` stored an operational snapshot (48
    services, 6 projects), sent 0 alerts and pruned 32 expired checks; readiness fresh.
    Confirmation/repeat/caps/sent/advisory-lock behavior is covered by the disposable
    suite against the Drizzle writer; webhook stays unconfigured. Injected failed
    activation (candidate port occupied by a loopback 404 listener) aborted at candidate
    smoke and the ERR trap restored `50da380` automatically with no deployment row.
    Later-write rollback and encrypted restore are recorded in 0.4.
- [x] Replace active raw-schema application with tested Drizzle commands only after
  parity. Keep historical recovery tooling/resources. Update all docs/AGENTS/scripts/
  CI in the same change, record actual evidence and limitations, commit to main and
  push origin main; verify both GitHub/Codeberg tips. Mark Phase 0 complete only
  after all gates pass; later work follows Astro/PostgreSQL and conditional tools.
  - Done: `deploy.sh` uses the runner; `database/schema.sql`, history transfer and
    legacy tooling are retained for old releases/recovery. Evidence and limitations
    are in docs/migration.md. Active release `50da380`; both remote tips verified.

References (refresh for implementation pins):
[Astro Node](https://docs.astro.build/en/guides/integrations-guide/node/),
[Astro endpoints](https://docs.astro.build/en/guides/endpoints/),
[Drizzle node-postgres](https://orm.drizzle.team/docs/get-started-postgresql),
[Drizzle baseline/introspection](https://orm.drizzle.team/docs/drizzle-kit-pull).

### Phase 1 — Move the web layer to SvelteKit 3 + Svelte 5 + Tailwind CSS 4

Replace Astro 7 with SvelteKit (adapter-node) and the hand-written stylesheet
pipeline with Tailwind CSS 4, keeping PostgreSQL/Drizzle, the collector, roles,
units, Caddy and every public contract from Phase 0.1. Work on main only.

#### 1.1 Source migration

- [x] Pin the stack with exact versions at least ten days old (2026-11-20): @sveltejs/kit
  3.2.0, @sveltejs/adapter-node 6.0.2, @sveltejs/vite-plugin-svelte 7.3.1, svelte
  5.57.3, vite 8.3.7, tailwindcss + @tailwindcss/vite 4.3.5, svelte-check 4.7.8;
  TypeScript 6.0.3, pg, Drizzle and Node 24.22.3/npm 11.19.1 unchanged. All
  framework packages are devDependencies (adapter-node bundles them); runtime
  `dependencies` stay pg and drizzle-orm. Follow the SvelteKit 3 migration guide:
  config in the `sveltekit()` Vite plugin, `$app/tsconfig`, `#lib/*` subpath imports.
- [x] Port the single Astro catch-all endpoint to routes: Svelte 5 pages with
  `+page.server.ts` loads, `+server.ts` for health/readiness/JSON, `+error.svelte`
  for 404/503, and `hooks.server.ts` for the 405 gate, operator 401 before data
  access, empty HEAD, security headers, Retry-After and noindex. Every page sets
  `csr = false`; `dist/client` holds no JavaScript.
  - Done: on identical fixture data every HTML route matches the Astro renderer
    except the stylesheet URL, whitespace and literal `>` in escaped text; API and
    readiness bodies are byte-identical. Trailing-slash page URLs now 308 to the
    canonical path (they were 404).
- [x] Move `public/` to `static/`; rebuild `status.css` as `src/app.css` on Tailwind
  CSS 4 (palette `@theme` tokens, original component rules in the components layer,
  no preflight, explicit utility sources). The stylesheet is now a content-hashed
  `/_app/immutable/assets/*.css`; Caddy keeps its icon/robots policies and leaves
  adapter-node's immutable header alone.
- [x] Keep `npm test` self-contained: it builds, then drives the built server
  instance in-process with injected storage. Add tests for no client JS/inline
  style/hydration markers, header policy, escaping and the import graph over all
  routes/components.
  - Done on macOS with the pinned runtime: `npm run check` 0 errors/warnings,
    `npm run db:check` clean, `npm test` 21 passed + 2 PostgreSQL-only skipped,
    `npm run build`, shell syntax and Python compile. A disposable Homebrew PG 18
    (UTC) cluster ran the PostgreSQL suite 22/23; the remaining test calls the
    Linux-only `/usr/lib/postgresql/18/bin/pg_dump`. The built server then ran under
    `node --permission` as the restricted web role against that data and passed
    `deploy/smoke.sh`.
- [x] Adapt deploy files: unit entry `dist/index.js` plus `ORIGIN`, deploy's
  candidate check, the Caddy fragment and a smoke test that recognises either
  stylesheet so it can also validate an Astro rollback target. Unit, account, port,
  env-file and host-runtime names stay as they are.

#### 1.2 Production cutover

- [ ] On the VM, `deploy/build.sh` an exact candidate with the pinned runtime,
  including `bash tests/postgres.sh` (full 23/23 with Linux pg_dump) in CI and there.
- [ ] Before deploying, check the shared ubuntu-vm-backup `applications-verify` and
  any other host tooling for the Astro entry path `dist/server/entry.mjs` or
  `/assets/status.css`; update those consumers in their own repository first.
- [ ] Deploy under with-deploy-lock: candidate smoke on 14313, atomic switch,
  custom-Caddy validation/reload of the new fragment, public smoke (immutable
  stylesheet header, no duplicates), `--no-notify` collector run, recorded deployment.
- [ ] Rehearse rollback to the last Astro release (unit and fragment restored from
  the backup; the new smoke passes against it) and roll forward, keeping later writes.
- [ ] Verify the no-script UI in light/dark, mobile and keyboard use on production,
  unchanged icon/robots bytes, and an encrypted backup/restore drill that serves the
  SvelteKit release with its restricted web role.

References: [SvelteKit 3 migration](https://svelte.dev/docs/kit/migrating-to-sveltekit-3),
[adapter-node](https://svelte.dev/docs/kit/adapter-node),
[Tailwind CSS preflight](https://tailwindcss.com/docs/preflight).

### Previous implementation and verification — completed historical baseline


Astro + strict TypeScript + PostgreSQL migration, October 22, 2026.

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

See docs/migration.md for completed acceptance results. Rollups remain retained
indefinitely; richer incident/maintenance authoring remains an operator SQL task.
