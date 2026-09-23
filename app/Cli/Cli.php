<?php

declare(strict_types=1);

namespace Status\Cli;

use RuntimeException;
use Status\Config;
use Status\Environment;

final class Cli
{
    /**
     * CLI tools read STATUS_ENV_FILE when set (production points it at the
     * collector's protected file), otherwise the checkout's .env.
     */
    public static function config(string $root): Config
    {
        $file = getenv('STATUS_ENV_FILE');
        if ($file !== false && $file !== '') {
            if (!is_file($file) || !is_readable($file)) {
                throw new RuntimeException('STATUS_ENV_FILE is not a readable file.');
            }
            return new Config(Environment::fromFile($file));
        }
        return new Config(Environment::fromFile($root . '/.env'));
    }

    /**
     * Parse `--name value` and `--name=value` options.
     *
     * @param list<string> $arguments
     * @param list<string> $allowed
     * @return array<string, string>
     */
    public static function options(array $arguments, array $allowed): array
    {
        $options = [];
        for ($index = 0; $index < count($arguments); $index++) {
            $argument = $arguments[$index];
            if (!preg_match('/^--([a-z][a-z-]*)(?:=(.*))?$/s', $argument, $matches)) {
                throw new RuntimeException("Unexpected argument: {$argument}");
            }
            $name = $matches[1];
            if (!in_array($name, $allowed, true)) {
                throw new RuntimeException("Unknown option: --{$name}");
            }
            if (isset($options[$name])) {
                throw new RuntimeException("Option given twice: --{$name}");
            }
            if (array_key_exists(2, $matches)) {
                $options[$name] = $matches[2];
            } elseif ($name === 'help') {
                $options[$name] = '1';
            } elseif (isset($arguments[$index + 1])) {
                $options[$name] = $arguments[++$index];
            } else {
                throw new RuntimeException("Option needs a value: --{$name}");
            }
        }
        return $options;
    }

    public static function fail(string $message): int
    {
        fwrite(STDERR, 'Error: ' . $message . "\n");
        return 1;
    }
}
