import { getSetting, setSetting } from './settings';
import { loadMediaReleasePin, saveMediaReleasePin } from './media-release-date';
import { THEMES, resolveThemeId, getActiveTheme, applyThemeCssVars } from './themes';

let pending: Promise<string> | null = null;

/** Keep touch taps reliable after a swipe while retaining native keyboard clicks. */
function activateButton(button: HTMLButtonElement, action: () => void): void {
  let start: { id: number; x: number; y: number } | null = null;
  let touchActivatedAt = -Infinity;
  // Touch activation is explicit; suppress the browser's later compatibility click.
  button.addEventListener('touchstart', event => event.preventDefault(), { passive:false });
  button.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' && event.isPrimary) start = { id:event.pointerId, x:event.clientX, y:event.clientY };
  });
  button.addEventListener('pointercancel', () => { start = null; });
  button.addEventListener('pointerup', event => {
    const tap = start; start = null;
    if (!tap || tap.id !== event.pointerId || Math.hypot(event.clientX-tap.x, event.clientY-tap.y) > 12 || button.disabled) return;
    touchActivatedAt = performance.now(); button.click();
  });
  button.addEventListener('click', event => {
    // A browser may also synthesize a compatibility click after the touch tap.
    if (event.detail > 0 && performance.now() - touchActivatedAt < 500) return;
    action();
  });
}

/** One choice per mobile visit. Catalog, fonts and scene modules load behind it;
 * construction of the era-dependent room waits at initializeStoreScene. */
export function beginMobileEraChoice(): void {
  if (pending) return;
  applyThemeCssVars(getActiveTheme());
  const dialog = document.createElement('dialog');
  dialog.id = 'mobile-era-choice';
  dialog.setAttribute('aria-labelledby', 'mobile-era-title');
  const years = Object.values(THEMES).flatMap(theme => {
    const year = /^bb-(\d{4})$/.exec(theme.id)?.[1];
    return year ? [{ id: theme.id, year, medium: theme.defaultMedium.toUpperCase() }] : [];
  }).sort((a, b) => Number(a.year) - Number(b.year));
  let index = Math.max(0, years.findIndex(year => year.id === resolveThemeId(getSetting<string>('bb_theme'))));
  const header = document.createElement('header'); header.className = 'mobile-era-heading';
  const heading = document.createElement('h1'); heading.id = 'mobile-era-title'; heading.setAttribute('aria-label', 'Choose your store year');
  const titleLine = document.createElement('span'); titleLine.className = 'mobile-era-fit'; titleLine.textContent = 'CHOOSE YOUR'; heading.append(titleLine);
  header.append(heading);
  const body = document.createElement('div'); body.className = 'mobile-era-body';
  const intro = document.createElement('p'); intro.className = 'mobile-era-intro'; const storeLine = document.createElement('span'); storeLine.className = 'mobile-era-fit'; storeLine.textContent = 'STORE YEAR'; intro.append(storeLine); intro.setAttribute('aria-hidden', 'true');
  const carousel = document.createElement('div'); carousel.className = 'mobile-era-carousel'; carousel.tabIndex = 0;
  carousel.setAttribute('role', 'group'); carousel.setAttribute('aria-roledescription', 'carousel');
  carousel.setAttribute('aria-label', 'Store year'); carousel.setAttribute('aria-describedby', 'mobile-era-hint');
  const makeStep = (direction: -1 | 1) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'mobile-era-step';
    button.dataset.direction = String(direction);
    const chevron = document.createElement('span'); chevron.className = 'mobile-era-chevron'; chevron.textContent = direction < 0 ? '‹' : '›'; chevron.setAttribute('aria-hidden', 'true');
    const neighbor = document.createElement('span'); neighbor.className = 'mobile-era-neighbor'; neighbor.setAttribute('aria-hidden', 'true');
    button.append(chevron, neighbor); activateButton(button, () => move(direction));
    return button;
  };
  const previous = makeStep(-1); const next = makeStep(1);
  const current = document.createElement('div'); current.className = 'mobile-era-current'; current.setAttribute('aria-live', 'polite'); current.setAttribute('aria-atomic', 'true');
  const year = document.createElement('span'); year.id = 'mobile-era-year';
  current.append(year); carousel.append(previous, current, next);
  const hint = document.createElement('p'); hint.id = 'mobile-era-hint'; hint.className = 'mobile-era-hint'; hint.textContent = 'Swipe or use the arrows to explore the years.';
  const enter = document.createElement('button'); enter.type = 'button'; enter.className = 'mobile-era-enter';
  const render = () => {
    const selected = years[index]; year.textContent = selected.year; hint.textContent = `${selected.medium} store · Swipe or use the arrows`;
    enter.textContent = 'ENTER STORE'; enter.setAttribute('aria-label', `Enter the ${selected.year} store`);
    for (const [button, offset] of [[previous, -1], [next, 1]] as const) {
      const neighbor = years[index + offset]; button.disabled = !neighbor;
      button.setAttribute('aria-label', neighbor ? `Choose ${neighbor.year}` : offset < 0 ? 'First year' : 'Last year');
      button.querySelector('.mobile-era-neighbor')!.textContent = neighbor?.year ?? '—';
    }
  };
  const move = (direction: number) => { index = Math.max(0, Math.min(years.length - 1, index + direction)); render(); };
  carousel.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1); }
    else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); index = event.key === 'Home' ? 0 : years.length - 1; render(); }
    else if (event.key === 'Enter' && event.target === carousel) { event.preventDefault(); enter.click(); }
  });
  let swipeStart: { id: number; x: number; y: number } | null = null;
  carousel.addEventListener('pointerdown', event => {
    if ((event.target as Element).closest('button') || !event.isPrimary) return;
    swipeStart = { id: event.pointerId, x: event.clientX, y: event.clientY }; carousel.setPointerCapture(event.pointerId);
  });
  carousel.addEventListener('pointerup', event => {
    if (!swipeStart || swipeStart.id !== event.pointerId) return;
    const dx = event.clientX - swipeStart.x; const dy = event.clientY - swipeStart.y; swipeStart = null;
    if (carousel.hasPointerCapture(event.pointerId)) carousel.releasePointerCapture(event.pointerId);
    if (Math.abs(dx) >= 35 && Math.abs(dx) > Math.abs(dy) * 1.25) move(dx < 0 ? 1 : -1);
  });
  carousel.addEventListener('pointercancel', () => { swipeStart = null; });
  render(); body.append(intro, carousel, hint); dialog.append(header, body, enter);
  // Keep underlying boot-skip / store keyboard handlers out of this choice.
  for (const event of ['click','keydown','pointerdown','pointerup']) dialog.addEventListener(event, e => e.stopPropagation());
  dialog.addEventListener('cancel', e => e.preventDefault());
  pending = new Promise(resolve => activateButton(enter, () => {
    if (!dialog.isConnected) return;
    dialog.close(); dialog.remove(); resolve(years[index].id);
  }));
  document.body.append(dialog); dialog.showModal();
  const fitLines = () => {
    for (const line of [titleLine, storeLine]) {
      line.style.fontSize = '';
      const naturalWidth = line.getBoundingClientRect().width;
      const available = line.parentElement!.clientWidth;
      if (naturalWidth > 0) line.style.fontSize = `${Math.min(window.innerHeight <= 520 ? 48 : 120, parseFloat(getComputedStyle(line).fontSize) * available / naturalWidth)}px`;
    }
  };
  const observer = new ResizeObserver(fitLines); observer.observe(dialog);
  void document.fonts.ready.then(() => { if (dialog.isConnected) fitLines(); });
  enter.addEventListener('click', () => observer.disconnect(), { once:true });
  fitLines(); carousel.focus();
}

/** Consume once so later settings changes and rebuilds retain their own era. */
export async function finishMobileEraChoice(): Promise<void> {
  if (!pending) return;
  const choice = pending;
  const era = await choice;
  if (pending !== choice) return;
  setSetting('bb_theme', era);
  applyThemeCssVars(getActiveTheme());
  // A deliberate year choice must not be overwritten by an old date-follow pin.
  const pin = loadMediaReleasePin();
  if (pin?.matchEra) saveMediaReleasePin({ ...pin, matchEra:false });
  if (getSetting<string>('bb_render_mode') !== 'flat') {
    // Scene/code preloads may have initialized cases for the previous era.
    const { initCaseMedium, refreshPosterCrop } = await import('./video-case');
    initCaseMedium(); refreshPosterCrop();
  }
  pending = null;
}
