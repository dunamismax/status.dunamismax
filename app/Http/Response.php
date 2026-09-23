<?php

declare(strict_types=1);

namespace Status\Http;

final readonly class Response
{
    public const JSON = 'application/json';
    public const TEXT = 'text/plain; charset=utf-8';

    public function __construct(
        public string $body,
        public int $status = 200,
        public array $headers = [],
    ) {
    }

    public static function json(array $data, int $status = 200, array $headers = []): self
    {
        return new self(json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR),
            $status, $headers + ['Content-Type' => self::JSON]);
    }

    public static function text(string $body, int $status = 200, array $headers = []): self
    {
        return new self($body, $status, $headers + ['Content-Type' => self::TEXT]);
    }

    /** Headers the response will carry, including defaults. */
    public function allHeaders(): array
    {
        return $this->headers + [
            'Content-Type' => 'text/html; charset=utf-8',
            'Cache-Control' => 'no-store',
            'X-Content-Type-Options' => 'nosniff',
            'Referrer-Policy' => 'no-referrer',
            'Content-Security-Policy' => "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'",
            'Permissions-Policy' => 'interest-cohort=()',
        ];
    }

    public function send(bool $head = false): void
    {
        http_response_code($this->status);
        foreach ($this->allHeaders() as $name => $value) {
            header($name . ': ' . $value);
        }
        if (!$head) {
            echo $this->body;
        }
    }
}
