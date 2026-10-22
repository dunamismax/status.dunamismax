# Production operations

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
- Existing PHP/MySQL services, their credentials, old releases and backup timer
  remain for recovery and other consumers. The legacy collector timer is disabled.

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

The deploy helper rechecks current state inside the lock, saves rollback copies
and both database safety archives, applies transactional owner-only schema DDL,
then (first cutover only) stops the legacy writer and imports/reconciles history.
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
