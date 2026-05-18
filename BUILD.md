# BUILD.md

Active build plan for `status.dunamismax`, the Rust status and operations
surface for Stephen Sawyer's self-hosted projects.

`README.md` explains the product. `AGENTS.md` holds durable repo operating
rules. This file stays focused on current state, phase order, open work, and
verification.

Last reviewed: 2026-05-18.

---

## Current Baseline

Observed on 2026-05-18:

- Repository exists at `/home/sawyer/github/status.dunamismax`.
- Remote fetch URL is GitHub:
  `git@github.com-dunamismax:dunamismax/status.dunamismax.git`.
- `origin` is configured for dual push to GitHub and Codeberg.
- Domain target is `https://status.dunamismax.com`.
- DNS is already routed to the Ubuntu host.
- Foundational repository files exist: `LICENSE`, `README.md`, `BUILD.md`,
  and `AGENTS.md`.
- The first Rust workspace pass now exists with `crates/status-web`, live
  public HTTP probes, embedded assets, and Axum routes for the public status
  shell.
- Typed host-probe primitives now exist for systemd units, Docker Compose JSON,
  Caddy validation/reload evidence, Cloudflare DDNS last-success status,
  public-safe host reasons, and service-to-public-site mapping. Public routes
  now expose the summarized host checks without raw command output.
- Project status now exists for premier repositories with git branch,
  ahead/behind, dirty state, latest commit age, remote reachability, and
  `BUILD.md` checkbox progress.
- Public and project inventory now includes `fileferry.app`, `xrayservice.net`,
  `status.dunamismax`, `fileferry`, and the other local project checkouts under
  `/home/sawyer/github`.
- Optional PostgreSQL-backed history now exists with migrations for targets,
  check runs, rollups, incidents, maintenance windows, and deployment events.
- `STATUS_COLLECT_ONCE=1` runs a timer-friendly one-shot collection path that
  records a snapshot when `STATUS_DATABASE_URL` is configured.
- `STATUS_RECORD_DEPLOYMENT=1` records an explicit deployment event when
  `STATUS_DATABASE_URL` is configured.
- `/incidents` and `/deployments` render public-safe history views backed by
  PostgreSQL when records exist.
- `/api/incidents.json` exposes a public-safe incident and maintenance feed.
- Deployment templates exist under `deploy/` for systemd, a collector timer,
  Caddy, and the runtime environment file.
- Toolworks' all-in-one self-hosted Rust deploy workflow includes
  `status.dunamismax.com` and records deployment events when status history is
  configured.
- The intended runtime is Rust, Axum, Leptos SSR, Tokio, Caddy, systemd, and
  PostgreSQL when durable history is needed.
- Reference implementation patterns:
  - `/home/sawyer/github/fileferry` for the FileFerry Rust Leptos/Axum site and
    repo-doc style.
  - `/home/sawyer/github/dunamismax.com` for Rust website migration,
    Caddy/systemd deployment, and portfolio/project content discipline.
  - `/home/sawyer/github/callrift` for production Rust app, PostgreSQL,
    deployment, and service-health expectations.
  - `/home/sawyer/github/0xvane` for Rust web plus sidecar service model.
  - `/home/sawyer/github/toolworks/automation/self-hosted-rust-deploy` for the
    current all-in-one host deploy workflow.

---

## Product Objective

Build the central status surface for the `dunamismax` ecosystem:

- public health of websites and services
- private/operator health of host units, containers, repositories, deploys,
  backups, and infrastructure
- project status summarized from repo metadata and `BUILD.md`
- historical status and deployment evidence over time

The public page should be calm, factual, and useful. It should not expose
secrets, internal host details, exact credentials, private logs, or noisy stack
traces.

---

## Stack Direction

- **Rust 2024** workspace.
- **Axum** for routing, health endpoints, JSON APIs, middleware, graceful
  shutdown, and server state.
- **Leptos SSR** for the public and operator web UI.
- **Tokio** for async probes and worker loops.
- **PostgreSQL** for durable status history, incidents, deployment records,
  and project snapshots once persistence is needed.
- **sqlx** for migrations and explicit database access.
- **tracing** for structured logs.
- **tower-http** for request tracing, compression, headers, and static asset
  handling where useful.
- **OpenTelemetry** only after local `tracing` spans are stable and there is a
  concrete exporter target; do not add an observability stack before the
  status model itself is reliable.
- **figment** or **config** only if inventory, operator boundary, database,
  and alert configuration outgrow explicit environment parsing.
- **reqwest** for public and local HTTP probes.
- **serde** for inventory, status JSON, and API payloads.
- **thiserror** for domain and probe errors.
- **systemd** and **Docker Compose** queried through narrow, typed command
  wrappers at the edge.
- **Caddy** terminates TLS and proxies to the local Rust service.

Default against:

- a client-side SPA
- managed monitoring SaaS as the source of truth
- Kubernetes or a distributed monitoring stack
- scraping HTML where a health endpoint exists
- public exposure of private host paths or process details
- shell-command sprawl outside a typed probe boundary
- alerting before the status model is stable

---

## Product Invariants

- `status.dunamismax.com` is the canonical public URL.
- The app must be self-hostable on the same Ubuntu VM as the services it
  monitors.
- Public status must separate `operational`, `degraded`, `down`,
  `maintenance`, and `unknown`.
- Unknown is a real state, not a hidden success.
- Every displayed check should include last checked time and enough reason to
  explain the rollup.
- Public views must avoid secrets, internal-only paths, private env values,
  database URLs, exact backup paths, and raw logs.
- Operator-only details require an explicit access boundary before they are
  exposed over the public internet.
- The status app must not become a deployment orchestrator before it is a
  reliable observer.
- The status app must not make claims that have not been observed by probes or
  recorded evidence.

---

## Target Workspace

Preferred full shape:

```text
Cargo.toml
rust-toolchain.toml
crates/
  status-core/       domain model, rollups, target inventory, policies
  status-probe/      HTTP, systemd, Docker, git, Caddy, and host probes
  status-store/      sqlx migrations and repositories
  status-web/        Axum + Leptos SSR routes, UI, assets, JSON endpoints
  status-worker/     scheduled collection, persistence, alert evaluation
xtask/               build, smoke, deploy, inventory, and maintenance helpers
deploy/
  caddy/status.dunamismax.caddy
  systemd/status-dunamismax.service
  status.env.example
docs/
  inventory/
  runbooks/
```

Start with one binary if that reduces first-pass friction, but keep ownership
boundaries clear enough to split once probes and persistence grow.

---

## Phase Plan

Each coding pass should leave the repo coherent, update this file, commit the
work, and push through `origin` so both configured push remotes receive it.

### Phase 0: Repo Foundation

Goal: establish product direction and repo-local operating rules.

- [x] Clone repository to `/home/sawyer/github/status.dunamismax`.
- [x] Configure dual-push `origin` remotes.
- [x] Review reference `README.md`, `BUILD.md`, and `AGENTS.md` files from
      premier Rust/self-hosted repos.
- [x] Add `README.md`.
- [x] Add `BUILD.md`.
- [x] Add `AGENTS.md`.

Exit criteria: a future pass can scaffold the Rust app without rediscovering
the product, stack, deployment target, or safety boundaries.

### Phase 1: Rust Web Scaffold

Goal: create the smallest deployable Rust web app for
`status.dunamismax.com`.

- [x] Add root `Cargo.toml` workspace and `rust-toolchain.toml`.
- [x] Add `crates/status-web` with Axum, Leptos SSR, Tokio, tracing, and
      graceful shutdown.
- [x] Add config for `STATUS_BIND_ADDR`, defaulting to `127.0.0.1:8095`.
- [x] Add `/healthz`, `/readyz`, `/`, `/services`, and `/api/status.json`.
- [x] Embed CSS and icon assets in the binary for the first pass.
- [x] Add route tests for health, home, services, and status JSON.
- [x] Evaluate `justfile` or `xtask`; plain Cargo commands are sufficient for
      now.

Exit criteria: `cargo fmt`, `cargo clippy`, `cargo test`, and `cargo build`
pass, and `cargo run -p status-web` serves a real status shell.

### Phase 2: Static Inventory And Public Probes

Goal: show useful public status from explicit inventory plus live HTTP checks.

- [x] Define typed monitor targets for each public website.
- [x] Add public HTTP probes with timeout, expected status, and optional
      expected body token.
- [x] Add rollup logic for operational/degraded/down/unknown.
- [x] Render service table with last checked time, latency, status, and short
      reason.
- [x] Add JSON output for machines and future automation.
- [x] Include initial targets:
      `dunamismax.com`, `fileferry.app`, `callrift.dev`,
      `pod-tracker.app`, `langindex.dev`, `0xvane.dev`, `debugpath.dev`,
      `status.dunamismax.com`, and `xrayservice.net`.

Exit criteria: the page truthfully reports public website health without
touching private host state.

### Phase 3: Host Service Probes

Goal: add local operator-grade host health while keeping public output safe.

- [x] Add typed systemd probe wrapper for selected units.
- [x] Add Docker Compose probe for LangIndex and any future compose services.
- [x] Add Caddy validate/reload recency probe.
- [x] Add Cloudflare DDNS last-success probe from systemd journal or status.
- [x] Add service-to-public-site mapping.
- [x] Keep raw command output private and summarize public-safe reasons.

Exit criteria: local service state contributes to rollups without leaking
private host details.

### Phase 4: Repository And Project Status

Goal: show project health, not just uptime.

- [x] Add git probe for branch, clean/dirty state, ahead/behind, latest commit
      age, and remote reachability.
- [x] Read project phase metadata from repo files where practical.
- [x] Summarize `BUILD.md` checkbox progress without pretending it is
      authoritative runtime truth.
- [x] Add project cards for premier repos first:
      `fileferry`, `dunamismax.com`, `callrift`, `pod-tracker`,
      `langindex`, `0xvane`, `debugpath`,
      `status.dunamismax`, `toolworks`, and the other local project
      checkouts under `/home/sawyer/github`.
- [x] Add stale-branch and dirty-worktree warnings for server checkouts.

Exit criteria: Stephen can see which projects are live, changing, stale, or
needing a coding pass.

### Phase 5: Persistence And History

Goal: store enough history to make incidents and deploys visible over time.

- [x] Add PostgreSQL database config and pool.
- [x] Add `sqlx` migrations for targets, check runs, rollups, incidents, and
      deployment events.
- [x] Add worker loop or systemd timer-friendly one-shot collector.
- [x] Retain raw private probe details only if there is a clear operator need
      and access boundary.
- [x] Add retention policy for noisy check rows.
- [x] Add tests against a real PostgreSQL instance.

Exit criteria: status history survives app restarts and supports incident and
deployment timelines.

### Phase 6: Incidents, Maintenance, And Deploy Evidence

Goal: make the status site operationally useful during change windows.

- [x] Add incident model: title, affected services, state, started, resolved,
      and public notes.
- [x] Add maintenance windows.
- [x] Add deployment event records from Toolworks or explicit CLI/xtask input.
- [x] Render `/incidents` and `/deployments`.
- [x] Add RSS or JSON feed for incident updates if useful.

Exit criteria: the site explains both current state and recent operational
context.

### Phase 7: Production Deploy

Goal: serve the app at `https://status.dunamismax.com`.

- [x] Add `deploy/systemd/status-dunamismax.service`.
- [x] Add `deploy/status.env.example`.
- [x] Add `deploy/caddy/status.dunamismax.caddy` proxying to
      `127.0.0.1:8095`.
- [ ] Create unprivileged `status-dunamismax` user on the host.
- [ ] Install release binary under `/opt/status-dunamismax`.
- [ ] Append or import the Caddy site block.
- [ ] Validate and reload Caddy.
- [x] Add this service to Toolworks
      `automation/self-hosted-rust-deploy/deploy-all.sh`.
- [x] Local smoke:
      `curl -fsS http://127.0.0.1:8095/healthz`.
- [ ] Public smoke:
      `curl -fsS https://status.dunamismax.com/healthz`.

Exit criteria: the public domain serves the Rust status app through Caddy and
the all-in-one deploy workflow includes it.

### Phase 8: Operator Boundary And Alerts

Goal: add private detail and notifications without exposing the host.

- [ ] Choose the first operator boundary: local-only, Tailscale-only, or
      authenticated web route.
- [ ] Add operator detail pages only behind that boundary.
- [ ] Add alert rules after check stability is proven.
- [ ] Add notification targets only after rate limits and duplicate
      suppression exist.
- [ ] Evaluate OpenTelemetry export after probe/request spans have stable
      names and the destination is known.
- [ ] Revisit config loading with `figment` or `config` if operator, alert,
      and inventory settings need layered files plus environment overrides.
- [ ] Document alert severity and escalation behavior.

Exit criteria: private status detail and alerts are useful without becoming
noisy or publicly unsafe.

---

## Initial Monitor Inventory

Public HTTP checks:

```text
https://dunamismax.com/healthz
https://fileferry.app/healthz
https://callrift.dev/healthz
https://pod-tracker.app/healthz
https://langindex.dev/healthz
https://0xvane.dev/health
https://debugpath.dev/healthz
https://status.dunamismax.com/healthz
https://xrayservice.net/
```

Host services:

```text
dunamismax-site.service
fileferry-web.service
callrift.service
pod-tracker-web.service
pod-tracker-worker.service
vane-web.service
vane-worker.service
vane-ssh.service
debugpath-site.service
debugpath-ssh.service
status-dunamismax.service
caddy.service
cloudflare-ddns.service
rustdesk-preconfig-build.service
callrift-backup.service
pod-tracker-backup.service
```

`vane-worker.service` and `cloudflare-ddns.service` may be successful
run-and-exit services. Do not mark inactive one-shot services as down without
checking their latest exit status.

---

## Verification

Docs-only changes:

```sh
git diff --check
```

Expected Rust gate after Phase 1:

```sh
cargo fmt --all --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
cargo build --workspace
```

Last verified on 2026-05-18:

```sh
cargo fmt --all --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
STATUS_TEST_DATABASE_URL=postgres://sawyer@localhost/postgres cargo test --workspace --all-features -- --ignored postgres
cargo build --workspace
bash -n /home/sawyer/github/toolworks/automation/self-hosted-rust-deploy/deploy-all.sh
```

Local web smoke after Phase 1:

```sh
cargo run -p status-web
curl -fsS http://127.0.0.1:8095/healthz
curl -fsS http://127.0.0.1:8095/readyz
curl -fsS http://127.0.0.1:8095/api/status.json
curl -fsS http://127.0.0.1:8095/api/incidents.json
curl -fsS http://127.0.0.1:8095/projects
curl -fsS http://127.0.0.1:8095/incidents
curl -fsS http://127.0.0.1:8095/deployments
STATUS_COLLECT_ONCE=1 cargo run -p status-web
```

Last local smoke on 2026-05-18:

```sh
cargo run -p status-web
curl -fsS http://127.0.0.1:8095/healthz
curl -fsS http://127.0.0.1:8095/readyz
curl -fsS http://127.0.0.1:8095/api/status.json
curl -fsS http://127.0.0.1:8095/api/incidents.json
curl -fsS http://127.0.0.1:8095/projects
curl -fsS http://127.0.0.1:8095/incidents
curl -fsS http://127.0.0.1:8095/deployments
STATUS_COLLECT_ONCE=1 cargo run -p status-web
```

Observed JSON rollup during the latest smoke: 7 public targets operational and
`status.dunamismax.com` down because DNS, TLS, or connection failed. This is
expected until the public domain serves this app. The smoke also returned 8
project records, rendered `/projects` with `BUILD.md` progress, rendered empty
public-safe `/incidents` and `/deployments` history views, returned an empty
public-safe `/api/incidents.json` feed, and emitted valid one-shot collector
JSON.

Production smoke after Phase 7:

```sh
curl -fsS https://status.dunamismax.com/healthz
curl -fsS https://status.dunamismax.com/api/status.json
sudo systemctl is-active status-dunamismax.service
sudo caddy validate --config /etc/caddy/Caddyfile
```
