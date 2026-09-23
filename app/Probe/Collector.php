<?php

declare(strict_types=1);

namespace Status\Probe;

use Status\Inventory;
use Status\Model\Snapshot;

/** Runs every probe once, sequentially, and returns one snapshot. */
final class Collector
{
    public function __construct(
        private readonly HttpProbe $http,
        private readonly SystemdProbe $systemd,
        private readonly TcpProbe $tcp,
        private readonly CaddyProbe $caddy,
        private readonly CloudflareDdnsProbe $ddns,
        private readonly DiskProbe $disk,
        private readonly GitProbe $git,
        private readonly string $repoRoot,
    ) {
    }

    /** Production wiring. Child processes get a minimal environment, never the collector's secrets. */
    public static function create(string $repoRoot, string $homeDirectory): self
    {
        $runner = new CommandRunner([
            'PATH' => '/usr/local/bin:/usr/bin:/bin',
            'HOME' => $homeDirectory,
            'XDG_CONFIG_HOME' => $homeDirectory . '/.config',
            'XDG_DATA_HOME' => $homeDirectory . '/.local/share',
            'LC_ALL' => 'C',
            'GIT_OPTIONAL_LOCKS' => '0',
            'GIT_TERMINAL_PROMPT' => '0',
            'GIT_CONFIG_NOSYSTEM' => '1',
        ]);
        $systemd = new Systemd($runner);

        return new self(new HttpProbe(), new SystemdProbe($systemd), new TcpProbe(), new CaddyProbe($runner, $systemd),
            new CloudflareDdnsProbe($systemd), new DiskProbe($runner), new GitProbe($runner), $repoRoot);
    }

    public function collect(): Snapshot
    {
        $services = [];
        foreach (Inventory::httpTargets() as $target) {
            $services[] = $this->http->probe($target);
        }
        foreach (Inventory::systemdTargets() as $target) {
            $services[] = $this->systemd->probe($target);
        }
        foreach (Inventory::tcpTargets() as $target) {
            $services[] = $this->tcp->probe($target);
        }
        $services[] = $this->caddy->probe();
        $services[] = $this->ddns->probe();
        $services[] = $this->disk->probe();

        $projects = [];
        foreach (Inventory::projectTargets($this->repoRoot) as $target) {
            $projects[] = $this->git->probe($target);
        }

        return Snapshot::fromResults($services, $projects);
    }
}
