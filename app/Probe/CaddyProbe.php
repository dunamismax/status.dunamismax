<?php

declare(strict_types=1);

namespace Status\Probe;

use Status\Inventory;
use Status\Model\ServiceStatus;
use Status\Model\State;
use Status\Time;

/**
 * Caddy configuration evidence without privileges. `caddy validate` opens every
 * configured log writer, which only the caddy user may do, so an unprivileged
 * validate always fails. `caddy adapt` parses the Caddyfile and its imports
 * with the production binary; systemd supplies service and reload evidence.
 */
final class CaddyProbe
{
    public const VERSION = 'caddy-v2';
    public const ID = 'caddy-config';

    public function __construct(
        private readonly CommandRunner $runner,
        private readonly Systemd $systemd,
        private readonly string $binary = Inventory::CADDY_BINARY,
        private readonly string $caddyfile = Inventory::CADDYFILE,
    ) {
    }

    public function probe(): ServiceStatus
    {
        $checkedAt = Time::now();
        $adapt = $this->runner->run([$this->binary, 'adapt', '--config', $this->caddyfile, '--adapter', 'caddyfile'], discardStdout: true);
        $facts = null;
        $duration = $adapt->durationMs;
        if ($adapt->succeeded()) {
            [$facts, $show] = $this->systemd->show(Inventory::CADDY_UNIT, ['ActiveState', 'Result', 'ActiveEnterTimestamp', 'ExecReload']);
            $duration += $show->durationMs;
        }
        [$state, $reason] = self::evaluate($adapt, $facts);

        return new ServiceStatus(self::ID, 'Caddy configuration', 'Host infrastructure', 'caddy', $state,
            $checkedAt, $duration, $reason, self::VERSION);
    }

    /**
     * @param array<string, string>|null $facts null when systemd could not answer
     * @return array{0: State, 1: string}
     */
    public static function evaluate(CommandResult $adapt, ?array $facts): array
    {
        if ($adapt->exitCode === null) {
            return [State::Unknown, 'Caddyfile check unavailable'];
        }
        if ($adapt->exitCode !== 0) {
            // Unreadable is not the same as invalid: do not raise a false alarm.
            return stripos($adapt->stderr, 'permission denied') !== false
                ? [State::Unknown, 'Caddyfile could not be read']
                : [State::Degraded, 'Caddyfile failed to parse; the running config is unchanged until reload'];
        }
        if ($facts === null) {
            return [State::Unknown, 'caddy reload evidence unavailable'];
        }

        $active = $facts['ActiveState'] ?? null;
        $result = ($facts['Result'] ?? '') === '' ? 'success' : $facts['Result'];
        $since = Systemd::timestamp($facts['ActiveEnterTimestamp'] ?? null);

        return match (true) {
            $active === 'failed' => [State::Down, 'caddy service failed'],
            $active === 'active' && Systemd::execFailed($facts['ExecReload'] ?? null)
                => [State::Degraded, 'latest caddy reload failed; the previous config is still serving'],
            $active === 'active' && $result === 'success' && $since !== null
                => [State::Operational, 'Caddyfile parses and caddy is active'],
            $active === 'active' && $result === 'success'
                => [State::Degraded, 'Caddyfile parses but reload recency is unavailable'],
            default => [State::Unknown, 'caddy service state is unknown'],
        };
    }
}
