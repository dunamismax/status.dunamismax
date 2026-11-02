# Build plan

The final stack is Astro + PostgreSQL + Drizzle. Phase 0 is the first unfinished
work; completed implementation history follows it. As of November 2, 2026 the
Drizzle schema, queries, reviewed baseline and owner-only runner are in source and
pass disposable-cluster rehearsals. No production database, deployment, timer or
service has changed; production still applies `database/schema.sql`. Python and
Swift are used only for an actual project need or explicit request. Keep the
working TypeScript collector and existing Python utilities.

### Phase 0 — Align Astro/PostgreSQL with Drizzle (do first)

Retain Astro Node standalone SSR, native PostgreSQL, host systemd deployment and
current UI. Add typed Drizzle schemas, queries and reviewed migrations. This phase
replaces the previous web rewrite plan. Work on main only; no branches/worktrees/PRs.

#### 0.1 Review reality and preserve contracts

- [ ] Read AGENTS, README, architecture/production/migration docs and the current
  VM-owned `/home/sawyer/github/ubuntu-vm-backup/docs/astro-migration.md` plus its
  restore/final integration references. Check local/host commits, current release,
  units, roles, schema, timers, backups and port reservations; do not assume parity.
  - Progress (2026-11-02, read-only as sawyer): docs read. VM checkout clean at
    `1149ae6`, behind local `c5d1175` by documentation-only commits; active release
    `1149ae6` (final-integration.md's `51cb1c1` is now a retained older release).
    Web, collector timer, backup timer and postgresql@18-main active; collector ran
    on schedule; readiness `ready`/`postgresql-ready,collector-snapshot-fresh`;
    loopback 4311–4315 and 5432 listening, 14313 free. **Open:** roles, grants,
    actual `app` catalog and backup contents need root/postgres (no non-interactive
    sudo), so they were not inspected.
- [ ] Run current pinned-runtime checks before implementation. Capture sanitized
  fixtures and private baseline digests/catalog evidence. Keep private snapshots,
  role credentials, env files and raw probe outputs out of source control.
  - Progress: pinned-runtime baseline passed on the VM in a scratch archive of
    `1149ae6` (npm ci, check 0 errors, 16/16 tests with PG 18 integration, build,
    shell/Python syntax). **Open:** private production digests/catalog capture needs root.

| Current source | Work / retained contract |
| --- | --- |
| `package.json`, `package-lock.json`, `astro.config.mjs`, `tsconfig*.json`, `.node-version` | Astro 7.4.2, Node adapter 11.1.9, pg 8.16.3, strict TS 6.0.3, Node 24.22.1/npm 11.19.1. Retain supported pins; add compatible exact Drizzle pins/lock. |
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
- [ ] Introspect a private disposable restore of schema `app`; compare with actual
  catalogs and `database/schema.sql`. Preserve targets, check_runs, rollups,
  incidents, maintenance_windows, deployment_events and alert_notifications.
  Keep `app.schema_migrations` distinct from Drizzle journal/version metadata.
  - Progress: the comparison tool exists (`--adopt-baseline` diffs the structural
    catalog against `drizzle/baseline-catalog.json`); journal is `app.drizzle_migrations`.
    **Open:** run it against a private disposable restore of production (needs root).
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
    Production grant acceptance remains part of 0.4/0.5.
- [ ] Drain owning writers and compare every-column ordered counts/digests for all
  seven history tables before/after adoption; verify catalog triggers/constraints,
  sequences and migration journals separately. Include synthetic nonempty incidents,
  maintenance and alerts, big IDs, JSON types, Unicode and microseconds. Keep all
  reconciliation files private. No MySQL or SQLite conversion is part of this phase.
  - Progress: synthetic digest/sequence/catalog comparison passes in the disposable
    suite. **Open:** production drain + every-row comparison needs root under the lock.

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

- [ ] Keep host units/accounts, collector timer/jitter/cap, private HOME, read-only
  repo ACLs, Node permission restrictions and root-only role env separation. No
  collector Docker group/socket. All subprocesses retain absolute argv/no shell,
  minimal env, deadlines/bounded output and process-group termination; preserve
  TLS/redirect/body limits, TCP connect-only, one-shot/restart/freshness evidence,
  custom Caddy binary and permission=unknown behavior. No repo fetch/pull/reset.
- [ ] Adapt deploy/build.sh, deploy/deploy.sh, rollback, command wrapper and smoke
  for reviewed Drizzle migrations, keeping CANDIDATE EXPECTED_CURRENT, exact-commit
  manifests, release/current and loopback 4313/candidate 14313. Build/test outside
  shared lock. No required Docker/Compose or reverse-proxy migration.
- [ ] All shared roles/schema/units/ACL/Caddy/release/rollback changes run in one VM
  transaction under with-deploy-lock with inherited FD9. Recheck current, back up,
  drain collector/other owning writers, baseline/migrate/reconcile, validate candidate,
  atomic switch and public smoke. Restart only owning service; custom Caddy
  validation/reload as needed. Resume one collector and record deployment without
  notifications during acceptance. Alert tests only use mock/loopback/safety flags.
- [ ] Rehearse failure/rollback using current PG data and a compatible retained Astro
  release. Preserve writes made after activation and alert sent/dedup/recovery state;
  never restore an old dump over newer history. Require a lossless reverse adapter
  before any incompatible schema change. Do not restart retired PHP/MySQL services.
- [ ] Preserve native loopback-only PostgreSQL, nightly pg_dump/role/ACL/config
  backups, encrypted off-host dual copies and isolated full restore. Update shared
  ubuntu-vm-backup/Toolworks interfaces only where migration metadata demands it;
  verify restored Astro runtime and restricted roles, not just dump success.
- [ ] Keep host Caddy paths/custom modules/TLS, Cloudflare Full (strict) when proxied,
  and existing route headers. Any DNS challenge/plugin/token work stays in the
  host-owned transaction with scoped Caddy-only credentials. No unrelated site edit
  or shared service restart; no R2/Litestream requirement for this PostgreSQL plan.

#### 0.5 Acceptance and final documentation

- [ ] Run npm ci, npm run check, npm test, bash tests/postgres.sh, npm run build,
  shell syntax/Python compile and git diff --check with the pinned runtime. Extend
  CI/Makefile for Drizzle fresh/adoption/no-op tests in disposable no-TCP PG only.
- [ ] Verify route/API/static/header parity, escaping, auth-before-query, DB outage
  redaction, no-script mobile/light/dark/keyboard UI, stale/missing/fresh transitions
  without rebuild, lossless times/IDs, import graph and environment/file isolation.
  Test actual denials and future-table grants, not only ORM query conventions.
- [ ] Verify collector timer/freshness, failure/recovery confirmation, advisory lock,
  repeat/caps/sent evidence and retention. Keep real webhook delivery unconfigured.
  Rehearse failed activation, later-write rollback and encrypted off-host restore.
- [ ] Replace active raw-schema application with tested Drizzle commands only after
  parity. Keep historical recovery tooling/resources. Update all docs/AGENTS/scripts/
  CI in the same change, record actual evidence and limitations, commit to main and
  push origin main; verify both GitHub/Codeberg tips. Mark Phase 0 complete only
  after all gates pass; later work follows Astro/PostgreSQL and conditional tools.

References (refresh for implementation pins):
[Astro Node](https://docs.astro.build/en/guides/integrations-guide/node/),
[Astro endpoints](https://docs.astro.build/en/guides/endpoints/),
[Drizzle node-postgres](https://orm.drizzle.team/docs/get-started-postgresql),
[Drizzle baseline/introspection](https://orm.drizzle.team/docs/drizzle-kit-pull).

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
