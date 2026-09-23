<?php

declare(strict_types=1);

use Status\Application;
use Status\Config;
use Status\Database;
use Status\Environment;
use Status\Http\Response;
use Status\Store\FixedStatusSource;
use Status\Store\MysqlStatusSource;
use Status\View;

// Keep internal details in server logs, including failures during bootstrap.
ini_set('display_errors', '0');
ini_set('log_errors', '1');
require dirname(__DIR__) . '/bootstrap.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
try {
    $root = dirname(__DIR__);
    $config = new Config(Environment::fromFile($root . '/.env'));
    // Only local preview may run without MySQL; Config rejects that in production.
    $source = $config->hasDatabase() ? new MysqlStatusSource(new Database($config)) : new FixedStatusSource();
    $app = new Application($config, $source, new View($root));
    $response = $app->handle($method, $_SERVER['REQUEST_URI'] ?? '/', $_SERVER);
} catch (Throwable $error) {
    error_log((string) $error);
    $response = Response::text("Dunamis Status is temporarily unavailable.\n", 503, ['Retry-After' => '60']);
}

$response->send($method === 'HEAD');
