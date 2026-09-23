<?php

declare(strict_types=1);

use Status\Alert\AlertEvaluator;
use Status\Config;
use Status\Environment;
use Status\Inventory;
use Status\Model\BuildProgress;
use Status\Model\DeploymentEvent;
use Status\Model\GitStatus;
use Status\Model\ServiceStatus;
use Status\Model\Snapshot;
use Status\Model\State;
use Status\Time;

// Environment and configuration.
$temp = tempnam(sys_get_temp_dir(), 'status-env-');
try {
    file_put_contents($temp, "# Comment\nAPP_ENV=local\nDB_PASSWORD='literal # dollar \$HOME'\nDB_NAME=\n");
    $env = Environment::fromFile($temp);
    expect($env->get('DB_PASSWORD') === 'literal # dollar $HOME', 'Environment values must stay literal.');
    expect($env->get('DB_NAME', 'fallback') === '', 'Empty values must survive.');
    putenv('APP_ENV=test');
    expect($env->get('APP_ENV') === 'test', 'Process environment must take precedence.');
    putenv('APP_ENV');
    file_put_contents($temp, "DB_PASSWORD='unterminated\n");
    rejects(fn () => Environment::fromFile($temp), 'Malformed environment files must fail.');
} finally {
    unlink($temp);
}

$local = new Config(new Environment(['APP_ENV' => 'local']));
expect($local->retentionDays === 30 && $local->staleAfterMinutes === 15, 'Retention and staleness defaults must be 30 days and 15 minutes.');
expect($local->alertRepeatAfterMinutes === 60 && $local->alertMaxNotificationsPerRun === 5, 'Alert suppression defaults must be 60 minutes and 5 per run.');
expect($local->operatorToken === null && $local->alertWebhookUrl === null, 'Operator access and alerts must be off unless configured.');
expect($local->repoRoot === '/home/sawyer/github', 'The repository root must default to the server checkout root.');
rejects(fn () => new Config(new Environment()), 'Production must require a database.');
rejects(fn () => new Config(new Environment(['APP_ENV' => 'staging'])), 'Unknown environments must be rejected.');
rejects(fn () => new Config(new Environment(['APP_ENV' => 'local', 'DB_NAME' => 'db;host=evil'])), 'DSN injection must be rejected.');
rejects(fn () => new Config(new Environment(['APP_ENV' => 'local', 'STATUS_OPERATOR_TOKEN' => 'short'])), 'Weak operator tokens must be rejected.');
rejects(fn () => new Config(new Environment(['APP_ENV' => 'local', 'STATUS_ALERT_WEBHOOK_URL' => 'file:///etc/passwd'])), 'Webhooks must be http or https.');
rejects(fn () => new Config(new Environment(['APP_ENV' => 'local', 'STATUS_RETENTION_DAYS' => '0'])), 'Retention must be at least one day.');
rejects(fn () => new Config(new Environment(['APP_ENV' => 'local', 'STATUS_ALERT_REPEAT_AFTER_MINUTES' => 'soon'])), 'Alert settings must be integers.');
rejects(fn () => new Config(new Environment(['APP_ENV' => 'local', 'STATUS_REPO_ROOT' => 'relative'])), 'The repository root must be absolute.');
$tuned = new Config(new Environment(['APP_ENV' => 'local', 'STATUS_ALERT_WEBHOOK_URL' => 'https://example.com/status-alerts',
    'STATUS_ALERT_REPEAT_AFTER_MINUTES' => '120', 'STATUS_ALERT_MAX_NOTIFICATIONS_PER_RUN' => '3', 'STATUS_REPO_ROOT' => '/srv/repos/']));
expect($tuned->alertRepeatAfterMinutes === 120 && $tuned->alertMaxNotificationsPerRun === 3, 'Alert settings must parse.');
expect($tuned->repoRoot === '/srv/repos', 'Trailing slashes must be trimmed from the repository root.');
expect(e('<script>"&\'') === '&lt;script&gt;&quot;&amp;&#039;', 'Output must be escaped.');

// Time formats.
$at = Time::parse('2026-05-18T12:00:00Z');
expect(Time::display($at) === '2026-05-18 07:00:00 EST', 'Pages must show the fixed EST offset.');
expect(Time::toJson($at) === '2026-05-18T12:00:00Z', 'Whole seconds must serialize without a fraction.');
expect(Time::toJson(Time::parse('2026-09-23T14:08:00.536824986Z')) === '2026-09-23T14:08:00.536824Z', 'Nanosecond input must keep microseconds.');
expect(Time::toJson(Time::parse('2026-05-18T12:00:00.250+00:00')) === '2026-05-18T12:00:00.250Z', 'Millisecond values must serialize like the previous API.');
expect(Time::toJson(Time::parse('2026-05-18T08:00:00-04:00')) === '2026-05-18T12:00:00Z', 'Offsets must normalize to UTC.');
expect(Time::toDb(Time::fromDb('2026-05-18 12:00:00.123456')) === '2026-05-18 12:00:00.123456', 'Database times must round-trip.');
foreach (['2026-05-18', '2026-05-18T12:00:00', 'yesterday', '2026-02-30T00:00:00Z'] as $bad) {
    rejects(fn () => Time::parse($bad), 'Ambiguous or invalid timestamp must fail: ' . $bad);
}

// Rollups (ported from the Rust model tests).
expect(State::worst([]) === State::Unknown, 'An empty rollup is unknown.');
expect(State::worst([State::Maintenance, State::Unknown]) === State::Unknown, 'Unknown outranks maintenance.');
expect(State::worst([State::Degraded, State::Unknown]) === State::Degraded, 'Degraded outranks unknown.');
expect(State::parse('sideways') === State::Unknown && State::parse(null) === State::Unknown, 'Unrecognized states must be unknown.');
$service = static fn (State $state): ServiceStatus => new ServiceStatus('example', 'Example', 'Sites', 'http', $state, $at, null, 'x', 'test');
$rollup = Snapshot::fromResults([$service(State::Operational), $service(State::Down)], []);
expect($rollup->overallState === State::Down && $rollup->summary['operational'] === 1 && $rollup->summary['down'] === 1,
    'The rollup must use the most severe observed state and count every service.');
$fixture = snapshotFixture();
expect($fixture->overallState === State::Degraded && $fixture->summary['degraded'] === 1, 'The fixture rolls up to degraded.');
expect(array_keys($fixture->toArray()) === ['overall_state', 'checked_at', 'summary', 'services', 'projects'], 'Snapshot keys must keep their order.');
expect(array_keys($fixture->summary) === ['operational', 'degraded', 'down', 'maintenance', 'unknown'], 'Summary keys must keep their order.');
$json = $fixture->toArray();
expect(array_keys($json['services'][0]) === ['target', 'check']
    && array_keys($json['services'][0]['target']) === ['id', 'name', 'group', 'public_url', 'probe_url', 'expected_status']
    && array_keys($json['services'][0]['check']) === ['target_id', 'check_kind', 'state', 'checked_at', 'latency_ms', 'reason', 'probe_version'],
    'Service JSON must keep the published shape.');
expect(array_keys($json['projects'][0]) === ['target', 'state', 'checked_at', 'reason', 'git', 'build', 'probe_version']
    && array_keys($json['projects'][0]['target']) === ['id', 'name', 'repo_name', 'public_url']
    && array_keys($json['projects'][0]['git']) === ['branch', 'upstream', 'ahead', 'behind', 'dirty', 'latest_commit_age_days', 'remote_reachable']
    && array_keys($json['projects'][0]['build']) === ['checked', 'total', 'next_phase'],
    'Project JSON must keep the published shape without the repository path.');
expect(!str_contains($fixture->toJson(), '/home/sawyer') && !str_contains($fixture->toJson(), 'repo_path'), 'Snapshot JSON must not expose repository paths.');
$empty = Snapshot::empty($at);
expect($empty->overallState === State::Unknown && $empty->services === [] && Time::toJson($empty->checkedAt) === '2026-05-18T12:00:00Z',
    'An empty snapshot is unknown at the given time.');
expect($fixture->servicesOnly()->overallState === State::Degraded && $fixture->servicesOnly()->projects === [], 'Service-only rollups drop projects.');

// Snapshots stored by the Rust service (including the migrated history) decode and re-encode in the same shape.
$rust = json_decode(file_get_contents(__DIR__ . '/fixtures/rust-status.json'), true, 64, JSON_THROW_ON_ERROR);
$roundTrip = Snapshot::fromArray($rust)->toArray();
$trimTimes = static function (array $data) use (&$trimTimes): array {
    foreach ($data as $key => $value) {
        if (is_array($value)) {
            $data[$key] = $trimTimes($value);
        } elseif (is_string($value) && preg_match('/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/', $value)) {
            $data[$key] = Time::toJson(Time::parse($value));
        }
    }
    return $data;
};
$expected = $trimTimes($rust);
unset($expected['checked_at'], $roundTrip['checked_at']);
expect($roundTrip === $expected, 'Rust-era snapshots must round-trip with identical structure and values.');
expect(Snapshot::fromArray(json_decode((string) json_encode(Snapshot::fromArray($rust)->toArray()), true))->toArray()
    === Snapshot::fromArray($rust)->toArray(), 'Re-encoding must be stable.');

// BUILD.md progress (ported).
$progress = BuildProgress::parse("\n### Phase 1: Done\n- [x] Add app.\n\n### Phase 2: Open\n- [x] Add probe.\n- [ ] Add history.\n");
expect($progress !== null && $progress->checked === 2 && $progress->total === 3 && $progress->nextPhase === 'Phase 2: Open',
    'BUILD progress must count checkboxes and find the next open phase.');
expect(BuildProgress::parse("No checklist here.\n") === null, 'Files without checkboxes have no progress.');

// Inventory: the target state.
$systemd = Inventory::systemdTargets();
$units = array_map(static fn ($t): string => $t->unit, $systemd);
foreach (['caddy.service', 'php8.5-fpm.service', 'mysql.service', 'mtg-card-bot.service', 'docker.service', 'containerd.service',
    'status-dunamismax-collector.timer', 'status-dunamismax-backup.timer'] as $unit) {
    expect(in_array($unit, $units, true), 'The target state must watch ' . $unit);
}
foreach ($units as $unit) {
    expect(!str_contains($unit, 'postgres') && $unit !== 'dunamismax-site.service' && $unit !== 'status-dunamismax.service',
        'Retired units must not be monitored: ' . $unit);
}
expect(array_map(static fn ($t): int => $t->port, Inventory::tcpTargets()) === [21115, 21116, 21117], 'RustDesk must be probed on TCP 21115-21117.');
foreach (Inventory::tcpTargets() as $target) {
    expect($target->host === '127.0.0.1' && !str_contains($target->name, '127.0.0.1'), 'RustDesk probes are loopback-only and do not publish the address.');
}
$projects = Inventory::projectTargets('/home/sawyer/github');
expect(!in_array('rustdesk-selfhosted', array_map(static fn ($t): string => $t->repoName, $projects), true), 'rustdesk-selfhosted is no longer a project.');
expect(in_array('status.dunamismax', array_map(static fn ($t): string => $t->repoName, $projects), true), 'This repository is a monitored project.');
foreach (Inventory::httpTargets() as $target) {
    expect(str_starts_with($target->probeUrl, 'https://') && $target->expectedStatus === 200, 'Public probes must use HTTPS and expect 200.');
}
$ids = [...array_map(static fn ($t): string => $t->id, Inventory::httpTargets()), ...array_map(static fn ($t): string => $t->id, $systemd),
    ...array_map(static fn ($t): string => $t->id, Inventory::tcpTargets()), 'caddy-config', 'cloudflare-ddns-update', 'root-disk'];
expect(count($ids) === count(array_unique($ids)), 'Service ids must be unique so history and alert keys do not collide.');
expect(Inventory::CADDY_BINARY === '/usr/local/lib/caddy/caddy', 'Caddy checks must use the production binary, never /usr/bin/caddy.');

// Alerts (ported).
$down = Snapshot::fromResults([
    new ServiceStatus('fileferry-app', 'fileferry.app', 'Public websites', 'http', State::Operational, $at, 42, 'HTTP 200', 'test'),
    new ServiceStatus('status-dunamismax-com', 'status.dunamismax.com', 'Public websites', 'http', State::Down, $at, null,
        'expected HTTP 200, got HTTP 503', 'test'),
], [new Status\Model\ProjectStatus('fileferry', 'fileferry', 'fileferry', 'https://fileferry.app', State::Degraded, $at,
    'branch is 1 behind upstream', new GitStatus('main', 'origin/main', 0, 1, false, 1, true), null, 'test')]);
$alerts = AlertEvaluator::evaluate($down);
expect(count($alerts) === 2 && $alerts[0]->severity === 'critical' && $alerts[0]->targetId === 'status-dunamismax-com',
    'Down services must alert as critical first.');
expect($alerts[1]->severity === 'warning' && $alerts[1]->targetId === 'fileferry' && $alerts[1]->dedupKey === 'project:fileferry:degraded',
    'Degraded projects must alert as warnings with a stable dedup key.');
expect(str_contains($alerts[0]->publicSummary, 'expected HTTP 200') && !str_contains(json_encode($alerts[1]->webhookPayload()), '/home/sawyer'),
    'Alert summaries must carry the public reason only.');
expect(array_keys($alerts[0]->webhookPayload()) === ['source', 'severity', 'state', 'target_id', 'target_name', 'title', 'public_summary', 'observed_at'],
    'The webhook payload must keep its shape.');
expect(AlertEvaluator::severity(State::Maintenance) === null && AlertEvaluator::severity(State::Unknown) === 'warning', 'Maintenance never alerts; unknown warns.');

// Deployment events.
$event = DeploymentEvent::create('status-dunamismax', 'status.dunamismax', 'abcdef1234567890', null, '2026-05-18T12:00:00Z', null, $at);
expect($event->environment === 'production' && $event->publicSummary === 'status-dunamismax deployed to production', 'Deployment defaults must match the previous recorder.');
expect(DeploymentEvent::create(null, 'repo', null, 'staging', null, null, $at)->publicSummary === 'repo deployed to staging', 'The summary falls back to the repository.');
expect(DeploymentEvent::create(null, null, null, null, null, null, $at)->deployedAt == $at, 'Deployment time defaults to now.');
rejects(fn () => DeploymentEvent::create('x', null, 'not-a-sha', null, null, null, $at), 'Commit SHAs must be hexadecimal.');
rejects(fn () => DeploymentEvent::create('x', null, null, null, 'tomorrow', null, $at), 'Deployment times must be RFC 3339.');
rejects(fn () => DeploymentEvent::create('bad id!', null, null, null, null, null, $at), 'Service ids must be simple names.');
rejects(fn () => DeploymentEvent::create('x', null, null, null, null, "two\nlines", $at), 'Summaries must be one line.');
