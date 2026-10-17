import * as THREE from 'three';

/** Generic rounded-front furniture for installs without the optional local model.
 * Keep the established six material lanes, including the white deck and front
 * artwork, and the exact rectangular navigation envelope. */
export function endcapFooterGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  const r = Math.min(w / 8, d / 4);
  const left = -w / 2, right = w / 2, back = -d / 2, front = d / 2;
  const plan = new THREE.Shape();
  plan.moveTo(left, back);
  plan.lineTo(right, back);
  plan.lineTo(right, front - r);
  plan.absarc(right - r, front - r, r, 0, Math.PI / 2, false);
  plan.lineTo(left + r, front);
  plan.absarc(left + r, front - r, r, Math.PI / 2, Math.PI, false);
  plan.lineTo(left, back);
  const raw = new THREE.ExtrudeGeometry(plan, { depth: h, bevelEnabled: false, curveSegments: 6 });
  raw.rotateX(Math.PI / 2);
  raw.translate(0, h / 2, 0);
  const p = raw.getAttribute('position'), n = raw.getAttribute('normal');
  const lanes: number[][] = Array.from({ length: 6 }, () => []);
  for (let i = 0; i < p.count; i += 3) {
    // Front corner arcs share the front print rather than leaving square
    // printed wings outside the rounded body. Side and back faces stay plain.
    const ny = n.getY(i), nz = n.getZ(i);
    const role = ny > .5 ? 2 : ny < -.5 ? 3 : nz > .01 ? 4 : 0;
    lanes[role].push(i, i + 1, i + 2);
  }
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [];
  const geo = new THREE.BufferGeometry();
  lanes.forEach((indices, role) => {
    const start = positions.length / 3;
    for (const i of indices) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      positions.push(x, y, z);
      normals.push(n.getX(i), n.getY(i), n.getZ(i));
      uvs.push(.5 + x / w, role === 2 || role === 3 ? .5 - z / d : .5 + y / h);
    }
    if (indices.length) geo.addGroup(start, indices.length, role);
  });
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  raw.dispose();
  return geo;
}
