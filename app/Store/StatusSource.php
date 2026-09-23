<?php

declare(strict_types=1);

namespace Status\Store;

use Status\Model\DeploymentEvent;
use Status\Model\IncidentRecord;
use Status\Model\MaintenanceWindow;
use Status\Model\Snapshot;

/** Everything the web pages read. Implementations only read; they never probe. */
interface StatusSource
{
    /** Whether durable history is configured (false only in local preview). */
    public function isConfigured(): bool;

    /** Throws when the store cannot answer. */
    public function ping(): void;

    public function latestSnapshot(): ?Snapshot;

    /** @return list<IncidentRecord> */
    public function incidents(): array;

    /** @return list<MaintenanceWindow> */
    public function maintenanceWindows(): array;

    /** @return list<DeploymentEvent> */
    public function deployments(): array;
}
