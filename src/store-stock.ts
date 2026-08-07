// Movie-box stock instancing — extracted from StoreScene (three-scene.ts
// keeps one-line delegating stubs): building/clearing the instanced shelf
// stock (buildAllMovieBoxes/clearMovieBoxes/rebuildMovieBoxes), the stacked
// extra copies, the SSAO exclusion list, per-library column counts, the
// boot-time GL program warm-up, and the browse-time LOD/reflection-probe
// swap. Every function takes the StoreScene as its first parameter and
// reads/writes scene state exactly as the original methods did.
import * as THREE from 'three';
import { Movie } from './jellyfin';
import { buildGoldClamshellFillers, getGoldCaseMaterials, repaintGoldCase } from './fixtures/gold-clamshell';
import { posterQueue, CASE_MEDIUM, CASE_HEIGHT, CASE_DEPTH, textureArrayManager, createClonedCaseGeometry, getGlobalFrontMaterials, getGlobalBackMaterials, updateGlobalMaterialsEnvMap, leftmostColorCache, posterPixelCache, reflectionProbes, isGlobalMaterial, lowResCache, createProgramWarmupMaterials, gameShapeKey, gameDimsForShape, gameCaseDims, beginRebuildDrain, SERIES_DEPTH_MULT } from './video-case';
import { AISLE_SHELF_HEIGHTS, WALL_SHELF_HEIGHTS, LEAN_ANGLE, STAGGER_OFFSET, UNIT_SIDE_CAPACITY, BACK_WALL_UNIT_IDX, sideEntrySlot, COPY_X_JITTER_RANGE, EXTRA_COPY_DEPTH_STEP, extraCopiesCount, isUnstockedTitle, seededRandom01, MovieSlot } from './store-layout';
import { retailAudio } from './audio';
import {
  CASE_EULER_ORDER, sectionColSpan, SlotPos,
  tempPosition, tempRotation, tempQuaternion, tempScale, tempMatrix,
  AO_MASK_LAYER,
} from './scene-shared';
import type { StoreScene } from './three-scene';

// H2 (browse-keypress buffer churn): loadShelfDetails re-runs on every browse
// keypress for every slot updateLOD touches, and used to rewrite the slot's
// aSpineColor lanes + flag needsUpdate even when the colour hadn't changed —
// ~19 identical instanced-attribute buffers re-uploaded per keypress, plus a
// `new THREE.Color` per slot. Track the last hex actually written per slot
// (keyed weakly so rebuilt slot objects never pin stale entries) and skip the
// write + upload when it matches; one module-level scratch Color serves all
// conversions.
const lastWrittenSpineHex = new WeakMap<MovieSlot, string>();
const scratchSpineColor = new THREE.Color();

// ── Aisle batching ──────────────────────────────────────────────────────────
// One instanced-mesh pair per unit FACE is the movie rule: every movie case is
// the same box, so a whole shelf side draws in one call. A game case is not —
// it wears its platform's real retail carton (video-case.ts GAME_BOX_IN), and
// dims are baked into the geometry, so a Game Boy carton and a PlayStation
// jewel case cannot share a batch. The game DEPARTMENT fixture has always split
// its batches by box shape; games-only mode (games-only.ts) puts that same
// stock on the ordinary aisles, so the aisle path needs the identical split.
//
// The `|shape` suffix is what makes it work everywhere at once: the key is
// still "this library, this unit, this side" for movie stock (byte-identical
// to what it was), and every consumer just re-derives it from the movie.
const AISLE_SHAPE_SEP = '|';

function aisleMeshKey(libIdx: number, unitIdx: number, side: 'front' | 'back', movie: Movie): string {
  const base = `${libIdx}_${unitIdx}_${side}`;
  return movie.game
    ? `${base}${AISLE_SHAPE_SEP}${gameShapeKey(movie.platform, movie.discCount)}`
    : base;
}

/** The shape half of an aisle batch key, or null for ordinary movie stock. */
function aisleKeyShape(key: string): string | null {
  const i = key.indexOf(AISLE_SHAPE_SEP);
  return i < 0 ? null : key.slice(i + 1);
}

/**
 * Case height/depth for an aisle slot. Movies use the store-wide medium (with
 * the series-boxset depth bump); a game uses its platform's carton, exactly as
 * the game-section fixture does — including the fat jewel box for a multi-disc
 * title.
 */
function aisleCaseDims(movie: Movie): { height: number; depth: number; liftDepth: number } {
  if (movie.game) {
    const d = gameCaseDims(movie.platform, movie.discCount);
    return { height: d.h, depth: d.d, liftDepth: d.d };
  }
  return {
    height: CASE_HEIGHT,
    depth: CASE_DEPTH,
    liftDepth: CASE_DEPTH * (movie.isSeries ? SERIES_DEPTH_MULT : 1),
  };
}

export function clearMovieBoxes(scene: StoreScene) {
  scene.meshes.forEach(mesh => {
    scene.scene.remove(mesh);
    mesh.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) {
          object.material.forEach(m => {
            if (!isGlobalMaterial(m)) {
              m.dispose();
            }
          });
        } else {
          if (!isGlobalMaterial(object.material)) {
            object.material.dispose();
          }
        }
      }
    });
  });
  scene.meshes = [];
  scene.slotsByPosition.clear();
  scene.dirtySlots.clear();
  scene.movieInstancesMap.clear();
  scene.slotsByMovieId.clear();
  scene.unitSideFrontMeshMap.clear();
  scene.unitSideBackMeshMap.clear();
}

export function updateColsCount(scene: StoreScene) {
  if (scene.selectedUnitSource === 'fixture') {
    // Most floor fixtures (endcaps, promo stands, the bargain bin) really are
    // a fixed 3-per-face layout, but a few (game gondolas, the PV drape
    // table's 11-wide tiers) publish their own `cols` because they aren't —
    // read it off the fixture itself rather than assuming every fixture
    // matches the common case (feedback/050b: this used to hardcode 3 for
    // every non-game-section fixture, capping the drape table's browse
    // cursor at 3 of its actual 11 columns per face).
    const fixture = scene.slottedFixtures.find(f => f.placement.id === scene.selectedFixtureId);
    scene.colsCount = fixture && 'cols' in fixture ? (fixture as any).cols : 3;
  } else if (scene.selectedUnitIdx === BACK_WALL_UNIT_IDX) {
    scene.colsCount = scene.nrTotalCols; // left wall unit + continuous back wall
  } else {
    const entriesForSide = scene.getLayoutEntriesForActiveSide();
    // Must use the SAME rows-per-column divisor as sideEntrySlot(), or the
    // browse cursor's column range and the boxes' actual columns disagree.
    scene.colsCount = Math.max(1, Math.ceil(entriesForSide.length / AISLE_SHELF_HEIGHTS.length));
  }
}

export function buildAllMovieBoxes(scene: StoreScene) {
  scene.clearMovieBoxes();
  scene.slotsByPosition.clear();
  scene.movieInstancesMap.clear();
  scene.slotsByMovieId.clear();

  const backWallShelves = WALL_SHELF_HEIGHTS.length; // NEW RELEASES wall tiers (measured; see store-layout.ts)

  // 1. Initialize texture array manager
  const uniqueMovieIds = new Set<string>();
  
  // Only collect movies that are actually placed on the shelves/fixtures
  for (let libIdx = 0; libIdx < scene.libraries.length; libIdx++) {
    const layoutEntries = scene.layoutFor(libIdx).entries;
    layoutEntries.forEach(movie => {
      if (movie) uniqueMovieIds.add(movie.id);
    });
  }
  scene.recentlyAddedMovies.forEach(m => uniqueMovieIds.add(m.id));
  scene.nrSections.forEach(section => {
    if ((section.type === 'super-feature' || section.type === 'double-feature') && section.movie) {
      uniqueMovieIds.add(section.movie.id);
    } else if (section.type === 'regular' && section.movies) {
      section.movies.forEach(m => {
        if (m) uniqueMovieIds.add(m.id);
      });
    }
  });
  scene.slottedFixtures.forEach(fixture => {
    fixture.getSlots().forEach(slot => {
      if (slot.movie) uniqueMovieIds.add(slot.movie.id);
    });
  });

  console.log('[System debug] Unique movies count:', uniqueMovieIds.size, 'libraries count:', scene.libraries.length);
  textureArrayManager.init(uniqueMovieIds.size, scene.renderer);

  // 2. Count slots needed for each unit side to size our instanced meshes
  const unitSideCapacity = new Map<string, number>();

  // Count aisle slots for all libraries (category-sorted layout order; null
  // entries are section padding and occupy shelf positions but need no slot)
  for (let libIdx = 0; libIdx < scene.libraries.length; libIdx++) {
    const layoutEntries = scene.layoutFor(libIdx).entries;
    const blockOrder = scene.plan.entryBlockOrder(libIdx);

    layoutEntries.forEach((movie, idx) => {
      if (!movie) return;
      // Entry blocks flow in customer walk order — front of a line, around
      // the end cap, back of that line, next line (see entryBlockOrder).
      const bo = blockOrder[Math.floor(idx / UNIT_SIDE_CAPACITY)];
      if (!bo) return;
      const key = aisleMeshKey(libIdx, bo.unit, bo.side, movie);
      unitSideCapacity.set(key, (unitSideCapacity.get(key) || 0) + 1);
    });
  }

  // Count dynamic custom fixtures
  scene.slottedFixtures.forEach(fixture => {
    unitSideCapacity.set(`fixture_${fixture.placement.id}`, fixture.capacity);
  });

  // Fixture meshes are split per variant (and per platform shape for the
  // game section). Count the slots each split ACTUALLY receives so its mesh
  // is allocated at that size — allocating every split at full fixture
  // capacity left mostly zero-matrix instances that still cost vertex work
  // per draw and anchored the culling sphere to the world origin, and splits
  // with zero slots (e.g. every animated variant in DVD medium) were pure
  // dead weight (#105). Zero-slot splits now get no mesh at all. Fixture
  // slots are never re-keyed after build (rebuildMovieBoxes only compacts
  // aisle slots), so exact sizing is safe.
  const fixtureMeshKey = (fixtureId: string, movie: Movie): string => {
    const base = `fixture_${fixtureId}`;
    const isMovieAnimated = CASE_MEDIUM === 'vhs' && movie.libraryName === 'Animated Movies';
    if (fixtureId.startsWith('game-section')) {
      // One batch per RETAIL box shape (gameShapeKey): platforms sharing a
      // carton size share a batch, disc platforms use the keep case, and
      // anything with no box shape of its own falls back to the clamshell.
      const shape = gameShapeKey(movie.platform, movie.discCount);
      return isMovieAnimated ? `${base}_${shape}_animated` : `${base}_${shape}_regular`;
    }
    return isMovieAnimated ? `${base}_animated` : `${base}_regular`;
  };
  const fixtureMeshSlotCounts = new Map<string, number>();
  scene.slottedFixtures.forEach(fixture => {
    fixture.getSlots().forEach(slot => {
      const k = fixtureMeshKey(fixture.placement.id, slot.movie);
      fixtureMeshSlotCounts.set(k, (fixtureMeshSlotCounts.get(k) || 0) + 1);
    });
  });

  // Enumerate back wall placements up front (placed in step 5) so the
  // regular/animated wall meshes are likewise sized to actual usage instead
  // of full wall capacity for both.
  const isBackWallMovieAnimated = (movie: Movie) =>
    CASE_MEDIUM === 'vhs' && movie.libraryName === 'Animated Movies';
  const backWallPlacements: { movie: Movie; slotPos: SlotPos }[] = [];
  // Sections have variable width now (a double-feature spans 2 sections'
  // worth of columns), so walk a running column cursor instead of secIdx*6.
  let sectionStartCol = 0;
  scene.nrSections.forEach((section) => {
    const startCol = sectionStartCol;
    const endCol = Math.min(scene.nrTotalCols - 1, sectionStartCol + sectionColSpan(section) - 1);
    sectionStartCol += sectionColSpan(section);

    if ((section.type === 'super-feature' || section.type === 'double-feature') && section.movie) {
      // Feature: one movie fills every column and every row of its section
      // (12 columns wide for a double-feature, 6 for a super-feature)
      for (let row = 0; row < backWallShelves; row++) {
        const shelfIdx = (backWallShelves - 1) - row;
        for (let col = startCol; col <= endCol; col++) {
          backWallPlacements.push({ movie: section.movie, slotPos: { col, shelfIdx } });
        }
      }
    } else if (section.type === 'regular' && section.movies) {
      // Regular: left to right for a section (six copies), then top to bottom (row by row)
      for (let row = 0; row < backWallShelves; row++) {
        const shelfIdx = (backWallShelves - 1) - row;
        const movie = section.movies[row];
        if (movie) {
          for (let col = startCol; col <= endCol; col++) {
            backWallPlacements.push({ movie, slotPos: { col, shelfIdx } });
          }
        }
      }
    }
  });
  // New Releases wall batches follow the aisle rule (see aisleMeshKey): one
  // pair per front variant, split further by retail box shape when the stock is
  // games — games-only mode fills this wall from the Romm catalog too, and a
  // Game Boy carton can't share a batch with a PlayStation jewel case.
  const backWallMeshKey = (movie: Movie): string => {
    const base = isBackWallMovieAnimated(movie) ? 'back_wall_animated' : 'back_wall_regular';
    return movie.game
      ? `${base}${AISLE_SHAPE_SEP}${gameShapeKey(movie.platform, movie.discCount)}`
      : base;
  };
  const backWallCounts = new Map<string, number>();
  backWallPlacements.forEach(p => {
    const k = backWallMeshKey(p.movie);
    backWallCounts.set(k, (backWallCounts.get(k) || 0) + 1);
  });

  // 3. Allocate InstancedMesh objects for each unit side
  scene.unitSideFrontMeshMap.clear();
  scene.unitSideBackMeshMap.clear();

  // Instances start ZERO-SCALE (all-zero matrices), not three.js's default
  // identity: real placement happens later, per slot, in animate()'s dirty-slot
  // pass (as posters stream in). With identity starts, every not-yet-placed and
  // never-used tail instance renders as a case clump at the world origin — and
  // any render that happens before placement (environment bake, reflection
  // probes, mirrors) both captures that clump and caches a wrong culling
  // sphere for the mesh.
  const initInstancesHidden = (mesh: THREE.InstancedMesh) => {
    (mesh.instanceMatrix.array as Float32Array).fill(0);
  };

  unitSideCapacity.forEach((capacity, key) => {
    let isAnimated = false;
    if (!key.startsWith('fixture_')) {
      const parts = key.split('_');
      const libIdx = parseInt(parts[0], 10);
      if (scene.libraries[libIdx] && scene.libraries[libIdx].name === 'Animated Movies') {
        isAnimated = true;
      }
    }

    if (key.startsWith('fixture_')) {
      if (key.startsWith('fixture_game-section')) {
        // Only the shapes this fixture actually stocks (derived from the
        // counting pass above) get meshes — an unused shape gets none.
        const shapes = [...new Set([...fixtureMeshSlotCounts.keys()]
          .filter((k) => k.startsWith(`${key}_`))
          .map((k) => k.slice(key.length + 1).replace(/_(regular|animated)$/, '')))];
        for (const shape of shapes) {
          // Front box wears the game's art at its retail shape; the rental
          // clamshell behind it stays the generic rental shell.
          const { retail: dims, rental: rentalDims } = gameDimsForShape(shape);

          // One mesh pair per shape/variant, sized to the slots actually
          // assigned to it; unused combinations get no mesh (#105).
          for (const variant of ['regular', 'animated'] as const) {
            const shapeKey = `${key}_${shape}_${variant}`;
            const used = fixtureMeshSlotCounts.get(shapeKey) || 0;
            if (used === 0) continue;
            const isAnim = variant === 'animated';

            // Game fronts are exempt from the VHS poster crop
            // (aPosterCropSkip): game faces keep their media-class dims in
            // both mediums and their art decodes to fit the face ('fill' for
            // disc, contain-fit 'cart' for cartridge — #93).
            const frontMesh = new THREE.InstancedMesh(
              createClonedCaseGeometry(used, isAnim, false, dims, true),
              getGlobalFrontMaterials(isAnim),
              used
            );
            frontMesh.castShadow = true;
            frontMesh.receiveShadow = true;
            frontMesh.frustumCulled = true;
            initInstancesHidden(frontMesh);

            // rental back mesh is always regular (false)
            const backMesh = new THREE.InstancedMesh(
              createClonedCaseGeometry(used, false, true, rentalDims),
              getGlobalBackMaterials(false),
              used
            );
            backMesh.castShadow = true;
            backMesh.receiveShadow = true;
            backMesh.frustumCulled = true;
            initInstancesHidden(backMesh);

            scene.scene.add(frontMesh);
            scene.scene.add(backMesh);
            scene.meshes.push(frontMesh, backMesh);
            scene.unitSideFrontMeshMap.set(shapeKey, frontMesh);
            scene.unitSideBackMeshMap.set(shapeKey, backMesh);
          }
        }
      } else {
        // Regular and animated front/back meshes for custom fixtures — each
        // variant sized to actual usage, unused variants skipped (#105)
        for (const variant of ['regular', 'animated'] as const) {
          const variantKey = `${key}_${variant}`;
          const used = fixtureMeshSlotCounts.get(variantKey) || 0;
          if (used === 0) continue;
          const isAnim = variant === 'animated';

          const frontMesh = new THREE.InstancedMesh(createClonedCaseGeometry(used, isAnim), getGlobalFrontMaterials(isAnim), used);
          frontMesh.castShadow = true;
          frontMesh.receiveShadow = true;
          frontMesh.frustumCulled = true;
          initInstancesHidden(frontMesh);

          // rental back mesh is always regular (false)
          const backMesh = new THREE.InstancedMesh(createClonedCaseGeometry(used, false, true), getGlobalBackMaterials(false), used);
          backMesh.castShadow = true;
          backMesh.receiveShadow = true;
          backMesh.frustumCulled = true;
          initInstancesHidden(backMesh);

          scene.scene.add(frontMesh);
          scene.scene.add(backMesh);
          scene.meshes.push(frontMesh, backMesh);
          scene.unitSideFrontMeshMap.set(variantKey, frontMesh);
          scene.unitSideBackMeshMap.set(variantKey, backMesh);
        }
      }
    } else {
      // Game stock on an aisle gets its platform's retail carton up front and
      // the generic rental shell behind it — the same pair the game
      // department builds, just batched per unit face instead of per fixture.
      const shape = aisleKeyShape(key);
      const gameDims = shape ? gameDimsForShape(shape) : null;
      const frontMesh = new THREE.InstancedMesh(
        gameDims
          ? createClonedCaseGeometry(capacity, isAnimated, false, gameDims.retail, true)
          : createClonedCaseGeometry(capacity, isAnimated),
        getGlobalFrontMaterials(isAnimated),
        capacity
      );
      frontMesh.castShadow = true;
      frontMesh.receiveShadow = true;
      frontMesh.frustumCulled = true;
      initInstancesHidden(frontMesh);

      // rental back mesh is always regular (false)
      const backMesh = new THREE.InstancedMesh(createClonedCaseGeometry(capacity, false, true, gameDims?.rental), getGlobalBackMaterials(false), capacity);
      backMesh.castShadow = true;
      backMesh.receiveShadow = true;
      backMesh.frustumCulled = true;
      initInstancesHidden(backMesh);

      scene.scene.add(frontMesh);
      scene.scene.add(backMesh);
      scene.meshes.push(frontMesh, backMesh);

      scene.unitSideFrontMeshMap.set(key, frontMesh);
      scene.unitSideBackMeshMap.set(key, backMesh);
    }
  });

  // Allocate back wall meshes — sized to the placements counted above rather
  // than full wall capacity; a combination with no placements gets no mesh at
  // all (#105), which is how the animated pair stays absent in DVD medium.
  backWallCounts.forEach((count, bwKey) => {
    if (count === 0) return;
    const isAnim = bwKey.startsWith('back_wall_animated');
    const shape = aisleKeyShape(bwKey);
    const gameDims = shape ? gameDimsForShape(shape) : null;

    const bwFrontMesh = new THREE.InstancedMesh(
      gameDims
        ? createClonedCaseGeometry(count, isAnim, false, gameDims.retail, true)
        : createClonedCaseGeometry(count, isAnim),
      getGlobalFrontMaterials(isAnim),
      count
    );
    bwFrontMesh.castShadow = true;
    bwFrontMesh.receiveShadow = true;
    bwFrontMesh.frustumCulled = true;
    initInstancesHidden(bwFrontMesh);

    // NR wall rental copies wear the red-sleeve/gold-ticket NEW RELEASE
    // RENTAL insert (user direction: behind EVERY New Releases item), not
    // the generic blue-ticket wrap the aisle back boxes use — and that holds
    // for animated titles and for games' rental shells alike.
    const bwBackMesh = new THREE.InstancedMesh(
      createClonedCaseGeometry(count, false, true, gameDims?.rental),
      getGoldCaseMaterials(),
      count
    );
    bwBackMesh.castShadow = true;
    bwBackMesh.receiveShadow = true;
    bwBackMesh.frustumCulled = true;
    initInstancesHidden(bwBackMesh);

    scene.scene.add(bwFrontMesh);
    scene.scene.add(bwBackMesh);
    scene.meshes.push(bwFrontMesh, bwBackMesh);

    scene.unitSideFrontMeshMap.set(bwKey, bwFrontMesh);
    scene.unitSideBackMeshMap.set(bwKey, bwBackMesh);
  });

  // Keep instance counter per unit side
  const currentInstanceIdx = new Map<string, number>();

  // Helper function to setup slot attributes
  const setupSlot = (slot: MovieSlot) => {
    // Index the slot under its title so a poster landing later can re-dirty it
    // (three-scene's setPosterLoadedNotify) — a title can hold several slots.
    let sameMovie = scene.slotsByMovieId.get(slot.movie.id);
    if (!sameMovie) scene.slotsByMovieId.set(slot.movie.id, (sameMovie = []));
    sameMovie.push(slot);

    const texIdx = textureArrayManager.getIndex(slot.movie.id);
    
    const fIdxAttr = slot.frontMesh.geometry.getAttribute('aTextureIndex') as THREE.InstancedBufferAttribute;
    if (fIdxAttr) fIdxAttr.setX(slot.instanceIdx, texIdx);
    const bIdxAttr = slot.backMesh.geometry.getAttribute('aTextureIndex') as THREE.InstancedBufferAttribute;
    if (bIdxAttr) bIdxAttr.setX(slot.instanceIdx, texIdx);

    const spineColorHex = leftmostColorCache.get(slot.movie.id) || '#0f172a';
    scratchSpineColor.set(spineColorHex);
    const fSpine = slot.frontMesh.geometry.getAttribute('aSpineColor') as THREE.InstancedBufferAttribute;
    if (fSpine) fSpine.setXYZ(slot.instanceIdx, scratchSpineColor.r, scratchSpineColor.g, scratchSpineColor.b);
    const bSpine = slot.backMesh.geometry.getAttribute('aSpineColor') as THREE.InstancedBufferAttribute;
    if (bSpine) bSpine.setXYZ(slot.instanceIdx, scratchSpineColor.r, scratchSpineColor.g, scratchSpineColor.b);
    // Seed the skip-cache with what's now in the buffer (this initial write
    // rides the buffer's first upload, no needsUpdate required).
    lastWrittenSpineHex.set(slot, spineColorHex);

    slot.loadShelfDetails = (priority = 1, onSettled?: () => void) => {
      if (posterPixelCache.has(slot.movie.id)) {
        const highResBitmap = posterPixelCache.get(slot.movie.id)!;
        const lowResBitmap = lowResCache.get(slot.movie.id);

        if (scene.renderer) {
          // updateLOD() re-runs this on every browse keypress once caches
          // are warm; queueLowRes/queueHighRes dedupe at queue time so the
          // re-runs are no-ops (issues #98/#104), and the budgeted upload
          // queue keeps a warm-cache shelf reveal from paying dozens of
          // synchronous GPU uploads in a single frame.
          if (lowResBitmap) {
            textureArrayManager.queueLowRes(scene.renderer, slot.movie.id, lowResBitmap);
          }
          // Background priority normally leaves the full-res upload for later —
          // except for a title whose only layer IS the full-res one (an
          // overflowed catalog, see poster-textures.ts POSTER_BANKS), where
          // skipping it means the case never paints at all.
          if ((priority >= 1 || textureArrayManager.usesHighResOnly(slot.movie.id)) && highResBitmap) {
            textureArrayManager.queueHighRes(scene.renderer, slot.movie.id, highResBitmap);
          }
        }

        const hexColor = leftmostColorCache.get(slot.movie.id) || '#0f172a';
        // Skip the write + full-buffer re-upload when the colour already in
        // the attribute is identical (the warm-cache case on every keypress).
        if (lastWrittenSpineHex.get(slot) !== hexColor) {
          lastWrittenSpineHex.set(slot, hexColor);
          scratchSpineColor.set(hexColor);
          const fSp = slot.frontMesh.geometry.getAttribute('aSpineColor') as THREE.InstancedBufferAttribute;
          if (fSp) {
            fSp.setXYZ(slot.instanceIdx, scratchSpineColor.r, scratchSpineColor.g, scratchSpineColor.b);
            fSp.needsUpdate = true;
          }
          const bSp = slot.backMesh.geometry.getAttribute('aSpineColor') as THREE.InstancedBufferAttribute;
          if (bSp) {
            bSp.setXYZ(slot.instanceIdx, scratchSpineColor.r, scratchSpineColor.g, scratchSpineColor.b);
            bSp.needsUpdate = true;
          }
        }
        onSettled?.();
        return;
      }

      // A posterPixelCache MISS here can mean two different things at real
      // catalog scale: this title was never decoded (needs a real decode), or
      // it WAS decoded and its art already reached the GPU array — only its
      // CPU pixel-cache entry got evicted to stay under budget. Once a GPU
      // array layer is uploaded it is never evicted (unlike posterPixelCache/
      // lowResCache), so in the second case the shelf already looks correct
      // and redecoding would only refill a CPU cache this call doesn't need.
      // Skipping that redundant redecode matters because updateLOD() re-runs
      // loadShelfDetails on every browse keypress for every slot it touches
      // — without this check, a bounded cache turned that into "every aisle
      // change re-decodes its shelves in a churn storm" (observed 2026-08-05).
      // Check whichever resolution THIS call actually needs: background
      // priority only needs low-res on screen, full priority needs high-res
      // specifically (matches the priority gate above).
      const needsHighRes = priority >= 1 || textureArrayManager.usesHighResOnly(slot.movie.id);
      const alreadyOnGPU = needsHighRes
        ? textureArrayManager.hasHighRes(slot.movie.id)
        : textureArrayManager.hasArt(slot.movie.id);
      if (alreadyOnGPU) {
        onSettled?.();
        return;
      }

      if (!slot.movie.posterUrl) {
        // Nothing to fetch for this slot — settle immediately so callers awaiting
        // full-catalog readiness don't hang on titles with no artwork.
        onSettled?.();
        return;
      }

      posterQueue.load(slot.movie, priority, (pixels) => {
        if (scene.renderer) {
          // Fresh decodes are queued (budgeted, flag flips tied to the real
          // upload) by the posterQueue completion handler itself — these
          // dedupe to no-ops there, and catch the cached-pixels path where
          // that handler never ran (e.g. warm cache after a rebuild).
          const lowResBitmap = lowResCache.get(slot.movie.id);
          if (lowResBitmap) {
            textureArrayManager.queueLowRes(scene.renderer, slot.movie.id, lowResBitmap);
          }
          if (priority >= 1 || textureArrayManager.usesHighResOnly(slot.movie.id)) {
            textureArrayManager.queueHighRes(scene.renderer, slot.movie.id, pixels);
          }
        }
        const hexColor = leftmostColorCache.get(slot.movie.id) || '#0f172a';
        // Same skip as the warm-cache path above: fresh decodes usually DO
        // change the colour (placeholder navy → real spine hex), but a
        // re-fire with identical colour must not re-upload two buffers.
        if (lastWrittenSpineHex.get(slot) !== hexColor) {
          lastWrittenSpineHex.set(slot, hexColor);
          scratchSpineColor.set(hexColor);
          const fSp = slot.frontMesh.geometry.getAttribute('aSpineColor') as THREE.InstancedBufferAttribute;
          if (fSp) {
            fSp.setXYZ(slot.instanceIdx, scratchSpineColor.r, scratchSpineColor.g, scratchSpineColor.b);
            fSp.needsUpdate = true;
          }
          const bSp = slot.backMesh.geometry.getAttribute('aSpineColor') as THREE.InstancedBufferAttribute;
          if (bSp) {
            bSp.setXYZ(slot.instanceIdx, scratchSpineColor.r, scratchSpineColor.g, scratchSpineColor.b);
            bSp.needsUpdate = true;
          }
        }
        slot.needsInitialMatrixUpdate = true;
        scene.dirtySlots.add(slot);
      }, onSettled);
    };

    slot.loadFullDetails = () => {
      slot.loadShelfDetails(3);
    };
  };

  // 4. Populate all Aisle Slots (category-sorted layout order; nulls are
  // section padding — they hold their shelf position but get no case)
  for (let libIdx = 0; libIdx < scene.libraries.length; libIdx++) {
    const libUnits = scene.shelvingUnits.filter(u => u.libraryIdx === libIdx);
    const layoutEntries = scene.layoutFor(libIdx).entries;
    const blockOrder = scene.plan.entryBlockOrder(libIdx);

    layoutEntries.forEach((movie, idx) => {
      if (!movie) return;
      // Entry blocks flow in customer walk order — front of a line, around
      // the end cap, back of that line (line-reversed so it reads
      // left-to-right from the far aisle), then the next line. See
      // StorePlan.entryBlockOrder.
      const blockIdx = Math.floor(idx / UNIT_SIDE_CAPACITY);
      const bo = blockOrder[blockIdx];
      if (!bo) return;
      const side = bo.side;
      const unitIdxInLibrary = bo.unit;
      const unit = libUnits[unitIdxInLibrary];
      if (!unit) return;

      const xCenter = unit.xCenter;
      const remSide = idx % UNIT_SIDE_CAPACITY;

      // Calculate total columns on this side of this unit for mapping
      const startIdx = blockIdx * UNIT_SIDE_CAPACITY;
      const entriesForSide = layoutEntries.slice(startIdx, startIdx + UNIT_SIDE_CAPACITY);
      const { shelfIdx, col } = sideEntrySlot(entriesForSide.length, remSide);

      const shelfY = AISLE_SHELF_HEIGHTS[shelfIdx];
      // Games stand at their platform's real carton size; movies at the
      // store-wide medium (see aisleCaseDims).
      const { height: boxHeight, depth: boxDepth, liftDepth } = aisleCaseDims(movie);

      const localZ = scene.aisleColZ(unit, col, side);
      const fSign = unit.browseSign;
      const copies = extraCopiesCount(movie);
      const offset = 0.44 + copies * 0.07;
      const localX = xCenter + (side === 'front' ? 1 : -1) * fSign * offset;
      const unitAngle = unit.yaw;
      const aisleWorld = scene.unitToWorld(unit, localX, localZ);
      const rotationY = (side === 'front' ? 1 : -1) * fSign * (Math.PI / 2) + unitAngle;
      const hinge = scene.leanHingeOffset(LEAN_ANGLE, rotationY, boxHeight);
      // Series boxsets are SERIES_DEPTH_MULT deeper, so their leaned bottom
      // edge needs proportionally more lift to stay out of the shelf board.
      const yPos = shelfY + 0.03 + hinge.y + (liftDepth / 2) * Math.sin(Math.abs(LEAN_ANGLE));
      const xPos = aisleWorld.x + hinge.x;
      const boxZ = aisleWorld.z + hinge.z;

      const key = `${libIdx}_${unitIdxInLibrary}_${side}_${shelfIdx}_${col}`;
      const unitKey = aisleMeshKey(libIdx, unitIdxInLibrary, side, movie);
      const frontMesh = scene.unitSideFrontMeshMap.get(unitKey)!;
      const backMesh = scene.unitSideBackMeshMap.get(unitKey)!;

      const instIdx = currentInstanceIdx.get(unitKey) || 0;
      currentInstanceIdx.set(unitKey, instIdx + 1);

      const backJitter = (seededRandom01(movie.id) - 0.5) * COPY_X_JITTER_RANGE;
      const slot: MovieSlot = {
        movie,
        libraryIdx: libIdx,
        unitIdx: unitIdxInLibrary,
        // Requestable gap / discovery / coming-soon stock has no rental copy —
        // nothing may stand behind its display case (see isUnstockedTitle).
        noRentalCase: isUnstockedTitle(movie),
        side,
        shelfIdx,
        col,
        key,
        frontMesh,
        backMesh,
        instanceIdx: instIdx,
        genericInstanceIdx: 0,
        restingX: xPos,
        restingY: yPos,
        restingZ: boxZ,
        restingRotY: rotationY,
        restingRotX: LEAN_ANGLE,
        aisleAngle: unitAngle,
        browseSign: fSign,
        depth: boxDepth,
        currentX: xPos,
        currentY: yPos,
        currentZ: boxZ,
        currentRotX: LEAN_ANGLE,
        currentRotY: rotationY,
        frontX: -STAGGER_OFFSET,
        frontZ: boxDepth / 2,
        frontRotY: 0,
        backJitter,
        backX: -STAGGER_OFFSET + backJitter,
        backZ: -boxDepth / 2,
        backRotY: 0,
        currentScale: 1.0,
        loadShelfDetails: () => {},
        loadFullDetails: () => {},
        needsInitialMatrixUpdate: true,
        hidden: false
      };

      setupSlot(slot);
      scene.slotsByPosition.set(key, slot);
      scene.dirtySlots.add(slot);
    });
  }

  // 5. Populate all Back Wall (New Releases) Slots (only once, libIdx = 0)
  const libIdx = 0;
  const backWallUnitIdx = BACK_WALL_UNIT_IDX;

  const placeBackWallMovie = (movie: Movie, slotPos: SlotPos) => {
    const { height: boxHeight, depth: boxDepth, liftDepth } = aisleCaseDims(movie);
    const col = slotPos.col;
    const shelfIdx = slotPos.shelfIdx;

    const shelfY = WALL_SHELF_HEIGHTS[shelfIdx];
    const transform = scene.getNewReleasesSlotTransform(col, movie);
    const hinge = scene.leanHingeOffset(LEAN_ANGLE, transform.rotationY, boxHeight);
    // Series boxsets are SERIES_DEPTH_MULT deeper, so their leaned bottom
    // edge needs proportionally more lift to stay out of the shelf board.
    const yPos = shelfY + 0.03 + hinge.y + (liftDepth / 2) * Math.sin(Math.abs(LEAN_ANGLE));
    const bwX = transform.x + hinge.x;
    const bwZ = transform.z + hinge.z;

    const key = `${libIdx}_${backWallUnitIdx}_front_${shelfIdx}_${col}`;
    const bwKey = backWallMeshKey(movie);
    const frontMesh = scene.unitSideFrontMeshMap.get(bwKey)!;
    const backMesh = scene.unitSideBackMeshMap.get(bwKey)!;

    const instIdx = currentInstanceIdx.get(bwKey) || 0;
    currentInstanceIdx.set(bwKey, instIdx + 1);

    const backJitter = (seededRandom01(movie.id) - 0.5) * COPY_X_JITTER_RANGE;
    const slot: MovieSlot = {
      movie,
      libraryIdx: libIdx,
      unitIdx: backWallUnitIdx,
      // A coming-soon New Releases entry is poster art only — no rental copy
      // behind it (see isUnstockedTitle).
      noRentalCase: isUnstockedTitle(movie),
      side: 'front',
      shelfIdx,
      col,
      key,
      frontMesh,
      backMesh,
      instanceIdx: instIdx,
      genericInstanceIdx: 0,
      restingX: bwX,
      restingY: yPos,
      restingZ: bwZ,
      restingRotY: transform.rotationY,
      restingRotX: LEAN_ANGLE,
      depth: boxDepth,
      currentX: bwX,
      currentY: yPos,
      currentZ: bwZ,
      currentRotX: LEAN_ANGLE,
      currentRotY: transform.rotationY,
      frontX: -STAGGER_OFFSET,
      frontZ: boxDepth / 2,
      frontRotY: 0,
      backJitter,
      backX: -STAGGER_OFFSET + backJitter,
      backZ: -boxDepth / 2,
      backRotY: 0,
      currentScale: 1.0,
      loadShelfDetails: () => {},
      loadFullDetails: () => {},
      needsInitialMatrixUpdate: true,
      hidden: false
    };

    setupSlot(slot);
    scene.slotsByPosition.set(key, slot);
    scene.dirtySlots.add(slot);
  };

  // 5. Populate all Back Wall (New Releases) Slots (only once, libIdx = 0)
  // — the placements were enumerated in step 2 to size the wall meshes
  backWallPlacements.forEach(({ movie, slotPos }) => placeBackWallMovie(movie, slotPos));

  // 6. Populate Slotted Fixtures
  scene.slottedFixtures.forEach(fixture => {
    const slots = fixture.getSlots();
    slots.forEach(fixtureSlot => {
      const movie = fixtureSlot.movie;
      const key = fixtureSlot.key;
      // Same key derivation the sizing pass used in step 2, so every slot
      // lands in a mesh allocated at exactly its split's usage count
      const fixtureKey = fixtureMeshKey(fixture.placement.id, movie);

      const frontMesh = scene.unitSideFrontMeshMap.get(fixtureKey)!;
      const backMesh = scene.unitSideBackMeshMap.get(fixtureKey)!;

      const instIdx = currentInstanceIdx.get(fixtureKey) || 0;
      currentInstanceIdx.set(fixtureKey, instIdx + 1);

      const backJitter = (seededRandom01(movie.id) - 0.5) * COPY_X_JITTER_RANGE;
      const slot: MovieSlot = {
        movie,
        libraryIdx: 0,
        unitIdx: -1,
        source: 'fixture',
        fixtureId: fixture.placement.id,
        // Resolved once here rather than looked up per-frame in the slot
        // transform loop (which runs for every dirty slot, every frame).
        // Unstocked titles (endcap "we don't have it" candidates etc.) have no
        // rental copy regardless of the fixture's own option.
        noRentalCase: fixture.placement.options?.noRentalCase === true || isUnstockedTitle(movie),
        side: fixtureSlot.side,
        shelfIdx: fixtureSlot.shelfIdx,
        col: fixtureSlot.col,
        key,
        frontMesh,
        backMesh,
        instanceIdx: instIdx,
        genericInstanceIdx: 0,
        restingX: fixtureSlot.restingX,
        restingY: fixtureSlot.restingY,
        restingZ: fixtureSlot.restingZ,
        restingRotY: fixtureSlot.restingRotY,
        restingRotX: fixtureSlot.restingRotX ?? -0.25,
        depth: fixtureSlot.depth,
        currentX: fixtureSlot.restingX,
        currentY: fixtureSlot.restingY,
        currentZ: fixtureSlot.restingZ,
        currentRotX: fixtureSlot.restingRotX ?? -0.25,
        currentRotY: fixtureSlot.restingRotY,
        frontX: 0,
        frontZ: fixtureSlot.depth / 2,
        frontRotY: 0,
        backJitter,
        backX: backJitter,
        backZ: -fixtureSlot.depth / 2,
        backRotY: 0,
        currentScale: 1.0,
        loadShelfDetails: () => {},
        loadFullDetails: () => {},
        needsInitialMatrixUpdate: true,
        hidden: false
      };

      setupSlot(slot);
      scene.slotsByPosition.set(key, slot);
      scene.dirtySlots.add(slot);
    });
  });

  // Mark attributes as needing update so they are uploaded to GPU
  scene.unitSideFrontMeshMap.forEach(mesh => {
    const fIdxAttr = mesh.geometry.getAttribute('aTextureIndex') as THREE.InstancedBufferAttribute;
    if (fIdxAttr) fIdxAttr.needsUpdate = true;
    const fSp = mesh.geometry.getAttribute('aSpineColor') as THREE.InstancedBufferAttribute;
    if (fSp) fSp.needsUpdate = true;
  });
  scene.unitSideBackMeshMap.forEach(mesh => {
    const bIdxAttr = mesh.geometry.getAttribute('aTextureIndex') as THREE.InstancedBufferAttribute;
    if (bIdxAttr) bIdxAttr.needsUpdate = true;
    const bSp = mesh.geometry.getAttribute('aSpineColor') as THREE.InstancedBufferAttribute;
    if (bSp) bSp.needsUpdate = true;
  });

  // 7. Build static extra-copy cases for high-rated films.
  scene.rebuildExtraCopies();

  // 8. Pre-load all covers in low-res in the background, tracking completion
  // via texturesReadyPromise so the caller can hold the scene hidden/non-
  // interactive until every cover has settled (loaded or failed) rather than
  // revealing a wall of gray placeholder spines that fill in over time.
  const allSlots = Array.from(scene.slotsByPosition.values());
  const total = allSlots.length;
  let loaded = 0;
  // Nothing is interactive while this preload runs (the boot overlay is up), so
  // the queue should drain at burst rate rather than the polite 4-per-frame
  // interactive budget — the same reasoning rebuildStoreScene applies to a
  // no-reload rebuild. It matters most at catalog scale: a 7k-title store
  // otherwise reveals a room of bare rental shells that paint in over tens of
  // seconds. Self-clearing when the queue empties.
  beginRebuildDrain();
  scene.onTextureLoadProgress?.(0, total);
  scene.texturesReadyPromise = Promise.all(allSlots.map(slot => new Promise<void>(resolve => {
    slot.loadShelfDetails(0, () => {
      loaded++;
      scene.onTextureLoadProgress?.(loaded, total);
      resolve();
    });
  }))).then(() => {
    // Posters are in the pixel cache now, so the warm-up can build the real
    // hero materials (not placeholder fallbacks) — see the method's comment.
    scene.warmupRuntimePrograms();
  });

  // T25 #26 (superseded): the per-rented-title gold filler group is gone —
  // the NR wall back meshes above wear the gold materials for every slot.
  // The call clears any legacy group; the repaint re-runs the palette swap
  // once the source scans have decoded, or it would stay white paper.
  buildGoldClamshellFillers(scene);
  scene.texturesReadyPromise?.then(() => {
    repaintGoldCase();
    scene.requestRender();
  });
}

export function warmupRuntimePrograms(scene: StoreScene) {
  if (scene.warmedPrograms) return;
  scene.warmedPrograms = true;
  try {
    const geo = new THREE.BoxGeometry(0.01, 0.01, 0.01);
    const warmScene = new THREE.Group();
    let firstWithPoster: Movie | null = null;
    let firstSeries: Movie | null = null;
    let firstAnimated: Movie | null = null;
    for (const lib of scene.libraries) {
      for (const m of lib.movies) {
        if (!firstWithPoster && posterPixelCache.has(m.id)) firstWithPoster = m;
        if (!firstSeries && m.isSeries) firstSeries = m;
        if (!firstAnimated && lib.name === 'Animated Movies') firstAnimated = m;
        if (firstWithPoster && firstSeries && firstAnimated) break;
      }
    }
    const movie = firstWithPoster ?? scene.libraries[0]?.movies[0];
    if (!movie) { geo.dispose(); return; }
    const warm = createProgramWarmupMaterials(movie, firstAnimated, firstSeries);
    // NOT renderer.compile()/compileAsync(): those compile against the
    // CANVAS output (srgb) with whatever clipping state is current, while
    // the scene actually renders into the composer's linear target
    // (srgb-linear, 0 planes) — every "warmed" program was a variant the
    // runtime never uses (verified via the __perfRun newPrograms diff). And
    // Mesa/ANGLE defer real compilation to the first DRAW anyway. So: park
    // the warm meshes in the real scene below the floor (frustumCulled=false
    // forces the draw; off-screen means zero fragments) and push one real
    // composer frame through them.
    for (const mats of warm.materialSets) {
      const mesh = new THREE.Mesh(geo, mats.length === 1 ? mats[0] : mats);
      mesh.frustumCulled = false;
      warmScene.add(mesh);
    }
    // The checkout bag's glossy-plastic variant (map + alphaTest + clearcoat
    // + DoubleSide) otherwise compiles mid-checkout on its first draw.
    const bagMat = scene.entrance?.getBagWarmupMaterial();
    if (bagMat) {
      const bagWarm = new THREE.Mesh(geo, bagMat);
      bagWarm.frustumCulled = false;
      warmScene.add(bagWarm);
    }
    warmScene.position.set(11, -60, 0);
    scene.scene.add(warmScene);
    const t0 = performance.now();
    if (scene.composer) {
      if (scene.bokehPass) scene.bokehPass.enabled = true; // DOF programs compile on first inspect otherwise
      scene.composer.render();
      if (scene.bokehPass) scene.bokehPass.enabled = false;
    } else {
      scene.renderer.render(scene.scene, scene.camera);
    }
    scene.scene.remove(warmScene);
    geo.dispose();
    warm.dispose();
    retailAudio.prewarm(); // first sound otherwise pays AudioContext setup mid-keypress
    // First-bind AND first-swap dry runs: the first real selection *change*
    // pays hero mesh creation, a second title's four cover-canvas draws +
    // texture uploads and the first hero-visible composite (a ~50ms
    // GPU-pipeline blip even with all programs warm) — pay both binds here,
    // each with its own composite, exactly like two real selection moves.
    const swapTo = scene.libraries[0]?.movies[1] ?? null;
    for (const bind of swapTo ? [movie, swapTo] : [movie]) {
      scene.ensureHeroCases(bind);
      if (scene.heroFrontMesh && scene.heroBackMesh) {
        scene.heroFrontMesh.visible = true;
        scene.heroBackMesh.visible = true;
        scene.composer?.render();
      }
    }
    scene.hideHeroCases();
    console.log(`[warmup] hero material programs drawn+compiled in ${(performance.now() - t0).toFixed(0)}ms`);
  } catch (e) {
    console.warn('[warmup] runtime program warmup failed:', e);
  }
}

export function rebuildExtraCopies(scene: StoreScene) {
  // NR wall slots carry no backstock stack: the ~0.38ft wall shelf fits only
  // the display box + its gold NEW RELEASE RENTAL copy, and the blue generic
  // extras both mismatched the wall's red/gold case and sank through the
  // shelf/backing (user-reported when picking a title up). The same title's
  // aisle slot keeps its backstock as before.
  //
  // Nor do the DUPLICATE face-out copies a thin section gets stocked with
  // (sectionFillCopies): those adjacent boxes already ARE that title's depth on
  // this face, so restacking backstock behind every one of them multiplies the
  // instance count on exactly the well-rated titles the fill ranks highest, for
  // no visual gain. The first copy on a face keeps its stack; its repeats don't.
  // Fixture slots keep the old per-slot behaviour (their stock is curated, not
  // padded, and their ids don't share a unit face).
  const copies = new Map<MovieSlot, number>();
  const stackedOnFace = new Set<string>();
  let totalExtra = 0;
  scene.slotsByPosition.forEach(slot => {
    let n = 0;
    if (slot.unitIdx === BACK_WALL_UNIT_IDX) {
      n = 0;
    } else if (slot.source === 'fixture') {
      n = extraCopiesCount(slot.movie);
    } else {
      const faceKey = `${slot.libraryIdx}_${slot.unitIdx}_${slot.side}_${slot.movie.id}`;
      if (!stackedOnFace.has(faceKey)) {
        stackedOnFace.add(faceKey);
        n = extraCopiesCount(slot.movie);
      }
    }
    if (n > 0) copies.set(slot, n);
    totalExtra += n;
  });

  if (totalExtra === 0) {
    if (scene.extraCopiesMesh) {
      scene.extraCopiesMesh.visible = false;
    }
    return;
  }

  if (!scene.extraCopiesMesh || scene.extraCopiesCapacity !== totalExtra) {
    if (scene.extraCopiesMesh) {
      scene.scene.remove(scene.extraCopiesMesh);
      const idx = scene.meshes.indexOf(scene.extraCopiesMesh);
      if (idx !== -1) scene.meshes.splice(idx, 1);
      scene.extraCopiesMesh.geometry.dispose();
    }
    const extraMesh = new THREE.InstancedMesh(
      createClonedCaseGeometry(totalExtra, false, true),
      getGlobalBackMaterials(),
      totalExtra
    );
    extraMesh.castShadow = true;
    extraMesh.receiveShadow = true;
    extraMesh.frustumCulled = true;
    scene.scene.add(extraMesh);
    scene.meshes.push(extraMesh);
    scene.extraCopiesMesh = extraMesh;
    scene.extraCopiesCapacity = totalExtra;
  }

  const extraMesh = scene.extraCopiesMesh;
  extraMesh.visible = true;

  let extraIdx = 0;
  scene.slotsByPosition.forEach(slot => {
    const count = copies.get(slot) ?? 0;
    if (count === 0) return;
    const theta = slot.restingRotY;
    const pitch = slot.restingRotX ?? LEAN_ANGLE;
    // Same orientation as the box itself -- the local depth-offset vector below is
    // rotated through this same quaternion so a copy's offset actually follows the
    // box's own leaned depth axis instead of sliding back purely horizontally.
    tempRotation.set(pitch, theta, 0, CASE_EULER_ORDER);
    tempQuaternion.setFromEuler(tempRotation);
    for (let n = 0; n < count; n++) {
      if (slot.hidden) {
        tempMatrix.makeScale(0, 0, 0);
        extraMesh.setMatrixAt(extraIdx++, tempMatrix);
        continue;
      }
      // Deterministic per-copy horizontal jitter -- STAGGER_OFFSET is the leftmost
      // bound (matching the front case's peek) and jitter can push a copy slightly
      // right of that, so stacked copies don't all peek out at the same spot.
      const isDisplayStand = slot.source === 'fixture';
      const midpoint = isDisplayStand ? 0 : -STAGGER_OFFSET;
      const jitter = seededRandom01(`${slot.movie.id}_${n}`);
      const backXLocal = midpoint + (jitter - 0.5) * COPY_X_JITTER_RANGE;
      // Shift start position by CASE_DEPTH so they don't overlap the main box.
      const backZLocal = -(CASE_DEPTH / 2) - CASE_DEPTH - EXTRA_COPY_DEPTH_STEP * n;
      // Rotating by pitch+yaw (not just yaw, as before) keeps the copy's bottom
      // edge flush with the shelf instead of sinking through it as it moves back --
      // the same reasoning as leanHingeOffset(), applied to a depth offset instead
      // of a height offset.
      const rx = backXLocal * Math.cos(theta) + backZLocal * Math.sin(theta);
      const rz = -backXLocal * Math.sin(theta) + backZLocal * Math.cos(theta);
      tempPosition.set(slot.restingX + rx, slot.restingY, slot.restingZ + rz);
      tempScale.set(1, 1, 1);
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      extraMesh.setMatrixAt(extraIdx++, tempMatrix);
    }
  });

  extraMesh.instanceMatrix.needsUpdate = true;
  extraMesh.boundingSphere = null; // matrices changed → recompute culling sphere on next cull
}

export function rebuildSSAOExclusionList(scene: StoreScene) {
  scene.ssaoExcludedObjects = [];
  scene.aoMaskRoots = [];
  if (!scene.scene) return;
  scene.scene.traverse((object) => {
    // Lights must be visible to the AO-mask layer render (lights are
    // layer-culled like meshes): a zero-light render of the mask objects'
    // lit materials would compile fresh zero-light program variants —
    // a mid-session shader-compile hitch and newPrograms noise.
    if ((object as THREE.Light).isLight) {
      object.layers.enable(AO_MASK_LAYER);
      return;
    }
    if (object.userData && object.userData.excludeFromSSAO === true) {
      scene.ssaoExcludedObjects.push(object);
      if (object.userData.aoBlendMask === true) scene.aoMaskRoots.push(object);
    }
  });
}

export function rebuildMovieBoxes(scene: StoreScene) {
  // Geometry is changing (placeholder cases cast shadows, shelves are re-stocked):
  // re-bake the shadow map over the next few frames as the layout settles.
  scene.queueStructuralShadowRefresh();
  for (let libIdx = 0; libIdx < scene.libraries.length; libIdx++) {
    const libUnits = scene.shelvingUnits.filter(u => u.libraryIdx === libIdx);

    // 1. Collect and remove all aisle slots for this library from the map
    const libSlots: MovieSlot[] = [];
    const keysToRemove: string[] = [];
    scene.slotsByPosition.forEach((slot, key) => {
      if (slot.libraryIdx === libIdx &&
          slot.unitIdx !== BACK_WALL_UNIT_IDX &&
          slot.source !== 'fixture') {
        libSlots.push(slot);
        keysToRemove.push(key);
      }
    });
    keysToRemove.forEach(k => scene.slotsByPosition.delete(k));

    // 2. Build movie ID → slot QUEUE for fast assignment. A title can now hold
    // several face-out copies (T08 smart-fill duplicates the entry to fill bare
    // section padding), so a single id maps to MULTIPLE physical slots. Each
    // layout occurrence consumes the next free slot for that id. Collapsing the
    // duplicates back into one slot here is exactly the old bug the dedupe
    // warning in store-plan.ts describes — it would leave the extra copies
    // permanently hidden. Slots are physically interchangeable (position is
    // fully re-baked below), so any slot for the id serves any occurrence.
    const movieToSlots = new Map<string, MovieSlot[]>();
    libSlots.forEach(slot => {
      let q = movieToSlots.get(slot.movie.id);
      if (!q) { q = []; movieToSlots.set(slot.movie.id, q); }
      q.push(slot);
    });

    // 3. Shelf order is the category-sorted layout (nulls = section padding)
    const layoutEntries = scene.layoutFor(libIdx).entries;
    const blockOrder = scene.plan.entryBlockOrder(libIdx);

    // 4. Assign each movie to its layout shelf position and re-key the slot
    const consumedSlots = new Set<MovieSlot>();

    // Keep instance counter per unit side
    const currentInstanceIdx = new Map<string, number>();

    layoutEntries.forEach((movie, idx) => {
      if (!movie) return;
      const queue = movieToSlots.get(movie.id);
      const slot = queue && queue.length > 0 ? queue.shift()! : undefined;
      if (!slot) return;
      consumedSlots.add(slot);

      // Entry blocks flow in customer walk order (see entryBlockOrder)
      const blockIdx = Math.floor(idx / UNIT_SIDE_CAPACITY);
      const bo = blockOrder[blockIdx];
      if (!bo) return;
      const side: 'front' | 'back' = bo.side;
      const unitIdxInLibrary = bo.unit;
      const unit = libUnits[unitIdxInLibrary];
      if (!unit) return;

      const xCenter = unit.xCenter;
      const remSide = idx % UNIT_SIDE_CAPACITY;

      // Calculate total columns on this side of this unit
      const startIdx = blockIdx * UNIT_SIDE_CAPACITY;
      const entriesForSide = layoutEntries.slice(startIdx, startIdx + UNIT_SIDE_CAPACITY);
      const { shelfIdx, col } = sideEntrySlot(entriesForSide.length, remSide);

      const shelfY = AISLE_SHELF_HEIGHTS[shelfIdx];
      const { height: boxHeight, liftDepth } = aisleCaseDims(movie);
      const localZ = scene.aisleColZ(unit, col, side);
      const fSign = unit.browseSign;
      const copies = extraCopiesCount(movie);
      const offset = 0.44 + copies * 0.07;
      const localX = xCenter + (side === 'front' ? 1 : -1) * fSign * offset;
      const unitAngle = unit.yaw;
      const aisleWorld = scene.unitToWorld(unit, localX, localZ);
      const rotationY = (side === 'front' ? 1 : -1) * fSign * (Math.PI / 2) + unitAngle;
      const hinge = scene.leanHingeOffset(LEAN_ANGLE, rotationY, boxHeight);
      // Series boxsets are SERIES_DEPTH_MULT deeper, so their leaned bottom
      // edge needs proportionally more lift to stay out of the shelf board.
      const yPos = shelfY + 0.03 + hinge.y + (liftDepth / 2) * Math.sin(Math.abs(LEAN_ANGLE));
      const xPos = aisleWorld.x + hinge.x;
      const boxZ = aisleWorld.z + hinge.z;

      // Update slot's unit side mesh and instanceIdx. Re-derived from the
      // movie (not the old slot) so a game keeps landing in its own box-shape
      // batch after a rebuild re-keys the aisle.
      const unitKey = aisleMeshKey(libIdx, unitIdxInLibrary, side, movie);
      const newFrontMesh = scene.unitSideFrontMeshMap.get(unitKey)!;
      const newBackMesh = scene.unitSideBackMeshMap.get(unitKey)!;
      const newInstIdx = currentInstanceIdx.get(unitKey) || 0;
      currentInstanceIdx.set(unitKey, newInstIdx + 1);

      slot.frontMesh = newFrontMesh;
      slot.backMesh = newBackMesh;
      slot.instanceIdx = newInstIdx;

      // Update geometry attributes
      const texIdx = textureArrayManager.getIndex(slot.movie.id);
      const fIdxAttr = slot.frontMesh.geometry.getAttribute('aTextureIndex') as THREE.InstancedBufferAttribute;
      if (fIdxAttr) {
        fIdxAttr.setX(slot.instanceIdx, texIdx);
        fIdxAttr.needsUpdate = true;
      }
      const bIdxAttr = slot.backMesh.geometry.getAttribute('aTextureIndex') as THREE.InstancedBufferAttribute;
      if (bIdxAttr) {
        bIdxAttr.setX(slot.instanceIdx, texIdx);
        bIdxAttr.needsUpdate = true;
      }

      const spineColorHex = leftmostColorCache.get(slot.movie.id) || '#0f172a';
      scratchSpineColor.set(spineColorHex);
      const fSpine = slot.frontMesh.geometry.getAttribute('aSpineColor') as THREE.InstancedBufferAttribute;
      if (fSpine) {
        fSpine.setXYZ(slot.instanceIdx, scratchSpineColor.r, scratchSpineColor.g, scratchSpineColor.b);
        fSpine.needsUpdate = true;
      }
      const bSpine = slot.backMesh.geometry.getAttribute('aSpineColor') as THREE.InstancedBufferAttribute;
      if (bSpine) {
        bSpine.setXYZ(slot.instanceIdx, scratchSpineColor.r, scratchSpineColor.g, scratchSpineColor.b);
        bSpine.needsUpdate = true;
      }
      // Keep the loadShelfDetails skip-cache coherent: the slot just moved to
      // a fresh mesh/lane and this write is what populated it.
      lastWrittenSpineHex.set(slot, spineColorHex);

      // Update slot to its new compacted position
      slot.restingX = xPos;
      slot.restingY = yPos;
      slot.restingZ = boxZ;
      slot.restingRotY = rotationY;
      slot.restingRotX = LEAN_ANGLE;
      slot.aisleAngle = unitAngle;
      slot.browseSign = fSign;
      slot.unitIdx = unitIdxInLibrary;
      slot.side = side;
      slot.shelfIdx = shelfIdx;
      slot.col = col;
      slot.hidden = false;
      // Re-derive the cached back-box jitter here too (not just at initial build)
      // in case a slot is ever reused for a different movie in the future — cheap
      // at rebuild time, unlike re-hashing it every dirty-slot frame (issue #116).
      slot.backJitter = (seededRandom01(slot.movie.id) - 0.5) * COPY_X_JITTER_RANGE;
      slot.needsInitialMatrixUpdate = true;
      scene.dirtySlots.add(slot);

      const newKey = `${libIdx}_${unitIdxInLibrary}_${side}_${shelfIdx}_${col}`;
      slot.key = newKey;
      scene.slotsByPosition.set(newKey, slot);
    });

    // 5. Hide slots that no layout entry consumed (a filtered-out title, or a
    // spare copy the current layout doesn't call for). With the category layout
    // every library title has a shelf position, so anything landing here is a
    // bug (it used to swallow duplicate-id titles silently) — log it loudly.
    // Keyed per-slot (not per-id) so a title's multiple face-out copies don't
    // collide on one hidden key and clobber each other.
    let hiddenCount = 0;
    libSlots.forEach((slot, i) => {
      if (!consumedSlots.has(slot)) {
        slot.hidden = true;
        hiddenCount++;
        slot.needsInitialMatrixUpdate = true;
        scene.dirtySlots.add(slot);
        // Use a unique hidden key that won't collide with position keys
        const hiddenKey = `hidden_${libIdx}_${slot.movie.id}_${i}`;
        slot.key = hiddenKey;
        scene.slotsByPosition.set(hiddenKey, slot);
      }
    });
    if (hiddenCount > 0) {
      scene.onConsoleLog(
        `[System] WARNING: ${hiddenCount} title(s) in "${scene.libraries[libIdx]?.name}" had no shelf position and were hidden.`,
        'system'
      );
    }
  }

  // Extra-copy positions were baked from the old resting positions; rebake them now
  // that slots have been reassigned, so they stay attached to the right movie and
  // filtered-out movies' copies don't float on an empty shelf.
  scene.rebuildExtraCopies();

  // Reset browsing position to the start
  scene.selectedUnitIdx = 0;
  scene.selectedSide = 'front';
  scene.selectedShelf = AISLE_SHELF_HEIGHTS.length - 1;
  scene.selectedCol = 0;
  scene.cameraWindowMinCol = 0;
  scene.updateColsCount();
}

// Patch already-baked fixture slots after their fixture's underlying stock
// selection changes (feedback/055: the PREVIOUSLY VIEWED drape table never
// updated after a watch). Only fixtures that opt in via SlottedFixture's
// optional refreshStock() are touched — today that's just pv-drape-table.ts.
// Wired from main.ts's video-player onClose (see launchVideoPlayback) the
// moment a title finishes playing, before the store is shown again, so any
// texture pop is invisible.
//
// Deliberately NOT a buildAllMovieBoxes() pass: that re-inits the whole
// texture-array manager and rebuilds every shelf/back-wall/fixture slot in
// the store for the sake of one fixture's ~66 slots — expensive, and risks
// disturbing browse/selection state elsewhere. A fixture's slot KEYS
// (side/shelf/col) are a fixed grid independent of which movie occupies
// them, so a fresh getSlots() call always names the exact same key set the
// original buildAllMovieBoxes() populated; this only ever needs to overwrite
// which movie (and its texture index / spine colour) sits at an existing
// key's existing (frontMesh, backMesh, instanceIdx) — never touching mesh
// allocation, so nothing here can outgrow the capacity buildAllMovieBoxes()
// sized fixtureMeshKey's submeshes to.
//
// One accepted trade-off from skipping mesh reallocation: a slot keeps
// whichever regular/animated submesh (see fixtureMeshKey above) it was
// ORIGINALLY assigned at boot, even if the newly-swapped-in movie's
// animated-ness differs. That only exists in VHS medium (CASE_MEDIUM ===
// 'vhs' && library === 'Animated Movies') and is purely cosmetic (case
// artwork treatment) — a fine trade for a restock that's safe to run
// mid-session instead of a full mesh reallocation.
export function restockSlottedFixtures(scene: StoreScene): void {
  let touched = false;
  scene.slottedFixtures.forEach((fixture) => {
    if (typeof fixture.refreshStock !== 'function') return;
    fixture.refreshStock();
    fixture.getSlots().forEach((fixtureSlot) => {
      const existing = scene.slotsByPosition.get(fixtureSlot.key);
      if (!existing || existing.movie.id === fixtureSlot.movie.id) return;
      touched = true;

      // Move the slotsByMovieId bookkeeping (posterQueue completion re-dirties
      // slots through this index) from the outgoing title to the incoming one.
      const oldList = scene.slotsByMovieId.get(existing.movie.id);
      if (oldList) {
        const at = oldList.indexOf(existing);
        if (at >= 0) oldList.splice(at, 1);
      }
      existing.movie = fixtureSlot.movie;
      existing.noRentalCase =
        fixture.placement.options?.noRentalCase === true || isUnstockedTitle(fixtureSlot.movie);
      let sameMovie = scene.slotsByMovieId.get(fixtureSlot.movie.id);
      if (!sameMovie) scene.slotsByMovieId.set(fixtureSlot.movie.id, (sameMovie = []));
      sameMovie.push(existing);

      // Same attribute writes setupSlot() does at initial build (video-case's
      // shader reads texture index / spine colour per-instance, not per-movie).
      const texIdx = textureArrayManager.getIndex(fixtureSlot.movie.id);
      const fIdxAttr = existing.frontMesh.geometry.getAttribute('aTextureIndex') as THREE.InstancedBufferAttribute;
      if (fIdxAttr) { fIdxAttr.setX(existing.instanceIdx, texIdx); fIdxAttr.needsUpdate = true; }
      const bIdxAttr = existing.backMesh.geometry.getAttribute('aTextureIndex') as THREE.InstancedBufferAttribute;
      if (bIdxAttr) { bIdxAttr.setX(existing.instanceIdx, texIdx); bIdxAttr.needsUpdate = true; }

      const spineHex = leftmostColorCache.get(fixtureSlot.movie.id) || '#0f172a';
      scratchSpineColor.set(spineHex);
      const fSp = existing.frontMesh.geometry.getAttribute('aSpineColor') as THREE.InstancedBufferAttribute;
      if (fSp) {
        fSp.setXYZ(existing.instanceIdx, scratchSpineColor.r, scratchSpineColor.g, scratchSpineColor.b);
        fSp.needsUpdate = true;
      }
      const bSp = existing.backMesh.geometry.getAttribute('aSpineColor') as THREE.InstancedBufferAttribute;
      if (bSp) {
        bSp.setXYZ(existing.instanceIdx, scratchSpineColor.r, scratchSpineColor.g, scratchSpineColor.b);
        bSp.needsUpdate = true;
      }
      lastWrittenSpineHex.set(existing, spineHex);

      existing.needsInitialMatrixUpdate = true;
      scene.dirtySlots.add(existing);
      // Kick a decode/upload for the incoming title's cover in case this is
      // its first appearance anywhere on screen this session.
      existing.loadShelfDetails(1);
    });
  });
  if (touched) scene.requestRender();
}

export function updateLOD(scene: StoreScene) {
  // 1. Update reflection probe on global materials
  const probeIdx = Math.min(scene.selectedLibraryIdx, 4);
  const activeEnvMap = reflectionProbes[probeIdx] || null;
  updateGlobalMaterialsEnvMap(activeEnvMap);
  scene.entrance?.setEnvMap(activeEnvMap);

  // 2. Stream high-resolution covers for the active shelving units
  const currentLibIdx = scene.selectedLibraryIdx;
  scene.slotsByPosition.forEach(slot => {
    let isActive = false;
    if (slot.unitIdx === BACK_WALL_UNIT_IDX) {
      isActive = true;
    } else if (slot.source === 'fixture') {
      isActive = true;
    } else if (slot.libraryIdx === currentLibIdx) {
      isActive = true;
    }

    if (isActive) {
      // Load high-resolution cover
      slot.loadShelfDetails(1);
    }
  });
}
