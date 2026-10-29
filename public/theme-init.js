(function () {
  try {
    var raw = localStorage.getItem('tifa.preferences');
    var prefs = raw ? JSON.parse(raw).state || {} : {};
    var theme = prefs.theme || 'system';
    var dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var root = document.documentElement;
    root.dataset.theme = dark ? 'dark' : 'light';
    if (prefs.density) root.dataset.density = prefs.density;
    if (prefs.reduceMotion) root.dataset.motion = 'reduced';
  } catch (e) {
    document.documentElement.dataset.theme = 'light';
  }
})();
