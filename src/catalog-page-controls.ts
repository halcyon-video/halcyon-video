import { catalogPage, findCatalogTitle } from './catalog-pages';
import type { JellyfinLibrary } from './jellyfin';

let currentPage = 0;
let controls: HTMLElement | null = null;
let busy = false;

/** One global pager survives scene replacement; no per-title DOM is allocated. */
export function prepareCatalogPage(libraries: JellyfinLibrary[],
  navigate: (title?: string) => Promise<void>) {
  const result = catalogPage(libraries, currentPage);
  currentPage = result.page;
  controls?.remove();
  controls = null;
  if (result.pages === 1) return result;
  const panel = document.createElement('form');
  panel.setAttribute('aria-label', 'Catalog pages');
  panel.style.cssText = 'position:fixed;bottom:12px;left:50%;transform:translateX(-50%);z-index:100;display:flex;flex-wrap:wrap;justify-content:center;gap:6px;padding:8px;background:#101827;color:white;border-radius:8px;max-width:95vw;width:max-content;font:14px sans-serif';
  const status = document.createElement('span');
  status.setAttribute('role', 'status');
  status.textContent = `Catalog ${result.page + 1} / ${result.pages} · ${result.total.toLocaleString()} titles`;
  const input = document.createElement('input');
  input.type = 'search'; input.placeholder = 'Find in entire catalog';
  input.setAttribute('aria-label', 'Find in entire catalog');
  input.style.cssText = 'width:180px;font-size:16px';
  async function go(page: number, title?: string) {
    if (busy) return;
    busy = true;
    currentPage = page;
    panel.querySelectorAll('button,input').forEach(el => (el as HTMLButtonElement).disabled = true);
    try { await navigate(title); }
    catch (error) { status.textContent = `Unable to open page: ${String(error)}`; }
    finally {
      busy = false;
      panel.querySelectorAll('button,input').forEach(el => (el as HTMLButtonElement).disabled = false);
    }
  }
  const button = (label: string, action: () => void, disabled = false) => {
    const el = document.createElement('button');
    el.type = 'button'; el.textContent = label; el.disabled = disabled;
    el.onclick = action; return el;
  };
  panel.append(button('Previous', () => void go(result.page - 1), result.page === 0), status,
    button('Next', () => void go(result.page + 1), result.page === result.pages - 1), input);
  const find = document.createElement('button'); find.type = 'submit'; find.textContent = 'Find';
  panel.append(find);
  let searchGeneration = 0;
  panel.onsubmit = async event => {
    event.preventDefault();
    const generation = ++searchGeneration;
    const match = await findCatalogTitle(libraries, input.value);
    if (generation !== searchGeneration || !panel.isConnected) return;
    if (match) void go(match.page, match.movie.id);
    else status.textContent = 'No matching title';
  };
  // Keep store hotkeys from consuming typing or button activation.
  panel.addEventListener('keydown', event => event.stopPropagation());
  document.body.append(panel);
  controls = panel;
  return result;
}

export function hideCatalogPages() { controls?.remove(); controls = null; }
