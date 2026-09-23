<?php

declare(strict_types=1);

// Run by status-dunamismax-collector.service. Not reachable over HTTP: only public/ is served.
if (PHP_SAPI !== 'cli') {
    exit(1);
}
require dirname(__DIR__) . '/bootstrap.php';

exit(Status\Cli\CollectCommand::run(dirname(__DIR__)));
