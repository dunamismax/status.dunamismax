<?php

declare(strict_types=1);

namespace Status\Cli;

use RuntimeException;
use Status\Database;
use Status\Model\DeploymentEvent;
use Status\Store\HistoryWriter;
use Status\Time;
use Throwable;

/** Records one deployment event, replacing the old `STATUS_RECORD_DEPLOYMENT=1 status-web` mode. */
final class RecordDeploymentCommand
{
    private const OPTIONS = ['service-id', 'repo-name', 'commit-sha', 'environment', 'deployed-at', 'summary', 'help'];

    /** Options fall back to the environment variables the old binary read. */
    private const ENVIRONMENT = [
        'service-id' => 'STATUS_DEPLOYMENT_SERVICE_ID',
        'repo-name' => 'STATUS_DEPLOYMENT_REPO_NAME',
        'commit-sha' => 'STATUS_DEPLOYMENT_COMMIT_SHA',
        'environment' => 'STATUS_DEPLOYMENT_ENVIRONMENT',
        'deployed-at' => 'STATUS_DEPLOYMENT_DEPLOYED_AT',
        'summary' => 'STATUS_DEPLOYMENT_PUBLIC_SUMMARY',
    ];

    public const HELP = <<<'TEXT'
        Usage: php bin/record-deployment.php [options]

          --service-id ID       monitored service, e.g. status-dunamismax
          --repo-name NAME      repository, e.g. status.dunamismax
          --commit-sha SHA      deployed commit (7-64 hex characters)
          --environment NAME    defaults to production
          --deployed-at TIME    RFC 3339 with offset; defaults to now
          --summary TEXT        public one-line summary; defaults to
                                "<service or repo> deployed to <environment>"

        Each option may instead come from STATUS_DEPLOYMENT_SERVICE_ID,
        _REPO_NAME, _COMMIT_SHA, _ENVIRONMENT, _DEPLOYED_AT, or _PUBLIC_SUMMARY.
        Database settings come from STATUS_ENV_FILE (or .env).

        TEXT;

    /** @param list<string> $arguments */
    public static function run(string $root, array $arguments): int
    {
        try {
            $options = Cli::options($arguments, self::OPTIONS);
            if (isset($options['help'])) {
                fwrite(STDOUT, self::HELP);
                return 0;
            }
            foreach (self::ENVIRONMENT as $option => $variable) {
                $value = getenv($variable);
                if (!isset($options[$option]) && $value !== false) {
                    $options[$option] = $value;
                }
            }

            $event = DeploymentEvent::create($options['service-id'] ?? null, $options['repo-name'] ?? null,
                $options['commit-sha'] ?? null, $options['environment'] ?? null, $options['deployed-at'] ?? null,
                $options['summary'] ?? null, Time::now());
            $config = Cli::config($root);
            if (!$config->hasDatabase()) {
                throw new RuntimeException('Recording a deployment needs the database.');
            }
            (new HistoryWriter(new Database($config)))->recordDeployment($event);
            fwrite(STDOUT, sprintf("recorded deployment: %s %s at %s\n", $event->serviceId ?? $event->repoName ?? 'service',
                $event->environment, Time::toJson($event->deployedAt)));
            return 0;
        } catch (Throwable $error) {
            return Cli::fail($error->getMessage());
        }
    }
}
