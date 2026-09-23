<?php

declare(strict_types=1);

use Status\Alert\AlertEvaluator;
use Status\Config;
use Status\Database;
use Status\Environment;
use Status\Model\DeploymentEvent;
use Status\Model\ServiceStatus;
use Status\Model\Snapshot;
use Status\Model\State;
use Status\Store\HistoryImporter;
use Status\Store\HistoryWriter;
use Status\Store\MysqlStatusSource;
use Status\Time;

// Opt-in MySQL integration checks against a dedicated, empty test database.
// Never reads .env; the target must be explicit in the command environment.
require dirname(__DIR__) . '/bootstrap.php';
require __DIR__ . '/support.php';

if (getenv('APP_ENV') !== 'test' || !str_ends_with(getenv('DB_NAME') ?: '', '_test')) {
    fwrite(STDERR, "Set APP_ENV=test and an explicit DB_NAME ending in _test. This must be a dedicated test database.\n");
    exit(1);
}

$tables = ['alert_notifications', 'check_runs', 'rollups', 'incidents', 'maintenance_windows', 'deployment_events', 'targets'];
$pdo = null;
$failed = false;
try {
    $config = new Config(new Environment());
    $database = new Database($config);
    $pdo = $database->connection();
    $schema = (string) file_get_contents(dirname(__DIR__) . '/database/schema.sql');
    $pdo->exec($schema);
    $pdo->exec($schema);
    foreach ($tables as $table) {
        if ((int) $pdo->query("SELECT COUNT(*) FROM {$table}")->fetchColumn() !== 0) {
            throw new RuntimeException('Use an empty dedicated test database. Existing rows will not be deleted.');
        }
    }

    $writer = new HistoryWriter($database);
    $source = new MysqlStatusSource($database);
    $source->ping();
    expect($source->latestSnapshot() === null, 'An empty store has no snapshot.');

    // Snapshots: every target, check row, and rollup, read back in the published shape.
    $fixture = snapshotFixture(Time::now()->modify('-1 minute'));
    $writer->recordSnapshot($fixture);
    $writer->recordSnapshot($fixture);
    expect((int) $pdo->query('SELECT COUNT(*) FROM targets')->fetchColumn() === 3, 'Targets are upserted once per id.');
    expect((int) $pdo->query('SELECT COUNT(*) FROM check_runs')->fetchColumn() === 6, 'Each run stores a check row per result.');
    expect((int) $pdo->query('SELECT COUNT(*) FROM rollups')->fetchColumn() === 2, 'Each run stores a rollup.');
    expect($source->latestSnapshot()?->toArray() === $fixture->toArray(), 'The latest snapshot reads back unchanged.');
    $payload = json_decode((string) $pdo->query("SELECT public_payload FROM check_runs WHERE target_id = 'fileferry' LIMIT 1")->fetchColumn(), true);
    expect(array_keys($payload) === ['build', 'git'] || array_keys($payload) === ['git', 'build'], 'Project check payloads hold git and build evidence.');
    expect(!str_contains((string) $pdo->query('SELECT GROUP_CONCAT(public_payload) FROM check_runs')->fetchColumn(), '/home/sawyer'),
        'Stored payloads carry no private paths.');

    // Retention prunes old check rows only.
    $pdo->prepare("INSERT INTO check_runs (target_id, check_kind, state, checked_at, reason, probe_version, public_payload)
        VALUES ('fileferry', 'git', 'operational', ?, 'old', 'test', '{}')")->execute([Time::toDb(Time::now()->modify('-40 days'))]);
    expect($writer->pruneCheckRuns(30) === 1, 'Check rows older than the retention window are pruned.');
    expect((int) $pdo->query('SELECT COUNT(*) FROM rollups')->fetchColumn() === 2, 'Rollups are kept.');

    // Alerts: durable duplicate suppression and a per-run limit.
    $alerts = AlertEvaluator::evaluate($fixture);
    expect(count($writer->unsuppressedAlerts($alerts, 60, 10)) === 1, 'A new alert is unsuppressed.');
    $writer->recordAlertNotification($alerts[0], 'webhook');
    expect($writer->unsuppressedAlerts($alerts, 60, 10) === [], 'A repeat within the window is suppressed.');
    expect(count($writer->unsuppressedAlerts($alerts, 0, 10)) === 1, 'A repeat after the window is sent again.');
    $many = AlertEvaluator::evaluate(Snapshot::fromResults(array_map(static fn (int $i): ServiceStatus => new ServiceStatus("s{$i}", "s{$i}",
        'Sites', 'http', State::Down, Time::now(), null, 'down', 'test'), range(1, 8)), []));
    expect(count($writer->unsuppressedAlerts($many, 60, 5)) === 5, 'At most the per-run limit is sent.');

    // Deployments, incidents, and maintenance windows.
    $writer->recordDeployment(DeploymentEvent::create('status-dunamismax', 'status.dunamismax', 'abcdef1234567890', null,
        '2026-05-18T12:30:00Z', null, Time::now()));
    $deployments = $source->deployments();
    expect(count($deployments) === 1 && $deployments[0]->serviceId === 'status-dunamismax'
        && Time::toJson($deployments[0]->deployedAt) === '2026-05-18T12:30:00Z', 'Deployments read back.');
    $pdo->exec("INSERT INTO incidents (title, affected_targets, state, started_at, public_notes)
        VALUES ('Example', JSON_ARRAY('fileferry-app'), 'investigating', UTC_TIMESTAMP(6), 'notes')");
    $pdo->exec("INSERT INTO maintenance_windows (title, state, starts_at, ends_at)
        VALUES ('Recent', 'complete', UTC_TIMESTAMP(6) - INTERVAL 2 DAY, UTC_TIMESTAMP(6) - INTERVAL 1 DAY),
               ('Old', 'complete', UTC_TIMESTAMP(6) - INTERVAL 60 DAY, UTC_TIMESTAMP(6) - INTERVAL 59 DAY)");
    $incidents = $source->incidents();
    expect(count($incidents) === 1 && $incidents[0]->affectedTargets === ['fileferry-app'] && $incidents[0]->resolvedAt === null, 'Incidents read back.');
    $windows = $source->maintenanceWindows();
    expect(count($windows) === 1 && $windows[0]->title === 'Recent' && $windows[0]->affectedTargets === [], 'Only recent maintenance windows are listed.');
    rejects(fn () => $pdo->exec("INSERT INTO incidents (title, state, started_at) VALUES ('x', 'sideways', UTC_TIMESTAMP(6))"),
        'Invalid incident states are rejected by the schema.');

    // History import: original ids kept, reruns harmless, Rust-era snapshots readable.
    foreach ($tables as $table) {
        $pdo->exec("DELETE FROM {$table}");
    }
    $export = temporaryDirectory('status-import-');
    try {
        $rust = trim((string) file_get_contents(__DIR__ . '/fixtures/rust-status.json'));
        $lines = [
            'targets' => ['{"id":"caddy","name":"Caddy configuration","target_kind":"public-http","group_name":"Host infrastructure","public_url":"","probe_url":"","repo_name":null,"first_seen_at":"2026-05-18T04:15:00.123456+00:00","last_seen_at":"2026-09-23T14:08:00.536824+00:00"}'],
            'check_runs' => ['{"id":41,"target_id":"caddy","check_kind":"caddy","state":"down","checked_at":"2026-09-23T14:08:00.536824+00:00","latency_ms":21,"reason":"caddy config is invalid","probe_version":"caddy-v1","public_payload":{"target":{"id":"caddy"}},"inserted_at":"2026-09-23T14:08:01+00:00"}'],
            'rollups' => ['{"id":7,"overall_state":"down","checked_at":"2026-09-23T14:08:00.663070+00:00","operational_count":3,"degraded_count":0,"down_count":1,"maintenance_count":0,"unknown_count":0,"snapshot":' . $rust . ',"inserted_at":"2026-09-23T14:08:01+00:00"}'],
            'incidents' => ['{"id":3,"title":"Past","affected_targets":["caddy"],"state":"resolved","started_at":"2026-06-01T00:00:00+00:00","resolved_at":"2026-06-01T01:00:00+00:00","public_notes":"","created_at":"2026-06-01T00:00:00+00:00","updated_at":"2026-06-01T01:00:00+00:00"}'],
            'maintenance_windows' => [],
            'deployment_events' => ['{"id":9,"service_id":"status-dunamismax","repo_name":"status.dunamismax","commit_sha":null,"environment":"production","deployed_at":"2026-06-06T16:31:00+00:00","public_summary":"status.dunamismax deployed to production","metadata":{},"inserted_at":"2026-06-06T16:31:00+00:00"}'],
            'alert_notifications' => ['{"id":5,"dedup_key":"service:caddy:down","target_id":"caddy","severity":"critical","observed_state":"down","title":"Caddy configuration is down","public_summary":"Caddy configuration is down: caddy config is invalid","observed_at":"2026-09-23T14:08:00.536824+00:00","notification_target":"webhook","public_payload":{},"sent_at":"2026-09-23T14:08:02+00:00"}'],
        ];
        foreach ($lines as $table => $rows) {
            file_put_contents("{$export}/{$table}.jsonl", $rows === [] ? '' : implode("\n", $rows) . "\n");
        }
        $importer = new HistoryImporter($database);
        $report = $importer->import($export);
        expect($report['check_runs'] === ['read' => 1, 'inserted' => 1] && $report['maintenance_windows'] === ['read' => 0, 'inserted' => 0], 'The import reports rows read and inserted.');
        $again = $importer->import($export);
        expect($again['rollups'] === ['read' => 1, 'inserted' => 0] && $again['targets']['inserted'] === 0, 'A repeated import inserts nothing.');
        expect((int) $pdo->query('SELECT id FROM check_runs')->fetchColumn() === 41 && (int) $pdo->query('SELECT id FROM rollups')->fetchColumn() === 7,
            'Original ids are kept.');
        expect($pdo->query('SELECT first_seen_at FROM targets')->fetchColumn() === '2026-05-18 04:15:00.123456', 'Timestamps keep microseconds in UTC.');
        $imported = $source->latestSnapshot();
        expect($imported !== null && $imported->overallState === State::Down && count($imported->services) === 4 && count($imported->projects) === 2,
            'A migrated Rust-era snapshot is served until the first PHP collection.');
        expect(count($writer->unsuppressedAlerts([], 60, 5)) === 0 && $source->deployments()[0]->commitSha === null, 'Migrated rows read back.');
        $writer->recordSnapshot(snapshotFixture(Time::now()));
        expect((int) $pdo->query('SELECT MAX(id) FROM rollups')->fetchColumn() > 7, 'New rows continue after the migrated ids.');
        file_put_contents("{$export}/incidents.jsonl", '{"id":4,"title":"Bad","affected_targets":[],"state":"sideways","started_at":"2026-06-01T00:00:00+00:00","resolved_at":null,"public_notes":"","created_at":"2026-06-01T00:00:00+00:00","updated_at":"2026-06-01T00:00:00+00:00"}' . "\n");
        rejects(fn () => $importer->import($export), 'Rows that violate the schema stop the import.');
        unlink("{$export}/targets.jsonl");
        rejects(fn () => $importer->import($export), 'A missing export file stops the import before any table.');
    } finally {
        removeTree($export);
    }

    // Optional: prove the web account is read-only when its credentials are supplied.
    $webUser = getenv('TEST_WEB_DB_USER');
    if ($webUser !== false && $webUser !== '') {
        $web = new PDO(sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $config->dbHost, $config->dbPort, $config->dbName),
            $webUser, (string) getenv('TEST_WEB_DB_PASSWORD'), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        expect((int) $web->query('SELECT COUNT(*) FROM rollups')->fetchColumn() > 0, 'The web account can read rollups.');
        foreach (["INSERT INTO deployment_events (environment, deployed_at) VALUES ('x', UTC_TIMESTAMP())", 'DELETE FROM rollups', 'SELECT * FROM check_runs', 'SELECT * FROM alert_notifications'] as $sql) {
            try {
                $web->query($sql);
                expect(false, 'The web account must not run: ' . $sql);
            } catch (PDOException) {
                expect(true, 'The web account is denied: ' . $sql);
            }
        }
    }

    printf("MySQL integration passed: %d checks.\n", $checks);
} catch (Throwable $error) {
    fwrite(STDERR, 'FAIL: ' . $error->getMessage() . "\n");
    $failed = true;
} finally {
    // Leave the dedicated test database empty for the next run.
    if ($pdo !== null) {
        foreach ($tables as $table) {
            $pdo->exec("DELETE FROM {$table}");
        }
    }
}
exit($failed ? 1 : 0);
