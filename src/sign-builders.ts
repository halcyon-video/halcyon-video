// Builders for the 3D signage and shelf-end fixtures: layered "extruded" sign
// meshes, the trapezoid cross-section used by the freestanding units, and the
// endcap materials. Stateless — callers position the returned objects.
import * as THREE from 'three';
import { getActiveTheme } from './themes';

// ── The one chokepoint every sign mesh goes through ────────────────────────
//
// A sign is a flat printed card sitting ON a fixture whose body sets
// cast/receiveShadow. Skip the shadow flags on the card and it keeps full lit
// brightness while the face behind it drops into shadow — which reads as the
// sign GLOWING, brighter than everything around it, but only on the faces the
// room's lights don't reach. (Filed against the bargain bins and the floor
// collection displays: two faces looked wrong, two looked fine, because only
// two were in shadow.)
//
// Route every new sign mesh through here rather than hand-setting flags, and
// auditSignMeshes() below will catch it if the material later drifts back to
// something self-lit.
export function markSignMesh<T extends THREE.Mesh>(mesh: T, opts: { casts?: boolean } = {}): T {
  // A card flush against a fixture face has nothing meaningful to cast onto,
  // and casting from a coplanar quad only buys acne — but it MUST darken with
  // the surface it is printed on.
  mesh.castShadow = opts.casts ?? false;
  mesh.receiveShadow = true;
  mesh.userData.isSign = true;
  return mesh;
}

// Dev-only guard: walks a built scene and reports any marked sign that would
// read as self-lit. Called from StoreScene after the store builds (see
// auditSignage) so a newly-added sign fails loudly in the console instead of
// silently glowing on two faces until someone files it.
export function auditSignMeshes(root: THREE.Object3D): string[] {
  const problems: string[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.userData?.isSign) return;
    const label = mesh.name || mesh.parent?.name || 'sign';
    if (!mesh.receiveShadow) {
      problems.push(`${label}: receiveShadow is off — it will stay bright on shadowed faces`);
    }
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (!m) continue;
      if ((m as THREE.MeshBasicMaterial).isMeshBasicMaterial) {
        problems.push(`${label}: MeshBasicMaterial ignores scene lighting entirely`);
        continue;
      }
      if ((m as THREE.Material).toneMapped === false) {
        problems.push(`${label}: toneMapped=false exempts it from the room's exposure`);
      }
      const std = m as THREE.MeshStandardMaterial;
      if (std.emissive && std.emissive.getHex() !== 0x000000 && (std.emissiveIntensity ?? 1) > 0) {
        problems.push(`${label}: emissive ${std.emissive.getHexString()} makes it a light source`);
      }
    }
  });
  return problems;
}

export function createExtrudedMaterials(texture: THREE.Texture, numLayers: number): THREE.MeshStandardMaterial[] {
  const materials: THREE.MeshStandardMaterial[] = [];

  for (let i = 0; i < numLayers; i++) {
    const isFront = (i === numLayers - 1);
    let colorFactor = 0.45;
    if (isFront) {
      colorFactor = 1.0;
    } else {
      // Guard the divisor: numLayers = 2 made this 0/0 = NaN, and one NaN-colored
      // mesh gets smeared across the whole frame by the bloom pass (black screen).
      colorFactor = 0.3 + (0.25 * i) / Math.max(1, numLayers - 2);
    }

    materials.push(new THREE.MeshStandardMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.35,
      // Printed/dimensional letter stock, not glass: at the old 0.25/0.1 the
      // baked interior env painted a big white specular wash across every
      // flat sign face — they read as glowing and never as lit surfaces.
      // Matte print takes the troffer light instead of self-broadcasting.
      roughness: 0.6,
      metalness: 0.0,
      color: new THREE.Color(colorFactor, colorFactor, colorFactor),
      side: THREE.FrontSide
    }));
  }
  return materials;
}

export function create3DExtrudedSign(materials: THREE.MeshStandardMaterial[], width: number, height: number, depth: number = 0.1667): THREE.Group {
  const group = new THREE.Group();
  const numLayers = materials.length;
  const step = depth / (numLayers - 1);
  const geo = new THREE.PlaneGeometry(width, height);

  for (let i = 0; i < numLayers; i++) {
    const zOffset = i * step;
    const isFront = (i === numLayers - 1);

    const mesh = new THREE.Mesh(geo, materials[i]);
    mesh.position.set(0, 0, zOffset);

    if (isFront) {
      mesh.castShadow = true;
    }
    mesh.receiveShadow = true;
    mesh.userData.excludeFromSSAO = true;
    group.add(mesh);
  }
  return group;
}

export function create3DDoubleLayeredSign(
  bodyMaterials: THREE.MeshStandardMaterial[],
  yellowMaterials: THREE.MeshStandardMaterial[],
  width: number,
  height: number,
  bodyDepth: number = 0.1667,
  yellowDepth: number = 0.0417
): THREE.Group {
  const group = new THREE.Group();

  // 1. Blue body layers
  const numBodyLayers = bodyMaterials.length;
  const bodyStep = bodyDepth / (numBodyLayers - 1);
  const bodyGeo = new THREE.PlaneGeometry(width, height);

  for (let i = 0; i < numBodyLayers; i++) {
    const zOffset = i * bodyStep;
    const isFront = (i === numBodyLayers - 1);
    const mesh = new THREE.Mesh(bodyGeo, bodyMaterials[i]);
    mesh.position.set(0, 0, zOffset);
    if (isFront) mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.excludeFromSSAO = true;
    group.add(mesh);
  }

  // 2. Yellow details layers
  const numYellowLayers = yellowMaterials.length;
  const yellowStep = yellowDepth / (numYellowLayers - 1);
  const yellowGeo = new THREE.PlaneGeometry(width, height);

  for (let i = 0; i < numYellowLayers; i++) {
    const zOffset = bodyDepth + i * yellowStep;
    const isFront = (i === numYellowLayers - 1);
    const mesh = new THREE.Mesh(yellowGeo, yellowMaterials[i]);
    mesh.position.set(0, 0, zOffset);
    if (isFront) mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.excludeFromSSAO = true;
    group.add(mesh);
  }

  return group;
}

export function createTrapezoidGeometry(h: number, dBottom: number, dTop: number, thickness: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  // Centered coordinates in 2D X-Y plane (representing Z-Y layout)
  shape.moveTo(-dBottom / 2, -h / 2);
  shape.lineTo(dBottom / 2, -h / 2);
  shape.lineTo(dTop / 2, h / 2);
  shape.lineTo(-dTop / 2, h / 2);
  shape.closePath();

  const settings = {
    depth: thickness,
    bevelEnabled: false
  };

  const geo = new THREE.ExtrudeGeometry(shape, settings);
  geo.center();
  return geo;
}

// Re-index (or re-order) a trapezoid geometry's triangles into three material
// groups — front face, sides, back face — split by face normal Z.
export function splitTrapezoidGroups(geo: THREE.BufferGeometry) {
  const posAttr = geo.getAttribute('position');
  const uvAttr = geo.getAttribute('uv');
  const normalAttr = geo.getAttribute('normal');
  if (!posAttr) return;

  const indexAttr = geo.getIndex();
  if (indexAttr) {
    const indices = indexAttr.array;
    const positions = posAttr.array;

    const frontIndices: number[] = [];
    const sideIndices: number[] = [];
    const backIndices: number[] = [];

    for (let i = 0; i < indices.length; i += 3) {
      const idx0 = indices[i];
      const idx1 = indices[i + 1];
      const idx2 = indices[i + 2];

      const x0 = positions[idx0 * 3];
      const y0 = positions[idx0 * 3 + 1];
      const z0 = positions[idx0 * 3 + 2];

      const x1 = positions[idx1 * 3];
      const y1 = positions[idx1 * 3 + 1];
      const z1 = positions[idx1 * 3 + 2];

      const x2 = positions[idx2 * 3];
      const y2 = positions[idx2 * 3 + 1];
      const z2 = positions[idx2 * 3 + 2];

      const ux = x1 - x0, uy = y1 - y0, uz = z1 - z0;
      const vx = x2 - x0, vy = y2 - y0, vz = z2 - z0;
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz);
      const normalZ = len > 0 ? nz / len : 0;

      if (Math.abs(normalZ) > 0.9) {
        const avgZ = (z0 + z1 + z2) / 3;
        if (avgZ > 0) {
          frontIndices.push(idx0, idx1, idx2);
        } else {
          backIndices.push(idx0, idx1, idx2);
        }
      } else {
        sideIndices.push(idx0, idx1, idx2);
      }
    }

    const newIndices = [...frontIndices, ...sideIndices, ...backIndices];
    geo.setIndex(new THREE.Uint16BufferAttribute(newIndices, 1));

    geo.clearGroups();
    geo.addGroup(0, frontIndices.length, 0);
    geo.addGroup(frontIndices.length, sideIndices.length, 1);
    geo.addGroup(frontIndices.length + sideIndices.length, backIndices.length, 2);
  } else {
    const numVertices = posAttr.count;
    const posArray = posAttr.array;
    const uvArray = uvAttr ? uvAttr.array : null;
    const normalArray = normalAttr ? normalAttr.array : null;

    interface VertexData {
      pos: number[];
      uv: number[] | null;
      normal: number[] | null;
    }
    const frontTris: VertexData[] = [];
    const sideTris: VertexData[] = [];
    const backTris: VertexData[] = [];

    for (let i = 0; i < numVertices; i += 3) {
      const triData: VertexData[] = [];
      let avgZ = 0;

      for (let v = 0; v < 3; v++) {
        const idx = i + v;
        const x = posArray[idx * 3];
        const y = posArray[idx * 3 + 1];
        const z = posArray[idx * 3 + 2];
        avgZ += z;

        triData.push({
          pos: [x, y, z],
          uv: uvArray ? [uvArray[idx * 2], uvArray[idx * 2 + 1]] : null,
          normal: normalArray ? [normalArray[idx * 3], normalArray[idx * 3 + 1], normalArray[idx * 3 + 2]] : null
        });
      }

      avgZ /= 3;

      const [x0, y0, z0] = triData[0].pos;
      const [x1, y1, z1] = triData[1].pos;
      const [x2, y2, z2] = triData[2].pos;

      const ux = x1 - x0, uy = y1 - y0, uz = z1 - z0;
      const vx = x2 - x0, vy = y2 - y0, vz = z2 - z0;
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz);
      const normalZ = len > 0 ? nz / len : 0;

      if (Math.abs(normalZ) > 0.9) {
        if (avgZ > 0) {
          frontTris.push(...triData);
        } else {
          backTris.push(...triData);
        }
      } else {
        sideTris.push(...triData);
      }
    }

    const allTris = [...frontTris, ...sideTris, ...backTris];
    const newPos = new Float32Array(allTris.length * 3);
    const newUvs = uvArray ? new Float32Array(allTris.length * 2) : null;
    const newNormals = normalArray ? new Float32Array(allTris.length * 3) : null;

    allTris.forEach((vertex, idx) => {
      newPos[idx * 3] = vertex.pos[0];
      newPos[idx * 3 + 1] = vertex.pos[1];
      newPos[idx * 3 + 2] = vertex.pos[2];

      if (newUvs && vertex.uv) {
        newUvs[idx * 2] = vertex.uv[0];
        newUvs[idx * 2 + 1] = vertex.uv[1];
      }

      if (newNormals && vertex.normal) {
        newNormals[idx * 3] = vertex.normal[0];
        newNormals[idx * 3 + 1] = vertex.normal[1];
        newNormals[idx * 3 + 2] = vertex.normal[2];
      }
    });

    geo.setAttribute('position', new THREE.BufferAttribute(newPos, 3));
    if (newUvs) geo.setAttribute('uv', new THREE.BufferAttribute(newUvs, 2));
    if (newNormals) geo.setAttribute('normal', new THREE.BufferAttribute(newNormals, 3));

    geo.clearGroups();
    geo.addGroup(0, frontTris.length, 0);
    geo.addGroup(frontTris.length, sideTris.length, 1);
    geo.addGroup(frontTris.length + sideTris.length, backTris.length, 2);
  }
}

// Cached beige slatwall texture for the 2000s-theme end-cap inner faces (the
// flat "back" panel that faces into the shelving run, plus the thin perimeter
// return edges). Built once and shared — a canvas re-draw per end cap would be
// wasteful since the pattern never varies. The height axis of the end-cap's
// UVs is unnormalized (raw feet), so `repeat` maps grooves to a real 4"
// spacing rather than the texture's fixed pixel size.
let cachedSlatwallEndCapTexture: THREE.CanvasTexture | null = null;
const SLATWALL_GROOVE_SPACING_FT = 4 / 12; // 4 inches
function getSlatwallEndCapTexture(): THREE.CanvasTexture {
  if (!cachedSlatwallEndCapTexture) {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#eadcbc'; // warm tan slatwall base
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = '#ab9674'; // darker groove line
    ctx.fillRect(0, 26, 32, 6);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    // One texture tile == 1 real-world foot along the mapped axis (the geometry's
    // UV is raw local feet), so repeat = 1 / grooveSpacing gives a groove every
    // SLATWALL_GROOVE_SPACING_FT feet.
    tex.repeat.set(1, 1 / SLATWALL_GROOVE_SPACING_FT);
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    cachedSlatwallEndCapTexture = tex;
  }
  return cachedSlatwallEndCapTexture;
}

// Slatwall material for large flat panels whose box geometry carries NORMALIZED
// (0..1) UVs — unlike the end caps' raw-feet UVs — so the groove repeat is
// scaled by the panel's real height here. Cached on first use; every caller
// passes the 5.1-ft gondola frame height.
let cachedSlatwallPanelMat: THREE.MeshStandardMaterial | null = null;
export function getSlatwallPanelMaterial(panelHeightFt: number): THREE.MeshStandardMaterial {
  if (!cachedSlatwallPanelMat) {
    const tex = getSlatwallEndCapTexture().clone();
    tex.repeat.set(1, panelHeightFt / SLATWALL_GROOVE_SPACING_FT);
    tex.needsUpdate = true;
    cachedSlatwallPanelMat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.85,
      metalness: 0.0
    });
  }
  return cachedSlatwallPanelMat;
}

export function createLibraryEndCapMaterial(isBack: boolean = false): THREE.MeshStandardMaterial[] {
  const theme = getActiveTheme();
  const is2000sWireShelving = theme.shelving.frame === 'wire-black';
  // Melamine end panel, matched to the gondola shelf boards' satin finish
  // (sharedShelfMat in three-scene: 0xd8d8d8 @ roughness 0.55). The old pure
  // #ffffff at roughness 0.8 was an out-of-gamut albedo with zero view
  // response — under the troffers the caps blew out flat white ("shining
  // like the sun") instead of reading as the same laminate as the run.
  const sideColor = '#f8f2e8'; // tracks sharedShelfMat's warm off-white
  const sideRoughness = 0.55;
  const sideMetalness = 0.05;

  // 2000s theme: the non-front faces (the flat inner panel facing into the
  // run, plus the thin perimeter return edges) get a beige slatwall look
  // instead of plain white, per issue #48/#49a — no white end-cap geometry
  // should remain visible in this theme.
  const sideMat = is2000sWireShelving
    ? new THREE.MeshStandardMaterial({
        map: getSlatwallEndCapTexture(),
        roughness: 0.85,
        metalness: 0.0
      })
    : new THREE.MeshStandardMaterial({
        color: sideColor,
        roughness: sideRoughness,
        metalness: sideMetalness
      });

  if (isBack) {
    return [sideMat, sideMat, sideMat];
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 2048;
  const ctx = canvas.getContext('2d')!;

  // Background color fill from active theme
  ctx.fillStyle = theme.palette.primary;
  ctx.fillRect(0, 0, 1024, 2048);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;

  const faceMat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.55, // satin, same family as the shelf melamine — see sideColor note
    metalness: 0.05
  });

  // Material index 0 is front face, 1 is sides, 2 is back face
  return [faceMat, sideMat, sideMat];
}
