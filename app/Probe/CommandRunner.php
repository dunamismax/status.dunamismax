<?php

declare(strict_types=1);

namespace Status\Probe;

/**
 * Runs one fixed, read-only command without a shell, with an explicit
 * environment, a deadline, and bounded output. Only the collector uses this;
 * the web pool has proc_open disabled.
 */
final class CommandRunner
{
    private const MAX_OUTPUT_BYTES = 1048576;

    /** @param array<string, string> $environment */
    public function __construct(private readonly array $environment, private readonly float $timeoutSeconds = 5.0)
    {
    }

    /** @param list<string> $command absolute program path followed by its arguments */
    public function run(array $command, bool $discardStdout = false): CommandResult
    {
        $started = hrtime(true);
        $descriptors = [
            0 => ['file', '/dev/null', 'r'],
            1 => $discardStdout ? ['file', '/dev/null', 'w'] : ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ];
        $pipes = [];
        $process = @proc_open($command, $descriptors, $pipes, '/', $this->environment);
        if (!is_resource($process)) {
            return new CommandResult(null, '', 'command could not start', self::elapsed($started));
        }

        $output = [1 => '', 2 => ''];
        $open = [];
        foreach ($pipes as $index => $pipe) {
            stream_set_blocking($pipe, false);
            $open[$index] = $pipe;
        }

        $deadline = $started + (int) ($this->timeoutSeconds * 1e9);
        $timedOut = false;
        while ($open !== []) {
            $remaining = $deadline - hrtime(true);
            if ($remaining <= 0) {
                $timedOut = true;
                break;
            }
            $read = array_values($open);
            $write = $except = null;
            if (@stream_select($read, $write, $except, intdiv($remaining, 1_000_000_000), intdiv($remaining % 1_000_000_000, 1000)) === false) {
                break;
            }
            foreach ($read as $stream) {
                $index = array_search($stream, $open, true);
                $chunk = fread($stream, 65536);
                if ($chunk === false || ($chunk === '' && feof($stream))) {
                    fclose($stream);
                    unset($open[$index]);
                    continue;
                }
                if (strlen($output[$index]) < self::MAX_OUTPUT_BYTES) {
                    $output[$index] .= substr($chunk, 0, self::MAX_OUTPUT_BYTES - strlen($output[$index]));
                }
            }
        }

        $exitCode = null;
        if (!$timedOut) {
            // Output is closed; wait for the exit status within the same deadline.
            while (hrtime(true) < $deadline) {
                $status = proc_get_status($process);
                if (!$status['running']) {
                    $exitCode = $status['exitcode'];
                    break;
                }
                usleep(2000);
            }
            $timedOut = $exitCode === null;
        }
        if ($timedOut) {
            proc_terminate($process, 9);
        }
        foreach ($open as $pipe) {
            fclose($pipe);
        }
        proc_close($process);

        return new CommandResult($timedOut ? null : $exitCode, $output[1], $output[2], self::elapsed($started), $timedOut);
    }

    private static function elapsed(int|float $started): int
    {
        return (int) round((hrtime(true) - $started) / 1e6);
    }
}
