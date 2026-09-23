<?php

declare(strict_types=1);

namespace Status\Alert;

use DateTimeImmutable;
use Status\Model\State;
use Status\Time;

final readonly class AlertCandidate
{
    public function __construct(
        public string $dedupKey,
        public string $targetId,
        public string $targetName,
        public string $severity,
        public State $state,
        public DateTimeImmutable $observedAt,
        public string $title,
        public string $publicSummary,
    ) {
    }

    public function severityRank(): int
    {
        return $this->severity === 'critical' ? 2 : 1;
    }

    /** Stored with each notification for audit; public-safe by construction. */
    public function toArray(): array
    {
        return [
            'dedup_key' => $this->dedupKey,
            'target_id' => $this->targetId,
            'target_name' => $this->targetName,
            'severity' => $this->severity,
            'state' => $this->state->value,
            'observed_at' => Time::toJson($this->observedAt),
            'title' => $this->title,
            'public_summary' => $this->publicSummary,
        ];
    }

    /** What the webhook receives. */
    public function webhookPayload(): array
    {
        return [
            'source' => 'status.dunamismax.com',
            'severity' => $this->severity,
            'state' => $this->state->value,
            'target_id' => $this->targetId,
            'target_name' => $this->targetName,
            'title' => $this->title,
            'public_summary' => $this->publicSummary,
            'observed_at' => Time::toJson($this->observedAt),
        ];
    }
}
