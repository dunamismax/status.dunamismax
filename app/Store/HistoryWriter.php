<?php

declare(strict_types=1);

namespace Status\Store;

use Status\Alert\AlertCandidate;
use Status\Database;
use Status\Model\DeploymentEvent;
use Status\Model\ProjectStatus;
use Status\Model\ServiceStatus;
use Status\Model\Snapshot;
use Status\Time;
use Throwable;

/** Writes made by the collector account: snapshots, pruning, alert history, deployments. */
final class HistoryWriter
{
    private const JSON = JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR;

    public function __construct(private readonly Database $database)
    {
    }

    /** One transaction: every target, every check row, and the rollup. */
    public function recordSnapshot(Snapshot $snapshot): void
    {
        $pdo = $this->database->connection();
        $pdo->beginTransaction();
        try {
            $target = $pdo->prepare(
                'INSERT INTO targets (id, name, target_kind, group_name, public_url, probe_url, repo_name, first_seen_at, last_seen_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) AS new
                 ON DUPLICATE KEY UPDATE name = new.name, target_kind = new.target_kind, group_name = new.group_name,
                     public_url = new.public_url, probe_url = new.probe_url, repo_name = new.repo_name,
                     last_seen_at = new.last_seen_at'
            );
            $check = $pdo->prepare(
                'INSERT INTO check_runs (target_id, check_kind, state, checked_at, latency_ms, reason, probe_version, public_payload)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
            );

            foreach ($snapshot->services as $service) {
                $seen = Time::toDb($service->checkedAt);
                $target->execute([$service->id, $service->name, self::serviceKind($service), $service->group,
                    $service->publicUrl, $service->probeUrl, null, $seen, $seen]);
                $check->execute([$service->id, $service->checkKind, $service->state->value, $seen, $service->latencyMs,
                    $service->reason, $service->probeVersion, json_encode($service->toArray(), self::JSON)]);
            }
            foreach ($snapshot->projects as $project) {
                $seen = Time::toDb($project->checkedAt);
                $target->execute([$project->id, $project->name, 'project', null, $project->publicUrl, null,
                    $project->repoName, $seen, $seen]);
                $check->execute([$project->id, 'git', $project->state->value, $seen, null, $project->reason,
                    $project->probeVersion, json_encode(self::projectPayload($project), self::JSON)]);
            }

            $pdo->prepare(
                'INSERT INTO rollups (overall_state, checked_at, operational_count, degraded_count, down_count,
                     maintenance_count, unknown_count, snapshot) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
            )->execute([
                $snapshot->overallState->value, Time::toDb($snapshot->checkedAt),
                $snapshot->summary['operational'], $snapshot->summary['degraded'], $snapshot->summary['down'],
                $snapshot->summary['maintenance'], $snapshot->summary['unknown'], $snapshot->toJson(),
            ]);
            $pdo->commit();
        } catch (Throwable $error) {
            $pdo->rollBack();
            throw $error;
        }
    }

    /** Check rows expire; rollups, incidents, deployments, and alert history are kept. */
    public function pruneCheckRuns(int $retentionDays): int
    {
        $statement = $this->database->connection()->prepare(
            'DELETE FROM check_runs WHERE checked_at < UTC_TIMESTAMP(6) - INTERVAL ? DAY'
        );
        $statement->execute([$retentionDays]);
        return $statement->rowCount();
    }

    /**
     * Alerts not already sent within the repeat window, at most $max of them.
     *
     * @param list<AlertCandidate> $alerts
     * @return list<AlertCandidate>
     */
    public function unsuppressedAlerts(array $alerts, int $repeatAfterMinutes, int $max): array
    {
        $recent = $this->database->connection()->prepare(
            'SELECT EXISTS (SELECT 1 FROM alert_notifications
                 WHERE dedup_key = ? AND sent_at >= UTC_TIMESTAMP(6) - INTERVAL ? MINUTE)'
        );
        $unsuppressed = [];
        foreach ($alerts as $alert) {
            if (count($unsuppressed) >= $max) {
                break;
            }
            $recent->execute([$alert->dedupKey, $repeatAfterMinutes]);
            if ((int) $recent->fetchColumn() === 0) {
                $unsuppressed[] = $alert;
            }
            $recent->closeCursor();
        }
        return $unsuppressed;
    }

    public function recordAlertNotification(AlertCandidate $alert, string $notificationTarget): void
    {
        $this->database->connection()->prepare(
            'INSERT INTO alert_notifications (dedup_key, target_id, severity, observed_state, title, public_summary,
                 observed_at, notification_target, public_payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([$alert->dedupKey, $alert->targetId, $alert->severity, $alert->state->value, $alert->title,
            $alert->publicSummary, Time::toDb($alert->observedAt), $notificationTarget,
            json_encode($alert->toArray(), self::JSON)]);
    }

    public function recordDeployment(DeploymentEvent $event): void
    {
        $this->database->connection()->prepare(
            'INSERT INTO deployment_events (service_id, repo_name, commit_sha, environment, deployed_at, public_summary)
             VALUES (?, ?, ?, ?, ?, ?)'
        )->execute([$event->serviceId, $event->repoName, $event->commitSha, $event->environment,
            Time::toDb($event->deployedAt), $event->publicSummary]);
    }

    private static function serviceKind(ServiceStatus $service): string
    {
        return $service->checkKind === 'http' ? 'public-http' : 'host';
    }

    private static function projectPayload(ProjectStatus $project): array
    {
        $data = $project->toArray();
        return ['git' => $data['git'], 'build' => $data['build']];
    }
}
