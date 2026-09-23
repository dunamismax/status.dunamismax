# Architecture

One PHP code base with two entry points, each running as its own user, and one
MySQL database between them.

## The collector

`status-dunamismax-collector.timer` starts `status-dunamismax-collector.service`
every five minutes. It runs `bin/collect.php` as `status-dunamismax` and reads
its settings from `/etc/status-dunamismax/collector.env`
(`STATUS_ENV_FILE`).

1. `Collector` runs every probe in `app/Probe/` once, in sequence:
   - `HttpProbe`: one GET per public site through a PHP stream context, with a
     5-second timeout, verified TLS, at most five redirects, and an optional
     body token. Failures are named: DNS, TLS, refused, timed out, or status.
   - `SystemdProbe`: `systemctl show` for each unit. Long-running units must be
     active without a restart loop; one-shot units are judged by their latest
     result, not by being inactive.
   - `TcpProbe`: connects to the RustDesk listeners on 127.0.0.1:21115-21117
     and closes. No Docker access is needed.
   - `CaddyProbe`: `/usr/local/lib/caddy/caddy adapt` parses the Caddyfile and
     its imports, then systemd supplies service, reload-recency, and
     last-reload evidence. `caddy validate` cannot run unprivileged: it opens
     every configured log file, which only the `caddy` user may do. Running it
     that way was the source of the old false "caddy config is invalid" alert.
     A permission error is reported as unknown, never as an invalid config.
   - `CloudflareDdnsProbe`: the DDNS one-shot's latest result and how long ago
     it ran.
   - `DiskProbe`: `df` for root filesystem usage.
   - `GitProbe`: read-only git commands and `BUILD.md` for each repository.
2. `CommandRunner` starts every command without a shell, with an absolute
   path, a deadline, bounded output, and a minimal environment. Children never
   inherit the collector's database password or webhook URL.
3. `HistoryWriter` stores targets, one check row per result, and the rollup in
   one transaction.
4. `AlertEvaluator` turns down results into critical alerts, and degraded or
   unknown results into warnings. `HistoryWriter` suppresses a `dedup_key`
   already sent within `STATUS_ALERT_REPEAT_AFTER_MINUTES`, and each run sends
   at most `STATUS_ALERT_MAX_NOTIFICATIONS_PER_RUN`. `WebhookNotifier` posts
   public-safe JSON. A failed delivery fails the run, so systemd shows it.
5. Check rows older than `STATUS_RETENTION_DAYS` are deleted. Rollups,
   incidents, deployments, and alert history are kept.

## The web pool

Caddy serves the stylesheet, theme scripts, icon, and robots file directly.
Every other path goes to `public/index.php` on the `status-dunamismax` PHP-FPM
pool, which runs as `status-dunamismax-web`.

1. `Config` validates `.env`, which links to `/etc/status-dunamismax/web.env`.
2. `Application` routes by exact path. Unknown paths get the 404 page, and
   known paths reject methods other than GET and HEAD with 405.
3. `MysqlStatusSource` reads the latest rollup, incidents, maintenance
   windows, and deployments with a SELECT-only account. That account has no
   grant on check rows or alert history.
4. `Freshness` compares the snapshot time with the clock. Past
   `STATUS_STALE_AFTER_MINUTES` (default 15), every snapshot page says so, the
   overview headline becomes "Status data is stale", and `/readyz` reports
   degraded.
5. `View` renders `views/*.php` inside `views/layout.php`. `Response` adds a
   strict CSP. Pages have no inline script or style.

The pool config disables `exec`, `shell_exec`, `system`, `passthru`,
`proc_open`, `popen`, and `pcntl_exec`, turns off `allow_url_fopen`, and limits
`open_basedir` to the site directory and its env file. A test also checks
that no code on the web path names a command-execution function.

If MySQL cannot be read, pages return a 503 that says so rather than showing
empty lists. `/healthz` never touches the database.

## Data

`database/schema.sql` holds the tables: `targets`, `check_runs`, `rollups`,
`incidents`, `maintenance_windows`, `deployment_events`, and
`alert_notifications`. All times are UTC `DATETIME(6)`. A rollup's snapshot is
the same JSON that `/api/status.json` publishes. The web decodes it into the
model and re-encodes it, so snapshots migrated from the Rust service are
published in the same shape.

History moved from PostgreSQL with its original ids (`bin/import-history.php`,
run by `deploy/20-migrate-history.sh`), so older check rows, rollups, and
alert suppression carry on.

## Public safety

The model has no field for private detail: repository paths exist only in
`Inventory` and appear only on `/operator`. Public reasons are fixed
phrases or counts, and raw command output is never stored. Target ids are
unique, so history rows and alert dedup keys never collide.
