// Rental mode & the T23 back room — extracted from StoreScene
// (three-scene.ts keeps one-line delegating stubs): entering/leaving the
// rented-tapes back room, the rental lockout clock and unlock scheduling,
// back-room browsing/inspect, the couch TV video hookup, and the harness
// debug entries. Every function takes the StoreScene as its first parameter
// and reads/writes scene state exactly as the original methods did.
import { Movie } from './jellyfin';
import { BACK_WALL_UNIT_IDX } from './store-layout';
import { retailAudio } from './audio';
import { DEFAULT_CARRY_CAPACITY } from './carried-tapes';
import { BackRoom, fadeToBlack, fadeFromBlack } from './back-room';
import { RentalRecord, clearRentalRecord, makeRentalRecord, isLockedOut, msUntilUnlock, rentalCapacityAt, formatUnlockLabel } from './rental-clock';
import type { StoreScene } from './three-scene';
import { removeGoldClamshellFillers } from './fixtures/gold-clamshell';
import { brandString } from './brand-pack';

export function rentalDevTimerOn(_scene: StoreScene): boolean {
  return typeof localStorage !== 'undefined' && localStorage.getItem('bb_rental_dev') === '1';
}

export function setRentalMode(scene: StoreScene, enabled: boolean): void {
  if (scene.rentalMode === enabled) return;
  scene.rentalMode = enabled;
  if (typeof localStorage !== 'undefined') localStorage.setItem('bb_rental_mode', enabled ? '1' : '0');
  if (enabled) {
    scene.setCarryMode(true);
    scene.carried?.setCapacity(rentalCapacityAt(new Date()));
    // Announce the CONSEQUENCE, not just the limit: the next checkout shuts
    // the store until a real wall-clock instant, so name it here as well as in
    // the settings row's hint (owner report 2026-08-12 — the option gave no
    // warning of what it committed you to).
    const now = new Date();
    const cap = rentalCapacityAt(now);
    const unlock = formatUnlockLabel(makeRentalRecord([], now, rentalDevTimerOn(scene)));
    scene.onConsoleLog(
      `[System] Rental mode ON — carry up to ${cap} tape${cap === 1 ? '' : 's'} tonight; `
      + `checking out shuts the store until ${unlock}. `
      + brandString('rental-rules-note', 'Halcyon house rules.'),
      'system');
  } else {
    scene.carried?.setCapacity(DEFAULT_CARRY_CAPACITY);
    if (scene.rentalRecord || scene.mode === 'backroom') {
      clearRentalRecord();
      scene.exitBackRoomToStore(true);
    }
    scene.onConsoleLog('[System] Rental mode OFF.', 'system');
  }
  scene.requestRender();
}

export function resolveRentalMovies(scene: StoreScene, ids: string[]): Movie[] {
  const movies: Movie[] = [];
  for (const id of ids) {
    for (const lib of scene.libraries) {
      const m = lib.movies.find((mm) => mm.id === id);
      if (m) {
        movies.push(m);
        break;
      }
    }
  }
  return movies;
}

export function enterBackRoom(scene: StoreScene, record: RentalRecord, opts: { fade: boolean }): void {
  if (scene.backRoom) return; // already in (or building) the room
  const movies = scene.resolveRentalMovies(record.items);
  if (movies.length === 0) {
    // Nothing rentable resolves (catalog changed) — a lockout over zero
    // tapes is pure punishment; clear it and stay in the store.
    clearRentalRecord();
    scene.onConsoleLog('[System] Rental record no longer matches the catalog — lockout cleared.', 'system');
    return;
  }
  scene.rentalRecord = record;
  scene.rentalUnlocked = !isLockedOut(record, new Date());
  scene.requestRender();

  // Leave every store state behind.
  if (scene.isWalkAroundMode) scene.toggleWalkAround();
  scene.hideOverviewVisuals();
  scene.hideHeroCases();
  if (scene.personEndcap) scene.closePersonEndcap(false);
  scene.mode = 'backroom';
  scene.isFlipped = false; scene.heroSpine = false;
  if (scene.onModeChange) scene.onModeChange(scene.mode);
  if (scene.onGenreMenuUpdate) scene.onGenreMenuUpdate('', [], 0, false);

  // Store ambient systems pause while home (same plumbing playback uses).
  scene.pauseAmbientTvs();

  const room = new BackRoom(scene.scene, {
    log: (msg) => scene.onConsoleLog(msg, 'system'),
  });
  scene.backRoom = room;
  const buildDone = room.build(movies, record, scene.rentalDevTimerOn()).then(() => {
    if (scene.backRoom !== room) return; // torn down while furnishing
    if (scene.rentalUnlocked) room.setDoorUnlocked(true);
    scene.rebuildSSAOExclusionList();
    scene.updateCameraTarget();
    scene.requestRender();
  });

  const doEnter = () => {
    if (scene.backRoom !== room) return;
    scene.updateCameraTarget();
    scene.snapCamera();
    fadeFromBlack();
    scene.onConsoleLog(
      scene.rentalUnlocked
        ? '[System] Home with your tapes — the door back to the store is already open.'
        : `[System] Home with ${movies.length} tape(s). Locked out until ${formatUnlockLabel(record)} — enjoy the movies.`,
      'system');
  };
  if (opts.fade) {
    scene.backRoomReadyPromise = Promise.all([fadeToBlack(), buildDone]).then(doEnter);
  } else {
    scene.backRoomReadyPromise = buildDone.then(doEnter);
  }

  scene.scheduleRentalUnlock();
}

export function exitBackRoomToStore(scene: StoreScene, force = false): void {
  if (!force && !scene.rentalUnlocked) return;
  // Resolve the rented titles BEFORE the record is cleared — they go into
  // the entrance's RETURN TAPES HERE chute as you come back into the store.
  const returnedTapes = scene.rentalRecord ? scene.resolveRentalMovies(scene.rentalRecord.items) : [];
  scene.clearRentalUnlockSchedule();
  scene.rentalRecord = null;
  scene.rentalUnlocked = false;
  clearRentalRecord();
  removeGoldClamshellFillers(scene);
  const room = scene.backRoom;
  scene.backRoom = null;
  scene.backRoomReadyPromise = Promise.resolve();
  if (room) {
    room.detachVideo();
    room.dispose();
  }
  if (scene.mode !== 'backroom') return; // rental toggled off from the store side
  scene.requestRender();
  scene.resumeAmbientTvs();
  // Tonight's rule again, fresh (the carried limit resets per ticket).
  if (scene.rentalMode) scene.carried?.setCapacity(rentalCapacityAt(new Date()));
  if (scene.overviewStart) {
    scene.enterOverview();
  } else {
    scene.mode = 'library-select';
    if (scene.onModeChange) scene.onModeChange(scene.mode);
    scene.updateCameraTarget();
  }
  scene.snapCamera();
  // Rental return ritual: the lockout tapes slide into the return chute as
  // you re-enter (bb-90s only; non-blocking — browsing works immediately).
  if (returnedTapes.length > 0 && scene.entrance?.hasReturnSlot()) {
    scene.entrance.dropReturnedTapes(returnedTapes, performance.now() + 500);
    scene.beginReturnDropWatch();
    scene.onConsoleLog(`[System] Dropped ${returnedTapes.length} rental tape(s) in the return slot.`, 'system');
  }
  scene.onConsoleLog('[System] Back through the store doors — welcome back!', 'system');
}

export function scheduleRentalUnlock(scene: StoreScene): void {
  scene.clearRentalUnlockSchedule(false);
  if (!scene.rentalRecord) return;
  if (!scene.rentalWakeHooked) {
    document.addEventListener('visibilitychange', scene.onRentalWake);
    window.addEventListener('focus', scene.onRentalWake);
    scene.rentalWakeHooked = true;
  }
  const ms = msUntilUnlock(scene.rentalRecord, new Date());
  if (ms <= 0) {
    scene.checkRentalClock();
    return;
  }
  // +250ms grace so the fire lands past the boundary; clamp to the 32-bit
  // setTimeout ceiling (a weekend lockout fits, but never trust it).
  const wait = Math.min(ms + 250, 0x7fffffff);
  scene.rentalUnlockTimer = window.setTimeout(() => {
    scene.rentalUnlockTimer = null;
    scene.checkRentalClock();
  }, wait);
}

export function clearRentalUnlockSchedule(scene: StoreScene, unhook = true): void {
  if (scene.rentalUnlockTimer !== null) {
    window.clearTimeout(scene.rentalUnlockTimer);
    scene.rentalUnlockTimer = null;
  }
  if (unhook && scene.rentalWakeHooked) {
    document.removeEventListener('visibilitychange', scene.onRentalWake);
    window.removeEventListener('focus', scene.onRentalWake);
    scene.rentalWakeHooked = false;
  }
}

export function checkRentalClock(scene: StoreScene): void {
  if (!scene.rentalRecord || scene.rentalUnlocked) return;
  if (isLockedOut(scene.rentalRecord, new Date())) {
    scene.scheduleRentalUnlock(); // still early (or a drifted timer) — rearm
    return;
  }
  // Timer's up: gentle chime, door unlocks; leaving is the player's choice.
  scene.rentalUnlocked = true;
  scene.clearRentalUnlockSchedule();
  retailAudio.playCheckoutChime();
  scene.backRoom?.setDoorUnlocked(true);
  scene.requestRender();
  scene.onConsoleLog('[System] Rental period over — the door back to the store just unlocked. (Escape to head out.)', 'system');
}

export function attachBackRoomVideo(scene: StoreScene, video: HTMLVideoElement): void {
  scene.backRoom?.attachVideo(video);
  scene.requestRender();
}

export function detachBackRoomVideo(scene: StoreScene): void {
  scene.backRoom?.detachVideo();
  scene.updateCameraTarget();
  scene.requestRender();
}

export function debugEnterBackRoom(scene: StoreScene, n: number): boolean {
  if (scene.mode === 'backroom') return true;
  // Deterministic picks (unlike slot-map order): the first n non-series
  // titles in library order, so `--state backroom-inspect --title "Movies
  // Title 1"` reliably names a rented tape.
  const ids: string[] = [];
  outer: for (const lib of scene.libraries) {
    for (const m of lib.movies) {
      if (m.isSeries || m.comingSoon || m.discovery || m.game) continue;
      if (!ids.includes(m.id)) ids.push(m.id);
      if (ids.length >= n) break outer;
    }
  }
  if (ids.length === 0) return false;
  const record = makeRentalRecord(ids, new Date(), scene.rentalDevTimerOn());
  scene.enterBackRoom(record, { fade: false });
  // (Cast: TS narrowed `mode` from the early-return above, but enterBackRoom
  // just reassigned it.)
  return (scene.mode as string) === 'backroom';
}

export function backRoomInspect(scene: StoreScene, title?: string): boolean {
  if (scene.mode !== 'backroom' || !scene.backRoom) return false;
  const ok = scene.backRoom.inspectByTitle(title);
  if (ok) scene.updateCameraTarget();
  return ok;
}

export function backRoomCloseInspect(scene: StoreScene): void {
  if (scene.mode !== 'backroom' || !scene.backRoom) return;
  scene.backRoom.closeInspect();
  scene.updateCameraTarget();
}

export function loadAllArtworkForActiveLibrary(scene: StoreScene) {
  const activeLibIdx = scene.selectedLibraryIdx;
  const isNewReleases = scene.selectedLibraryIdx === scene.libraries.length || scene.isBrowsingNewReleasesDirectly;
  const isDisplay = scene.selectedLibraryIdx > scene.libraries.length;
  const displayStandIdx = isDisplay ? (scene.selectedLibraryIdx - scene.libraries.length - 1) : -1;

  scene.slotsByPosition.forEach(slot => {
    let shouldLoad = false;
    if (isDisplay) {
      if (slot.source === 'fixture' && slot.fixtureId === scene.slottedFixtures[displayStandIdx]?.placement.id) {
        shouldLoad = true;
      }
    } else if (isNewReleases) {
      if (slot.unitIdx === BACK_WALL_UNIT_IDX) {
        shouldLoad = true;
      }
    } else {
      if (slot.libraryIdx === activeLibIdx && slot.source !== 'fixture') {
        shouldLoad = true;
      }
    }

    if (shouldLoad) {
      slot.loadShelfDetails(1);
    }
  });
}

export function backRoomMove(scene: StoreScene, dir: number): void {
  const room = scene.backRoom;
  if (!room) return;
  if (room.state === 'view') {
    if (room.focusStep(dir) && scene.onSelectionChange) scene.onSelectionChange(room.focusedMovie());
  } else if (room.state === 'inspect') {
    if (room.toggleFlip()) retailAudio.playBoxFlip();
  }
}
