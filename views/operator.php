<?php
use Status\Presenter;
use Status\Time;

/**
 * @var Status\Model\Snapshot $snapshot @var Status\Freshness $freshness
 * @var array<string, string> $paths @var string $readiness @var string $database
 */
$services = $snapshot->services;
$rows = '';
foreach ($snapshot->projects as $project) {
    $rows .= '<tr><th scope="row">' . e($project->name) . '</th><td>' . e($project->repoName) . '</td><td>'
        . e($paths[$project->id] ?? 'unknown') . '</td><td>' . e($project->git->branch ?? 'unknown') . '</td><td>'
        . e($project->git->upstream ?? 'none') . '</td><td>' . Presenter::worktree($project->git->dirty) . '</td></tr>';
}
?>
<section class="section first-section">
  <div class="section-heading">
    <div>
      <p class="eyebrow">Operator</p>
      <h1>Private status detail</h1>
    </div>
    <p class="timestamp">Last checked <?= $freshness->missing() ? 'never' : e(Time::display($snapshot->checkedAt)) ?></p>
  </div>
  <dl class="summary" aria-label="Operator summary">
    <div><dt>Overall</dt><dd><?= e($snapshot->overallState->value) ?></dd></div>
    <div><dt>Readiness</dt><dd><?= e($readiness) ?></dd></div>
    <div><dt>Database</dt><dd><?= e($database) ?></dd></div>
    <div><dt>Projects</dt><dd><?= count($snapshot->projects) ?></dd></div>
  </dl>
</section>
<section class="section">
  <div class="section-heading">
    <h2>Service checks</h2>
    <p class="timestamp"><?= count($services) ?> checks</p>
  </div>
<?php require __DIR__ . '/partials/service-table.php'; ?>
</section>
<section class="section">
  <div class="section-heading">
    <h2>Repository paths</h2>
    <p class="timestamp">authenticated view</p>
  </div>
  <?= $snapshot->projects === []
      ? Presenter::emptyState('No project records are available.')
      : Presenter::table(['Project', 'Repo', 'Path', 'Branch', 'Upstream', 'Worktree'], $rows) ?>
</section>
