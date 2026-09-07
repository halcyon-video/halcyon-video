// The settings registry and input handlers have one presentation at a time:
// text on the desk CRT, or a full-height form when a visual editor is needed.
interface SettingsScene {
  enterSearchMode(): void;
  exitSearchMode(): void;
  setTerminalText(lines: string[] | null, cursorLine?: number): void;
}

export interface TerminalSettingRow { label: string; value: string; hint?: string }
const COLUMNS = 38;
const ROWS = 8;
const clip = (text: string, width: number) => text.length > width ? text.slice(0, width - 1) + '…' : text;

/** Keep every option reachable on the physical 40-column, 13-line tube. */
export function terminalSettingsLines(title: string, rows: TerminalSettingRow[], selected: number) {
  const page = Math.floor(selected / ROWS);
  const pages = Math.max(1, Math.ceil(rows.length / ROWS));
  const start = page * ROWS;
  const lines = [clip(title.toUpperCase(), 40), pages > 1 ? `OPTIONS ${start + 1}-${Math.min(start + ROWS, rows.length)} OF ${rows.length}` : ''];
  for (const [i, row] of rows.slice(start, start + ROWS).entries()) {
    const value = clip(row.value.toUpperCase(), 14);
    const labelWidth = value ? COLUMNS - value.length - 1 : COLUMNS;
    const label = clip(row.label.toUpperCase(), labelWidth);
    lines.push(`${start + i === selected ? '>' : ' '} ${value ? label.padEnd(labelWidth) + ' ' + value : label}`);
  }
  const row = rows[selected];
  if (row) {
    const fullValue = row.value ? `${row.label}: ${row.value}` : row.label;
    const detail = (row.hint && row.value.length <= 14 && fullValue.length <= COLUMNS ? row.hint : fullValue).toUpperCase();
    const split = detail.length > 40 ? detail.lastIndexOf(' ', 40) : detail.length;
    const end = split > 0 ? split : 40;
    lines.push('', detail.slice(0, end), clip(detail.slice(end).trimStart(), 40));
  }
  return { lines, cursorLine: 2 + selected - start };
}

export class SettingsSurface {
  private dock: SettingsScene | null = null;
  private fromTerminal = false;
  private page: string | null = null;
  private keys: string[] = [];
  private index = 0;

  constructor() {
    const overlay = document.getElementById('settings-drawer-overlay');
    for (const event of ['input', 'focusin', 'focusout']) {
      overlay?.addEventListener(event, () => this.render());
    }
    overlay?.addEventListener('keyup', (event) => {
      if (event.target instanceof HTMLInputElement) this.render();
    });
    document.getElementById('settings-groups')?.addEventListener('scroll', () => this.updateOverflow());
    window.addEventListener('resize', () => this.update(this.keys, this.index));
  }

  open(scene: SettingsScene | null, fromTerminal: boolean): void {
    this.dock = scene;
    this.fromTerminal = fromTerminal;
    if (scene && !fromTerminal) scene.enterSearchMode();
  }

  setPage(page: string | null): void {
    this.page = page;
    const overlay = document.getElementById('settings-drawer-overlay');
    overlay?.classList.toggle('terminal-settings', !!this.dock && page !== 'Store Brand');
    overlay?.classList.toggle('compact-settings', !this.dock && page !== 'Store Brand');
    overlay?.classList.toggle('visual-settings', page === 'Store Brand');
    overlay?.querySelector('.crt-body > .settings-brand-preview')?.remove();
  }

  /** Release the camera before the caller resumes the menu or rebuilds. */
  close(): boolean {
    this.dock?.exitSearchMode();
    this.dock = null;
    document.getElementById('settings-drawer-overlay')?.classList.remove('terminal-settings');
    return this.fromTerminal;
  }

  update(keys: string[], index: number): void {
    this.keys = keys;
    this.index = index;
    if (!document.getElementById('settings-drawer-overlay')?.classList.contains('visible')) return;
    // Keep the live image beside the scrolling controls so every edit can be
    // judged without returning to the top of the form.
    const groups = document.getElementById('settings-groups');
    const preview = groups?.querySelector('.settings-brand-preview');
    if (this.page === 'Store Brand' && preview) groups?.parentElement?.insertBefore(preview, groups);
    const row = this.row(index);
    // A continuous full-height list: scroll only when the selected option
    // actually leaves the viewport. No fixed row counts or mostly empty pages.
    if (!this.dock || this.page === 'Store Brand') row?.scrollIntoView({ block: 'nearest' });
    const hint = row?.dataset.hint || row?.querySelector('.settings-row-hint')?.textContent;
    const hintEl = document.getElementById('settings-footer-hint');
    if (hintEl) hintEl.textContent = hint || 'UP/DOWN SELECT • LEFT/RIGHT CHANGE • BACK RETURNS';
    this.updateOverflow();
    this.render();
  }

  private row(index: number): HTMLElement | null {
    const key = this.keys[index];
    return document.getElementById(key === '__close__' ? 'btn-settings-close' : `setting-row-${key}`);
  }

  private updateOverflow(): void {
    const groups = document.getElementById('settings-groups');
    const more = document.getElementById('settings-more-line');
    if (!groups || !more) return;
    const below = groups.scrollHeight - groups.clientHeight - groups.scrollTop > 2;
    more.textContent = below ? '▼ MORE OPTIONS BELOW' : groups.scrollTop > 2 ? '▲ MORE OPTIONS ABOVE' : '';
    const pageEl = document.getElementById('settings-footer-page');
    if (pageEl) pageEl.textContent = '';
  }

  private render(): void {
    if (!this.dock || this.page === 'Store Brand') return;
    const rows = this.keys.map((_key, i) => {
      const row = this.row(i);
      const input = row?.querySelector<HTMLInputElement>('input');
      return {
        label: (row?.querySelector('.settings-row-label')?.textContent || row?.textContent || '').trim(),
        value: input ? (input.type === 'password' ? '•'.repeat(input.value.length) : input.value) : (row?.querySelector('.settings-row-value')?.textContent || '').trim(),
        hint: row?.dataset.hint || row?.querySelector('.settings-row-hint')?.textContent || '',
      };
    });
    const title = document.querySelector('#settings-drawer-overlay .settings-title')?.textContent || 'Store Settings';
    const { lines, cursorLine } = terminalSettingsLines(title, rows, this.index);
    const status = document.getElementById('settings-status')?.textContent || '';
    const pending = status.includes('restart') ? 'RESTART ON CLOSE' : status.includes('update when') ? 'APPLIES ON CLOSE' : '';
    if (pending) lines[1] = clip([lines[1], pending].filter(Boolean).join(' • '), 40);
    const input = this.row(this.index)?.querySelector<HTMLInputElement>('input');
    if (input && document.activeElement === input) {
      const value = input.type === 'password' ? '•'.repeat(input.value.length) : input.value;
      const caret = input.selectionStart ?? value.length;
      lines.splice(0, lines.length, 'EDIT ' + clip(rows[this.index].label.toUpperCase(), 35), '',
        ...((value.slice(Math.max(0, caret - 160), caret) + '▏' + value.slice(caret, caret + 79)).match(/.{1,40}/g) || ['▏']),
        '', 'ENTER SAVES • ESC CANCELS');
    }
    this.dock.setTerminalText(lines, input && document.activeElement === input ? -1 : cursorLine);
  }
}
