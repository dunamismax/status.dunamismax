<?php
use Status\Model\State;
use Status\Presenter;
use Status\Time;

/** @var Status\Model\Snapshot $snapshot @var Status\Freshness $freshness */
$stale = $freshness->stale && !$freshness->missing();
$bandState = $stale ? State::Unknown : $snapshot->overallState;
$attention = Presenter::attention($snapshot);
?>
<section class="status-band is-<?= $bandState->value ?>">
  <div>
    <p class="eyebrow">Self-hosted ecosystem status</p>
<?php if ($stale): ?>
    <h1>Status data is stale</h1>
    <p class="lede">The last snapshot, <?= e($freshness->ageMinutes) ?> minutes old, reported: <?= e(Presenter::headline($snapshot->overallState)) ?>. Current status is unknown until the collector reports again.</p>
<?php elseif ($freshness->missing()): ?>
    <h1><?= e(Presenter::headline(State::Unknown)) ?></h1>
    <p class="lede">No collector snapshot has been recorded yet.</p>
<?php else: ?>
    <h1><?= e(Presenter::headline($snapshot->overallState)) ?></h1>
    <p class="lede"><?= e(Presenter::lede($snapshot)) ?></p>
<?php endif; ?>
    <dl class="status-meta" aria-label="Snapshot metadata">
      <div><dt>Last checked</dt><dd><?= $freshness->missing() ? 'never' : e(Time::display($snapshot->checkedAt)) ?></dd></div>
      <div><dt>Checks</dt><dd><?= count($snapshot->services) ?></dd></div>
      <div><dt>Attention</dt><dd><?= $snapshot->attentionCount() ?></dd></div>
    </dl>
  </div>
  <dl class="summary" aria-label="Status summary">
    <div><dt>Operational</dt><dd><?= $snapshot->summary['operational'] ?></dd></div>
    <div><dt>Degraded</dt><dd><?= $snapshot->summary['degraded'] ?></dd></div>
    <div><dt>Down</dt><dd><?= $snapshot->summary['down'] ?></dd></div>
    <div><dt>Maintenance</dt><dd><?= $snapshot->summary['maintenance'] ?></dd></div>
    <div><dt>Unknown</dt><dd><?= $snapshot->summary['unknown'] ?></dd></div>
  </dl>
</section>
<section class="overview-grid" aria-label="Status detail">
<?php if ($attention === []): ?>
  <article class="overview-panel">
    <div class="section-heading compact">
      <h2>Attention</h2>
      <?= Presenter::state(State::Operational, 'clear') ?>
    </div>
    <p class="panel-note">No monitored checks currently need attention.</p>
  </article>
<?php else: ?>
  <article class="overview-panel">
    <div class="section-heading compact">
      <h2>Attention</h2>
      <a href="/services">View all</a>
    </div>
    <ul class="attention-list">
<?php foreach ($attention as $service): ?>
      <li>
        <?= Presenter::state($service->state) ?>
        <strong><?= e($service->name) ?></strong>
        <span><?= e($service->reason) ?></span>
      </li>
<?php endforeach; ?>
    </ul>
  </article>
<?php endif; ?>
  <article class="overview-panel">
    <div class="section-heading compact">
      <h2>Groups</h2>
      <a href="/projects">Projects</a>
    </div>
    <ul class="group-list">
<?php foreach (Presenter::groupStates($snapshot) as $group => $state): ?>
      <li><span><?= e($group) ?></span><?= Presenter::state($state) ?></li>
<?php endforeach; ?>
    </ul>
  </article>
</section>
<section class="section">
  <div class="section-heading">
    <h2>Monitored services by category</h2>
    <a href="/services">Service details</a>
  </div>
  <div class="service-section-grid">
<?php foreach (Presenter::serviceSections($snapshot->services) as $group => $services): ?>
    <section class="service-category" aria-label="<?= e($group) ?>">
      <div class="service-category-heading">
        <div>
          <h3><?= e($group) ?></h3>
          <p><?= count($services) ?> checks</p>
        </div>
        <?= Presenter::state(Presenter::worst($services)) ?>
      </div>
      <div class="service-card-grid">
<?php foreach ($services as $service): ?>
        <article class="service-card">
          <div class="service-card-title">
            <h4><?= Presenter::serviceName($service) ?></h4>
            <?= Presenter::state($service->state) ?>
          </div>
          <p><?= e($service->reason) ?></p>
          <dl>
            <div><dt>Latency</dt><dd><?= e(Presenter::latency($service->latencyMs)) ?></dd></div>
            <div><dt>Checked</dt><dd><?= e(Time::display($service->checkedAt)) ?></dd></div>
          </dl>
        </article>
<?php endforeach; ?>
      </div>
    </section>
<?php endforeach; ?>
  </div>
</section>
