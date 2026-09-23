<?php

declare(strict_types=1);

namespace Status;

use Closure;
use DateTimeImmutable;
use Status\Http\Response;
use Status\Model\Snapshot;
use Status\Store\StatusSource;
use Throwable;

/**
 * The web front controller's router. It only reads stored results: probing
 * happens in the collector, never in a request.
 */
final class Application
{
    private const ROUTES = [
        '/' => 'overview',
        '/services' => 'services',
        '/projects' => 'projects',
        '/incidents' => 'incidents',
        '/deployments' => 'deployments',
        '/operator' => 'operator',
        '/healthz' => 'healthz',
        '/readyz' => 'readyz',
        '/api/status.json' => 'statusJson',
        '/api/incidents.json' => 'incidentsJson',
    ];

    private readonly Closure $clock;

    public function __construct(
        private readonly Config $config,
        private readonly StatusSource $source,
        private readonly View $view,
        ?Closure $clock = null,
    ) {
        $this->clock = $clock ?? static fn (): DateTimeImmutable => Time::now();
    }

    /** @param array<string, string> $server request variables; only HTTP_AUTHORIZATION is read */
    public function handle(string $method, string $uri, array $server = []): Response
    {
        $path = explode('?', $uri, 2)[0];
        $route = self::ROUTES[$path] ?? null;
        if ($route === null) {
            return $this->view->notFound();
        }
        if (!in_array($method, ['GET', 'HEAD'], true)) {
            return new Response('', 405, ['Allow' => 'GET, HEAD', 'Content-Type' => Response::TEXT]);
        }

        try {
            return $this->{$route}($server);
        } catch (Throwable $error) {
            error_log('status request failed: ' . $error::class . ': ' . $error->getMessage());
            return str_starts_with($path, '/api/') || $path === '/readyz'
                ? Response::json(['error' => 'status data unavailable'], 503, ['Retry-After' => '60'])
                : $this->view->unavailable();
        }
    }

    private function overview(): Response
    {
        [$snapshot, $freshness] = $this->snapshot();
        return $this->view->page('overview', ['snapshot' => $snapshot->servicesOnly(), 'freshness' => $freshness]);
    }

    private function services(): Response
    {
        [$snapshot, $freshness] = $this->snapshot();
        return $this->view->page('services', ['snapshot' => $snapshot->servicesOnly(), 'freshness' => $freshness]);
    }

    private function projects(): Response
    {
        [$snapshot, $freshness] = $this->snapshot();
        return $this->view->page('projects', ['projects' => $snapshot->projects, 'freshness' => $freshness]);
    }

    private function incidents(): Response
    {
        return $this->view->page('incidents', [
            'incidents' => $this->source->incidents(),
            'maintenance' => $this->source->maintenanceWindows(),
        ]);
    }

    private function deployments(): Response
    {
        return $this->view->page('deployments', ['deployments' => $this->source->deployments()]);
    }

    private function operator(array $server): Response
    {
        $token = $this->config->operatorToken;
        if ($token === null) {
            return $this->view->notFound();
        }
        $header = trim((string) ($server['HTTP_AUTHORIZATION'] ?? ''));
        $candidate = str_starts_with($header, 'Bearer ') ? substr($header, 7) : null;
        if ($candidate === null || !hash_equals($token, $candidate)) {
            return Response::text("operator authorization required\n", 401, [
                'WWW-Authenticate' => 'Bearer realm="status-operator"', 'X-Robots-Tag' => 'noindex',
            ]);
        }

        [$snapshot, $freshness] = $this->snapshot();
        $readiness = $this->readiness();
        $paths = [];
        foreach (Inventory::projectTargets($this->config->repoRoot) as $target) {
            $paths[$target->id] = $target->repoPath;
        }
        return $this->view->page('operator', [
            'snapshot' => $snapshot, 'freshness' => $freshness, 'paths' => $paths,
            'readiness' => $readiness['status'], 'database' => $readiness['database'],
        ], 200, ['X-Robots-Tag' => 'noindex']);
    }

    private function healthz(): Response
    {
        return Response::text("ok\n");
    }

    private function readyz(): Response
    {
        return Response::json($this->readiness());
    }

    private function statusJson(): Response
    {
        return new Response($this->snapshot()[0]->toJson(), 200, ['Content-Type' => Response::JSON]);
    }

    private function incidentsJson(): Response
    {
        return Response::json([
            'incidents' => array_map(static fn ($i): array => $i->toArray(), $this->source->incidents()),
            'maintenance' => array_map(static fn ($m): array => $m->toArray(), $this->source->maintenanceWindows()),
        ]);
    }

    /** @return array{0: Snapshot, 1: Freshness} the latest snapshot, or an honest unknown when none exists */
    private function snapshot(): array
    {
        $now = ($this->clock)();
        $stored = $this->source->latestSnapshot();
        return [$stored ?? Snapshot::empty($now), Freshness::of($stored, $now, $this->config->staleAfterMinutes)];
    }

    /** @return array{status: string, dependencies: string, database: string} */
    private function readiness(): array
    {
        if (!$this->source->isConfigured()) {
            [$database, $freshness] = ['not_configured', $this->snapshot()[1]];
        } else {
            try {
                $this->source->ping();
                [$database, $freshness] = ['ready', $this->snapshot()[1]];
            } catch (Throwable $error) {
                error_log('status readiness check failed: ' . $error::class);
                [$database, $freshness] = ['unavailable', null];
            }
        }

        $databaseDependency = match ($database) {
            'ready' => 'mysql-ready',
            'unavailable' => 'mysql-unavailable',
            default => 'mysql-not-configured',
        };
        $ready = $database !== 'unavailable' && $freshness !== null && !$freshness->stale;
        return [
            'status' => $ready ? 'ready' : 'degraded',
            'dependencies' => $databaseDependency . ',' . ($freshness?->dependency() ?? 'collector-snapshot-unknown'),
            'database' => $database,
        ];
    }
}
