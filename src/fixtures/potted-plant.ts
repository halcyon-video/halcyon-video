// Potted plants fixture: period-authentic indoor greenery for mom-and-pop video
// stores. Neighborhood stores in the 80s and 90s invariably featured houseplants
// thriving in front window light, trailing off the wooden checkout desk, or
// softening the shelf runs and back-room corridor.
import * as THREE from 'three';
import { FixturePlacement } from '../store-layout';
import { FixtureContext, StoreFixture } from '../fixtures';
import { Footprint } from '../layout-validator';

export type PlantVariant = 'floor-palm' | 'tall-ficus' | 'snake-plant' | 'pothos';

type Disposable = { geo?: THREE.BufferGeometry; mat?: THREE.Material; tex?: THREE.Texture };

const texCache = new Map<string, THREE.CanvasTexture>();

function cachedTex(
  key: string,
  w: number,
  h: number,
  paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): THREE.CanvasTexture {
  let tex = texCache.get(key);
  if (tex) return tex;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  paint(canvas.getContext('2d')!, w, h);
  tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  texCache.set(key, tex);
  return tex;
}

/** Variegated Sansevieria (snake plant) leaf texture with gold borders and mottled green body. */
function snakePlantTex(): THREE.CanvasTexture {
  return cachedTex('plant:snake', 256, 512, (ctx, w, h) => {
    // Dark forest green base
    ctx.fillStyle = '#1e4823';
    ctx.fillRect(0, 0, w, h);

    // Subtle horizontal mottled bands
    ctx.fillStyle = '#2f6333';
    for (let y = 10; y < h - 10; y += 14) {
      const bandH = 6 + (Math.sin(y * 0.1) * 3);
      ctx.beginPath();
      ctx.ellipse(w * 0.5, y, w * 0.38, bandH, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Secondary lighter mottled veins
    ctx.fillStyle = '#427c42';
    for (let y = 18; y < h - 10; y += 28) {
      ctx.beginPath();
      ctx.ellipse(w * 0.5, y, w * 0.28, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Bold creamy yellow-gold margins on both left and right edges
    const marginW = w * 0.16;
    const gradL = ctx.createLinearGradient(0, 0, marginW, 0);
    gradL.addColorStop(0, '#e5e169');
    gradL.addColorStop(0.7, '#d6d156');
    gradL.addColorStop(1, 'rgba(214, 209, 86, 0)');
    ctx.fillStyle = gradL;
    ctx.fillRect(0, 0, marginW, h);

    const gradR = ctx.createLinearGradient(w, 0, w - marginW, 0);
    gradR.addColorStop(0, '#e5e169');
    gradR.addColorStop(0.7, '#d6d156');
    gradR.addColorStop(1, 'rgba(214, 209, 86, 0)');
    ctx.fillStyle = gradR;
    ctx.fillRect(w - marginW, 0, marginW, h);
  });
}

/** Pothos leaf texture: rich emerald green with creamy golden-yellow marbling. */
function pothosLeafTex(): THREE.CanvasTexture {
  return cachedTex('plant:pothos', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#246b2f';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#b7dc5e';
    for (let i = 0; i < 18; i++) {
      const rx = (Math.sin(i * 3.7) * 0.5 + 0.5) * w;
      const ry = (Math.cos(i * 5.3) * 0.5 + 0.5) * h;
      const rw = 12 + (i % 5) * 8;
      const rh = 8 + (i % 4) * 6;
      ctx.beginPath();
      ctx.ellipse(rx, ry, rw, rh, (i * 0.4), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = '#8bbd45';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(w / 2, h);
    ctx.quadraticCurveTo(w / 2 + 5, h / 2, w / 2, 0);
    ctx.stroke();
  });
}

/** Ficus leaf texture: deep glossy green with pale central rib and subtle lateral veins. */
function ficusLeafTex(): THREE.CanvasTexture {
  return cachedTex('plant:ficus', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#1d4d23';
    ctx.fillRect(0, 0, w, h);

    // Subtle lateral veins
    ctx.strokeStyle = '#2d6d35';
    ctx.lineWidth = 2;
    for (let y = 30; y < h - 20; y += 22) {
      ctx.beginPath();
      ctx.moveTo(w / 2, y);
      ctx.quadraticCurveTo(w * 0.2, y - 10, 10, y - 24);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(w / 2, y);
      ctx.quadraticCurveTo(w * 0.8, y - 10, w - 10, y - 24);
      ctx.stroke();
    }

    // Prominent central rib
    ctx.strokeStyle = '#5cb365';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(w / 2, h);
    ctx.lineTo(w / 2, 10);
    ctx.stroke();
  });
}

export class PottedPlant implements StoreFixture {
  public placement: FixturePlacement;

  private ctx: FixtureContext;
  private group: THREE.Group | null = null;
  private disposables: Disposable[] = [];
  private footprint: Footprint | null = null;

  constructor(placement: FixturePlacement, ctx: FixtureContext) {
    this.placement = placement;
    this.ctx = ctx;
  }

  private opt<T>(key: string, fallback: T): T {
    const v = this.placement.options?.[key];
    return (v === undefined ? fallback : v) as T;
  }

  build(): void {
    const variant = this.opt<PlantVariant>('variant', 'floor-palm');
    const surfaceY = this.opt<number | undefined>('surfaceY', undefined);
    const posY = surfaceY !== undefined ? surfaceY : 0;

    const group = new THREE.Group();
    group.position.set(this.placement.position.x, posY, this.placement.position.z);
    group.rotation.y = this.placement.yaw ?? 0;
    this.group = group;

    let potDiameter = 1.2;

    if (variant === 'floor-palm') {
      potDiameter = this.buildFloorPalm(group);
    } else if (variant === 'tall-ficus') {
      potDiameter = this.buildTallFicus(group);
    } else if (variant === 'snake-plant') {
      potDiameter = this.buildSnakePlant(group);
    } else {
      potDiameter = this.buildPothos(group);
    }

    const scale = this.opt<number>('scale', 1.0);
    if (scale !== 1.0) {
      group.scale.setScalar(scale);
      potDiameter *= scale;
    }

    this.ctx.scene.add(group);
    this.ctx.requestShadowRefresh();

    if (surfaceY === undefined) {
      this.footprint = {
        label: `fixture:potted-plant-${this.placement.id}`,
        kind: 'fixture',
        cx: this.placement.position.x,
        cz: this.placement.position.z,
        w: potDiameter,
        d: potDiameter,
        yaw: this.placement.yaw ?? 0,
      };
    } else {
      this.footprint = null;
    }
  }

  /**
   * Builds a tall, stately ficus / rubber tree (~6.0 ft tall) with branching woody
   * trunk and lush clustered canopy.
   */
  private buildTallFicus(group: THREE.Group): number {
    const rTop = 0.64;
    const rBot = 0.50;
    const potH = 1.40;

    // Stately terracotta planter pot
    const potGeo = new THREE.CylinderGeometry(rTop, rBot, potH, 16);
    const potMat = new THREE.MeshStandardMaterial({
      color: 0xba5e36,
      roughness: 0.82,
      metalness: 0.04,
    });
    this.disposables.push({ geo: potGeo, mat: potMat });
    const potMesh = new THREE.Mesh(potGeo, potMat);
    potMesh.position.y = potH / 2;
    potMesh.castShadow = true;
    potMesh.receiveShadow = true;
    group.add(potMesh);
    this.ctx.addCollider(potMesh);

    // Rim collar
    const rimGeo = new THREE.CylinderGeometry(rTop + 0.05, rTop + 0.04, 0.14, 16);
    this.disposables.push({ geo: rimGeo });
    const rimMesh = new THREE.Mesh(rimGeo, potMat);
    rimMesh.position.y = potH - 0.07;
    rimMesh.castShadow = true;
    group.add(rimMesh);

    // Drainage tray
    const saucerGeo = new THREE.CylinderGeometry(rBot + 0.08, rBot + 0.04, 0.08, 16);
    this.disposables.push({ geo: saucerGeo });
    const saucerMesh = new THREE.Mesh(saucerGeo, potMat);
    saucerMesh.position.y = 0.04;
    group.add(saucerMesh);

    // Potting soil
    const soilGeo = new THREE.CircleGeometry(rTop - 0.02, 16);
    const soilMat = new THREE.MeshStandardMaterial({ color: 0x221711, roughness: 0.95 });
    this.disposables.push({ geo: soilGeo, mat: soilMat });
    const soilMesh = new THREE.Mesh(soilGeo, soilMat);
    soilMesh.rotation.x = -Math.PI / 2;
    soilMesh.position.y = potH - 0.03;
    group.add(soilMesh);

    // Sturdy woody trunk material
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x4e3827,
      roughness: 0.85,
      metalness: 0.02,
    });
    this.disposables.push({ mat: woodMat });

    // Lower multi-stem trunk cluster rising from soil to y ~ 3.5 ft
    const stemCount = 3;
    for (let i = 0; i < stemCount; i++) {
      const az = (i / stemCount) * Math.PI * 2;
      const pts: THREE.Vector3[] = [
        new THREE.Vector3(Math.cos(az) * 0.12, potH - 0.02, Math.sin(az) * 0.12),
        new THREE.Vector3(Math.cos(az + 0.4) * 0.06, potH + 1.1, Math.sin(az + 0.4) * 0.06),
        new THREE.Vector3(Math.cos(az) * 0.08, potH + 2.1, Math.sin(az) * 0.08),
      ];
      const curve = new THREE.CatmullRomCurve3(pts);
      const tubeGeo = new THREE.TubeGeometry(curve, 8, 0.055, 6, false);
      this.disposables.push({ geo: tubeGeo });
      const stem = new THREE.Mesh(tubeGeo, woodMat);
      stem.castShadow = true;
      group.add(stem);
    }

    // Branching canopy: 7 major branches arching outward and upward to y ~ 5.8 ft
    const branchCount = 7;
    const leafTex = ficusLeafTex();
    const leafMat = new THREE.MeshStandardMaterial({
      map: leafTex,
      roughness: 0.35,
      metalness: 0.04,
      side: THREE.DoubleSide,
    });
    this.disposables.push({ mat: leafMat });

    for (let b = 0; b < branchCount; b++) {
      const az = (b / branchCount) * Math.PI * 2 + 0.15;
      const branchLen = 1.9 + (b % 3) * 0.3;
      const branchTilt = 0.55 + (b % 2) * 0.15; // angle from vertical

      const startY = potH + 1.8 + (b % 3) * 0.2;
      const endY = startY + Math.cos(branchTilt) * branchLen;
      const reach = branchLen * Math.sin(branchTilt);

      const bPts: THREE.Vector3[] = [
        new THREE.Vector3(0, startY, 0),
        new THREE.Vector3(Math.cos(az) * (reach * 0.45), startY + (endY - startY) * 0.65, Math.sin(az) * (reach * 0.45)),
        new THREE.Vector3(Math.cos(az) * reach, endY, Math.sin(az) * reach),
      ];
      const bCurve = new THREE.CatmullRomCurve3(bPts);
      const bGeo = new THREE.TubeGeometry(bCurve, 6, 0.032, 5, false);
      this.disposables.push({ geo: bGeo });
      const bMesh = new THREE.Mesh(bGeo, woodMat);
      bMesh.castShadow = true;
      group.add(bMesh);

      // Clustered leaves along each branch and covering branch tips
      const clusterCount = 10;
      for (let c = 0; c < clusterCount; c++) {
        const t = 0.25 + (c / (clusterCount - 1)) * 0.75;
        const pos = bCurve.getPoint(t);
        const leafAz = az + (c * 1.4) + (Math.sin(c * 2.1) * 0.3);
        const leafGeo = this.createFicusLeafGeometry(0.52, 0.34);
        this.disposables.push({ geo: leafGeo });
        const leafMesh = new THREE.Mesh(leafGeo, leafMat);
        leafMesh.position.copy(pos);
        leafMesh.rotation.y = leafAz;
        leafMesh.rotation.x = 0.4 + (c % 4) * 0.2;
        leafMesh.rotation.z = Math.sin(c) * 0.3;
        leafMesh.castShadow = true;
        leafMesh.receiveShadow = true;
        group.add(leafMesh);
      }
    }

    // Central crown cluster of leaves filling the top and center
    const crownCount = 12;
    for (let c = 0; c < crownCount; c++) {
      const az = (c / crownCount) * Math.PI * 2;
      const r = 0.15 + (c % 3) * 0.12;
      const y = potH + 2.4 + (c % 4) * 0.35;
      const leafGeo = this.createFicusLeafGeometry(0.48, 0.32);
      this.disposables.push({ geo: leafGeo });
      const leafMesh = new THREE.Mesh(leafGeo, leafMat);
      leafMesh.position.set(Math.cos(az) * r, y, Math.sin(az) * r);
      leafMesh.rotation.y = az;
      leafMesh.rotation.x = 0.3 + (c % 3) * 0.3;
      leafMesh.castShadow = true;
      group.add(leafMesh);
    }

    return (rTop + 0.05) * 2;
  }

  /** Broad ficus leaf with pointed tip and natural droop. */
  private createFicusLeafGeometry(len: number, width: number): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    const rows = 6;
    const positions: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];

    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      const wFrac = Math.sin(t * Math.PI * 0.85);
      const w = width * wFrac;
      const z = t * len;
      const y = -Math.pow(t, 2) * 0.18;
      const vRidge = -0.02 * wFrac;

      positions.push(-w / 2, y, z);
      positions.push(0, y + vRidge, z);
      positions.push(w / 2, y, z);

      uvs.push(0, t, 0.5, t, 1, t);
    }

    for (let r = 0; r < rows; r++) {
      const base = r * 3;
      const next = (r + 1) * 3;
      indices.push(base, base + 1, next + 1);
      indices.push(base, next + 1, next);
      indices.push(base + 1, base + 2, next + 2);
      indices.push(base + 1, next + 2, next + 1);
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  /** Builds a tall floor palm (~5.6 ft tall) in a terracotta pot. Returns pot diameter. */
  private buildFloorPalm(group: THREE.Group): number {
    const rTop = 0.62;
    const rBot = 0.46;
    const potH = 1.30;

    // Terracotta Pot
    const potGeo = new THREE.CylinderGeometry(rTop, rBot, potH, 16);
    const potMat = new THREE.MeshStandardMaterial({
      color: 0xbf633b,
      roughness: 0.82,
      metalness: 0.04,
    });
    this.disposables.push({ geo: potGeo, mat: potMat });
    const potMesh = new THREE.Mesh(potGeo, potMat);
    potMesh.position.y = potH / 2;
    potMesh.castShadow = true;
    potMesh.receiveShadow = true;
    group.add(potMesh);
    this.ctx.addCollider(potMesh);

    // Rim collar
    const rimGeo = new THREE.CylinderGeometry(rTop + 0.05, rTop + 0.04, 0.12, 16);
    this.disposables.push({ geo: rimGeo });
    const rimMesh = new THREE.Mesh(rimGeo, potMat);
    rimMesh.position.y = potH - 0.06;
    rimMesh.castShadow = true;
    rimMesh.receiveShadow = true;
    group.add(rimMesh);

    // Drainage Saucer Tray
    const saucerGeo = new THREE.CylinderGeometry(rBot + 0.10, rBot + 0.06, 0.08, 16);
    this.disposables.push({ geo: saucerGeo });
    const saucerMesh = new THREE.Mesh(saucerGeo, potMat);
    saucerMesh.position.y = 0.04;
    saucerMesh.receiveShadow = true;
    group.add(saucerMesh);

    // Dark potting soil disk
    const soilGeo = new THREE.CircleGeometry(rTop - 0.02, 16);
    const soilMat = new THREE.MeshStandardMaterial({
      color: 0x221711,
      roughness: 0.95,
      metalness: 0.0,
    });
    this.disposables.push({ geo: soilGeo, mat: soilMat });
    const soilMesh = new THREE.Mesh(soilGeo, soilMat);
    soilMesh.rotation.x = -Math.PI / 2;
    soilMesh.position.y = potH - 0.04;
    soilMesh.receiveShadow = true;
    group.add(soilMesh);

    // Tall arching palm fronds
    const frondCount = 14;
    const frondScale = this.opt<number>('frondScale', 1.0);
    const fanSpan = this.opt<number>('fanSpan', Math.PI * 2);
    const isFullCircle = fanSpan >= Math.PI * 2 - 0.01;
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x275926,
      roughness: 0.45,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    this.disposables.push({ mat: leafMat });

    for (let i = 0; i < frondCount; i++) {
      const az = isFullCircle
        ? (i / frondCount) * Math.PI * 2 + (Math.sin(i * 1.7) * 0.2)
        : (frondCount > 1 ? (i / (frondCount - 1) - 0.5) * fanSpan : 0) + (Math.sin(i * 1.7) * 0.1);
      const frondLen = (3.2 + (i % 3) * 0.45) * frondScale;
      const tilt = 0.52 + (i % 4) * 0.16; // tilt from vertical (radians)

      const frondGroup = new THREE.Group();
      frondGroup.position.set(0, potH - 0.02, 0);
      frondGroup.rotation.y = az;

      // Stem
      const stemPoints: THREE.Vector3[] = [];
      const segs = 10;
      for (let s = 0; s <= segs; s++) {
        const t = s / segs;
        const forward = Math.sin(t * tilt) * frondLen * t;
        const up = Math.cos(t * tilt) * frondLen * t - (t * t * 0.65);
        stemPoints.push(new THREE.Vector3(0, up, forward));
      }
      const stemCurve = new THREE.CatmullRomCurve3(stemPoints);
      const stemGeo = new THREE.TubeGeometry(stemCurve, 10, 0.026 * (1 - 0.4), 6, false);
      this.disposables.push({ geo: stemGeo });
      const stemMesh = new THREE.Mesh(stemGeo, leafMat);
      stemMesh.castShadow = true;
      frondGroup.add(stemMesh);

      // Frond feather blade
      const leafGeo = this.createPalmBladeGeometry(frondLen * 0.78, 0.62);
      this.disposables.push({ geo: leafGeo });
      const leafMesh = new THREE.Mesh(leafGeo, leafMat);
      leafMesh.position.set(0, frondLen * 0.26, frondLen * 0.22);
      leafMesh.rotation.x = tilt * 0.72;
      leafMesh.castShadow = true;
      leafMesh.receiveShadow = true;
      frondGroup.add(leafMesh);

      group.add(frondGroup);
    }

    return (rTop + 0.05) * 2;
  }

  /** Creates a curved palm frond blade geometry. */
  private createPalmBladeGeometry(length: number, maxW: number): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    const rows = 10;
    const positions: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];

    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      const w = Math.sin(t * Math.PI) * maxW;
      const z = t * length;
      const y = -Math.pow(t, 2) * 0.42;
      const spineDrop = -0.05 * (1 - t);

      positions.push(-w / 2, y, z);
      positions.push(0, y + spineDrop, z);
      positions.push(w / 2, y, z);

      uvs.push(0, t, 0.5, t, 1, t);
    }

    for (let r = 0; r < rows; r++) {
      const base = r * 3;
      const next = (r + 1) * 3;
      indices.push(base, base + 1, next + 1);
      indices.push(base, next + 1, next);
      indices.push(base + 1, base + 2, next + 2);
      indices.push(base + 1, next + 2, next + 1);
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  /** Builds an upright Sansevieria (snake plant) in a glazed ceramic pot. Returns pot diameter. */
  private buildSnakePlant(group: THREE.Group): number {
    const rTop = 0.48;
    const rBot = 0.40;
    const potH = 1.0;

    // Glazed warm cream ceramic pot
    const potGeo = new THREE.CylinderGeometry(rTop, rBot, potH, 16);
    const potMat = new THREE.MeshStandardMaterial({
      color: 0xded8cb,
      roughness: 0.28,
      metalness: 0.08,
    });
    this.disposables.push({ geo: potGeo, mat: potMat });
    const potMesh = new THREE.Mesh(potGeo, potMat);
    potMesh.position.y = potH / 2;
    potMesh.castShadow = true;
    potMesh.receiveShadow = true;
    group.add(potMesh);
    this.ctx.addCollider(potMesh);

    // Saucer
    const saucerGeo = new THREE.CylinderGeometry(rBot + 0.08, rBot + 0.04, 0.06, 16);
    this.disposables.push({ geo: saucerGeo });
    const saucerMesh = new THREE.Mesh(saucerGeo, potMat);
    saucerMesh.position.y = 0.03;
    saucerMesh.receiveShadow = true;
    group.add(saucerMesh);

    // Soil
    const soilGeo = new THREE.CircleGeometry(rTop - 0.02, 16);
    const soilMat = new THREE.MeshStandardMaterial({ color: 0x221711, roughness: 0.95 });
    this.disposables.push({ geo: soilGeo, mat: soilMat });
    const soilMesh = new THREE.Mesh(soilGeo, soilMat);
    soilMesh.rotation.x = -Math.PI / 2;
    soilMesh.position.y = potH - 0.04;
    group.add(soilMesh);

    // Snake plant blades: upright sword leaves with canvas texture
    const tex = snakePlantTex();
    const leafMat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.42,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    this.disposables.push({ mat: leafMat });

    const bladeCount = 15;
    for (let i = 0; i < bladeCount; i++) {
      const ring = i < 5 ? 0.12 : (i < 10 ? 0.24 : 0.35);
      const az = (i * 2.399) % (Math.PI * 2);
      const bladeH = 1.5 + (1 - ring / 0.4) * 1.2 + (Math.sin(i * 3.1) * 0.3);
      const bladeW = 0.22 + (i % 3) * 0.04;

      const bladeGeo = this.createSnakeBladeGeometry(bladeH, bladeW);
      this.disposables.push({ geo: bladeGeo });
      const bladeMesh = new THREE.Mesh(bladeGeo, leafMat);

      bladeMesh.position.set(Math.cos(az) * ring, potH - 0.03, Math.sin(az) * ring);
      bladeMesh.rotation.y = az + (Math.sin(i) * 0.4);
      bladeMesh.rotation.z = (Math.cos(az) * 0.08) * (ring / 0.35);
      bladeMesh.rotation.x = (Math.sin(az) * 0.08) * (ring / 0.35);

      bladeMesh.castShadow = true;
      bladeMesh.receiveShadow = true;
      group.add(bladeMesh);
    }

    return rTop * 2;
  }

  /** Upright sword blade with slight V-trough and twist. */
  private createSnakeBladeGeometry(height: number, width: number): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    const rows = 10;
    const positions: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];

    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      const wFrac = t < 0.35 ? (0.6 + t * 1.14) : Math.max(0.01, 1 - Math.pow((t - 0.35) / 0.65, 1.6));
      const w = width * wFrac;
      const y = t * height;
      const z = Math.sin(t * Math.PI * 0.45) * 0.12;
      const vDepth = -0.035 * wFrac;

      positions.push(-w / 2, y, z);
      positions.push(0, y, z + vDepth);
      positions.push(w / 2, y, z);

      uvs.push(0, t, 0.5, t, 1, t);
    }

    for (let r = 0; r < rows; r++) {
      const base = r * 3;
      const next = (r + 1) * 3;
      indices.push(base, base + 1, next + 1);
      indices.push(base, next + 1, next);
      indices.push(base + 1, base + 2, next + 2);
      indices.push(base + 1, next + 2, next + 1);
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  /** Builds a trailing pothos plant for countertops or desks. Returns pot diameter. */
  private buildPothos(group: THREE.Group): number {
    const rTop = 0.32;
    const rBot = 0.24;
    const potH = 0.48;

    // Warm terracotta desk planter
    const potGeo = new THREE.CylinderGeometry(rTop, rBot, potH, 16);
    const potMat = new THREE.MeshStandardMaterial({
      color: 0xbd6238,
      roughness: 0.78,
      metalness: 0.02,
    });
    this.disposables.push({ geo: potGeo, mat: potMat });
    const potMesh = new THREE.Mesh(potGeo, potMat);
    potMesh.position.y = potH / 2;
    potMesh.castShadow = true;
    potMesh.receiveShadow = true;
    group.add(potMesh);

    // Rim
    const rimGeo = new THREE.CylinderGeometry(rTop + 0.03, rTop + 0.02, 0.06, 16);
    this.disposables.push({ geo: rimGeo });
    const rimMesh = new THREE.Mesh(rimGeo, potMat);
    rimMesh.position.y = potH - 0.03;
    group.add(rimMesh);

    // Soil
    const soilGeo = new THREE.CircleGeometry(rTop - 0.01, 16);
    const soilMat = new THREE.MeshStandardMaterial({ color: 0x221711, roughness: 0.95 });
    this.disposables.push({ geo: soilGeo, mat: soilMat });
    const soilMesh = new THREE.Mesh(soilGeo, soilMat);
    soilMesh.rotation.x = -Math.PI / 2;
    soilMesh.position.y = potH - 0.02;
    group.add(soilMesh);

    // Foliage: trailing vines + top leaves
    const tex = pothosLeafTex();
    const leafMat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.38,
      metalness: 0.04,
      side: THREE.DoubleSide,
    });
    this.disposables.push({ mat: leafMat });

    // 1. Top dome cluster of leaves
    const topLeaves = 9;
    for (let i = 0; i < topLeaves; i++) {
      const az = (i / topLeaves) * Math.PI * 2;
      const dist = 0.12 + (i % 3) * 0.06;
      const leafGeo = this.createHeartLeafGeometry(0.24, 0.20);
      this.disposables.push({ geo: leafGeo });
      const leafMesh = new THREE.Mesh(leafGeo, leafMat);
      leafMesh.position.set(Math.cos(az) * dist, potH + 0.04 + (i % 3) * 0.03, Math.sin(az) * dist);
      leafMesh.rotation.y = az;
      leafMesh.rotation.x = 0.4 + (i % 3) * 0.2;
      leafMesh.castShadow = true;
      group.add(leafMesh);
    }

    // 2. Trailing vines cascading over the rim
    const vineCount = 5;
    for (let v = 0; v < vineCount; v++) {
      const az = (v / vineCount) * Math.PI * 2 + 0.3;
      const vineLen = 0.65 + (v % 3) * 0.28;
      const leafSteps = 4 + (v % 2) * 2;

      for (let s = 1; s <= leafSteps; s++) {
        const t = s / leafSteps;
        const out = rTop + (t * 0.18);
        const y = potH - (t * vineLen);
        const leafGeo = this.createHeartLeafGeometry(0.20 * (1 - t * 0.3), 0.16 * (1 - t * 0.3));
        this.disposables.push({ geo: leafGeo });
        const leafMesh = new THREE.Mesh(leafGeo, leafMat);
        leafMesh.position.set(Math.cos(az) * out, y, Math.sin(az) * out);
        leafMesh.rotation.y = az + Math.PI / 2;
        leafMesh.rotation.x = 0.8 + (t * 0.4);
        leafMesh.castShadow = true;
        group.add(leafMesh);
      }
    }

    return (rTop + 0.03) * 2;
  }

  /** Heart-shaped pothos leaf with pointed tip. */
  private createHeartLeafGeometry(len: number, width: number): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    const positions: number[] = [
      0, 0, 0,
      -width * 0.45, 0.02, len * 0.25,
      -width * 0.5, 0.01, len * 0.5,
      0, -0.01, len * 0.5,
      width * 0.5, 0.01, len * 0.5,
      width * 0.45, 0.02, len * 0.25,
      0, -0.02, len,
    ];
    const uvs: number[] = [
      0.5, 0,
      0.1, 0.25,
      0.0, 0.5,
      0.5, 0.5,
      1.0, 0.5,
      0.9, 0.25,
      0.5, 1.0,
    ];
    const indices: number[] = [
      0, 1, 3,
      0, 3, 5,
      1, 2, 3,
      3, 4, 5,
      2, 6, 3,
      3, 6, 4,
    ];

    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  update(_timeMs: number): void {}

  getFootprint(): Footprint | null {
    return this.footprint;
  }

  dispose(): void {
    if (this.group) {
      this.ctx.scene.remove(this.group);
      this.group = null;
    }
    this.disposables.forEach((d) => {
      d.geo?.dispose();
      d.mat?.dispose();
      d.tex?.dispose();
    });
    this.disposables = [];
  }
}
