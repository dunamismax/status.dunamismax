<?php
use Status\Presenter;
use Status\Time;

/** @var list<Status\Model\DeploymentEvent> $deployments */
$rows = '';
foreach ($deployments as $deployment) {
    $rows .= '<tr><th scope="row">' . e($deployment->serviceId ?? 'unknown') . '</th><td>' . e($deployment->repoName ?? 'unknown')
        . '</td><td>' . e(Presenter::shortCommit($deployment->commitSha)) . '</td><td>' . e($deployment->environment)
        . '</td><td>' . e(Time::display($deployment->deployedAt)) . '</td><td>' . e($deployment->publicSummary) . '</td></tr>';
}
?>
<section class="section first-section">
  <div class="section-heading">
    <div>
      <p class="eyebrow">Release evidence</p>
      <h1>Deployments</h1>
    </div>
    <p class="timestamp"><?= count($deployments) ?> deployment records</p>
  </div>
  <?= $deployments === []
      ? Presenter::emptyState('No deployment records are stored yet.')
      : Presenter::table(['Service', 'Repo', 'Commit', 'Environment', 'Deployed', 'Summary'], $rows) ?>
</section>
