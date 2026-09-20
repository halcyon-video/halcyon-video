import * as THREE from 'three';
import { createAsphaltTexture } from './canvas-textures';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ParkingLayout } from './parking-layout';

// Static shaped surfaces, batched by finish. No new assets or per-frame work.
export function buildParkingLot(parent: THREE.Group, p: ParkingLayout, sidewalkMat: THREE.MeshStandardMaterial) {
  const group = new THREE.Group(); group.name = 'wraparound-parking'; parent.add(group);
  const owned: {dispose(): void}[] = [];
  const track = <T extends {dispose(): void}>(o: T): T => {owned.push(o); return o;};
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  function shapeMesh(shape: THREE.Shape, mat: THREE.Material, y: number, thickness = 0) {
    const geo = thickness ? new THREE.ExtrudeGeometry(shape, {depth: thickness, bevelEnabled: false, curveSegments: 12}) : new THREE.ShapeGeometry(shape, 12);
    geo.rotateX(-Math.PI / 2); geo.translate(0, y - thickness, 0);
    const pos = geo.getAttribute('position'), uv = geo.getAttribute('uv');
    for (let i=0; i<pos.count; i++) {
      // Every concrete surface shares the entrance's existing slab texture.
      const repeat = mat === sidewalkMat ? sidewalkMat.map?.repeat : null;
      uv.setXY(i, pos.getX(i)/4.5/(repeat?.x || 1), -pos.getZ(i)/4.5/(repeat?.y || 1));
    }
    const list = batches.get(mat) || []; list.push(geo); batches.set(mat, list);
  }
  function rect(x0: number, z0: number, x1: number, z1: number) {
    const s = new THREE.Shape(); s.moveTo(x0,-z0); s.lineTo(x1,-z0); s.lineTo(x1,-z1); s.lineTo(x0,-z1); s.closePath(); return s;
  }
  // A continuous U-shaped apron wraps the freestanding building. Asphalt is
  // below its slab and the street-side grass, with the right driveway open.
  const asphaltTex = track(createAsphaltTexture(0,0));
  const asphaltMat = track(new THREE.MeshStandardMaterial({map:asphaltTex,roughness:.95}));
  shapeMesh(rect(p.minX,p.rearZ,p.maxX,p.farZ),asphaltMat,-.09);
  shapeMesh(rect(p.drivewayMinX,p.farZ,p.maxX,p.streetZ+2),asphaltMat,-.09);
  const apron = new THREE.Shape();
  apron.moveTo(p.left,-p.rearZ); apron.lineTo(p.left,-(p.nearZ-3));
  apron.quadraticCurveTo(p.left,-p.nearZ,p.left+3,-p.nearZ);
  apron.lineTo(p.right-3,-p.nearZ); apron.quadraticCurveTo(p.right,-p.nearZ,p.right,-(p.nearZ-3));
  apron.lineTo(p.right,-p.rearZ); apron.lineTo(p.right-4,-p.rearZ);
  apron.lineTo(p.right-4,-p.frontZ); apron.lineTo(p.left+4,-p.frontZ);
  apron.lineTo(p.left+4,-p.rearZ); apron.closePath();
  shapeMesh(apron,sidewalkMat,0,.16);
  // Street-facing grass island: broad verge with rounded curb returns.
  const grass = new THREE.Shape(); const radius=6, end=p.drivewayMinX;
  grass.moveTo(p.minX,-(p.farZ-radius));
  grass.quadraticCurveTo(p.minX,-p.farZ,p.minX+radius,-p.farZ);
  grass.lineTo(end-radius,-p.farZ);
  grass.quadraticCurveTo(end,-p.farZ,end,-(p.farZ+radius));
  grass.lineTo(end,-(p.streetZ-5)); grass.lineTo(p.minX,-(p.streetZ-5)); grass.closePath();
  const grassCanvas=document.createElement('canvas'); grassCanvas.width=grassCanvas.height=128;
  const ctx=grassCanvas.getContext('2d')!; ctx.fillStyle='#75804f'; ctx.fillRect(0,0,128,128);
  let grain=1709;
  for(let i=0;i<4096;i++) {
    grain^=grain<<13; grain^=grain>>>17; grain^=grain<<5;
    const v=grain>>>0;
    ctx.fillStyle=i%2?'#89915e':'#626e42'; ctx.fillRect(v%128,(v>>>8)%128,1,2);
  }
  const grassTex=track(new THREE.CanvasTexture(grassCanvas)); grassTex.colorSpace=THREE.SRGBColorSpace;
  grassTex.wrapS=grassTex.wrapT=THREE.RepeatWrapping;
  const grassMat = track(new THREE.MeshStandardMaterial({roughness:1,map:grassTex}));
  shapeMesh(grass,grassMat,-.005,.1);
  shapeMesh(rect(p.minX,p.streetZ-5,end,p.streetZ),sidewalkMat,0,.16);
  // Walk across the driveway drops to pavement level, without a curb barrier.
  shapeMesh(rect(end,p.streetZ-5,p.maxX,p.streetZ),sidewalkMat,-.075);

  const curbMat = track(new THREE.MeshStandardMaterial({color:'#6d6a60',roughness:.85,map:sidewalkMat.map}));
  function curb(path: THREE.Path, width=.4) {
    const points=path.getPoints(36);
    const outer: THREE.Vector2[] = [], inner: THREE.Vector2[] = [];
    points.forEach((v,i)=>{
      const d=points[Math.min(i+1,points.length-1)].clone().sub(points[Math.max(0,i-1)]).normalize();
      const n=new THREE.Vector2(-d.y,d.x).multiplyScalar(width/2);
      outer.push(v.clone().add(n)); inner.push(v.clone().sub(n));
    });
    shapeMesh(new THREE.Shape([...outer,...inner.reverse()]),curbMat,.035,.2);
  }
  // Building walk edge leaves a six-foot opening at the entrance ramp.
  for (const side of [-1,1]) {
    const x=side<0?p.left:p.right;
    const path=new THREE.Path(); path.moveTo(x,-p.rearZ); path.lineTo(x,-(p.nearZ-3));
    path.quadraticCurveTo(x,-p.nearZ,x-side*3,-p.nearZ);
    path.lineTo(p.centerX+side*3,-p.nearZ); curb(path);
  }
  const edge=new THREE.Path(); edge.moveTo(p.minX,-p.rearZ); edge.lineTo(p.minX,-(p.farZ-radius));
  edge.quadraticCurveTo(p.minX,-p.farZ,p.minX+radius,-p.farZ); edge.lineTo(end-radius,-p.farZ);
  edge.quadraticCurveTo(end,-p.farZ,end,-(p.farZ+radius)); edge.lineTo(end,-(p.streetZ-5)); curb(edge);
  const rightEdge=new THREE.Path(); rightEdge.moveTo(p.maxX,-p.rearZ); rightEdge.lineTo(p.maxX,-p.streetZ); curb(rightEdge);
  for (const [a,b] of [[p.minX-70,end],[p.maxX,p.maxX+70]]) {
    shapeMesh(rect(a,p.streetZ,b,p.streetZ+2),sidewalkMat,-.075);
    const path=new THREE.Path(); path.moveTo(a,-p.streetZ); path.lineTo(b,-p.streetZ); curb(path);
  }
  // Sloped concrete ties the flush entrance threshold to the lower asphalt.
  const ramp = new THREE.PlaneGeometry(6,5,1,1); ramp.rotateX(-Math.PI/2);
  const rp=ramp.getAttribute('position');
  for(let i=0;i<rp.count;i++) rp.setY(i,-.09*(rp.getZ(i)+2.5)/5);
  ramp.translate(p.centerX,0,p.nearZ+2.5); ramp.computeVertexNormals();
  const rampUV = ramp.getAttribute('uv'), repeat = sidewalkMat.map?.repeat;
  for (let i=0; i<rp.count; i++) rampUV.setXY(i,rp.getX(i)/4.5/(repeat?.x||1),-rp.getZ(i)/4.5/(repeat?.y||1));
  const concrete=batches.get(sidewalkMat)||[]; concrete.push(ramp); batches.set(sidewalkMat,concrete);

  // One paint batch, including the central pedestrian aisle's diagonal hatching.
  const paint = track(new THREE.MeshStandardMaterial({color:'#dfdfd3',roughness:.95}));
  const lines: THREE.BufferGeometry[] = []; const seen = new Set<string>();
  function line(x: number,z: number,length: number,yaw: number) {
    const key=[x,z,yaw].map(v=>v.toFixed(3)).join(':'); if(seen.has(key))return; seen.add(key);
    const g=new THREE.PlaneGeometry(.24,length);g.rotateX(-Math.PI/2);g.rotateY(yaw);g.translate(x,-.082,z);lines.push(g);
  }
  for(const s of p.spaces) {
    for(const side of [-1,1]) line(s.x+Math.cos(s.yaw)*side*p.stallWidth/2,s.z-Math.sin(s.yaw)*side*p.stallWidth/2,p.stallDepth-.8,s.yaw);
  }
  for(let z=p.nearZ+8;z<p.nearZ+p.stallDepth-1;z+=2) line(p.centerX,z,7,-Math.PI/4);
  batches.set(paint,lines);
  for(const [mat,geos] of batches) {
    const expanded=geos.map(g=>g.index?g.toNonIndexed():g);
    const merged=mergeGeometries(expanded);
    new Set([...geos,...expanded]).forEach(g=>g.dispose());
    if(!merged) throw new Error('Parking surface batch failed');
    const mesh=new THREE.Mesh(track(merged),mat);mesh.receiveShadow=true;group.add(mesh);
  }
  return {dispose(){owned.forEach(o=>o.dispose());group.removeFromParent();}};
}
