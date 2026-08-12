import type { Movie, Episode } from '../media-types.ts';
import { fetchSeriesEpisodes, fetchFirstEpisodeOfSeries } from '../media-backend.ts';
import { launchGame } from '../romm';
import { retailAudio } from '../audio';
import { requestMovie, isDiscoveryRequested } from '../jellyseerr';
import type { StoreTheme } from '../themes';
import { getActiveTheme } from '../themes';
import { getActiveLogoSpec } from '../logo-spec';
import { drawLogo } from '../logo-renderer';
import { flatSignal } from './flat-lifecycle';

let launchVideoPlaybackFn: ((movie: Movie, overrideItemId?: string, overridePath?: string) => Promise<void>) | null = null;

function getRatingDescription(rating?: string): string {
  switch (rating?.toUpperCase()) {
    case 'G': return 'GENERAL AUDIENCES. All ages admitted.';
    case 'PG': return 'PARENTAL GUIDANCE SUGGESTED. Some material may not be suitable for children.';
    case 'PG-13': return 'PARENTS STRONGLY CAUTIONED. Some material may be inappropriate for children under 13.';
    case 'R': return 'RESTRICTED. Under 17 requires accompanying parent or adult guardian.';
    case 'NC-17': return 'NO ONE 17 AND UNDER ADMITTED.';
    default: return 'NOT RATED. This motion picture has not yet been rated.';
  }
}

function logSystemMessage(message: string): void {
  const container = document.getElementById('console-logs-container');
  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0];
  const formattedText = `[${timeStr}] ${message}`;
  console.log(`[UI Log] ${formattedText}`);
  if (container) {
    const entry = document.createElement('div');
    entry.className = `log-entry system`;
    entry.innerText = formattedText;
    container.appendChild(entry);
    while (container.childNodes.length > 50) {
      container.removeChild(container.firstChild!);
    }
    container.scrollTop = container.scrollHeight;
  }
}

// The active emblem as a data URL, cached for the session.
let emblemDataUrl: string | null = null;
function brandEmblemDataUrl(theme: StoreTheme): string {
  if (emblemDataUrl !== null) return emblemDataUrl;
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 288;
  const ctx = canvas.getContext('2d');
  if (ctx) drawLogo(ctx, getActiveLogoSpec(theme), { x: 0, y: 0, w: 480, h: 288 });
  emblemDataUrl = ctx ? canvas.toDataURL() : '';
  return emblemDataUrl;
}

export function registerPlaybackLauncher(fn: typeof launchVideoPlaybackFn) {
  launchVideoPlaybackFn = fn;
}

function renderStars(rating?: number): string {
  if (rating === undefined) return '';
  const starCount = rating / 2; // scale 0-10 to 0-5
  let starsHtml = `<div class="flat-detail-rating-stars" title="Community Rating: ${rating.toFixed(1)}/10">`;
  for (let i = 1; i <= 5; i++) {
    if (starCount >= i) {
      starsHtml += '<span class="star star-filled">★</span>';
    } else if (starCount > i - 1) {
      const pct = Math.round((starCount - (i - 1)) * 100);
      starsHtml += `<span class="star star-half" style="--percent: ${pct}%">★</span>`;
    } else {
      starsHtml += '<span class="star star-empty">★</span>';
    }
  }
  starsHtml += '</div>';
  return starsHtml;
}

function renderCriticRating(rating?: number): string {
  if (rating === undefined) return '';
  return `
    <div class="flat-detail-critic-rating" title="Critic Rating: ${rating}%">
      <span class="critic-icon">🍅</span>
      <span class="critic-value">${rating}%</span>
    </div>
  `;
}

export function openDetailsOverlay(
  movie: Movie,
  originatingCase: HTMLElement,
  mount: HTMLElement
): void {
  // If overlay is already open, do nothing
  if (document.querySelector('.flat-detail-overlay')) return;

  const overlayEl = document.createElement('div');
  overlayEl.className = 'flat-detail-overlay';

  // Build the ratings HTML
  const starsHtml = renderStars(movie.communityRating);
  const criticHtml = renderCriticRating(movie.criticRating);
  let ratingsRowHtml = '';
  if (starsHtml || criticHtml) {
    ratingsRowHtml = `
      <div class="flat-detail-ratings">
        ${starsHtml ? `
          <div>
            <div class="flat-detail-rating-label">Community</div>
            ${starsHtml}
          </div>
        ` : ''}
        ${criticHtml ? `
          <div>
            <div class="flat-detail-rating-label">Critic</div>
            ${criticHtml}
          </div>
        ` : ''}
      </div>
    `;
  }

  // Determine button text/state
  const isRequested = (movie.discovery || movie.collectionGap) &&
    (movie.discoveryRequested || isDiscoveryRequested(movie.tmdbId));
  let playBtnText = 'Play';
  let playBtnDisabled = '';
  let playBtnIcon = '▶';

  if (movie.game) {
    playBtnText = 'Rent';
    playBtnIcon = '🎮';
  } else if (movie.discovery || movie.collectionGap) {
    playBtnText = isRequested ? (movie.collectionGap ? 'Coming Soon' : 'Requested') : 'Request';
    playBtnIcon = isRequested ? '✓' : '✦';
    playBtnDisabled = isRequested ? 'disabled' : '';
  } else if (movie.comingSoon) {
    playBtnText = 'Coming Soon';
    playBtnIcon = '⏱';
    playBtnDisabled = 'disabled';
  }

  // The clamshell lip's small embossed brand mark: the ACTIVE emblem, painted
  // from the LogoSpec onto an offscreen canvas (one-shot — flat mode is DOM,
  // not a render loop, and the brand can't change without a reload).
  const theme = getActiveTheme();
  const headerLogoHtml = `<img class="flat-brand-logo-img" alt="${theme.brand.name}" src="${brandEmblemDataUrl(theme)}">`;

  overlayEl.innerHTML = `
    <div class="flat-detail-container bb-box-back">
      <!-- Clamshell lip: plain plastic, small embossed brand logo only -->
      <div class="bb-box-back__header">
        <div class="bb-box-back__header-logo">
          ${headerLogoHtml}
        </div>
      </div>

      <div class="bb-box-back__body">
        <div class="flat-detail-left">
          <h1 class="flat-detail-title">${movie.title}</h1>
          
          <div class="flat-detail-meta">
            ${movie.game ? `
              <span class="flat-detail-badge-platform">${movie.platform}</span>
              <span class="flat-detail-meta-divider">|</span>
              <span class="flat-detail-meta-item">${movie.year}</span>
            ` : movie.discovery ? `
              <span class="flat-detail-meta-item">${movie.year}</span>
            ` : `
              <span class="flat-detail-meta-item">${movie.year}</span>
              <span class="flat-detail-meta-divider">|</span>
              <span class="flat-detail-meta-item">${movie.duration}</span>
              <span class="flat-detail-meta-divider">|</span>
              <span class="flat-detail-meta-item">${movie.rating || 'NR'}</span>
              ${movie.is4k ? `
                <span class="flat-detail-meta-divider">|</span>
                <span class="flat-detail-badge-4k">4K</span>
              ` : ''}
            `}
          </div>

          ${ratingsRowHtml}

          <p class="flat-detail-overview">${movie.overview || 'No description available.'}</p>

          ${(movie.game || movie.discovery) ? '' : `
          <div class="flat-detail-credits">
            <div class="flat-detail-credits-label">Director</div>
            <div class="flat-detail-credits-value">${movie.director || 'Unknown'}</div>
            
            <div class="flat-detail-credits-label">Cast</div>
            <div class="flat-detail-credits-value">${movie.actors && movie.actors.length > 0 ? movie.actors.join(', ') : 'Unknown'}</div>

            <div class="flat-detail-credits-label">Studio</div>
            <div class="flat-detail-credits-value">${movie.studios && movie.studios.length > 0 ? movie.studios.join(', ') : 'Unknown'}</div>
          </div>
          `}

          ${movie.isSeries ? `
            <div class="flat-detail-episodes">
              <h4 class="flat-detail-episodes-title">Episodes</h4>
              <div class="flat-detail-episodes-list">
                <div class="flat-detail-episodes-loading">Loading episodes...</div>
              </div>
            </div>
          ` : ''}

          <div class="flat-detail-actions">
            <button class="flat-detail-btn flat-detail-btn--play" ${playBtnDisabled}>
              <span class="flat-detail-btn-icon">${playBtnIcon}</span>
              <span class="flat-detail-btn-text">${playBtnText}</span>
            </button>
            <button class="flat-detail-btn flat-detail-btn--close">
              <span class="flat-detail-btn-text">Close</span>
            </button>
          </div>
        </div>

        <div class="flat-detail-right">
          <!-- Printed screenshot frame, like the stills on the back of a video box -->
          ${movie.backdropUrl ? `
            <div class="bb-box-back__still-frame">
              <div class="bb-box-back__still-image-wrapper">
                <img class="bb-box-back__still-image" src="${movie.backdropUrl}" alt="${movie.title} Still">
              </div>
            </div>
          ` : ''}

          <!-- MPAA rating block -->
          <div class="bb-box-back__rating-card">
            <div class="bb-box-back__rating-symbol">${movie.rating || 'NR'}</div>
            <div class="bb-box-back__rating-info">
              <div class="bb-box-back__rating-details">${getRatingDescription(movie.rating)}</div>
            </div>
          </div>

          <!-- Barcode Sticker -->
          <div class="bb-box-back__barcode-sticker">
            <div class="bb-box-back__barcode-brand">${theme.brand.name.toUpperCase()}</div>
            <div class="bb-box-back__barcode-graphic"></div>
            <div class="bb-box-back__barcode-value">*000${Math.floor(100000000 + Math.random() * 900000000)}*</div>
          </div>
        </div>
      </div>
    </div>
  `;

  mount.appendChild(overlayEl);

  // Trigger CSS transition
  requestAnimationFrame(() => {
    overlayEl.classList.add('visible');
  });

  // Focusable elements management
  const playBtn = overlayEl.querySelector('.flat-detail-btn--play') as HTMLButtonElement;
  const closeBtn = overlayEl.querySelector('.flat-detail-btn--close') as HTMLButtonElement;
  
  let items: HTMLElement[] = [playBtn, closeBtn];
  let focusedIndex = movie.comingSoon ? 1 : 0;
  let episodesList: Episode[] = [];

  const setOverlayFocus = (index: number) => {
    // Remove existing focus
    items.forEach(el => el.classList.remove('is-focused'));
    
    focusedIndex = index;
    const activeEl = items[focusedIndex];
    if (activeEl) {
      activeEl.classList.add('is-focused');
      // Scroll focused episode into view if it's inside the scrollable list
      if (focusedIndex >= 2) {
        activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  };

  const closeOverlay = () => {
    overlayEl.classList.remove('visible');
    window.removeEventListener('keydown', handleKeydown);
    
    // Remove from DOM after transition
    setTimeout(() => {
      overlayEl.remove();
      // Return focus to originating case
      originatingCase.classList.add('is-focused');
      // Center the case again
      const rowContainer = originatingCase.closest('.flat-row-scroll-container') as HTMLElement;
      if (rowContainer) {
        const containerWidth = rowContainer.clientWidth;
        const caseLeft = originatingCase.offsetLeft;
        const caseWidth = originatingCase.clientWidth;
        rowContainer.scrollTo({
          left: caseLeft - (containerWidth / 2) + (caseWidth / 2),
          behavior: 'smooth'
        });
      }
    }, 250);
  };

  const playEpisode = async (ep: Episode) => {
    let path = ep.path;
    if (!path) {
      const jellyfinUrl = localStorage.getItem('jellyfin_url');
      const token = localStorage.getItem('jellyfin_token');
      const userId = localStorage.getItem('jellyfin_userid');
      if (jellyfinUrl && token && userId) {
        const resolved = await fetchFirstEpisodeOfSeries(jellyfinUrl, token, userId, ep.id);
        path = resolved?.path || '';
      }
    }
    await launchVideoPlaybackFn?.(movie, ep.id, path);
  };

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      if (focusedIndex === 1) {
        setOverlayFocus(0);
      } else if (focusedIndex === 0) {
        setOverlayFocus(1);
      }
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      if (focusedIndex === 0) {
        setOverlayFocus(1);
      } else if (focusedIndex === 1) {
        setOverlayFocus(0);
      }
      e.preventDefault();
    } else if (e.key === 'ArrowDown') {
      if (focusedIndex === 0 || focusedIndex === 1) {
        if (items.length > 2) {
          setOverlayFocus(2);
        }
      } else {
        const nextIndex = focusedIndex + 1;
        if (nextIndex < items.length) {
          setOverlayFocus(nextIndex);
        } else {
          setOverlayFocus(0);
        }
      }
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      if (focusedIndex === 0 || focusedIndex === 1) {
        if (items.length > 2) {
          setOverlayFocus(items.length - 1);
        }
      } else if (focusedIndex === 2) {
        setOverlayFocus(0);
      } else {
        setOverlayFocus(focusedIndex - 1);
      }
      e.preventDefault();
    } else if (e.key === 'Enter') {
      const activeEl = items[focusedIndex];
      if (activeEl) {
        activeEl.click();
      }
      e.preventDefault();
    } else if (e.key === 'Backspace' || e.key === 'Escape') {
      closeOverlay();
      e.preventDefault();
    }
  };

  // Wire event handlers
  playBtn.addEventListener('click', async () => {
    if (movie.game) {
      logSystemMessage(`[System] Renting "${movie.title}" (${movie.platform || 'game'})...`);
      const result = await launchGame(movie);
      if (result === 'launched') {
        retailAudio.playCheckoutChime();
        logSystemMessage(`[System] Launching "${movie.title}" in the emulator...`);
      } else if (result === 'browser') {
        retailAudio.playCheckoutChime();
        logSystemMessage(`[System] "${movie.title}" is ready — take it to the counter to play (emulator launch is only available in the desktop app).`);
      } else {
        logSystemMessage(`[System] Couldn't launch "${movie.title}" — check the Romm launch command in settings.`);
      }
      closeOverlay();
    } else if (movie.discovery || movie.collectionGap) {
      if (typeof movie.tmdbId !== 'number') return;
      logSystemMessage(`[System] Requesting "${movie.title}"...`);
      const success = await requestMovie(movie.tmdbId);
      if (success) {
        movie.discoveryRequested = true;
        retailAudio.playCheckoutChime();
        logSystemMessage(`[System] Requested "${movie.title}" -- it'll show as REQUESTED here once it's picked up.`);

        // Restyle the originating case to show it is requested
        const bannerText = movie.collectionGap ? 'COMING SOON' : 'REQUESTED';
        originatingCase.classList.add('case--requested');
        const frontEl = originatingCase.querySelector('.case__front');
        if (frontEl && !frontEl.querySelector('.case__requested-banner')) {
          const requestedBanner = document.createElement('div');
          requestedBanner.className = 'case__requested-banner';
          requestedBanner.textContent = bannerText;
          frontEl.appendChild(requestedBanner);
        }

        // Disable the button and change its text
        playBtn.disabled = true;
        const btnTextEl = playBtn.querySelector('.flat-detail-btn-text');
        if (btnTextEl) btnTextEl.textContent = movie.collectionGap ? 'Coming Soon' : 'Requested';
        const btnIconEl = playBtn.querySelector('.flat-detail-btn-icon');
        if (btnIconEl) btnIconEl.textContent = '✓';
      } else {
        logSystemMessage(`[System] Failed to request "${movie.title}" (Jellyseerr unreachable or rejected the request).`);
      }
    } else {
      if (movie.isSeries) {
        if (episodesList.length > 0) {
          await playEpisode(episodesList[0]);
        }
      } else {
        await launchVideoPlaybackFn?.(movie);
      }
    }
  });

  closeBtn.addEventListener('click', () => {
    closeOverlay();
  });

  // Fetch episodes if series
  if (movie.isSeries) {
    const listContainer = overlayEl.querySelector('.flat-detail-episodes-list') as HTMLElement;
    const jellyfinUrl = localStorage.getItem('jellyfin_url') || '';
    const token = localStorage.getItem('jellyfin_token') || '';
    const userId = localStorage.getItem('jellyfin_userid') || '';

    fetchSeriesEpisodes(jellyfinUrl, token, userId, movie.id)
      .then(episodes => {
        episodesList = episodes;
        if (listContainer) {
          listContainer.innerHTML = '';
          if (episodes.length === 0) {
            listContainer.innerHTML = '<div class="flat-detail-episodes-empty">No episodes found.</div>';
          } else {
            episodes.forEach((ep) => {
              const epEl = document.createElement('div');
              epEl.className = 'flat-detail-episode-item';
              epEl.innerHTML = `
                <div class="flat-detail-episode-info">
                  <span class="flat-detail-episode-number">Season ${ep.seasonNumber}, Episode ${ep.episodeNumber}</span>
                  <span class="flat-detail-episode-name">${ep.name || 'Episode ' + ep.episodeNumber}</span>
                </div>
                <div class="flat-detail-episode-play">▶</div>
              `;
              epEl.addEventListener('click', async () => {
                await playEpisode(ep);
              });
              listContainer.appendChild(epEl);
              items.push(epEl);
            });
            // Update focus list
            setOverlayFocus(focusedIndex);
          }
        }
      })
      .catch(err => {
        console.error('Error fetching series episodes:', err);
        if (listContainer) {
          listContainer.innerHTML = '<div class="flat-detail-episodes-error">Error loading episodes.</div>';
        }
      });
  }

  // Set initial focus
  setOverlayFocus(focusedIndex);

  // Register keydown listener. closeOverlay removes it explicitly; the session
  // signal is a safety net so a mode swap with the overlay still open can't
  // leave it bound to fight the 3D store's input.
  window.addEventListener('keydown', handleKeydown, { signal: flatSignal() });
}
