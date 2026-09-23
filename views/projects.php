<?php
use Status\Presenter;

/** @var list<Status\Model\ProjectStatus> $projects */
?>
<section class="section first-section">
  <div class="section-heading">
    <div>
      <p class="eyebrow">Repository status</p>
      <h1>Projects</h1>
    </div>
    <p class="timestamp"><?= count($projects) ?> monitored repositories</p>
  </div>
  <div class="project-grid">
<?php foreach ($projects as $project):
    $git = $project->git;
    $remote = match ($git->remoteReachable) { true => 'reachable', false => 'unreachable', null => 'unknown' };
    $progress = $project->build === null
        ? 'BUILD progress unavailable'
        : "{$project->build->checked}/{$project->build->total} checked · " . ($project->build->nextPhase ?? 'No open phase found');
?>
    <article class="project-card">
      <div class="project-card-header">
        <h2><?= $project->publicUrl === null ? e($project->name) : '<a href="' . e($project->publicUrl) . '">' . e($project->name) . '</a>' ?></h2>
        <?= Presenter::state($project->state) ?>
      </div>
      <p><?= e($project->reason) ?></p>
      <dl>
        <div><dt>Branch</dt><dd><?= e($git->branch ?? 'unknown') ?></dd></div>
        <div><dt>Upstream</dt><dd><?= e($git->upstream ?? 'none') ?></dd></div>
        <div><dt>Ahead / behind</dt><dd><?= $git->ahead ?? 0 ?> / <?= $git->behind ?? 0 ?></dd></div>
        <div><dt>Worktree</dt><dd><?= Presenter::worktree($git->dirty) ?></dd></div>
        <div><dt>Latest commit</dt><dd><?= e($git->latestCommitAgeDays === null ? 'unknown' : $git->latestCommitAgeDays . ' days') ?></dd></div>
        <div><dt>Origin</dt><dd><?= $remote ?></dd></div>
        <div><dt>BUILD progress</dt><dd><?= e($progress) ?></dd></div>
      </dl>
    </article>
<?php endforeach; ?>
  </div>
</section>
