// Runs before first paint so the saved or preferred theme applies without a flash.
(function () {
  try {
    var s = localStorage.getItem('status-theme');
    if (s !== 'light' && s !== 'dark') {
      s = (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
    }
    document.documentElement.setAttribute('data-theme', s);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
