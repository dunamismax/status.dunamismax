<?php

declare(strict_types=1);

namespace Status;

use RuntimeException;

/**
 * Validated settings shared by the web front controller and the CLI tools.
 * Each process reads only its own environment file: the web pool never sees
 * collector credentials or the alert webhook, and the collector never sees the
 * operator token.
 */
final readonly class Config
{
    public const DEFAULT_REPO_ROOT = '/home/sawyer/github';
    public const DEFAULT_RETENTION_DAYS = 30;
    public const DEFAULT_STALE_AFTER_MINUTES = 15;
    public const DEFAULT_ALERT_REPEAT_AFTER_MINUTES = 60;
    public const DEFAULT_ALERT_MAX_NOTIFICATIONS_PER_RUN = 5;
    public const MIN_OPERATOR_TOKEN_LENGTH = 32;

    public string $environment;
    public string $dbHost;
    public int $dbPort;
    public string $dbName;
    public string $dbUser;
    public string $dbPassword;
    public ?string $operatorToken;
    public string $repoRoot;
    public int $staleAfterMinutes;
    public int $retentionDays;
    public ?string $alertWebhookUrl;
    public int $alertRepeatAfterMinutes;
    public int $alertMaxNotificationsPerRun;

    public function __construct(Environment $env)
    {
        $this->environment = self::string($env, 'APP_ENV') ?? 'production';
        if (!in_array($this->environment, ['local', 'test', 'production'], true)) {
            throw new RuntimeException('APP_ENV must be local, test, or production.');
        }

        $this->dbHost = self::string($env, 'DB_HOST') ?? '127.0.0.1';
        if (!preg_match('/^[a-zA-Z0-9.:-]+$/', $this->dbHost)) {
            throw new RuntimeException('Invalid database host.');
        }
        $this->dbPort = self::integer($env, 'DB_PORT', 3306, 1, 65535);
        $this->dbName = self::string($env, 'DB_NAME') ?? '';
        if ($this->dbName !== '' && !preg_match('/^[a-zA-Z0-9_]+$/', $this->dbName)) {
            throw new RuntimeException('DB_NAME may contain only letters, numbers, and underscores.');
        }
        $this->dbUser = self::string($env, 'DB_USER') ?? '';
        $this->dbPassword = $env->get('DB_PASSWORD');

        $this->operatorToken = self::string($env, 'STATUS_OPERATOR_TOKEN');
        if ($this->operatorToken !== null && strlen($this->operatorToken) < self::MIN_OPERATOR_TOKEN_LENGTH) {
            throw new RuntimeException('STATUS_OPERATOR_TOKEN must be at least 32 characters when set.');
        }

        $this->repoRoot = rtrim(self::string($env, 'STATUS_REPO_ROOT') ?? self::DEFAULT_REPO_ROOT, '/');
        if (!str_starts_with($this->repoRoot, '/')) {
            throw new RuntimeException('STATUS_REPO_ROOT must be an absolute path.');
        }

        $this->staleAfterMinutes = self::integer($env, 'STATUS_STALE_AFTER_MINUTES', self::DEFAULT_STALE_AFTER_MINUTES, 1, 10080);
        $this->retentionDays = self::integer($env, 'STATUS_RETENTION_DAYS', self::DEFAULT_RETENTION_DAYS, 1, 3650);
        $this->alertRepeatAfterMinutes = self::integer($env, 'STATUS_ALERT_REPEAT_AFTER_MINUTES', self::DEFAULT_ALERT_REPEAT_AFTER_MINUTES, 0, 525600);
        $this->alertMaxNotificationsPerRun = self::integer($env, 'STATUS_ALERT_MAX_NOTIFICATIONS_PER_RUN', self::DEFAULT_ALERT_MAX_NOTIFICATIONS_PER_RUN, 0, 1000);

        $this->alertWebhookUrl = self::string($env, 'STATUS_ALERT_WEBHOOK_URL');
        if ($this->alertWebhookUrl !== null) {
            $scheme = strtolower((string) parse_url($this->alertWebhookUrl, PHP_URL_SCHEME));
            if (filter_var($this->alertWebhookUrl, FILTER_VALIDATE_URL) === false || !in_array($scheme, ['http', 'https'], true)) {
                throw new RuntimeException('STATUS_ALERT_WEBHOOK_URL must be an http or https URL.');
            }
        }

        if ($this->isProduction() && !$this->hasDatabase()) {
            throw new RuntimeException('Production requires a configured database.');
        }
    }

    public function isProduction(): bool
    {
        return $this->environment === 'production';
    }

    public function hasDatabase(): bool
    {
        return $this->dbName !== '';
    }

    /** Trimmed value, or null when unset or blank. */
    private static function string(Environment $env, string $key): ?string
    {
        $value = trim($env->get($key));
        return $value === '' ? null : $value;
    }

    private static function integer(Environment $env, string $key, int $default, int $min, int $max): int
    {
        $raw = self::string($env, $key);
        if ($raw === null) {
            return $default;
        }
        $value = filter_var($raw, FILTER_VALIDATE_INT, ['options' => ['min_range' => $min, 'max_range' => $max]]);
        if ($value === false) {
            throw new RuntimeException(sprintf('%s must be an integer from %d to %d.', $key, $min, $max));
        }
        return $value;
    }
}
