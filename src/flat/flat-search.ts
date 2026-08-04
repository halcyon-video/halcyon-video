import { JellyfinLibrary, Movie } from '../jellyfin';
import { createCase } from './flat-case';
import { openDetailsOverlay } from './flat-detail';

let originatingFocusElement: HTMLElement | null = null;
let currentSearchOverlay: HTMLElement | null = null;
let searchDebounceTimer: number | null = null;

// Whether the last setSearchFocus() call originated from keyboard navigation rather than mouse
// hover — mirrors flat-nav.ts's isNavigatingWithKeyboard so hover doesn't auto-scroll (#101).
let isNavigatingWithKeyboard = false;

// Cheap module-state check other modules (flat-nav.ts) can use instead of a document-wide
// `document.querySelector('.flat-search-overlay')` scan on every keydown/mouseover (#119).
export function isFlatSearchOverlayOpen(): boolean {
  return currentSearchOverlay !== null;
}

// Cap on rendered result cases per keystroke — matches the existing 60-item
// row caps in flat-rows.ts. Keeps the DOM rebuild (and its lazy poster loads)
// bounded even when a short/fuzzy query matches most of a large library.
const MAX_SEARCH_RESULTS = 60;

// Debounce delay for re-running search on input — avoids a full grid teardown
// + rebuild on every keystroke while typing.
const SEARCH_DEBOUNCE_MS = 120;

// Fuzzy search utility
function fuzzyMatch(text: string, query: string): boolean {
  const cleanText = text.toLowerCase();
  const cleanQuery = query.toLowerCase();
  
  // Try direct substring match first for better relevance
  if (cleanText.includes(cleanQuery)) return true;
  
  // Fall back to subsequence match (fuzzy)
  let queryIdx = 0;
  for (let i = 0; i < cleanText.length; i++) {
    if (cleanText[i] === cleanQuery[queryIdx]) {
      queryIdx++;
      if (queryIdx === cleanQuery.length) return true;
    }
  }
  return cleanQuery.length === 0;
}

export function openFlatSearchOverlay(
  libraries: JellyfinLibrary[],
  currentLibraryId: string | null,
  mount: HTMLElement,
  initialQuery?: string
): void {
  // Prevent duplicate overlays
  if (currentSearchOverlay) return;

  // Remember what was focused before opening search
  originatingFocusElement = document.querySelector('.case.is-focused, .flat-library-card.is-focused') as HTMLElement;
  if (originatingFocusElement) {
    originatingFocusElement.classList.remove('is-focused');
  }

  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'flat-search-overlay';
  currentSearchOverlay = overlay;

  overlay.innerHTML = `
    <div class="flat-search-container">
      <div class="flat-search-input-wrapper">
        <span class="flat-search-icon">🔍</span>
        <input type="text" class="flat-search-input" placeholder="Search titles, directors, genres..." autocomplete="off" />
      </div>
      <div class="flat-search-results-container">
        <div class="flat-search-results-grid"></div>
      </div>
    </div>
  `;

  mount.appendChild(overlay);

  const searchInput = overlay.querySelector('.flat-search-input') as HTMLInputElement;
  const resultsGrid = overlay.querySelector('.flat-search-results-grid') as HTMLElement;

  // Collect movies to search
  let allMovies: Movie[] = [];
  if (currentLibraryId) {
    const activeLib = libraries.find(l => l.id === currentLibraryId);
    if (activeLib) {
      allMovies = activeLib.movies;
    }
  } else {
    // Search across all libraries
    const seen = new Set<string>();
    libraries.forEach(lib => {
      lib.movies.forEach(m => {
        if (!seen.has(m.id)) {
          seen.add(m.id);
          allMovies.push(m);
        }
      });
    });
  }

  // Setup keydown listener for general navigation inside search
  const handleOverlayKeydown = (e: KeyboardEvent) => {
    const focused = document.activeElement as HTMLElement;
    const isInputFocused = focused === searchInput;

    // Any keydown here is keyboard-driven navigation; setSearchFocus gates its auto-centering
    // scroll on this so hover doesn't trigger it (#101, matching flat-nav.ts).
    isNavigatingWithKeyboard = true;

    if (e.key === 'Escape') {
      closeFlatSearchOverlay();
      e.preventDefault();
      return;
    }

    if (e.key === 'Backspace' && isInputFocused && searchInput.value.length === 0) {
      closeFlatSearchOverlay();
      e.preventDefault();
      return;
    }

    const cases = Array.from(resultsGrid.querySelectorAll('.case')) as HTMLElement[];

    if (isInputFocused) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        if (cases.length > 0) {
          setSearchFocus(cases[0]);
          e.preventDefault();
        }
      }
    } else {
      // Focus is on a result case
      if (e.key === 'Backspace') {
        closeFlatSearchOverlay();
        e.preventDefault();
        return;
      }

      if (e.key === 'Enter') {
        const movie = (focused as any).movie as Movie;
        if (movie) {
          focused.classList.remove('is-focused');
          openDetailsOverlay(movie, focused, mount);
        }
        e.preventDefault();
        return;
      }

      if (e.key === 'ArrowLeft') {
        const next = navigateSearchGrid(cases, focused, 'ArrowLeft');
        if (next) setSearchFocus(next);
        e.preventDefault();
      } else if (e.key === 'ArrowRight') {
        const next = navigateSearchGrid(cases, focused, 'ArrowRight');
        if (next) setSearchFocus(next);
        e.preventDefault();
      } else if (e.key === 'ArrowDown') {
        const next = navigateSearchGrid(cases, focused, 'ArrowDown');
        if (next) setSearchFocus(next);
        e.preventDefault();
      } else if (e.key === 'ArrowUp') {
        const next = navigateSearchGrid(cases, focused, 'ArrowUp');
        if (next) {
          setSearchFocus(next);
        } else {
          // If no element directly above, return focus to search input
          searchInput.focus();
          searchInput.classList.add('is-focused');
          focused.classList.remove('is-focused');
        }
        e.preventDefault();
      }
    }
  };

  overlay.addEventListener('keydown', handleOverlayKeydown);

  // Mouse hover event delegation for focus
  overlay.addEventListener('mouseover', (e) => {
    if (document.querySelector('.flat-detail-overlay')) return;
    const target = e.target as HTMLElement;
    const caseEl = target.closest('.case') as HTMLElement;
    if (caseEl && document.activeElement !== caseEl) {
      isNavigatingWithKeyboard = false;
      setSearchFocus(caseEl);
    }
  });

  // Perform search on input change
  const performSearch = () => {
    const query = searchInput.value.trim();
    resultsGrid.innerHTML = '';

    if (query.length === 0) {
      resultsGrid.innerHTML = `
        <div class="flat-search-empty-state">
          <span class="flat-search-empty-icon">🍿</span>
          <h3 class="flat-search-empty-title">Start Typing...</h3>
          <p class="flat-search-empty-text">Type title, director, or genre to explore.</p>
        </div>
      `;
      return;
    }

    const filtered = allMovies.filter(m => {
      return (
        fuzzyMatch(m.title, query) ||
        (m.director && fuzzyMatch(m.director, query)) ||
        (m.genres && m.genres.some(g => fuzzyMatch(g, query)))
      );
    });

    if (filtered.length === 0) {
      resultsGrid.innerHTML = `
        <div class="flat-search-empty-state">
          <span class="flat-search-empty-icon">🍿</span>
          <h3 class="flat-search-empty-title">No Titles Found</h3>
          <p class="flat-search-empty-text"></p>
        </div>
      `;
      // textContent, not template interpolation: the query is user input
      const emptyText = resultsGrid.querySelector('.flat-search-empty-text');
      if (emptyText) emptyText.textContent = `We couldn't find any matches for "${query}".`;
      return;
    }

    filtered.slice(0, MAX_SEARCH_RESULTS).forEach(movie => {
      const caseEl = createCase(movie);
      caseEl.setAttribute('tabindex', '0');
      resultsGrid.appendChild(caseEl);
    });
  };

  const debouncedSearch = () => {
    if (searchDebounceTimer !== null) {
      window.clearTimeout(searchDebounceTimer);
    }
    searchDebounceTimer = window.setTimeout(() => {
      searchDebounceTimer = null;
      performSearch();
    }, SEARCH_DEBOUNCE_MS);
  };

  searchInput.addEventListener('input', debouncedSearch);

  // Focus the input
  searchInput.focus();
  searchInput.classList.add('is-focused');

  if (initialQuery) {
    searchInput.value = initialQuery;
    performSearch();
  } else {
    performSearch();
  }

  // Trigger CSS transition animation
  requestAnimationFrame(() => {
    overlay.classList.add('visible');
  });
}

export function closeFlatSearchOverlay(): void {
  if (!currentSearchOverlay) return;

  const overlay = currentSearchOverlay;
  currentSearchOverlay = null;

  if (searchDebounceTimer !== null) {
    window.clearTimeout(searchDebounceTimer);
    searchDebounceTimer = null;
  }

  overlay.classList.remove('visible');

  setTimeout(() => {
    overlay.remove();
    // Restore focus
    if (originatingFocusElement && document.body.contains(originatingFocusElement)) {
      originatingFocusElement.classList.add('is-focused');
      originatingFocusElement.focus();
    }
  }, 250);
}

function setSearchFocus(el: HTMLElement) {
  // Remove focus class from all elements in the search overlay
  if (currentSearchOverlay) {
    const focusedElements = currentSearchOverlay.querySelectorAll('.is-focused, :focus');
    focusedElements.forEach(item => {
      item.classList.remove('is-focused');
      if (item instanceof HTMLElement && item !== el) {
        item.blur();
      }
    });
  }

  el.classList.add('is-focused');
  el.focus({ preventScroll: true });

  // Auto-centering is reserved for keyboard navigation, matching the main case grid (#101).
  // 'nearest' already no-ops when the result is fully visible, so hover was only mildly
  // affected, but gating it fully keeps the two focus paths consistent.
  if (isNavigatingWithKeyboard) {
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

// Geometric spatial navigation in search results grid
function navigateSearchGrid(
  cases: HTMLElement[],
  current: HTMLElement,
  direction: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'
): HTMLElement | null {
  const currentRect = current.getBoundingClientRect();
  const currentCenterX = currentRect.left + currentRect.width / 2;
  const currentCenterY = currentRect.top + currentRect.height / 2;

  let best: HTMLElement | null = null;
  let bestScore = Infinity;

  for (const card of cases) {
    if (card === current) continue;
    const rect = card.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = centerX - currentCenterX;
    const dy = centerY - currentCenterY;

    let isMatch = false;
    if (direction === 'ArrowLeft' && dx < -10 && Math.abs(dy) < rect.height) {
      isMatch = true;
    } else if (direction === 'ArrowRight' && dx > 10 && Math.abs(dy) < rect.height) {
      isMatch = true;
    } else if (direction === 'ArrowUp' && dy < -10) {
      isMatch = true;
    } else if (direction === 'ArrowDown' && dy > 10) {
      isMatch = true;
    }

    if (isMatch) {
      const distance = Math.sqrt(dx * dx + dy * dy);
      const perpendicularDistance = (direction === 'ArrowLeft' || direction === 'ArrowRight') ? Math.abs(dy) : Math.abs(dx);
      const score = distance + perpendicularDistance * 2;
      if (score < bestScore) {
        bestScore = score;
        best = card;
      }
    }
  }

  return best;
}
