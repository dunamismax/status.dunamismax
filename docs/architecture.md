# Architecture

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
