<?php

declare(strict_types=1);

namespace Status\Store;

use PDO;
use RuntimeException;
use SplFileObject;
use Status\Database;
use Status\Time;
use Throwable;

/**
 * Loads the PostgreSQL history export (one `row_to_json` object per line, one
 * file per table) into MySQL. Original ids are kept, and rows that already
 * exist are left alone, so a repeated import is harmless.
 */
final class HistoryImporter
{
    private const BATCH = 1000;
    private const JSON = JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR;

    /** Column types: s string, s? nullable string, i int, i? nullable int, t time, t? nullable time, j JSON. */
    public const TABLES = [
        'targets' => ['id' => 's', 'name' => 's', 'target_kind' => 's', 'group_name' => 's?', 'public_url' => 's?',
            'probe_url' => 's?', 'repo_name' => 's?', 'first_seen_at' => 't', 'last_seen_at' => 't'],
        'check_runs' => ['id' => 'i', 'target_id' => 's', 'check_kind' => 's', 'state' => 's', 'checked_at' => 't',
            'latency_ms' => 'i?', 'reason' => 's', 'probe_version' => 's', 'public_payload' => 'j', 'inserted_at' => 't'],
        'rollups' => ['id' => 'i', 'overall_state' => 's', 'checked_at' => 't', 'operational_count' => 'i',
            'degraded_count' => 'i', 'down_count' => 'i', 'maintenance_count' => 'i', 'unknown_count' => 'i',
            'snapshot' => 'j', 'inserted_at' => 't'],
        'incidents' => ['id' => 'i', 'title' => 's', 'affected_targets' => 'j', 'state' => 's', 'started_at' => 't',
            'resolved_at' => 't?', 'public_notes' => 's', 'created_at' => 't', 'updated_at' => 't'],
        'maintenance_windows' => ['id' => 'i', 'title' => 's', 'affected_targets' => 'j', 'state' => 's',
            'starts_at' => 't', 'ends_at' => 't', 'public_notes' => 's', 'created_at' => 't', 'updated_at' => 't'],
        'deployment_events' => ['id' => 'i', 'service_id' => 's?', 'repo_name' => 's?', 'commit_sha' => 's?',
            'environment' => 's', 'deployed_at' => 't', 'public_summary' => 's', 'metadata' => 'j', 'inserted_at' => 't'],
        'alert_notifications' => ['id' => 'i', 'dedup_key' => 's', 'target_id' => 's', 'severity' => 's',
            'observed_state' => 's', 'title' => 's', 'public_summary' => 's', 'observed_at' => 't',
            'notification_target' => 's', 'public_payload' => 'j', 'sent_at' => 't'],
    ];

    public function __construct(private readonly Database $database)
    {
    }

    /** @return array<string, array{read: int, inserted: int}> */
    public function import(string $directory): array
    {
        foreach (array_keys(self::TABLES) as $table) {
            if (!is_file("{$directory}/{$table}.jsonl") || !is_readable("{$directory}/{$table}.jsonl")) {
                throw new RuntimeException("Missing or unreadable export file: {$table}.jsonl");
            }
        }

        $report = [];
        foreach (self::TABLES as $table => $columns) {
            $report[$table] = $this->importTable($this->database->connection(), $table, $columns, "{$directory}/{$table}.jsonl");
        }
        return $report;
    }

    /** @return array{read: int, inserted: int} */
    private function importTable(PDO $pdo, string $table, array $columns, string $file): array
    {
        $names = array_keys($columns);
        // Existing rows win. A target keeps the earliest first-seen time from either store.
        $onDuplicate = $table === 'targets'
            ? 'first_seen_at = LEAST(targets.first_seen_at, new.first_seen_at)'
            : "id = {$table}.id";
        $insert = $pdo->prepare(sprintf('INSERT INTO %s (%s) VALUES (%s) AS new ON DUPLICATE KEY UPDATE %s', $table,
            implode(', ', $names), implode(', ', array_fill(0, count($names), '?')), $onDuplicate));

        $read = 0;
        $inserted = 0;
        $input = new SplFileObject($file, 'r');
        $pdo->beginTransaction();
        try {
            while (!$input->eof()) {
                $line = trim((string) $input->fgets());
                if ($line === '') {
                    continue;
                }
                $read++;
                try {
                    $row = json_decode($line, true, 512, JSON_THROW_ON_ERROR);
                    $insert->execute(self::values($row, $columns));
                } catch (Throwable $error) {
                    throw new RuntimeException("{$table}.jsonl line {$input->key()}: " . $error->getMessage(), 0, $error);
                }
                // A no-op duplicate update reports 0 affected rows; a new row reports 1.
                $inserted += $insert->rowCount() === 1 ? 1 : 0;
                if ($read % self::BATCH === 0) {
                    $pdo->commit();
                    $pdo->beginTransaction();
                }
            }
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }

        return ['read' => $read, 'inserted' => $inserted];
    }

    /** @return list<mixed> */
    public static function values(mixed $row, array $columns): array
    {
        if (!is_array($row)) {
            throw new RuntimeException('expected a JSON object');
        }
        $values = [];
        foreach ($columns as $column => $type) {
            $value = $row[$column] ?? null;
            $nullable = str_ends_with($type, '?');
            if ($value === null) {
                if (!$nullable && $type !== 'j') {
                    throw new RuntimeException("{$column} is required");
                }
                $values[] = $type === 'j' ? ($column === 'affected_targets' ? '[]' : '{}') : null;
                continue;
            }
            $values[] = match (rtrim($type, '?')) {
                's' => is_scalar($value) ? (string) $value : throw new RuntimeException("{$column} must be text"),
                'i' => is_int($value) ? $value : throw new RuntimeException("{$column} must be an integer"),
                't' => Time::toDb(Time::parse((string) $value)),
                'j' => json_encode($value, self::JSON),
            };
        }
        return $values;
    }
}
