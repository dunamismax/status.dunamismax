<?php

declare(strict_types=1);

namespace Status\Model;

use DateTimeImmutable;
use Status\Time;

/**
 * One collector run: every service and project result plus the rollup.
 * The summary counts services only; the overall state covers both.
 */
final readonly class Snapshot
{
    /**
     * @param list<ServiceStatus> $services
     * @param list<ProjectStatus> $projects
     * @param array<string, int> $summary
     */
    private function __construct(
        public State $overallState,
        public DateTimeImmutable $checkedAt,
        public array $summary,
        public array $services,
        public array $projects,
    ) {
    }

    /**
     * @param list<ServiceStatus> $services
     * @param list<ProjectStatus> $projects
     * @param DateTimeImmutable|null $emptyCheckedAt used only when there are no results at all
     */
    public static function fromResults(array $services, array $projects, ?DateTimeImmutable $emptyCheckedAt = null): self
    {
        usort($services, static fn (ServiceStatus $a, ServiceStatus $b): int => strcmp($a->name, $b->name));
        usort($projects, static fn (ProjectStatus $a, ProjectStatus $b): int => strcmp($a->name, $b->name));

        $checkedAt = null;
        foreach ([...$services, ...$projects] as $result) {
            if ($checkedAt === null || $result->checkedAt > $checkedAt) {
                $checkedAt = $result->checkedAt;
            }
        }

        $summary = array_fill_keys(array_map(static fn (State $state): string => $state->value, State::cases()), 0);
        foreach ($services as $service) {
            $summary[$service->state->value]++;
        }

        $states = [...array_map(static fn (ServiceStatus $s): State => $s->state, $services),
            ...array_map(static fn (ProjectStatus $p): State => $p->state, $projects)];

        return new self(State::worst($states), $checkedAt ?? $emptyCheckedAt ?? Time::now(), $summary, $services, $projects);
    }

    /** A snapshot with nothing observed: the honest state is unknown. */
    public static function empty(?DateTimeImmutable $at = null): self
    {
        return self::fromResults([], [], $at);
    }

    /** The overview and service pages roll up services only, as they always have. */
    public function servicesOnly(): self
    {
        return self::fromResults($this->services, [], $this->checkedAt);
    }

    public function attentionCount(): int
    {
        return $this->summary['degraded'] + $this->summary['down'] + $this->summary['maintenance'] + $this->summary['unknown'];
    }

    public function toArray(): array
    {
        return [
            'overall_state' => $this->overallState->value,
            'checked_at' => Time::toJson($this->checkedAt),
            'summary' => $this->summary,
            'services' => array_map(static fn (ServiceStatus $s): array => $s->toArray(), $this->services),
            'projects' => array_map(static fn (ProjectStatus $p): array => $p->toArray(), $this->projects),
        ];
    }

    public function toJson(): string
    {
        return json_encode($this->toArray(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR);
    }

    /** Rebuild from stored JSON, recomputing the rollup so the published shape is canonical. */
    public static function fromArray(array $data): self
    {
        $services = array_map(static fn (array $s): ServiceStatus => ServiceStatus::fromArray($s),
            array_values(array_filter($data['services'] ?? [], 'is_array')));
        $projects = array_map(static fn (array $p): ProjectStatus => ProjectStatus::fromArray($p),
            array_values(array_filter($data['projects'] ?? [], 'is_array')));
        $checkedAt = isset($data['checked_at']) ? Time::parse((string) $data['checked_at']) : null;
        return self::fromResults($services, $projects, $checkedAt);
    }
}
