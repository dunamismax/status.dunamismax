<?php

declare(strict_types=1);

use Status\Alert\AlertEvaluator;
use Status\Alert\WebhookNotifier;
use Status\Inventory;
use Status\Model\GitStatus;
use Status\Model\State;
use Status\Probe\CaddyProbe;
use Status\Probe\CloudflareDdnsProbe;
use Status\Probe\CommandResult;
use Status\Probe\CommandRunner;
use Status\Probe\DiskProbe;
use Status\Probe\GitProbe;
use Status\Probe\HttpProbe;
use Status\Probe\Systemd;
use Status\Probe\SystemdProbe;
use Status\Probe\TcpProbe;
use Status\Targets\HttpTarget;
use Status\Targets\ProjectTarget;
use Status\Targets\SystemdTarget;
use Status\Targets\TcpTarget;
use Status\Time;

$now = Time::parse('2026-09-23T14:00:00Z');

// Commands run without a shell, with only the environment they are given, and within a deadline.
$runner = new CommandRunner(['PATH' => '/usr/bin:/bin', 'LC_ALL' => 'C'], 2.0);
putenv('DB_PASSWORD=collector-secret-sentinel');
$env = $runner->run(['/usr/bin/env']);
putenv('DB_PASSWORD');
expect($env->succeeded() && str_contains($env->stdout, 'LC_ALL=C') && !str_contains($env->stdout, 'collector-secret-sentinel'),
    'Probe commands must not inherit the collector environment or its credentials.');
$shell = $runner->run(['/bin/echo', '$HOME; rm -rf /tmp/x']);
expect(trim($shell->stdout) === '$HOME; rm -rf /tmp/x', 'Arguments must reach the program literally, without a shell.');
expect($runner->run(['/bin/sh', '-c', 'exit 3'])->exitCode === 3, 'Exit codes must be reported.');
$slow = (new CommandRunner(['PATH' => '/usr/bin:/bin'], 0.3))->run(['/bin/sleep', '5']);
expect($slow->timedOut && $slow->exitCode === null && $slow->durationMs < 2000, 'Commands must stop at the deadline.');
expect(!$runner->run(['/nonexistent/program'])->succeeded(), 'A missing program must not look like success.');
expect($runner->run(['/bin/echo', 'x'], discardStdout: true)->stdout === '', 'Discarded output must not be captured.');

// systemd (ported from the Rust host tests).
$long = new SystemdTarget('callrift', 'callrift.service', 'Application services');
$oneShot = new SystemdTarget('cloudflare-ddns', 'cloudflare-ddns.service', 'Network & access', oneShot: true);
$facts = Systemd::parse("LoadState=loaded\nActiveState=active\nSubState=running\nResult=success\nExecMainStatus=0\nNRestarts=0\n");
expect(SystemdProbe::evaluate($long, $facts) === [State::Operational, 'unit is active'], 'An active unit is operational.');
expect(SystemdProbe::evaluate($long, ['NRestarts' => '8'] + $facts)[0] === State::Degraded, 'Restart loops degrade an active unit.');
expect(SystemdProbe::evaluate($long, ['ActiveState' => 'failed'] + $facts) === [State::Down, 'unit failed'], 'A failed unit is down.');
expect(SystemdProbe::evaluate($long, ['ActiveState' => 'inactive'] + $facts) === [State::Down, 'unit is inactive'], 'An inactive long-running unit is down.');
expect(SystemdProbe::evaluate($long, ['LoadState' => 'not-found'] + $facts) === [State::Unknown, 'unit is not loaded'], 'A missing unit is unknown, not down.');
$inactiveOk = Systemd::parse("LoadState=loaded\nActiveState=inactive\nResult=success\nExecMainStatus=0\n");
expect(SystemdProbe::evaluate($oneShot, $inactiveOk) === [State::Operational, 'latest one-shot run succeeded'], 'A successful one-shot is healthy while inactive.');
expect(SystemdProbe::evaluate($oneShot, ['ActiveState' => 'failed', 'Result' => 'exit-code', 'ExecMainStatus' => '1'] + $inactiveOk)[0] === State::Down,
    'A failed one-shot is down.');
expect(Systemd::timestamp('@1790172373')?->getTimestamp() === 1790172373, 'Unix timestamps from systemctl must parse.');
expect(Systemd::timestamp('Wed 2026-09-23 13:15:13 UTC')?->format('c') === '2026-09-23T13:15:13+00:00', 'Human timestamps must parse.');
expect(Systemd::timestamp('') === null && Systemd::timestamp('n/a') === null, 'Missing timestamps are null.');
$neverReloaded = '{ path=/usr/local/lib/caddy/caddy ; argv[]=/usr/local/lib/caddy/caddy reload ; ignore_errors=no ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0/0 }';
expect(!Systemd::execFailed($neverReloaded), 'A unit that was never reloaded has no failed reload.');
expect(Systemd::execFailed(str_replace('code=(null) ; status=0/0', 'code=exited ; status=1/FAILURE', $neverReloaded)), 'A non-zero reload exit is a failure.');
expect(!Systemd::execFailed(str_replace('code=(null)', 'code=exited', $neverReloaded)), 'A zero reload exit is success.');

// Caddy: unprivileged parse plus systemd evidence. Permission problems are never reported as an invalid config.
$ok = new CommandResult(0, '', '', 30);
$caddyFacts = ['ActiveState' => 'active', 'Result' => 'success', 'ActiveEnterTimestamp' => '@1790172373', 'ExecReload' => $neverReloaded];
expect(CaddyProbe::evaluate($ok, $caddyFacts) === [State::Operational, 'Caddyfile parses and caddy is active'], 'A parsing config on an active service is operational.');
$denied = CaddyProbe::evaluate(new CommandResult(1, '', 'Error: open /var/log/caddy/site.log: permission denied', 30), $caddyFacts);
expect($denied[0] === State::Unknown && !str_contains($denied[1], 'invalid'), 'Unreadable configuration must be unknown, never an invalid-config alarm.');
expect(CaddyProbe::evaluate(new CommandResult(1, '', 'Error: Caddyfile:2: unrecognized directive: bogus', 30), $caddyFacts)[0] === State::Degraded,
    'A Caddyfile that does not parse is degraded: the running config keeps serving until reload.');
expect(CaddyProbe::evaluate(new CommandResult(null, '', '', 5000, true), $caddyFacts)[0] === State::Unknown, 'A timed-out check is unknown.');
expect(CaddyProbe::evaluate($ok, ['ExecReload' => str_replace('code=(null) ; status=0/0', 'code=exited ; status=1/FAILURE', $neverReloaded)] + $caddyFacts)[0] === State::Degraded,
    'A failed reload degrades Caddy.');
expect(CaddyProbe::evaluate($ok, ['ActiveEnterTimestamp' => ''] + $caddyFacts)[0] === State::Degraded, 'Missing reload recency degrades Caddy.');
expect(CaddyProbe::evaluate($ok, ['ActiveState' => 'failed'] + $caddyFacts) === [State::Down, 'caddy service failed'], 'A failed Caddy service is down.');
expect(CaddyProbe::evaluate($ok, null)[0] === State::Unknown, 'Missing systemd evidence is unknown.');
if (is_executable(Inventory::CADDY_BINARY)) {
    $caddyDir = temporaryDirectory('status-caddy-');
    try {
        file_put_contents("$caddyDir/good", "example.com {\n\trespond \"ok\"\n}\n");
        file_put_contents("$caddyDir/bad", "example.com {\n\tbogus_directive\n}\n");
        $caddyRunner = new CommandRunner(['PATH' => '/usr/bin:/bin', 'HOME' => $caddyDir], 10.0);
        $adapt = static fn (string $file): CommandResult => $caddyRunner->run([Inventory::CADDY_BINARY, 'adapt', '--config', $file, '--adapter', 'caddyfile'], discardStdout: true);
        expect(CaddyProbe::evaluate($adapt("$caddyDir/good"), $caddyFacts)[0] === State::Operational, 'The production binary must parse a valid Caddyfile unprivileged.');
        expect(CaddyProbe::evaluate($adapt("$caddyDir/bad"), $caddyFacts)[0] === State::Degraded, 'The production binary must reject an unknown directive.');
    } finally {
        removeTree($caddyDir);
    }
}

// Cloudflare DDNS judges the latest run and its age.
$ddns = ['LoadState' => 'loaded', 'ActiveState' => 'inactive', 'Result' => 'success', 'ExecMainStatus' => '0'];
expect(CloudflareDdnsProbe::evaluate($ddns + ['InactiveEnterTimestamp' => '@' . ($now->getTimestamp() - 240)], $now)
    === [State::Operational, 'latest Cloudflare DDNS run succeeded'], 'A recent successful DDNS run is operational.');
expect(CloudflareDdnsProbe::evaluate($ddns + ['InactiveEnterTimestamp' => '@' . ($now->getTimestamp() - 2700)], $now)
    === [State::Degraded, 'latest Cloudflare DDNS run succeeded 45 minutes ago'], 'A DDNS run that stopped recurring is degraded.');
expect(CloudflareDdnsProbe::evaluate($ddns + ['InactiveEnterTimestamp' => ''], $now)[0] === State::Degraded, 'Unknown success time degrades DDNS.');
expect(CloudflareDdnsProbe::evaluate(['ActiveState' => 'failed', 'Result' => 'exit-code', 'ExecMainStatus' => '1'] + $ddns, $now)
    === [State::Down, 'latest Cloudflare DDNS run failed'], 'A failed DDNS run is down.');
expect(CloudflareDdnsProbe::evaluate(['LoadState' => 'not-found'] + $ddns, $now)[0] === State::Unknown, 'A missing DDNS unit is unknown.');

// Disk capacity (ported).
expect(DiskProbe::evaluate("Use% Avail\n 52% 59768800\n") === [State::Operational, 'root filesystem is 52% full; 57G available'], 'Normal disk use is operational.');
expect(DiskProbe::evaluate("Use% Avail\n 86% 18874368\n") === [State::Degraded, 'root filesystem is 86% full; 18G available'], 'High disk use is degraded.');
expect(DiskProbe::evaluate("Use% Avail\n 93% 900000\n")[0] === State::Down, 'Nearly full disks are down.');
expect(DiskProbe::evaluate("garbage")[0] === State::Unknown, 'Unparseable df output is unknown.');
expect(DiskProbe::formatKib(512) === '512K' && DiskProbe::formatKib(1536) === '2M', 'Available space must round like df.');

// TCP listeners.
$server = stream_socket_server('tcp://127.0.0.1:0');
$openPort = (int) substr(strrchr(stream_socket_get_name($server, false), ':'), 1);
$tcp = (new TcpProbe(1.0))->probe(new TcpTarget('t', "Test (TCP {$openPort})", 'Remote access', '127.0.0.1', $openPort));
fclose($server);
expect($tcp->state === State::Operational && $tcp->reason === "TCP {$openPort} accepts connections" && $tcp->checkKind === 'tcp', 'An open port is operational.');
$closed = closedPort();
$refused = (new TcpProbe(1.0))->probe(new TcpTarget('t', 'Test', 'Remote access', '127.0.0.1', $closed));
expect($refused->state === State::Down && $refused->reason === "TCP {$closed} refused the connection" && !str_contains($refused->reason, '127.0.0.1'),
    'A refused port is down without publishing the address.');

// HTTP.
$site = static fn (string $url, ?string $token = null): HttpTarget => new HttpTarget('site', 'site', 'Public websites', $url, $url, 200, $token);
withHttpServer(__DIR__ . '/fixtures/http-router.php', [], static function (string $base) use ($site): void {
    $probe = new HttpProbe(1.0);
    $result = $probe->probe($site("$base/ok"));
    expect($result->state === State::Operational && $result->reason === 'HTTP 200' && $result->latencyMs !== null && $result->checkKind === 'http',
        'A healthy endpoint is operational with latency.');
    expect($probe->probe($site("$base/redirect"))->reason === 'HTTP 200', 'Redirects are followed to the final status.');
    expect($probe->probe($site("$base/fail")) ->state === State::Down, 'Server errors are down.');
    expect($probe->probe($site("$base/missing"))->reason === 'expected HTTP 200, got HTTP 404', 'Unexpected statuses are degraded with a clear reason.');
    expect($probe->probe($site("$base/token", 'status-token'))->state === State::Operational, 'A present body token passes.');
    expect($probe->probe($site("$base/ok", 'status-token'))->reason === 'expected response token was missing', 'A missing body token is degraded.');
    $loop = $probe->probe($site("$base/loop"));
    expect($loop->state !== State::Operational, 'Redirect loops are not operational.');
    $slowResult = $probe->probe($site("$base/slow"));
    expect($slowResult->state === State::Down, 'Slow responses past the deadline are down.');
});
$refusedHttp = (new HttpProbe(1.0))->probe($site('http://127.0.0.1:' . closedPort() . '/'));
expect($refusedHttp->state === State::Down && $refusedHttp->reason === 'connection refused', 'Refused connections are named without the address.');
expect(HttpProbe::failureReason('php_network_getaddresses: getaddrinfo for x.invalid failed: Name or service not known') === 'DNS lookup failed', 'DNS failures are named.');
expect(HttpProbe::failureReason('SSL operation failed with code 1. OpenSSL Error messages: certificate verify failed') === 'TLS handshake failed', 'TLS failures are named.');
expect(HttpProbe::failureReason('Failed to open stream: Connection timed out') === 'request timed out', 'Timeouts are named.');
expect(HttpProbe::finalStatus(['HTTP/1.1 302 Found', 'Location: /ok', 'HTTP/1.1 200 OK']) === 200, 'The final hop decides the status.');

// Git repositories: read-only evidence (ported evaluations plus a real checkout).
expect(GitProbe::parseAheadBehind("3\t2") === [2, 3], 'rev-list counts are behind then ahead.');
expect(GitProbe::commitAgeDays('2026-05-16T12:00:00+00:00', Time::parse('2026-05-18T12:00:00Z')) === 2, 'Commit age is whole days.');
$dirty = GitProbe::evaluate(new GitStatus('main', 'origin/main', 1, 2, true, 2, true), null);
expect($dirty[0] === State::Degraded && str_contains($dirty[1], 'uncommitted changes') && str_contains($dirty[1], '1 ahead and 2 behind')
    && !str_contains($dirty[1], '/home/sawyer'), 'Dirty or diverged checkouts are degraded with public-safe reasons.');
expect(GitProbe::evaluate(new GitStatus('main', 'origin/main', 0, 0, false, 45), null)[1] === 'latest commit is 45 days old', 'Old commits are reported.');
expect(GitProbe::evaluate(new GitStatus(), null)[0] === State::Unknown, 'Unreadable branches are unknown.');
$repos = temporaryDirectory('status-git-');
try {
    $git = new CommandRunner(['PATH' => '/usr/bin:/bin', 'HOME' => $repos, 'GIT_CONFIG_NOSYSTEM' => '1', 'LC_ALL' => 'C',
        'GIT_AUTHOR_NAME' => 't', 'GIT_AUTHOR_EMAIL' => 't@example.invalid', 'GIT_COMMITTER_NAME' => 't', 'GIT_COMMITTER_EMAIL' => 't@example.invalid'], 10.0);
    $run = static function (array $arguments) use ($git): void {
        $result = $git->run(['/usr/bin/git', ...$arguments]);
        if (!$result->succeeded()) {
            throw new RuntimeException('git fixture failed: ' . $result->stderr);
        }
    };
    $run(['init', '-q', '--bare', '-b', 'main', "$repos/origin.git"]);
    $run(['clone', '-q', "$repos/origin.git", "$repos/app"]);
    file_put_contents("$repos/app/BUILD.md", "### Phase 1\n- [x] one\n- [ ] two\n");
    $run(['-C', "$repos/app", 'add', 'BUILD.md']);
    $run(['-C', "$repos/app", 'commit', '-q', '-m', 'first']);
    $run(['-C', "$repos/app", 'push', '-q', '-u', 'origin', 'main']);
    $gitProbe = new GitProbe(new CommandRunner(['PATH' => '/usr/bin:/bin', 'HOME' => $repos, 'GIT_OPTIONAL_LOCKS' => '0', 'LC_ALL' => 'C']));
    $target = new ProjectTarget('app', 'app', 'app', null, "$repos/app");
    $clean = $gitProbe->probe($target);
    expect($clean->state === State::Operational && $clean->reason === 'repository is current; BUILD progress 1/2'
        && $clean->git->branch === 'main' && $clean->git->upstream === 'origin/main' && $clean->git->dirty === false,
        'A current checkout is operational with BUILD progress.');
    $run(['-C', "$repos/app", 'commit', '-q', '--allow-empty', '-m', 'second']);
    file_put_contents("$repos/app/scratch.txt", "local\n");
    $changed = $gitProbe->probe($target);
    expect($changed->state === State::Degraded && $changed->git->ahead === 1 && $changed->git->dirty === true,
        'Local commits and files are reported, not fixed.');
    expect(is_file("$repos/app/scratch.txt"), 'The probe must never clean a checkout.');
    expect($gitProbe->probe(new ProjectTarget('gone', 'gone', 'gone', null, "$repos/missing"))->reason === 'repository checkout was not found',
        'Missing checkouts are unknown.');
    expect(!str_contains(json_encode($changed->toArray()), $repos), 'Project JSON never includes the checkout path.');
} finally {
    removeTree($repos);
}

// Alert webhook delivery.
$hookFile = tempnam(sys_get_temp_dir(), 'status-hook-');
try {
    withHttpServer(__DIR__ . '/fixtures/http-router.php', ['HOOK_FILE' => $hookFile], static function (string $base) use ($hookFile, $now): void {
        $alert = AlertEvaluator::evaluate(Status\Model\Snapshot::fromResults([new Status\Model\ServiceStatus('site', 'site', 'Public websites',
            'http', State::Down, $now, null, 'expected HTTP 200, got HTTP 503', 'test')], []))[0];
        (new WebhookNotifier("$base/hook"))->send($alert);
        [$method, $type, $body] = explode("\n", (string) file_get_contents($hookFile), 3);
        $payload = json_decode($body, true);
        expect($method === 'POST' && $type === 'application/json' && $payload['source'] === 'status.dunamismax.com'
            && $payload['severity'] === 'critical' && str_contains($payload['public_summary'], 'HTTP'), 'The webhook receives the public JSON payload.');
        try {
            (new WebhookNotifier("$base/hook-fail?token=secret-in-url"))->send($alert);
            expect(false, 'A failed webhook must throw.');
        } catch (RuntimeException $error) {
            expect(!str_contains($error->getMessage(), 'secret-in-url'), 'Webhook errors must not reveal the URL.');
        }
    });
} finally {
    unlink($hookFile);
}
rejects(fn () => new WebhookNotifier('ftp://example.com/'), 'Webhooks must use http or https.');
