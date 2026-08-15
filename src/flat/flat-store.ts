import './flat.css';
import awningFilmStrip from '../assets/awning-film-strip.png';
import { JellyfinLibrary, Movie } from '../jellyfin';
import { activeProvider as provider } from '../providers/active-provider';
import type { StoreTheme } from '../themes';
import { getActiveTheme, applyThemeCssVars } from '../themes';
import { getActiveLogoSpec } from '../logo-spec';
import { drawLogo } from '../logo-renderer';
import { buildLibraryRows } from './flat-rows';
import { initFlatNavigation, setLibraryFocus, setButtonFocus } from './flat-nav';
import { beginFlatSession, endFlatSession, flatSignal } from './flat-lifecycle';
import { brandString } from '../brand-pack';


let isNavInitialized = false;
let activeGameMovies: Movie[] = [];
let activeDiscoveryMovies: Movie[] = [];

/**
 * Build the film-strip awning: a backlit blue sign with sprocket holes,
 * scattered film-reel collage, and the brand's own glowing lettering.
 * Uses a pre-rendered PNG of the film-strip collage, with CSS sprocket
 * holes and text overlay.
 */
function buildAwning(): HTMLElement {
  const awning = document.createElement('div');
  awning.className = 'flat-awning';

  // Film-strip collage image (rendered PNG with reels, strips, glow)
  const img = document.createElement('img');
  img.className = 'flat-awning-bg';
  img.src = awningFilmStrip;
  img.alt = '';
  awning.appendChild(img);

  // Brand lettering overlay
  const letters = document.createElement('div');
  letters.className = 'flat-awning-letters';
  const text = document.createElement('span');
  text.className = 'flat-awning-text';
  text.textContent = brandString('brand-wordmark', 'HALCYON');
  letters.appendChild(text);
  awning.appendChild(letters);

  return awning;
}

// The header emblem, painted from the active LogoSpec into an offscreen canvas
// and handed to an <img> as a data URL. One-shot on purpose: flat mode is DOM,
// not a render loop, and the emblem cannot change without a reload (brand edits
// reload the page, like theme/medium changes do).
function buildBrandLogoImg(theme: StoreTheme): HTMLImageElement {
  const W = 800, H = 480;
  const img = document.createElement('img');
  img.className = 'flat-brand-logo-img';
  img.alt = theme.brand.name;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    drawLogo(ctx, getActiveLogoSpec(theme), { x: 0, y: 0, w: W, h: H });
    img.src = canvas.toDataURL();
  }
  return img;
}

export function bootFlatStore(
  libraries: JellyfinLibrary[],
  mount: HTMLElement,
  gameMovies: Movie[] = [],
  discoveryMovies: Movie[] = [],
  lastLibraryId: string | null = null
): void {
  activeGameMovies = gameMovies;
  activeDiscoveryMovies = discoveryMovies;
  // Open (or reuse) the flat session so every window listener registered below
  // and by flat-nav/flat-detail is scoped to a signal teardownFlatStore() can
  // abort on an in-process swap back to 3D. Idempotent: internal re-renders
  // (the Back button re-runs bootFlatStore) reuse the same session.
  beginFlatSession();
  // Clear any existing content
  mount.innerHTML = '';

  const theme = getActiveTheme();

  // Apply theme palette and brand custom properties
  applyThemeCssVars(theme);

  // Add root styling class
  mount.classList.add('flat-store-root');

  // Build header
  const header = document.createElement('header');
  header.className = 'flat-header';
  
  const logoContainer = document.createElement('div');
  logoContainer.className = 'flat-logo-container';

  // The header emblem is the SAME emblem the 3D store paints — drawn once to
  // an offscreen canvas and mounted as an <img>, so the flat mode follows the
  // active brand (theme default, pack, or the user's own bb_logo edits) with
  // no second copy of the artwork anywhere.
  logoContainer.appendChild(buildBrandLogoImg(theme));

  const title = document.createElement('h1');
  title.className = 'flat-title';
  title.textContent = brandString('flat-title', 'HALCYON  STREAMING');

  // The two-tone house tagline under the wordmark.
  const tagline = document.createElement('span');
  tagline.className = 'flat-total-access-tag';
  tagline.innerHTML = `<span class="flat-total-access-blue">${brandString('flat-tagline-lead', 'HOME')}</span>`
    + ` <span class="flat-total-access-yellow">${brandString('flat-tagline-tail', 'CINEMA')}</span>`;

  const menuContainer = document.createElement('div');
  menuContainer.className = 'flat-menu-container';
  menuContainer.innerHTML = `
    <button class="flat-menu-btn" aria-haspopup="true" aria-expanded="false" id="btn-flat-menu">
      <svg class="flat-menu-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="3" y1="12" x2="21" y2="12"></line>
        <line x1="3" y1="6" x2="21" y2="6"></line>
        <line x1="3" y1="18" x2="21" y2="18"></line>
      </svg>
      <span>Menu</span>
      <svg class="flat-menu-chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    </button>
    <div class="flat-menu-dropdown" id="flat-menu-dropdown">
      <button class="flat-menu-item" data-action="mode-3d">
        <svg class="flat-menu-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
          <line x1="12" y1="22.08" x2="12" y2="12"></line>
        </svg>
        <span>3D Store Mode</span>
      </button>
      <button class="flat-menu-item" data-action="settings">
        <svg class="flat-menu-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.5 1z"></path>
        </svg>
        <span>Store Settings</span>
      </button>
      <button class="flat-menu-item" data-action="power">
        <svg class="flat-menu-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
          <line x1="8" y1="21" x2="16" y2="21"></line>
          <line x1="12" y1="17" x2="12" y2="21"></line>
        </svg>
        <span>System Control</span>
      </button>
      ${localStorage.getItem('jellyfin_url') ? `
      <button class="flat-menu-item" data-action="logout">
        <svg class="flat-menu-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
          <polyline points="16 17 21 12 16 7"></polyline>
          <line x1="21" y1="12" x2="9" y2="12"></line>
        </svg>
        <span>Switch Member</span>
      </button>
      ` : ''}
    </div>
  `;

  header.appendChild(logoContainer);
  header.appendChild(title);
  header.appendChild(tagline);
  header.appendChild(menuContainer);

  // ── Film-strip awning: backlit blue sign with sprocket holes,
  //     film-reel collage, and the brand's illuminated lettering ───────
  const awning = buildAwning();
  mount.appendChild(header);
  mount.appendChild(awning);

  const menuBtn = menuContainer.querySelector('.flat-menu-btn') as HTMLElement;
  const dropdown = menuContainer.querySelector('.flat-menu-dropdown') as HTMLElement;

  const toggleDropdown = () => {
    const isVisible = dropdown.classList.contains('visible');
    if (isVisible) {
      dropdown.classList.remove('visible');
      menuBtn.setAttribute('aria-expanded', 'false');
      setButtonFocus(menuBtn);
    } else {
      dropdown.classList.add('visible');
      menuBtn.setAttribute('aria-expanded', 'true');
      const firstItem = dropdown.querySelector('.flat-menu-item') as HTMLElement;
      if (firstItem) {
        const items = Array.from(dropdown.querySelectorAll('.flat-menu-item')) as HTMLElement[];
        items.forEach((item, i) => item.classList.toggle('is-focused', i === 0));
        firstItem.focus();
      }
    }
  };

  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdown();
  });

  // Mouse hover listener to update selection state
  dropdown.addEventListener('mouseover', (e) => {
    const target = e.target as HTMLElement;
    const item = target.closest('.flat-menu-item') as HTMLElement;
    if (item) {
      const items = Array.from(dropdown.querySelectorAll('.flat-menu-item')) as HTMLElement[];
      items.forEach(el => el.classList.toggle('is-focused', el === item));
      item.focus();
    }
  });

  dropdown.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const item = target.closest('.flat-menu-item') as HTMLElement;
    if (!item) return;

    const action = item.dataset.action;
    dropdown.classList.remove('visible');
    menuBtn.setAttribute('aria-expanded', 'false');

    if (action === 'mode-3d') {
      // In-process swap back to the 3D store — no page reload, no Jellyfin
      // re-fetch. switchRenderMode tears this flat session down and rebuilds
      // the 3D scene from the already-loaded catalog (main.ts).
      (window as any).HTPC?.switchRenderMode('3d');
    } else if (action === 'settings') {
      (window as any).HTPC?.openSettingsDrawer();
    } else if (action === 'power') {
      (window as any).HTPC?.openPowerMenu();
    } else if (action === 'logout') {
      (window as any).HTPC?.switchMember();
    }
  });

  // Close dropdown on click outside
  window.addEventListener('click', (e) => {
    if (dropdown.classList.contains('visible') && !menuContainer.contains(e.target as HTMLElement)) {
      dropdown.classList.remove('visible');
      menuBtn.setAttribute('aria-expanded', 'false');
    }
  }, { signal: flatSignal() });

  
  // Build main content
  const content = document.createElement('main');
  content.className = 'flat-content';
  content.removeAttribute('data-active-library-id');

  const gridTitle = document.createElement('h2');
  gridTitle.className = 'flat-section-title';
  gridTitle.textContent = 'Select a Library';
  content.appendChild(gridTitle);

  if (libraries.length === 0) {
    const emptyGrid = document.createElement('div');
    emptyGrid.className = 'flat-library-empty-state';
    emptyGrid.innerHTML = `
      <span class="flat-library-empty-icon">🔌</span>
      <h3 class="flat-library-empty-title">No Libraries Synced</h3>
      <p class="flat-library-empty-text">Please open settings or reconnect to ${provider().displayName} to synchronize your media libraries.</p>
    `;
    content.appendChild(emptyGrid);
  } else {
    const grid = document.createElement('div');
    grid.className = 'flat-library-grid';

    libraries.forEach((lib, idx) => {
      const card = document.createElement('div');
      card.className = 'flat-library-card';
      card.setAttribute('tabindex', '0');
      card.dataset.libraryId = lib.id;
      // Watermark letter rendered by .flat-library-card::after
      card.dataset.initial = (lib.name.trim().charAt(0) || '#').toUpperCase();

      const aisleEl = document.createElement('span');
      aisleEl.className = 'flat-library-aisle';
      aisleEl.textContent = `Aisle ${String(idx + 1).padStart(2, '0')}`;

      const nameEl = document.createElement('h3');
      nameEl.className = 'flat-library-name';
      nameEl.textContent = lib.name;

      const countEl = document.createElement('p');
      countEl.className = 'flat-library-count';
      countEl.textContent = `${lib.movies.length} titles`;

      card.appendChild(aisleEl);
      card.appendChild(nameEl);
      card.appendChild(countEl);
      grid.appendChild(card);

      // Event listeners to load library
      const selectLib = () => {
        loadLibrary(lib, content, libraries, mount);
      };

      card.addEventListener('click', selectLib);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          selectLib();
          e.preventDefault();
        }
      });
    });

    content.appendChild(grid);

    // Initial card focus
    let cardToFocus: HTMLElement | null = null;
    if (lastLibraryId) {
      cardToFocus = grid.querySelector(`.flat-library-card[data-library-id="${lastLibraryId}"]`) as HTMLElement;
    }
    if (!cardToFocus) {
      cardToFocus = grid.querySelector('.flat-library-card') as HTMLElement;
    }
    if (cardToFocus) {
      setLibraryFocus(cardToFocus);
    }
  }

  mount.appendChild(content);

  // Initialize navigation key/mouse handlers once
  if (!isNavInitialized) {
    initFlatNavigation();
    isNavInitialized = true;
  }
}

/**
 * Tear the flat store down for an in-process swap to 3D. Aborts the session
 * (dropping every window listener the flat modules registered), removes any
 * transient detail/search overlays, clears the mount, and un-hides the 3D HUD
 * that the flat branch hid on entry. Safe to call when nothing is mounted.
 */
export function teardownFlatStore(mount: HTMLElement): void {
  endFlatSession();
  // Force nav to re-bind on the next flat entry — its listeners were just
  // aborted, but the once-only guard would otherwise skip re-initialization.
  isNavInitialized = false;
  document
    .querySelectorAll('.flat-detail-overlay, .flat-search-overlay')
    .forEach((el) => el.remove());
  mount.innerHTML = '';
  mount.classList.remove('flat-store-root');
  const hud = document.getElementById('hud-overlay');
  if (hud) hud.style.display = '';
}

function loadLibrary(
  lib: JellyfinLibrary,
  contentEl: HTMLElement,
  allLibraries: JellyfinLibrary[],
  mountEl: HTMLElement
) {
  contentEl.innerHTML = '';
  contentEl.dataset.activeLibraryId = lib.id;

  const sectionHeader = document.createElement('div');
  sectionHeader.className = 'flat-section-header';

  const backBtn = document.createElement('button');
  backBtn.className = 'flat-back-btn';
  backBtn.textContent = '← Back to Libraries';
  backBtn.addEventListener('click', () => {
    bootFlatStore(allLibraries, mountEl, activeGameMovies, activeDiscoveryMovies, lib.id);
  });

  const libTitle = document.createElement('h2');
  libTitle.className = 'flat-section-title-inline';
  libTitle.textContent = lib.name;

  sectionHeader.appendChild(backBtn);
  sectionHeader.appendChild(libTitle);
  contentEl.appendChild(sectionHeader);

  // Build rows
  const rowsEl = buildLibraryRows(lib, activeGameMovies, activeDiscoveryMovies);
  contentEl.appendChild(rowsEl);

  // Verify if library rows have any movie cases
  const firstCase = rowsEl.querySelector('.case') as HTMLElement;
  if (!firstCase) {
    const emptyState = document.createElement('div');
    emptyState.className = 'flat-library-empty-state';
    emptyState.innerHTML = `
      <span class="flat-library-empty-icon">📼</span>
      <h3 class="flat-library-empty-title">Empty Library</h3>
      <p class="flat-library-empty-text">This library does not contain any titles yet. Connect media sources to sync content!</p>
    `;
    contentEl.appendChild(emptyState);
    
    // Focus back button
    backBtn.classList.add('is-focused');
    backBtn.focus();
  } else {
    // Keep focus unset on load; spatial keyboard navigation will automatically focus the first case on the first arrow keypress.
  }
}
