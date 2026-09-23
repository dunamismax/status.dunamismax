<?php

declare(strict_types=1);

namespace Status;

use Status\Targets\HttpTarget;
use Status\Targets\ProjectTarget;
use Status\Targets\SystemdTarget;
use Status\Targets\TcpTarget;

/**
 * What the collector watches. This is the target host state: every site on
 * Caddy, php8.5-fpm, and MySQL, with no dunamismax-site.service and no
 * PostgreSQL. Change it here, in one reviewed place.
 */
final class Inventory
{
    public const CADDY_BINARY = '/usr/local/lib/caddy/caddy';
    public const CADDYFILE = '/etc/caddy/Caddyfile';
    public const CADDY_UNIT = 'caddy.service';
    public const CLOUDFLARE_DDNS_UNIT = 'cloudflare-ddns.service';

    /** Group order on the overview; unlisted groups follow alphabetically. */
    public const GROUP_ORDER = [
        'Public websites',
        'Application services',
        'Remote access',
        'Container services',
        'Databases',
        'Deployment automation',
        'Backups & maintenance',
        'Host capacity',
        'Network & access',
        'Host infrastructure',
        'Host services',
    ];

    /** @return list<HttpTarget> */
    public static function httpTargets(): array
    {
        $site = static fn (string $id, string $name, string $probe): HttpTarget =>
            new HttpTarget($id, $name, 'Public websites', 'https://' . $name, $probe);

        return [
            $site('dunamismax-com', 'dunamismax.com', 'https://dunamismax.com/healthz'),
            $site('graceandfootnotes-com', 'graceandfootnotes.com', 'https://graceandfootnotes.com/'),
            $site('status-dunamismax-com', 'status.dunamismax.com', 'https://status.dunamismax.com/healthz'),
            $site('xrayservice-net', 'xrayservice.net', 'https://xrayservice.net/'),
        ];
    }

    /** @return list<SystemdTarget> */
    public static function systemdTargets(): array
    {
        return [
            new SystemdTarget('mtg-card-bot', 'mtg-card-bot.service', 'Application services'),
            new SystemdTarget('status-dunamismax-collector', 'status-dunamismax-collector.timer', 'Application services'),
            new SystemdTarget('mysql', 'mysql.service', 'Databases'),
            new SystemdTarget('caddy', self::CADDY_UNIT, 'Host infrastructure'),
            new SystemdTarget('php8.5-fpm', 'php8.5-fpm.service', 'Host infrastructure'),
            new SystemdTarget('docker', 'docker.service', 'Host infrastructure'),
            new SystemdTarget('containerd', 'containerd.service', 'Host infrastructure'),
            new SystemdTarget('ssh', 'ssh.service', 'Network & access'),
            new SystemdTarget('tailscaled', 'tailscaled.service', 'Network & access'),
            new SystemdTarget('fail2ban', 'fail2ban.service', 'Network & access'),
            new SystemdTarget('ufw', 'ufw.service', 'Network & access', oneShot: true),
            new SystemdTarget('cloudflare-ddns', self::CLOUDFLARE_DDNS_UNIT, 'Network & access', oneShot: true),
            new SystemdTarget('server-disk-cleanup', 'server-disk-cleanup.service', 'Maintenance', oneShot: true),
            new SystemdTarget('server-disk-cleanup-timer', 'server-disk-cleanup.timer', 'Maintenance'),
            new SystemdTarget('rustdesk-preconfig-build', 'rustdesk-preconfig-build.service', 'Maintenance', oneShot: true),
            new SystemdTarget('rustdesk-preconfig-build-timer', 'rustdesk-preconfig-build.timer', 'Maintenance'),
            new SystemdTarget('status-dunamismax-backup', 'status-dunamismax-backup.service', 'Maintenance', oneShot: true),
            new SystemdTarget('status-dunamismax-backup-timer', 'status-dunamismax-backup.timer', 'Maintenance'),
        ];
    }

    /** RustDesk is probed by its loopback listeners, so the collector needs no Docker access. */
    public static function tcpTargets(): array
    {
        return [
            new TcpTarget('rustdesk-tcp-21115', 'RustDesk hbbs NAT test (TCP 21115)', 'Remote access', '127.0.0.1', 21115),
            new TcpTarget('rustdesk-tcp-21116', 'RustDesk hbbs rendezvous (TCP 21116)', 'Remote access', '127.0.0.1', 21116),
            new TcpTarget('rustdesk-tcp-21117', 'RustDesk hbbr relay (TCP 21117)', 'Remote access', '127.0.0.1', 21117),
        ];
    }

    /** @return list<ProjectTarget> */
    public static function projectTargets(string $repoRoot): array
    {
        $project = static fn (string $id, string $repo, ?string $url): ProjectTarget =>
            new ProjectTarget($id, $repo, $repo, $url, rtrim($repoRoot, '/') . '/' . $repo);

        return [
            $project('dunamismax-com', 'dunamismax.com', 'https://dunamismax.com'),
            $project('mtg-card-bot', 'mtg-card-bot', null),
            $project('podgauge', 'podgauge', null),
            $project('status-dunamismax', 'status.dunamismax', 'https://status.dunamismax.com'),
            $project('xrayservice', 'xrayservice', 'https://xrayservice.net'),
        ];
    }
}
