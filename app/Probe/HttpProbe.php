<?php

declare(strict_types=1);

namespace Status\Probe;

use Status\Model\ServiceStatus;
use Status\Model\State;
use Status\Targets\HttpTarget;
use Status\Time;

/** One GET per target with a deadline, verified TLS, and a small redirect limit. Never crawls. */
final class HttpProbe
{
    public const VERSION = 'public-http-v2';
    public const USER_AGENT = 'status.dunamismax/2 public-http-probe';
    private const MAX_BODY_BYTES = 262144;

    public function __construct(private readonly float $timeoutSeconds = 5.0)
    {
    }

    public function probe(HttpTarget $target): ServiceStatus
    {
        $checkedAt = Time::now();
        $started = hrtime(true);
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'timeout' => $this->timeoutSeconds,
                'follow_location' => 1,
                'max_redirects' => 5,
                'ignore_errors' => true,
                'protocol_version' => 1.1,
                'user_agent' => self::USER_AGENT,
                'header' => "Accept: */*\r\nConnection: close\r\n",
            ],
            'ssl' => ['verify_peer' => true, 'verify_peer_name' => true],
        ]);

        error_clear_last();
        $stream = @fopen($target->probeUrl, 'r', false, $context);
        if ($stream === false) {
            $error = error_get_last()['message'] ?? '';
            return $this->result($target, $checkedAt, State::Down, self::failureReason($error), self::elapsed($started, $error));
        }

        $headers = stream_get_meta_data($stream)['wrapper_data'] ?? [];
        $status = self::finalStatus(is_array($headers) ? $headers : []);
        $body = null;
        if ($status === $target->expectedStatus && $target->expectedBodyToken !== null) {
            $body = stream_get_contents($stream, self::MAX_BODY_BYTES);
        }
        $timedOut = (bool) (stream_get_meta_data($stream)['timed_out'] ?? false);
        fclose($stream);
        $latency = self::elapsed($started);

        [$state, $reason] = self::evaluate($target, $status, $body === false || $timedOut ? false : $body);
        return $this->result($target, $checkedAt, $state, $reason, $latency);
    }

    /**
     * @param string|false|null $body null when no body check applies; false when it could not be read
     * @return array{0: State, 1: string}
     */
    public static function evaluate(HttpTarget $target, ?int $status, string|false|null $body): array
    {
        if ($status === null) {
            return [State::Down, 'response had no HTTP status'];
        }
        if ($status !== $target->expectedStatus) {
            return [$status >= 500 ? State::Down : State::Degraded, "expected HTTP {$target->expectedStatus}, got HTTP {$status}"];
        }
        if ($target->expectedBodyToken !== null) {
            if ($body === false) {
                return [State::Unknown, 'response body could not be read'];
            }
            if (!str_contains((string) $body, $target->expectedBodyToken)) {
                return [State::Degraded, 'expected response token was missing'];
            }
        }
        return [State::Operational, "HTTP {$status}"];
    }

    /** After redirects the wrapper lists every hop; the last status line is the answer. */
    public static function finalStatus(array $headers): ?int
    {
        $status = null;
        foreach ($headers as $header) {
            if (is_string($header) && preg_match('#^HTTP/\S+\s+(\d{3})\b#', $header, $matches)) {
                $status = (int) $matches[1];
            }
        }
        return $status;
    }

    /** Distinguish DNS, TLS, connect, and timeout failures without exposing addresses. */
    public static function failureReason(string $error): string
    {
        $error = strtolower($error);
        return match (true) {
            str_contains($error, 'getaddrinfo') || str_contains($error, 'name or service not known')
                || str_contains($error, 'name resolution') => 'DNS lookup failed',
            str_contains($error, 'ssl') || str_contains($error, 'tls') || str_contains($error, 'certificate')
                || str_contains($error, 'crypto') => 'TLS handshake failed',
            str_contains($error, 'timed out') => 'request timed out',
            str_contains($error, 'refused') => 'connection refused',
            str_contains($error, 'redirection limit') => 'too many redirects',
            default => 'HTTP probe request failed',
        };
    }

    private function result(HttpTarget $target, \DateTimeImmutable $checkedAt, State $state, string $reason, ?int $latency): ServiceStatus
    {
        return new ServiceStatus($target->id, $target->name, $target->group, 'http', $state, $checkedAt,
            $latency, $reason, self::VERSION, $target->publicUrl, $target->probeUrl, $target->expectedStatus);
    }

    /** A timed-out request has no meaningful latency. */
    private static function elapsed(int|float $started, string $error = ''): ?int
    {
        return str_contains(strtolower($error), 'timed out') ? null : (int) round((hrtime(true) - $started) / 1e6);
    }
}
