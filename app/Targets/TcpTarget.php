<?php

declare(strict_types=1);

namespace Status\Targets;

/** A loopback TCP listener. The host is never published; the port is part of the public name. */
final readonly class TcpTarget
{
    public function __construct(
        public string $id,
        public string $name,
        public string $group,
        public string $host,
        public int $port,
    ) {
    }
}
