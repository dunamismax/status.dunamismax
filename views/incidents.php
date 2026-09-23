<?php
use Status\Presenter;
use Status\Time;

/** @var list<Status\Model\IncidentRecord> $incidents @var list<Status\Model\MaintenanceWindow> $maintenance */
$incidentRows = '';
foreach ($incidents as $incident) {
    $incidentRows .= '<tr><th scope="row">' . e($incident->title) . '</th><td>' . e($incident->state) . '</td><td>'
        . e(implode(', ', $incident->affectedTargets)) . '</td><td>' . e(Time::display($incident->startedAt)) . '</td><td>'
        . e($incident->resolvedAt === null ? 'open' : Time::display($incident->resolvedAt)) . '</td><td>'
        . e($incident->publicNotes) . '</td></tr>';
}
$maintenanceRows = '';
foreach ($maintenance as $window) {
    $maintenanceRows .= '<tr><th scope="row">' . e($window->title) . '</th><td>' . e($window->state) . '</td><td>'
        . e(implode(', ', $window->affectedTargets)) . '</td><td>' . e(Time::display($window->startsAt)) . '</td><td>'
        . e(Time::display($window->endsAt)) . '</td><td>' . e($window->publicNotes) . '</td></tr>';
}
?>
<section class="section first-section">
  <div class="section-heading">
    <div>
      <p class="eyebrow">Operational context</p>
      <h1>Incidents</h1>
    </div>
    <p class="timestamp"><?= count($incidents) ?> incident records</p>
  </div>
  <?= $incidents === []
      ? Presenter::emptyState('No incident records are stored yet.')
      : Presenter::table(['Incident', 'State', 'Affected', 'Started', 'Resolved', 'Notes'], $incidentRows) ?>
</section>
<section class="section">
  <div class="section-heading">
    <h2>Maintenance</h2>
    <p class="timestamp"><?= count($maintenance) ?> recent or upcoming windows</p>
  </div>
  <?= $maintenance === []
      ? Presenter::emptyState('No maintenance windows are stored yet.')
      : Presenter::table(['Window', 'State', 'Affected', 'Starts', 'Ends', 'Notes'], $maintenanceRows) ?>
</section>
