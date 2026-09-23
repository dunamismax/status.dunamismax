<?php

declare(strict_types=1);

use Status\Application;
use Status\Config;
use Status\Environment;
use Status\Http\Response;
use Status\Model\BuildProgress;
use Status\Model\DeploymentEvent;
use Status\Model\GitStatus;
use Status\Model\IncidentRecord;
use Status\Model\MaintenanceWindow;
use Status\Model\ProjectStatus;
use Status\Model\ServiceStatus;
use Status\Model\Snapshot;
use Status\Model\State;
use Status\Store\FixedStatusSource;
use Status\Time;
use Status\View;

$root = dirname(__DIR__);
// Failure cases below log on purpose; keep the test output readable.
$previousErrorLog = ini_set('error_log', '/dev/null');
$fixtureTime = Time::parse('2026-05-18T12:00:00Z');
$token = str_repeat('t', 40);
$makeApp = static function (FixedStatusSource $source, int $minutesLater = 2, ?string $operatorToken = null) use ($root, $fixtureTime): Application {
    $config = new Config(new Environment(array_filter(['APP_ENV' => 'test', 'STATUS_OPERATOR_TOKEN' => $operatorToken]), false));
    return new Application($config, $source, new View($root), static fn () => $fixtureTime->modify("+{$minutesLater} minutes"));
};
$app = $makeApp(new FixedStatusSource(snapshotFixture(), configured: true));
$get = static fn (Application $app, string $path, array $server = []): Response => $app->handle('GET', $path, $server);

$health = $get($app, '/healthz');
expect($health->status === 200 && $health->body === "ok\n" && $health->allHeaders()['Content-Type'] === 'text/plain; charset=utf-8', '/healthz must stay cheap and plain.');

$ready = $get($app, '/readyz');
expect($ready->status === 200 && $ready->allHeaders()['Content-Type'] === 'application/json', '/readyz returns JSON.');
expect(json_decode($ready->body, true) === ['status' => 'ready', 'dependencies' => 'mysql-ready,collector-snapshot-fresh', 'database' => 'ready'],
    '/readyz reports database and snapshot readiness in the same shape.');
expect(json_decode($get($makeApp(new FixedStatusSource(snapshotFixture())), '/readyz')->body, true)['database'] === 'not_configured',
    'Local preview reports the database as not configured.');

$home = $get($app, '/');
expect($home->status === 200 && str_starts_with($home->allHeaders()['Content-Type'], 'text/html'), 'The overview renders HTML.');
foreach (['Dunamis Status', 'Some monitored services are degraded', 'fileferry.app', '<main id="main">', 'href="/api/status.json"',
    'class="nav-link active" href="/" aria-current="page"'] as $needle) {
    expect(str_contains($home->body, $needle), 'The overview must contain: ' . $needle);
}
expect(str_contains($home->body, '2026-05-18 07:00:00 EST'), 'The overview shows the check time in EST.');
expect(!str_contains($home->body, 'stale-notice'), 'A fresh snapshot is not marked stale.');

$services = $get($app, '/services');
foreach (['Service-level status', 'expected HTTP 200, got HTTP 503', '42 ms'] as $needle) {
    expect(str_contains($services->body, $needle), '/services must contain: ' . $needle);
}

$statusJson = $get($app, '/api/status.json');
$status = json_decode($statusJson->body, true);
expect($statusJson->allHeaders()['Content-Type'] === 'application/json', '/api/status.json is application/json.');
expect($status['overall_state'] === 'degraded' && $status['summary']['operational'] === 1 && $status['summary']['degraded'] === 1,
    '/api/status.json keeps the rollup.');
expect($status['projects'][0]['target']['repo_name'] === 'fileferry' && !array_key_exists('repo_path', $status['projects'][0]['target']),
    '/api/status.json keeps projects without private paths.');
expect(!str_contains($statusJson->body, '\/'), 'JSON must not escape slashes.');

$incidentFeed = $get($app, '/api/incidents.json');
expect($incidentFeed->body === '{"incidents":[],"maintenance":[]}' && $incidentFeed->allHeaders()['Content-Type'] === 'application/json',
    '/api/incidents.json keeps its empty feed shape.');

$projects = $get($app, '/projects');
foreach (['Repository status', 'fileferry', 'BUILD progress', '2/3 checked · Phase 4: Repository And Project Status'] as $needle) {
    expect(str_contains($projects->body, $needle), '/projects must contain: ' . $needle);
}
expect(str_contains($get($app, '/incidents')->body, 'No incident records are stored yet.'), '/incidents shows the empty history.');
expect(str_contains($get($app, '/deployments')->body, 'No deployment records are stored yet.'), '/deployments shows the empty history.');

// Records, escaping, and short commits.
$recorded = $makeApp(new FixedStatusSource(snapshotFixture(),
    [new IncidentRecord('Example <b>', ['fileferry-app'], 'resolved', $fixtureTime, $fixtureTime, '<private>')],
    [new MaintenanceWindow('Upgrade', ['mysql'], 'scheduled', $fixtureTime, $fixtureTime->modify('+1 hour'), 'Brief')],
    [new DeploymentEvent('fileferry-app', 'fileferry', 'abcdef1234567890', 'production', $fixtureTime, 'deployed')], configured: true));
$incidentPage = $get($recorded, '/incidents')->body;
expect(str_contains($incidentPage, '&lt;private&gt;') && !str_contains($incidentPage, '<private>') && str_contains($incidentPage, 'Example &lt;b&gt;'),
    'Incident notes are escaped.');
$feed = json_decode($get($recorded, '/api/incidents.json')->body, true);
expect($feed['incidents'][0] === ['title' => 'Example <b>', 'affected_targets' => ['fileferry-app'], 'state' => 'resolved',
    'started_at' => '2026-05-18T12:00:00Z', 'resolved_at' => '2026-05-18T12:00:00Z', 'public_notes' => '<private>'], 'Incident JSON keeps its shape.');
expect(array_keys($feed['maintenance'][0]) === ['title', 'affected_targets', 'state', 'starts_at', 'ends_at', 'public_notes'], 'Maintenance JSON keeps its shape.');
$deploymentPage = $get($recorded, '/deployments')->body;
expect(str_contains($deploymentPage, 'abcdef123456') && !str_contains($deploymentPage, 'abcdef1234567890'), 'Deployments show short commits.');

$escaped = $makeApp(new FixedStatusSource(Snapshot::fromResults([new ServiceStatus('example', 'Example', 'Sites', 'http',
    State::Degraded, $fixtureTime, 42, '<bad>', 'test', 'https://example.com', 'https://example.com/healthz', 200)],
    [new ProjectStatus('example', 'Example', 'example', null, State::Degraded, $fixtureTime, '<dirty>', new GitStatus('main'), new BuildProgress(1, 2, 'Phase 2'), 'test')]),
    configured: true));
foreach (['/', '/services', '/projects'] as $path) {
    $body = $get($escaped, $path)->body;
    expect(!str_contains($body, '<bad>') && !str_contains($body, '<dirty>'), 'Reasons are escaped on ' . $path);
}

// Operator boundary.
$operatorSnapshot = Snapshot::fromResults(snapshotFixture()->services, [new ProjectStatus('status-dunamismax', 'status.dunamismax',
    'status.dunamismax', 'https://status.dunamismax.com', State::Operational, $fixtureTime, 'repository is current', new GitStatus('main', 'origin/main', 0, 0, false, 1), null, 'test')]);
expect($get($app, '/operator')->status === 404, '/operator stays disabled without a token.');
$operatorApp = $makeApp(new FixedStatusSource($operatorSnapshot, configured: true), 2, $token);
$denied = $get($operatorApp, '/operator');
expect($denied->status === 401 && $denied->allHeaders()['WWW-Authenticate'] === 'Bearer realm="status-operator"'
    && $denied->body === "operator authorization required\n" && !str_contains($denied->body, '/home/sawyer'), '/operator requires a bearer token.');
expect($get($operatorApp, '/operator', ['HTTP_AUTHORIZATION' => 'Bearer wrong'])->status === 401, 'A wrong token is refused.');
expect($get($operatorApp, '/operator', ['HTTP_AUTHORIZATION' => 'Basic ' . $token])->status === 401, 'Only bearer tokens are accepted.');
$operator = $get($operatorApp, '/operator', ['HTTP_AUTHORIZATION' => 'Bearer ' . $token]);
expect($operator->status === 200 && str_contains($operator->body, 'Private status detail')
    && str_contains($operator->body, '/home/sawyer/github/status.dunamismax') && ($operator->headers['X-Robots-Tag'] ?? '') === 'noindex',
    'A valid token shows private repository paths.');
foreach (['/', '/services', '/projects', '/api/status.json', '/incidents', '/deployments'] as $path) {
    expect(!str_contains($get($operatorApp, $path)->body, '/home/sawyer'), 'Public output must not contain private paths: ' . $path);
}

// Staleness and missing data are shown, never presented as current.
$stale = $makeApp(new FixedStatusSource(snapshotFixture(), configured: true), 60);
$staleHome = $get($stale, '/')->body;
expect(str_contains($staleHome, 'Stale data.') && str_contains($staleHome, 'Status data is stale') && str_contains($staleHome, 'status-band is-unknown')
    && str_contains($staleHome, '60 minutes ago'), 'Stale snapshots are labelled on the overview.');
expect(str_contains($get($stale, '/services')->body, 'Stale data.') && str_contains($get($stale, '/projects')->body, 'Stale data.'), 'Every snapshot page shows staleness.');
expect(json_decode($get($stale, '/readyz')->body, true)['status'] === 'degraded'
    && str_contains($get($stale, '/readyz')->body, 'collector-snapshot-stale'), 'A stale snapshot makes readiness degraded.');
$missing = $makeApp(new FixedStatusSource(null, configured: true));
expect(str_contains($get($missing, '/')->body, 'No status data yet.'), 'A missing snapshot is stated plainly.');
$missingJson = json_decode($get($missing, '/api/status.json')->body, true);
expect($missingJson['overall_state'] === 'unknown' && $missingJson['services'] === [] && $missingJson['projects'] === [], 'No data is unknown in JSON.');

// Store failures are honest: pages return 503 rather than empty lists, and health stays cheap.
$failing = $makeApp(new FixedStatusSource(configured: true, failing: true));
expect($get($failing, '/')->status === 503 && str_contains($get($failing, '/')->body, 'Status history is unavailable'), 'Pages return 503 when history cannot be read.');
expect($get($failing, '/incidents')->status === 503, 'Incidents are not shown as empty when unreadable.');
expect($get($failing, '/api/status.json')->status === 503 && $get($failing, '/api/status.json')->allHeaders()['Content-Type'] === 'application/json',
    'JSON endpoints return a JSON 503.');
expect($get($failing, '/healthz')->status === 200, '/healthz does not touch the database.');
expect(json_decode($get($failing, '/readyz')->body, true) === ['status' => 'degraded', 'dependencies' => 'mysql-unavailable,collector-snapshot-unknown',
    'database' => 'unavailable'], '/readyz reports an unavailable database.');

// Routing.
expect($app->handle('HEAD', '/')->status === 200, 'HEAD follows GET routing.');
$post = $app->handle('POST', '/');
expect($post->status === 405 && $post->headers['Allow'] === 'GET, HEAD', 'Known routes reject other methods.');
foreach (['/nope', '/services/', '/assets/other.css', '/.env', '/bin/collect.php', '/api/status', '//evil.example'] as $path) {
    $response = $get($app, $path);
    expect($response->status === 404 && str_contains($response->body, 'That status page is not available.'), 'Unknown paths return the 404 page: ' . $path);
}
expect($app->handle('POST', '/nope')->status === 404, 'Unknown paths are 404 for any method.');
expect($get($app, '/?source=test')->status === 200, 'Query strings do not change routing.');

// Pages carry no inline script or style, so the strict CSP holds, and only local assets load.
foreach (['/', '/services', '/projects', '/incidents', '/deployments', '/nope'] as $path) {
    $body = $get($app, $path)->body;
    expect(preg_match('/<script(?![^>]*\bsrc=)/', $body) === 0 && !str_contains($body, ' style='), 'No inline script or style on ' . $path);
    expect(preg_match('#(src|href)="(https?:)?//#', preg_replace('#<a [^>]*>#', '', $body)) === 0, 'Only local assets load on ' . $path);
}
expect(str_contains($get($app, '/')->allHeaders()['Content-Security-Policy'], "default-src 'self'"), 'HTML carries a strict CSP.');

// The web pool must never run commands; code on its path cannot even name them.
$webFiles = [$root . '/public/index.php', $root . '/app/Application.php', $root . '/app/View.php', $root . '/app/Presenter.php',
    $root . '/app/Freshness.php', $root . '/app/Http/Response.php', $root . '/app/Store/MysqlStatusSource.php',
    ...glob($root . '/app/Model/*.php'), ...glob($root . '/views/*.php'), ...glob($root . '/views/partials/*.php')];
foreach ($webFiles as $file) {
    $tokens = array_values(array_filter(token_get_all((string) file_get_contents($file)),
        static fn ($t): bool => !is_array($t) || !in_array($t[0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true)));
    $executes = false;
    foreach ($tokens as $index => $token) {
        $name = is_array($token) && in_array($token[0], [T_STRING, T_NAME_FULLY_QUALIFIED], true) ? ltrim(strtolower($token[1]), '\\') : null;
        $executes = $executes || $token === '`'
            || (in_array($name, ['exec', 'shell_exec', 'system', 'passthru', 'proc_open', 'popen', 'pcntl_exec'], true) && ($tokens[$index + 1] ?? null) === '(');
    }
    expect(!$executes, 'Web code must not execute commands: ' . basename($file));
}

// Static assets served by Caddy.
expect(str_contains((string) file_get_contents($root . '/public/assets/status.css'), '.status-table'), 'The stylesheet exists.');
expect(str_contains((string) file_get_contents($root . '/public/icon.svg'), '<svg'), 'The icon exists.');
expect(str_contains((string) file_get_contents($root . '/public/robots.txt'), 'User-agent'), 'robots.txt exists.');
foreach (['theme-init.js', 'theme-toggle.js'] as $script) {
    expect(str_contains($get($app, '/')->body, '/assets/' . $script) && is_file($root . '/public/assets/' . $script), 'The theme script is local: ' . $script);
}
ini_set('error_log', (string) $previousErrorLog);
