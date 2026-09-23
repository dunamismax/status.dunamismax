<?php

declare(strict_types=1);

namespace Status\Cli;

use RuntimeException;
use Status\Alert\AlertEvaluator;
use Status\Alert\WebhookNotifier;
use Status\Database;
use Status\Probe\Collector;
use Status\Store\HistoryWriter;
use Throwable;

/**
 * One collector run for the systemd timer: probe, store the snapshot, send
 * unsuppressed alerts, prune expired check rows. Without a database (local
 * only) it prints the snapshot JSON instead.
 */
final class CollectCommand
{
    public static function run(string $root): int
    {
        try {
            $config = Cli::config($root);
            ini_set('default_socket_timeout', '5');
            $snapshot = Collector::create($config->repoRoot, self::childHome())->collect();

            if (!$config->hasDatabase()) {
                if ($config->alertWebhookUrl !== null) {
                    throw new RuntimeException('Alert notifications need the database for duplicate suppression.');
                }
                fwrite(STDOUT, $snapshot->toJson() . "\n");
                return 0;
            }

            $writer = new HistoryWriter(new Database($config));
            $writer->recordSnapshot($snapshot);

            $sent = 0;
            if ($config->alertWebhookUrl !== null) {
                $notifier = new WebhookNotifier($config->alertWebhookUrl);
                $alerts = $writer->unsuppressedAlerts(AlertEvaluator::evaluate($snapshot),
                    $config->alertRepeatAfterMinutes, $config->alertMaxNotificationsPerRun);
                foreach ($alerts as $alert) {
                    $notifier->send($alert);
                    $writer->recordAlertNotification($alert, 'webhook');
                    $sent++;
                    fwrite(STDOUT, sprintf("sent %s alert for %s (%s)\n", $alert->severity, $alert->targetId, $alert->state->value));
                }
            }

            $pruned = $writer->pruneCheckRuns($config->retentionDays);
            fwrite(STDOUT, sprintf("stored snapshot: overall=%s services=%d projects=%d alerts_sent=%d pruned_check_runs=%d\n",
                $snapshot->overallState->value, count($snapshot->services), count($snapshot->projects), $sent, $pruned));
            return 0;
        } catch (Throwable $error) {
            return Cli::fail($error->getMessage());
        }
    }

    /** A private HOME for child processes (caddy and git write small state files there). */
    private static function childHome(): string
    {
        $home = sys_get_temp_dir() . '/status-collector-' . posix_geteuid();
        if (!is_dir($home) && !@mkdir($home, 0700) && !is_dir($home)) {
            throw new RuntimeException('Cannot create the collector working directory.');
        }
        $stat = @lstat($home);
        if ($stat === false || is_link($home) || $stat['uid'] !== posix_geteuid() || ($stat['mode'] & 0077) !== 0) {
            throw new RuntimeException('The collector working directory must be a private directory owned by the collector.');
        }
        return $home;
    }
}
