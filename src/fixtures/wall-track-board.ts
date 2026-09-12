// Wall-mounted changeable-strip information board family (#287).
//
// Two distinct formats:
// 1. Tall silver-framed board behind registers near front glazing with horizontal
//    insert channels, separable strips, and a companion framed poster beside it.
// 2. Shallow horizontal dark rental-terms board above front glass facing shoppers,
//    with parameterized width, visible row count, and configurable illumination.
//
// Shared extruded rail channel profile with top/bottom retaining lips, real relief,
// separable insert strips, rear fixing hardware, and procedural/user-asset graphics.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FixturePlacement } from '../store-layout';
import { FixtureContext, StoreFixture } from '../fixtures';
import { getActiveTheme } from '../themes';
import { assetUrl } from '../asset-url';
import { mapDisplayFaceUVs } from './display-face-uv';
import { tryLoadUserAssetTexture } from '../user-assets';

export type WallTrackBoardFormat = 'tall' | 'long';

export interface WallTrackBoardOptions {
  format?: WallTrackBoardFormat;
  themes?: string[];
  width?: number;
  height?: number;
  rows?: number;
  surfaceY?: number;
  illuminated?: boolean;
  companionPoster?: boolean;
  strips?: string[];
  posterTitle?: string;
  userAsset?: string;
}

type Disposable = { geo?: THREE.BufferGeometry; mat?: THREE.Material; tex?: THREE.Texture };

export const DEFAULT_TALL_ROWS = 14;
export const DEFAULT_LONG_ROWS = 8;
export const DEFAULT_TALL_WIDTH = 2.25; // feet (track board); companion poster is also 2.25 ft
export const DEFAULT_TALL_HEIGHT = 3.80; // feet
export const DEFAULT_LONG_WIDTH = 11.50; // feet (fits app glazing wing span)
export const DEFAULT_LONG_HEIGHT = 1.45; // feet

const DEFAULT_TALL_STRIPS: string[] = [
  'STORE POLICIES & RATES',
  'NEW RELEASES (2 NIGHTS) ......... $3.00',
  'STANDARD MOVIES (5 NIGHTS) ...... $2.50',
  'VIDEO GAME RENTALS (3 NIGHTS) ... $4.00',
  'FAST DROP BOX OPEN 24 HOURS',
  'PLEASE REWIND ALL VHS TAPES',
  'REWIND SERVICE CHARGE ......... $1.00',
  'LATE RETURNS CHARGED AT STANDARD RATE',
  'MAXIMUM 6 TITLES PER ACCOUNT',
  'MEMBERSHIP CARDS NON-TRANSFERABLE',
  'SPECIAL WEEKEND PACKS AVAILABLE',
  'PREVIOUSLY VIEWED TITLES FOR SALE',
  'CHECK DISC / TAPE BEFORE RETURNING',
  'THANK YOU FOR RENTING WITH US',
];

const DEFAULT_LONG_STRIPS: string[] = [
  'RENTAL TERMS',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
];

export class WallTrackBoard implements StoreFixture {
  public placement: FixturePlacement;
  private ctx: FixtureContext;
  private group: THREE.Group | null = null;
  private fallbackGroup: THREE.Group | null = null;
  private hardwareGroup: THREE.Group | null = null;
  private disposables: Disposable[] = [];
  private disposed = false;
  private stripMaterial: THREE.MeshStandardMaterial | null = null;
  private posterMaterial: THREE.MeshStandardMaterial | null = null;
  private emissiveMaterial: THREE.MeshStandardMaterial | null = null;

  constructor(placement: FixturePlacement, ctx: FixtureContext) {
    this.placement = placement;
    this.ctx = ctx;
  }

  public build(): void {
    const opts = (this.placement.options ?? {}) as WallTrackBoardOptions;
    if (opts.themes && !opts.themes.includes(getActiveTheme().id)) {
      return;
    }

    const format: WallTrackBoardFormat = opts.format ?? 'tall';
    const width = opts.width ?? (format === 'tall' ? DEFAULT_TALL_WIDTH : DEFAULT_LONG_WIDTH);
    const height = opts.height ?? (format === 'tall' ? DEFAULT_TALL_HEIGHT : DEFAULT_LONG_HEIGHT);
    const rows = opts.rows ?? (format === 'tall' ? DEFAULT_TALL_ROWS : DEFAULT_LONG_ROWS);
    const surfaceY = opts.surfaceY ?? (format === 'tall' ? 3.65 : 9.10);
    const companionPoster = format === 'tall' ? (opts.companionPoster ?? true) : false;
    const illuminated = opts.illuminated ?? false;

    this.group = new THREE.Group();
    this.group.name = `wall-track-board-${this.placement.id}`;
    this.group.position.set(this.placement.position.x, surfaceY, this.placement.position.z);
    this.group.rotation.y = this.placement.yaw;

    // Build textures and materials
    const stripTex = this.createStripTexture(format, rows, opts.strips);
    this.stripMaterial = new THREE.MeshStandardMaterial({
      map: stripTex,
      roughness: 0.45,
      metalness: 0.05,
    });
    this.disposables.push({ mat: this.stripMaterial, tex: stripTex });

    if (companionPoster) {
      const posterTex = this.createPosterTexture(opts.posterTitle);
      this.posterMaterial = new THREE.MeshStandardMaterial({
        map: posterTex,
        roughness: 0.38,
        metalness: 0.02,
      });
      this.disposables.push({ mat: this.posterMaterial, tex: posterTex });
    }

    // Configurable illumination material for long format
    this.emissiveMaterial = new THREE.MeshStandardMaterial({
      color: 0xfff8ea,
      roughness: 0.20,
      metalness: 0.0,
      emissive: illuminated ? new THREE.Color(0xfff5dc) : new THREE.Color(0x000000),
      emissiveIntensity: illuminated ? 0.75 : 0.0,
    });
    this.disposables.push({ mat: this.emissiveMaterial });

    // Check user-asset drop-ins
    this.probeUserAssets(format);

    // Build procedural fallback geometry (displayed until GLB arrives)
    this.fallbackGroup = this.buildProceduralFallback(format, width, height, rows, companionPoster);
    this.group.add(this.fallbackGroup);
    this.ctx.scene.add(this.group);

    // Load optimized Blender GLB
    this.loadHardwareModel(format, width, height, rows, companionPoster, illuminated);
  }

  public update(_timeMs: number): void {}

  public dispose(): void {
    this.disposed = true;
    for (const d of this.disposables) {
      d.geo?.dispose();
      d.mat?.dispose();
      d.tex?.dispose();
    }
    this.disposables = [];
    if (this.group) {
      this.group.removeFromParent();
      this.group = null;
    }
    this.fallbackGroup = null;
    this.hardwareGroup = null;
  }

  public getFootprint() {
    return null; // Wall-mounted fixture above floor; no ground-plan footprint collision
  }

  private createStripTexture(format: WallTrackBoardFormat, rows: number, customStrips?: string[]): THREE.CanvasTexture {
    // Square artwork on a tall board and 2:1 artwork on an 8:1 board
    // stretched every letter. Match the actual printed face's dimensions.
    const opts = (this.placement.options ?? {}) as WallTrackBoardOptions;
    const width = opts.width ?? (format === 'tall' ? DEFAULT_TALL_WIDTH : DEFAULT_LONG_WIDTH);
    const height = opts.height ?? (format === 'tall' ? DEFAULT_TALL_HEIGHT : DEFAULT_LONG_HEIGHT);
    const w = format === 'tall' ? 768 : 2048;
    const h = Math.round(w * height / width);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;

    // Dark composite slatboard background
    ctx.fillStyle = '#14171d';
    ctx.fillRect(0, 0, w, h);

    const strips = customStrips ?? (format === 'tall' ? DEFAULT_TALL_STRIPS : DEFAULT_LONG_STRIPS);
    const rowH = h / rows;

    for (let r = 0; r < rows; r++) {
      const y0 = r * rowH;
      // Slat background fill
      ctx.fillStyle = r % 2 === 0 ? '#1b202a' : '#161922';
      ctx.fillRect(0, y0, w, rowH);

      // Fine highlight along top edge of strip
      ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.fillRect(0, y0, w, Math.max(1, rowH * 0.05));

      // Fine shadow along bottom edge of strip
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(0, y0 + rowH - Math.max(1, rowH * 0.06), w, Math.max(1, rowH * 0.06));

      const text = strips[r % strips.length] ?? '';
      if (!text) continue;

      const isHeader = r === 0;
      const fontSize = isHeader ? Math.round(rowH * 0.44) : Math.round(rowH * 0.36);
      ctx.font = isHeader ? `700 ${fontSize}px sans-serif` : `600 ${fontSize}px sans-serif`;
      ctx.textBaseline = 'middle';

      if (format === 'tall') {
        if (isHeader) {
          ctx.fillStyle = '#f5c330'; // theme secondary gold
          ctx.textAlign = 'center';
          ctx.fillText(text, w / 2, y0 + rowH / 2);
        } else {
          ctx.fillStyle = '#f0f3f8';
          ctx.textAlign = 'left';
          ctx.fillText(text, w * 0.06, y0 + rowH / 2);
        }
      } else {
        // Long format (horizontal terms)
        if (isHeader) {
          ctx.fillStyle = '#ffc820';
          ctx.textAlign = 'center';
          ctx.fillText(text, w / 2, y0 + rowH / 2);
        } else {
          ctx.fillStyle = '#f4f6fa';
          ctx.textAlign = 'left';
          ctx.fillText(text, w * 0.04, y0 + rowH / 2);
        }
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  private createPosterTexture(customTitle?: string): THREE.CanvasTexture {
    const w = 768;
    const h = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;

    // Rich orange field
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#e85a1a');
    grad.addColorStop(1, '#cb440d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Inner gold border
    ctx.strokeStyle = '#f8cf52';
    ctx.lineWidth = 14;
    ctx.strokeRect(32, 32, w - 64, h - 64);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 3;
    ctx.strokeRect(48, 48, w - 96, h - 96);

    // Header block
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#152548';
    ctx.font = '900 68px sans-serif';
    ctx.fillText('HALCYON VIDEO', w / 2, 140);

    ctx.fillStyle = '#f8cf52';
    ctx.font = '800 36px sans-serif';
    ctx.fillText('MEMBERSHIP SERVICES', w / 2, 210);

    // Divider bar
    ctx.fillStyle = '#152548';
    ctx.fillRect(80, 248, w - 160, 6);

    // Main poster callouts
    const title = customTitle ?? 'RENT MORE. PAY LESS.';
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 54px sans-serif';
    ctx.fillText(title, w / 2, 360);

    ctx.fillStyle = '#152548';
    ctx.font = '700 32px sans-serif';
    ctx.fillText('WEEKEND 3-FOR-2 SPECIALS', w / 2, 450);
    ctx.fillText('NO DEPOSIT WITH MEMBERSHIP', w / 2, 510);
    ctx.fillText('FAST DROP-BOX RETURNS', w / 2, 570);
    ctx.fillText('OVER 5,000 TITLES IN STOCK', w / 2, 630);

    // Blue banner at bottom
    ctx.fillStyle = '#152548';
    ctx.fillRect(60, 720, w - 120, 190);

    ctx.fillStyle = '#f8cf52';
    ctx.font = '800 38px sans-serif';
    ctx.fillText('JOIN TODAY AT THE COUNTER', w / 2, 790);

    ctx.fillStyle = '#ffffff';
    ctx.font = '600 24px sans-serif';
    ctx.fillText('FREE MEMBERSHIP CARD WITH FIRST RENTAL', w / 2, 850);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  private probeUserAssets(format: WallTrackBoardFormat): void {
    const candidates = format === 'tall'
      ? ['fixtures/wall-track-board-tall/front.png', 'fixtures/strip-board-1998/front.png']
      : ['fixtures/wall-track-board-long/front.png', 'fixtures/rental-terms-track-board-2000/front.png'];

    const tryNext = (idx: number) => {
      if (idx >= candidates.length || this.disposed) return;
      tryLoadUserAssetTexture(candidates[idx], (tex) => {
        if (this.disposed || !this.stripMaterial) { tex.dispose(); return; }
        this.stripMaterial.map = tex;
        this.stripMaterial.needsUpdate = true;
        this.ctx.requestRender();
      }, {
        onMiss: () => tryNext(idx + 1),
      });
    };
    tryNext(0);
  }

  private buildProceduralFallback(
    format: WallTrackBoardFormat,
    width: number,
    height: number,
    rows: number,
    companionPoster: boolean,
  ): THREE.Group {
    const root = new THREE.Group();
    root.name = 'wall-track-board-fallback';

    const fw = 0.085;
    const fd = 0.045;
    const frameMat = format === 'tall'
      ? new THREE.MeshStandardMaterial({ color: 0xc4c7cc, metalness: 0.85, roughness: 0.25 })
      : new THREE.MeshStandardMaterial({ color: 0x222428, metalness: 0.75, roughness: 0.38 });
    const backingMat = new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.85 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0xb0b3b8, metalness: 0.85, roughness: 0.28 });
    const hwMat = new THREE.MeshStandardMaterial({ color: 0x8e9299, metalness: 0.90, roughness: 0.30 });

    this.disposables.push({ mat: frameMat }, { mat: backingMat }, { mat: railMat }, { mat: hwMat });

    const createSingleBoard = (cx: number, cy: number, w: number, h: number, numRows: number, isPoster = false) => {
      const g = new THREE.Group();
      g.position.set(cx, cy, 0);

      // Backing
      const inW = w - 2 * fw;
      const inH = h - 2 * fw;
      const backGeo = new THREE.BoxGeometry(inW, inH, 0.01);
      const backMesh = new THREE.Mesh(backGeo, backingMat);
      backMesh.position.set(0, h / 2, 0.005);
      g.add(backMesh);
      this.disposables.push({ geo: backGeo });

      // Outer Frame
      const bGeo = new THREE.BoxGeometry(w, fw, fd);
      const tGeo = new THREE.BoxGeometry(w, fw, fd);
      const lGeo = new THREE.BoxGeometry(fw, inH, fd);
      const rGeo = new THREE.BoxGeometry(fw, inH, fd);
      this.disposables.push({ geo: bGeo }, { geo: tGeo }, { geo: lGeo }, { geo: rGeo });

      const mB = new THREE.Mesh(bGeo, frameMat); mB.position.set(0, fw / 2, fd / 2);
      const mT = new THREE.Mesh(tGeo, frameMat); mT.position.set(0, h - fw / 2, fd / 2);
      const mL = new THREE.Mesh(lGeo, frameMat); mL.position.set(-w / 2 + fw / 2, h / 2, fd / 2);
      const mR = new THREE.Mesh(rGeo, frameMat); mR.position.set(w / 2 - fw / 2, h / 2, fd / 2);
      g.add(mB, mT, mL, mR);

      if (isPoster) {
        const faceGeo = new THREE.PlaneGeometry(inW, inH);
        const faceMesh = new THREE.Mesh(faceGeo, this.posterMaterial!);
        faceMesh.position.set(0, h / 2, 0.012);
        g.add(faceMesh);
        this.disposables.push({ geo: faceGeo });
      } else {
        // Rails and strips
        const pitch = inH / numRows;
        for (let r = 0; r < numRows; r++) {
          const ry = fw + (r + 0.5) * pitch;
          const railGeo = new THREE.BoxGeometry(inW, pitch - 0.008, 0.016);
          const railMesh = new THREE.Mesh(railGeo, railMat);
          railMesh.position.set(0, ry, 0.016);
          g.add(railMesh);
          this.disposables.push({ geo: railGeo });
        }
        // Unified strip face
        const stripGeo = new THREE.PlaneGeometry(inW, inH);
        const stripMesh = new THREE.Mesh(stripGeo, this.stripMaterial!);
        stripMesh.position.set(0, h / 2, 0.018);
        g.add(stripMesh);
        this.disposables.push({ geo: stripGeo });
      }

      // Mounting hardware
      const cleatGeo = new THREE.BoxGeometry(w * 0.75, 0.15, 0.02);
      const cleat = new THREE.Mesh(cleatGeo, hwMat);
      cleat.position.set(0, h - 0.25, -0.01);
      g.add(cleat);
      this.disposables.push({ geo: cleatGeo });

      return g;
    };

    if (format === 'tall') {
      const gap = 0.12;
      const trackCx = -(width / 2 + gap / 2);
      const posterCx = width / 2 + gap / 2;
      root.add(createSingleBoard(trackCx, 0, width, height, rows, false));
      if (companionPoster) {
        root.add(createSingleBoard(posterCx, 0, width, height, rows, true));
      }
    } else {
      root.add(createSingleBoard(0, 0, width, height, rows, false));
    }

    return root;
  }

  private loadHardwareModel(
    format: WallTrackBoardFormat,
    width: number,
    height: number,
    _rows: number,
    _companionPoster: boolean,
    _illuminated: boolean,
  ): void {
    const glbName = `wall-track-board-${format}.glb`;
    const loader = new GLTFLoader();

    loader.loadAsync(assetUrl(`models/${glbName}`)).then((gltf) => {
      if (this.disposed || !this.group) {
        gltf.scene.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.geometry?.dispose();
            if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
            else o.material?.dispose();
          }
        });
        return;
      }

      this.hardwareGroup = gltf.scene;
      this.hardwareGroup.name = `wall-track-board-hardware-${format}`;

      // The model's packed UV islands describe hardware, not printed art.
      // Project one continuous face across all strips and one onto the poster.
      mapDisplayFaceUVs(this.hardwareGroup, ['TrackStripFace', 'PosterFace']);
      this.hardwareGroup.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        this.disposables.push({ geo: object.geometry });
        object.castShadow = true;
        object.receiveShadow = true;

        const mats = Array.isArray(object.material) ? object.material : [object.material];
        const replaced = mats.map((mat) => {
          if (mat.name === 'TrackStripFace' && this.stripMaterial) {
            mat.dispose();
            return this.stripMaterial;
          }
          if (mat.name === 'PosterFace' && this.posterMaterial) {
            mat.dispose();
            return this.posterMaterial;
          }
          if (mat.name === 'TrackEmissive' && this.emissiveMaterial) {
            mat.dispose();
            return this.emissiveMaterial;
          }
          this.disposables.push({ mat });
          return mat;
        });
        object.material = Array.isArray(object.material) ? replaced : replaced[0];
      });

      // Configure long format scale if custom width/height provided
      if (format === 'long' && (width !== DEFAULT_LONG_WIDTH || height !== DEFAULT_LONG_HEIGHT)) {
        this.hardwareGroup.scale.set(width / DEFAULT_LONG_WIDTH, height / DEFAULT_LONG_HEIGHT, 1.0);
      }

      this.group.add(this.hardwareGroup);
      if (this.fallbackGroup) {
        this.fallbackGroup.visible = false;
      }

      this.ctx.requestShadowRefresh();
      this.ctx.requestRender();
    }).catch((err) => {
      if (!this.disposed) {
        this.ctx.log(`Wall track board GLB failed to load (${err.message}); using fallback.`, 'system');
      }
    });
  }
}
