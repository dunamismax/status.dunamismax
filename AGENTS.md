# AGENTS.md

How to work on Dunamis Status, for AI agents and humans. Read all of it before
you change anything, then read [BUILD.md](BUILD.md). When this file and BUILD.md
disagree about *what* to build, BUILD.md wins; about *how* to work, this file
wins. Do not create other instruction or continuity files: update this one.

> **No AI attribution, ever.** No `Co-Authored-By` trailers, no "Generated
> with ..." lines and no credit to Claude, Anthropic, ChatGPT, OpenAI or any AI
> tool in commits, tags, release notes, code, comments, docs or file headers. Use
> the owner's configured git identity and never change git config.

## 1. What this project is

The public, read-only status page for the owner's self-hosted ecosystem at
https://status.dunamismax.com. A five-minute systemd collector probes websites,
services, timers, backups, host health and repositories on ubuntu-vm and writes
snapshots to PostgreSQL. A SvelteKit server renders them as script-free HTML and
stable JSON. It has run on PostgreSQL since 2026-10-22, with Drizzle since
2026-11-02 and SvelteKit since 2026-11-20.

Priorities, in order:

1. **Reality first.** Never invent uptime, hide unknown or stale evidence, or
   claim checks that did not run. Unknown is a state, not an error to paper over.
2. **Boundaries hold.** The web side only reads; the collector only observes;
   neither holds the other's credentials; public routes leak nothing private.
3. **Contracts stay.** States, target IDs, JSON fields, routes, headers, history
   IDs and timestamps are relied on by people and tools. Change them only on
   purpose, with the owner.
4. **Small and boring.** No framework, hosted monitoring, container platform or
   rewrite that the project does not actually need.

This is an observer, never a restart panel, deploy orchestrator, remote shell or
command-output feed. Keep the source private and respect the owner's content and
access boundaries.

## 2. Session workflow

**Start.**

1. `git status --short --branch` and `git log -5 --oneline`. Preserve unrelated
   work in the tree.
2. Read **Now** in BUILD.md, then the docs for the area you will touch:
   [README.md](README.md), [docs/architecture.md](docs/architecture.md),
   [docs/production.md](docs/production.md).
3. Before changing the live service, also read the host runbook on the VM,
   `/home/sawyer/github/ubuntu-vm-backup/docs/web-platform.md`.
4. Pick work: the owner's request, otherwise BUILD.md's **Next step**. Follow
   its "How to work this file" procedure.

**While working.** Small, verified steps; every commit leaves `main` working.
Write tests with the code. Look up current docs (Context7 or the official site)
for SvelteKit, Svelte, Tailwind CSS, Drizzle and Vite before writing framework
code: they change faster than memory.

**Finish.**

1. Run the full [verification](#8-verification).
2. Update BUILD.md in the same commit: tick what is done with an `Evidence:` line,
   update **Now** and prepend a handoff entry. Never tick a box that is not done:
   `/projects` publishes the count.
3. Update every doc the change affects (README, `docs/`, this file).
4. Commit and push `main` ([section 10](#10-git)).

## 3. Stack and versions

| Area | Pinned |
| --- | --- |
| Runtime | Node 24.22.3 and npm 11.19.1 (`.node-version`, `engines`, `engine-strict`). On the VM: the host's shared runtime `/opt/node-runtime` through the `node-runtime` wrapper |
| Web | SvelteKit 3.2.0, `@sveltejs/adapter-node` 6.0.2, `@sveltejs/vite-plugin-svelte` 7.3.1, Svelte 5.57.3 (runes), Vite 8.3.7, svelte-check 4.7.8 |
| Styles | Tailwind CSS 4.3.5 with `@tailwindcss/vite` 4.3.5 |
| Language | TypeScript 6.0.3, strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |
| Database | PostgreSQL 18; Drizzle ORM 0.45.4 over `pg` 8.16.3; Drizzle Kit 0.31.11 (dev only). The `@esbuild-kit` esbuild override (0.25.12) keeps `npm audit` clean |
| Host | systemd, Caddy (custom binary `/usr/local/lib/caddy/caddy`) |

Exact versions only, with `package-lock.json` and `npm ci`; commit only that
lockfile. Runtime `dependencies` are `pg` and `drizzle-orm`; the framework is a
devDependency because adapter-node bundles it. A new version must be at least ten
days old. Update this table, README's technology table and BUILD.md in the same
commit as any bump.

## 4. Layout

```text
src/hooks.server.ts      method gate (405 + Allow), operator bearer check, headers, HEAD bodies
src/routes/              +page.server.ts loads, +server.ts endpoints, +error.svelte
src/lib/components/      Svelte 5 components (import only model.ts and view.ts)
src/lib/view.ts          pure view helpers
src/lib/model.ts         read-model types and rollup logic (pure)
src/lib/{web,source,db,config}.ts  server-only: routes, read-only source, pool, settings
src/lib/catalog.ts       pure site and app catalog: target IDs per property (tested against the inventory)
src/app.css              Tailwind entry: @theme tokens, component rules
src/collector/           inventory, command runner, probes, HTTP evidence, alerts, writer, CLI
src/db/                  Drizzle schema, catalog check, owner-only migration runner
drizzle/                 reviewed migrations, Kit metadata, baseline-catalog.json
database/schema.sql      legacy schema for older releases and history tooling
scripts/                 history digests, permission acceptance, public probes (Python)
tests/                   core.test.ts (built server), database.test.ts (disposable PostgreSQL)
deploy/                  build, deploy, rollback, run-command, smoke, backup, units, Caddy fragment
docs/                    architecture, production operations, migration evidence
```

Output directories: adapter-node writes `dist/` (entry `dist/index.js`); the
collector's `tsc` owns `build/`. Never commit either, `.svelte-kit/`, `.astro/`,
env files, dumps, private snapshots or `node_modules`.

## 5. Boundaries that must hold

These are independent controls. Keep every one, even when another seems to cover
it.

- **Web reads four models.** Web code (`src/hooks.server.ts`, `src/routes`,
  `src/lib`) reads only rollups, incidents, maintenance windows and deployments.
  It never imports collector or runner code, runs commands, probes URLs, reads
  repositories or uses `fetch`. The import-graph test enforces this.
- **Database grants.** NOLOGIN owner; separate migration, web and collector
  logins; no owner or writer membership for web or collector. Web SELECT is
  exactly the four models: no targets, check rows, alerts, journals, sequences,
  writes or DDL. Future tables must not gain web SELECT by default. The collector
  cannot read or alter migration bookkeeping.
- **Identities and secrets.** OS users, root-only role env files in
  `/etc/web-apps/status_dunamismax/`, app settings in
  `/etc/status-dunamismax/{web,collector}.env`. Neither process gets the
  other's env, token or webhook. The release contains no env files.
- **Process isolation.** The web unit runs under Node's `--permission`,
  ProtectHome and a read-only filesystem. The collector has no Docker group or
  socket. Never add it to Docker or widen repository ACLs.
- **Public output.** No private paths, arguments, env values, credentials,
  topology, database names, logs or stack traces on public routes; failures are
  redacted 503s. Only bearer-authenticated `/operator` shows its deliberate
  private metadata, and it rejects a bad token with 401 before any read.

## 6. Collector rules

- **One way to run a program:** `src/collector/command.ts`. Absolute path, argv
  array, no shell, minimal nonsecret env, a deadline, bounded output and
  process-group kill. Truncated output is unavailable evidence.
- **Probe bounds stay:** verified TLS, five-second deadline, at most five
  redirects, 256 KiB bodies; TCP checks connect and close without sending bytes;
  the installer probe asks for two bytes.
- **Keep the evidence rules:** one-shot freshness from recorded successful
  completion (never from an enabled timer), restart counts, the custom Caddy
  binary, and `permission=unknown` when access is denied.
- **Repositories are read-only.** Never fetch, pull, clean or reset a monitored
  repository. Raw outputs are never persisted.
- **Inventory changes** go in `src/collector/inventory.ts` with a test, in
  `src/lib/catalog.ts` when the check belongs to a site or app, and in README's
  "What it watches" and the monitoring policy in `docs/production.md`. Reconcile
  against the host (running units, timers, Caddy sites, containers, listening
  ports and `~/github`) rather than memory.
- **Alerts** are tested only with mock or loopback endpoints, or with
  `--dry-run` or `--no-notify`. Never send to a destination the owner has not
  approved.

## 7. Web, data and schema conventions

**Web.** Every page is server-rendered with `csr = false` (set in
`src/routes/+layout.server.ts`): Svelte 5 components emit semantic HTML and no
browser JavaScript, inline style, fonts or analytics; the hook strips hydration
markers. Config lives in the `sveltekit()` plugin in `vite.config.ts` (there is
no `svelte.config.js`); import shared code with `#lib/...`. Keep adapter-node SSR
on 127.0.0.1; prerendering and adapter-static are for content-only sites.
`csrf.trustedOrigins: ['*']` is deliberate: there are no forms, and the hook
answers every mutating method with 405. Hydration, form actions, remote
functions or shadcn-svelte need an actual interactive feature plus a CSP, CSRF
and smoke review; until then, keep the no-script behavior.

**Styles.** Tailwind CSS 4 builds `src/app.css`: the palette in `@theme` (colors
reset first, so utilities use only this palette), the component rules in the
components layer, preflight omitted, utility sources limited to `src/routes` and
`src/lib/components`.

**Data contracts.** Preserve states, target IDs, JSON fields, original history
IDs and timestamps, incident and maintenance history, deployment metadata, alert
keys, caps, repeat windows and sent evidence, check-only retention and freshness
labels. Keep UTC in the APIs and fixed UTC-05:00 EST on pages. Change the
readiness dependency label only when its backing technology actually changes,
and keep its response shape and status. Timestamps stay strings and IDs stay
`BigInt`: never through JS `Date` or `Number`.

**Schema changes.** Edit `src/db/schema.ts`, run `npm run db:generate`, then
review the SQL by hand: grants, triggers and bookkeeping are not Kit-generated,
and new tables need explicit grants. If the baseline structure itself changes,
refresh `drizzle/baseline-catalog.json` with
`STATUS_UPDATE_CATALOG=1 bash tests/postgres.sh`. `npm run db:check` fails on
unreviewed changes. Migrations run only through the owner-only runner
(`npm run db:migrate`) inside a deploy, where `deploy/deploy.sh` brackets it
with every-row digests; never `drizzle-kit push`, never on startup. The journal
`app.drizzle_migrations` stays private to the owner, apart from the legacy
`app.schema_migrations`. An incompatible change needs a rehearsed lossless
reverse adapter before activation.

## 8. Verification

Run on the pinned runtime: prefix with `node-runtime` on the VM; on a Mac use a
version manager, for example `mise exec node@24.22.3 -- <command>`.

```sh
npm ci
npm run check        # svelte-kit sync, svelte-check --fail-on-warnings, CLI tsc
npm run db:check     # Kit check plus the schema drift gate
npm test             # builds, then drives dist/server in-process (2 PostgreSQL tests skip)
bash tests/postgres.sh  # disposable socket-only PostgreSQL 18 cluster, all tests
npm run build
for f in deploy/*.sh tests/postgres.sh; do bash -n "$f"; done
python3 -m py_compile deploy/history-transfer.py
git diff --check
```

`make check` runs all but `postgres.sh`, `npm ci` and `git diff --check`.
`tests/postgres.sh` uses Debian's `/usr/lib/postgresql/18/bin` and the
`node-runtime` wrapper, so it runs on the VM and in CI; on macOS, say it was not
run and rely on CI. PostgreSQL integration runs only in that disposable private
cluster, never against a live database. CI (`.github/workflows/verify.yml`) runs
the same checks plus `npm audit --audit-level=moderate`; check its result after
pushing.

For a production change, also verify: failures stay redacted, the web role's
grants (`scripts/verify-permissions.ts`), process env and file separation,
timers, a fresh snapshot, static bytes, headers, API compatibility, rollback with
data reconciliation, and an encrypted backup restore.

## 9. Production changes

The host is ubuntu-vm. Releases live in
`/srv/www/status.dunamismax.com/releases/<commit>` with an atomic `current`; web
on 127.0.0.1:4313, candidates on 127.0.0.1:14313. Units:
`status-dunamismax.service` (web), `status-dunamismax-collector.timer` and
`.service`, `status-dunamismax-backup.timer`. Caddy: `/etc/caddy/Caddyfile`, the owning fragment
`/etc/caddy/sites/status.dunamismax.com.caddy`, binary
`/usr/local/lib/caddy/caddy`. Commands are in
[docs/production.md](docs/production.md).

- **Build outside the lock.** `deploy/build.sh` builds and tests an exact Git
  archive as sawyer.
- **One transaction for shared changes.** Every systemd, Caddy, ACL, role,
  schema, release and rollback mutation runs in one VM transaction under
  `with-deploy-lock`, reusing the inherited FD 9; never nest acquisitions.
  Recheck current state, back up files and data, validate the candidate on
  loopback, switch atomically, validate Caddy with the custom binary and reload,
  then smoke the public site.
- **History stays authoritative.** Stop both writers for history reconciliation
  and reverse migration. Never restore an old dump over newer writes.
- **Keep what recovery needs.** Old services, releases, MySQL data and backups
  stay until the host's final cleanup.
- **Backups stay PostgreSQL.** Nightly `pg_dump` with roles, ACLs and settings,
  encrypted off-host copies and isolated restores. SQLite and Litestream are not
  requirements here.
- **Stay in your lane.** No force-pushes, unrelated site edits or shared service
  restarts. Preserve Caddy's modules and TLS.
- **DNS is not ours.** DNS-only Cloudflare records, owner-managed; Caddy gets its
  own Let's Encrypt certificates. Never plan or add a DNS challenge, Caddy DNS
  plugin, token or proxy setting, and never change Cloudflare.
- **Owner gates.** Alert and heartbeat destinations, anything that costs money
  or needs a new account or credential, and making the source public.

## 10. Git

- Work on `main` only: no branches, worktrees or pull requests. Pull with a clean
  fast-forward; never force-push.
- Before committing: inspect the branch, status and remotes and the configured
  dunamismax identity; run the verification; check `git status` for stray files;
  stage only intended paths; never commit what `.gitignore` excludes.
- Commit message: a short imperative summary line, a blank line, then a brief
  body saying what changed and why.
- Push right away with `git push origin main`, at the latest before the session
  ends. `origin` pushes to GitHub and Codeberg; verify both tips.

## 11. Documentation

Keep docs current in the same change as the code.

- [README.md](README.md): what the service is, routes, what it watches,
  technology, layout and development commands.
- [BUILD.md](BUILD.md): plan, **Now**, settled decisions, open questions,
  evidence and the handoff log. Its format is parsed by the collector.
- [docs/architecture.md](docs/architecture.md): boundaries and how the web
  layer and the schema work.
- [docs/production.md](docs/production.md): host layout, releases, rollback,
  backups, monitoring policy and alert delivery.
- [docs/migration.md](docs/migration.md): acceptance evidence, never private
  files.

Conditional work changes these docs too. If Python is added, use uv, locked
dependencies and ruff, with Typer, httpx or Pydantic only where needed and
systemd timers for recurring jobs; keep the working TypeScript collector and
the existing Python utilities rather than rewriting for uniformity. If a
Swift/SwiftUI Apple client is requested, record the Swift and minimum OS
versions and a working `xcodebuild test` command here, prefer `@Observable`
where supported, choose SwiftData or GRDB as appropriate, and have it call the
SvelteKit HTTPS APIs, never the database. No native target is planned. Better Auth (for requested
accounts) and the Vercel AI SDK (for a needed LLM feature, in `+server.ts`
endpoints) are the defaults if those needs ever appear; this observer needs
neither. Record actual implemented versions and commands here when they land.

## 12. Things to avoid

- Running `drizzle-kit push`, migrating on startup or giving web any write.
- Adding client JavaScript, inline styles, web fonts, analytics or third-party
  requests to pages.
- Importing collector, runner or Node subprocess and filesystem APIs into web
  code.
- Porting the working TypeScript collector to another language, or moving it into
  Docker.
- Persisting raw probe output, or showing it on any route.
- Changing a stale timestamp, a threshold or a test to turn a check green.
- Committing env files, dumps, private snapshots, generated output or
  `node_modules`.
- Live alert tests, or injecting failures into live backup, DDNS or Caddy.
