# Architecture

This section describes the current Astro implementation. The required successor
is [planned below](#planned-unified-stack-phase-0), with ordered work and acceptance
in [BUILD.md Phase 0](../BUILD.md). No target code is implemented by the planning change.

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

## Planned unified stack (Phase 0)

The target request path is host Caddy → loopback-published Compose web container →
native PostgreSQL through a narrowly mounted Unix socket. Next.js App Router runs
as a plain Node standalone server with React Server Components, compiled Tailwind
and selected shadcn/ui components. No Vercel services or external monitoring stack
are required. Public status remains an observer of recorded evidence.

The separate host systemd collector continues bounded probes → transactional
history/alerts → PostgreSQL. It never enters Docker, receives Docker API access
or runs inside a web request. Compose lifecycle belongs to privileged deployment
wrappers; neither runtime becomes a control panel for the other.

### Target source ownership

| Location | Boundary |
| --- | --- |
| `src/app/`, `src/components/` | React HTML and exact-contract Route Handlers; minimal client code, no probes or repositories. |
| Server-only modules in `src/lib/` | Drizzle-backed `Source`, settings and web-only connection pool; no collector/writer imports. |
| `src/lib/model.ts` and pure shared types | States, snapshot/freshness and lossless time contracts usable by web/collector without I/O. |
| `src/db/`, `drizzle/`, `drizzle.config.ts` | Typed `app` schema, reviewed SQL and migration bookkeeping; full schema is not runtime authorization. |
| `src/collector/`, host CLI artifact | Existing inventory/probes/command runner, typed transactions, advisory lock, notifications and retention. |
| `Dockerfile`, `.dockerignore`, `compose.yaml`, `deploy/` | Web-only image, separate host CLI, immutable candidates, locked activation/rollback and recovery. |

Drizzle adopts the existing seven history tables without copying or recreating
data. Preserve every ID, timestamp including microseconds, JSONB payload, sequence,
constraint and updated-at trigger. Review introspection and manually carry DDL it
does not represent. Keep existing `app.schema_migrations` distinct from the Drizzle
journal; both are private bookkeeping. A verified baseline and fresh installation
must converge, and a repeated migration must be a no-op. Only migration credentials
may apply reviewed DDL through explicit owner role selection.

Web still has SELECT on exactly rollups, incidents, maintenance_windows and
deployment_events; it has no sequence, writer, owner, other-table or future-table
access. Use the existing pg driver with Drizzle and retain lossless type parsing,
small pools/timeouts and parameter binding. Runtime schema declarations never
justify broader grants. Migration/collector credentials and webhook are absent
from the web image/environment, and no token is exposed through `NEXT_PUBLIC_*`.

All status rendering is request-time with no stale cache layer, static generation
or ISR. The 15-minute stale boundary must advance without a collector write or
rebuild. `/readyz` keeps its PostgreSQL labels and degraded/200 response convention;
`/healthz` remains independent of the database. Preserve the exact route/JSON,
redaction, fixed EST display and method contracts listed in BUILD.md.

React's framework scripts replace the old guarantee of zero script tags. Use a
tested nonce CSP and keep core evidence/navigation usable with JavaScript disabled.
Do not reuse the old no-script assertion as the only XSS check: retain escaping,
safe URLs and script-injection rejection, then verify actual CSP behavior. Tailwind
adds compiled assets without changing the three preserved legacy static files.
Keep operator authorization before queries and prevent private values escaping
through public components, RSC responses, caches, source maps or error boundaries.

Container isolation must retain independent OS/database/filesystem controls:
nonroot, read-only root, narrow measured temporary writes, dropped capabilities,
no-new-privileges, no Docker socket/repo mounts, role-only environment and tested
Node permission restrictions. Next runtime needs must be measured; broad filesystem
or subprocess permission is not an acceptable default. BUILD.md requires testing
both positive behavior and actual denials before cutover.

There are no account/payment/LLM/client-app requirements. Preserve bearer `/operator`;
do not introduce auth tables or make the web role writable. Better Auth, Stripe,
AI SDK, Tauri and Expo are reserved for corresponding future product requirements.
