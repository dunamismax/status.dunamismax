<?php

declare(strict_types=1);

namespace Status;

use DateTimeImmutable;
use DateTimeZone;
use RuntimeException;

/** UTC timestamps in the formats the JSON API, MySQL, and pages use. */
final class Time
{
    /** Pages have always shown a fixed UTC-05:00 offset labelled EST. */
    private const DISPLAY_OFFSET = '-05:00';

    public static function now(): DateTimeImmutable
    {
        return new DateTimeImmutable('now', new DateTimeZone('UTC'));
    }

    /** RFC 3339 in UTC with a `Z` suffix and only as many fractional digits as needed. */
    public static function toJson(DateTimeImmutable $time): string
    {
        $time = $time->setTimezone(new DateTimeZone('UTC'));
        $micro = (int) $time->format('u');
        $fraction = match (true) {
            $micro === 0 => '',
            $micro % 1000 === 0 => '.' . substr($time->format('u'), 0, 3),
            default => '.' . $time->format('u'),
        };
        return $time->format('Y-m-d\TH:i:s') . $fraction . 'Z';
    }

    /** Parse an RFC 3339 timestamp, including nanosecond fractions from older records. */
    public static function parse(string $value): DateTimeImmutable
    {
        $value = trim($value);
        if (!preg_match('/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}(?::?\d{2})?)$/i', $value, $parts)) {
            throw new RuntimeException('Timestamp must be RFC 3339 with an explicit offset.');
        }
        $fraction = str_pad(substr($parts[3] ?? '', 0, 6), 6, '0');
        $offset = strtoupper($parts[4]) === 'Z' ? '+00:00' : $parts[4];
        if (preg_match('/^[+-]\d{2}$/', $offset)) {
            $offset .= ':00';
        }
        $time = DateTimeImmutable::createFromFormat('Y-m-d H:i:s.uP', "{$parts[1]} {$parts[2]}.{$fraction}{$offset}");
        $errors = DateTimeImmutable::getLastErrors();
        if ($time === false || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))) {
            throw new RuntimeException('Timestamp is not a valid calendar time.');
        }
        return $time->setTimezone(new DateTimeZone('UTC'));
    }

    public static function toDb(DateTimeImmutable $time): string
    {
        return $time->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s.u');
    }

    public static function fromDb(string $value): DateTimeImmutable
    {
        $time = DateTimeImmutable::createFromFormat('Y-m-d H:i:s.u', str_contains($value, '.') ? $value : $value . '.000000', new DateTimeZone('UTC'));
        if ($time === false) {
            throw new RuntimeException('Unexpected database timestamp.');
        }
        return $time;
    }

    public static function display(DateTimeImmutable $time): string
    {
        return $time->setTimezone(new DateTimeZone(self::DISPLAY_OFFSET))->format('Y-m-d H:i:s') . ' EST';
    }
}
