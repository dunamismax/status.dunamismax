<?php

declare(strict_types=1);

namespace Status\Probe;

use Status\Model\ServiceStatus;
use Status\Model\State;
use Status\Targets\SystemdTarget;
use Status\Time;

final class SystemdProbe
{
    public const VERSION = 'systemd-v1';
    private const PROPERTIES = ['LoadState', 'ActiveState', 'SubState', 'Result', 'ExecMainStatus', 'NRestarts'];

    public function __construct(private readonly Systemd $systemd)
    {
    }

    public function probe(SystemdTarget $target): ServiceStatus
    {
        $checkedAt = Time::now();
        [$facts, $result] = $this->systemd->show($target->unit, self::PROPERTIES);
        [$state, $reason] = $facts === null
            ? [State::Unknown, 'systemd state unavailable']
            : self::evaluate($target, $facts);

        return new ServiceStatus($target->id, $target->unit, $target->group, 'systemd', $state,
            $checkedAt, $result->durationMs, $reason, self::VERSION);
    }

    /**
     * @param array<string, string> $facts
     * @return array{0: State, 1: string}
     */
    public static function evaluate(SystemdTarget $target, array $facts): array
    {
        if (($facts['LoadState'] ?? null) !== 'loaded') {
            return [State::Unknown, 'unit is not loaded'];
        }
        $active = $facts['ActiveState'] ?? null;
        $result = ($facts['Result'] ?? '') === '' ? 'success' : $facts['Result'];
        $execStatus = (int) ($facts['ExecMainStatus'] ?? 0);

        if (!$target->oneShot) {
            $restarts = (int) ($facts['NRestarts'] ?? 0);
            return match (true) {
                $active === 'active' && $result === 'success' && $restarts < 5 => [State::Operational, 'unit is active'],
                $active === 'active' => [State::Degraded, 'unit is active but restart or result evidence needs attention'],
                in_array($active, ['reloading', 'activating', 'deactivating'], true) => [State::Degraded, 'unit is transitioning'],
                $active === 'failed' => [State::Down, 'unit failed'],
                $active === 'inactive' => [State::Down, 'unit is inactive'],
                default => [State::Unknown, 'unit state is unknown'],
            };
        }

        // One-shot units are healthy when their latest run succeeded, even though inactive.
        return match (true) {
            in_array($active, ['active', 'activating'], true) => [State::Operational, 'one-shot is running'],
            $result === 'success' && $execStatus === 0 => [State::Operational, 'latest one-shot run succeeded'],
            $active === 'failed' || $execStatus > 0 || in_array($result, ['exit-code', 'signal', 'timeout'], true)
                => [State::Down, 'latest one-shot run failed'],
            default => [State::Unknown, 'latest one-shot result is unknown'],
        };
    }
}
