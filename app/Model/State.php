<?php

declare(strict_types=1);

namespace Status\Model;

enum State: string
{
    case Operational = 'operational';
    case Degraded = 'degraded';
    case Down = 'down';
    case Maintenance = 'maintenance';
    case Unknown = 'unknown';

    /** Rollups take the most severe state; unknown outranks maintenance but not degraded. */
    public function rank(): int
    {
        return match ($this) {
            self::Operational => 0,
            self::Maintenance => 1,
            self::Unknown => 2,
            self::Degraded => 3,
            self::Down => 4,
        };
    }

    /** @param iterable<self> $states */
    public static function worst(iterable $states): self
    {
        $worst = null;
        foreach ($states as $state) {
            if ($worst === null || $state->rank() > $worst->rank()) {
                $worst = $state;
            }
        }
        return $worst ?? self::Unknown;
    }

    /** Stored or migrated values that are not a known state are honestly unknown. */
    public static function parse(mixed $value): self
    {
        return is_string($value) ? (self::tryFrom($value) ?? self::Unknown) : self::Unknown;
    }
}
