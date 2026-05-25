# BUILD.md

Current implementation and operating backlog for the live Rust
`status.dunamismax` service.

`README.md` explains the product. `AGENTS.md` holds durable repo operating
rules. This file is intentionally compact now that the original phase checklist
is complete.

Last reviewed: 2026-05-22.

---

## Current State

`status.dunamismax` is a Rust 2024 Cargo workspace with one live binary:
`crates/status-web`.

The app currently provides:

- Axum HTTP routes, Leptos SSR HTML, Tokio probes, embedded CSS/assets, and
  graceful shutdown.
- Public routes for `/`, `/services`, `/projects`, `/incidents`,
  `/deployments`, `/healthz`, `/readyz`, `/api/status.json`,
  `/api/incidents.json`, `/robots.txt`, and `/icon.svg`.
- Live public HTTPS checks with timeout, latency, expected status, optional
  body-token support, and public-safe failure reasons.
- Host checks for systemd units, Docker Compose services, Docker-label
  fallback inspection, root filesystem capacity, Caddy validation and reload
  evidence, and Cloudflare DDNS latest-success evidence.
- Project checks for configured repositories, including branch, upstream,
  ahead/behind, dirty state, latest commit age, remote reachability, and
  `BUILD.md` checkbox progress when present.
- Optional PostgreSQL history for targets, check runs, rollups, incidents,
  maintenance windows, deployment events, and alert notifications.
- One-shot collector mode through `STATUS_COLLECT_ONCE=1`.
- Explicit deployment-event recording through `STATUS_RECORD_DEPLOYMENT=1`.
- Authenticated operator detail at `/operator`, disabled unless
  `STATUS_OPERATOR_TOKEN` is set.
- Public-safe alert evaluation during collector runs, with webhook delivery
  only when PostgreSQL-backed duplicate suppression and rate limits are
  available.
- Deployment templates under `deploy/` for systemd, the collector timer,
  Caddy, and environment configuration.
- Toolworks deploy integration for `status.dunamismax.com`.

Production deploy and cutover are complete on the Ubuntu host. The production
public smoke returned `ok` from `https://status.dunamismax.com/healthz`, and
the latest observed JSON rollup from
`https://status.dunamismax.com/api/status.json` returned
`"overall_state":"operational"`.

## Architecture Shape

The implementation remains one crate because the current boundaries are still
small enough to maintain directly:

```text
crates/status-web/src/
  alert.rs       alert evaluation and notification suppression
  assets.rs      embedded CSS, icon, and robots responses
  config.rs      environment configuration
  host.rs        typed host command probes
  inventory.rs   public service and project inventory
  model.rs       status domain model and rollups
  pages.rs       Leptos SSR page rendering helpers
  probes.rs      public HTTP and host probe runner
  project.rs     git and project metadata probes
  router.rs      Axum routes and tests
  store.rs       PostgreSQL migrations and repositories
```

Split into `status-core`, `status-probe`, `status-store`, and
`status-worker` only when shared ownership or independent binaries make that
separation cheaper than the current single-crate layout.

## Monitored Inventory

Public HTTPS checks:

```text
https://dunamismax.com/healthz
https://fileferry.app/healthz
https://callrift.dev/healthz
https://pod-tracker.app/healthz
https://langindex.dev/healthz
https://loveward.app/api/health
https://status.dunamismax.com/healthz
https://xrayservice.net/
```

Host service checks:

```text
dunamismax-site.service
fileferry-web.service
callrift.service
pod-tracker-web.service
pod-tracker-worker.service
status-dunamismax.service
caddy.service
cloudflare-ddns.service
rustdesk-preconfig-build.service
callrift-backup.service
pod-tracker-backup.service
```

Repository inventory is defined in `crates/status-web/src/inventory.rs` and
defaults to `/home/sawyer/github`, with `/Users/sawyer/github` as the local
macOS fallback. Override with `STATUS_REPO_ROOT` when needed.

## Operating Backlog

Use this list for future passes instead of reopening the completed phase plan:

- Keep the public UI dense, factual, and status-first as new data is added.
- Add durable runbooks under `docs/runbooks/` when production procedures change.
- Promote any repeated host-specific inventory into typed config only when
  environment parsing becomes hard to audit.
- Add richer incident or maintenance authoring only after the public read model
  stays stable.
- Revisit crate splitting when probes, store access, or collector behavior need
  separate release boundaries.
- Reconsider OpenTelemetry only after local tracing spans and an exporter
  destination are stable.

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

Ignored PostgreSQL integration test when a local database is available:

```sh
STATUS_TEST_DATABASE_URL=postgres://sawyer@localhost/postgres cargo test --workspace --all-features -- --ignored postgres
```

Local smoke, using `8096` when the production default port is occupied:

```sh
STATUS_BIND_ADDR=127.0.0.1:8096 cargo run -p status-web
curl -fsS http://127.0.0.1:8096/
curl -fsS http://127.0.0.1:8096/healthz
curl -fsS http://127.0.0.1:8096/readyz
curl -fsS http://127.0.0.1:8096/api/status.json
curl -fsS http://127.0.0.1:8096/api/incidents.json
curl -fsS http://127.0.0.1:8096/services
curl -fsS http://127.0.0.1:8096/projects
curl -fsS http://127.0.0.1:8096/incidents
curl -fsS http://127.0.0.1:8096/deployments
STATUS_COLLECT_ONCE=1 cargo run -p status-web
```

Operator smoke:

```sh
STATUS_BIND_ADDR=127.0.0.1:8096 STATUS_OPERATOR_TOKEN=local-test-token cargo run -p status-web
curl -fsS http://127.0.0.1:8096/healthz
curl -i -sS http://127.0.0.1:8096/operator
curl -fsS -H 'Authorization: Bearer local-test-token' http://127.0.0.1:8096/operator
```

Production smoke:

```sh
curl -fsS https://status.dunamismax.com/healthz
curl -fsS https://status.dunamismax.com/api/status.json
sudo systemctl is-active status-dunamismax.service
sudo caddy validate --config /etc/caddy/Caddyfile
```
