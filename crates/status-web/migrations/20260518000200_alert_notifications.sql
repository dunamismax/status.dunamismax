create table alert_notifications (
    id bigserial primary key,
    dedup_key text not null,
    target_id text not null,
    severity text not null check (severity in ('warning', 'critical')),
    observed_state text not null check (
        observed_state in ('degraded', 'down', 'unknown')
    ),
    title text not null,
    public_summary text not null,
    observed_at timestamptz not null,
    notification_target text not null,
    public_payload jsonb not null default '{}'::jsonb,
    sent_at timestamptz not null default now()
);

create index alert_notifications_dedup_sent_at_idx
    on alert_notifications (dedup_key, sent_at desc);

create index alert_notifications_sent_at_idx
    on alert_notifications (sent_at desc);
