import { openDetailsOverlay } from './flat-detail';
import { Movie } from '../jellyfin';
import { isFlatSearchOverlayOpen } from './flat-search';
import { flatSignal } from './flat-lifecycle';

let isNavigatingWithKeyboard = false;

// Cached reference to whichever element currently carries `.is-focused` among the ones this
// module manages (.case / .flat-library-card / .flat-back-btn / .flat-menu-btn). Kept in sync
// by setFocus/setButtonFocus/setLibraryFocus below. A couple of other modules (the details
// overlay, the settings drawer) save/restore focus by adding/removing the class directly on
// that same DOM node around a modal, and a fresh library render can focus a brand-new node
// directly on an empty-library fallback — both are handled safely because every read below
// re-validates the cache (identity + class + still-attached) before trusting it, and falls
// back to the original full-document query when it's stale. This turns the `.is-focused`
// lookups that used to run on every keydown repeat AND every mouseover case-crossing
// (#101, #119) into O(1) reads in the common case instead of scanning a ~10-20k node tree.
let focusedElement: HTMLElement | null = null;

function getCurrentFocused(): HTMLElement | null {
  if (focusedElement && document.body.contains(focusedElement) && focusedElement.classList.contains('is-focused')) {
    return focusedElement;
  }
  focusedElement = document.querySelector(
    '.case.is-focused, .flat-library-card.is-focused, .flat-back-btn.is-focused, .flat-menu-btn.is-focused'
  ) as HTMLElement | null;
  return focusedElement;
}

function scrollToFocused(caseEl: HTMLElement) {
  // Scroll horizontal row container
  const rowContainer = caseEl.closest('.flat-row-scroll-container') as HTMLElement;
  if (rowContainer) {
    const containerWidth = rowContainer.clientWidth;
    const caseLeft = caseEl.offsetLeft;
    const caseWidth = caseEl.clientWidth;

    // Center the focused case in the horizontal row
    const targetScrollLeft = caseLeft - (containerWidth / 2) + (caseWidth / 2);
    rowContainer.scrollTo({
      left: targetScrollLeft,
      behavior: 'smooth'
    });
  }

  // Scroll vertical main content container
  const mainContent = caseEl.closest('.flat-content') as HTMLElement;
  if (mainContent) {
    const rowEl = caseEl.closest('.flat-row') as HTMLElement;
    if (rowEl) {
      const containerHeight = mainContent.clientHeight;
      const rowTop = rowEl.offsetTop;
      const rowHeight = rowEl.clientHeight;

      // Center the row vertically in the main viewport
      const targetScrollTop = rowTop - (containerHeight / 2) + (rowHeight / 2);
      mainContent.scrollTo({
        top: targetScrollTop,
        behavior: 'smooth'
      });
    }
  }
}

export function setButtonFocus(el: HTMLElement) {
  const current = getCurrentFocused();
  if (current) current.classList.remove('is-focused');

  el.classList.add('is-focused');
  el.focus({ preventScroll: true });
  focusedElement = el;
}

export function setFocus(caseEl: HTMLElement) {
  const current = getCurrentFocused();
  if (current) current.classList.remove('is-focused');

  // Add focus class to the target case
  caseEl.classList.add('is-focused');
  caseEl.focus({ preventScroll: true });
  focusedElement = caseEl;

  // Auto-centering is reserved for keyboard navigation. On hover this used to run
  // unconditionally, which kicked off a scroll/mouseover feedback loop: the horizontal row
  // scroll is `scroll-behavior: smooth` (flat.css), so it kept dragging a different case under
  // the stationary pointer for the whole animation, re-firing mouseover and scrolling again;
  // the vertical page scroll (no smooth behavior set) was worse, instantly yanking the whole
  // page on every hover in a non-centered row. (#101)
  if (isNavigatingWithKeyboard) {
    scrollToFocused(caseEl);
  }
}

export function setLibraryFocus(el: HTMLElement) {
  const current = getCurrentFocused();
  if (current) current.classList.remove('is-focused');

  el.classList.add('is-focused');
  el.focus({ preventScroll: true });
  focusedElement = el;
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// Geometric spatial navigation
function navigateSpatialGrid(
  elements: HTMLElement[],
  current: HTMLElement,
  direction: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'
): HTMLElement | null {
  const currentRect = current.getBoundingClientRect();
  const currentCenterX = currentRect.left + currentRect.width / 2;
  const currentCenterY = currentRect.top + currentRect.height / 2;

  let best: HTMLElement | null = null;
  let bestScore = Infinity;

  for (const card of elements) {
    if (card === current) continue;
    const rect = card.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = centerX - currentCenterX;
    const dy = centerY - currentCenterY;

    let isMatch = false;
    if (direction === 'ArrowLeft' && dx < -10 && Math.abs(dy) < Math.max(rect.height, currentRect.height)) {
      isMatch = true;
    } else if (direction === 'ArrowRight' && dx > 10 && Math.abs(dy) < Math.max(rect.height, currentRect.height)) {
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

export function initFlatNavigation() {
  // 1. Keyboard navigation listener
  window.addEventListener('keydown', (e) => {
    // If details overlay is open, do nothing
    if (document.querySelector('.flat-detail-overlay')) {
      return;
    }
    // If search overlay is open, do nothing (cheap module-state check instead of a
    // document-wide query — see isFlatSearchOverlayOpen; #119)
    if (isFlatSearchOverlayOpen()) {
      return;
    }
    // Also if settings drawer is open, don't run regular nav
    if (document.getElementById('settings-drawer-overlay')?.classList.contains('visible')) {
      return;
    }

    // Any keydown reaching this point is keyboard-driven navigation; setFocus/scrollToFocused
    // gate their auto-centering scroll on this so mouse hover never triggers it (#101).
    isNavigatingWithKeyboard = true;

    // ─── Dropdown Menu Mode ───
    const dropdown = document.getElementById('flat-menu-dropdown');
    if (dropdown && dropdown.classList.contains('visible')) {
      const items = Array.from(dropdown.querySelectorAll('.flat-menu-item')) as HTMLElement[];
      const activeItem = dropdown.querySelector('.flat-menu-item.is-focused') as HTMLElement;
      let idx = items.indexOf(activeItem);

      if (e.key === 'ArrowDown') {
        idx = (idx + 1) % items.length;
        items.forEach((item, i) => item.classList.toggle('is-focused', i === idx));
        items[idx].focus();
        e.preventDefault();
      } else if (e.key === 'ArrowUp') {
        idx = (idx - 1 + items.length) % items.length;
        items.forEach((item, i) => item.classList.toggle('is-focused', i === idx));
        items[idx].focus();
        e.preventDefault();
      } else if (e.key === 'Enter') {
        if (activeItem) {
          activeItem.click();
        }
        e.preventDefault();
      } else if (e.key === 'Escape' || e.key === 'Backspace') {
        const menuBtn = document.querySelector('.flat-menu-btn') as HTMLElement;
        dropdown.classList.remove('visible');
        if (menuBtn) {
          menuBtn.setAttribute('aria-expanded', 'false');
          setButtonFocus(menuBtn);
        }
        e.preventDefault();
      }
      return;
    }

    // Shared cache-aware lookup for the mode checks below, replacing four separate
    // document-wide `.is-focused` queries per keydown event (#119).
    const currentFocus = getCurrentFocused();

    // ─── Header Menu Button Mode ───
    const focusedMenu = currentFocus?.classList.contains('flat-menu-btn') ? currentFocus : null;
    if (focusedMenu) {
      if (e.key === 'ArrowDown') {
        const backBtn = document.querySelector('.flat-back-btn') as HTMLElement;
        if (backBtn) {
          setButtonFocus(backBtn);
        } else {
          const libraryCards = Array.from(document.querySelectorAll('.flat-library-card')) as HTMLElement[];
          if (libraryCards.length > 0) {
            setLibraryFocus(libraryCards[0]);
          } else {
            const firstCase = document.querySelector('.case') as HTMLElement;
            if (firstCase) setFocus(firstCase);
          }
        }
        e.preventDefault();
      } else if (e.key === 'Enter' || e.key === ' ') {
        focusedMenu.click();
        e.preventDefault();
      }
      return;
    }

    // ─── Inline Back Button Mode ───
    const focusedBack = currentFocus?.classList.contains('flat-back-btn') ? currentFocus : null;
    if (focusedBack) {
      if (e.key === 'ArrowUp') {
        const menuBtn = document.querySelector('.flat-menu-btn') as HTMLElement;
        if (menuBtn) {
          setButtonFocus(menuBtn);
        }
        e.preventDefault();
      } else if (e.key === 'ArrowDown') {
        const firstCase = document.querySelector('.case') as HTMLElement;
        if (firstCase) {
          setFocus(firstCase);
        }
        e.preventDefault();
      } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'Backspace' || e.key === 'Escape') {
        focusedBack.click();
        e.preventDefault();
      }
      return;
    }

    const libraryCards = Array.from(document.querySelectorAll('.flat-library-card')) as HTMLElement[];
    if (libraryCards.length > 0) {
      // ─── Library Selector Grid Mode ───
      const focusedCard = currentFocus?.classList.contains('flat-library-card') ? currentFocus : null;
      if (!focusedCard) {
        setLibraryFocus(libraryCards[0]);
        e.preventDefault();
        return;
      }

      if (e.key === 'Enter') {
        focusedCard.click();
        e.preventDefault();
        return;
      }

      let direction: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | null = null;
      if (e.key === 'ArrowLeft') direction = 'ArrowLeft';
      else if (e.key === 'ArrowRight') direction = 'ArrowRight';
      else if (e.key === 'ArrowUp') direction = 'ArrowUp';
      else if (e.key === 'ArrowDown') direction = 'ArrowDown';

      if (direction) {
        const menuBtn = document.querySelector('.flat-menu-btn') as HTMLElement;
        const candidates = menuBtn ? [...libraryCards, menuBtn] : libraryCards;
        const next = navigateSpatialGrid(candidates, focusedCard, direction);
        if (next) {
          if (next.classList.contains('flat-menu-btn')) {
            setButtonFocus(next);
          } else {
            setLibraryFocus(next);
          }
        }
        e.preventDefault();
      }
      return;
    }

    // ─── Row Browse Mode (Cases Nav) ───
    const focused = currentFocus?.classList.contains('case') ? currentFocus : null;

    if (e.key === 'Backspace') {
      const backBtn = document.querySelector('.flat-back-btn') as HTMLElement;
      if (backBtn) {
        backBtn.click();
        e.preventDefault();
        return;
      }
    }

    if (!focused) {
      // If nothing is focused, focus the very first case
      const firstCase = document.querySelector('.case') as HTMLElement;
      if (firstCase) {
        setFocus(firstCase);
        e.preventDefault();
      }
      return;
    }

    const currentRow = focused.closest('.flat-row') as HTMLElement;
    if (!currentRow) return;

    const rowScrollContainer = currentRow.querySelector('.flat-row-scroll-container') as HTMLElement;
    if (!rowScrollContainer) return;

    const rowCases = Array.from(rowScrollContainer.querySelectorAll('.case')) as HTMLElement[];
    const currentIndex = rowCases.indexOf(focused);

    if (e.key === 'ArrowLeft') {
      if (currentIndex > 0) {
        setFocus(rowCases[currentIndex - 1]);
      }
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      if (currentIndex < rowCases.length - 1) {
        setFocus(rowCases[currentIndex + 1]);
      }
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      // Find previous flat-row
      let prevRow = currentRow.previousElementSibling as HTMLElement;
      while (prevRow && !prevRow.classList.contains('flat-row')) {
        prevRow = prevRow.previousElementSibling as HTMLElement;
      }

      if (prevRow) {
        const prevScrollContainer = prevRow.querySelector('.flat-row-scroll-container');
        if (prevScrollContainer) {
          const prevCases = Array.from(prevScrollContainer.querySelectorAll('.case')) as HTMLElement[];
          if (prevCases.length > 0) {
            const targetIndex = Math.min(currentIndex, prevCases.length - 1);
            setFocus(prevCases[targetIndex]);
          }
        }
      } else {
        const backBtn = document.querySelector('.flat-back-btn') as HTMLElement;
        if (backBtn) {
          setButtonFocus(backBtn);
        } else {
          const menuBtn = document.querySelector('.flat-menu-btn') as HTMLElement;
          if (menuBtn) {
            setButtonFocus(menuBtn);
          }
        }
      }
      e.preventDefault();
    } else if (e.key === 'ArrowDown') {
      // Find next flat-row
      let nextRow = currentRow.nextElementSibling as HTMLElement;
      while (nextRow && !nextRow.classList.contains('flat-row')) {
        nextRow = nextRow.nextElementSibling as HTMLElement;
      }

      if (nextRow) {
        const nextScrollContainer = nextRow.querySelector('.flat-row-scroll-container');
        if (nextScrollContainer) {
          const nextCases = Array.from(nextScrollContainer.querySelectorAll('.case')) as HTMLElement[];
          if (nextCases.length > 0) {
            const targetIndex = Math.min(currentIndex, nextCases.length - 1);
            setFocus(nextCases[targetIndex]);
          }
        }
      }
      e.preventDefault();
    } else if (e.key === 'Enter') {
      const movie = (focused as any).movie as Movie;
      const mount = focused.closest('.flat-store-root') as HTMLElement;
      if (movie && mount) {
        focused.classList.remove('is-focused');
        openDetailsOverlay(movie, focused, mount);
      }
      e.preventDefault();
    }
  }, { signal: flatSignal() });

  // 2. Mouse hover focus listener (via event delegation)
  window.addEventListener('mouseover', (e) => {
    if (document.querySelector('.flat-detail-overlay')) {
      return;
    }
    if (isFlatSearchOverlayOpen()) {
      return;
    }
    const target = e.target as HTMLElement;

    // Library cards hover
    const cardEl = target.closest('.flat-library-card') as HTMLElement;
    if (cardEl && !cardEl.classList.contains('is-focused')) {
      isNavigatingWithKeyboard = false;
      setLibraryFocus(cardEl);
      return;
    }

    // Cases hover
    const caseEl = target.closest('.case') as HTMLElement;
    if (caseEl && !caseEl.classList.contains('is-focused')) {
      isNavigatingWithKeyboard = false;
      setFocus(caseEl);
      return;
    }

    // Back button hover
    const backBtn = target.closest('.flat-back-btn') as HTMLElement;
    if (backBtn && !backBtn.classList.contains('is-focused')) {
      isNavigatingWithKeyboard = false;
      setButtonFocus(backBtn);
      return;
    }

    // Menu button hover
    const menuBtn = target.closest('.flat-menu-btn') as HTMLElement;
    if (menuBtn && !menuBtn.classList.contains('is-focused')) {
      isNavigatingWithKeyboard = false;
      setButtonFocus(menuBtn);
      return;
    }
  }, { signal: flatSignal() });
}

