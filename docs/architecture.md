# Architecture

This describes the implemented Astro/PostgreSQL baseline. The final stack retains
both, adding Drizzle as planned below and in [BUILD.md Phase 0](../BUILD.md).

Astro's Node standalone adapter serves the exact routes through a TypeScript
endpoint. `src/lib/web.ts` renders escaped semantic HTML and JSON with no-store,
CSP, nosniff, referrer and permissions headers. Static files retain their Caddy
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
bound and at most 256 KiB of body. TCP checks connect and close without sending
bytes. Systemd handles one-shots and restart loops; DDNS uses latest successful
run recency. All public reasons are fixed phrases or counts. Webhook POSTs have
five-second timeouts, no redirects and redacted failure messages.

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

## Planned Drizzle adoption (Phase 0)

Keep Caddy → loopback Astro Node standalone → PostgreSQL and the separate host
systemd TypeScript collector. This database-backed live observer requires SSR;
static output remains a choice for content-only sites. No container migration,
React rewrite, native target or Python collector rewrite is needed.

Add `src/db/` TypeScript definitions for schema `app`, `drizzle.config.ts`, reviewed
SQL/metadata under `drizzle/`, and an owner-only migration runner. Use Drizzle with
the existing pg driver, preserving pool/time bounds and lossless bigint/timestamp
parsers. Adapt `PostgresSource` and collector persistence without mixing their
import graphs. Parameterized SQL remains appropriate for advisory locks, cursors,
triggers and explicit grants when the ORM does not represent them faithfully.

Adopt all seven historical tables without relocating, truncating or reimporting
history. Keep current `app.schema_migrations` separate from Drizzle bookkeeping;
rehearse both an existing verified baseline and a complete fresh installation.
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
React islands, compiled Tailwind and selected shadcn/ui components require a concrete
interactive feature; no hydration/CSP changes are needed for this database adoption.
Astro Actions/API endpoints are the path for future forms/native clients when needed.

Better Auth/PostgreSQL and Vercel AI SDK endpoints are conditional future features.
No user-account or LLM requirement exists here. Swift/SwiftUI Apple clients and
Python/uv/ruff tools are likewise conditional; retain existing working languages.
Future native clients use HTTPS APIs rather than database connections. Existing
Python recovery/public probes remain useful and are not a reason to port the collector.
