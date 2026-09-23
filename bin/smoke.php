<?php

declare(strict_types=1);

use Status\Application;
use Status\Config;
use Status\Database;
use Status\Environment;
use Status\Store\MysqlStatusSource;
use Status\View;

// Deployment gate, run as the web user: renders every route through the real
// application with the release's .env and the SELECT-only account.
if (PHP_SAPI !== 'cli') {
    exit(1);
}
require dirname(__DIR__) . '/bootstrap.php';

try {
    $root = dirname(__DIR__);
    $config = new Config(Environment::fromFile($root . '/.env'));
    $app = new Application($config, new MysqlStatusSource(new Database($config)), new View($root));
    $expected = [
        '/' => 200, '/services' => 200, '/projects' => 200, '/incidents' => 200, '/deployments' => 200,
        '/healthz' => 200, '/readyz' => 200, '/api/status.json' => 200, '/api/incidents.json' => 200,
        '/operator' => $config->operatorToken === null ? 404 : 401, '/missing' => 404,
    ];
    $failed = false;
    foreach ($expected as $path => $status) {
        $response = $app->handle('GET', $path);
        $ok = $response->status === $status;
        $failed = $failed || !$ok;
        printf("%-4s %-20s %d\n", $ok ? 'ok' : 'FAIL', $path, $response->status);
    }
    $ready = json_decode($app->handle('GET', '/readyz')->body, true, 8, JSON_THROW_ON_ERROR);
    printf("readiness: %s (%s)\n", $ready['status'], $ready['dependencies']);
    $status = json_decode($app->handle('GET', '/api/status.json')->body, true, 64, JSON_THROW_ON_ERROR);
    printf("overall_state: %s, checked_at: %s, services: %d, projects: %d\n",
        $status['overall_state'], $status['checked_at'], count($status['services']), count($status['projects']));
    if ($ready['status'] !== 'ready') {
        $failed = true;
    }
    exit($failed ? 1 : 0);
} catch (Throwable $error) {
    fwrite(STDERR, 'FAIL: ' . $error->getMessage() . "\n");
    exit(1);
}
