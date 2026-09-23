<?php

declare(strict_types=1);

namespace Status;

use Status\Model\ServiceStatus;
use Status\Model\Snapshot;
use Status\Model\State;

/** Small formatting rules shared by the page templates. */
final class Presenter
{
    public static function headline(State $state): string
    {
        return match ($state) {
            State::Operational => 'All monitored services are operational',
            State::Degraded => 'Some monitored services are degraded',
            State::Down => 'One or more monitored services are down',
            State::Maintenance => 'Maintenance is in progress',
            State::Unknown => 'Monitored service status is unknown',
        };
    }

    public static function lede(Snapshot $snapshot): string
    {
        $count = count($snapshot->services);
        $affected = $snapshot->attentionCount();
        return $affected === 0
            ? "All {$count} monitored checks are reporting normally."
            : "{$affected} of {$count} monitored checks need attention. The list below names the affected checks and public-safe reasons.";
    }

    public static function latency(?int $latencyMs): string
    {
        return $latencyMs === null ? 'n/a' : $latencyMs . ' ms';
    }

    /** @return list<ServiceStatus> the first six checks that are not operational */
    public static function attention(Snapshot $snapshot): array
    {
        $services = array_filter($snapshot->services, static fn (ServiceStatus $s): bool => $s->state !== State::Operational);
        return array_slice(array_values($services), 0, 6);
    }

    /** @return array<string, State> worst state per group, alphabetical */
    public static function groupStates(Snapshot $snapshot): array
    {
        $groups = [];
        foreach ($snapshot->services as $service) {
            $current = $groups[$service->group] ?? null;
            if ($current === null || $service->state->rank() > $current->rank()) {
                $groups[$service->group] = $service->state;
            }
        }
        ksort($groups, SORT_STRING);
        return $groups;
    }

    /**
     * @param list<ServiceStatus> $services
     * @return array<string, list<ServiceStatus>> grouped in the inventory order, then alphabetically
     */
    public static function serviceSections(array $services): array
    {
        $groups = [];
        foreach ($services as $service) {
            $groups[$service->group][] = $service;
        }
        $ordered = [];
        foreach (Inventory::GROUP_ORDER as $group) {
            if (isset($groups[$group])) {
                $ordered[$group] = $groups[$group];
                unset($groups[$group]);
            }
        }
        ksort($groups, SORT_STRING);
        return $ordered + $groups;
    }

    /** @param list<ServiceStatus> $services */
    public static function worst(array $services): State
    {
        return State::worst(array_map(static fn (ServiceStatus $s): State => $s->state, $services));
    }

    public static function serviceName(ServiceStatus $service): string
    {
        return $service->publicUrl === ''
            ? e($service->name)
            : '<a href="' . e($service->publicUrl) . '">' . e($service->name) . '</a>';
    }

    public static function state(State $state, ?string $label = null): string
    {
        return '<span class="state state-' . $state->value . '">' . e($label ?? $state->value) . '</span>';
    }

    public static function worktree(?bool $dirty): string
    {
        return match ($dirty) {
            true => 'dirty',
            false => 'clean',
            null => 'unknown',
        };
    }

    public static function shortCommit(?string $commit): string
    {
        return $commit === null ? 'unknown' : substr($commit, 0, 12);
    }

    /** @param list<string> $headings */
    public static function table(array $headings, string $rows): string
    {
        $head = implode('', array_map(static fn (string $h): string => '<th scope="col">' . e($h) . '</th>', $headings));
        return "<div class=\"table-wrap\">\n  <table class=\"status-table\">\n    <thead><tr>{$head}</tr></thead>\n"
            . "    <tbody>{$rows}</tbody>\n  </table>\n</div>";
    }

    public static function emptyState(string $message): string
    {
        return '<p class="empty-state">' . e($message) . '</p>';
    }
}
