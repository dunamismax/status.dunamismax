// Optional light/dark toggle. Without JavaScript the page keeps the dark theme.
(function () {
  var b = document.querySelector('[data-theme-toggle]');
  if (!b) return;
  function sync() {
    var t = document.documentElement.getAttribute('data-theme') || 'dark';
    b.setAttribute('aria-pressed', t === 'light' ? 'true' : 'false');
    b.setAttribute('title', t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  }
  sync();
  b.addEventListener('click', function () {
    var c = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', c);
    try { localStorage.setItem('status-theme', c); } catch (e) {}
    sync();
  });
})();
