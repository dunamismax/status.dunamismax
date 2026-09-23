<?php

declare(strict_types=1);

namespace Status;

use DateTimeImmutable;
use Status\Model\Snapshot;

/** How old the latest collector snapshot is, and whether it can still be called current. */
final readonly class Freshness
{
    private function __construct(
        public ?DateTimeImmutable $checkedAt,
        public int $ageMinutes,
        public bool $stale,
    ) {
    }

    public static function of(?Snapshot $snapshot, DateTimeImmutable $now, int $staleAfterMinutes): self
    {
        if ($snapshot === null) {
            return new self(null, 0, true);
        }
        $age = intdiv(max(0, $now->getTimestamp() - $snapshot->checkedAt->getTimestamp()), 60);
        return new self($snapshot->checkedAt, $age, $age >= $staleAfterMinutes);
    }

    public function missing(): bool
    {
        return $this->checkedAt === null;
    }

    public function dependency(): string
    {
        return match (true) {
            $this->missing() => 'collector-snapshot-missing',
            $this->stale => 'collector-snapshot-stale',
            default => 'collector-snapshot-fresh',
        };
    }
}
