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
    #mobile-era-choice {
      box-sizing: border-box; width: min(92vw, 440px); max-height: 90dvh;
      overflow: auto; margin: auto; padding: 28px 24px 26px; color: #fff8e6;
      background: var(--bb-primary, #172b56);
      border: 4px solid var(--bb-secondary, #efc34e);
      border-radius: 0;
      box-shadow: 0 0 0 2px #000, 0 16px 40px rgba(0, 0, 0, 0.85);
      font-family: var(--font-title, 'Bebas Neue', Arial, sans-serif);
    }
    #mobile-era-choice::backdrop {
      background: rgba(4, 7, 14, 0.92);
      backdrop-filter: blur(4px);
    }
    #mobile-era-choice h1 {
      margin: 0 0 8px; font-family: var(--font-title, 'Bebas Neue', Arial, sans-serif);
      font-size: clamp(34px, 8vw, 44px); line-height: 1; letter-spacing: 0.08em;
      text-transform: uppercase; color: #fff;
      text-shadow: 0 2px 0 #000, 0 4px 10px rgba(0, 0, 0, 0.7);
    }
    #mobile-era-choice p {
      font-family: var(--font-body, 'Outfit', Arial, sans-serif);
      font-size: clamp(15px, 3.8vw, 17px); line-height: 1.45;
      margin: 0 0 22px; color: #f2e9d2;
      text-shadow: 0 1px 2px #000;
    }
    #mobile-era-choice label {
      display: block; font-family: var(--font-title, 'Bebas Neue', Arial, sans-serif);
      font-size: 20px; letter-spacing: 0.12em; text-transform: uppercase;
      margin-bottom: 8px; color: var(--bb-secondary, #efc34e);
      text-shadow: 0 1px 2px #000;
    }
    .mobile-era-select-wrap {
      position: relative; width: 100%; box-sizing: border-box;
    }
    #mobile-era-choice select {
      box-sizing: border-box; width: 100%; min-height: 64px;
      padding: 10px 48px 10px 18px;
      font-family: var(--font-title, 'Bebas Neue', Arial, sans-serif);
      font-size: 32px; font-weight: 700; letter-spacing: 0.08em;
      line-height: 1; border-radius: 0;
      border: 3px solid var(--bb-secondary, #efc34e);
      background: #0d162a; color: #fff;
      box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.8);
      cursor: pointer; appearance: none; -webkit-appearance: none;
    }
    .mobile-era-select-arrow {
      position: absolute; right: 16px; top: 50%; transform: translateY(-50%);
      pointer-events: none; width: 0; height: 0;
      border-left: 9px solid transparent; border-right: 9px solid transparent;
      border-top: 11px solid var(--bb-secondary, #efc34e);
    }
    #mobile-era-choice select option {
      background: #0d162a; color: #fff;
      font-family: var(--font-title, 'Bebas Neue', Arial, sans-serif);
      font-size: 26px; padding: 10px;
    }
    #mobile-era-choice button {
      box-sizing: border-box; width: 100%; min-height: 54px;
      margin-top: 24px; padding: 12px 18px;
      font-family: var(--font-title, 'Bebas Neue', Arial, sans-serif);
      font-size: 24px; font-weight: 700; letter-spacing: 0.12em;
      text-transform: uppercase; border-radius: 0;
      background: var(--bb-secondary, #efc34e); color: #0a1120;
      border: 3px solid #fff;
      box-shadow: 0 4px 0 #9f7d20, 0 6px 16px rgba(0, 0, 0, 0.6);
      cursor: pointer; transition: transform 0.08s ease, box-shadow 0.08s ease;
    }
    #mobile-era-choice button:active {
      transform: translateY(2px);
      box-shadow: 0 2px 0 #9f7d20, 0 3px 8px rgba(0, 0, 0, 0.6);
    }
    #mobile-era-choice select:focus-visible,
    #mobile-era-choice button:focus-visible {
      outline: 3px solid #fff; outline-offset: 3px;
    }
  `;
  const heading = document.createElement('h1'); heading.id = 'mobile-era-title'; heading.textContent = 'Choose your year';
  const intro = document.createElement('p'); intro.textContent = 'Step into your favorite era of Halcyon Video.';
  const label = document.createElement('label'); label.htmlFor = 'mobile-era-year'; label.textContent = 'Store year';
  const wrap = document.createElement('div'); wrap.className = 'mobile-era-select-wrap';
  const select = document.createElement('select'); select.id = 'mobile-era-year';
  const arrow = document.createElement('span'); arrow.className = 'mobile-era-select-arrow'; arrow.setAttribute('aria-hidden', 'true');
  for (const theme of Object.values(THEMES)) {
    const year = /^bb-(\d{4})$/.exec(theme.id)?.[1];
    if (year) select.add(new Option(year, theme.id));
  }
  select.value = resolveThemeId(getSetting<string>('bb_theme'));
  if (!select.value) select.selectedIndex = 0;
  wrap.append(select, arrow);
  const enter = document.createElement('button'); enter.type = 'button'; enter.textContent = 'Enter the store';
  dialog.append(style, heading, intro, label, wrap, enter);
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
