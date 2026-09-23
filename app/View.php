<?php

declare(strict_types=1);

namespace Status;

use Status\Http\Response;
use Throwable;

final readonly class View
{
    private const PAGES = [
        'overview' => ['Dunamis Status', 'Current public status for the dunamismax self-hosted ecosystem.', 'overview'],
        'services' => ['Services', 'Public service check results for the dunamismax ecosystem.', 'services'],
        'projects' => ['Projects', 'Repository and project health for the dunamismax ecosystem.', 'projects'],
        'incidents' => ['Incidents', 'Incident and maintenance history for the dunamismax ecosystem.', 'incidents'],
        'deployments' => ['Deployments', 'Recent deployment evidence for the dunamismax ecosystem.', 'deployments'],
        'operator' => ['Operator', 'Private operator status for the dunamismax ecosystem.', 'operator'],
        'not-found' => ['Not found', 'The requested status page was not found.', 'overview'],
        'unavailable' => ['Unavailable', 'Status history is temporarily unavailable.', 'overview'],
    ];

    public function __construct(private string $root)
    {
    }

    public function page(string $template, array $data = [], int $status = 200, array $headers = []): Response
    {
        // Template names come only from application code, never a request.
        [$title, $description, $section] = self::PAGES[$template];
        $fullTitle = $section === 'overview' && $status === 200 ? 'Dunamis Status' : $title . ' · Dunamis Status';
        $freshness = $data['freshness'] ?? null;
        extract($data, EXTR_SKIP);

        $level = ob_get_level();
        ob_start();
        try {
            require $this->root . '/views/' . $template . '.php';
            $content = ob_get_clean();
            ob_start();
            require $this->root . '/views/layout.php';
            $html = ob_get_clean();
        } catch (Throwable $error) {
            while (ob_get_level() > $level) {
                ob_end_clean();
            }
            throw $error;
        }

        return new Response($html, $status, $headers);
    }

    public function notFound(): Response
    {
        return $this->page('not-found', [], 404);
    }

    public function unavailable(): Response
    {
        return $this->page('unavailable', [], 503, ['Retry-After' => '60']);
    }
}
