<?php

declare(strict_types=1);

namespace Status\Model;

use DateTimeImmutable;
use Status\Time;

/** Repository health. The checkout path is private and is never part of this record. */
final readonly class ProjectStatus
{
    public function __construct(
        public string $id,
        public string $name,
        public string $repoName,
        public ?string $publicUrl,
        public State $state,
        public DateTimeImmutable $checkedAt,
        public string $reason,
        public GitStatus $git,
        public ?BuildProgress $build,
        public string $probeVersion,
    ) {
    }

    public function toArray(): array
    {
        return [
            'target' => [
                'id' => $this->id,
                'name' => $this->name,
                'repo_name' => $this->repoName,
                'public_url' => $this->publicUrl,
            ],
            'state' => $this->state->value,
            'checked_at' => Time::toJson($this->checkedAt),
            'reason' => $this->reason,
            'git' => $this->git->toArray(),
            'build' => $this->build?->toArray(),
            'probe_version' => $this->probeVersion,
        ];
    }

    public static function fromArray(array $data): self
    {
        $target = is_array($data['target'] ?? null) ? $data['target'] : [];
        return new self(
            id: (string) ($target['id'] ?? ''),
            name: (string) ($target['name'] ?? ''),
            repoName: (string) ($target['repo_name'] ?? ''),
            publicUrl: isset($target['public_url']) ? (string) $target['public_url'] : null,
            state: State::parse($data['state'] ?? null),
            checkedAt: Time::parse((string) ($data['checked_at'] ?? '')),
            reason: (string) ($data['reason'] ?? ''),
            git: GitStatus::fromArray(is_array($data['git'] ?? null) ? $data['git'] : []),
            build: is_array($data['build'] ?? null) ? BuildProgress::fromArray($data['build']) : null,
            probeVersion: (string) ($data['probe_version'] ?? ''),
        );
    }
}
