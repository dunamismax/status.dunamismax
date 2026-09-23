<?php

declare(strict_types=1);

namespace Status\Targets;

/** A unit that should be running, or a one-shot unit whose latest run should have succeeded. */
final readonly class SystemdTarget
{
    public function __construct(
        public string $id,
        public string $unit,
        public string $group,
        public bool $oneShot = false,
    ) {
    }
}
