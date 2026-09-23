# Dunamis Status

Dunamis Status is the central status, operations, and project-health surface
for Stephen Sawyer's self-hosted systems. The public site lives at
[`https://status.dunamismax.com`](https://status.dunamismax.com) and reports
the health of the websites, services, repositories, deployments, and
infrastructure that power the `dunamismax` ecosystem.

## The stack

| Layer | Choice | Responsibility |
| --- | --- | --- |
| DNS | Cloudflare | Domain routing |
| Server | Ubuntu | Hosts the application, database, and files |
| Web server | Caddy | Origin HTTPS, static assets, FastCGI to PHP-FPM |
| Application | PHP 8.5, object-oriented and bespoke | Routing, rendering, probes, alerts |
| Database | MySQL 8 | Status history, incidents, deployments, alert history |
| Documents | Semantic HTML | Server-rendered status pages |
| Styling | Vanilla CSS | Dense, responsive, light and dark themes via `prefers-color-scheme` |
| Enhancement | None | The site sends zero JavaScript |

There is no framework, ORM, Composer dependency, npm project, build step,
external font, analytics, or hosted monitoring service.

```text
Visitor → Caddy → php8.5-fpm (status-dunamismax-web) → MySQL, SELECT only
systemd timer → PHP CLI collector (status-dunamismax) → host probes → MySQL
```

The work is split by privilege. A PHP CLI collector runs every five minutes
from a systemd timer, performs every probe, and writes one snapshot to MySQL.
The web pool only reads MySQL: it cannot run commands or open URLs, and its
user has no access to repositories, Docker, or the collector's credentials.

## Product goal

Dunamis Status answers:

```text
What is live, what changed, what is degraded, and what needs attention?
```

The public surface is useful without accounts. Operator-only details stay
behind an explicit bearer-token boundary. Data older than 15 minutes is shown
as stale, never as current.

## Monitored surfaces

The inventory lives in `app/Inventory.php` and describes the target host
state: every site on Caddy, php8.5-fpm, and MySQL, with no
`dunamismax-site.service` and no PostgreSQL.

- Public HTTPS: `dunamismax.com`, `graceandfootnotes.com`,
  `status.dunamismax.com`, `xrayservice.net`
- Application services: `mtg-card-bot.service`, `status-dunamismax-collector.timer`
- Remote access: RustDesk listeners on TCP 21115, 21116, and 21117 (loopback)
- Databases: `mysql.service`
- Host infrastructure: `caddy.service`, `php8.5-fpm.service`,
  `docker.service`, `containerd.service`, Caddy configuration, Cloudflare DDNS
- Network and access: `ssh`, `tailscaled`, `fail2ban`, `ufw`, `cloudflare-ddns`
- Maintenance: server disk cleanup, the RustDesk installer rebuild, and this
  site's backup, each with its timer
- Host capacity: root filesystem usage
- Repositories: `dunamismax.com`, `mtg-card-bot`, `status.dunamismax`,
  `xrayservice` (branch, upstream, ahead/behind, dirty state, commit age,
  `BUILD.md` progress)

## Routes

| Route | Purpose |
| --- | --- |
| `GET /` | Overview: rollup, attention list, groups, services by category |
| `GET /services` | Every service check |
| `GET /projects` | Repository status |
| `GET /incidents` | Incidents and maintenance windows |
| `GET /deployments` | Recorded deployments |
| `GET /operator` | Private detail; 404 unless `STATUS_OPERATOR_TOKEN` is set, then `Authorization: Bearer` |
| `GET /healthz` | `ok`, without touching the database |
| `GET /readyz` | MySQL and snapshot-freshness readiness |
| `GET /api/status.json` | The latest snapshot |
| `GET /api/incidents.json` | Incidents and maintenance feed |
| `GET /assets/status.css`, `/icon.svg`, `/robots.txt` | Static, served by Caddy |

The JSON shapes are unchanged from the Rust service that preceded this
application.

## Local development

PHP 8.5 with `pdo_mysql`, `posix`, and `tokenizer`. No packages to install.

```sh
cp .env.example .env
make serve          # http://127.0.0.1:8096, database-free preview
make collect        # runs every probe once and prints the snapshot JSON
make check          # php -l, bash -n, and the dependency-free tests
```

With a local MySQL database, set `DB_*` in `.env`, then `make database` to
apply `database/schema.sql`, and `make collect` stores snapshots instead of
printing them. The opt-in integration test needs a dedicated, empty database
whose name ends in `_test`:

```sh
APP_ENV=test DB_NAME=status_dunamismax_test DB_USER=... DB_PASSWORD=... php tests/database.php
```

Record a deployment (the collector account inserts it):

```sh
php bin/record-deployment.php --service-id status-dunamismax --repo-name status.dunamismax --commit-sha "$(git rev-parse HEAD)"
```

## Layout

```text
app/                 Application, configuration, model, probes, stores, alerts, CLI commands
bin/                 collect, record-deployment, import-history, smoke, database, check
database/schema.sql  MySQL schema (safe to reapply)
deploy/              Caddy site, PHP-FPM pool, systemd units, backup, numbered sudo scripts
dev/router.php       Local PHP server routing
docs/                Architecture and production runbook
public/              The only web root
tests/               Dependency-free checks and the opt-in MySQL integration test
views/               HTML templates
```

## Production

Production runs from `/srv/www/status.dunamismax.com/current`, a symlink to a
versioned release. See [docs/production.md](docs/production.md) for the
layout, the numbered sudo scripts, backups, and rollback, and
[docs/architecture.md](docs/architecture.md) for how the pieces fit.

Public pages never show private paths, process arguments, env values,
credentials, host-local addresses, database names, backup paths, raw logs,
stack traces, or command output.

## License

MIT. See [LICENSE](LICENSE).
