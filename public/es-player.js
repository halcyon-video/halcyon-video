// EmulatorJS host page for EmulationStation rentals (src/es-player.ts). Bundled
// as a same-origin file so the Tauri CSP needs no inline script. The parent
// hands over the picked ROM File as a global (EmulatorJS keeps its name, which
// is how it knows the ROM's type); the core comes in the query string.
(function () {
  var DATA = 'https://cdn.emulatorjs.org/stable/data/';
  var f = parent.__halcyonEsRom;
  if (!f) { parent.postMessage('es-player-failed', '*'); return; }
  window.EJS_player = '#game';
  window.EJS_core = new URLSearchParams(location.search).get('core') || '';
  window.EJS_pathtodata = DATA;
  window.EJS_gameUrl = new File([f], f.name);
  window.EJS_startOnLoaded = true;
  window.EJS_color = '#ffa903';
  var s = document.createElement('script');
  s.src = DATA + 'loader.js';
  s.onerror = function () { parent.postMessage('es-player-failed', '*'); };
  document.body.appendChild(s);
})();
