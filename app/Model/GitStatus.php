<?php

declare(strict_types=1);

namespace Status\Model;

final readonly class GitStatus
{
    public function __construct(
        public ?string $branch = null,
        public ?string $upstream = null,
        public ?int $ahead = null,
        public ?int $behind = null,
        public ?bool $dirty = null,
        public ?int $latestCommitAgeDays = null,
        public ?bool $remoteReachable = null,
    ) {
    }

    public function toArray(): array
    {
        return [
            'branch' => $this->branch,
            'upstream' => $this->upstream,
            'ahead' => $this->ahead,
            'behind' => $this->behind,
            'dirty' => $this->dirty,
            'latest_commit_age_days' => $this->latestCommitAgeDays,
            'remote_reachable' => $this->remoteReachable,
        ];
    }

    public static function fromArray(array $data): self
    {
        $int = static fn (string $key): ?int => isset($data[$key]) ? (int) $data[$key] : null;
        $bool = static fn (string $key): ?bool => isset($data[$key]) ? (bool) $data[$key] : null;
        $string = static fn (string $key): ?string => isset($data[$key]) ? (string) $data[$key] : null;
        return new self($string('branch'), $string('upstream'), $int('ahead'), $int('behind'),
            $bool('dirty'), $int('latest_commit_age_days'), $bool('remote_reachable'));
    }
}
