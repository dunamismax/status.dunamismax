<?php

declare(strict_types=1);

namespace Status\Model;

use DateTimeImmutable;
use Status\Time;

/** One monitored target and its latest check. Host checks have empty URLs and status 0. */
final readonly class ServiceStatus
{
    public function __construct(
        public string $id,
        public string $name,
        public string $group,
        public string $checkKind,
        public State $state,
        public DateTimeImmutable $checkedAt,
        public ?int $latencyMs,
        public string $reason,
        public string $probeVersion,
        public string $publicUrl = '',
        public string $probeUrl = '',
        public int $expectedStatus = 0,
    ) {
    }

    /** The public JSON shape; body tokens and private detail are never included. */
    public function toArray(): array
    {
        return [
            'target' => [
                'id' => $this->id,
                'name' => $this->name,
                'group' => $this->group,
                'public_url' => $this->publicUrl,
                'probe_url' => $this->probeUrl,
                'expected_status' => $this->expectedStatus,
            ],
            'check' => [
                'target_id' => $this->id,
                'check_kind' => $this->checkKind,
                'state' => $this->state->value,
                'checked_at' => Time::toJson($this->checkedAt),
                'latency_ms' => $this->latencyMs,
                'reason' => $this->reason,
                'probe_version' => $this->probeVersion,
            ],
        ];
    }

    public static function fromArray(array $data): self
    {
        $target = is_array($data['target'] ?? null) ? $data['target'] : [];
        $check = is_array($data['check'] ?? null) ? $data['check'] : [];
        return new self(
            id: (string) ($target['id'] ?? $check['target_id'] ?? ''),
            name: (string) ($target['name'] ?? ''),
            group: (string) ($target['group'] ?? ''),
            checkKind: (string) ($check['check_kind'] ?? ''),
            state: State::parse($check['state'] ?? null),
            checkedAt: Time::parse((string) ($check['checked_at'] ?? '')),
            latencyMs: isset($check['latency_ms']) ? (int) $check['latency_ms'] : null,
            reason: (string) ($check['reason'] ?? ''),
            probeVersion: (string) ($check['probe_version'] ?? ''),
            publicUrl: (string) ($target['public_url'] ?? ''),
            probeUrl: (string) ($target['probe_url'] ?? ''),
            expectedStatus: (int) ($target['expected_status'] ?? 0),
        );
    }
}
