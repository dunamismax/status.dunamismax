<?php

declare(strict_types=1);

namespace Status\Targets;

/** A repository checkout. `repoPath` is private and appears only on the operator page. */
final readonly class ProjectTarget
{
    public function __construct(
        public string $id,
        public string $name,
        public string $repoName,
        public ?string $publicUrl,
        public string $repoPath,
    ) {
    }
}
