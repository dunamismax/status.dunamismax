# Production Self-Host Runbook

This runbook installs `status.dunamismax.com` on the Ubuntu host behind Caddy.
It avoids raw logs, secrets, private paths beyond the repo root, and host-only
details on public pages.

## Assumptions

- Repositories live under `/home/sawyer/github`.
- The release binary is installed at `/opt/status-dunamismax/status-web`.
- The service runs as the unprivileged `status-dunamismax` user.
- Caddy terminates TLS and proxies to `127.0.0.1:8095`.
- PostgreSQL history is optional, but required for incident, maintenance, and
  deployment history.

## First Install

```sh
cd /home/sawyer/github/status.dunamismax
cargo build --release -p status-web --all-features

sudo useradd --system --home-dir /opt/status-dunamismax --create-home \
  --shell /usr/sbin/nologin status-dunamismax
sudo install -d -o status-dunamismax -g status-dunamismax /opt/status-dunamismax
sudo install -d /etc/status-dunamismax
sudo install -m 0755 target/release/status-web /opt/status-dunamismax/status-web
sudo install -m 0640 -o root -g status-dunamismax deploy/status.env.example /etc/status-dunamismax/status.env
sudo install -m 0644 deploy/systemd/status-dunamismax.service /etc/systemd/system/status-dunamismax.service
sudo install -m 0644 deploy/systemd/status-dunamismax-collector.service /etc/systemd/system/status-dunamismax-collector.service
sudo install -m 0644 deploy/systemd/status-dunamismax-collector.timer /etc/systemd/system/status-dunamismax-collector.timer
sudo install -m 0644 deploy/caddy/status.dunamismax.caddy /etc/caddy/status.dunamismax.caddy
```

Edit `/etc/status-dunamismax/status.env` only for local runtime values. Add
`STATUS_DATABASE_URL` when PostgreSQL history is ready. Add
`STATUS_OPERATOR_TOKEN` only when the authenticated operator view should be
available.

## Enable

Import or append the Caddy site block after the backend binary exists:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now status-dunamismax.service
sudo systemctl enable --now status-dunamismax-collector.timer
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy.service
```

## Smoke

```sh
curl -fsS http://127.0.0.1:8095/healthz
curl -fsS http://127.0.0.1:8095/readyz
curl -fsS http://127.0.0.1:8095/api/status.json
curl -fsS https://status.dunamismax.com/healthz
curl -fsS https://status.dunamismax.com/api/status.json
sudo systemctl is-active status-dunamismax.service
sudo systemctl is-active status-dunamismax-collector.timer
```

`/readyz` is still ready when PostgreSQL is not configured. Once
`STATUS_DATABASE_URL` is set, `/readyz` reports database readiness and the timer
persists snapshots.

## Operator View

`/operator` is disabled unless `STATUS_OPERATOR_TOKEN` is present in
`/etc/status-dunamismax/status.env`. When enabled, it requires a bearer token
and shows private repository paths that public pages and JSON omit:

```sh
curl -fsS \
  -H "Authorization: Bearer $STATUS_OPERATOR_TOKEN" \
  http://127.0.0.1:8095/operator
```

## Deployment Evidence

Toolworks records deployment events when `STATUS_DATABASE_URL` is present in
`/etc/status-dunamismax/status.env`. Manual recording uses the same binary:

```sh
sudo -u status-dunamismax env \
  DEPLOY_SERVICE_ID=status-dunamismax \
  DEPLOY_REPO_NAME=status.dunamismax \
  DEPLOY_COMMIT_SHA="$(git rev-parse HEAD)" \
  DEPLOY_PUBLIC_SUMMARY="status.dunamismax deployed to production" \
  bash -lc 'set -a; . /etc/status-dunamismax/status.env; set +a; export STATUS_RECORD_DEPLOYMENT=true STATUS_DEPLOYMENT_SERVICE_ID="$DEPLOY_SERVICE_ID" STATUS_DEPLOYMENT_REPO_NAME="$DEPLOY_REPO_NAME" STATUS_DEPLOYMENT_COMMIT_SHA="$DEPLOY_COMMIT_SHA" STATUS_DEPLOYMENT_ENVIRONMENT=production STATUS_DEPLOYMENT_PUBLIC_SUMMARY="$DEPLOY_PUBLIC_SUMMARY"; exec /opt/status-dunamismax/status-web'
```

## Alerting

Alerts are evaluated only during `STATUS_COLLECT_ONCE=true` collector runs.
Notifications stay disabled until `STATUS_ALERT_WEBHOOK_URL` is set. Keep
`STATUS_DATABASE_URL` configured before enabling a webhook because the database
stores notification history for duplicate suppression.

Severity rules:

- `critical`: a monitored service or project is `down`.
- `warning`: a monitored service or project is `degraded` or `unknown`.
- `operational` and `maintenance` do not notify.

Escalation behavior is intentionally narrow:

- each notification carries target id, target name, observed state, severity,
  observed time, title, and a public-safe summary
- private repository paths, raw command output, secrets, and host-only details
  are not sent
- the same `dedup_key` is suppressed for
  `STATUS_ALERT_REPEAT_AFTER_MINUTES`, default `60`
- a single collector run sends at most
  `STATUS_ALERT_MAX_NOTIFICATIONS_PER_RUN`, default `5`
- failed webhook delivery fails the collector run so systemd can surface the
  failure without pretending notification succeeded

Suggested production defaults:

```sh
STATUS_ALERT_REPEAT_AFTER_MINUTES=60
STATUS_ALERT_MAX_NOTIFICATIONS_PER_RUN=5
# STATUS_ALERT_WEBHOOK_URL=...
```

OpenTelemetry export is not enabled yet. The current request and probe spans
are still local `tracing` output, and there is no chosen exporter destination.
Revisit exporter setup only after span names and the receiver are stable.

Layered config loading through `figment` or `config` is also deferred. Explicit
environment parsing remains sufficient while inventory is repo-owned and the
operator plus alert settings fit in `/etc/status-dunamismax/status.env`.
