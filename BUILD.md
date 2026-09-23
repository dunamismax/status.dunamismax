# BUILD.md

Current implementation and operating backlog for `status.dunamismax`.

`README.md` explains the product. `AGENTS.md` holds durable repo operating
rules. `docs/` holds the architecture and production runbook.

Last reviewed: 2026-09-23.

---

## Current State

`status.dunamismax` is a bespoke PHP 8.5 application on Caddy, php8.5-fpm, and
MySQL. It replaced the Rust `status-web` service and its PostgreSQL history.

The app provides:

- Public routes for `/`, `/services`, `/projects`, `/incidents`,
  `/deployments`, `/healthz`, `/readyz`, `/api/status.json`,
  `/api/incidents.json`, `/assets/status.css`, `/icon.svg`, and `/robots.txt`,
  with the same JSON shapes as the Rust service.
- `/operator`, disabled unless `STATUS_OPERATOR_TOKEN` is set, then behind a
  bearer token.
- A PHP CLI collector on a five-minute systemd timer that does every probe
  and all writes: public HTTPS, systemd units, RustDesk TCP listeners, Caddy
  (`caddy adapt` with the custom binary plus reload evidence), Cloudflare DDNS
  recency, root filesystem capacity, and repository state.
- A web pool that only reads MySQL through a SELECT-only account and cannot
  run commands.
- Staleness labelling on every snapshot page and in `/readyz`.
- Webhook alerts with durable duplicate suppression, a per-run limit, and
  check-row retention.
- Deployment recording through `bin/record-deployment.php`.
- Numbered sudo scripts for provisioning, history migration, deployment,
  cutover, and decommission, plus a daily backup timer.

## Migration Checklist

- [x] Port the status model, probes, rollups, alerts, and pages to PHP.
- [x] Split privileges between the collector and the web pool.
- [x] Replace the Docker Compose probes with TCP probes on 21115-21117.
- [x] Replace the false-positive Caddy validate probe.
- [x] Monitor the target state: Caddy, php8.5-fpm, MySQL, mtg-card-bot,
      docker, and containerd; no dunamismax-site.service or PostgreSQL.
- [x] Remove rustdesk-selfhosted from the project inventory.
- [x] Write the MySQL schema and the PostgreSQL history import.
- [x] Rehearse export, import, collection, and every route on disposable
      PostgreSQL 18 and MySQL 8.4 servers.
- [ ] Owner runs `deploy/10-provision.sh`.
- [ ] Owner runs `deploy/20-migrate-history.sh`.
- [ ] Owner runs `deploy/30-deploy.sh`.
- [ ] Owner runs `deploy/40-cutover.sh`.
- [ ] Owner runs `deploy/50-decommission.sh` after confirming the cutover.
- [ ] Point Toolworks' deployment recording at `bin/record-deployment.php`.

## Operating Backlog

- Keep the public UI dense, factual, and status-first as new data is added.
- Rollups are kept indefinitely, as before; add rollup retention if the table
  grows past what the backups should carry.
- Add richer incident or maintenance authoring only after the public read
  model stays stable. Today rows are inserted by the MySQL administrator.
- Consider absence checks (for example, that PostgreSQL is gone) once the
  other sites finish their migrations.

## Verification

```sh
make check
APP_ENV=test DB_NAME=status_dunamismax_test DB_USER=... DB_PASSWORD=... php tests/database.php
```

Production smoke:

```sh
curl -fsS https://status.dunamismax.com/healthz
curl -fsS https://status.dunamismax.com/readyz
curl -fsS https://status.dunamismax.com/api/status.json
sudo -u status-dunamismax-web php /srv/www/status.dunamismax.com/current/bin/smoke.php
```
