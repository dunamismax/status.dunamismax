<?php
use Status\Presenter;
use Status\Time;

/** @var list<Status\Model\ServiceStatus> $services */
?>
<div class="table-wrap">
  <table class="status-table">
    <thead>
      <tr>
        <th scope="col">Service</th>
        <th scope="col">State</th>
        <th scope="col">Latency</th>
        <th scope="col">Last checked</th>
        <th scope="col">Reason</th>
      </tr>
    </thead>
    <tbody>
<?php foreach ($services as $service): ?>
      <tr>
        <th scope="row"><?= Presenter::serviceName($service) ?><span><?= e($service->group) ?></span></th>
        <td><?= Presenter::state($service->state) ?></td>
        <td><?= e(Presenter::latency($service->latencyMs)) ?></td>
        <td><?= e(Time::display($service->checkedAt)) ?></td>
        <td><?= e($service->reason) ?></td>
      </tr>
<?php endforeach; ?>
    </tbody>
  </table>
</div>
