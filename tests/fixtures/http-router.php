<?php

declare(strict_types=1);

// Local stand-in for monitored sites and the alert webhook in tests.
$path = explode('?', $_SERVER['REQUEST_URI'] ?? '/', 2)[0];
switch ($path) {
    case '/ok':
        echo "ok\n";
        break;
    case '/token':
        echo "status-token-present\n";
        break;
    case '/missing':
        http_response_code(404);
        echo "missing\n";
        break;
    case '/fail':
        http_response_code(503);
        echo "unavailable\n";
        break;
    case '/redirect':
        header('Location: /ok', true, 302);
        break;
    case '/loop':
        header('Location: /loop', true, 302);
        break;
    case '/slow':
        sleep(3);
        echo "late\n";
        break;
    case '/hook':
        file_put_contents((string) getenv('HOOK_FILE'), ($_SERVER['REQUEST_METHOD'] ?? '') . "\n"
            . ($_SERVER['CONTENT_TYPE'] ?? '') . "\n" . file_get_contents('php://input'));
        echo "accepted\n";
        break;
    case '/hook-fail':
        http_response_code(500);
        echo "no\n";
        break;
    default:
        http_response_code(404);
}
