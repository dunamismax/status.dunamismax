<?php

declare(strict_types=1);

use Status\Model\BuildProgress;
use Status\Model\GitStatus;
use Status\Model\ProjectStatus;
use Status\Model\ServiceStatus;
use Status\Model\Snapshot;
use Status\Model\State;
use Status\Time;

$checks = 0;

function expect(bool $condition, string $message): void
{
    global $checks;
    if (!$condition) {
        throw new RuntimeException($message);
    }
    $checks++;
}

function rejects(callable $action, string $message): void
{
    try {
        $action();
    } catch (RuntimeException) {
        expect(true, $message);
        return;
    }
    expect(false, $message);
}

/** The fixture the Rust router tests used: one operational site, one degraded site, one project. */
function snapshotFixture(?DateTimeImmutable $at = null): Snapshot
{
    $at ??= Time::parse('2026-05-18T12:00:00Z');
    return Snapshot::fromResults([
        new ServiceStatus('fileferry-app', 'fileferry.app', 'Public websites', 'http', State::Operational, $at, 42,
            'HTTP 200', 'test', 'https://fileferry.app', 'https://fileferry.app/healthz', 200),
        new ServiceStatus('status-dunamismax-com', 'status.dunamismax.com', 'Public websites', 'http', State::Degraded, $at, 88,
            'expected HTTP 200, got HTTP 503', 'test', 'https://status.dunamismax.com', 'https://status.dunamismax.com/healthz', 200),
    ], [
        new ProjectStatus('fileferry', 'fileferry', 'fileferry', 'https://fileferry.app', State::Operational, $at,
            'repository is current; BUILD progress 2/3',
            new GitStatus('main', 'origin/main', 0, 0, false, 1, true),
            new BuildProgress(2, 3, 'Phase 4: Repository And Project Status'), 'test'),
    ]);
}

/** Run a PHP development server with the given router; the check receives its base URL. */
function withHttpServer(string $router, array $environment, callable $check): void
{
    $socket = stream_socket_server('tcp://127.0.0.1:0', $errno, $message);
    if ($socket === false) {
        throw new RuntimeException('Cannot allocate local HTTP test port.');
    }
    $address = stream_socket_get_name($socket, false);
    fclose($socket);
    $log = tmpfile();
    $pipes = [];
    $process = proc_open([PHP_BINARY, '-S', $address, $router], [['pipe', 'r'], $log, $log], $pipes,
        dirname(__DIR__), $environment + ['PATH' => getenv('PATH') ?: '/usr/bin:/bin']);
    if (!is_resource($process)) {
        throw new RuntimeException('Cannot start local HTTP test server.');
    }
    fclose($pipes[0]);
    try {
        $ready = false;
        for ($attempt = 0; $attempt < 50; $attempt++) {
            $connection = @stream_socket_client('tcp://' . $address, $errno, $message, 0.1);
            if ($connection !== false) {
                fclose($connection);
                $ready = true;
                break;
            }
            usleep(100000);
        }
        if (!$ready) {
            throw new RuntimeException('Local HTTP server did not start.');
        }
        $check('http://' . $address);
    } finally {
        proc_terminate($process);
        proc_close($process);
        fclose($log);
    }
}

/** A closed loopback port: bind, read the number, release it. */
function closedPort(): int
{
    $socket = stream_socket_server('tcp://127.0.0.1:0');
    $port = (int) substr(strrchr(stream_socket_get_name($socket, false), ':'), 1);
    fclose($socket);
    return $port;
}

function temporaryDirectory(string $prefix): string
{
    $path = sys_get_temp_dir() . '/' . $prefix . bin2hex(random_bytes(6));
    mkdir($path, 0700);
    return $path;
}

function removeTree(string $path): void
{
    if (!is_dir($path) || is_link($path)) {
        @unlink($path);
        return;
    }
    foreach (scandir($path) ?: [] as $entry) {
        if ($entry !== '.' && $entry !== '..') {
            removeTree($path . '/' . $entry);
        }
    }
    rmdir($path);
}
