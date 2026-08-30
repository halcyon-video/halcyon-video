// The clerk's desk terminal rendered as a system-control menu — the diegetic
// twin of the #power-menu-overlay glass card. Both views drive the SAME
// power-button ids and dispatch through main.ts's executePowerMenuAction(), so
// they can't drift apart; only the presentation differs.
//
// This module is the part the 3D harness also needs (it boots StoreScene
// without main.ts's DOM shell), so the row text lives here as pure data +
// a pure formatter rather than inside main.ts.
// Brand seam: the one branded row (CLOSE <BRAND> APP) reads through a late-
// bound resolver instead of importing brand-pack, which drags DOM-flavored
// modules behind it and would break this file's node-testability — the whole
// reason the row text lives here (see header). brand-pack.ts installs the
// real brandString at its module eval (it is loaded before any CRT draws);
// until then, and in node tests, the fallback literal is the answer — which
// is exactly brandString's own behavior with no pack loaded.
type BrandStringResolver = (key: string, fallback: string) => string;
let brandStringResolver: BrandStringResolver = (_key, fallback) => fallback;
export function setBrandStringResolver(fn: BrandStringResolver): void {
  brandStringResolver = fn;
}

export const PROJECT_PAGE_BUTTON_ID = 'btn-project';
export const PROJECT_PAGE_URL = 'https://github.com/halcyon-video/halcyon-video';

// Short labels for the CRT. drawTerminal() in entrance/index.ts hard-clips each
// line at 40 characters, and the "> " selection prefix eats two of them, so
// every label here must stay within 38.
export const COUNTER_TERMINAL_LABELS: Record<string, string> = {
  'btn-settings': 'STORE SETTINGS',
  'btn-controls': 'CONTROLS & HELP',
  'btn-flat-mode': 'SWITCH TO 2D MODE',
  'btn-suspend': 'SUSPEND SYSTEM (SLEEP)',
  'btn-cec-toggle': 'DISPLAY ON/OFF (CEC)',
  // Standing route for the demo (#133): invites visitor to run their own store.
  'btn-project': 'RUN ON YOUR OWN SERVER (GITHUB)',
  'btn-logout': 'CHANGE SERVER / LOG OUT',
  // Lazy: this object is built at module eval, long before the brand pack
  // has loaded, so the one branded row reads through a getter.
  get 'btn-exit'() { return brandStringResolver('terminal-exit-label', 'CLOSE HALCYON APP'); },
  // CRT-only row (#96): the way back into the streaming-services picker the
  // opening-day terminal offers once and only once. A store that connected
  // its media server before that shipped never saw it, so this is the only
  // remote-driven route to the choice — the settings drawer's row is a typed
  // comma list, which is not a thing anyone does from a couch.
  'btn-streaming': 'STREAMING SERVICES (PICK APPS)',
  // CRT-only row (not in the glass power menu): the diegetic door into the
  // SERVICE MODE settings page — the staff knobs hidden from the couch tree.
  'btn-service': 'MANAGER OVERRIDE (STAFF ONLY)',
  // CRT-only row (#42): opens the BIOS-style date sub-screen that pins the
  // catalog to a rolling point in time (counter-terminal-flow.ts).
  'btn-media-date': 'MEDIA RELEASE DATE (PIN CATALOG)',
  'btn-cancel': 'RETURN TO STORE',
};

// Body lines the header sits above (drawTerminal draws its own
// "<BRAND> RENTAL SYSTEM" banner), plus where to park the blinking cursor.
// `ids` is the caller's live button list so demo mode's shorter ring renders
// correctly without this module knowing about demo mode.
export function counterTerminalLines(ids: string[], selectedIndex: number): {
  lines: string[];
  cursorLine: number;
} {
  const lines = ['MANAGER TERMINAL — SYSTEM CONTROL', ''];
  ids.forEach((id, idx) => {
    lines.push(`${idx === selectedIndex ? '>' : ' '} ${COUNTER_TERMINAL_LABELS[id] ?? id}`);
  });
  // Two header rows precede the options, so the cursor tracks the selection.
  return { lines, cursorLine: 2 + selectedIndex };
}

// #77: drawTerminal (entrance/index.ts) seats the body between the title bar
// and the pinned footer — ~10 rows at the default 1.24 leading — and the
// manager menu's full ring is 12 rows. Its old maxLines slice() dropped the
// overflow silently, so MANAGER OVERRIDE and RETURN TO STORE simply never
// rendered. This picks the row pitch instead: the default when everything
// fits, else tightened toward 1.0 leading (fontPx — authentic text-mode
// density) so the whole list seats before anything is clipped. maxLines
// still comes back for the caller's loud-clip path (a list too long even at
// the floor pitch). Pure math so the node tests can pin the real 1024x768
// geometry against the real ring lengths.
export function fitTerminalPitch(
  lineCount: number,
  defaultLineH: number,
  fontPx: number,
  bodySpan: number,
): { lineH: number; maxLines: number } {
  let lineH = defaultLineH;
  if ((lineCount + 0.4) * lineH > bodySpan) {
    lineH = Math.max(fontPx, Math.floor(bodySpan / (lineCount + 0.4)));
  }
  const maxLines = Math.max(1, Math.floor(bodySpan / lineH - 0.4));
  return { lineH, maxLines };
}

// #60: the poster-layer budget (two DataArrayTexture banks — see
// poster-textures.ts's POSTER_BANKS note) is a hard driver ceiling. A catalog
// past it used to shelve titles with no cover art and no explanation — the
// only signal was a console.warn nobody reads. This is the plain-language
// version, for the idle CRT screen (entrance/index.ts's drawTerminal): a
// pure formatter, like counterTerminalLines above, so it stays testable and
// the harness can render it without booting main.ts. Returns [] when there
// is no shortfall — a diagnostic that shows a scary number on every healthy
// install is worse than the silence it replaced, so the caller should only
// splice this in when it's non-empty.
export function posterShortfallLines(shortfall: number, layerBudget: number): string[] {
  if (shortfall <= 0) return [];
  return [
    `NOTICE: ${shortfall} TITLES HAVE NO COVER ART`,
    `(YOUR GPU CAPS COVERS AT ${layerBudget} TITLES)`,
  ];
}
