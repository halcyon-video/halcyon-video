// CONTROLS & HELP — the discoverable controls reference (UX pass 2026-08).
//
// Before this page, every input beyond arrows/OK/Back was folklore: P, /, F,
// the carry shortcuts, both HOLD gestures, the gamepad map, and the in-store
// moves (▲ past the top row, ▼ past the bottom row, ◀ at the register) were
// taught nowhere in the app. This page is the single reference, reachable from
// the settings index, the power menu, and the counter CRT.
//
// It renders as inert drawer rows — control on the left, what it does as the
// gold value, detail in the footer-bar hint — so the drawer's existing
// selection/paging machinery works untouched. Rows activate to nothing;
// they're a reference card, not knobs. main.ts routes HELP_ROW_PREFIX keys
// to a no-op in activateSetting and builds the page via buildControlsHelpPanel
// (same shape as the Store Brand panel's hooks).

export const HELP_ROW_PREFIX = '__help__:';

export interface ControlsHelpHooks {
  /** Add a row to the drawer's flat nav list; returns its selection index. */
  registerRow?: (key: string) => number;
  /** Move the drawer selection to a registered row (pointerenter parity). */
  selectRow?: (index: number) => void;
}

interface HelpRow {
  /** Stable slug for the row's DOM id. */
  id: string;
  /** The control (left column). */
  control: string;
  /** What it does (gold right column). */
  action: string;
  /** One footer-bar line of detail (≤62 chars reaches the bar untruncated). */
  hint: string;
}

interface HelpSection {
  title: string;
  rows: HelpRow[];
}

// Remote-truthful ordering (review §4.5): the remote's whole vocabulary first,
// then the in-store destinations it reaches, then the optional hardware.
const HELP_SECTIONS: HelpSection[] = [
  {
    title: 'The Remote — arrows, OK and Back run everything',
    rows: [
      {
        id: 'arrows', control: '◀ ▶ ▲ ▼', action: 'Browse the shelves',
        hint: 'Left/Right walk the aisle · Up/Down change shelf rows.',
      },
      {
        id: 'ok', control: 'OK', action: 'Pull a case / confirm',
        hint: 'Inspecting: OK plays or rents it. On the back: pick a name.',
      },
      {
        id: 'back', control: 'BACK', action: 'Step back out',
        hint: 'Case → shelf → store view → sections. Nothing is locked.',
      },
      {
        id: 'subnav', control: '◀ ▶ in the store view', action: 'Pick a section',
        hint: 'The marker walks the store left to right · OK flies you there.',
      },
      {
        id: 'subnavdisplays', control: '▼ in the store view', action: 'The displays',
        hint: 'Endcaps, promo stands and bins · ▶ steps them · BACK comes up.',
      },
      {
        id: 'tvpeek', control: '▲ in the store view', action: 'Ceiling TVs',
        hint: '◀ ▶ change what’s playing · OK jumps to its case · ▼ returns.',
      },
    ],
  },
  {
    title: 'At the counter',
    rows: [
      {
        id: 'counter', control: 'Store view → CHECKOUT', action: 'Walk to the register',
        hint: 'Back up to the store view, point at CHECKOUT, press OK.',
      },
      {
        id: 'terminal', control: '◀ at the register', action: 'Manager terminal',
        hint: 'The clerk’s CRT menu: settings, 2D mode, service, power.',
      },
      {
        id: 'clerkcounter', control: '▲ at the register', action: 'Talk to the clerk',
        hint: 'Ask what she recommends, search, or just chat. Esc ends it.',
      },
      {
        id: 'tipjar', control: '▶ at the register', action: 'Tip jar',
        hint: 'The tip card on the counter band, when the jar is out.',
      },
    ],
  },
  {
    title: 'Keyboard extras',
    rows: [
      {
        id: 'power', control: 'P', action: 'System menu',
        hint: 'The register CRT’s menu as a full-screen page.',
      },
      {
        id: 'search', control: '/', action: 'Search the catalog',
        hint: 'Type at the clerk’s terminal; Enter jumps to the match.',
      },
      {
        id: 'walk', control: 'F', action: 'Walk the store (WASD)',
        hint: 'First-person stroll. F again returns to the shelves.',
      },
      {
        id: 'carry', control: 'C · R · X', action: 'Carry shortcuts',
        hint: 'C check out carried tapes · R put one back · X not interested.',
      },
      {
        id: 'holds', control: 'Hold OK / hold ▼', action: 'Quick checkout / pass',
        hint: 'Keyboard & gamepad only — the remote taps instead.',
      },
    ],
  },
  {
    title: 'Gamepad',
    rows: [
      {
        id: 'padface', control: 'A · B · Y · Start', action: 'OK · Back · Search · Menu',
        hint: 'Standard pad mapping; d-pad and left stick both navigate.',
      },
      {
        id: 'padshoulder', control: 'RB · X · LB', action: 'Walk · Checkout · Put back',
        hint: 'Same jobs as keyboard F, C and R.',
      },
    ],
  },
];

/**
 * Build the Controls & Help reference into `container` (the page's
 * .settings-group element, after main.ts's Back row). Markup mirrors the
 * drawer's native rows so the page reads as one menu; every row registers
 * into the drawer's flat nav list so Up/Down (and the CRT paging) walk it.
 */
export function buildControlsHelpPanel(container: HTMLElement, hooks: ControlsHelpHooks = {}): void {
  for (const section of HELP_SECTIONS) {
    const titleEl = document.createElement('div');
    titleEl.className = 'settings-group-title';
    titleEl.textContent = section.title;
    container.appendChild(titleEl);

    for (const def of section.rows) {
      const key = HELP_ROW_PREFIX + def.id;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'settings-row';
      row.id = `setting-row-${key}`;
      row.dataset.hint = def.hint;
      row.innerHTML = `
        <span class="settings-row-main">
          <span class="settings-row-label">${def.control}</span>
        </span>
        <span class="settings-row-leader" aria-hidden="true"></span>
        <span class="settings-row-value">${def.action}</span>
      `;
      const index = hooks.registerRow ? hooks.registerRow(key) : -1;
      row.addEventListener('pointerenter', () => {
        if (index >= 0) hooks.selectRow?.(index);
      });
      container.appendChild(row);
    }
  }
}
