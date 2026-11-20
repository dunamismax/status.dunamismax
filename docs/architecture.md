# Architecture

The stack is SvelteKit 3 · Svelte 5 · TypeScript · Tailwind CSS 4 · PostgreSQL 18 +
Drizzle ORM · Node (adapter-node) · Caddy. Drizzle was adopted in production on
November 2, 2026 ([BUILD.md Phase 0](../BUILD.md)); the web layer moved from Astro
to SvelteKit in [BUILD.md Phase 1](../BUILD.md), described below.

SvelteKit's adapter-node server serves the exact routes. Pages are Svelte 5
components rendered on the server only; JSON, health and readiness are `+server.ts`
endpoints. `src/hooks.server.ts` applies no-store, CSP, nosniff, referrer and
permissions headers to every application response. Static files retain their Caddy
cache policies. `/healthz` does not access the database. Error responses never
include exception messages, database URLs, command output or private paths.
Only authenticated `/operator` renders repository paths, without reading them.

`src/lib/source.ts` reads only rollups, incidents, maintenance and deployments.
The PostgreSQL web role is denied targets, individual check rows, alert history,
sequences, writes, DDL and owner membership. Its read-only default is extra
protection; actual grants enforce the boundary even if that default is disabled.
Owner-created future tables do not automatically become web-readable.

The web systemd unit uses the existing isolated nologin web account, ProtectHome,
a read-only filesystem and Node's permission model. It receives neither collector
credentials nor migration credentials; Node cannot spawn subprocesses or write
files. Permission mode is defense in depth, alongside OS and database controls.
The release/build contains no environment files.

The collector uses a distinct nologin user and existing read-only repository
ACLs, with no Docker group or socket access. All subprocesses go through
`src/collector/command.ts`: absolute program, argv array, shell:false, minimal
nonsecret environment, five-second deadline, bounded stdout/stderr and process
group kill on timeout. Truncated output is treated as unavailable evidence.
Caddy's private adapted configuration is discarded.

HTTP GETs use verified TLS, a five-second overall deadline, a five-hop redirect
bound and a 256 KiB body limit. The installer probe requests a two-byte range.
TCP checks connect and close without sending
bytes. Systemd handles one-shots and restart loops; DDNS uses latest successful
run recency. All public reasons are fixed phrases or counts. Webhook POSTs have
five-second timeouts, no redirects and redacted failure messages. The optional
offsite heartbeat uses a separate bounded GET after the snapshot and retention
writes succeed.

The collector holds a PostgreSQL advisory lock across collection, storage,
alert dedup selection/delivery/recording and retention. A failed send is retried
on a later run. As with the prior implementation, a crash after remote receipt
but before sent-row recording can repeat a webhook; the remote endpoint must
use the stable event identity if it needs stronger delivery semantics.

The seven history tables use timestamptz(6), JSONB and original bigint IDs.
Schema DDL explicitly SET ROLEs the NOLOGIN owner using migration credentials.
The importer reads bounded batches, compares ordered canonical SHA256 digests
of every column in every row, then advances all identity sequences inside the
same transaction. JSON object key order is normalized; array order, types,
Unicode, microseconds, nulls, metadata and suppression evidence are preserved.

## SvelteKit web layer (Phase 1)

Caddy → loopback SvelteKit adapter-node → PostgreSQL, beside the separate host
systemd TypeScript collector. This database-backed live observer requires SSR;
prerendering/adapter-static remain choices for content-only sites.

- Configuration is the `sveltekit()` plugin in `vite.config.ts` (SvelteKit 3 reads
  no `svelte.config.js`): adapter-node with `out: 'dist'` (the collector's tsc output
  owns `build/`) and no precompression (Caddy encodes), absolute asset paths,
  version polling off. `#lib/*` is a `package.json` subpath import for `src/lib/*`.
- `src/routes/+layout.server.ts` sets `ssr = true`, `csr = false`, `prerender =
  false` for every page, so no client JavaScript is linked or emitted; the build's
  `dist/client` contains only the stylesheet, icon and robots file (tested).
  `hooks.server.ts` strips Svelte's hydration comment markers from page HTML.
- `hooks.server.ts` builds the request context (`StatusContext`: Drizzle
  `PostgresSource`, validated config, clock) into `locals`, answers non-GET/HEAD on
  known routes with 405 + `Allow` before routing, rejects a wrong operator bearer
  token with 401 before any load reads storage, empties HEAD bodies and adds
  `Retry-After: 60` to 503s and `X-Robots-Tag: noindex` to operator responses.
  SvelteKit's form-origin CSRF check is compiled out (`csrf.trustedOrigins: ['*']`)
  because no form, action or mutating handler exists and the hook 405s every
  mutating method (CSP also sets `form-action 'none'`); that keeps the 405 contract.
- Page `+page.server.ts` loads catch storage errors and raise a redacted 503 that
  `+error.svelte` renders; unknown paths and a disabled operator page render 404.
  `src/lib/web.ts` (route allowlist, headers, bearer check, readiness, snapshot
  loading) is imported only by server modules. Components import only
  `src/lib/model.ts` and `src/lib/view.ts`, which are pure.
- Svelte escapes all text and attributes; `safeUrl` still allows only absolute
  http(s) links. Markup and class names match the previous renderer: on the same
  data, rendered pages differ from the Astro release only in the stylesheet URL,
  inter-element whitespace and `>` left literal inside escaped text (`<` and `&` are
  still escaped); JSON and readiness bodies are byte-identical.
- Tailwind CSS 4 (`@tailwindcss/vite`) compiles `src/app.css`. The palette, shadow
  and fonts are `@theme` tokens (`--color-*` reset first, so utilities use only this
  palette, e.g. `bg-panel text-muted border-line`); light-mode overrides and the
  hand-written component rules sit in the components layer in their original order.
  Preflight is omitted to keep the established base rendering; utility source
  detection is limited to `src/routes` and `src/lib/components`. Output is one
  content-hashed file under `/_app/immutable/assets/`, cached immutably by adapter-node.
- Tests drive the built server instance (`dist/server/server.js`) in-process and
  inject test storage through `platform.status`, which adapter-node never sets.

## Drizzle adoption (Phase 0)

Phase 0 kept the then-current Astro Node standalone server; its Drizzle work is
framework-independent and carried into Phase 1 unchanged. No container migration,
native target or Python collector rewrite is needed.

Implemented: `src/db/schema.ts` declares all seven history tables plus legacy
`app.schema_migrations`, with the reviewed constraint, index and FK names. Drizzle ORM
0.45.4 wraps the existing pg pool (max 3, bounded connect/statement timeouts).
`PostgresSource` selects only the four public models through the query builder;
collector snapshot writes run in one `transaction()` on the caller's single
client, so the advisory session lock and the transaction share one connection.
Advisory locks and history cursors remain parameterized SQL. Column keys keep their
database names so read models and JSON stay byte-compatible. Timestamps use
Drizzle's string mode (PostgreSQL text, normalized by `timestamp()`), bigint IDs
use `BigInt`; neither passes through JS Date or Number. The public import-graph test
covers `src/db/schema.ts` and rejects any web import of the runner or catalog code.

`drizzle/0000_baseline.sql` is Kit-generated DDL hand-reviewed into the exact legacy
structure, plus what Kit cannot express: the legacy bookkeeping row, updated-at
trigger function/triggers and explicit grants. Pinned Kit 0.31.11 has no `pull --init`
(that is 1.0-beta only), so `src/db/migrate.ts` owns baselining. It uses Drizzle's
journal/hash format in a private `app.drizzle_migrations` table (REVOKEd from
PUBLIC/web/collector at creation), one connection and one transaction with
`SET LOCAL ROLE status_dunamismax_owner` and advisory lock (193701, 2). It requires
recorded entries to be an exact hash/timestamp prefix of the reviewed journal. A
schema without a journal is refused unless `--adopt-baseline` is given, and adoption
records the baseline without executing it only when `src/db/catalog.ts` finds the
structural catalog (owners, columns, identity/sequence options, constraints,
indexes, triggers, function definitions; deparsed under a fixed search_path)
identical to `drizzle/baseline-catalog.json`. Every run then fails closed on actual
access violations: web SELECT on anything but the four models, any web write or
sequence use, collector/PUBLIC access to bookkeeping, CREATE on `app`, owner/writer
membership, or owner default ACLs granting web.

Adopt all seven historical tables without relocating, truncating or reimporting
history. Keep current `app.schema_migrations` separate from Drizzle bookkeeping.
Fresh installation, adoption of a nonempty legacy `schema.sql` database and of its
dump/restore copy are tested in the disposable cluster. A private restore of
production, and then production itself, adopted with identical every-row digests.
Preserve identities/next sequence values, timestamptz(6), JSONB, nulls, constraints,
indexes and updated-at triggers. Do not use JS Date or Number conversions that
lose microseconds or bigint IDs. Compare every-row digests and catalog semantics.

Database grants remain independent of schema declarations. Public web reads only
rollups, incidents, maintenance_windows and deployment_events. Migration credentials
explicitly select the NOLOGIN owner; web/collector never receive them. New tables,
including Drizzle bookkeeping, must not automatically become web-readable or
collector-writable. Do not run migrations on runtime startup or allow web writes.

Keep current routes, JSON, unknown/stale evidence, no-store headers, CSP, script-free
HTML and bearer operator boundary. Readiness keeps PostgreSQL dependency labels.
Client hydration, shadcn-svelte components, form actions and remote functions require
a concrete interactive feature, plus a CSP, CSRF and smoke review when introduced.
SvelteKit `+server.ts` endpoints are the path for future native-client APIs.

Better Auth/PostgreSQL and Vercel AI SDK endpoints are conditional future features.
No user-account or LLM requirement exists here. Swift/SwiftUI Apple clients and
Python/uv/ruff tools are likewise conditional; retain existing working languages.
Future native clients use HTTPS APIs rather than database connections. Existing
Python recovery/public probes remain useful and are not a reason to port the collector.
