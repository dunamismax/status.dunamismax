<?php

declare(strict_types=1);

namespace Status\Model;

use DateTimeImmutable;
use Status\Time;

final readonly class IncidentRecord
{
    /** @param list<string> $affectedTargets */
    public function __construct(
        public string $title,
        public array $affectedTargets,
        public string $state,
        public DateTimeImmutable $startedAt,
        public ?DateTimeImmutable $resolvedAt,
        public string $publicNotes,
    ) {
    }

    public function toArray(): array
    {
        return [
            'title' => $this->title,
            'affected_targets' => $this->affectedTargets,
            'state' => $this->state,
            'started_at' => Time::toJson($this->startedAt),
            'resolved_at' => $this->resolvedAt === null ? null : Time::toJson($this->resolvedAt),
            'public_notes' => $this->publicNotes,
        ];
    }
}
