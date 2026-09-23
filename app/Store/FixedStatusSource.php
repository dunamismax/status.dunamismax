<?php

declare(strict_types=1);

namespace Status\Store;

use RuntimeException;
use Status\Model\Snapshot;

/** In-memory data for tests and for the database-free local preview. */
final class FixedStatusSource implements StatusSource
{
    public function __construct(
        private readonly ?Snapshot $snapshot = null,
        private readonly array $incidents = [],
        private readonly array $maintenance = [],
        private readonly array $deployments = [],
        private readonly bool $configured = false,
        private readonly bool $failing = false,
    ) {
    }

    public function isConfigured(): bool
    {
        return $this->configured;
    }

    public function ping(): void
    {
        $this->check();
    }

    public function latestSnapshot(): ?Snapshot
    {
        $this->check();
        return $this->snapshot;
    }

    public function incidents(): array
    {
        $this->check();
        return $this->incidents;
    }

    public function maintenanceWindows(): array
    {
        $this->check();
        return $this->maintenance;
    }

    public function deployments(): array
    {
        $this->check();
        return $this->deployments;
    }

    private function check(): void
    {
        if ($this->failing) {
            throw new RuntimeException('Status store unavailable.');
        }
    }
}
