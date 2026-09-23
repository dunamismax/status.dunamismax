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
</body>
</html>
