<?php

declare(strict_types=1);

namespace Status\Model;

use DateTimeImmutable;
use RuntimeException;
use Status\Time;

final readonly class DeploymentEvent
{
    public const DEFAULT_ENVIRONMENT = 'production';

    public function __construct(
        public ?string $serviceId,
        public ?string $repoName,
        public ?string $commitSha,
        public string $environment,
        public DateTimeImmutable $deployedAt,
        public string $publicSummary,
    ) {
    }

    /**
     * Build a validated event from optional inputs. Blank values count as absent.
     * The summary defaults to "<service or repo> deployed to <environment>".
     */
    public static function create(?string $serviceId, ?string $repoName, ?string $commitSha,
        ?string $environment, ?string $deployedAt, ?string $publicSummary, DateTimeImmutable $now): self
    {
        $clean = static fn (?string $value): ?string => ($value = trim((string) $value)) === '' ? null : $value;
        $serviceId = $clean($serviceId);
        $repoName = $clean($repoName);
        $commitSha = $clean($commitSha);
        $environment = $clean($environment) ?? self::DEFAULT_ENVIRONMENT;

        foreach (['service id' => $serviceId, 'repo name' => $repoName, 'environment' => $environment] as $label => $value) {
            if ($value !== null && !preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/', $value)) {
                throw new RuntimeException("Deployment {$label} may contain letters, numbers, dots, underscores, and hyphens (at most 128).");
            }
        }
        if ($commitSha !== null && !preg_match('/^[0-9a-fA-F]{7,64}$/', $commitSha)) {
            throw new RuntimeException('Deployment commit SHA must be 7 to 64 hexadecimal characters.');
        }

        $time = $clean($deployedAt);
        $at = $time === null ? $now : Time::parse($time);
        $subject = $serviceId ?? $repoName ?? 'service';
        $summary = $clean($publicSummary) ?? "{$subject} deployed to {$environment}";
        if (!preg_match('//u', $summary) || iconv_strlen($summary, 'UTF-8') > 500 || preg_match('/[\x00-\x1F\x7F]/', $summary)) {
            throw new RuntimeException('Deployment summary must be one line of UTF-8 text, at most 500 characters.');
        }

        return new self($serviceId, $repoName, $commitSha, $environment, $at, $summary);
    }

    public function toArray(): array
    {
        return [
            'service_id' => $this->serviceId,
            'repo_name' => $this->repoName,
            'commit_sha' => $this->commitSha,
            'environment' => $this->environment,
            'deployed_at' => Time::toJson($this->deployedAt),
            'public_summary' => $this->publicSummary,
        ];
    }
}
