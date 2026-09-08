import './light-store.css';
import { LightStoreScene } from './light-store-scene';
import { lightStoreCatalog } from './light-store-catalog';
import { mountQualityNotice } from './light-store-quality';

const root = document.querySelector<HTMLElement>('#light-store')!;
const quality = mountQualityNotice();
const header = document.createElement('header'); header.className = 'light-brand';
const brand = document.createElement('strong'); header.append(brand);
const edition = document.createElement('span'); edition.textContent = 'A smaller way into the store'; header.append(edition); root.append(header);
const nav = document.createElement('section'); nav.className = 'light-nav'; nav.setAttribute('aria-label', 'Store navigation');
const title = document.createElement('h1'); title.textContent = 'Step inside';
const description = document.createElement('p'); description.textContent = 'Preparing the lightweight 3D view';
const row = document.createElement('div'); row.className = 'light-actions';
function button(label: string, action: () => void, parent: HTMLElement = row): HTMLButtonElement {
  const el = document.createElement('button'); el.type = 'button'; el.textContent = label;
  el.addEventListener('click', action); parent.append(el); return el;
}
nav.append(title, description, row); root.append(nav);
const cursor = button('Enter shelf', () => select(), root); cursor.className = 'light-cursor'; cursor.hidden = true;
let store: LightStoreScene | undefined;
let activeSection = -1;
const left = button('Previous', () => move(-1, 0));
const up = button('Up', () => move(0, 1));
const enter = button('Enter shelf', () => select()); enter.className = 'light-primary';
const down = button('Down', () => move(0, -1));
const right = button('Next', () => move(1, 0));
const back = button('Store overview', () => goBack(), nav); back.className = 'light-back';
const attribution = document.createElement('p'); attribution.className = 'light-attribution';
attribution.textContent = 'Movie data: TMDB · Availability: JustWatch · US snapshot, 21 Aug 2026';
nav.append(attribution);
const scope = document.createElement('span'); scope.className = 'light-scope';
scope.textContent = 'Browsing prototype · Checkout is in development'; nav.append(scope);

function update() {
  if (!store) return;
  const overview = store.mode === 'overview', inspect = store.mode === 'inspect';
  const section = store.libraries[store.section];
  const movie = store.selected?.movie;
  title.textContent = overview ? section?.name ?? 'Opening day' : movie?.title ?? 'The shelves are empty';
  description.textContent = overview
    ? (section ? `${section.movies.length} movies · Swipe to choose a section` : 'No streaming services selected. Choose services in the full store.')
    : `${movie?.year ?? ''} · ${inspect ? 'Swipe to inspect another movie' : 'Swipe across titles and up or down the rows'}`;
  enter.textContent = overview ? 'Enter shelf' : inspect ? 'Return to shelf' : 'Pick up movie';
  enter.disabled = !movie;
  left.disabled = right.disabled = !movie;
  up.hidden = down.hidden = overview;
  back.hidden = overview;
  cursor.hidden = !overview || !movie;
  cursor.textContent = section ? `${section.name} · Enter` : 'Enter';
  store.setView();
  if (activeSection !== store.section) { activeSection = store.section; store.loadSection(); }
}
function chooseSection(index: number) {
  if (!store || !store.libraries.length) return;
  store.section = Math.max(0, Math.min(store.libraries.length - 1, index));
  store.slotIndex = Math.max(0, store.slots.findIndex(slot => slot.section === store!.section));
}
function move(horizontal: number, vertical: number) {
  if (!store || quality.isOpen()) return;
  if (store.mode === 'overview') chooseSection(store.section + horizontal);
  else {
    const current = store.selected;
    if (!current) return;
    const slots = store.slots.filter(slot => slot.section === store!.section);
    const neighbor = slots.find(slot => slot.row === current.row + vertical && slot.col === current.col + horizontal);
    if (neighbor) store.slotIndex = store.slots.indexOf(neighbor);
  }
  update();
}
function select() {
  if (!store?.selected || quality.isOpen()) return;
  store.mode = store.mode === 'overview' ? 'shelf' : store.mode === 'shelf' ? 'inspect' : 'shelf';
  update();
}
function goBack() {
  if (!store || quality.isOpen()) return;
  store.mode = store.mode === 'inspect' ? 'shelf' : 'overview'; update();
}
window.addEventListener('keydown', event => {
  if (quality.isOpen() || (event.key === 'Enter' && /BUTTON|A/.test((event.target as HTMLElement).tagName))) return;
  const actions: Record<string, () => void> = {
    ArrowLeft: () => move(-1, 0), ArrowRight: () => move(1, 0), ArrowUp: () => move(0, 1), ArrowDown: () => move(0, -1),
    Enter: select, Escape: goBack, Backspace: goBack,
  };
  if (actions[event.key]) { event.preventDefault(); actions[event.key](); }
});
function unavailable() {
  title.textContent = 'This browser could not draw the 3D store';
  description.textContent = 'You can still open the full store and choose its 2D view.';
  row.replaceChildren(); cursor.hidden = true; back.hidden = true;
  const link = document.createElement('a'); link.href = './index.html'; link.textContent = 'Open full store'; row.append(link);
}
root.addEventListener('renderlost', unavailable);

async function boot() {
  try {
    const libraries = await lightStoreCatalog();
    store = new LightStoreScene(root, libraries);
    brand.textContent = store.theme.brand.name;
    const scene = store;
    const diagnostics = {
      scene,
      get state() { return { mode: scene.mode, section: scene.section, title: scene.selected?.movie.title, ready: scene.ready }; },
      get metrics() { return { frames: scene.frameTimes, calls: scene.renderer.info.render.calls, triangles: scene.renderer.info.render.triangles, textures: scene.renderer.info.memory.textures }; },
    };
    Object.assign(window, { __lightStore: diagnostics });
    let measured = false;
    scene.onFrame = () => {
      if (!measured) { performance.mark('light-store-interactive'); measured = true; }
      if (scene.mode === 'overview') {
        const point = scene.markerScreen();
        cursor.style.left = `${point.x}px`; cursor.style.top = `${point.y - 24}px`;
      }
    };
    const canvas = scene.renderer.domElement;
    let gesture: { id: number; x: number; y: number; section: number; slot: number; stepsX: number; stepsY: number } | undefined;
    canvas.addEventListener('pointerdown', event => {
      if (quality.isOpen() || !event.isPrimary) return;
      canvas.setPointerCapture(event.pointerId);
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, section: scene.section, slot: scene.slotIndex, stepsX: 0, stepsY: 0 };
    });
    canvas.addEventListener('pointermove', event => {
      if (!gesture || event.pointerId !== gesture.id) return;
      const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
      const stepsX = Math.round(-dx / 90), stepsY = Math.round(dy / 90);
      if (scene.mode === 'overview') chooseSection(gesture.section + stepsX);
      else {
        move(stepsX - gesture.stepsX, 0); move(0, stepsY - gesture.stepsY);
      }
      gesture.stepsX = stepsX; gesture.stepsY = stepsY;
      update(); scene.setView(-(dx + stepsX * 90), dy - stepsY * 90);
    });
    canvas.addEventListener('pointerup', event => {
      if (!gesture || gesture.id !== event.pointerId) return;
      const moved = Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y);
      gesture = undefined;
      if (moved < 10 && scene.mode !== 'overview') select(); else update();
    });
    canvas.addEventListener('pointercancel', () => { gesture = undefined; update(); });
    chooseSection(0); update();
    window.addEventListener('pagehide', event => { if (!event.persisted) scene.dispose(); });
    window.addEventListener('pageshow', event => { if (event.persisted) scene.requestRender(); });
  } catch (error) { console.error('Lightweight store could not start', error); unavailable(); }
}
void boot();
