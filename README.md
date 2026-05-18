# Dunamis Status

Dunamis Status is the central status, operations, and project-health surface
for Stephen Sawyer's self-hosted systems. The public site will live at
[`https://status.dunamismax.com`](https://status.dunamismax.com) and report
the health of the websites, services, repositories, deployments, and
infrastructure that power the `dunamismax` ecosystem.

The target stack is the current Rust web standard used across Stephen's newer
projects:

- Rust 2024 Cargo workspace
- Axum HTTP server
- Leptos server-rendered UI
- Tokio runtime
- PostgreSQL for durable status history
- Caddy and systemd on the Ubuntu host

## Product Goal

Dunamis Status answers:

```text
What is live, what changed, what is degraded, and what needs attention?
```

It should become the single page Stephen can open to understand:

- public website health
- Rust service health
- systemd unit state
- Docker Compose service state
- local HTTP health probes
- public HTTPS health probes
- Caddy config validity and reload status
- Cloudflare DDNS recency
- Git repository branch, dirty, ahead, and behind state
- deployment age and active release paths
- build/test status for key repos
- database backup freshness
- project phase and handoff status from `BUILD.md`

The first version should be useful without accounts. Operator-only details can
arrive after the public status page is trustworthy.

## Initial Monitored Surfaces

Core public sites:

- `https://dunamismax.com`
- `https://fileferry.app`
- `https://callrift.dev`
- `https://pod-tracker.app`
- `https://langindex.dev`
- `https://0xvane.dev`
- `https://debugpath.dev`
- `https://status.dunamismax.com`

Core host services:

- `dunamismax-site.service`
- `ferry-site.service`
- `callrift.service`
- `pod-tracker-web.service`
- `pod-tracker-worker.service`
- `vane-web.service`
- `vane-ssh.service`
- `debugpath-site.service`
- `debugpath-ssh.service`
- `caddy.service`
- `cloudflare-ddns.service`

Repository and deployment inventory should start from
`/home/sawyer/github/toolworks/automation/self-hosted-rust-deploy/deploy-all.sh`
and evolve into a typed inventory owned by this repo.

## Target Architecture

```text
crates/
  status-core/       monitor targets, status model, rollups, policy
  status-store/      PostgreSQL migrations and status history repositories
  status-probe/      HTTP, systemd, Docker, git, Caddy, and host probes
  status-web/        Axum + Leptos SSR website and JSON endpoints
  status-worker/     scheduled collection and alert evaluation
xtask/               build, smoke, deploy, inventory, and maintenance helpers
deploy/
  caddy/
  systemd/
  status.env.example
docs/
  runbooks/
  inventory/
```

The current first cut is one `status-web` binary with embedded assets, explicit
public inventory, live public HTTP probes, and typed host-probe primitives for
future operator use. The crate boundaries can split once host probes,
persistence, and worker behavior grow.

## Public Routes

Target route surface:

```text
GET /                         public status overview
GET /services                 service-level status
GET /projects                 project and repo status
GET /incidents                incident and maintenance history
GET /deployments              recent deploy evidence
GET /healthz                  shallow app health
GET /readyz                   database and probe readiness
GET /api/status.json          machine-readable current rollup
GET /robots.txt
GET /icon.svg
```

The current implementation serves `/`, `/services`, `/healthz`, `/readyz`,
`/api/status.json`, `/robots.txt`, and `/icon.svg`. `/projects`,
`/incidents`, and `/deployments` are present as public placeholders until their
probe and history phases land. Operator-only routes can come later behind a
simple local-only, Tailscale, or login-protected boundary.

## Local Development

The Rust workspace is live. The expected local verification loop is:

```sh
cargo fmt --all --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
cargo build --workspace
cargo run -p status-web
```

The app should bind to `127.0.0.1:8095` by default in production-like local
mode so Caddy can reverse-proxy `status.dunamismax.com` to it. Override the
bind address with `STATUS_BIND_ADDR` and logging with `STATUS_LOG`.

## Production Shape

Production target:

- Ubuntu host under `/home/sawyer/github`
- release binary under `/opt/status-dunamismax`
- unprivileged `status-dunamismax` service user
- `status-dunamismax.service` on `127.0.0.1:8095`
- Caddy site block for `status.dunamismax.com`
- PostgreSQL database only after persistence is needed

Deployment templates live under `deploy/` for the systemd unit, environment
file, and Caddy reverse proxy. They are repo-owned templates; installing them
and reloading host services remains an explicit production step.

Do not publish host-sensitive details publicly by default. Public status should
show enough to be useful without exposing private paths, secrets, internal IPs,
database names, backup locations, or exact failure internals.

## License

MIT. See [LICENSE](LICENSE).
