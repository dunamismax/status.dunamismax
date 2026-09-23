<?php

declare(strict_types=1);

// Static checks on the deployment files: privilege split, Caddy routing, and sudo script rules.
$root = dirname(__DIR__);
$read = static fn (string $path): string => (string) file_get_contents($root . '/' . $path);

$caddy = $read('deploy/Caddyfile');
expect(str_contains($caddy, 'root * /srv/www/status.dunamismax.com/current/public')
    && str_contains($caddy, 'php_fastcgi unix//run/php/status-dunamismax.sock') && preg_match('/^\s*reverse_proxy\b/m', $caddy) === 0,
    'Caddy serves the release through PHP-FPM, not the old proxy.');
expect(str_contains($caddy, '@short path /assets/status.css /robots.txt') && preg_match('/\.js\b/', $caddy) === 0
    && str_contains($caddy, 'Cache-Control "public, max-age=300, must-revalidate"')
    && str_contains($caddy, "handle /icon.svg {\n\t\theader Cache-Control \"public, max-age=86400\""),
    'Static routes keep their previous cache policies.');
foreach (['X-Content-Type-Options nosniff', 'Referrer-Policy no-referrer', 'Permissions-Policy interest-cohort=()', '-Server'] as $header) {
    expect(str_contains($caddy, $header), 'Caddy keeps the header: ' . $header);
}

$pool = $read('deploy/php-fpm.conf');
foreach (['user = status-dunamismax-web', 'listen = /run/php/status-dunamismax.sock', 'listen.owner = caddy', 'listen.mode = 0600',
    'clear_env = yes', 'php_admin_flag[allow_url_fopen] = off',
    'php_admin_value[open_basedir] = /srv/www/status.dunamismax.com/:/etc/status-dunamismax/web.env'] as $line) {
    expect(str_contains($pool, $line), 'The web pool must set: ' . $line);
}
preg_match('/^php_admin_value\[disable_functions\] = (.+)$/m', $pool, $disabled);
foreach (['exec', 'passthru', 'shell_exec', 'system', 'proc_open', 'popen', 'pcntl_exec'] as $function) {
    expect(in_array($function, explode(',', $disabled[1] ?? ''), true), 'The web pool must disable ' . $function);
}

$collector = $read('deploy/status-dunamismax-collector.service');
expect(str_contains($collector, "User=status-dunamismax\n") && str_contains($collector, 'Environment=STATUS_ENV_FILE=/etc/status-dunamismax/collector.env')
    && str_contains($collector, 'ExecStart=/usr/bin/php /srv/www/status.dunamismax.com/current/bin/collect.php')
    && str_contains($collector, 'ProtectSystem=strict') && str_contains($collector, 'NoNewPrivileges=true'),
    'The collector runs as its own user with its own env file, sandboxed.');
expect(str_contains($read('deploy/status-dunamismax-collector.timer'), 'OnUnitActiveSec=5min'), 'The collector still runs every five minutes.');

$scripts = ['10-provision.sh', '20-migrate-history.sh', '30-deploy.sh', '40-cutover.sh', '50-decommission.sh'];
foreach ($scripts as $script) {
    $text = $read('deploy/' . $script);
    expect(str_starts_with($text, "#!/bin/bash\n") && str_contains($text, "set -euo pipefail\n") && str_contains($text, "require_root\n"),
        $script . ' must be strict bash that refuses to run without root.');
    expect(is_executable($root . '/deploy/' . $script), $script . ' must be executable.');
    expect(str_contains($text, 'Rollback'), $script . ' must print its rollback.');
    expect(!str_contains($text, 'systemctl restart php') && !str_contains($text, 'restart caddy'), $script . ' must reload shared services, never restart them.');
}
foreach (glob($root . '/deploy/*') as $file) {
    expect(!str_contains((string) file_get_contents($file), '/usr/bin/caddy'), basename($file) . ' must never use the stale /usr/bin/caddy.');
}
$lib = $read('deploy/lib.sh');
expect(str_contains($lib, 'BACKUP_DIR=/root/$SITE-backup-$STAMP') && str_contains($lib, 'runuser -u caddy -- env HOME=/var/lib/caddy "$CADDY" validate --config /etc/caddy/Caddyfile --adapter caddyfile')
    && str_contains($lib, 'php-fpm8.5 -t && systemctl reload php8.5-fpm'), 'Shared helpers back up to /root, validate as caddy, and test FPM before reloading.');
$cutover = $read('deploy/40-cutover.sh');
expect(strpos($cutover, 'caddy_validate') < strpos($cutover, 'systemctl reload caddy') && str_contains($cutover, 'restore_caddy'),
    'Cutover validates before reloading and restores Caddy on failure.');
expect(strpos($cutover, 'expect_body') < strpos($cutover, 'systemctl disable --now "$RUST_UNIT"') && str_contains($cutover, 'gpasswd -d "$COLLECTOR_USER" docker'),
    'Cutover stops the Rust service only after verifying PHP, then removes the docker group membership.');
$decommission = $read('deploy/50-decommission.sh');
expect(strpos($decommission, 'pg_dump') < strpos($decommission, 'DROP DATABASE'), 'Decommission dumps PostgreSQL before dropping it.');
expect(!str_contains($decommission, 'systemctl stop postgresql') && !str_contains($decommission, 'apt'), 'Decommission leaves the PostgreSQL server itself alone.');

// No leftovers from the previous stack.
foreach (['Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml', 'crates', 'target', 'xtask'] as $path) {
    expect(!file_exists($root . '/' . $path), 'No Rust leftovers: ' . $path);
}
