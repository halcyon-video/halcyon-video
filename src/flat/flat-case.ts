import { Movie } from '../jellyfin';
import { getActiveTheme } from '../themes';
import { isDiscoveryRequested } from '../jellyseerr';
import { openDetailsOverlay } from './flat-detail';
import { setFocus } from './flat-nav';

// Inches-ish display proportions; orientation mirrors PLATFORM_CASE_DIMS in
// video-case.ts (US SNES/N64 landscape, PS-era jewels slightly portrait).
export const CASE_PROFILES: Record<string, { w: number; h: number; d: number }> = {
  vhs: { w: 4.2, h: 7.5, d: 1.0 },
  dvd: { w: 5.3, h: 7.5, d: 0.55 },
  'SNES': { w: 7.1, h: 5.0, d: 1.2 },
  'NINTENDO 64': { w: 7.4, h: 5.1, d: 1.2 },
  'PLAYSTATION': { w: 4.9, h: 5.6, d: 0.6 },
  'PLAYSTATION 2': { w: 5.3, h: 7.5, d: 0.55 },
  'GAMECUBE': { w: 5.0, h: 5.8, d: 0.55 },
  'NES': { w: 4.8, h: 7.0, d: 1.2 },
  'GENESIS': { w: 5.0, h: 7.0, d: 1.3 },
  'DREAMCAST': { w: 4.9, h: 5.6, d: 0.5 },
  'GAME BOY': { w: 4.2, h: 4.9, d: 0.8 },
  'GAME BOY COLOR': { w: 4.2, h: 4.9, d: 0.8 },
  'GAME BOY ADVANCE': { w: 4.0, h: 4.8, d: 0.8 }
};

export function createCase(movie: Movie): HTMLElement {
  const caseEl = document.createElement('div');

  // Determine the medium/platform style
  const theme = getActiveTheme();
  const savedMedium = localStorage.getItem('bb_medium');
  const bbMedium = (savedMedium === 'dvd' || savedMedium === 'vhs') ? savedMedium : (theme.defaultMedium || 'dvd');
  let profileKey: string = bbMedium;

  if (movie.game && movie.platform) {
    const platform = movie.platform;
    if (CASE_PROFILES[platform]) {
      profileKey = platform;
    } else {
      const platformUpper = platform.toUpperCase();
      if (CASE_PROFILES[platformUpper]) {
        profileKey = platformUpper;
      } else if (platformUpper.includes('PLAYSTATION') || platformUpper.includes('PSX') || platformUpper.includes('PS1')) {
        profileKey = 'PLAYSTATION';
      } else if (platformUpper.includes('NINTENDO 64') || platformUpper.includes('N64')) {
        profileKey = 'NINTENDO 64';
      } else if (platformUpper.includes('SNES') || platformUpper.includes('SUPER NINTENDO')) {
        profileKey = 'SNES';
      } else if (platformUpper.includes('NES') || platformUpper.includes('NINTENDO NES')) {
        profileKey = 'NES';
      } else if (platformUpper.includes('GENESIS') || platformUpper.includes('SEGA')) {
        profileKey = 'GENESIS';
      }
    }
  }

  const profile = CASE_PROFILES[profileKey] || CASE_PROFILES['dvd'];
  const aspect = profile.w / profile.h;
  const depthRatio = profile.d / profile.h;

  let classKey = profileKey.toLowerCase().replace(/\s+/g, '-');
  if (classKey === 'playstation') classKey = 'psx';
  if (classKey === 'nintendo-64') classKey = 'n64';

  caseEl.className = `case case--${classKey}`;
  if (movie.game && movie.platform) {
    caseEl.classList.add(`case--platform-${classKey}`);
  }

  caseEl.setAttribute('tabindex', '-1');
  // Seed --case-aspect from Jellyfin's PrimaryImageAspectRatio when known so
  // the case is already sized to the art before the lazy poster loads (#108) —
  // rewriting the aspect on load reflows the whole row and shifts scroll-snap
  // offsets. Games/discovery/harness titles lack it and fall back to the
  // physical case profile until the image corrects them below.
  const metaAspect = movie.primaryImageAspectRatio;
  const seedAspect = (typeof metaAspect === 'number' && isFinite(metaAspect) && metaAspect > 0) ? metaAspect : aspect;
  caseEl.style.setProperty('--case-aspect', seedAspect.toString());
  caseEl.style.setProperty('--case-depth-ratio', depthRatio.toString());
  caseEl.dataset.movieId = movie.id;
  (caseEl as any).movie = movie;

  // 1. Spine (left edge)
  const spineEl = document.createElement('div');
  spineEl.className = 'case__spine';

  // Spine Top - tiny logo or icon
  const spineTop = document.createElement('div');
  spineTop.className = 'case__spine-top';
  spineTop.textContent = theme.defaultMedium === 'vhs' ? '📼' : '🎬';
  spineEl.appendChild(spineTop);

  // Spine Title
  const spineTitle = document.createElement('span');
  spineTitle.className = 'case__spine-title';
  spineTitle.textContent = movie.title;
  spineEl.appendChild(spineTitle);

  // Spine Bottom - random serial number
  const spineBottom = document.createElement('div');
  spineBottom.className = 'case__spine-bottom';
  spineBottom.textContent = `V-${Math.floor(10000 + Math.random() * 90000)}`;
  spineEl.appendChild(spineBottom);

  // 1.5. Clamshell Tray (rental tray peeking out)
  let trayEl: HTMLElement | null = null;
  if (!movie.game) {
    trayEl = document.createElement('div');
    trayEl.className = 'case__tray';
  }

  // 2. Front
  const frontEl = document.createElement('div');
  frontEl.className = 'case__front';

  const imgEl = document.createElement('img');
  imgEl.className = 'case__image';
  imgEl.loading = 'lazy';
  imgEl.decoding = 'async';
  if (movie.posterUrl) {
    imgEl.src = movie.posterUrl;
  }
  imgEl.alt = movie.title;

  // Size the case to the artwork's real aspect ratio — never crop the art.
  // Skip the write when the seeded aspect already matches (metadata-seeded
  // cases): each rewrite reflows the row and yanks the viewport (#108).
  imgEl.addEventListener('load', () => {
    if (imgEl.naturalWidth && imgEl.naturalHeight) {
      const realAspect = imgEl.naturalWidth / imgEl.naturalHeight;
      if (Math.abs(realAspect - seedAspect) > 0.01) {
        caseEl.style.setProperty('--case-aspect', realAspect.toString());
      }
    }
  });

  // Sheen overlay (glass gloss highlight)
  const sheenEl = document.createElement('div');
  sheenEl.className = 'case__sheen';
  frontEl.appendChild(sheenEl);

  // Badges
  const badgesEl = document.createElement('div');
  badgesEl.className = 'case__badges';

  // 4K Badge
  if (movie.is4k) {
    const badge4k = document.createElement('span');
    badge4k.className = 'case__badge case__badge--4k';
    badge4k.textContent = '4K';
    badgesEl.appendChild(badge4k);
  }

  // NEW Badge (dateCreated < 30 days)
  let isNew = false;
  if (movie.dateCreated) {
    const createdDate = new Date(movie.dateCreated);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - createdDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 30) {
      isNew = true;
    }
  }
  if (isNew) {
    const badgeNew = document.createElement('span');
    badgeNew.className = 'case__badge case__badge--new';
    badgeNew.textContent = 'NEW RELEASE';
    badgesEl.appendChild(badgeNew);
  }

  // Rating Chip
  const ratingText = movie.rating || 'NR';
  const badgeRating = document.createElement('span');
  badgeRating.className = 'case__badge case__badge--rating';
  badgeRating.textContent = ratingText;
  badgesEl.appendChild(badgeRating);

  frontEl.appendChild(imgEl);
  frontEl.appendChild(badgesEl);

  const isRequested = (movie.discovery || movie.collectionGap) &&
    (movie.discoveryRequested || isDiscoveryRequested(movie.tmdbId));
  if (isRequested) {
    caseEl.classList.add('case--requested');
    const requestedBanner = document.createElement('div');
    requestedBanner.className = 'case__requested-banner';
    requestedBanner.textContent = movie.collectionGap ? 'COMING SOON' : 'REQUESTED';
    frontEl.appendChild(requestedBanner);
  }

  // 3D Edges/Sides
  const topEl = document.createElement('div');
  topEl.className = 'case__top';

  const bottomEl = document.createElement('div');
  bottomEl.className = 'case__bottom';

  const rightEl = document.createElement('div');
  rightEl.className = 'case__right';

  // 3. Shadow
  const shadowEl = document.createElement('div');
  shadowEl.className = 'case__shadow';

  // Append elements in 3D layering order
  caseEl.appendChild(spineEl);
  caseEl.appendChild(topEl);
  caseEl.appendChild(bottomEl);
  caseEl.appendChild(rightEl);
  if (trayEl) {
    caseEl.appendChild(trayEl);
  }
  caseEl.appendChild(frontEl);
  caseEl.appendChild(shadowEl);

  // Click event listener to open details screen
  caseEl.addEventListener('click', () => {
    if (document.querySelector('.flat-detail-overlay')) return;
    if (document.querySelector('.flat-search-overlay')) return;

    setFocus(caseEl);

    const mount = caseEl.closest('.flat-store-root') as HTMLElement;
    if (mount) {
      caseEl.classList.remove('is-focused');
      openDetailsOverlay(movie, caseEl, mount);
    }
  });

  return caseEl;
}
