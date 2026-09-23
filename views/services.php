<?php
use Status\Time;

/** @var Status\Model\Snapshot $snapshot @var Status\Freshness $freshness */
$services = $snapshot->services;
?>
<section class="section first-section">
  <div class="section-heading">
    <div>
      <p class="eyebrow">Service-level status</p>
      <h1>Monitored services</h1>
    </div>
    <p class="timestamp">Last checked <?= $freshness->missing() ? 'never' : e(Time::display($snapshot->checkedAt)) ?></p>
  </div>
<?php require __DIR__ . '/partials/service-table.php'; ?>
</section>
