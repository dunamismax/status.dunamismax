<?php

declare(strict_types=1);

// Dependency-free checks. They never read .env or connect to MySQL; the
// probe checks use loopback servers, temporary git repositories, and fixed
// systemd/df/caddy output.
require dirname(__DIR__) . '/bootstrap.php';
require __DIR__ . '/support.php';

foreach (['APP_ENV', 'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'STATUS_ENV_FILE', 'STATUS_OPERATOR_TOKEN',
    'STATUS_REPO_ROOT', 'STATUS_STALE_AFTER_MINUTES', 'STATUS_RETENTION_DAYS', 'STATUS_ALERT_WEBHOOK_URL',
    'STATUS_ALERT_REPEAT_AFTER_MINUTES', 'STATUS_ALERT_MAX_NOTIFICATIONS_PER_RUN'] as $key) {
    putenv($key);
}

try {
    require __DIR__ . '/unit.php';
    require __DIR__ . '/probes.php';
    require __DIR__ . '/web.php';
    printf("Passed %d checks.\n", $checks);
} catch (Throwable $error) {
    fwrite(STDERR, 'FAIL: ' . $error->getMessage() . "\n");
    exit(1);
}
