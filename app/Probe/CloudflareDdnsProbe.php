<?php

declare(strict_types=1);

namespace Status\Probe;

use DateTimeImmutable;
use Status\Inventory;
use Status\Model\ServiceStatus;
use Status\Model\State;
use Status\Time;

/** The DDNS updater is a timer-driven one-shot: judge its latest run and how recent it is. */
final class CloudflareDdnsProbe
{
    public const VERSION = 'cloudflare-ddns-v2';
    public const ID = 'cloudflare-ddns-update';
    /** The timer runs every five minutes; allow several missed runs before calling it stale. */
    public const FRESH_MINUTES = 30;

    public function __construct(private readonly Systemd $systemd)
    {
    }

    public function probe(): ServiceStatus
    {
        $checkedAt = Time::now();
        [$facts, $result] = $this->systemd->show(Inventory::CLOUDFLARE_DDNS_UNIT,
            ['LoadState', 'ActiveState', 'Result', 'ExecMainStatus', 'InactiveEnterTimestamp']);
        [$state, $reason] = $facts === null
            ? [State::Unknown, 'Cloudflare DDNS status unavailable']
            : self::evaluate($facts, $checkedAt);

        return new ServiceStatus(self::ID, 'Cloudflare DDNS', 'Host infrastructure', 'cloudflare-ddns', $state,
            $checkedAt, $result->durationMs, $reason, self::VERSION);
    }

    /**
     * @param array<string, string> $facts
     * @return array{0: State, 1: string}
     */
    public static function evaluate(array $facts, DateTimeImmutable $now): array
    {
        if (($facts['LoadState'] ?? null) !== 'loaded') {
            return [State::Unknown, 'Cloudflare DDNS unit is not loaded'];
        }
        $active = $facts['ActiveState'] ?? null;
        $result = ($facts['Result'] ?? '') === '' ? 'success' : $facts['Result'];
        $execStatus = (int) ($facts['ExecMainStatus'] ?? 0);
        $lastRun = Systemd::timestamp($facts['InactiveEnterTimestamp'] ?? null);

        if (in_array($active, ['active', 'activating'], true)) {
            return [State::Operational, 'Cloudflare DDNS update is running'];
        }
        if ($result === 'success' && $execStatus === 0) {
            if ($lastRun === null) {
                return [State::Degraded, 'Cloudflare DDNS success time is unavailable'];
            }
            $minutes = intdiv(max(0, $now->getTimestamp() - $lastRun->getTimestamp()), 60);
            return $minutes > self::FRESH_MINUTES
                ? [State::Degraded, "latest Cloudflare DDNS run succeeded {$minutes} minutes ago"]
                : [State::Operational, 'latest Cloudflare DDNS run succeeded'];
        }
        if ($active === 'failed' || $execStatus > 0 || in_array($result, ['exit-code', 'signal', 'timeout'], true)) {
            return [State::Down, 'latest Cloudflare DDNS run failed'];
        }
        return [State::Unknown, 'latest Cloudflare DDNS result is unknown'];
    }
}
