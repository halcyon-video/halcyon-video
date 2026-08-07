// The clerk's desk terminal rendered as a system-control menu — the diegetic
// twin of the #power-menu-overlay glass card. Both views drive the SAME
// power-button ids and dispatch through main.ts's executePowerMenuAction(), so
// they can't drift apart; only the presentation differs.
//
// This module is the part the 3D harness also needs (it boots StoreScene
// without main.ts's DOM shell), so the row text lives here as pure data +
// a pure formatter rather than inside main.ts.
import { brandString } from './brand-pack';

// Short labels for the CRT. drawTerminal() in entrance/index.ts hard-clips each
// line at 40 characters, and the "> " selection prefix eats two of them, so
// every label here must stay within 38.
export const COUNTER_TERMINAL_LABELS: Record<string, string> = {
  'btn-settings': 'STORE SETTINGS',
  'btn-controls': 'CONTROLS & HELP',
  'btn-flat-mode': 'SWITCH TO 2D MODE',
  'btn-suspend': 'SUSPEND SYSTEM (SLEEP)',
  'btn-cec-toggle': 'DISPLAY ON/OFF (CEC)',
  'btn-logout': 'CHANGE SERVER / LOG OUT',
  // Lazy: this object is built at module eval, long before the brand pack
  // has loaded, so the one branded row reads through a getter.
  get 'btn-exit'() { return brandString('terminal-exit-label', 'CLOSE HALCYON APP'); },
  // CRT-only row (not in the glass power menu): the diegetic door into the
  // SERVICE MODE settings page — the staff knobs hidden from the couch tree.
  'btn-service': 'MANAGER OVERRIDE (STAFF ONLY)',
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
