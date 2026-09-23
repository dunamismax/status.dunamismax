<?php

declare(strict_types=1);

namespace Status\Probe;

final readonly class CommandResult
{
    /** @param int|null $exitCode null when the command could not start or timed out */
    public function __construct(
        public ?int $exitCode,
        public string $stdout,
        public string $stderr,
        public int $durationMs,
        public bool $timedOut = false,
    ) {
    }

    public function succeeded(): bool
    {
        return $this->exitCode === 0;
    }
}
