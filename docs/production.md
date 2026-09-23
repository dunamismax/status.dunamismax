# Production runbook

## Installed layout

| Item | Location or setting |
| --- | --- |
| Git checkout | `/home/sawyer/github/status.dunamismax` |
| Releases | `/srv/www/status.dunamismax.com/releases/<full-commit>`, root-owned, read-only |
| Active release | `/srv/www/status.dunamismax.com/current` symlink |
| Document root | `/srv/www/status.dunamismax.com/current/public` |
| Web user | `status-dunamismax-web`: system account, no other groups, no repository access |
| Web settings | `/etc/status-dunamismax/web.env`, root:status-dunamismax-web 0640, linked as the release `.env` |
| FPM pool | `/etc/status-dunamismax/php-fpm.conf`, linked from `/etc/php/8.5/fpm/pool.d/status-dunamismax.conf` |
| FPM socket | `/run/php/status-dunamismax.sock`, caddy 0600 |
| Collector user | `status-dunamismax`: read-only ACL on `/home/sawyer/github`, not in the docker group |
| Collector settings | `/etc/status-dunamismax/collector.env`, root:status-dunamismax 0640 |
| Collector | `status-dunamismax-collector.timer` (every 5 minutes) → `.service` → `bin/collect.php` |
| MySQL | `status_dunamismax` on 127.0.0.1; `status_web` has SELECT on rollups, incidents, maintenance_windows, and deployment_events only; `status_collector` has SELECT/INSERT/UPDATE/DELETE |
| Caddy site | `/etc/caddy/sites/status.dunamismax.com.caddy` |
| Backups | `status-dunamismax-backup.timer`, daily 06:30 UTC → `/var/backups/status-dunamismax`, 14 days |

The web user cannot read `collector.env`, and the collector cannot read
`web.env`. Neither file is ever printed by the scripts.

## Migrating from the Rust service

Run these from the checkout as root, in order, checking each script's
verification output before starting the next. Each script is safe to re-run,
backs up every file it changes to `/root/status-dunamismax-backup-<timestamp>/`,
and prints its rollback.

| Script | What it does | Public effect |
| --- | --- | --- |
| `deploy/10-provision.sh` | Creates `status-dunamismax-web`, the release and backup directories, the MySQL database, schema, and both accounts (passwords generated, sent over stdin), and both env files. It carries forward the operator token, alert webhook, and retention from the old `status.env` when present. Installs the FPM pool and checks the socket and file permissions. | None |
| `deploy/20-migrate-history.sh` | Stops the Rust collector timer so PostgreSQL stops changing, writes a `pg_dump` safety copy to `/var/backups/status-dunamismax/`, exports every table as JSON lines, and imports them as `status_collector` with their original ids. Then compares row counts. | None; the Rust site keeps serving live probes |
| `deploy/30-deploy.sh` | Builds a release from the committed HEAD, runs `bin/check.php` and `tests/run.php` as the web user, and activates it. Replaces the collector units with the PHP collector, installs the backup script and timer, collects one snapshot, smoke-tests every route as the web user, and records the deployment. | None; Caddy still proxies to Rust |
| `deploy/40-cutover.sh` | Moves the `status.dunamismax.com` block out of `/etc/caddy/Caddyfile` into `/etc/caddy/sites/status.dunamismax.com.caddy`, validates as `caddy` with `/usr/local/lib/caddy/caddy`, reloads, and verifies over HTTPS. Only then does it disable `status-dunamismax.service` and remove `status-dunamismax` from the docker group. It restores Caddy if any step fails. | The site switches to PHP |
| `deploy/50-decommission.sh` | Confirms the cutover, then writes a final `pg_dump` to `/var/backups/status-dunamismax/`. Removes the Rust unit and binary, the Rust-era `status.env`, and the unused `/etc/caddy/status.dunamismax.caddy`, then drops the PostgreSQL database and its role. It leaves the PostgreSQL server and every other database alone. | None |

Verification after cutover:

```sh
curl -fsS https://status.dunamismax.com/healthz
curl -fsS https://status.dunamismax.com/readyz        # mysql-ready,collector-snapshot-fresh
curl -fsS https://status.dunamismax.com/api/status.json | head -c 300; echo
systemctl list-timers status-dunamismax-collector.timer
journalctl -u status-dunamismax-collector.service -n 5 --no-pager
id status-dunamismax                                   # no docker group
```

## Routine releases

Commit and push the reviewed change, update the server checkout with
`git pull --ff-only`, then:

```sh
sudo /home/sawyer/github/status.dunamismax/deploy/30-deploy.sh
```

It never overwrites an existing release. If the collector or the smoke test
fails, it switches `current` back to the previous release. To roll back by
hand:

```sh
previous=$(sudo cat /root/status-dunamismax-previous-release)
sudo ln -sfn "$previous" /srv/www/status.dunamismax.com/current.rollback
sudo mv -Tf /srv/www/status.dunamismax.com/current.rollback /srv/www/status.dunamismax.com/current
sudo systemctl reload php8.5-fpm
```

Schema changes need reviewed migration SQL, a backup first, and the MySQL
administrator. `database/schema.sql` only creates missing tables.

## Deployment evidence

`30-deploy.sh` records each new release. Other deploy tooling, such as
Toolworks, records deployments with the collector account:

```sh
sudo -u status-dunamismax env STATUS_ENV_FILE=/etc/status-dunamismax/collector.env \
  php /srv/www/status.dunamismax.com/current/bin/record-deployment.php \
  --service-id <service> --repo-name <repo> --commit-sha <sha> --summary '<repo> deployed to production'
```

The command also reads the `STATUS_DEPLOYMENT_*` variables that the old
`STATUS_RECORD_DEPLOYMENT=true status-web` mode used, so only the executable
changes.

## Operator view and alerts

Set `STATUS_OPERATOR_TOKEN` (at least 32 characters) in `web.env` to enable
`/operator`, then reload php8.5-fpm. It shows repository paths and readiness
detail behind `Authorization: Bearer <token>`.

Set `STATUS_ALERT_WEBHOOK_URL` in `collector.env` to send alerts. Payloads
carry the target id and name, state, severity, time, title, and public
summary, and never paths, command output, or secrets. The same alert repeats
at most every `STATUS_ALERT_REPEAT_AFTER_MINUTES` (60), and each run sends at
most `STATUS_ALERT_MAX_NOTIFICATIONS_PER_RUN` (5).

## Backups

`/usr/local/sbin/status-dunamismax-backup` writes a transactional MySQL
dump, both env files, the pool, the Caddy site, the units, and the active
release to `/var/backups/status-dunamismax/status-<stamp>.tar.gz`, with a
SHA-256 file. It keeps 14 days of archives. The archives contain
credentials: never publish them. The PostgreSQL dumps from migration and
decommission stay in the same directory until removed by hand.

```sh
sudo systemctl start status-dunamismax-backup.service
ls -l /var/backups/status-dunamismax
```

A dump does not recreate MySQL users. To rebuild the host, restore the env
files, rerun `10-provision.sh` (it re-creates the accounts from those
passwords), load the dump, then run `30-deploy.sh` and `40-cutover.sh`.
