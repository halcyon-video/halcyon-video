import { joineryGeometry, stretchJoinery } from '../joinery-model.ts';
import * as THREE from 'three';

/** A continuous aluminum leaf with a recessed glass pocket and a deep bottom rail. */
export function createDoorLeafFrame(width: number, height: number, single = false): THREE.ExtrudeGeometry {
  const margin = single ? .05 : .10;
  const left = -width / 2 + margin, right = width / 2 - margin;
  const bottom = single ? .04 : .055, top = height - .02;
  const stile = single ? .15 : .12, kick = single ? .28 : .24;
  const shape = new THREE.Shape();
  shape.moveTo(left, bottom); shape.lineTo(right, bottom);
  shape.lineTo(right, top); shape.lineTo(left, top); shape.closePath();
  const glass = new THREE.Path();
  glass.moveTo(left + stile, bottom + kick); glass.lineTo(left + stile, top - .16);
  glass.lineTo(right - stile, top - .16); glass.lineTo(right - stile, bottom + kick); glass.closePath();
  shape.holes.push(glass);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: .115, bevelEnabled: true, bevelThickness: .006, bevelSize: .006,
    bevelSegments: 1, steps: 1, curveSegments: 1,
  });
  geometry.translate(0, 0, -.0575);
  return joineryGeometry(geometry, single ? 'SingleDoorLeaf' : 'DoubleDoorLeaf', g => {
    stretchJoinery(g,'x',3.2,width,.30);
    const p = g.getAttribute('position');
    for (let i=0;i<p.count;i++) { const y=p.getY(i); if(y>3.5) p.setY(i,y+height-7); }
  });
}

/** A black horizontal push bar with shallow returns reaching the leaf stiles. */
export function createDoorPushBarGeometry(width: number): THREE.ExtrudeGeometry {
  const halfSpan = width / 2 - 0.15;
  const stockThickness = 0.10;
  const standoff = 0.185;
  const barHeight = 0.24; // Three inches overall including the eased edges.

  const shape = new THREE.Shape();
  shape.moveTo(-halfSpan, 0);
  shape.lineTo(-halfSpan, standoff);
  shape.lineTo(halfSpan, standoff);
  shape.lineTo(halfSpan, 0);
  shape.lineTo(halfSpan - stockThickness, 0);
  shape.lineTo(halfSpan - stockThickness, standoff - stockThickness);
  shape.lineTo(-halfSpan + stockThickness, standoff - stockThickness);
  shape.lineTo(-halfSpan + stockThickness, 0);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: barHeight,
    bevelEnabled: true,
    bevelThickness: 0.005,
    bevelSize: 0.005,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 1,
  });

  geometry.translate(0, 0, -barHeight / 2);
  // +Z faces away from the glazing; the return ends seat on the leaf at Z=0.
  geometry.rotateX(Math.PI / 2);
  return joineryGeometry(geometry, 'DoorPushBar', g => stretchJoinery(g,'x',3.2,width,.26));
}
