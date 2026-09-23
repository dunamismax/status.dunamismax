<?php

declare(strict_types=1);

namespace Status\Store;

use Status\Database;
use Status\Model\DeploymentEvent;
use Status\Model\IncidentRecord;
use Status\Model\MaintenanceWindow;
use Status\Model\Snapshot;
use Status\Time;

/** Read-only queries for the web pool's SELECT-only account. */
final class MysqlStatusSource implements StatusSource
{
    public function __construct(private readonly Database $database)
    {
    }

    public function isConfigured(): bool
    {
        return $this->database->isConfigured();
    }

    public function ping(): void
    {
        $this->database->connection()->query('SELECT 1')->fetchColumn();
    }

    public function latestSnapshot(): ?Snapshot
    {
        $row = $this->database->connection()
            ->query('SELECT snapshot FROM rollups ORDER BY checked_at DESC, id DESC LIMIT 1')
            ->fetch();
        if ($row === false) {
            return null;
        }
        return Snapshot::fromArray(json_decode((string) $row['snapshot'], true, 64, JSON_THROW_ON_ERROR));
    }

    public function incidents(): array
    {
        $rows = $this->database->connection()->query(
            'SELECT title, affected_targets, state, started_at, resolved_at, public_notes
             FROM incidents ORDER BY started_at DESC, id DESC LIMIT 25'
        )->fetchAll();

        return array_map(static fn (array $row): IncidentRecord => new IncidentRecord(
            $row['title'], self::targets($row['affected_targets']), $row['state'],
            Time::fromDb($row['started_at']),
            $row['resolved_at'] === null ? null : Time::fromDb($row['resolved_at']),
            $row['public_notes'],
        ), $rows);
    }

    public function maintenanceWindows(): array
    {
        $rows = $this->database->connection()->query(
            'SELECT title, affected_targets, state, starts_at, ends_at, public_notes
             FROM maintenance_windows
             WHERE ends_at >= UTC_TIMESTAMP(6) - INTERVAL 30 DAY
             ORDER BY starts_at DESC, id DESC LIMIT 25'
        )->fetchAll();

        return array_map(static fn (array $row): MaintenanceWindow => new MaintenanceWindow(
            $row['title'], self::targets($row['affected_targets']), $row['state'],
            Time::fromDb($row['starts_at']), Time::fromDb($row['ends_at']), $row['public_notes'],
        ), $rows);
    }

    public function deployments(): array
    {
        $rows = $this->database->connection()->query(
            'SELECT service_id, repo_name, commit_sha, environment, deployed_at, public_summary
             FROM deployment_events ORDER BY deployed_at DESC, id DESC LIMIT 50'
        )->fetchAll();

        return array_map(static fn (array $row): DeploymentEvent => new DeploymentEvent(
            $row['service_id'], $row['repo_name'], $row['commit_sha'], $row['environment'],
            Time::fromDb($row['deployed_at']), $row['public_summary'],
        ), $rows);
    }

    /** @return list<string> */
    private static function targets(string $json): array
    {
        $values = json_decode($json, true, 8, JSON_THROW_ON_ERROR);
        return is_array($values) ? array_values(array_map('strval', array_filter($values, 'is_scalar'))) : [];
    }
}
