# Production operations

The active service is SvelteKit 3 (adapter-node) with native PostgreSQL 18,
Drizzle, systemd and Caddy, deployed November 20, 2026 ([BUILD.md Phase 1](../BUILD.md)).
Deployment applies reviewed Drizzle migrations through the owner-only runner;
`database/schema.sql` is kept for the database tests and baseline adoption only.

There is no rollback tooling (owner decision, 2026-11-21): no rollback script,
no rehearsal and no fallback release. The host's final cleanup the same day
removed every earlier-framework, PHP and MySQL release, the retired MySQL data
and the old rollback directories. A deployment that fails is fixed forward.

Read `/home/sawyer/github/ubuntu-vm-backup/docs/web-platform.md` (host runbook) first.
Every shared mutation, schema migration and release switch must run
on the VM under `/usr/local/sbin/with-deploy-lock`. The wrappers acquire it or
reuse inherited descriptor 9; never nest separate acquisitions.

## Runtime and access

- Releases: `/srv/www/status.dunamismax.com/releases/<commit>`, root-owned and
  immutable, with atomic `current`. Build outside the lock as sawyer.
- Web: `status-dunamismax.service` (retained unit name), `status-dunamismax-web`,
  loopback 4313. SvelteKit releases run `dist/index.js` under `node --permission`
  with `HOST`, `PORT` and `ORIGIN=https://status.dunamismax.com`. Each release's
  unit file is installed with it.
- Collector: `status-dunamismax-collector.timer` → `.service`, existing
  `status-dunamismax` account, every five minutes plus up to 30s jitter, 4min cap.
- PostgreSQL: `status_dunamismax`, owner schema `app`. Role files remain root-only
  under `/etc/web-apps/status_dunamismax/`; each unit loads only its own role.
- Application settings: `/etc/status-dunamismax/web.env` (operator token,
  freshness and repo-root metadata) and `collector.env` (webhook, heartbeat, repeat,
  maximum notifications, retention and repo root), root 0600. Changes need an
  owning Node service restart or take effect on the next collector run.
- Private collector HOME/state: `/var/lib/status-dunamismax-collector`, 0700.

## Release

Commit and dual-push the owning repository; update the clean VM checkout by
fast-forward. `deploy/build.sh` builds/tests an exact Git archive and emits only
the candidate path on stdout. Diagnostics go to stderr. Complete same-commit
candidates are reusable after digest verification; partial candidates are rebuilt.

```sh
cd /home/sawyer/github/status.dunamismax
candidate=$(deploy/build.sh)
previous=$(readlink -f /srv/www/status.dunamismax.com/current)
sudo deploy/deploy.sh "$candidate" "$previous"
```

The deploy helper rechecks current state inside the lock, opens a root-only
record directory (`/root/status-deploy-<time>`, named in
`/root/status-latest-deploy`), drains the owning collector, takes a PostgreSQL
safety dump into it and applies reviewed Drizzle migrations through the
owner-only runner (see Drizzle operations below), bracketed by every-row digests.
It validates a separate candidate on loopback 14313, atomically switches current,
records a notification-free snapshot, changes only this Caddy fragment, validates
as caddy with the custom binary, reloads Caddy and tests public routes. It records
one deployment and enables the successor timer. Same-commit release retries
validate the retained release digest.

A failure stops the deployment where it is: nothing is rolled back. The script
removes only its temporary candidate unit and collector drop-in, then prints the
live release, the release it started from and the record directory. Before the
switch the previous release is still live; in either case the collector timer may
be stopped. Read the error, fix the cause and deploy again, then check that
`status-dunamismax-collector.timer` is active.

`/healthz`, `/readyz`, HTML, APIs, static bytes, HEAD/405, private paths and operator
failure are checked by `deploy/smoke.sh`. It also requires a script-free home page
and finds the linked stylesheet, `/_app/immutable/assets/*.css` (expected
`public,max-age=31536000,immutable` from adapter-node, with no Caddy override).
An intentionally stale snapshot degrades readiness; never change its timestamp
just to make a check green.

## Operating commands

```sh
sudo /srv/www/status.dunamismax.com/current/deploy/run-command.sh collect --dry-run
sudo /srv/www/status.dunamismax.com/current/deploy/run-command.sh collect --no-notify
sudo /srv/www/status.dunamismax.com/current/deploy/run-command.sh record-deployment \
  --service-id example --repo-name example --commit-sha abcdef0 --summary 'example deployed to production'
systemctl status status-dunamismax.service status-dunamismax-collector.timer
journalctl -u status-dunamismax-collector.service -n 10 --no-pager
```

`collect` without either safety flag performs configured webhook and heartbeat delivery.
Use the isolated tests for failure injection. The deployment wrapper holds the shared lock
also for manual commands, so a manual deployment record cannot race a deployment.
Toolworks uses these owning wrappers.

## Backups and restore

The existing daily `status-dunamismax-backup.timer` remains. Its replacement helper
acquires the shared lock, saves a custom-format PG dump with roles/ownership/ACLs,
role credentials, application settings, Caddy, units and release.
It restores PostgreSQL into a temporary private Unix-socket cluster before publishing
the root-only archive and SHA256. Credentials must never be published.

```sh
sudo systemctl start status-dunamismax-backup.service
sudo /home/sawyer/github/ubuntu-vm-backup/bin/backup --push
sudo /home/sawyer/github/ubuntu-vm-backup/bin/restore check
sudo /home/sawyer/github/ubuntu-vm-backup/bin/restore postgres-verify
```

The shared encrypted backup already captures this database in full, the
`status-dunamismax*` units and both credential locations.
For an empty replacement host, restore role/config secrets first, verify the encrypted
archive with the shared runbook, reconstruct the pinned runtime, restore roles and
`pg_restore --create --exit-on-error` into an empty target, restore the immutable
release/current and units, validate Caddy, then verify routes and timer freshness.
Never use a live database as a restore-test destination.


## Monitoring policy

The overview's public availability headline follows the public HTTP probes.
Backup and maintenance checks and infrastructure each have their own health
summary. Stale or missing snapshots make all three current summaries unknown.
The existing JSON `overall_state` still combines all service and project states,
and `summary` still counts all service checks.

The collector includes every public website and app endpoint, every
application unit (Node, Python and Go services, Umami and the bot), PostgreSQL,
Docker, Caddy, access services, DDNS and its timer, RustDesk's three TCP
listeners, cleanup, installer builder, backup and restore-check jobs and timers,
and the fourteen repositories behind them. The inventory was last reconciled
against the host's running units, timers, Caddy sites, containers and listening
ports on 2026-11-21. Day by Word runs in Docker Compose; the collector has no
Docker access, so its public page and its host backup and monthly restore-check
jobs are its evidence. Field Cadence also runs in Docker Compose and has no host
units yet (its repository's jobs timer is not installed and it has no backup
job), so its public page, its certificates and its repository are its evidence;
its page is static, so that check does not exercise its database. Add its jobs
and backup units to the inventory when they are installed. The Imaging Services
demo is checked through `/healthz`, which answers only after loading its pages
from its content store and must report `ok` and name that store. Every public
host name gets a certificate check, including the ten `www.` names that only
redirect to their site (`redirectHosts` in the inventory): Caddy holds a separate
certificate for each, so one can lapse while the site itself stays healthy. Add a
name there whenever a Caddy site gains a redirect host. Umami serves only C From The Ground Up and is checked
through that site's `/stats/script.js`. RiverMind Poker's web server answers
`/healthz` with `ok` and its table server's public `/api/config`; since that
project's 2026-11-21 cutover one unit, `rivermind-poker-web`, serves the pages, the
API and the tables, and the old `rivermind-poker.service` is kept stopped and
disabled for rollback only, so it is not a check. C From The
Ground Up's `/healthz` must report both the app and its database as `ok`.
Azeroth Trail checks its homepage and `/api/status`, with usable readings for all
four regions and a snapshot and readings no older than five minutes. This measures
tracker health even when the game servers it tracks are offline. Lorehallow checks
its homepage and verifies the game server's `ok` response on `/healthz`. The
XrayService `/download` check requires HTTP 206, attachment and valid range headers,
and the two-byte Windows executable signature. It requests only the first two bytes.
Successful completion must be within 26 hours for daily jobs, eight days for the
weekly builder, 32 days for Day by Word's monthly restore check, 30 minutes for
DDNS and 15 minutes for the collector. Enabled
or active timers alone never prove backup freshness. Root-owned completion
markers in `/var/lib/ops-success` survive reboot (the C From The Ground Up,
vincentsawyer.org and Day by Word jobs do not write one yet, so after a reboot
they read unknown until their next successful run); ExecStartPost records them only
after successful job exit (the full backup includes restore verification and
both remote pushes). Failed Results override old success markers. The collector
is the single backup-failure alert path; no duplicate OnFailure notifier exists.

Root disk warns at 80% and fails at 90%; available RAM warns below 10% and fails
below 5%, or memory full-stall PSI avg60 reaches 2%/10%. Cached RAM alone is not
pressure. Certificates warn with less than 21 days remaining and fail below seven.
Backup Git storage warns at 5 GiB and fails at 10 GiB. The collector runs a bounded
read-only `du -skx` of the fixed backup `.git` directory using its existing access.
Failed, partial, timed-out or invalid measurements are unknown. The former size
marker is tied to job completion and is no longer read. The backup job check still
uses its existing systemd result and success marker to report backup delivery health.
Service restart evidence is visible, with five restarts indicating degradation.

## Offsite alerts and heartbeat

`STATUS_ALERT_CONFIRMATIONS` defaults to two recent matching observations for
failure and recovery. The global five-per-run cap and 60-minute repeat window
bound delivery. Delivery failures remain unsent and retry later; URL-bearing
exceptions are redacted. The collector sends a JSON `POST` with `source`,
`severity`, `state`, `target_id`, `target_name`, `title`, `public_summary`, and
`observed_at`. Its receiver must route the payload to the approved recipient.

The heartbeat is a `GET` to an independent dead-man receiver after the collector
stores a snapshot and completes retention. A backup failure can still produce a
heartbeat. A heartbeat request failure is logged separately and does not block
alert processing. Both requests use a five-second timeout, no redirects and a
2xx acknowledgment. `--dry-run` and `--no-notify` suppress both.

The integration requires owner-approved destinations. For verification, create
an isolated alert recipient and heartbeat monitor at the offsite receiver. Set
the heartbeat to expect a ping every five minutes with ten minutes of grace and
route missed-ping and recovery notifications to the approved test recipient.
As root, create or edit `/etc/status-dunamismax/delivery-test.env` as root
owned and mode `0600`. Set these variables to the approved **test** URLs (each
HTTPS URL can include its secret in the path or query):

```dotenv
STATUS_ALERT_WEBHOOK_URL=https://approved-test-receiver.example/alert-token
STATUS_HEARTBEAT_URL=https://approved-test-receiver.example/ping-token
```

Run the corresponding commands only for destinations the owner supplied and
approved for testing:

```sh
sudo /srv/www/status.dunamismax.com/current/deploy/run-command.sh test-delivery alert
sudo /srv/www/status.dunamismax.com/current/deploy/run-command.sh test-delivery heartbeat
```

Confirm the marked `TEST: Dunamis Status alert delivery` message at the approved
recipient and confirm that the receiver recorded the test heartbeat timestamp.
Let the test monitor miss its next deadline, verify its missed-heartbeat message,
then send a fresh test ping and verify recovery. A local 2xx only confirms the
receiver accepted a request. The test command loads the dedicated test settings
and does not write production notification or snapshot history.

Install only approved production URL(s) under the same variable names in
`/etc/status-dunamismax/collector.env`, owned by root with mode `0600`.
The next normal timer run picks them up. Confirm `heartbeat=sent` in the collector
journal and a recent ping at the receiver. Leave either variable unset until its
destination is approved. Keep both files out of Git, public web settings and
command arguments. Never inject a failure into live backup, DDNS or Caddy to
test alert delivery.

`.github/workflows/external-probe.yml` probes the public HTML of every site in
`src/lib/catalog.ts` (a test keeps the probe's list in step), the demo's noindex
and collector age from a GitHub-hosted Linux runner, independently of this VM and
home network. It requires no production credentials. Check its actual Actions
runs; schedules are best effort and can be delayed/disabled by GitHub. It asks
for a run every 30 minutes, but from 2026-11-17 to 2026-11-20 GitHub started
one only every six to nine hours, so treat it as a slow second opinion, not as
alerting. Failed
runs use the owner's GitHub notification preferences, with no custom webhook.
`workflow_dispatch` supports manual verification. The separate HTTP/3 validation
workflow performs a certificate-verified, HTTP/3-only public request and asserts
ALPN `h3` plus HTTP 200. An Alt-Svc header never satisfies it.

CI uses the exact Node/npm pins and frozen npm lock, synthetic disposable
PostgreSQL, strict checks/tests/builds and advisory checks. Dependency updates are reviewed
and made directly on `main`; no workflow deploys an update. Apply the host resource,
backup and maintenance procedures from ubuntu-vm-backup before production changes.


## Drizzle operations (Phase 0)

Retain the runtime, accounts, root-only env files, release/current paths, systemd
units, five-minute collector and backup timers, CLI interfaces and loopback ports
4313/14313 described above. PostgreSQL remains native/loopback-only with the same
project database, schema and separate roles. No Compose conversion, SQLite file,
Litestream replication or Python/Swift application is required by this project.

`deploy/deploy.sh` runs the reviewed runner, `build/src/db/migrate.js`
(`npm run db:migrate`), with the root-only migration role settings inside the lock
after draining the collector and taking the safety dump. The runner refuses the
web/collector logins and requires a provisioned schema `app`. When
`app.drizzle_migrations` is absent the helper passes `--adopt-baseline`, which
executes no DDL: it records `0000_baseline` only if the live structural catalog
equals `drizzle/baseline-catalog.json` (CHECK text is compared in its dump/restore
form, so restored databases adopt too), otherwise it prints the private differences
and the deployment stops. `history.js digest` writes every-row counts/
SHA256 and sequence positions before and after into the root-only record
directory; when no migration was applied they must be byte-identical.

```sh
# Manual use only inside a deploy-lock transaction with writers drained:
set -a; source /etc/web-apps/status_dunamismax/migration.env; set +a
/opt/node-runtime/bin/node "$release/build/scripts/history.js" digest > "$backup/pre-digest.json"
/opt/node-runtime/bin/node "$release/build/src/db/migrate.js"   # --adopt-baseline only without a journal
```

Compatible retained releases (including pre-Drizzle `1149ae6`) run unchanged on an
adopted database; the private journal table is invisible to their code paths.

Retain historical schema/transfer tooling needed by backups and old releases.
Introspection/baseline operations may write bookkeeping: rehearse on a disposable
restore first; production writes occur only under the inherited-FD9 deploy lock.
Never use schema push, runtime startup migrations or public runtime credentials.

Build/check candidates outside the lock. Inside one transaction recheck expected
current/configuration, back up PostgreSQL and affected configuration, drain all
owning writers, verify matching baseline and every-row digests, apply reviewed DDL,
verify grants/constraints/sequences, smoke candidate on 14313, atomically switch
current and validate/reload custom Caddy as needed. Resume exactly one collector,
verify fresh evidence and record deployment without notifications during acceptance.
No shared PostgreSQL restart, other-site change or listener relocation is needed.

There is no rollback. Keep a schema change compatible with the release that is
live while it deploys, and never restore an old dump over subsequent writes. Keep
journals and roles private.

Nightly pg_dump, roles/ACLs/settings, encrypted off-host dual copies and isolated
restore remain required. Update the shared ubuntu-vm-backup and Toolworks consumers
only where Drizzle migration/release metadata changes their interface. Include
locked source/dependencies, migration metadata and actual schema in the restore
drill; verify the restored web app using its restricted web role. Do not replace
PostgreSQL monitoring/readiness with engine labels for a database not actually used.

Caddy remains host-owned at `/etc/caddy/Caddyfile`, status fragment
`/etc/caddy/sites/status.dunamismax.com.caddy`, custom binary
`/usr/local/lib/caddy/caddy`. Preserve its modules, admin socket, TLS and headers.
DNS is owner-managed, DNS-only Cloudflare records pointing at the server's public
IP; Caddy obtains its own Let's Encrypt certificates. There is no Cloudflare DNS
challenge, plugin or token; any binary/module adjustment belongs to the shared
host runbook.

Deployment now uses these Drizzle commands; acceptance evidence for the November 2,
2026 adoption (production restore rehearsal, adoption, no-op redeploy and
encrypted restore) is in
[migration evidence](migration.md). Earlier PostgreSQL migration results remain
historical. No credentials, roles, units or timers changed during adoption.
