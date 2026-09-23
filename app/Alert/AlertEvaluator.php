<?php

declare(strict_types=1);

namespace Status\Alert;

use Status\Model\Snapshot;
use Status\Model\State;

/** Down is critical; degraded and unknown are warnings; operational and maintenance never notify. */
final class AlertEvaluator
{
    /** @return list<AlertCandidate> critical first, then by target name */
    public static function evaluate(Snapshot $snapshot): array
    {
        $alerts = [];
        foreach ($snapshot->services as $service) {
            $severity = self::severity($service->state);
            if ($severity !== null) {
                $alerts[] = self::candidate('service', $service->id, $service->name, $severity, $service->state,
                    $service->checkedAt, $service->reason);
            }
        }
        foreach ($snapshot->projects as $project) {
            $severity = self::severity($project->state);
            if ($severity !== null) {
                $alerts[] = self::candidate('project', $project->id, $project->name, $severity, $project->state,
                    $project->checkedAt, $project->reason);
            }
        }

        usort($alerts, static fn (AlertCandidate $a, AlertCandidate $b): int =>
            ($b->severityRank() <=> $a->severityRank()) ?: strcmp($a->targetName, $b->targetName));
        return $alerts;
    }

    public static function severity(State $state): ?string
    {
        return match ($state) {
            State::Down => 'critical',
            State::Degraded, State::Unknown => 'warning',
            State::Operational, State::Maintenance => null,
        };
    }

    private static function candidate(string $kind, string $id, string $name, string $severity, State $state,
        \DateTimeImmutable $observedAt, string $reason): AlertCandidate
    {
        return new AlertCandidate("{$kind}:{$id}:{$state->value}", $id, $name, $severity, $state, $observedAt,
            "{$name} is {$state->value}", "{$name} is {$state->value}: {$reason}");
    }
}
