// Clasp -> clerk recommendation flow & person endcaps — extracted from
// StoreScene (three-scene.ts keeps one-line delegating stubs): the ASK FOR
// RECOMMENDATIONS clasp cursor + walk-mode focus, calling the clerk over,
// section-scoped suggestion pools, the actor/director endcap browse, the
// Jellyseerr gap-title order/dismiss handlers, and the clerk debug/audit
// entries. Every function takes the StoreScene as its first parameter and
// reads/writes scene state exactly as the original methods did.
import * as THREE from 'three';
import { Movie } from './jellyfin';
import { posterQueue, CASE_HEIGHT, CASE_DEPTH, posterPixelCache, releaseEndcapPosterTexture, getCaseGeometry, getRentalCaseGeometry, createHeroJellyfinMaterials, restampCollectionGapCase } from './video-case';
import { AISLE_SHELF_HEIGHTS, LEAN_ANGLE, UNIT_FRAME_HEIGHT, unitDepthAtHeight, BACK_WALL_UNIT_IDX, SECTION_CAPACITY, MovieSlot, storeCategory, FixturePlacement, ShelvingUnit } from './store-layout';
import { ENDCAP_CORE_DEPTH } from './fixtures/genre-endcap';
import { getLastUserActivity } from './user-activity';
import { showClerkToast, hideClerkToast } from './carried-tapes';
import { type ClaspTarget } from './fixtures/shelf-clasp';
import { recommend as recommendFromLibrary } from './clerk-recommend';
import { isDiscoveryRequested, markTitleDismissed } from './jellyseerr';
import { buildLibraryIndex, pickRecommendations } from './recommend-why';
import type { ClerkSuggestion } from './clerk-interaction';
import { CLERK_SLEEP_INPUT_MS } from './scene-shared';
import type { StoreScene } from './three-scene';

/** How far out from the shelf face the clerk stands to deliver. */
const CLASP_STAND_OFF = 2.2;
/** Give up waiting for her rather than leaving the player with nothing. */
const CLASP_WALK_TIMEOUT_MS = 14000;

export function markDiscoveryRequested(scene: StoreScene, movieId: string): void {
  scene.requestRender(); // restyles a discovery case — wake the on-demand renderer (#24)
  scene.slottedFixtures.forEach((fixture) => {
    if (typeof (fixture as any).markRequested === 'function') {
      (fixture as any).markRequested(movieId);
    }
  });
  for (const lib of scene.libraries) {
    const m = lib.movies.find((mm) => mm.id === movieId);
    if (m) {
      if (m.collectionGap || m.discovery) restampCollectionGapCase(m);
      break;
    }
  }
}

/**
 * Is this case one the player can cross off ("not interested")? An un-ordered
 * not-in-stock case qualifies wherever it stands: a shelved collection gap /
 * inline discovery suggestion (a library entry), or a FOR YOU order candidate
 * on a staff-picks endcap (fixture stock, not a library entry — the endcap
 * keeps an honest empty spot afterwards, exactly like the shelf does).
 */
function isDismissable(scene: StoreScene, movie: Movie): boolean {
  if (!(movie.collectionGap || movie.discovery) || typeof movie.tmdbId !== 'number') return false;
  if (movie.discoveryRequested || isDiscoveryRequested(movie.tmdbId)) return false;
  if (scene.libraries.some((l) => l.movies.some((mm) => mm.id === movie.id))) return true;
  // Fixture stock: only while a case is actually standing there to remove.
  let onFixture = false;
  scene.slotsByPosition.forEach((slot) => {
    if (!slot.hidden && slot.movie.id === movie.id) onFixture = true;
  });
  return onFixture;
}

/**
 * Can the case you're holding up right now be crossed off? Asked ahead of
 * time so the input layer can arm the hold-▼ gesture and put its prompt up
 * only where the gesture will actually do something.
 */
export function canDismissSelectedTitle(scene: StoreScene): boolean {
  if (scene.mode !== 'inspect') return false;
  const movie = scene.getSelectedMovie();
  return !!movie && isDismissable(scene, movie);
}

export function dismissGapTitle(scene: StoreScene, movie: Movie): boolean {
  if (!isDismissable(scene, movie)) return false;
  markTitleDismissed(movie.tmdbId as number);
  // Endcap order candidates are stocked from staffPickMovies, not a library —
  // drop it there (and from the fixture's own stock list) so nothing restocks
  // the case behind the player's back.
  scene.staffPickMovies = scene.staffPickMovies.filter((m) => m.id !== movie.id);
  scene.slottedFixtures.forEach((fixture) => {
    if (typeof (fixture as any).removeStock === 'function') (fixture as any).removeStock(movie.id);
  });
  // Drop it from the clerk's "want me to order it?" pool too — a suggestion
  // the player just crossed off must not resurface in her dialog.
  scene.discoveryMovies = scene.discoveryMovies.filter((m) => m.id !== movie.id);
  scene.requestRender(); // slots hide below — wake the on-demand renderer
  if (scene.mode === 'inspect') scene.backAction();
  for (let libIdx = 0; libIdx < scene.libraries.length; libIdx++) {
    const entries = scene.layoutFor(libIdx).entries;
    for (let i = 0; i < entries.length; i++) {
      if (entries[i]?.id === movie.id) entries[i] = null;
    }
    const libMovies = scene.libraries[libIdx].movies;
    for (let i = libMovies.length - 1; i >= 0; i--) {
      if (libMovies[i].id === movie.id) libMovies.splice(i, 1);
    }
  }
  // Collect before re-keying — hidden slots move to non-position keys so the
  // now-empty shelf cell reads as an empty cell, not a phantom selection.
  const doomed: { key: string; slot: MovieSlot }[] = [];
  scene.slotsByPosition.forEach((slot, key) => {
    if (slot.movie.id === movie.id && !slot.hidden) doomed.push({ key, slot });
  });
  doomed.forEach(({ key, slot }, i) => {
    slot.hidden = true;
    slot.needsInitialMatrixUpdate = true;
    scene.dirtySlots.add(slot);
    scene.slotsByPosition.delete(key);
    slot.key = `hidden_dismissed_${movie.id}_${i}`;
    scene.slotsByPosition.set(slot.key, slot);
  });
  showClerkToast(`Not your thing? Say no more, hon — I've crossed "${movie.title}" off the list. You won't see it again.`, 5200);
  scene.onConsoleLog(`[System] "${movie.title}" marked not interested — its case is gone for good.`, 'system');
  return true;
}

export function claspForCursor(scene: StoreScene): THREE.Mesh | null {
  const slot = scene.slotsByPosition.get(scene.getActiveSlotKey());
  if (!slot) return null;
  // Matching by proximity rather than re-deriving unit/side/section maths:
  // clasps are placed from the same section geometry the slots are, so the
  // nearest one facing this run is the right one, and this keeps working
  // under every arrangement (straight, diagonal, herringbone).
  const here = new THREE.Vector3(slot.currentX, slot.currentY, slot.currentZ);
  // Section-scale. Clasps sit one per section now, so the right one is the
  // one on this run — a wide radius would reach past it to a neighbouring
  // aisle and light something the player can't see.
  return scene.shelfClasps.nearestTo(here, 7.0);
}

export function enterClaspCursor(scene: StoreScene): boolean {
  // The clasp plaques were removed (count is 0); the browse cursor must not
  // drop onto an invisible marker. The markers still feed nearestTo for the
  // clerk's section-scoped walk-up recommendation.
  if (scene.shelfClasps.count === 0) return false;
  const mesh = scene.claspForCursor();
  if (!mesh) return false;
  scene.claspCursorActive = true;
  scene.claspFocusSource = 'cursor';
  const target = scene.shelfClasps.targetFor(mesh);
  scene.shelfClasps.setFocused(mesh, scene.claspPromptText(target), 'OK');
  scene.requestRender();
  return true;
}

export function exitClaspCursor(scene: StoreScene): void {
  if (!scene.claspCursorActive) return;
  scene.claspCursorActive = false;
  scene.claspFocusSource = null;
  scene.shelfClasps.setFocused(null);
  scene.requestRender();
}

export function claspSectionName(scene: StoreScene, target: { category: string | null; libraryIdx: number } | null): string | null {
  if (!target) return null;
  return target.category ?? scene.libraries[target.libraryIdx]?.name ?? null;
}

export function claspPromptText(scene: StoreScene, target: { category: string | null; libraryIdx: number } | null): string {
  const name = scene.claspSectionName(target);
  return name ? `Ask about ${name.toLowerCase()}` : 'Ask for a recommendation';
}

export function activateFocusedClasp(scene: StoreScene): boolean {
  const target = scene.shelfClasps.focusedTarget();
  if (!target) return false;
  scene.callClerkToClasp(target);
  return true;
}

export function updateWalkClaspFocus(scene: StoreScene): void {
  if (scene.shelfClasps.count === 0) return;
  if (!scene.isWalkAroundMode || scene.claspCursorActive) {
    // Only ever clear focus this hook itself set. Clearing unconditionally
    // wiped the pointer's hover highlight one frame after it was applied.
    if (scene.claspFocusSource === 'walk') {
      scene.claspFocusSource = null;
      scene.shelfClasps.setFocused(null);
    }
    return;
  }
  scene._claspLook.set(0, 0, -1).applyQuaternion(scene.camera.quaternion);
  const mesh = scene.shelfClasps.nearestInReach(scene.camera.position, scene._claspLook);
  if (!mesh && scene.claspFocusSource !== 'walk') return; // nothing of ours to clear
  const target = mesh ? scene.shelfClasps.targetFor(mesh) : null;
  if (mesh !== scene.shelfClasps.focusedMesh) scene.requestRender();
  scene.claspFocusSource = mesh ? 'walk' : null;
  scene.shelfClasps.setFocused(mesh, scene.claspPromptText(target), 'E');
}

export function firstReachableClasp(scene: StoreScene): { target: ClaspTarget; stand: THREE.Vector3 } | null {
  for (const mesh of scene.shelfClasps.pickables) {
    const target = scene.shelfClasps.targetFor(mesh);
    if (!target) continue;
    const stand = target.position.clone().addScaledVector(target.outward, 2.6);
    const c = scene.constrainWalkPosition(
      stand.x, stand.z, stand.x, stand.z, scene.getStoreWidth(), scene.backWallZ + 1.5);
    if (Math.abs(c.x - stand.x) < 0.15 && Math.abs(c.z - stand.z) < 0.15) {
      return { target, stand };
    }
  }
  return null;
}

export function focusFirstClasp(scene: StoreScene): { category: string | null; libraryIdx: number } | null {
  const reachable = scene.firstReachableClasp();
  if (!reachable) return null;
  const { target, stand } = reachable;
  // Scene yaw looks along (-sin y, 0, -cos y); to look back AT the clasp the
  // look direction is -outward, which gives yaw = atan2(outward.x, outward.z).
  const yawDeg = (Math.atan2(target.outward.x, target.outward.z) * 180) / Math.PI;
  // Keep the walk clamps on: with the freecam escape hatch enabled a clasp
  // near the front glass puts the camera outside the building.
  scene.teleportWalk(stand.x, stand.z, yawDeg, -8, target.position.y + 0.7);
  return { category: target.category, libraryIdx: target.libraryIdx };
}

export function debugClaspProbe(scene: StoreScene): Record<string, unknown> {
  const r: Record<string, unknown> = {
    count: scene.shelfClasps.count,
    mode: scene.mode,
    walkMode: scene.isWalkAroundMode,
    cursorActive: scene.claspCursorActive,
    focusSource: scene.claspFocusSource,
    focused: !!scene.shelfClasps.focusedMesh,
  };
  const first = scene.shelfClasps.pickables[0];
  if (!first) return r;
  const world = first.getWorldPosition(new THREE.Vector3());
  r.claspWorld = [world.x, world.y, world.z].map((n) => +n.toFixed(2));
  r.targetForOk = !!scene.shelfClasps.targetFor(first);

  // Browse-cursor path.
  const slot = scene.slotsByPosition.get(scene.getActiveSlotKey());
  r.cursorSlot = slot ? [slot.currentX, slot.currentY, slot.currentZ].map((n) => +n.toFixed(2)) : null;
  r.selectedShelf = scene.selectedShelf;
  r.maxShelf = scene.browseMaxShelf();
  const cursorClasp = scene.claspForCursor();
  r.cursorFindsClasp = !!cursorClasp;
  if (cursorClasp) {
    // Distance to the clasp the CURSOR would pick, not to clasps[0] — the
    // difference between those two is exactly the bug this probe missed.
    const cw = cursorClasp.getWorldPosition(new THREE.Vector3());
    r.cursorClaspWorld = [cw.x, cw.y, cw.z].map((n) => +n.toFixed(2));
    r.cursorClaspLocal = [cursorClasp.position.x, cursorClasp.position.y, cursorClasp.position.z].map((n) => +n.toFixed(2));
    r.camPos = [scene.camera.position.x, scene.camera.position.y, scene.camera.position.z].map((n) => +n.toFixed(2));
    r.cursorClaspCamDist = +scene.camera.position.distanceTo(cw).toFixed(2);
    const cn = cw.clone().project(scene.camera);
    r.cursorClaspOnScreen = Math.abs(cn.x) <= 1 && Math.abs(cn.y) <= 1 && cn.z < 1;
  }

  // Hover path: aim exactly at the clasp's own screen position.
  const ndc = world.clone().project(scene.camera);
  r.claspNdc = [ndc.x, ndc.y].map((n) => +n.toFixed(2));
  r.claspOnScreen = Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && ndc.z < 1;
  scene._raycaster.setFromCamera(scene._mouse.set(ndc.x, ndc.y), scene.camera);
  r.hoverHits = scene._raycaster.intersectObjects(scene.shelfClasps.pickables, false).length;

  // Walk path.
  scene._claspLook.set(0, 0, -1).applyQuaternion(scene.camera.quaternion);
  r.camDist = +scene.camera.position.distanceTo(world).toFixed(2);
  r.walkInReach = !!scene.shelfClasps.nearestInReach(scene.camera.position, scene._claspLook);
  // What happens AFTER selecting is the other half of "can't select it".
  r.clerkExists = !!scene.clerk;
  r.clerkState = scene.clerk ? (scene.clerk as unknown as { state: string }).state : null;
  if (scene.clerk) {
    const cp = scene.clerk.group.position;
    r.clerkPos = [cp.x, cp.y, cp.z].map((n) => +n.toFixed(2));
    r.clerkWaypoints = (scene.clerk as unknown as { waypoints: unknown[] }).waypoints?.length ?? -1;
    r.clerkWpIdx = (scene.clerk as unknown as { currentWaypointIdx: number }).currentWaypointIdx;
  }
  r.dialogVisible = !!document.querySelector('.clerk-dialog.visible');
  r.promptVisible = !!document.querySelector('.clasp-prompt.visible');
  return r;
}

export function debugCallClerkToFirstClasp(scene: StoreScene): boolean {
  const reachable = scene.firstReachableClasp();
  if (!reachable) return false;
  scene.callClerkToClasp(reachable.target);
  return true;
}

export function debugClerkTalkHere(scene: StoreScene, rolls = 0): boolean {
  const target = scene.firstReachableClasp()?.target;
  if (!target) return false;
  scene.focusFirstClasp(); // walk mode, standing at the section, facing it
  // Park her between player and shelf, stepped aside so she doesn't block
  // the clasp, turned to face the player.
  const perp = new THREE.Vector3(-target.outward.z, 0, target.outward.x);
  const stand = target.position.clone()
    .addScaledVector(target.outward, CLASP_STAND_OFF)
    .addScaledVector(perp, 1.6);
  const toPlayer = scene.camera.position.clone().sub(stand);
  const headingDeg = (Math.atan2(toPlayer.x, toPlayer.z) * 180) / Math.PI;
  scene.debugPoseClerk(stand.x, stand.z, headingDeg, 'talk');
  return scene.clerk?.debugOpenChatRecommend(rolls) ?? false;
}

export function callClerkToClasp(scene: StoreScene, target: ClaspTarget) {
  const pool = scene.claspPool(target);
  const suggestions = scene.claspSuggestions(target);
  const pick = recommendFromLibrary(pool);
  if (!pick && suggestions.length === 0) {
    showClerkToast("Nothing in this section I'd push on you today.", 3200);
    return;
  }

  const callId = ++scene.claspCallId;
  const stand = target.position.clone().addScaledVector(target.outward, CLASP_STAND_OFF);
  // Face back at the shelf she's recommending from.
  const faceYaw = Math.atan2(-target.outward.x, -target.outward.z);
  scene.clerk?.goTo(stand.x, stand.z, faceYaw);

  const sectionName = scene.claspSectionName(target);
  const where = sectionName ? ` about ${sectionName.toLowerCase()}` : '';
  const startedAt = performance.now();
  let lastNudge = 0;

  const deliver = () => {
    if (callId !== scene.claspCallId) return; // superseded by a newer call
    const waited = performance.now() - startedAt;
    const timedOut = waited > CLASP_WALK_TIMEOUT_MS;
    if (!scene.clerk || scene.clerk.hasArrived() || timedOut) {
      // Prefer the dialog: it lets the player ask for another without
      // walking off and calling her back. Toast is the fallback for a
      // headless/harness scene with no dialog layer built.
      const shown = scene.clerk?.askForRecommendation(pool, sectionName, suggestions) ?? false;
      if (shown) hideClerkToast(); // "On my way over..." must not cover the dialog
      else {
        const line = pick ?? { movie: suggestions[0].movie, reason: suggestions[0].reason };
        showClerkToast(`${line.movie.title} — ${line.reason}`, 7000);
      }
      // Let her go back to roaming; goTo parks her indefinitely otherwise.
      scene.clerk?.releaseFromRegister();
      return;
    }
    // She can be most of the store away — measured at ~11s of walking from
    // the register to a far aisle. The original single 2.4s toast left the
    // player staring at nothing for the other eight seconds, which reads
    // exactly like the click didn't register. Keep the notice alive for the
    // whole walk instead, re-issued slowly so it isn't DOM churn.
    if (waited - lastNudge > 1500) {
      lastNudge = waited;
      showClerkToast(`On my way over${where}...`, 2400);
    }
    setTimeout(deliver, 220);
  };
  showClerkToast(`On my way over${where}...`, 2400);
  // One beat before the first check, so a clasp she happens to be standing
  // at still reads as "walked over and answered" rather than a jump cut.
  setTimeout(deliver, 700);
}

export function claspPool(scene: StoreScene, target: ClaspTarget): Movie[] {
  const lib = scene.libraries[target.libraryIdx];
  if (!lib) return [];
  const rentable = (m: Movie) =>
    !m.comingSoon && !m.discovery && !m.collectionGap && !m.game;
  if (target.category) {
    const layout = scene.plan.layoutFor(target.libraryIdx);
    const pool: Movie[] = [];
    // A shelf entry can repeat a title — sectionFillCopies stocks a thin
    // section with face-out copies of its own titles — so dedupe by id here.
    // Otherwise the clerk's recommendation is weighted by how many copies of a
    // box happen to be facing out, and she pitches the same few titles forever.
    const pooled = new Set<string>();
    layout.entries.forEach((m, idx) => {
      if (!m || !rentable(m) || pooled.has(m.id)) return;
      const section = String(Math.floor(idx / SECTION_CAPACITY));
      if (layout.sectionLabels.get(section) === target.category) {
        pooled.add(m.id);
        pool.push(m);
      }
    });
    if (pool.length > 0) return pool;
  }
  // Whole-library clasp, or a category the shelf plan folded away after the
  // clasp was placed — fall back to the library rather than going silent.
  return lib.movies.filter(rentable);
}

export function claspSuggestions(scene: StoreScene, target: ClaspTarget): ClerkSuggestion[] {
  if (!scene.clerkLibraryIndex) {
    scene.clerkLibraryIndex = buildLibraryIndex(scene.libraries.flatMap((l) => l.movies));
  }
  const layout = scene.plan.layoutFor(target.libraryIdx);
  const gaps: Movie[] = [];
  layout.entries.forEach((m, idx) => {
    if (!m || !m.collectionGap) return;
    if (target.category &&
        layout.sectionLabels.get(String(Math.floor(idx / SECTION_CAPACITY))) !== target.category) return;
    gaps.push(m);
  });
  const discovery = scene.discoveryMovies.filter((m) =>
    !m.game && (!target.category || storeCategory(m) === target.category));
  const requested = (m: Movie) =>
    !!m.discoveryRequested || (typeof m.tmdbId === 'number' && isDiscoveryRequested(m.tmdbId));
  const picks: ClerkSuggestion[] = pickRecommendations([...gaps, ...discovery], scene.clerkLibraryIndex, undefined, 3)
    .map((r) => ({ movie: r.movie, reason: r.why.text, requested: requested(r.movie) }));
  const seen = new Set(picks.map((p) => p.movie.id));
  // The discovery pool is capped well below the section count, so a genre
  // section matching none of it is normal -- but the clasp promised the
  // clerk has something to say. Pad from the whole pool rather than let her
  // fall back to pitching titles already on the shelf behind her.
  const padPool = discovery.length > 0 ? discovery : scene.discoveryMovies.filter((m) => !m.game);
  const pad: ClerkSuggestion[] = padPool
    .filter((m) => !seen.has(m.id))
    .sort((a, b) => (b.communityRating ?? 0) - (a.communityRating ?? 0))
    .slice(0, Math.max(0, 4 - picks.length))
    .map((m) => ({
      movie: m,
      reason: "It's the one everybody's been calling about this week.",
      requested: requested(m),
    }));
  return [...picks, ...pad];
}

export function localRecommendPool(scene: StoreScene): { movies: Movie[]; label: string | null; suggestions: ClerkSuggestion[] } | null {
  if (!scene.isWalkAroundMode) return null;
  const mesh = scene.shelfClasps.nearestTo(scene.camera.position, 9);
  const target = mesh ? scene.shelfClasps.targetFor(mesh) : null;
  if (!target) return null;
  const movies = scene.claspPool(target);
  if (movies.length === 0) return null;
  // A whole-library clasp has no category; the library's name still tells
  // the player why the pick is what it is ("If you're after anime, …").
  const label = target.category ?? scene.libraries[target.libraryIdx]?.name ?? null;
  return { movies, label, suggestions: scene.claspSuggestions(target) };
}

export function showPersonEndcap(scene: StoreScene, person: string, kind: 'actor' | 'director') {
  scene.requestRender();
  if (scene.mode !== 'inspect' && scene.mode !== 'browse') return;
  if (scene.personEndcap) scene.closePersonEndcap(false);

  // Every title in the whole collection featuring this person.
  const seen = new Set<string>();
  const movies: Movie[] = [];
  scene.libraries.forEach((lib) => {
    lib.movies.forEach((m) => {
      if (seen.has(m.id)) return;
      if ((m.actors || []).includes(person) || m.director === person) {
        seen.add(m.id);
        movies.push(m);
      }
    });
  });
  movies.sort((a, b) => a.title.localeCompare(b.title));
  if (movies.length === 0) {
    scene.onConsoleLog(`[System] No other titles found for ${person}.`, "system");
    return;
  }

  const returnState = {
    mode: scene.mode as 'browse' | 'inspect',
    libraryIdx: scene.selectedLibraryIdx,
    unitIdx: scene.selectedUnitIdx,
    side: scene.selectedSide,
    shelf: scene.selectedShelf,
    col: scene.selectedCol,
    nrDirect: scene.isBrowsingNewReleasesDirectly,
  };

  // Locate the initiating shelving unit run.
  let activeUnit = scene.shelvingUnits.find(u => u.libraryIdx === scene.selectedLibraryIdx && u.unitIdxInLibrary === scene.selectedUnitIdx);
  if (!activeUnit || scene.selectedUnitIdx === BACK_WALL_UNIT_IDX) {
    activeUnit = scene.shelvingUnits.find(u => u.libraryIdx === scene.selectedLibraryIdx && u.isLineFront);
  }
  if (!activeUnit) {
    activeUnit = scene.shelvingUnits.find(u => u.isLineFront);
  }

  // Find the front endcap mesh of this run
  let leftCap: THREE.Mesh | undefined;
  if (activeUnit) {
    const frontUnit = scene.shelvingUnits.find(u => u.libraryIdx === activeUnit.libraryIdx && u.lineId === activeUnit.lineId && u.isLineFront);
    if (frontUnit) {
      leftCap = scene.libraryEndCaps.find(cap => cap.userData.lineId === frontUnit.lineId && cap.userData.isFront);
    }
  }

  if (!leftCap) {
    scene.onConsoleLog(`[System] Could not find front endcap for shelving run.`, "system");
    return;
  }

  // Endcap layout fits:
  // Max 13 titles shown total.
  // Max 3 per shelf on top 3 shelves, up to 4 on the bottom shelf.
  // Only as many shelves as needed.
  const maxTitles = 13;
  const shown = movies.slice(0, maxTitles);
  const rowCapacities = [3, 3, 3, 4];

  // Build moviePositions to determine row/col coordinates for each movie (filling top shelf first)
  const moviePositions: { row: number, col: number, rowCount: number }[] = [];
  let currentIdx = 0;
  let numShelves = 0;
  for (let row = 0; row < rowCapacities.length; row++) {
    const capacity = rowCapacities[row];
    const countOnThisRow = Math.min(capacity, shown.length - currentIdx);
    if (countOnThisRow <= 0) break;
    numShelves++;
    for (let col = 0; col < countOnThisRow; col++) {
      moviePositions.push({ row, col, rowCount: countOnThisRow });
      currentIdx++;
    }
  }

  const group = new THREE.Group();
  // Add the showcase group directly as a child of the physical front endcap mesh!
  leftCap.add(group);

  // Clear acrylic material for the shelves (highly transparent, glossy, smooth)
  const clearAcrylicMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.08, // more transparent
    roughness: 0.02, // smooth and glossy
    metalness: 0.1,
    side: THREE.DoubleSide
  });

  const shelfDepth = 0.65; // depth of acrylic shelf in feet

  // Draw clear acrylic shelves + front lips on the endcap face (only as many shelves as needed)
  for (let r = 0; r < numShelves; r++) {
    const shelfIdx = 3 - r;
    const yPos = AISLE_SHELF_HEIGHTS[shelfIdx];
    const localY = yPos - UNIT_FRAME_HEIGHT / 2;
    const widthAtY = unitDepthAtHeight(yPos);
    const shelfWidth = widthAtY - 0.08;

    // Flat shelf board
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(shelfWidth, 0.03, shelfDepth), clearAcrylicMat);
    shelf.position.set(0, localY, 0.05 + shelfDepth / 2);
    shelf.castShadow = true;
    shelf.receiveShadow = true;
    group.add(shelf);

    // Front holding lip
    const lip = new THREE.Mesh(new THREE.BoxGeometry(shelfWidth, 0.06, 0.02), clearAcrylicMat);
    lip.position.set(0, localY + 0.03, 0.05 + shelfDepth - 0.01);
    lip.castShadow = true;
    lip.receiveShadow = true;
    group.add(lip);
  }

  // Header sign backing board (warm gray/off-white plastic)
  const signW = 2.1;
  const signH = 0.60;
  const signMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.2, metalness: 0.1 });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(signW, signH, 0.08), signMat);
  sign.position.set(0, UNIT_FRAME_HEIGHT / 2 + signH / 2 + 0.05, 0.05);
  sign.castShadow = true;
  group.add(sign);

  // Helpers to build 3D letter slits (cards with real depth) and plastic rail guides
  const createCardTexture = (char: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 256, 256);
    // Black character
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 200px sans-serif';
    ctx.fillText(char, 128, 128);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };

  const baseCardHeight = 0.18;
  const line1Text = kind === 'director' ? 'FILMS DIRECTED BY' : 'STARRING';
  const line2Text = person.toUpperCase();

  // Determine a unified scale so both lines fit on the sign
  let unifiedScale = 1.0;
  const getLineWidth = (text: string, scl: number) => {
    let w = 0;
    for (let i = 0; i < text.length; i++) {
      w += baseCardHeight * scl + 0.005 * scl;
    }
    return w;
  };

  while (unifiedScale > 0.4) {
    const w1 = getLineWidth(line1Text, unifiedScale);
    const w2 = getLineWidth(line2Text, unifiedScale);
    if (w1 <= signW - 0.1 && w2 <= signW - 0.1) {
      break;
    }
    unifiedScale -= 0.05;
  }

  const add3DLetterCards = (text: string, centerY: number) => {
    const finalCardHeight = baseCardHeight * unifiedScale;
    const cardDepth = 0.015; // real physical card depth

    // Draw horizontal guidance rails
    const railGeo = new THREE.BoxGeometry(signW - 0.04, 0.006, 0.01);
    const railMat = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      transparent: true,
      opacity: 0.65,
      roughness: 0.1,
      metalness: 0.8
    });

    const topRail = new THREE.Mesh(railGeo, railMat);
    topRail.position.set(0, centerY - finalCardHeight / 2, 0.04 + 0.003);
    sign.add(topRail);

    const bottomRail = new THREE.Mesh(railGeo, railMat);
    bottomRail.position.set(0, centerY + finalCardHeight / 2, 0.04 + 0.003);
    sign.add(bottomRail);

    let totalW = 0;
    for (let i = 0; i < text.length; i++) {
      totalW += finalCardHeight + 0.005 * unifiedScale;
    }

    let currentX = -totalW / 2;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const cardW = finalCardHeight;

      if (char !== ' ') {
        const cardGeo = new THREE.BoxGeometry(cardW, finalCardHeight, cardDepth);
        const cardTex = createCardTexture(char);
        const cardFrontMat = new THREE.MeshStandardMaterial({ map: cardTex, roughness: 0.2, metalness: 0.1 });
        const cardSideMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0.1 });
        const cardMesh = new THREE.Mesh(cardGeo, [
          cardSideMat, // +X
          cardSideMat, // -X
          cardSideMat, // +Y
          cardSideMat, // -Y
          cardFrontMat, // +Z (front face)
          cardSideMat  // -Z
        ]);
        cardMesh.position.set(currentX + cardW / 2, centerY, 0.04 + cardDepth / 2);
        cardMesh.castShadow = true;
        cardMesh.receiveShadow = true;
        cardMesh.userData.disposeMaterial = true;
        sign.add(cardMesh);
      }

      currentX += cardW + 0.005 * unifiedScale;
    }
  };

  // Populate the 3D card slits on the sign
  add3DLetterCards(line1Text, 0.13);
  add3DLetterCards(line2Text, -0.13);


  // One real (non-instanced) case per title, leaning back against the endcap face.
  const hinge = scene.leanHingeOffset(LEAN_ANGLE, 0, CASE_HEIGHT);
  const caseMeshes: THREE.Mesh[] = [];
  const currentSpacing = shown.length > 5 ? 0.46 : 0.58; // shift closer together if > 5 items total
  shown.forEach((movie, idx) => {
    const pos = moviePositions[idx];
    const row = pos.row;
    const col = pos.col;
    const rowMoviesCount = pos.rowCount;
    const shelfIdx = (AISLE_SHELF_HEIGHTS.length - 1) - row;
    const shelfY = AISLE_SHELF_HEIGHTS[shelfIdx];
    const localY = shelfY - UNIT_FRAME_HEIGHT / 2;

    // Center the cases horizontally on the row using the adaptive spacing
    const localX = (col - (rowMoviesCount - 1) / 2) * currentSpacing;

    const theta = Math.abs(LEAN_ANGLE);
    // Position the case forward by half the usable shelf depth.
    // The front shelf lip back edge is at 0.05 + shelfDepth - 0.02, so half that distance from the back wall (0.05) is:
    const targetBottomFrontZ = 0.05 + (shelfDepth - 0.02) / 2;
    const centerZ = targetBottomFrontZ - (CASE_DEPTH / 2) * Math.cos(theta);
    const finalRestingZ = centerZ + hinge.z;

    // Endcap-pinned poster texture (#97) — released in closePersonEndcap.
    const mesh = new THREE.Mesh(getCaseGeometry(), createHeroJellyfinMaterials(movie, undefined, true));
    mesh.rotation.order = 'YXZ';
    mesh.rotation.x = LEAN_ANGLE;
    mesh.position.set(
      localX + hinge.x,
      localY + 0.03 + hinge.y + (CASE_DEPTH / 2) * Math.sin(theta),
      finalRestingZ
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.endcapIdx = idx;
    mesh.userData.restingZ = finalRestingZ;
    group.add(mesh);
    caseMeshes.push(mesh);

    // Miss-tolerant: the mesh above already built with createHeroJellyfinMaterials,
    // which falls back to a placeholder front when posterPixelCache misses (never
    // decoded yet, or evicted since) — the case is never blank while this resolves.
    // posterQueue.load() dedupes in-flight requests for the same title itself.
    if (!posterPixelCache.has(movie.id) && movie.posterUrl) {
      posterQueue.load(movie, 2, () => {
        if (scene.personEndcap && scene.personEndcap.caseMeshes[idx] === mesh) {
          mesh.material = createHeroJellyfinMaterials(movie, undefined, true);
          scene.requestRender(); // may land after the scene idled
        }
      });
    }
  });

  scene.personEndcap = {
    group,
    person,
    kind,
    movies: shown,
    caseMeshes,
    cols: 3,
    selectedIdx: 0,
    x: 0,
    z: 0,
    leftCap,
    moviePositions,
    returnState,
  };

  scene.hideHeroCases();
  scene.queueStructuralShadowRefresh();
  scene.mode = 'person-endcap';
  scene.isFlipped = false; scene.heroSpine = false;
  if (scene.onModeChange) scene.onModeChange(scene.mode);
  scene.updateEndcapSelection();
  scene.updateCameraTarget();
  if (scene.onSelectionChange) scene.onSelectionChange(scene.getSelectedMovie());
  scene.onConsoleLog(`[System] Endcap display built on aisle cap: ${shown.length} title(s) featuring ${person}.`, "system");
}

export function updateEndcapSelection(scene: StoreScene) {
  const pe = scene.personEndcap;
  if (!pe) return;
  pe.caseMeshes.forEach((mesh, idx) => {
    mesh.position.z = mesh.userData.restingZ + (idx === pe.selectedIdx ? 0.28 : 0);
  });
}

export function moveEndcapSelection(scene: StoreScene, dCol: number, dRow: number) {
  const pe = scene.personEndcap;
  if (!pe) return;
  const currentPos = pe.moviePositions[pe.selectedIdx];
  if (!currentPos) return;

  const row = currentPos.row;
  const col = currentPos.col;

  if (dCol !== 0) {
    // Horizontal navigation on the same shelf
    const targetCol = col + dCol;
    const targetIdx = pe.moviePositions.findIndex(p => p.row === row && p.col === targetCol);
    if (targetIdx !== -1) {
      pe.selectedIdx = targetIdx;
      scene.updateEndcapSelection();
      scene.updateCameraTarget();
      if (scene.onSelectionChange) scene.onSelectionChange(scene.getSelectedMovie());
    }
  } else if (dRow !== 0) {
    // Vertical navigation to adjacent shelf
    const targetRow = row + dRow;
    const targetRowPositions = pe.moviePositions.map((p, idx) => ({ ...p, idx })).filter(p => p.row === targetRow);
    if (targetRowPositions.length > 0) {
      // Find the movie closest to our current column index
      const closest = targetRowPositions.reduce((prev, curr) => 
        Math.abs(curr.col - col) < Math.abs(prev.col - col) ? curr : prev
      );
      pe.selectedIdx = closest.idx;
      scene.updateEndcapSelection();
      scene.updateCameraTarget();
      if (scene.onSelectionChange) scene.onSelectionChange(scene.getSelectedMovie());
    }
  }
}

export function closePersonEndcap(scene: StoreScene, restore: boolean) {
  const pe = scene.personEndcap;
  if (!pe) return;
  scene.personEndcap = null;
  if (pe.group.parent) {
    pe.group.parent.remove(pe.group);
  }
  // #97: the endcap meshes are gone — demote their pinned poster textures
  // back into the bounded hero LRU. The demotions can evict older entries
  // (possibly the one the hidden hero mesh's cached materials sample), so
  // drop heroMovieId to force ensureHeroCases to rebuild its materials the
  // next time a hero is shown.
  pe.movies.forEach((m) => releaseEndcapPosterTexture(m.id));
  scene.heroMovieId = null;
  const sharedCaseGeo = getCaseGeometry();
  const sharedRentalGeo = getRentalCaseGeometry();
  pe.group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      if (obj.geometry !== sharedCaseGeo && obj.geometry !== sharedRentalGeo) obj.geometry.dispose();
      // Case materials live in the shared video-case caches; only the sign's
      // one-off canvas material is ours to dispose.
      if (obj.userData.disposeMaterial) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => {
            if (m instanceof THREE.MeshStandardMaterial) {
              m.map?.dispose();
            }
            m.dispose();
          });
        } else {
          (obj.material as THREE.MeshStandardMaterial).map?.dispose();
          obj.material.dispose();
        }
      }
    }
  });
  scene.queueStructuralShadowRefresh();

  if (restore) {
    const rs = pe.returnState;
    scene.selectedLibraryIdx = rs.libraryIdx;
    scene.selectedUnitIdx = rs.unitIdx;
    scene.selectedSide = rs.side;
    scene.selectedShelf = rs.shelf;
    scene.selectedCol = rs.col;
    scene.isBrowsingNewReleasesDirectly = rs.nrDirect;
    scene.mode = rs.mode;
    scene.isFlipped = false; scene.heroSpine = false;
    scene.updateColsCount();
    if (scene.onModeChange) scene.onModeChange(scene.mode);
    scene.updateCameraTarget();
    if (scene.onSelectionChange) scene.onSelectionChange(scene.getSelectedMovie());
    scene.onConsoleLog("[System] Returned from endcap display.", "system");
  }
}

export function jumpFromEndcapToMovie(scene: StoreScene): 'inspect' | null {
  const pe = scene.personEndcap;
  if (!pe) return null;
  const movie = pe.movies[pe.selectedIdx];
  if (!movie) return null;

  let target: MovieSlot | null = null;
  scene.slotsByPosition.forEach((s) => {
    if (!target && s.movie.id === movie.id && !s.hidden && s.unitIdx < BACK_WALL_UNIT_IDX) target = s;
  });
  if (!target) {
    scene.onConsoleLog(`[System] "${movie.title}" has no shelf slot to jump to.`, "system");
    return null;
  }
  const slot = target as MovieSlot;

  // Reset any popped-out selection on the endcap meshes before leaving
  if (pe) {
    pe.caseMeshes.forEach((mesh) => {
      mesh.position.z = mesh.userData.restingZ;
    });
  }

  scene.selectedLibraryIdx = slot.libraryIdx;
  if (slot.source === 'fixture') {
    scene.selectedUnitSource = 'fixture';
    scene.selectedFixtureId = slot.fixtureId!;
    scene.selectedUnitIdx = -1;
  } else {
    scene.selectedUnitSource = 'shelving';
    scene.selectedFixtureId = null;
    scene.selectedUnitIdx = slot.unitIdx;
  }
  scene.selectedSide = slot.side;
  scene.selectedShelf = slot.shelfIdx;
  scene.selectedCol = slot.col;
  scene.isBrowsingNewReleasesDirectly = false;
  scene.mode = 'inspect';
  scene.isFlipped = false; scene.heroSpine = false;
  scene.resetHeroFace();
  scene.updateColsCount();
  if (scene.onModeChange) scene.onModeChange(scene.mode);
  scene.updateCameraTarget();
  if (scene.onSelectionChange) scene.onSelectionChange(movie);
  scene.onConsoleLog(`[System] Walked to "${movie.title}" on the shelf.`, "system");
  return 'inspect';
}

export function debugPoseClerk(scene: StoreScene, x: number, z: number, headingDeg: number, anim?: string): void {
  scene.clerk?.debugPose(x, z, (headingDeg * Math.PI) / 180, anim as any);
  scene.requestRender();
}

export function debugClerkFadeSettled(scene: StoreScene): boolean {
  if (!scene.clerk) return true;
  const wantAsleep = performance.now() - getLastUserActivity() >= CLERK_SLEEP_INPUT_MS &&
    !scene.clerk.isChatting();
  return scene.clerkFade === (wantAsleep ? 0 : 1);
}

export function debugClerkPathAudit(scene: StoreScene, seconds = 420): boolean {
  if (!scene.clerk || !scene.clerkNavGrid || scene.clerkNavRects.length === 0) return false;
  const dt = 1 / 30;
  const steps = Math.ceil(seconds / dt);
  // Precompute per-rect trig once; tolerate a hair of penetration so grid
  // quantization at the tight stand points doesn't read as a violation.
  const TOL = 0.08;
  const rects = scene.clerkNavRects.map(r => ({
    label: r.label ?? '?', cx: r.cx, cz: r.cz,
    hw: r.w / 2 - TOL, hd: r.d / 2 - TOL,
    cos: Math.cos(r.yaw), sin: Math.sin(r.yaw),
  }));
  const violations: { x: number; z: number; label: string; t: number }[] = [];
  let stockSeconds = 0, typeSeconds = 0, walkSeconds = 0;
  const pos = (scene.clerk as any).currentPos as THREE.Vector3;
  for (let i = 0; i < steps; i++) {
    scene.clerk.update(dt);
    if (scene.clerk.state === 'STOCKING' || scene.clerk.state === 'SQUATTING') stockSeconds += dt;
    if (scene.clerk.state === 'WALKING') walkSeconds += dt;
    if ((scene.clerk as any).animKey === 'type') typeSeconds += dt;
    if (violations.length < 25) {
      for (const r of rects) {
        const dx = pos.x - r.cx, dz = pos.z - r.cz;
        const lx = dx * r.cos - dz * r.sin;
        const lz = dx * r.sin + dz * r.cos;
        if (Math.abs(lx) <= r.hw && Math.abs(lz) <= r.hd) {
          violations.push({ x: pos.x, z: pos.z, label: r.label, t: i * dt });
          break;
        }
      }
    }
  }
  const result = {
    seconds, violations, stockSeconds, typeSeconds, walkSeconds,
    counterShare: typeSeconds / seconds,
  };
  (window as any).__clerkAudit = result;
  const ok = violations.length === 0 && stockSeconds > 5 && typeSeconds > 15;
  console.log(`[clerk-audit] ${seconds}s sim: ok=${ok} intrusions=${violations.length}` +
    ` stock=${stockSeconds.toFixed(0)}s type=${typeSeconds.toFixed(0)}s walk=${walkSeconds.toFixed(0)}s` +
    (violations.length ? ` first=${violations[0].label}@(${violations[0].x.toFixed(1)},${violations[0].z.toFixed(1)})t=${violations[0].t.toFixed(1)}` : ''));
  scene.requestRender();
  return ok;
}

/** One qualifying line-front run end during the staff-picks endcap deal. */
interface EndcapCandidate {
  u: ShelvingUnit;
  frontLocalZ: number;
  genreLabel: string | null;
  endcapTitle: string;
  discovery: Movie[];
  libraryName: string | undefined;
  worldX: number;
  picks: Movie[];
  di: number;
}

/**
 * Compute placements for genre endcap fixtures (fixtures/genre-endcap.ts):
 * line-front shelving units whose entrance-facing end opens onto real
 * walkway, stocked with THAT run's genre from the staff-picks DISCOVERY pool
 * — not-in-library order candidates only, each title on at most one endcap.
 * Owned picks never stand here: a "Related Movies" endcap showing a film
 * three aisles over reads as the store not knowing its own stock (feedback
 * pin 012) — owned winners advertise from the aisle shelf via their FOR YOU
 * sticker instead. Picks are dealt ROUND-ROBIN across every qualifying run
 * end, alternating between the two shelving fields, so the first-iterated
 * side can't drain the pool and leave the far half of the store bare
 * (feedback pin 010). Computed from the StorePlan so every arrangement gets
 * correctly-oriented endcaps; [] when the engine found nothing.
 */
export function staffPickEndcapPlacements(
  scene: StoreScene,
  // Run ends already reserved by the collection endcaps (which are dealt
  // first, capped at half the store's ends — see fixtures/collection-endcap.ts).
  excludeLineIds: Set<number> = new Set(),
): FixturePlacement[] {
  const discoveryPool = scene.staffPickMovies;
  if (discoveryPool.length === 0) return [];

  // Each discovery pick belongs to ONE library: the one whose stock's genre
  // profile it best matches. Matching on "any genre overlap" let animated
  // recommendations stand on the general Movies aisles (user feedback after
  // pin 010) — a big library's genre set covers nearly everything. Profile =
  // SHARE of the library's real stock carrying each genre, so a dedicated
  // library (Animation ~1.0) outbids a general one (Animation ~0.05)
  // regardless of size; equal scores fall to the larger library.
  const libProfiles = scene.libraries.map((lib) => {
    const real = (lib?.movies ?? []).filter(
      (m) => !m.collectionGap && !m.discovery && !m.comingSoon && !m.game
    );
    const share = new Map<string, number>();
    for (const m of real) {
      for (const g of m.genres) {
        const k = g.toLowerCase();
        share.set(k, (share.get(k) ?? 0) + 1);
      }
    }
    for (const [k, n] of share) share.set(k, n / Math.max(1, real.length));
    return { name: lib?.name, share, size: real.length };
  });
  const discoveryHome = new Map<string, string | undefined>();
  for (const m of discoveryPool) {
    let bestName: string | undefined;
    let bestScore = 0;
    let bestSize = -1;
    for (const p of libProfiles) {
      let s = 0;
      for (const g of m.genres) s += p.share.get(g.toLowerCase()) ?? 0;
      if (s > bestScore + 1e-9 || (s > 0 && Math.abs(s - bestScore) <= 1e-9 && p.size > bestSize)) {
        bestScore = s;
        bestName = p.name;
        bestSize = p.size;
      }
    }
    discoveryHome.set(m.id, bestName);
  }

  // Hostable run ends come from the plan (StorePlan.openLineFrontEnds), which
  // is also what the collection endcaps read — one definition of "an endcap
  // can stand here", shared by both selectors.
  const candidates: EndcapCandidate[] = [];
  for (const end of scene.plan.openLineFrontEnds()) {
    if (excludeLineIds.has(end.unit.lineId)) continue;
    const { unit: u, frontLocalZ, genreLabel, worldX } = end;
    const lib = scene.libraries[u.libraryIdx];
    // The endcap brands itself off the aisle's library: a shows library
    // reads "Related Shows", a movie library "Related Movies".
    const realStock = (lib?.movies ?? []).filter(
      (m) => !m.collectionGap && !m.discovery && !m.comingSoon && !m.game
    );
    const seriesCount = realStock.reduce((n, m) => n + (m.isSeries ? 1 : 0), 0);
    const endcapTitle = seriesCount * 2 > realStock.length ? 'Related Shows' : 'Related Movies';
    const libGenres = new Set((lib?.genres ?? []).map((g) => g.toLowerCase()));
    const discovery = discoveryPool.filter(
      (m) =>
        discoveryHome.get(m.id) === lib?.name &&
        (genreLabel
          ? storeCategory(m) === genreLabel
          : m.genres.some((g) => libGenres.has(g.toLowerCase())))
    );
    if (discovery.length === 0) continue;
    candidates.push({
      u, frontLocalZ, genreLabel, endcapTitle, discovery,
      libraryName: lib?.name,
      worldX,
      picks: [], di: 0,
    });
  }
  if (candidates.length === 0) return [];

  // Deal order alternates the two shelving fields (store centreline x=11) so
  // both sides of the centre walkway seat endcaps before the pool runs out.
  const leftField = candidates.filter((c) => c.worldX < 11);
  const rightField = candidates.filter((c) => c.worldX >= 11);
  const dealOrder: EndcapCandidate[] = [];
  for (let i = 0; i < Math.max(leftField.length, rightField.length); i++) {
    if (i < leftField.length) dealOrder.push(leftField[i]);
    if (i < rightField.length) dealOrder.push(rightField[i]);
  }

  const CAPACITY = 9;
  // A near-empty endcap reads as broken stock, not curation.
  const MIN_PICKS = 3;

  // One pick per candidate per round, best-ranked first within each endcap.
  const dealTo = (active: EndcapCandidate[]): void => {
    const usedIds = new Set<string>();
    for (const c of active) { c.picks = []; c.di = 0; }
    let dealt = true;
    while (dealt) {
      dealt = false;
      for (const c of active) {
        if (c.picks.length >= CAPACITY) continue;
        while (c.di < c.discovery.length && usedIds.has(c.discovery[c.di].id)) c.di++;
        if (c.di < c.discovery.length) {
          const taken = c.discovery[c.di++];
          usedIds.add(taken.id);
          c.picks.push(taken);
          dealt = true;
        }
      }
    }
  };

  // Deal, drop under-stocked runs, re-deal to the survivors — repeats until
  // every remaining endcap clears MIN_PICKS. A pool too small for even one
  // spread falls back to a single endcap on the best-supplied run (the old
  // greedy behaviour) rather than building none.
  let active = dealOrder.slice();
  for (;;) {
    dealTo(active);
    const survivors = active.filter((c) => c.picks.length >= MIN_PICKS);
    if (survivors.length === active.length) break;
    if (survivors.length === 0) {
      let best = active[0];
      for (const c of active) {
        if (c.discovery.length > best.discovery.length) best = c;
      }
      active = [best];
      dealTo(active);
      if (best.picks.length < MIN_PICKS) active = [];
      break;
    }
    active = survivors;
  }

  const placements: FixturePlacement[] = [];
  for (const c of active) {
    // Core centred so the footprint's back edge lands exactly on the unit's
    // end face (see genre-endcap.ts's abutment contract).
    const pos = scene.plan.unitToWorld(c.u, c.u.xCenter, c.frontLocalZ + ENDCAP_CORE_DEPTH / 2);
    placements.push({
      id: `staff-endcap-${c.u.lineId}`,
      kind: 'genre-endcap',
      position: { x: pos.x, z: pos.z },
      yaw: c.u.yaw,
      options: {
        genre: c.genreLabel ? `${c.endcapTitle}: ${c.genreLabel}` : c.endcapTitle,
        genreLabel: c.genreLabel ?? undefined,
        title: c.endcapTitle,
        libraryName: c.libraryName,
        pickIds: c.picks.map((m) => m.id),
        // lineId: read back in buildStore (the hosting run suppresses its own
        // blue front cap — same plane would z-fight, pin 010) and by
        // store-nav's browse flow-through, which also needs the aisle's real
        // library index to step back off the endcap onto the shelves.
        lineId: c.u.lineId,
        libraryIdx: c.u.libraryIdx,
      },
    });
  }
  if (placements.length > 0) {
    scene.onConsoleLog(
      `[StaffPicks] ${placements.length} genre endcap(s) placed at aisle-run ends.`,
      'system'
    );
  }
  return placements;
}
