# Production operations

The current runbook below operates the Astro baseline. The required
[Compose successor](#planned-compose-operations-phase-0) is not implemented yet;
do not run the existing Astro deploy script against a Next/image candidate.
[BUILD.md Phase 0](../BUILD.md) owns the ordered migration gates.

Read `/home/sawyer/github/ubuntu-vm-backup/docs/astro-migration.md` first.
Every shared mutation, schema migration, release switch and rollback must run
on the VM under `/usr/local/sbin/with-deploy-lock`. The wrappers acquire it or
reuse inherited descriptor 9; never nest separate acquisitions.

## Runtime and access

- Releases: `/srv/www/status.dunamismax.com/releases/<commit>`, root-owned and
  immutable, with atomic `current`. Build outside the lock as sawyer.
- Web: `astro-status-dunamismax.service`, `status-dunamismax-web`, loopback 4313.
- Collector: `astro-status-dunamismax-collector.timer` → `.service`, existing
  `status-dunamismax` account, every five minutes plus up to 30s jitter, 4min cap.
- PostgreSQL: `status_dunamismax`, owner schema `app`. Role files remain root-only
  under `/etc/astro-apps/status_dunamismax/`; each unit loads only its own role.
- Application settings: `/etc/status-dunamismax/astro-web.env` (operator token,
  freshness and repo-root metadata) and `astro-collector.env` (webhook, repeat,
  maximum notifications, retention and repo root), root 0600. Changes need an
  owning Node service restart or take effect on the next collector run.
- Private collector HOME/state: `/var/lib/astro-status-dunamismax-collector`, 0700.
- Retired PHP/MySQL data, credentials and old releases are archival recovery
  material under the host runbook. Never reactivate their services/collector for
  ordinary rollback; keep the current PostgreSQL backup timer.

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

The deploy helper rechecks current state inside the lock, saves rollback copies,
drains the owning collector, takes a PostgreSQL safety archive and applies
transactional owner-only schema DDL. The first PHP cutover/import is
historical; current deployments must not reimport legacy history.
It validates a separate candidate on loopback 14313, atomically switches current,
records a notification-free snapshot, changes only this Caddy fragment, validates
as caddy with the custom binary, reloads Caddy and tests public routes. It records
one deployment and enables the successor timer. Failure invokes rollback inside
the same lock. Same-commit release retries validate the retained release digest.

`/healthz`, `/readyz`, HTML, APIs, static bytes, HEAD/405, private paths and operator
failure are checked by `deploy/smoke.sh`. An intentionally stale snapshot degrades
readiness; never change its timestamp just to make a check green.

## Operating commands

```sh
sudo /srv/www/status.dunamismax.com/current/deploy/run-command.sh collect --dry-run
sudo /srv/www/status.dunamismax.com/current/deploy/run-command.sh collect --no-notify
sudo /srv/www/status.dunamismax.com/current/deploy/run-command.sh record-deployment \
  --service-id example --repo-name example --commit-sha abcdef0 --summary 'example deployed to production'
systemctl status astro-status-dunamismax.service astro-status-dunamismax-collector.timer
journalctl -u astro-status-dunamismax-collector.service -n 10 --no-pager
```

`collect` without either safety flag performs the configured real alert behavior.
Do not use it for failure injection. The deployment wrapper holds the shared lock
also for manual commands, preventing a manual deployment record racing history
transfer. Toolworks uses these owning wrappers instead of legacy Rust/PHP commands.

## Historical reconciliation and rollback

The PHP export/reverse-migration flow in this section records the original cutover.
After host retirement it is recovery documentation for an isolated legacy host;
ordinary active rollback keeps PostgreSQL and uses a compatible application release.

The first cutover exports all seven MySQL tables in one consistent transaction,
including previously imported Rust history. Original IDs, every timestamp,
metadata, JSON payload and sent/suppression rows are reconciled before activation.
Private source files and count/digest manifests remain in the root-only rollback
directory; never commit or publish them. A populated destination requires explicit
`history import DIRECTORY --replace`, valid only with both writers stopped and a
verified safety archive. Import failure rolls back the entire destination change.

The latest rollback directory is recorded in `/root/status-astro-latest-rollback`.
Run the **new release's** `deploy/rollback.sh DIRECTORY` as root. The wrapper takes
the shared lock and stops the owning Node collector first. For a PHP rollback it
writes a fresh PG safety dump, streams all current PG history back to the retained
MySQL database transactionally, exports MySQL again and verifies every row against
PostgreSQL. Only then does it restore the old release, Caddy fragment, backup helper
and units and resume the legacy timer. A later Astro code rollback keeps PG as the
source of truth and restarts only the owning Node service/timer. No shared database
server is stopped. No old dump is restored over later writes.

If reverse reconciliation fails, keep both writers stopped and inspect the private
archives and manifests. Do not force the old writer online or discard later rows.
After recovery verify routes, timer state, freshness and the other shared services.

## Backups and restore

The existing daily `status-dunamismax-backup.timer` remains. Its replacement helper
acquires the shared lock, saves a custom-format PG dump with roles/ownership/ACLs,
role credentials, application settings, Caddy, units and release.
It restores PostgreSQL into a temporary private Unix-socket cluster before publishing
the root-only archive and SHA256. Legacy archives are preserved; migration safety
archives remain until explicitly retired. Credentials must never be published.

```sh
sudo systemctl start status-dunamismax-backup.service
sudo /home/sawyer/github/ubuntu-vm-backup/bin/backup --push
sudo /home/sawyer/github/ubuntu-vm-backup/bin/restore check
sudo /home/sawyer/github/ubuntu-vm-backup/bin/restore postgres-verify
```

The shared encrypted backup already captures this database in full, all astro-*
units, both credential locations and the retained legacy recovery configuration.
For an empty replacement host, restore role/config secrets first, verify the encrypted
archive with the shared runbook, reconstruct the pinned runtime, restore roles and
`pg_restore --create --exit-on-error` into an empty target, restore the immutable
release/current and units, validate Caddy, then verify routes and timer freshness.
Never use a live database as a restore-test destination.


## Host runtime retirement

After the final host cleanup, ordinary deployments and backups need PostgreSQL
only. PHP/MySQL target IDs remain in historical tables but are not probed. Legacy
rollback records are archival: recover them only in an isolated legacy host.
Use a compatible Astro release for code rollback and retain current PG data.
The host recovery runbook owns the preserved final full MySQL archive.

## Monitoring policy

The collector includes every retained website, four Astro services, the Python
bot, PostgreSQL, Docker, Caddy, access services, DDNS and its timer, RustDesk's
three TCP listeners, cleanup, installer builder and every backup job/timer.
Successful completion must be within 26 hours for daily jobs, eight days for the
weekly builder, 30 minutes for DDNS and 15 minutes for the collector. Enabled
or active timers alone never prove backup freshness. Root-owned completion
markers in `/var/lib/ops-success` survive reboot; ExecStartPost records them only
after successful job exit (the full backup includes restore verification and
both remote pushes). Failed Results override old success markers. The collector
is the single backup-failure alert path; no duplicate OnFailure notifier exists.

Root disk warns at 80% and fails at 90%; available RAM warns below 10% and fails
below 5%, or memory full-stall PSI avg60 reaches 2%/10%. Cached RAM alone is not
pressure. Certificates warn with less than 21 days remaining and fail below seven.
Backup Git storage warns at 5 GiB and fails at 10 GiB; stale observations are unknown.
Service restart evidence is visible, with five restarts indicating degradation.

`STATUS_ALERT_CONFIRMATIONS` defaults to two recent matching observations for
failure and recovery. The global five-per-run cap and 60-minute repeat window
bound delivery. Delivery failures remain unsent and retry later; URL-bearing
exceptions are redacted. Schema changes add operational recovery evidence to
existing alert history without changing the public API or web grants. Configure
a verified endpoint only in the root-only collector environment; it never enters
GitHub Actions or the public web process. The owner elected to skip real webhook
delivery; no notification destination or credential was created.

`.github/workflows/external-probe.yml` probes public HTML, the demo's noindex and
collector age from a GitHub-hosted Linux runner, independently of this VM and
home network. It requires no production credentials. Check its actual Actions
runs; schedules are best effort and can be delayed/disabled by GitHub. Failed
runs use the owner's GitHub notification preferences, with no custom webhook.
`workflow_dispatch` supports manual verification. The separate HTTP/3 validation
workflow performs a certificate-verified, HTTP/3-only public request and asserts
ALPN `h3` plus HTTP 200. An Alt-Svc header never satisfies it.

CI uses the exact Node/npm pins and frozen npm lock, synthetic disposable
PostgreSQL, strict checks/tests/builds and advisory checks. Dependency updates are reviewed
and made directly on `main`; no workflow deploys an update. Apply the host resource,
backup and maintenance procedures from ubuntu-vm-backup before production changes.

## Planned Compose operations (Phase 0)

These are target conventions and implementation requirements, not commands that
work in the current tree. The migration must update scripts, units, CI and the
shared integrations before this section becomes the active runbook.

| Item | Target / retained convention |
| --- | --- |
| Application | Next App Router/React, `output: 'standalone'`, generated `server.js`, copied `public/` and `.next/static/`. |
| Deployment sources | New root `Dockerfile`, `.dockerignore`, `compose.yaml`; Compose project `status-dunamismax`, immutable commit image and recorded digest. |
| Host lifecycle | Root-controlled owning deployment/supervision service; runtime container nonroot, no Docker API in web or collector. Reconcile the existing `astro-status-dunamismax.service` identity without making a running launcher evidence of a healthy web process. |
| Ports | Active published `127.0.0.1:4313:3000`, candidate `127.0.0.1:14313:3000`; internal `HOSTNAME=0.0.0.0`, `PORT=3000`. Recheck collision/reservation under lock. |
| Database | Existing native PostgreSQL 18, `status_dunamismax`, schema `app`; no DB container in this Compose project, no public DB listener. |
| Database transport | Preferred read-only PG socket directory bind at `/run/postgresql`, `PGHOST=/run/postgresql`; verify nonroot socket permissions and scoped local SCRAM HBA for this web role. Keep collector's host connection unchanged. |
| Database roles | Existing independent owner/migration/web/collector; web reads exactly four models, owner-only reviewed Drizzle migrations, private journals. |
| Credentials | Existing root-only `/etc/astro-apps/status_dunamismax/{web,collector,migration}.env` and `/etc/status-dunamismax/astro-{web,collector}.env`. Privileged lifecycle reads/injects only web settings into web; no secrets in image/config output. Any rename requires reversible backups and updated consumers. |
| Proxy/TLS | Host `/etc/caddy/Caddyfile`, fragment `/etc/caddy/sites/status.dunamismax.com.caddy`, binary `/usr/local/lib/caddy/caddy`, same 4313 upstream. Cloudflare DNS plugin/challenge with scoped Caddy-only token; Full (strict) if proxied. Preserve all existing binary modules and other sites. |
| Release/state | Retain `/srv/www/status.dunamismax.com/releases/<commit>`, atomic `current`, root-only rollback material; image+host CLI+schema metadata share a manifest. Writable web paths are measured tmpfs/cache only. |
| Collector | Existing host nologin `status-dunamismax`, `astro-status-dunamismax-collector.{timer,service}`, private state and CLI wrapper; never Docker group/socket or broader repository ACLs. |
| Backups | Existing nightly site/shared PostgreSQL dumps, role/ACL/secret capture and off-host encrypted dual pushes; extend application restore to exact image/Compose plus host CLI. |

A container cannot use its own 127.0.0.1 to reach host PostgreSQL. Do not use a
host-gateway shortcut against a loopback-only listener or widen PG to a wildcard
address. Rehearse the Unix-socket/authentication arrangement before cutover;
changes to HBA are shared mutations requiring the lock and rollback copies.

Build/test images and host CLI candidates outside the lock, with no production
credentials in a build. Inside one inherited-FD9 transaction recheck expected
current/ports/config, capture rollback material and PG safety dump, drain writers,
baseline/migrate/reconcile, validate the candidate on 14313, then replace only this
app's 4313 listener and atomically switch current. Verify final-port health, full
public smoke and Caddy headers/CSP; failure restores the previous app/config/image
in the same transaction. Never stop the shared PostgreSQL/Docker/Caddy services.
Reload validated Caddy only as needed. Resume one collector and record deployment
using the retained CLI interface with notifications suppressed for acceptance.

Rollback uses the retained Astro image-independent release or previous Next image
with current PG data and a compatible schema. Do not run the old Astro-only rollback
script unmodified after a Compose activation, restore a pre-cutover dump over new
writes or restart retired PHP collectors. Test later writes, alert suppression and
timer freshness after rollback. Retain images, releases and backups until the
host-owned cleanup permits removing them.

The existing `ubuntu-vm-backup` restore drill starts Astro entrypoints. Update its
status consumer, release capture, image recovery and isolated application drill,
plus Toolworks' owning wrapper contract and host runtime/port inventory, before
activation. This documentation-only task makes no cross-repository/host changes.
An exact image must be recoverable from encrypted backup or a demonstrated pinned
rebuild, with all roles/secrets/ACLs restored first in a private disposable database.
Prove off-host copies and full restore, not just `pg_dump` success.

At completion replace the active Astro operations sections with tested commands,
record actual acceptance evidence separately from the historical migration results,
and update AGENTS/README/BUILD in the same implementation change. Do not label this
target operational based on the planning document alone.
