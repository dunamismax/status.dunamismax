<?php

declare(strict_types=1);

namespace Status;

use RuntimeException;

final class Environment
{
    /** @param array<string, string> $values */
    public function __construct(private readonly array $values = [], private readonly bool $inheritProcess = true)
    {
    }

    public static function fromFile(string $path, bool $inheritProcess = true): self
    {
        if (!is_file($path)) {
            return new self([], $inheritProcess);
        }

        $lines = file($path, FILE_IGNORE_NEW_LINES);
        if ($lines === false) {
            throw new RuntimeException('Cannot read environment file.');
        }

        $values = [];
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#')) {
                continue;
            }
            if (!preg_match('/^([A-Z][A-Z0-9_]*)=(.*)$/', $line, $matches)) {
                throw new RuntimeException('Invalid environment entry; expected KEY=value.');
            }

            $value = trim($matches[2]);
            if (str_starts_with($value, '"') || str_starts_with($value, "'")) {
                if (strlen($value) < 2 || $value[0] !== substr($value, -1)) {
                    throw new RuntimeException('Unclosed quote in environment file.');
                }
                $value = substr($value, 1, -1);
            }
            $values[$matches[1]] = $value;
        }

        return new self($values, $inheritProcess);
    }

    public function get(string $key, string $default = ''): string
    {
        $value = $this->inheritProcess ? getenv($key) : false;
        return $value !== false ? $value : ($this->values[$key] ?? $default);
    }
}
