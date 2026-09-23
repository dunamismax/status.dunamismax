<?php

declare(strict_types=1);

namespace Status\Alert;

use RuntimeException;

/** Posts public-safe JSON. A failed delivery throws, so the collector run fails visibly. */
final class WebhookNotifier
{
    public function __construct(private readonly string $url, private readonly float $timeoutSeconds = 5.0)
    {
        $scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));
        if (filter_var($url, FILTER_VALIDATE_URL) === false || !in_array($scheme, ['http', 'https'], true)) {
            throw new RuntimeException('Alert webhook URL must use http or https.');
        }
    }

    public function send(AlertCandidate $alert): void
    {
        $body = json_encode($alert->webhookPayload(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $context = stream_context_create([
            'http' => [
                'method' => 'POST',
                'timeout' => $this->timeoutSeconds,
                'ignore_errors' => true,
                'follow_location' => 0,
                'protocol_version' => 1.1,
                'user_agent' => 'status.dunamismax/2 alert-webhook',
                'header' => "Content-Type: application/json\r\nConnection: close\r\n",
                'content' => $body,
            ],
            'ssl' => ['verify_peer' => true, 'verify_peer_name' => true],
        ]);

        $stream = @fopen($this->url, 'r', false, $context);
        if ($stream === false) {
            // The URL can carry a secret; never include it in the error.
            throw new RuntimeException('Alert webhook request failed.');
        }
        $headers = stream_get_meta_data($stream)['wrapper_data'] ?? [];
        fclose($stream);

        $status = null;
        foreach (is_array($headers) ? $headers : [] as $header) {
            if (is_string($header) && preg_match('#^HTTP/\S+\s+(\d{3})\b#', $header, $matches)) {
                $status = (int) $matches[1];
            }
        }
        if ($status === null || $status < 200 || $status > 299) {
            throw new RuntimeException('Alert webhook returned HTTP ' . ($status ?? 'no status') . '.');
        }
    }
}
