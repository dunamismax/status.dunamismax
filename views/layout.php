<?php
/** @var string $fullTitle @var string $description @var string $section @var string $content @var ?Status\Freshness $freshness */
$nav = ['/' => ['Overview', 'overview'], '/services' => ['Services', 'services'], '/projects' => ['Projects', 'projects'],
    '/incidents' => ['Incidents', 'incidents'], '/deployments' => ['Deployments', 'deployments']];
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="dark light">
    <meta name="description" content="<?= e($description) ?>">
    <link rel="icon" type="image/svg+xml" href="/icon.svg">
    <link rel="stylesheet" href="/assets/status.css">
    <script src="/assets/theme-init.js"></script>
    <title><?= e($fullTitle) ?></title>
</head>
<body>
    <a class="skip" href="#main">Skip to status</a>
    <header class="site-header">
        <div class="site-header-inner">
            <a class="brand" href="/" aria-label="Dunamis Status home">
                <span class="brand-mark" aria-hidden="true">DS</span>
                <span>Dunamis Status</span>
            </a>
            <div class="header-tools">
                <nav aria-label="Primary">
<?php foreach ($nav as $href => [$label, $key]): ?>
                    <a class="<?= $section === $key ? 'nav-link active' : 'nav-link' ?>" href="<?= e($href) ?>"<?= $section === $key ? ' aria-current="page"' : '' ?>><?= e($label) ?></a>
<?php endforeach; ?>
                </nav>
                <button class="theme-toggle" type="button" aria-label="Toggle color theme" title="Toggle color theme" data-theme-toggle="true"><svg class="icon icon-sun" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor"><path d="M8 12.25a4.25 4.25 0 1 1 0-8.5 4.25 4.25 0 0 1 0 8.5Zm0-1.5a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5Z"/><path d="M8 0a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0V.75A.75.75 0 0 1 8 0Zm0 13a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 8 13Zm8-5a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 16 8ZM3 8a.75.75 0 0 1-.75.75H.75a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 3 8Zm10.657-5.657a.75.75 0 0 1 0 1.06l-1.06 1.061a.75.75 0 1 1-1.061-1.06l1.06-1.061a.75.75 0 0 1 1.061 0ZM4.464 11.535a.75.75 0 0 1 0 1.061l-1.06 1.061a.75.75 0 1 1-1.061-1.06l1.06-1.062a.75.75 0 0 1 1.061 0Zm9.193 2.122a.75.75 0 0 1-1.06 0l-1.061-1.06a.75.75 0 1 1 1.06-1.061l1.061 1.06a.75.75 0 0 1 0 1.061ZM4.464 4.464a.75.75 0 0 1-1.06 0L2.343 3.404a.75.75 0 0 1 1.06-1.06l1.061 1.06a.75.75 0 0 1 0 1.06Z"/></svg><svg class="icon icon-moon" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor"><path d="M9.598 1.591a.749.749 0 0 1 .785-.175 7.001 7.001 0 1 1-8.967 8.967.75.75 0 0 1 .961-.96 5.5 5.5 0 0 0 7.046-7.046.75.75 0 0 1 .175-.786Zm1.616 1.945a7 7 0 0 1-7.678 7.678 5.499 5.499 0 1 0 7.678-7.678Z"/></svg></button>
            </div>
        </div>
    </header>
    <main id="main">
<?php if ($freshness !== null && $freshness->stale): ?>
        <p class="stale-notice" role="status">
<?php if ($freshness->missing()): ?>
            <strong>No status data yet.</strong> The collector has not recorded a snapshot, so every state is unknown.
<?php else: ?>
            <strong>Stale data.</strong> The latest collector snapshot is from <?= e(Status\Time::display($freshness->checkedAt)) ?> (<?= e($freshness->ageMinutes) ?> minutes ago). These results may no longer be current.
<?php endif; ?>
        </p>
<?php endif; ?>
<?= $content ?>
    </main>
    <footer class="site-footer">
        <div class="site-footer-inner">
            <span>status.dunamismax.com</span>
            <a href="/api/status.json">JSON</a>
        </div>
    </footer>
    <script src="/assets/theme-toggle.js" defer></script>
</body>
</html>
