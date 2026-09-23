<?php

declare(strict_types=1);

namespace Status\Probe;

use Status\Model\ServiceStatus;
use Status\Model\State;
use Status\Time;

/** Root filesystem capacity from `df`, which reports usage the way operators read it. */
final class DiskProbe
{
    public const VERSION = 'disk-v1';
    public const DF = '/usr/bin/df';

    public function __construct(private readonly CommandRunner $runner)
    {
    }

    public function probe(): ServiceStatus
    {
        $checkedAt = Time::now();
        $result = $this->runner->run([self::DF, '--output=pcent,avail', '/']);
        [$state, $reason] = $result->succeeded()
            ? self::evaluate($result->stdout)
            : [State::Unknown, 'root filesystem usage unavailable'];

        return new ServiceStatus('root-disk', 'Root filesystem', 'Host capacity', 'disk', $state,
            $checkedAt, $result->durationMs, $reason, self::VERSION);
    }

    /** @return array{0: State, 1: string} */
    public static function evaluate(string $output): array
    {
        $lines = preg_split('/\R/', trim($output)) ?: [];
        if (!isset($lines[1]) || !preg_match('/^\s*(\d{1,3})%\s+(\d+)\s*$/', $lines[1], $matches)) {
            return [State::Unknown, 'root filesystem usage could not be parsed'];
        }
        $usage = (int) $matches[1];
        $reason = sprintf('root filesystem is %d%% full; %s available', $usage, self::formatKib((int) $matches[2]));
        return match (true) {
            $usage >= 90 => [State::Down, $reason],
            $usage >= 80 => [State::Degraded, $reason],
            default => [State::Operational, $reason],
        };
    }

    public static function formatKib(int $kib): string
    {
        $gib = 1024 * 1024;
        $mib = 1024;
        return match (true) {
            $kib >= $gib => intdiv($kib + intdiv($gib, 2), $gib) . 'G',
            $kib >= $mib => intdiv($kib + intdiv($mib, 2), $mib) . 'M',
            default => $kib . 'K',
        };
    }
}
