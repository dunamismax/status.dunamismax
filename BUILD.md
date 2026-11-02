# Build plan

Phase 0 is the first unfinished work and precedes all retained implementation
history below. The November 2, 2026 planning change updates documentation only;
no application, dependency, database or live-service migration has run.
Do not mark migration tasks complete based on the older checked Astro work.

### Phase 0 — Unified stack migration (required before other work)

Rewrite the web application fully to Next.js + React + Tailwind + shadcn/ui,
use Drizzle for PostgreSQL schema/query/migration ownership, and package the web
server with Docker Compose. Preserve this project's observer-only product and
its host-native collector. Work on `main`, commit/push with the configured owner
identity and verify both origin push destinations; no branch, worktree or PR.

#### 0.1 Review the baseline and freeze contracts

- [ ] Read AGENTS.md, README.md, docs/architecture.md, docs/production.md,
  docs/migration.md and the current VM-owned
  `/home/sawyer/github/ubuntu-vm-backup/docs/astro-migration.md` plus its referenced
  final integration/restore procedures. Recheck the live release, checkout,
  Caddy fragment, timers, native PostgreSQL, port reservations and shared backup
  integration. Local source and host checkout can be at different commits.
- [ ] Run the current gates using the pinned runtime before replacing it.
  Record a private baseline of route/status/header/static-byte contracts,
  role denials and current table definitions. Reuse the fixtures and tests;
  create only sanitized additional fixtures. Never commit live data or secrets.

Current source map (reviewed November 2; recheck before implementation):

| Owning source | Responsibility / migration direction |
| --- | --- |
| `package.json`, `package-lock.json`, `.node-version`, `.npmrc`, `astro.config.mjs`, `tsconfig*.json` | Astro 7.4.2 / Node adapter 11.1.9 / pg 8.16.3; Node 24.22.1, npm 11.19.1, strict TS 6.0.3. Replace Astro/checker/adapter only when the Next successor works. |
| `src/pages/[...path].ts`, `src/lib/web.ts` | Single Astro endpoint and HTML string renderer; replace with real Next App Router routes and React components, retaining behavioral contracts. |
| `src/lib/model.ts`, `config.ts`, `source.ts`, `db.ts` | Pure states/freshness, settings, `Source` interface, four read queries, lossless PG type parsers; retain pure logic, adapt the repository to Drizzle. |
| `database/schema.sql` | Seven history tables plus `app.schema_migrations`, indexes, checks, identities, triggers and explicit grants; baseline into Drizzle without rebuilding data. |
| `src/collector/{inventory,command,probes,alerts,writer,cli}.ts` | Bounded host probes, notification state and CLI; retain host execution and semantics, adopt typed DB access without importing probes into the web. |
| `scripts/history.ts`, `deploy/history-transfer.py` | Every-row canonical count/digests and legacy transfer; retain recovery tooling, not a new MySQL import step. |
| `tests/{core,database}.test.ts`, `tests/fixtures*`, `tests/postgres.sh` | Compatibility and disposable no-TCP PG suite; extend for Next/Drizzle/Compose rather than losing assertions. |
| `deploy/*.sh`, `deploy/*.service`, `deploy/*.timer`, `deploy/Caddyfile` | Exact-commit candidate, locked activation/rollback, role wrappers, backup and smoke; replace Astro-specific assumptions with the new web image lifecycle. |
| `scripts/{verify-permissions.ts,external-probe.py,http3-probe.py}`, `.github/workflows/`, `Makefile` | Access acceptance, independent monitoring and CI; update paths/build commands, preserve purpose and no deploy automation. |

Required route parity:

| Route | Required behavior |
| --- | --- |
| `/` | Service-only rollup headline/counts, attention, groups and categorized cards; do not substitute the API's combined services/projects rollup. |
| `/services`, `/projects` | Existing evidence, timestamps, Git and BUILD progress; unknown evidence remains unknown, quiet repos remain healthy. |
| `/incidents`, `/api/incidents.json` | Incidents and maintenance, descending time/ID, latest 25 each; maintenance ends within the last 30 days or later. Preserve JSON fields. |
| `/deployments` | Latest 50 records, ordering, nullable metadata and public summaries. |
| `/operator` | Token unset: 404; wrong/missing bearer: 401 before data queries, `WWW-Authenticate` and noindex; valid bearer: deliberate private metadata only. Constant-time token comparison, no token in URL/cookie/client props. |
| `/healthz` | `200`, text `ok\n`, no database access; container liveness uses this, not freshness readiness. |
| `/readyz` | HTTP 200, `status`/`dependencies`/`database`; keep `postgresql-*` dependency labels because the backing DB is unchanged, including stale/missing/unavailable cases. |
| `/api/status.json` | `overall_state`, `checked_at`, `summary`, `services`, `projects`; existing IDs/states/fields/order rules and services-only summary. |
| `/assets/status.css`, `/icon.svg`, `/robots.txt` | Preserve bytes and established individual cache policies; new hashed Tailwind/Next assets are additional files. |

All known dynamic routes: GET/HEAD, empty HEAD bodies, otherwise 405 and
`Allow: GET, HEAD` (including Next's automatic OPTIONS behavior). Unknown/private
paths stay 404. Database failures stay redacted 503 with Retry-After; readiness
retains degraded/200. Preserve no-store behavior, security headers, valid URL
filtering, HTML escaping, UTC APIs, fixed UTC-05:00 EST display, and stale-at-15-minutes
boundary. Check trailing-slash/redirect behavior against the baseline. Never add
raw outputs, paths, topology, credentials or exception details to public data.

#### 0.2 Establish the target web foundation

- [ ] Resolve current compatible stable Next.js/React/Tailwind/shadcn/ui/Drizzle
  versions from official docs and security notices at implementation time. Pin
  exact packages and npm lock. Keep Node 24.22.1/npm 11.19.1 when compatible;
  if a change is necessary, pin/document it for this image/build without replacing
  the shared host runtime other applications and retained releases still use.
- [ ] Add Next App Router configuration with `output: 'standalone'`, Node runtime
  and strict TS (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). Keep
  separate compiler configuration for the host CLI/tests. Provide `npm run dev`,
  `check`, `test`, `build`, `start` and documented DB generation/migration commands;
  `check` must explicitly typecheck/lint independently of `next build`.
- [ ] Build `src/app` pages/layout, server-only data modules and
  `src/components` UI. Compile Tailwind locally and add only needed shadcn/ui
  primitives (for example Card, Badge, Table, Alert). Keep semantic landmarks,
  table headers, skip link, keyboard access, mobile layouts and system light/dark
  preference. Reuse existing content/design; this is not a product redesign.
- [ ] Replace the string-rendered public pages with React Server Components;
  keep all status evidence and navigation usable with JavaScript disabled.
  Small Client Components require a concrete UI need; don't add polling or browser
  probes. No remote fonts, analytics, CDN scripts or Vercel hosting dependencies.
- [ ] Implement JSON/health/readiness/operator endpoints as Node Route Handlers
  where exact status/method/header control is needed. Enforce the bearer gate
  before database access/rendering; avoid authenticated-page prefetch. Keep
  operator-only values out of public HTML, RSC/Flight responses, client bundles,
  source maps, caches, errors and any `NEXT_PUBLIC_*` variable.
- [ ] Explicitly make snapshot/database rendering request-time and uncached.
  Do not use static generation, ISR, cached ORM queries or stale router prefetch
  for status data. Test a changed snapshot and then an aged/missing snapshot
  without a rebuild, through both Next and Caddy. Preserve dynamic no-store
  semantics and the three legacy static cache policies without duplicate headers.
- [ ] Replace the old script-free CSP assumption with per-request nonce handling
  for Next framework scripts, using the selected version's supported request
  hook (current docs call it Proxy). Retain base/object/frame/form restrictions;
  do not solve hydration by adding production unsafe-eval or broad unsafe-inline.
  Core pages still render without scripts. Keep authored styling in compiled CSS;
  audit framework-generated inline output and validate CSP in the built server.

Do not install Better Auth now: there are no user accounts and the web role is
deliberately read-only. Keep bearer `/operator` unchanged. If accounts are later
requested, use Better Auth with its own reviewed schema and narrowly scoped auth
writer, not added writes on this public reader. No Stripe, Vercel AI SDK, Tauri
or Expo until a payment, LLM, desktop or mobile requirement exists. Future clients
call Next APIs, never PostgreSQL directly. Do not introduce Clerk, Supabase,
hosted monitoring, Coolify/Dokploy or another proxy as part of this migration.

#### 0.3 Adopt Drizzle without changing history or privileges

- [ ] Add `src/db/` TypeScript schema, `drizzle.config.ts`, committed reviewed SQL
  migrations and metadata under `drizzle/`, and an explicit owner-only migration
  runner. Use Drizzle with the existing `pg` driver; keep pools small (current max
  3) and bounded connection/query timeouts. No migrations on app/collector startup.
- [ ] Introspect an isolated restored copy of the existing `app` schema, never
  from a web login or by printing production URLs. Review all generated mappings
  against `database/schema.sql` and the actual schema. Seven historical tables
  are `targets`, `check_runs`, `rollups`, `incidents`, `maintenance_windows`,
  `deployment_events`, `alert_notifications`; `app.schema_migrations` is separate
  existing bookkeeping and must not collide with Drizzle's migration journal.
- [ ] Establish and rehearse a version-supported baseline: fresh databases get
  complete schema DDL; existing databases mark only a verified matching baseline
  as applied, without re-CREATE/TRUNCATE/reimport. Drizzle's documented `pull --init`
  can write migration bookkeeping; confirm behavior for the pinned version and
  run such writes only through the migration role and locked host transaction.
  Test both paths and a second no-op migrate. Never use `drizzle-kit push` in production.
- [ ] Preserve schema `app`, table/column names, generated-by-default identity
  sequences and next values, FK cascade, indexes, CHECKs, defaults, nullability,
  JSONB types and updated-at triggers. Preserve bigint precision (do not coerce
  IDs to JS Number) and `timestamptz(6)` including microseconds, offsets and UTC
  serialization; do not let ORM Date conversions truncate history. Keep raw SQL
  migrations for triggers/grants or other DDL introspection cannot faithfully carry.
- [ ] Port `PostgresSource` to typed Drizzle queries while retaining its `Source`
  contract; port collector storage/transactions using Drizzle or parameterized
  Drizzle SQL where advisory locks/cursors require it. Retain transaction scope,
  atomic checks+rollups, serialized alert handling, retention and deployment CLI
  semantics. Shared schema/types must never import collector modules.
- [ ] Keep independent NOLOGIN owner, migration, web and collector roles. The
  migration runner explicitly SET ROLEs owner; neither runtime gets migration
  credentials/membership. Web SELECT is only rollups/incidents/maintenance_windows/
  deployment_events, no sequences, other history, DDL/writes or future-table grants.
  Deny web and collector access to migration bookkeeping. Reapply explicit grants
  in reviewed migrations and verify denials with read-only default disabled.
- [ ] Compare every-column ordered digests/counts for all seven history tables
  before/after adoption with writers drained; also verify catalog constraints,
  triggers, sequences, grants and both migration journals. Include synthetic
  nonempty incidents/maintenance/alert recoveries, Unicode, nulls, JSON types and
  microseconds. Reuse `scripts/history.ts`; no export/import into a second live DB
  and no MySQL conversion are needed for this PostgreSQL-to-PostgreSQL migration.

#### 0.4 Package the web with Compose; preserve host collection

- [ ] Add multi-stage `Dockerfile`, `.dockerignore`, `compose.yaml` with pinned
  Node base/digest, locked npm install/build and a nonroot runtime. Copy
  `.next/standalone`, `.next/static` and `public` explicitly; run its generated
  `server.js`, not `next dev`/`next start`. Exclude env files, dumps, Git history,
  snapshots, host CLI/probe code, test tooling and migration credentials from the
  runtime image; inspect the final image/traced dependencies for accidental leaks.
- [ ] Use proposed Compose project `status-dunamismax`. Inside the bridge network
  set `HOSTNAME=0.0.0.0`, `PORT=3000`; publish only `127.0.0.1:4313:3000` for active
  web and `127.0.0.1:14313:3000` for the separate candidate. Check reservations
  again under the lock. No Docker socket, privileged mode, host network, host PID
  namespace, repository mounts or entire `/etc`/release-tree mounts.
- [ ] Retain native PostgreSQL 18 / `status_dunamismax` / `app`, which is already
  shared-backup managed. Container localhost and `host-gateway` do not reach a
  listener bound only to host 127.0.0.1. Prefer a read-only mount of the existing
  PostgreSQL Unix-socket directory at `/run/postgresql` with matching `PGHOST`;
  verify directory/socket permissions for nonroot and an explicit local SCRAM HBA
  rule scoped to this database/web role, ahead of incompatible peer rules. Keep
  collector host TCP behavior unchanged. Rehearse socket access and denied cross-DB
  logins in isolation; any host HBA adjustment is backed up and lock-protected.
  Do not widen listen_addresses, expose 5432 or relocate the shared database merely
  to accommodate Compose. A different connectivity design needs equivalent evidence.
- [ ] A privileged owning wrapper loads only the web role/app settings into
  Compose. Keep source files root-only; never bake credentials into build args,
  image layers, Compose YAML or checked-in env. Separate container/host envs,
  disallow client-public secrets and avoid printing resolved Compose config with
  secrets. Keep collector webhook absent from web; operator token absent from collector.
- [ ] Keep nonroot identity, read-only root filesystem, dropped capabilities,
  no-new-privileges, bounded resources/logs, liveness healthcheck and only measured
  tmpfs/cache writes. Test Next under Node permission restrictions; narrowly allow
  runtime internals it actually needs, never collector commands/repository reads.
  Document tested limitations instead of silently removing protections or making
  all of `/app` writable. Do not restart containers because observations are stale.
- [ ] Leave the collector as a host systemd oneshot/timer with its existing
  nologin identity, private HOME, read-only repository ACLs and no Docker group.
  Build a distinct host CLI artifact outside the web image. Retain the five-minute
  schedule/jitter/cap, absolute argv-only command runner, bounded output/deadlines,
  HTTP/TLS/body/redirect limits, TCP connect-only probes, unknown-on-permission
  behavior and the custom Caddy binary. Never fetch/pull/reset monitored repos.
- [ ] Preserve inventory target IDs and meaningful web-service evidence when the
  process moves into Compose. An active oneshot Compose launcher alone does not
  prove container health. Prefer a root-owned lifecycle/supervision service that
  exposes actual web state and a bounded read-only host status interface if needed;
  test stopped/crashed/unhealthy cases. Never grant the collector Docker API access
  or a restart/control endpoint. Update unit references, not historical IDs.

#### 0.5 Rework release, rollback and host integrations

- [ ] Adapt `deploy/build.sh`, `deploy/deploy.sh`, `deploy/rollback.sh`,
  `deploy/run-command.sh`, `deploy/smoke.sh`, backup helper and units. Keep the
  `CANDIDATE EXPECTED_CURRENT` owning interface or update every caller together.
  Candidate manifests include source commit, web image digest, host CLI artifact,
  migration metadata and static assets. Build/test images outside the shared lock.
- [ ] Run all shared schema/role/HBA, systemd, Caddy, current/release, Compose
  activation/removal and rollback mutations in one VM transaction under
  `with-deploy-lock`, reusing FD9. Recheck expected current/config/ports; back up
  data, secrets, units and proxy state; drain the collector and any other owning
  writes before baseline/digest comparison. Start candidate on 14313 and verify
  role isolation plus all routes before activation. No candidate notifications.
- [ ] Define a reversible switch: active Astro currently owns 4313. After
  candidate acceptance, stop only the owning Astro web, activate the verified
  image on 4313, atomically update release/current, validate/reload custom Caddy
  and public-smoke in the same transaction. Recheck the image on its final port;
  preserve old image/release/unit configuration for rollback. Handle partial
  Compose start, failed smoke, interrupted switch and repeat same-commit deploy.
- [ ] Keep Caddy on the host: main `/etc/caddy/Caddyfile`, site fragment
  `/etc/caddy/sites/status.dunamismax.com.caddy`, upstream 127.0.0.1:4313. Preserve
  headers, access logging, redirects, admin socket and other modules/routes.
  Verify `dns.providers.cloudflare` in `/usr/local/lib/caddy/caddy`; if missing,
  coordinate a host-owned build retaining every existing module. Use DNS challenge
  with a zone-scoped Cloudflare API token available only to Caddy. Check Full
  (strict) when proxied and certificate/renewal behavior; never switch to Flexible.
- [ ] Make rollback to retained Astro use current PostgreSQL history and compatible
  schema, not an old dump. Stop/drain owning writers during reconciliation and
  resume exactly one collector afterward; verify later writes/dedup state survive.
  If schema changes are unavoidable, rehearse a lossless forward/reverse adapter
  before cutover. Keep PHP/MySQL archives isolated; do not reactivate retired services.
- [ ] Update the owning integration contract for Toolworks, shared runtime/port
  registries, monitoring, backup and application restore drills before production
  activation. This planning task edits only this repo; implementation must review
  the actual `ubuntu-vm-backup`/Toolworks owners, not assume their Astro entrypoints
  understand an image. Do not edit unrelated sites or restart shared services.
- [ ] Keep nightly `pg_dump` custom archives plus roles/ACLs/settings/secrets and
  off-server encrypted dual-remote copies. Include Compose config, exact web
  image recovery (saved image or proven pinned rebuild), host CLI, Caddy/units and
  retained releases in backup coverage. Verify an isolated full restore and a
  reboot/lifecycle drill without collector notifications or production DB writes.
  A local-only dump or an unverified rebuild is not completion evidence.

#### 0.6 Acceptance and documentation completion

- [ ] Run `npm ci`, `npm run check`, `npm test`, `bash tests/postgres.sh`,
  `npm run build`, shell syntax checks, Python compilation and `git diff --check`.
  Keep PG integration private/disposable/no-TCP; never target live data. Extend CI
  and Makefile for Next build/lint/typecheck, Drizzle baseline/fresh/no-op paths,
  Compose validation without real secrets, image build/boot and compatibility smoke.
- [ ] Verify route/body/JSON/method/header parity against the fixtures and built
  Next server, including operator off/bad/good, outages/redaction, missing/stale/
  fresh transitions, UTC/microseconds, latest limits and preserved static bytes.
  Assert import/bundle boundaries include new App Router/components/Drizzle paths;
  the old six-file string scan alone is insufficient. Check no secrets/private
  metadata in browser-visible HTML, RSC, assets, errors, cache or build artifacts.
- [ ] Browser-check responsive light/dark pages, tables, keyboard/skip link and
  JavaScript-disabled status. Verify production nonce CSP allows required framework
  scripts and rejects injected payloads without hydration errors. Test through
  Caddy/Cloudflare so cache behavior and response headers match actual delivery.
- [ ] Reverify DB grants/future-table denials, cross-role env/file isolation,
  filesystem/Node restrictions, native socket authentication, no public DB/web
  ports, collector timer/fresh snapshots, stopped/unhealthy web evidence, failure
  alerts/recovery/dedup/caps and retention. Notification tests use mock/loopback or
  explicit safety flags only; keep the owner's real delivery destination unset.
- [ ] Rehearse failed activation and real code rollback with later PG writes,
  then verify encrypted off-host restore and independent external probes. Record
  actual results, commits/image digests and material limitations; do not infer
  uptime or mark checks run from earlier Astro acceptance evidence.
- [ ] Remove active Astro dependencies/configuration and obsolete paths only after
  parity is proven. Update README, AGENTS, architecture/production docs, package
  scripts, CI and BUILD for the implemented stack; preserve historical migration
  evidence and recovery artifacts. Mark Phase 0 complete only after all its gates;
  any later feature/authoring work uses the new stack.

Implementation references (reviewed November 2, 2026; refresh for selected pins):
[Next standalone](https://nextjs.org/docs/app/api-reference/config/next-config-js/output),
[self-hosting/caches](https://nextjs.org/docs/app/guides/self-hosting),
[nonce CSP](https://nextjs.org/docs/app/guides/content-security-policy),
[Drizzle existing-schema pull/baseline](https://orm.drizzle.team/docs/drizzle-kit-pull),
[Tailwind/Next](https://tailwindcss.com/docs/installation/framework-guides/nextjs),
[shadcn/Next](https://ui.shadcn.com/docs/installation/next),
[Compose service controls](https://docs.docker.com/reference/compose-file/services/),
[Caddy Cloudflare plugin](https://github.com/caddy-dns/cloudflare),
[Cloudflare Full (strict)](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/).

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
