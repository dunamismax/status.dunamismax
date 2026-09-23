<?php

declare(strict_types=1);

// Router for PHP's local development server. Production uses Caddy + PHP-FPM,
// which serves exactly these static files and sends everything else to PHP.
$path = explode('?', $_SERVER['REQUEST_URI'] ?? '/', 2)[0];
if (in_array($path, ['/assets/status.css', '/assets/theme-init.js', '/assets/theme-toggle.js', '/icon.svg', '/robots.txt'], true)) {
    return false;
}

require dirname(__DIR__) . '/public/index.php';
