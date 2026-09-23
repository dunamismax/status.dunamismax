<?php

declare(strict_types=1);

namespace Status\Probe;

use Status\Model\ServiceStatus;
use Status\Model\State;
use Status\Targets\TcpTarget;
use Status\Time;

/** Connect, then close. Nothing is sent to the service. */
final class TcpProbe
{
    public const VERSION = 'tcp-v1';

    public function __construct(private readonly float $timeoutSeconds = 3.0)
    {
    }

    public function probe(TcpTarget $target): ServiceStatus
    {
        $checkedAt = Time::now();
        $started = hrtime(true);
        $errno = 0;
        $message = '';
        $socket = @stream_socket_client(sprintf('tcp://%s:%d', $target->host, $target->port), $errno, $message, $this->timeoutSeconds);
        $latency = (int) round((hrtime(true) - $started) / 1e6);

        if (is_resource($socket)) {
            fclose($socket);
            [$state, $reason] = [State::Operational, "TCP {$target->port} accepts connections"];
        } else {
            [$state, $reason] = [State::Down, self::failureReason($target->port, $errno, $message)];
        }

        return new ServiceStatus($target->id, $target->name, $target->group, 'tcp', $state,
            $checkedAt, $latency, $reason, self::VERSION);
    }

    public static function failureReason(int $port, int $errno, string $message): string
    {
        $message = strtolower($message);
        return match (true) {
            $errno === 111 || str_contains($message, 'refused') => "TCP {$port} refused the connection",
            $errno === 110 || str_contains($message, 'timed out') => "TCP {$port} connection timed out",
            default => "TCP {$port} connection failed",
        };
    }
}
