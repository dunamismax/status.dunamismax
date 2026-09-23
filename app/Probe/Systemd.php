<?php

declare(strict_types=1);

namespace Status\Probe;

use DateTimeImmutable;
use DateTimeZone;

/** `systemctl show` access and parsing shared by the systemd, Caddy, and DDNS probes. */
final class Systemd
{
    public const SYSTEMCTL = '/usr/bin/systemctl';

    public function __construct(private readonly CommandRunner $runner)
    {
    }

    /**
     * @param list<string> $properties
     * @return array{0: ?array<string, string>, 1: CommandResult} facts, or null when systemd could not answer
     */
    public function show(string $unit, array $properties): array
    {
        $command = [self::SYSTEMCTL, 'show', $unit, '--timestamp=unix'];
        foreach ($properties as $property) {
            $command[] = '--property=' . $property;
        }
        $result = $this->runner->run($command);
        return [$result->succeeded() ? self::parse($result->stdout) : null, $result];
    }

    /** @return array<string, string> */
    public static function parse(string $output): array
    {
        $facts = [];
        foreach (preg_split('/\R/', $output) ?: [] as $line) {
            $position = strpos($line, '=');
            if ($position !== false) {
                $facts[trim(substr($line, 0, $position))] = trim(substr($line, $position + 1));
            }
        }
        return $facts;
    }

    /** Timestamps arrive as `@<unix seconds>`; older output uses `Wed 2026-09-23 13:15:13 UTC`. */
    public static function timestamp(?string $value): ?DateTimeImmutable
    {
        $value = trim((string) $value);
        if ($value === '' || $value === 'n/a' || $value === '0') {
            return null;
        }
        if (preg_match('/^@(\d+)$/', $value, $matches)) {
            return (new DateTimeImmutable('@' . $matches[1]))->setTimezone(new DateTimeZone('UTC'));
        }
        $time = DateTimeImmutable::createFromFormat('D Y-m-d H:i:s T', $value);
        return $time === false ? null : $time->setTimezone(new DateTimeZone('UTC'));
    }

    /**
     * The last run of an Exec* command, e.g.
     * `{ path=… ; start_time=[…] ; pid=0 ; code=(null) ; status=0/0 }`.
     * Returns true when it failed, false when it succeeded or never ran.
     */
    public static function execFailed(?string $value): bool
    {
        if ($value === null || !preg_match('/code=([^ ;}]+)\s*;\s*status=(\d+)/', $value, $matches)) {
            return false;
        }
        return match ($matches[1]) {
            'exited' => (int) $matches[2] !== 0,
            'killed', 'dumped' => true,
            default => false,
        };
    }
}
