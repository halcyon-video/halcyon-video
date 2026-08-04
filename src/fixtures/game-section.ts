// Redesigned video game shelf: a standard double-sided freestanding gondola shelf.
// Displays sections based on the selected platform list, showing the top 20
// games for each platform.
import * as THREE from 'three';
import { Movie } from '../jellyfin';
import { FixturePlacement, shelfTitleCompare, BOX_SPACING, UNIT_DEPTH, UNIT_TOP_DEPTH, LEAN_ANGLE } from '../store-layout';
import { FixtureContext, SlottedFixture, FixtureSlot } from '../fixtures';
import { Footprint } from '../layout-validator';
import { createCategorySignTexture, createFlushTopperLabelTexture } from '../canvas-textures';
import { gameCaseDims } from '../video-case';
import { createTrapezoidGeometry, splitTrapezoidGroups, createLibraryEndCapMaterial, getSlatwallPanelMaterial, markSignMesh } from '../sign-builders';

const SHELF_HEIGHTS = [1.0, 2.1, 3.2, 4.3]; // standard aisle heights

// The game department's section grid: 6 columns between dividers (matching the
// movie aisles' 6) — two platform bays and ONE internal divider per
// 12-col unit. Platform identity moved off the toppers (which now just say
// VIDEO GAMES — platform counts outgrew per-section topper text) onto
// brand-colored blade cards on each bay's leading divider/end cap.
const GAME_SECTION_COLS = 6;
const GAME_UNIT_SECTIONS = 2;

// Blade-card branding: platform family color + a fuller display name than
// the short section label where the real signage would spell it out.
const PLATFORM_BRAND: Record<string, { color: string; name?: string }> = {
  'NES': { color: '#e60012', name: 'NINTENDO NES' },
  'SNES': { color: '#e60012', name: 'SUPER NINTENDO' },
  'SUPER FAMICOM': { color: '#e60012' },
  'NINTENDO 64': { color: '#e60012' },
  'NINTENDO 3DS': { color: '#e60012' },
  'NINTENDO DSI': { color: '#e60012' },
  'NINTENDO SWITCH': { color: '#e60012' },
  'WII U': { color: '#009ac7' },
  'PSP': { color: '#003791' },
  'GAMECUBE': { color: '#6a5fa0' },
  'GAME BOY': { color: '#e60012' },
  'GAME BOY COLOR': { color: '#e60012' },
  'GAME BOY ADVANCE': { color: '#6a5fa0' },
  'PLAYSTATION': { color: '#003791' },
  'PLAYSTATION 2': { color: '#003791' },
  'GENESIS': { color: '#0060a8', name: 'SEGA GENESIS' },
  'SEGA CD': { color: '#0060a8' },
  'SEGA SATURN': { color: '#0060a8' },
  'SEGA MASTER SYSTEM': { color: '#0060a8' },
  'DREAMCAST': { color: '#f47b20' },
  'XBOX': { color: '#107c10' },
  'ATARI': { color: '#cc2229' },
  'TURBOGRAFX-16': { color: '#f7a70a' },
};

// Vertical blade-card print: a curved (pill-cornered) brand field with the
// platform name reading top→bottom. The corners are cut by ALPHA — the card
// mesh is a plain plane pair with alphaTest, so the silhouette comes entirely
// from this texture (no rectangular edge geometry to betray the curve).
function createPlatformCardTexture(platform: string): THREE.CanvasTexture {
  const brand = PLATFORM_BRAND[platform] || { color: '#f2a900' };
  const label = brand.name || platform;
  const W = 128, H = 448;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const rounded = (inset: number) => {
    // Full stadium: the corner radius maxes out at half the inner width,
    // turning both ends into complete semicircles.
    const r = (W - 2 * inset) / 2;
    ctx.beginPath();
    ctx.moveTo(inset + r, inset);
    ctx.arcTo(W - inset, inset, W - inset, H - inset, r);
    ctx.arcTo(W - inset, H - inset, inset, H - inset, r);
    ctx.arcTo(inset, H - inset, inset, inset, r);
    ctx.arcTo(inset, inset, W - inset, inset, r);
    ctx.closePath();
  };
  rounded(2);
  ctx.fillStyle = brand.color;
  ctx.fill();
  rounded(11);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = 40;
  ctx.font = `bold ${size}px Arial, sans-serif`;
  while (size > 15 && ctx.measureText(label).width > H - 150) {
    size -= 2;
    ctx.font = `bold ${size}px Arial, sans-serif`;
  }
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(Math.PI / 2);
  ctx.fillText(label, 0, 0);
  ctx.restore();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function leanHingeOffset(pitch: number, yaw: number, boxHeight: number): { x: number, y: number, z: number } {
  const Euler = THREE.Euler;
  const Quaternion = THREE.Quaternion;
  const Vector3 = THREE.Vector3;
  const q = new Quaternion().setFromEuler(new Euler(pitch, yaw, 0, 'XYZ'));
  const p = new Vector3(0, boxHeight / 2, 0).applyQuaternion(q);
  return { x: p.x, y: p.y, z: p.z };
}

function sortGamesBest(games: Movie[]): Movie[] {
  return games
    .slice()
    .sort((a, b) => {
      const rA = typeof a.communityRating === 'number' ? a.communityRating : 0;
      const rB = typeof b.communityRating === 'number' ? b.communityRating : 0;
      if (rB !== rA) return rB - rA;

      const cA = typeof a.criticRating === 'number' ? a.criticRating : 0;
      const cB = typeof b.criticRating === 'number' ? b.criticRating : 0;
      if (cB !== cA) return cB - cA;

      const yA = typeof a.year === 'number' ? a.year : 0;
      const yB = typeof b.year === 'number' ? b.year : 0;
      if (yB !== yA) return yB - yA;

      return shelfTitleCompare(a, b);
    });
}


let cachedThickWireGridTexture: THREE.Texture | null = null;
function getThickWireGridTexture(): THREE.Texture {
  if (!cachedThickWireGridTexture) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 128, 128);
    ctx.strokeStyle = '#000000'; // darker than the stock '#121212'
    ctx.lineWidth = 32; // thicker than the stock 10px (matches shelving.ts #49b widen)
    ctx.strokeRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    cachedThickWireGridTexture = tex;
  }
  return cachedThickWireGridTexture;
}

export class GameSection implements SlottedFixture {
  public placement: FixturePlacement;
  public shelfHeights: number[] = SHELF_HEIGHTS;
  public cols = 12; // dynamic
  public capacity = 0; // dynamic
  public genre = 'Video Games';

  private ctx: FixtureContext;
  private group: THREE.Group | null = null;
  private textures: THREE.Texture[] = [];
  // Fixed section count per side when this gondola is one unit of a multi-unit
  // game department (see initMovies' sliced mode); null = legacy dynamic count.
  private forcedSections: number | null = null;
  // 'front' = stock (and blade-card) only the front face — the 2×2 department
  // rows present their backs to the field/front glass where there's only a
  // walk-through gap, no browse-camera room. 'both' = classic double-sided.
  private faces: 'front' | 'both' = 'both';

  public frontPlatforms: string[] = [];
  public backPlatforms: string[] = [];
  private frontMovies: Movie[][] = [];
  private backMovies: Movie[][] = [];

  private hasFrontCap = true;
  private hasBackCap = true;

  constructor(placement: FixturePlacement, ctx: FixtureContext) {
    this.placement = placement;
    this.ctx = ctx;

    const options = this.placement.options || {};
    if (options.relativeToBackWall) {
      const zOffset =
        typeof options.zOffset === 'number' ? options.zOffset : this.placement.position.z;
      this.placement.position.z = this.ctx.backWallZ + zOffset;
    }
    // (#59) X measured from the LEFT wall (store centreline is x=11), so the
    // game department hugs the front-left corner at any store width.
    if (options.relativeToLeftWall) {
      const xOffset =
        typeof options.xOffset === 'number' ? options.xOffset : this.placement.position.x;
      this.placement.position.x = (11.0 - this.ctx.storeWidth / 2) + xOffset;
    }
    if (typeof options.genre === 'string') this.genre = options.genre;
    if (options.faces === 'front') this.faces = 'front';
    if (typeof options.hasFrontCap === 'boolean') this.hasFrontCap = options.hasFrontCap;
    if (typeof options.hasBackCap === 'boolean') this.hasBackCap = options.hasBackCap;
  }

  build(): void {
    this.initMovies();

    const cols = this.cols;
    const shelfLength = (cols - 1) * BOX_SPACING + 1.0;
    const unitDepth = UNIT_DEPTH;
    const unitTopDepth = UNIT_TOP_DEPTH;

    this.group = new THREE.Group();
    this.group.position.set(this.placement.position.x, 0.0, this.placement.position.z);
    this.group.rotation.y = this.placement.yaw;

    const theme = this.ctx.activeTheme;
    const isWireFrame = theme.shelving.frame === 'wire-black';

    // Gondola Materials
    const baseShelfMat = this.ctx.gondolaMaterials.shelf;
    const stripMat = this.ctx.gondolaMaterials.strip;

    // 1. End Caps — Skeuomorphic End Caps: a run is a chain of units joined short-end
    // to short-end (like movie aisles), so caps only belong at the two true outer ends.
    // Interior joints get nothing so the run reads as one continuous shelf.
    const capTopDepth = isWireFrame ? unitDepth : unitTopDepth;
    const trapezoidGeo = createTrapezoidGeometry(5.1, unitDepth, capTopDepth, 0.1);
    splitTrapezoidGroups(trapezoidGeo);
    const capMats = createLibraryEndCapMaterial(false);

    if (this.hasFrontCap) {
      // Front End Cap (+Z end, facing +Z)
      const frontCap = new THREE.Mesh(trapezoidGeo, capMats);
      frontCap.position.set(0, 2.55, shelfLength / 2 + 0.05);
      frontCap.rotation.y = 0;
      frontCap.castShadow = true;
      frontCap.receiveShadow = true;
      this.group.add(frontCap);
      this.ctx.addCollider(frontCap);
    }

    if (this.hasBackCap) {
      // Back End Cap (-Z end, facing -Z)
      const backCap = new THREE.Mesh(trapezoidGeo, capMats);
      backCap.position.set(0, 2.55, -shelfLength / 2 - 0.05);
      backCap.rotation.y = Math.PI;
      backCap.castShadow = true;
      backCap.receiveShadow = true;
      this.group.add(backCap);
      this.ctx.addCollider(backCap);
    }

    // 2. Central Backing Wall — solid in every theme, matching the movie aisles.
    // Extends to shelf edge on ends without end caps so multi-unit runs join seamlessly.
    {
      const zMin = this.hasBackCap ? -shelfLength / 2 + 0.05 : -shelfLength / 2;
      const zMax = this.hasFrontCap ? shelfLength / 2 - 0.05 : shelfLength / 2;
      const wallLen = zMax - zMin;
      const wallZ = (zMin + zMax) / 2;
      const backingWallGeo = new THREE.BoxGeometry(0.5, 5.1, wallLen);
      const backingWall = new THREE.Mesh(
        backingWallGeo,
        isWireFrame ? getSlatwallPanelMaterial(5.1) : baseShelfMat
      );
      backingWall.position.set(0, 2.55, wallZ);
      backingWall.receiveShadow = true;
      backingWall.castShadow = true;
      this.group.add(backingWall);
      this.ctx.addCollider(backingWall);
    }

    // 3. Horizontal Shelves
    SHELF_HEIGHTS.forEach((yPos) => {
      const shelfDepth = unitDepth - (unitDepth - unitTopDepth) * (yPos / 5.1);
      const shelfGeo = new THREE.BoxGeometry(shelfDepth, 0.04, shelfLength);

      let shelfMat = baseShelfMat;
      if (isWireFrame && this.ctx.gondolaMaterials.wireShelf) {
        const wireMat = this.ctx.gondolaMaterials.wireShelf.clone() as THREE.MeshStandardMaterial;
        const thickWireTex = getThickWireGridTexture().clone();
        thickWireTex.repeat.set(shelfDepth * 6, shelfLength * 6);
        thickWireTex.needsUpdate = true;
        wireMat.map = thickWireTex;
        wireMat.needsUpdate = true;
        shelfMat = wireMat;
        this.textures.push(thickWireTex);
      }

      const shelf = new THREE.Mesh(shelfGeo, shelfMat);
      shelf.position.set(0, yPos, 0);
      shelf.receiveShadow = true;
      shelf.castShadow = true;
      this.group!.add(shelf);
      this.ctx.addCollider(shelf);

      // Pricing strips along the lips. STRIP_EPS keeps the bar's outer face and
      // end faces off the board's own planes — stamped flush they z-fight along
      // the whole lip (same fix as shelving.ts).
      const STRIP_EPS = 0.003;
      const stripGeo = new THREE.BoxGeometry(0.02, 0.03, shelfLength - 2 * STRIP_EPS);
      const stripX = shelfDepth / 2 - 0.01 + STRIP_EPS;

      // Front lip pricing strip. receiveShadow so the lip shades with the
      // boards instead of reading as a self-lit white line (same fix as the
      // gondola/wall strips — see sharedStripMat in store-shell.ts).
      const stripFront = new THREE.Mesh(stripGeo, stripMat);
      stripFront.position.set(stripX, yPos + 0.02, 0);
      stripFront.receiveShadow = true;
      this.group!.add(stripFront);
      this.ctx.addCollider(stripFront);

      // Back lip pricing strip
      const stripBack = new THREE.Mesh(stripGeo, stripMat);
      stripBack.position.set(-stripX, yPos + 0.02, 0);
      stripBack.receiveShadow = true;
      this.group!.add(stripBack);
      this.ctx.addCollider(stripBack);
    });

    // 4. Section Dividers — present in every theme, matching the movie
    // aisles (shelving.ts builds wire-material dividers in the wire theme
    // rather than dropping them).
    const numSections = this.forcedSections ??
      Math.max(1, Math.ceil((this.frontPlatforms.length + this.backPlatforms.length) / 2));
    {
      let dividerMat: THREE.Material = baseShelfMat;
      if (isWireFrame && this.ctx.gondolaMaterials.wireShelf) {
        const wireMat = this.ctx.gondolaMaterials.wireShelf.clone() as THREE.MeshStandardMaterial;
        const wireTex = getThickWireGridTexture().clone();
        wireTex.repeat.set(unitDepth * 6, 5.1 * 6);
        wireTex.needsUpdate = true;
        wireMat.map = wireTex;
        wireMat.needsUpdate = true;
        dividerMat = wireMat;
        this.textures.push(wireTex);
      }
      const dividerGeo = createTrapezoidGeometry(5.1, unitDepth - 0.05, unitTopDepth - 0.05, 0.04);

      const addDivider = (zDiv: number) => {
        const div = new THREE.Mesh(dividerGeo, dividerMat);
        div.position.set(0, 2.55, zDiv);
        div.receiveShadow = true;
        div.castShadow = true;
        this.group!.add(div);
        this.ctx.addCollider(div);
      };

      for (let s = 0; s < numSections - 1; s++) {
        const colDivider = (s + 1) * GAME_SECTION_COLS - 1;
        const zDiv = -shelfLength / 2 + 0.5 + (colDivider + 0.5) * BOX_SPACING;
        addDivider(zDiv);
      }

      // Divider where conjoined/contiguous shelf units meet (matching movie aisles in shelving.ts)
      if (!this.hasFrontCap) {
        addDivider(shelfLength / 2);
      }
    }

    // 5. Section Signboards / Toppers
    // The plaque-topper eras (2000 arched, 2010 / Night Owl flush) get the
    // banner topper here; ticket-board (1990) and fascia-blade (1993) fall
    // through to the classic signboard path below. (The game dept isn't in the
    // Hamlet footage, so the 2000 arched plaque reuses the flush banner styling
    // for now rather than the brick-red face.)
    const modernTopper = theme.topperStyle === 'flush' || theme.topperStyle === 'arched-plaque';
    if (modernTopper) {
      const flushSideMat = new THREE.MeshStandardMaterial({
        color: theme.palette.primary,
        roughness: 0.4,
        metalness: 0.05
      });

      const FLUSH_TOPPER_H = theme.id === 'bb-2010' ? 0.55 : 0.62;
      const FLUSH_TOPPER_DEPTH = 0.03;

      const getFlushTopperGeo = (w: number): THREE.ExtrudeGeometry => {
        const h = FLUSH_TOPPER_H;
        const r = Math.min(0.15, w / 4);
        const shape = new THREE.Shape();
        shape.moveTo(-w / 2, 0);
        shape.lineTo(w / 2, 0);
        shape.lineTo(w / 2, h - r);
        shape.quadraticCurveTo(w / 2, h, w / 2 - r, h);
        shape.lineTo(-w / 2 + r, h);
        shape.quadraticCurveTo(-w / 2, h, -w / 2, h - r);
        shape.closePath();
        const geo = new THREE.ExtrudeGeometry(shape, { depth: FLUSH_TOPPER_DEPTH, bevelEnabled: false });
        const pos = geo.getAttribute('position');
        const uv = geo.getAttribute('uv');
        for (let i = 0; i < uv.count; i++) {
          uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h);
        }
        return geo;
      };

      // One department topper per unit — platform names moved to the blade
      // cards below, so the topper reads the same at any platform count.
      const w = Math.min(4.2, Math.max(1.2, shelfLength * 0.55));
      const geo = getFlushTopperGeo(w);
      ([1, -1] as const).forEach(dir => {
        const labelTex = createFlushTopperLabelTexture('VIDEO GAMES', theme);
        this.textures.push(labelTex);
        const labelMat = new THREE.MeshStandardMaterial({
          map: labelTex,
          roughness: 0.4,
          metalness: 0.05
        });

        const mesh = new THREE.Mesh(geo, [labelMat, flushSideMat]);
        mesh.rotation.y = dir * Math.PI / 2;
        mesh.position.set(0, 5.1, 0);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.layers.set(1);
        this.group!.add(mesh);
        this.ctx.addCollider(mesh);
      });
    } else {
      // NO FEET — owner ruling 2026-07-30 off the 1990 ticket-sign reference
      // (/uploads/…dfbc6bb7-6483.png): "they don't seem to have feet". Same
      // change as the aisle run tops in shelving.ts: the card sits FLUSH on the
      // gondola frame's top surface instead of floating 0.15 ft up on two
      // chrome stalks.
      const signWidth = 14.0 / 12; // ~1.1667 feet
      const signHeight = 8.5 / 12; // ~0.7083 feet
      const signGeo = new THREE.BoxGeometry(0.06, signHeight, signWidth);
      const signSideMat = this.ctx.gondolaMaterials.signSide;

      // One hanging department sign per unit (see the modern-topper note).
      {
        const zSecCenter = 0;

        // Ticket art cut to THIS card's aspect (14 x 8.5 in = 1.647:1). The
        // legacy fixed 4:1 sheet was stretching 2.4x vertically onto it.
        const signAspect = signWidth / signHeight;
        const frontTex = createCategorySignTexture('VIDEO GAMES', undefined, false, signAspect);
        const backTex = createCategorySignTexture('VIDEO GAMES', undefined, false, signAspect);
        this.textures.push(frontTex, backTex);

        // Satin laminated print under a hazed clearcoat — matches the aisle
        // signboards' cure in shelving.ts (0.05 base was a flat env-glare mirror).
        const frontLabelMat = new THREE.MeshPhysicalMaterial({
          map: frontTex, roughness: 0.35, metalness: 0.05, clearcoat: 1.0, clearcoatRoughness: 0.15
        });
        const backLabelMat = new THREE.MeshPhysicalMaterial({
          map: backTex, roughness: 0.35, metalness: 0.05, clearcoat: 1.0, clearcoatRoughness: 0.15
        });

        const signMesh = new THREE.Mesh(signGeo, [
          frontLabelMat, // +X
          backLabelMat,  // -X
          signSideMat,   // +Y
          signSideMat,   // -Y
          signSideMat,   // +Z
          signSideMat    // -Z
        ]);
        // Gondola frame tops out at 5.1; the card's BOTTOM edge lands there.
        signMesh.position.set(0, 5.1 + signHeight / 2, zSecCenter);
        markSignMesh(signMesh, { casts: true }); // free-hanging board: it does cast
        signMesh.layers.set(1);
        this.group.add(signMesh);
        this.ctx.addCollider(signMesh);
      }
    }

    // 6. Platform blade cards — a curved brand-colored blade mounted FLAT and
    // upright on each stocked bay's leading divider/end cap, its aisle-side
    // edge flush with the divider's front edge and its top reaching the top
    // shelf's tip. Standing straight (no taper tilt) keeps the platform name —
    // which reads top→bottom — legible walking the aisle. The department's
    // platform wayfinding.
    {
      const CARD_W = 0.6, CARD_H = 2.1;
      // Top edge lands on the top shelf board's top surface (SHELF_HEIGHTS top
      // 4.3 + half the 0.04 board thickness), not the gap below it.
      const TOP_SHELF_TIP = SHELF_HEIGHTS[SHELF_HEIGHTS.length - 1] + 0.02;
      const CARD_Y = TOP_SHELF_TIP - CARD_H / 2;
      const cardGeo = new THREE.PlaneGeometry(CARD_W, CARD_H);
      // Divider front-edge half-depth at the card's TOP (the narrowest point of
      // the tapered edge): mount the card's aisle-side edge flush there so an
      // upright card never pokes proud of the leaning divider face below.
      const edgeHalfTop = (unitDepth - (unitDepth - unitTopDepth) * (TOP_SHELF_TIP / 5.1)) / 2;
      const cardSides: ('front' | 'back')[] = this.faces === 'front' ? ['front'] : ['front', 'back'];
      for (const side of cardSides) {
        const platforms = side === 'front' ? this.frontPlatforms : this.backPlatforms;
        const dir = side === 'front' ? 1 : -1;
        for (let s = 0; s < numSections; s++) {
          const platform = platforms[s];
          if (!platform) continue;
          // Leading boundary of bay s in this face's reading order: the end
          // cap plane for the first bay, the divider line otherwise. The two
          // faces read in opposite local-Z directions (see getSlots).
          const boundary = s === 0
            ? shelfLength / 2 + 0.05
            : shelfLength / 2 - 0.5 - (s * GAME_SECTION_COLS - 0.5) * BOX_SPACING;
          const zCard = side === 'front' ? -boundary : boundary;

          const tex = createPlatformCardTexture(platform);
          this.textures.push(tex);
          const faceMat = new THREE.MeshStandardMaterial({
            map: tex, roughness: 0.45, metalness: 0.05, alphaTest: 0.5
          });

          // A plane pair instead of a box: the curved silhouette comes from
          // the texture's alpha, and a box's rim would draw a rectangular
          // outline right through the rounded corners. The back plane is
          // spun 180° so its print reads correctly from its own side.
          const holder = new THREE.Group();
          ([1, -1] as const).forEach((face) => {
            const p = new THREE.Mesh(cardGeo, faceMat);
            if (face < 0) p.rotation.y = Math.PI;
            // Sit each face just clear of the 0.04-thick divider panel so the
            // card reads flush against it without z-fighting.
            p.position.z = face * 0.025;
            p.receiveShadow = true;
            p.layers.set(1);
            holder.add(p);
          });
          // Flush on the divider face (aisle-side edge at edgeHalfTop), upright.
          holder.position.set(dir * (edgeHalfTop - CARD_W / 2), CARD_Y, zCard);
          this.group!.add(holder);
          this.ctx.addCollider(holder);
        }
      }
    }

    this.ctx.scene.add(this.group);
    this.ctx.addCollider(this.group);
    this.ctx.requestShadowRefresh();
  }

  update(_timeMs: number): void {
    // No continuous per-frame logic required.
  }

  dispose(): void {
    if (this.group) {
      this.ctx.scene.remove(this.group);
      this.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      this.group = null;
    }
    this.textures.forEach((t) => t.dispose());
    this.textures = [];
  }

  // Double-sided gondola rotated by placement.yaw: local Z is the shelf run
  // (shelfLength, same formula build() uses), local X is the width — the
  // widest cross-section is UNIT_DEPTH at floor level (the trapezoid end
  // caps taper from UNIT_DEPTH at the bottom to UNIT_TOP_DEPTH at the top;
  // see build()'s trapezoidGeo/shelfDepth). The two end caps each add 0.1ft
  // beyond shelfLength/2 (0.05 mesh offset + 0.05 half-thickness of the
  // 0.1-thick extruded trapezoid — see build()'s frontCap/backCap placement).
  getFootprint(): Footprint {
    const shelfLength = (this.cols - 1) * BOX_SPACING + 1.0;
    const capFront = this.hasFrontCap ? 0.1 : 0;
    const capBack = this.hasBackCap ? 0.1 : 0;
    return {
      label: `fixture:${this.placement.id}`,
      kind: 'fixture',
      cx: this.placement.position.x,
      cz: this.placement.position.z,
      w: UNIT_DEPTH,
      d: shelfLength + capFront + capBack,
      yaw: this.placement.yaw,
    };
  }

  getSlots(): FixtureSlot[] {
    const slots: FixtureSlot[] = [];
    const position = this.placement.position;
    const yaw = this.placement.yaw;
    const cols = this.cols;
    const shelfLength = (cols - 1) * BOX_SPACING + 1.0;

    // Front side (+X face)
    for (let s = 0; s < this.frontPlatforms.length; s++) {
      const platformGames = this.frontMovies[s] || [];
      for (let shelfIdx = 0; shelfIdx < this.shelfHeights.length; shelfIdx++) {
        const shelfY = this.shelfHeights[shelfIdx];
        for (let localCol = 0; localCol < GAME_SECTION_COLS; localCol++) {
          const idx = shelfIdx * GAME_SECTION_COLS + localCol;
          if (idx >= platformGames.length) continue;
          const movie = platformGames[idx];

          const col = s * GAME_SECTION_COLS + localCol;
          // front side columns read screen-left to screen-right, which is -Z to +Z direction.
          const colZ = -shelfLength / 2 + 0.5 + col * BOX_SPACING;

          const platform = movie.platform || this.frontPlatforms[s];
          const dims = gameCaseDims(platform);
          const currentBoxHeight = dims.h;
          const currentBoxDepth = dims.d;

          const localX = 0.44;
          const rotationY = Math.PI / 2 + yaw;
          const hinge = leanHingeOffset(LEAN_ANGLE, rotationY, currentBoxHeight);
          const yPos = shelfY + 0.03 + hinge.y + (currentBoxDepth / 2) * Math.sin(Math.abs(LEAN_ANGLE));
          const rx = localX + hinge.x;
          const rz = colZ + hinge.z;

          // Rotate by yaw
          const c = Math.cos(yaw), sin = Math.sin(yaw);
          const xPos = position.x + rx * c + rz * sin;
          const zPos = position.z - rx * sin + rz * c;

          slots.push({
            movie,
            side: 'front',
            shelfIdx,
            col,
            restingX: xPos,
            restingY: yPos,
            restingZ: zPos,
            restingRotY: rotationY,
            restingRotX: LEAN_ANGLE,
            depth: currentBoxDepth,
            key: `fixture_${this.placement.id}_side_front_shelf_${shelfIdx}_col_${col}`
          });
        }
      }
    }

    // Back side (-X face)
    for (let s = 0; s < this.backPlatforms.length; s++) {
      const platformGames = this.backMovies[s] || [];
      for (let shelfIdx = 0; shelfIdx < this.shelfHeights.length; shelfIdx++) {
        const shelfY = this.shelfHeights[shelfIdx];
        for (let localCol = 0; localCol < GAME_SECTION_COLS; localCol++) {
          const idx = shelfIdx * GAME_SECTION_COLS + localCol;
          if (idx >= platformGames.length) continue;
          const movie = platformGames[idx];

          const col = s * GAME_SECTION_COLS + localCol;
          // back side columns read screen-left to screen-right, which is +Z to -Z direction.
          const colZ = shelfLength / 2 - 0.5 - col * BOX_SPACING;

          const platform = movie.platform || this.backPlatforms[s];
          const dims = gameCaseDims(platform);
          const currentBoxHeight = dims.h;
          const currentBoxDepth = dims.d;

          const localX = -0.44;
          const rotationY = -Math.PI / 2 + yaw;
          const hinge = leanHingeOffset(LEAN_ANGLE, rotationY, currentBoxHeight);
          const yPos = shelfY + 0.03 + hinge.y + (currentBoxDepth / 2) * Math.sin(Math.abs(LEAN_ANGLE));
          const rx = localX + hinge.x;
          const rz = colZ + hinge.z;

          // Rotate by yaw
          const c = Math.cos(yaw), sin = Math.sin(yaw);
          const xPos = position.x + rx * c + rz * sin;
          const zPos = position.z - rx * sin + rz * c;

          slots.push({
            movie,
            side: 'back',
            shelfIdx,
            col,
            restingX: xPos,
            restingY: yPos,
            restingZ: zPos,
            restingRotY: rotationY,
            restingRotX: LEAN_ANGLE,
            depth: currentBoxDepth,
            key: `fixture_${this.placement.id}_side_back_shelf_${shelfIdx}_col_${col}`
          });
        }
      }
    }

    return slots;
  }

  private initMovies(): void {
    const byPlatform = new Map<string, Movie[]>();
    for (const g of this.ctx.gameMovies) {
      const key = g.platform || 'GAMES';
      if (!byPlatform.has(key)) byPlatform.set(key, []);
      byPlatform.get(key)!.push(g);
    }

    const sortedPlatforms = Array.from(byPlatform.keys()).sort();
    // Per-section capacity: every shelf column of every shelf level holds one case.
    const sectionCapacity = GAME_SECTION_COLS * this.shelfHeights.length;
    // Each platform's full best-first catalog, chunked into section-sized
    // groups (24 cases) — so a big platform fills as many signboard sections
    // as it has stock for, instead of one 20-of-top-20 section and acres of
    // empty shelf.
    const platformChunks: [string, Movie[]][] = [];
    let maxRounds = 0;
    const chunksByPlatform = sortedPlatforms.map(platform => {
      const games = sortGamesBest(byPlatform.get(platform)!);
      const chunks: Movie[][] = [];
      for (let i = 0; i < games.length; i += sectionCapacity) {
        // Partial sections stay partial — no duplicate copies are cycled in
        // to fill shelf columns (the user wants each game to appear once).
        chunks.push(games.slice(i, i + sectionCapacity));
      }
      maxRounds = Math.max(maxRounds, chunks.length);
      return { platform, chunks };
    });
    // Interleave by round so every platform gets shelf presence before any
    // platform gets a second section.
    for (let round = 0; round < maxRounds; round++) {
      for (const { platform, chunks } of chunksByPlatform) {
        if (round < chunks.length) platformChunks.push([platform, chunks[round]]);
      }
    }

    const N = platformChunks.length;

    // (#59) Sliced mode: this gondola is unit `unit` of a `units`-unit game
    // department (see GAME_SECTION_PLACEMENTS). Every unit is a fixed full
    // 12-col double-sided unit (UNIT_SECTIONS sections per side), and the
    // section-chunk list is dealt into one global section-slot order —
    // all units' FRONT faces first (round-robin by section, so each unit's
    // aisle-facing side fills before any back side does), then the backs.
    // Each instance recomputes the same deterministic deal and keeps only
    // its own slice.
    const options = this.placement.options || {};
    const unitCount = typeof options.units === 'number' ? options.units : 0;
    if (unitCount >= 1) {
      const unitIndex = typeof options.unit === 'number' ? options.unit : 0;
      const sectionsPerSide = GAME_UNIT_SECTIONS;
      this.cols = sectionsPerSide * GAME_SECTION_COLS;
      this.capacity = (this.faces === 'front' ? 1 : 2) * this.shelfHeights.length * this.cols;
      this.forcedSections = sectionsPerSide;
      this.frontPlatforms = [];
      this.backPlatforms = [];
      this.frontMovies = Array.from({ length: sectionsPerSide }, () => []);
      this.backMovies = Array.from({ length: sectionsPerSide }, () => []);

      const dealSides: ('front' | 'back')[] = this.faces === 'front' ? ['front'] : ['front', 'back'];
      const slotOrder: { u: number; side: 'front' | 'back'; s: number }[] = [];
      dealSides.forEach((side) => {
        for (let s = 0; s < sectionsPerSide; s++) {
          for (let u = 0; u < unitCount; u++) slotOrder.push({ u, side, s });
        }
      });
      // Fewer distinct platform chunks than department sections: leave the
      // remaining sections empty rather than dealing duplicate copies of the
      // same stock (no duplicates on the game shelves).
      for (let i = 0; i < Math.min(platformChunks.length, slotOrder.length); i++) {
        const slot = slotOrder[i];
        if (slot.u !== unitIndex) continue;
        const [platform, games] = platformChunks[i];
        if (slot.side === 'front') {
          this.frontPlatforms[slot.s] = platform;
          this.frontMovies[slot.s] = games;
        } else {
          this.backPlatforms[slot.s] = platform;
          this.backMovies[slot.s] = games;
        }
      }
      return;
    }
    const numSectionsPerSide = Math.max(1, Math.ceil(N / 2));
    this.cols = numSectionsPerSide * GAME_SECTION_COLS;
    this.capacity = 2 * this.shelfHeights.length * this.cols;

    this.frontPlatforms = [];
    this.backPlatforms = [];
    this.frontMovies = Array.from({ length: numSectionsPerSide }, () => []);
    this.backMovies = Array.from({ length: numSectionsPerSide }, () => []);

    for (let i = 0; i < N; i++) {
      const [platform, games] = platformChunks[i];
      if (i < numSectionsPerSide) {
        this.frontPlatforms[i] = platform;
        this.frontMovies[i] = games;
      } else {
        const backIdx = i - numSectionsPerSide;
        this.backPlatforms[backIdx] = platform;
        this.backMovies[backIdx] = games;
      }
    }
  }
}
