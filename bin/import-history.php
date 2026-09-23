<?php

declare(strict_types=1);

use Status\Cli\Cli;
use Status\Database;
use Status\Store\HistoryImporter;

// Used once by deploy/20-migrate-history.sh: loads the PostgreSQL JSON-lines export into MySQL.
if (PHP_SAPI !== 'cli') {
    exit(1);
}
require dirname(__DIR__) . '/bootstrap.php';

try {
    $directory = $argv[1] ?? '';
    if ($directory === '' || isset($argv[2]) || !is_dir($directory)) {
        throw new RuntimeException('Usage: php bin/import-history.php <export-directory>');
    }
    $config = Cli::config(dirname(__DIR__));
    if (!$config->hasDatabase()) {
        throw new RuntimeException('Importing history needs the database.');
    }
    foreach ((new HistoryImporter(new Database($config)))->import($directory) as $table => $counts) {
        printf("%-20s read=%d inserted=%d\n", $table, $counts['read'], $counts['inserted']);
    }
} catch (Throwable $error) {
    exit(Cli::fail($error->getMessage()));
}
