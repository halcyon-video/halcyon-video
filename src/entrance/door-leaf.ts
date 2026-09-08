import * as THREE from 'three';

/** A continuous aluminum leaf with a recessed glass pocket and a deep bottom rail. */
export function createDoorLeafFrame(width: number, height: number): THREE.ExtrudeGeometry {
  const left = -width / 2 + .10, right = width / 2 - .10;
  const bottom = .055, top = height - .02;
  const shape = new THREE.Shape();
  shape.moveTo(left, bottom); shape.lineTo(right, bottom);
  shape.lineTo(right, top); shape.lineTo(left, top); shape.closePath();
  const glass = new THREE.Path();
  glass.moveTo(left + .12, bottom + .24); glass.lineTo(left + .12, top - .16);
  glass.lineTo(right - .12, top - .16); glass.lineTo(right - .12, bottom + .24); glass.closePath();
  shape.holes.push(glass);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: .115, bevelEnabled: true, bevelThickness: .006, bevelSize: .006,
    bevelSegments: 1, steps: 1, curveSegments: 1,
  });
  geometry.translate(0, 0, -.0575);
  return geometry;
}
