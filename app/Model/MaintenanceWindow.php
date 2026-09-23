<?php

declare(strict_types=1);

namespace Status\Model;

use DateTimeImmutable;
use Status\Time;

final readonly class MaintenanceWindow
{
    /** @param list<string> $affectedTargets */
    public function __construct(
        public string $title,
        public array $affectedTargets,
        public string $state,
        public DateTimeImmutable $startsAt,
        public DateTimeImmutable $endsAt,
        public string $publicNotes,
    ) {
    }

    public function toArray(): array
    {
        return [
            'title' => $this->title,
            'affected_targets' => $this->affectedTargets,
            'state' => $this->state,
            'starts_at' => Time::toJson($this->startsAt),
            'ends_at' => Time::toJson($this->endsAt),
            'public_notes' => $this->publicNotes,
        ];
    }
}
