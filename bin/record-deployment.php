<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit(1);
}
require dirname(__DIR__) . '/bootstrap.php';

exit(Status\Cli\RecordDeploymentCommand::run(dirname(__DIR__), array_slice($argv, 1)));
