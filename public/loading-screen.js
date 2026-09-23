/* Deliberately plain JS: this paints before the application module graph loads. */
(() => {
  const overlay = document.getElementById('boot-overlay');
  const meter = document.getElementById('store-loading-progress');
  // Browser automatic darkening can turn a CSS white fill black. A single
  // white canvas pixel stays white; CSS still sizes it to measured progress.
  const fill = document.getElementById('store-loading-fill');
  const paint = fill.getContext('2d');
  if (paint) { paint.fillStyle = '#fff'; paint.fillRect(0, 0, 1, 1); }
  const status = document.getElementById('store-loading-status');
  const label = document.getElementById('store-loading-label');
  const base = new URL('.', document.currentScript.src);
  let value = 0, failed = false, timer, slide = 0, front = 0;
  const views = ['store-interior.webp', 'store-aisles.webp', 'store-exterior.webp'];
  const tips = [
    'Loading the mobile store. Visit on desktop for the full visual experience.',
    'Make it your own: self-host Halcyon with your Jellyfin or Plex media library.',
    'More than streaming: connect your games through RomM and browse them in the store.',
    'On your phone, drag the thumbstick to walk, swipe to look, and tap a case to examine it.'
  ];
  const images = [document.getElementById('store-loading-view-a'), document.getElementById('store-loading-view-b')];
  function update(next, detail) {
    if (failed) return;
    value = Math.max(value, Math.min(100, Number.isFinite(next) ? next : value));
    meter.setAttribute('aria-valuenow', String(Math.floor(value)));
    document.getElementById('store-loading-fill').style.width = value + '%';
    document.getElementById('store-loading-percent').textContent = Math.floor(value) + '%';
    if (detail) status.textContent = detail;
  }
  function stop() { clearTimeout(timer); timer = undefined; }
  function cycle() {
    if (!overlay.classList.contains('visible') || failed) return;
    slide++;
    document.getElementById('store-loading-tip').textContent = tips[slide % tips.length];
    const next = images[1 - front];
    next.onload = () => {
      if (!overlay.classList.contains('visible')) return;
      next.style.opacity = '1'; images[front].style.opacity = '0'; front = 1 - front;
    };
    next.src = new URL('loading/' + views[slide % views.length], base).href;
    timer = setTimeout(cycle, 4500);
  }
  function start() { stop(); timer = setTimeout(cycle, 3500); }
  window.halcyonLoading = {
    update,
    reset() {
      // Initial boot calls showBootOverlay after modules load: keep earned progress.
      if (value > 20 || failed) { value = 0; failed = false; label.innerHTML = 'LOADING <span id="store-loading-percent">0%</span>'; label.removeAttribute('role'); }
      update(value, 'Preparing your store'); start();
    },
    fail() { failed = true; stop(); label.textContent = 'Unable to start graphics. Close and reopen Halcyon to try again.'; label.setAttribute('role', 'alert'); }
  };
  // Known entry resources give a real download-completion metric before app code runs.
  const expected = new Set([...document.querySelectorAll('link[rel="modulepreload"], link[rel="stylesheet"], script[type="module"][src]')].map(e => e.href || e.src));
  const done = new Set();
  function resources(entries) {
    for (const e of entries) if (expected.has(e.name)) done.add(e.name);
    if (expected.size && value < 20) update(20 * done.size / expected.size, 'Downloading the store · ' + done.size + ' of ' + expected.size + ' files');
  }
  resources(performance.getEntriesByType('resource'));
  const observer = new PerformanceObserver(list => resources(list.getEntries()));
  observer.observe({type: 'resource', buffered: true});
  new MutationObserver(() => { if (!overlay.classList.contains('visible')) { stop(); observer.disconnect(); } }).observe(overlay, {attributes: true, attributeFilter: ['class']});
  start();
})();
