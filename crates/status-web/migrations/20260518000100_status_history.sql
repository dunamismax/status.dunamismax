create table targets (
    id text primary key,
    name text not null,
    target_kind text not null,
    group_name text,
    public_url text,
    probe_url text,
    repo_name text,
    first_seen_at timestamptz not null,
    last_seen_at timestamptz not null
);

create table check_runs (
    id bigserial primary key,
    target_id text not null references targets(id) on delete cascade,
    check_kind text not null,
    state text not null check (
        state in ('operational', 'degraded', 'down', 'maintenance', 'unknown')
    ),
    checked_at timestamptz not null,
    latency_ms bigint check (latency_ms is null or latency_ms >= 0),
    reason text not null,
    probe_version text not null,
    public_payload jsonb not null default '{}'::jsonb,
    inserted_at timestamptz not null default now()
);

create index check_runs_target_checked_at_idx
    on check_runs (target_id, checked_at desc);

create index check_runs_retention_idx
    on check_runs (checked_at);

create table rollups (
    id bigserial primary key,
    overall_state text not null check (
        overall_state in ('operational', 'degraded', 'down', 'maintenance', 'unknown')
    ),
    checked_at timestamptz not null,
    operational_count integer not null check (operational_count >= 0),
    degraded_count integer not null check (degraded_count >= 0),
    down_count integer not null check (down_count >= 0),
    maintenance_count integer not null check (maintenance_count >= 0),
    unknown_count integer not null check (unknown_count >= 0),
    snapshot jsonb not null,
    inserted_at timestamptz not null default now()
);

create index rollups_checked_at_idx
    on rollups (checked_at desc);

create table incidents (
    id bigserial primary key,
    title text not null,
    affected_targets text[] not null default '{}',
    state text not null check (state in ('investigating', 'identified', 'monitoring', 'resolved')),
    started_at timestamptz not null,
    resolved_at timestamptz,
    public_notes text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (resolved_at is null or resolved_at >= started_at)
);

create index incidents_started_at_idx
    on incidents (started_at desc);

create table maintenance_windows (
    id bigserial primary key,
    title text not null,
    affected_targets text[] not null default '{}',
    state text not null check (state in ('scheduled', 'in_progress', 'complete', 'canceled')),
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    public_notes text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (ends_at >= starts_at)
);

create index maintenance_windows_starts_at_idx
    on maintenance_windows (starts_at desc);

create table deployment_events (
    id bigserial primary key,
    service_id text,
    repo_name text,
    commit_sha text,
    environment text not null default 'production',
    deployed_at timestamptz not null,
    public_summary text not null default '',
    metadata jsonb not null default '{}'::jsonb,
    inserted_at timestamptz not null default now()
);

create index deployment_events_deployed_at_idx
    on deployment_events (deployed_at desc);
