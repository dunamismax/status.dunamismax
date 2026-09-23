<?php

declare(strict_types=1);

use Status\Cli\Cli;
use Status\Database;

// Local development: apply the baseline schema with the .env account.
// Production applies it as the MySQL administrator in deploy/10-provision.sh.
if (PHP_SAPI !== 'cli') {
    exit(1);
}
require dirname(__DIR__) . '/bootstrap.php';

try {
    $sql = file_get_contents(dirname(__DIR__) . '/database/schema.sql');
    if ($sql === false) {
        throw new RuntimeException('Cannot read baseline schema.');
    }
    (new Database(Cli::config(dirname(__DIR__))))->connection()->exec($sql);
    fwrite(STDOUT, "Baseline schema ready. No data was inserted.\n");
} catch (Throwable $error) {
    exit(Cli::fail($error->getMessage()));
}
