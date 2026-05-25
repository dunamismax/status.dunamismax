# AGENTS.md

Repo-local operating manual for `status.dunamismax`. Reading this file plus
`README.md` and `BUILD.md` is sufficient context to begin work.

`README.md` explains the live product. `BUILD.md` records the current
implementation shape and operating backlog. This file holds durable
engineering, safety, monitoring, deployment, and repository rules.

## Read Order

1. `AGENTS.md` (this file)
2. `README.md`
3. `BUILD.md`
4. Task-relevant code, tests, deploy files, host runbooks, or probe references

Do not create extra prompt, bootstrap, continuity, profile, scheduler, or
agent-instruction files. If durable repo behavior matters, put it here.

---

## Identity

You are working with Stephen Sawyer (`dunamismax`).

This repo represents Stephen's live Rust operational control surface for
self-hosted services, public websites, repository health, deployments, and
project status.

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

- Use a Rust 2024 Cargo workspace.
- Use Axum for HTTP routes, extractors, middleware, health endpoints, JSON
  APIs, and graceful shutdown.
- Use Leptos SSR for public and operator UI.
- Use Tokio as the async runtime.
- Use `tracing` and `tracing-subscriber` for logs.
- Use `tower-http` when it cleanly solves tracing, compression, headers, or
  static asset behavior.
- Use PostgreSQL with `sqlx` for durable status history.
- Use `serde` for inventory, status snapshots, and JSON APIs.
- Use `thiserror` for domain and probe errors.
- Use `reqwest` for HTTP probes.
- Keep shell command probes narrow and typed. Parse structured output where a
  command offers it.
- Keep probe side effects read-only unless a later phase explicitly adds
  operator actions.
- Prefer embedded CSS/assets while the public UI remains compact.

Default against:

- Additional web app frameworks outside the Rust workspace.
- Managed monitoring SaaS as the source of truth.
- Kubernetes or distributed observability infrastructure.
- Shelling out from UI handlers directly.
- Global mutable status state without clear refresh and staleness rules.
- Public display of raw command output.
- Alerting before checks, severity, and duplicate suppression are stable.

## Status Model Rules

Use stable states:

```text
operational
degraded
down
maintenance
unknown
```

Every check result should carry:

- target id
- check kind
- observed state
- checked-at timestamp
- latency or duration when relevant
- short public-safe reason
- optional private detail stored only behind an operator boundary
- source/probe version where useful

Rollups must be explainable. If a site is `degraded`, the UI should make clear
which check degraded it and when.

Do not reduce the product back to a single public HTTP check. The live system
also tracks host, repository, deployment, history, and alert evidence.

## Probe Rules

HTTP probes:

- Use timeouts.
- Record latency.
- Check expected status and optional body token.
- Distinguish DNS/TLS/connect timeout/HTTP status/body mismatch.
- Avoid crawling full sites in the normal loop.

systemd probes:

- Treat `active` service units as running.
- Treat successful one-shot units as healthy if their latest run succeeded and
  is fresh enough for their purpose.
- Treat restart loops as degraded or down even if the current instant says
  active.
- Do not publish full journal output publicly.

Docker probes:

- Prefer `docker compose ps --format json` or structured output where
  available.
- Fall back to `docker ps` Compose labels when a Compose file requires
  deployment-only environment variables for interpolation.
- Treat container health checks as evidence when configured.

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

- `caddy validate --config /etc/caddy/Caddyfile` is evidence.
- Caddy reload status and certificate state are operationally relevant.
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
- If data is stale, show it as stale.

## Deployment Rules

- Production runs on Ubuntu LTS, Caddy, and systemd.
- The app binds to localhost, default `127.0.0.1:8095`.
- Caddy terminates TLS for `status.dunamismax.com`.
- Run as the unprivileged `status-dunamismax` service user.
- Keep `/healthz` public and cheap.
- Keep `/readyz` available for dependency readiness.
- Keep Caddy/systemd/env templates under `deploy/` aligned with production.
- Keep this service in Toolworks' all-in-one deploy workflow.
- Do not expose host-only Caddy details publicly.

## Repository Hygiene

- Keep `README.md` focused on product, status, architecture, routes, and
  production shape.
- Keep `BUILD.md` as the living phase plan and checklist.
- Keep durable runbooks under `docs/` once implementation details settle.
- Keep this file for persistent repo-local rules.
- Update docs in the same pass as stack, route, probe, or deployment behavior.
- Do not commit `.env`, production config, secrets, database dumps, backup
  files, generated build outputs, or host-local status snapshots.

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

Rust gate:

```sh
cargo fmt --all --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
cargo build --workspace
```

After the web app exists:

```sh
cargo run -p status-web
curl -fsS http://127.0.0.1:8095/healthz
curl -fsS http://127.0.0.1:8095/api/status.json
```
