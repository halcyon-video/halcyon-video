import { getSetting, setSetting } from './settings';
import { loadMediaReleasePin, saveMediaReleasePin } from './media-release-date';
import { THEMES, resolveThemeId, getActiveTheme, applyThemeCssVars } from './themes';

let pending: Promise<string> | null = null;

/** One choice per mobile visit. Catalog, fonts and scene modules load behind it;
 * construction of the era-dependent room waits at initializeStoreScene. */
export function beginMobileEraChoice(): void {
  if (pending) return;
  const dialog = document.createElement('dialog');
  dialog.id = 'mobile-era-choice';
  dialog.setAttribute('aria-labelledby', 'mobile-era-title');
  const style = document.createElement('style');
  style.textContent = `
    #mobile-era-choice { box-sizing:border-box; width:min(92vw,420px); max-height:90dvh;
      overflow:auto; margin:auto; padding:28px 22px; color:#fff8e6;
      background:var(--bb-primary,#172b56); border:2px solid var(--bb-secondary,#efc34e);
      box-shadow:0 8px 32px #0008; font-family:Arial,sans-serif; }
    #mobile-era-choice::backdrop { background:#080b12ed; }
    #mobile-era-choice h1 { margin:0 0 12px; font-size:30px; text-transform:uppercase;
      text-shadow:0 2px 0 #111; }
    #mobile-era-choice p { font-size:16px; line-height:1.5; margin:0 0 24px; }
    #mobile-era-choice label { display:block; font-size:16px; margin-bottom:8px; }
    #mobile-era-choice select, #mobile-era-choice button { box-sizing:border-box;
      width:100%; min-height:52px; font:700 20px Arial,sans-serif; border-radius:0; }
    #mobile-era-choice select { padding:10px; background:#fff8e6; color:#182545; }
    #mobile-era-choice button { margin-top:24px; padding:12px;
      background:var(--bb-secondary,#efc34e); color:#17213a; border:2px outset #ffe6a0;
      text-transform:uppercase; cursor:pointer; }
    #mobile-era-choice :focus-visible { outline:3px solid white; outline-offset:4px; }
  `;
  const heading = document.createElement('h1'); heading.id = 'mobile-era-title'; heading.textContent = 'Choose your year';
  const intro = document.createElement('p'); intro.textContent = 'Step into your favorite era of Halcyon Video.';
  const label = document.createElement('label'); label.htmlFor = 'mobile-era-year'; label.textContent = 'Store year';
  const select = document.createElement('select'); select.id = 'mobile-era-year';
  for (const theme of Object.values(THEMES)) {
    const year = /^bb-(\d{4})$/.exec(theme.id)?.[1];
    if (year) select.add(new Option(year, theme.id));
  }
  select.value = resolveThemeId(getSetting<string>('bb_theme'));
  if (!select.value) select.selectedIndex = 0;
  const enter = document.createElement('button'); enter.type = 'button'; enter.textContent = 'Enter the store';
  dialog.append(style, heading, intro, label, select, enter);
  // Keep underlying boot-skip / store keyboard handlers out of this choice.
  for (const event of ['click','keydown','pointerdown','pointerup']) dialog.addEventListener(event, e => e.stopPropagation());
  dialog.addEventListener('cancel', e => e.preventDefault());
  pending = new Promise(resolve => enter.addEventListener('click', () => {
    if (!THEMES[select.value]) return;
    dialog.close(); dialog.remove(); resolve(select.value);
  }, { once:true }));
  document.body.append(dialog); dialog.showModal(); select.focus();
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
