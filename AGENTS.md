# AGENTS.md

Repo-local operating manual for `status.dunamismax`. Reading this file plus
`README.md` and `BUILD.md` is sufficient context to begin work.

`README.md` explains the live product. `BUILD.md` records the current
implementation shape and operating backlog. `docs/` holds the architecture and
the production runbook. This file holds durable engineering, safety,
monitoring, deployment, and repository rules.

## Read Order

1. `AGENTS.md` (this file)
2. `README.md`
3. `BUILD.md`
4. Task-relevant code, tests, `docs/`, deploy files, or probe references

Do not create extra prompt, bootstrap, continuity, profile, scheduler, or
agent-instruction files. If durable repo behavior matters, put it here.

---

## Identity

You are working with Stephen Sawyer (`dunamismax`).

This repo is Stephen's live operational control surface for self-hosted
services, public websites, repository health, deployments, and project status.

## Priority Stack

1. Reality first. If a probe, command, repo, runtime, or doc did not show it,
   it is not known.
2. Safety second. Do not expose secrets, private host details, credentials,
   database URLs, raw logs, backup paths, or internal-only operational data.
3. Production third. Monitoring must not destabilize the services it observes.
4. Verification fourth. Checked beats plausible.
5. Clarity fifth. Status output must be short, explainable, and actionable.

Never fake uptime, hide uncertainty, invent probe results, overstate coverage,
or present stale data as current.

---

## Product Boundaries

- The public domain is `status.dunamismax.com`.
- The app monitors Stephen's websites, self-hosted services, repositories,
  deployments, and project status.
- The app is first an observer. Do not turn it into a deploy orchestrator,
  restart panel, or remote shell until Stephen explicitly asks.
- Public pages may show service names, health state, broad reasons, last check
  time, incidents, and maintenance notes.
- Public pages must not show private paths, process arguments, env values,
  credentials, host-local IP topology, exact database names, backup paths, raw
  logs, stack traces, or command output.
- Operator-only details require a deliberate access boundary before exposure.
- Unknown is an honest state. Do not coerce unknown into operational.
- One-shot services such as Cloudflare DDNS or data ingestion workers may be
  inactive after success. Evaluate their latest result, not only active state.

## Stack Rules

- Application code is bespoke, object-oriented PHP 8.5 in the `Status\`
  namespace under `app/`, autoloaded by `bootstrap.php`. No framework, ORM,
  Composer dependency, npm project, or build step.
- Use only the installed extensions (no curl, mbstring, or intl). HTTP goes
  through stream contexts. Use `iconv` for character counts.
- MySQL 8 on 127.0.0.1 through PDO with prepared statements. All times are UTC
  `DATETIME(6)`. `database/schema.sql` only creates missing tables; schema
  changes need reviewed migration SQL.
- Semantic HTML templates in `views/`, vanilla CSS in `public/assets/`. The
  site sends zero JavaScript: the light or dark theme follows
  `prefers-color-scheme`. No inline style.
- Caddy serves static files and FastCGI to the `status-dunamismax` php8.5-fpm
  pool. systemd runs the collector timer.
- Shell scripts are acceptable only as deployment and sudo glue in `deploy/`.
- No Rust, PostgreSQL, Docker Compose, or managed monitoring SaaS.

## Privilege Split

- The collector (`bin/collect.php`, user `status-dunamismax`,
  `collector.env`) does all probing and all writes.
- The web pool (user `status-dunamismax-web`, `web.env`) only reads MySQL with
  a SELECT-only account. It never runs commands, opens URLs, or reads
  repositories. The pool disables command execution and `allow_url_fopen`,
  and a test checks that no code on the web path names a command function.
  Keep it that way.
- The collector runs commands only through `CommandRunner`: an absolute
  program path, no shell, a deadline, bounded output, and a minimal
  environment with no secrets.
- Neither user may read the other's env file. Never add the collector back to
  the docker group, and never widen its read-only ACL on `/home/sawyer/github`.

## Status Model Rules

Use stable states:

```text
operational
degraded
down
maintenance
unknown
```

Every check result carries a target id, check kind, observed state,
checked-at timestamp, latency or duration when relevant, a short public-safe
reason, and a probe version. Target ids are unique across all checks.

Rollups must be explainable. If a site is `degraded`, the UI should make clear
which check degraded it and when.

Do not reduce the product back to a single public HTTP check. The live system
also tracks host, repository, deployment, history, and alert evidence.

The published JSON shapes of `/api/status.json`, `/api/incidents.json`, and
`/readyz` are a contract. Add fields only deliberately; never rename or remove
them.

## Probe Rules

HTTP probes:

- Use timeouts and record latency.
- Check the expected status and optional body token.
- Distinguish DNS/TLS/connection refused/timeout/HTTP status/body mismatch.
- Avoid crawling full sites in the normal loop.

systemd probes:

- Treat `active` service units as running.
- Treat successful one-shot units as healthy if their latest run succeeded and
  is fresh enough for their purpose.
- Treat restart loops as degraded or down even if the current instant says
  active.
- Do not publish full journal output publicly.

TCP probes:

- Connect and close; send nothing. Use them where a listener is the evidence,
  such as RustDesk on 127.0.0.1:21115-21117, instead of container access.

Capacity probes:

- Monitor root filesystem usage directly.
- Treat high usage as degraded before it becomes an outage.
- Keep public reasons broad: percentage full and available space are okay;
  private path inventories are not.

Git probes:

- Read branch, upstream, ahead/behind, dirty state, and latest commit age.
- Do not automatically clean, reset, stash, or pull from the status app.
- Dirty server checkouts are status evidence, not something the monitor fixes.

Caddy probes:

- Always use `/usr/local/lib/caddy/caddy`; `/usr/bin/caddy` is a stale package
  binary that rejects the production config.
- The collector runs `caddy adapt` (a parse that needs no privileges) plus
  systemd reload evidence. `caddy validate` needs the caddy user because it
  opens log files. Never widen permissions to make it work unprivileged.
- A permission error is unknown, never "invalid config".
- Do not expose full Caddyfile contents publicly.

## Web UX Rules

- Build a real status surface, not a decorative landing page.
- The first viewport should answer whether the ecosystem is operational.
- Use calm operational language: operational, degraded, down, maintenance,
  unknown, last checked, affected, recovered.
- Do not use giant marketing hero patterns that bury status data.
- Public status cards should be dense, readable, and scannable on mobile.
- Color must not be the only state indicator.
- Timestamps must be clear about freshness.
- Prefer small tables, grouped service lists, incident timelines, and concise
  reason text over decorative cards.
- If data is stale, show it as stale. A snapshot older than
  `STATUS_STALE_AFTER_MINUTES` is labelled on every page.

## Deployment Rules

- Production runs on Ubuntu, Caddy, php8.5-fpm, MySQL, and systemd.
- Releases live in `/srv/www/status.dunamismax.com/releases/<commit>` behind
  the `current` symlink; only `public/` is a web root.
- Keep `/healthz` public and cheap, with no database access.
- Keep `/readyz` for MySQL and snapshot-freshness readiness.
- Keep the Caddy site, FPM pool, units, and backup under `deploy/` aligned
  with production.
- Root-only work goes in numbered `deploy/` scripts for the owner to run:
  `set -euo pipefail`, refuse without root, idempotent, back up every changed
  file to `/root/status-dunamismax-backup-<timestamp>/`, and print verification
  and rollback steps. Validate Caddy as the caddy user with the custom binary,
  run `php-fpm8.5 -t` first, and reload, never restart, shared services.
- Edit only this site's Caddy block, pool, database, units, and files. Other
  sites share the host.
- Record deployments with `bin/record-deployment.php`. Keep this service in
  Toolworks' all-in-one deploy workflow.

## Repository Hygiene

- Keep `README.md` focused on product, status, architecture, routes, and
  production shape.
- Keep `BUILD.md` as the living checklist and backlog.
- Keep durable runbooks under `docs/`.
- Keep this file for persistent repo-local rules.
- Update docs in the same pass as stack, route, probe, or deployment behavior.
- Do not commit `.env`, production config, secrets, database dumps, backup
  files, generated output, or host-local status snapshots.

## Git And Remotes

Stephen's standard repo setup is dual-push SSH on `origin`: one fetch URL plus
multiple `pushurl` entries for GitHub and Codeberg.

- Before substantial changes, inspect branch, status, and remotes.
- Prefer `git pull --ff-only origin main` before major implementation work
  when network access is available and appropriate.
- Prefer `git push origin <branch>` for routine pushes; this should push to
  both configured push URLs.
- Attribute committed work to the repo's configured `dunamismax` identity.
- Do not override commit authors with `-c user.name=...` or
  `-c user.email=...`.
- If `git config user.email` is not a `dunamismax`-owned address, stop before
  committing.
- Never force-push `main`.
- Never include AI, assistant, co-author, or similar attribution in commits,
  release notes, or public docs.

## Verification

Docs-only changes:

```sh
git diff --check
```

Code changes:

```sh
make check          # php -l on every PHP file, bash -n on deploy scripts, tests/run.php
```

Data access or schema changes, against a dedicated empty `_test` database:

```sh
APP_ENV=test DB_NAME=status_dunamismax_test DB_USER=... DB_PASSWORD=... php tests/database.php
```

Local smoke:

```sh
make serve
curl -fsS http://127.0.0.1:8096/healthz
curl -fsS http://127.0.0.1:8096/api/status.json
make collect
```
