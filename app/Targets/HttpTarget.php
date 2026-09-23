<?php

declare(strict_types=1);

namespace Status\Targets;

final readonly class HttpTarget
{
    public function __construct(
        public string $id,
        public string $name,
        public string $group,
        public string $publicUrl,
        public string $probeUrl,
        public int $expectedStatus = 200,
        public ?string $expectedBodyToken = null,
    ) {
    }
}
