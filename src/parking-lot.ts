import * as THREE from 'three';
import { selfLit } from './material-lighting';
import { createMatchedPavement } from './matched-pavement';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { roadSpan, type ParkingLayout } from './parking-layout';
import { aniso } from './canvas-textures';

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
      const repeat = mat === sidewalkMat || mat === outerWalkMat ? sidewalkMat.map?.repeat : null;
      const tileSize=mat===asphaltMat?8:4.5;
      uv.setXY(i, pos.getX(i)/tileSize/(repeat?.x || 1), -pos.getZ(i)/tileSize/(repeat?.y || 1));
    }
    if (mat === outerCurbMat) {
      // Unlit curbs carry their own shading: the riser reads darker than the top.
      const normal = geo.getAttribute('normal'), shade: number[] = [];
      for (let i=0; i<normal.count; i++) { const s = normal.getY(i) > .5 ? 1 : .55; shade.push(s, s, s); }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(shade, 3));
    }
    const list = batches.get(mat) || []; list.push(geo); batches.set(mat, list);
  }
  function rect(x0: number, z0: number, x1: number, z1: number) {
    const s = new THREE.Shape(); s.moveTo(x0,-z0); s.lineTo(x1,-z0); s.lineTo(x1,-z1); s.lineTo(x0,-z1); s.closePath(); return s;
  }
  // A continuous U-shaped apron wraps the freestanding building. Asphalt is
  // below its slab and the street-side grass, with the right driveway open.
  const pavement = track(createMatchedPavement());
  const asphaltMat = pavement.material;
  const shadows = track(selfLit(new THREE.ShadowMaterial({opacity:.35,depthWrite:false,fog:false}), 'shadow'));
  shadows.name = 'panorama-parking-shadows';
  // GH #398: past the building apron the walks, curbs and verges belong to the
  // far field the photograph lights. Like the asphalt they take its sampled
  // ground tone, at fixed linear albedo ratios measured off the afternoon
  // render, instead of the scene lights: those disagree with the photograph by
  // time of day and quality tier (the phone preset lit these near-white at
  // night beside sodium-dark asphalt).
  const matched: {mat: THREE.MeshBasicMaterial; ratio: THREE.Color; mean: THREE.Color}[] = [];
  function matchedSurface(map: THREE.Texture | null, ratio: [number, number, number], vertexColors = false) {
    const mat = track(selfLit(new THREE.MeshBasicMaterial({map, vertexColors, toneMapped:false, fog:false}), 'baked-backdrop'));
    matched.push({mat, ratio: new THREE.Color(...ratio), mean: imageMean(map?.image)});
    return mat;
  }
  function tintMatched(ground: THREE.Color) {
    for (const {mat, ratio, mean} of matched) mat.color.setRGB(ground.r*ratio.r/mean.r, ground.g*ratio.g/mean.g, ground.b*ratio.b/mean.b);
  }
  const outerWalkMat = matchedSurface(sidewalkMat.map, [2.35, 2.26, 1.9]);
  const outerCurbMat = matchedSurface(sidewalkMat.map, [2.1, 2, 1.7], true);
  for (const mat of [asphaltMat, shadows]) {
    const y = mat === shadows ? -.087 : -.09;
    shapeMesh(rect(p.minX,p.rearZ,p.maxX,p.farZ),mat,y);
    shapeMesh(rect(p.drivewayMinX,p.farZ,p.maxX,p.streetZ+2),mat,y);
  }
  // The through street shares the lot's asphalt batch and tile (exterior-road.ts
  // adds only its centerline when the lot supplies the edges).
  const street = roadSpan(p.minX, p.maxX, p.streetZ), border = 10;
  shapeMesh(rect(street.minX,street.nearZ,street.maxX,street.farZ),asphaltMat,-.09);
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
  // Sun-faded turf: an olive base with dry and shaded blades, matched to the
  // photograph's verges rather than a lawn green (GH #398).
  const ctx=grassCanvas.getContext('2d')!; ctx.fillStyle='#5f6840'; ctx.fillRect(0,0,128,128);
  let grain=1709;
  for(let i=0;i<6144;i++) {
    grain^=grain<<13; grain^=grain>>>17; grain^=grain<<5;
    const v=grain>>>0;
    ctx.fillStyle=['#737a4e','#4b5432','#6b6a45'][i%3]; ctx.fillRect(v%128,(v>>>8)%128,1,2);
  }
  const grassTex=track(new THREE.CanvasTexture(grassCanvas)); grassTex.colorSpace=THREE.SRGBColorSpace;
  grassTex.wrapS=grassTex.wrapT=THREE.RepeatWrapping; grassTex.anisotropy=aniso(16);
  const grassMat = matchedSurface(grassTex, [.87, 1.09, .49]);
  shapeMesh(grass,grassMat,-.005,.1);
  // GH #398: the lot reads as a bounded pad. Planted strips outside the side
  // and rear curbs, and a public walk along the whole street on both sides,
  // end every edge on something real before the ground surround takes over.
  for (const [x0, x1] of [[p.minX-border,p.minX],[p.maxX,p.maxX+border]]) shapeMesh(rect(x0,p.rearZ-border,x1,p.streetZ-5),grassMat,-.005,.1);
  shapeMesh(rect(p.minX,p.rearZ-border,p.maxX,p.rearZ),grassMat,-.005,.1);
  shapeMesh(rect(street.minX,p.streetZ-5,end,p.streetZ),outerWalkMat,0,.16);
  shapeMesh(rect(p.maxX,p.streetZ-5,street.maxX,p.streetZ),outerWalkMat,0,.16);
  // Walk across the driveway drops to pavement level, without a curb barrier.
  shapeMesh(rect(end,p.streetZ-5,p.maxX,p.streetZ),outerWalkMat,-.075);
  // Far side of the street: gutter pan, curb, walk and verge.
  shapeMesh(rect(street.minX,street.farZ,street.maxX,street.farZ+1.6),outerWalkMat,-.075);
  shapeMesh(rect(street.minX,street.farZ+2,street.maxX,street.farZ+7),outerWalkMat,0,.16);
  shapeMesh(rect(street.minX,street.farZ+7,street.maxX,street.farZ+15),grassMat,-.005,.1);

  const curbMat = track(new THREE.MeshStandardMaterial({color:'#6d6a60',roughness:.85,map:sidewalkMat.map}));
  function curb(path: THREE.Path, mat: THREE.Material = outerCurbMat, width=.4) {
    const points=path.getPoints(36);
    const outer: THREE.Vector2[] = [], inner: THREE.Vector2[] = [];
    points.forEach((v,i)=>{
      const d=points[Math.min(i+1,points.length-1)].clone().sub(points[Math.max(0,i-1)]).normalize();
      const n=new THREE.Vector2(-d.y,d.x).multiplyScalar(width/2);
      outer.push(v.clone().add(n)); inner.push(v.clone().sub(n));
    });
    shapeMesh(new THREE.Shape([...outer,...inner.reverse()]),mat,.035,.2);
  }
  // Building walk edge leaves a six-foot opening at the entrance ramp.
  for (const side of [-1,1]) {
    const x=side<0?p.left:p.right;
    const path=new THREE.Path(); path.moveTo(x,-p.rearZ); path.lineTo(x,-(p.nearZ-3));
    path.quadraticCurveTo(x,-p.nearZ,x-side*3,-p.nearZ);
    path.lineTo(p.centerX+side*3,-p.nearZ); curb(path, curbMat);
  }
  const edge=new THREE.Path(); edge.moveTo(p.minX,-p.rearZ); edge.lineTo(p.minX,-(p.farZ-radius));
  edge.quadraticCurveTo(p.minX,-p.farZ,p.minX+radius,-p.farZ); edge.lineTo(end-radius,-p.farZ);
  edge.quadraticCurveTo(end,-p.farZ,end,-(p.farZ+radius)); edge.lineTo(end,-(p.streetZ-5)); curb(edge);
  const rightEdge=new THREE.Path(); rightEdge.moveTo(p.maxX,-p.rearZ); rightEdge.lineTo(p.maxX,-p.streetZ); curb(rightEdge);
  const rearEdge=new THREE.Path(); rearEdge.moveTo(p.minX,-p.rearZ); rearEdge.lineTo(p.maxX,-p.rearZ); curb(rearEdge);
  for (const [a,b] of [[street.minX,end],[p.maxX,street.maxX]]) {
    shapeMesh(rect(a,p.streetZ,b,p.streetZ+2),outerWalkMat,-.075);
    const path=new THREE.Path(); path.moveTo(a,-p.streetZ); path.lineTo(b,-p.streetZ); curb(path);
  }
  const farCurb=new THREE.Path(); farCurb.moveTo(street.minX,-(street.farZ+1.8)); farCurb.lineTo(street.maxX,-(street.farZ+1.8)); curb(farCurb);
  // Sloped concrete ties the flush entrance threshold to the lower asphalt.
  const ramp = new THREE.PlaneGeometry(6,5,1,1); ramp.rotateX(-Math.PI/2);
  const rp=ramp.getAttribute('position');
  for(let i=0;i<rp.count;i++) rp.setY(i,-.09*(rp.getZ(i)+2.5)/5);
  ramp.translate(p.centerX,0,p.nearZ+2.5); ramp.computeVertexNormals();
  const rampUV = ramp.getAttribute('uv'), repeat = sidewalkMat.map?.repeat;
  for (let i=0; i<rp.count; i++) rampUV.setXY(i,rp.getX(i)/4.5/(repeat?.x||1),-rp.getZ(i)/4.5/(repeat?.y||1));
  const concrete=batches.get(sidewalkMat)||[]; concrete.push(ramp); batches.set(sidewalkMat,concrete);

  // One paint batch, including the central pedestrian aisle's diagonal hatching.
  // The asphalt carries the photograph's light, so the stripes follow it: full
  // white under the afternoon reference, dimmer and sodium-warm at night. The
  // square root keeps night stripes about as far above the asphalt as by day
  // (GH #398).
  const paintWhite = new THREE.Color('#dfdfd3'), dayGround = new THREE.Color().setRGB(.44,.414,.392,THREE.SRGBColorSpace);
  const paint = track(new THREE.MeshStandardMaterial({color:paintWhite,roughness:.95}));
  const lit = (ground: number, reference: number) => Math.min(1.05, Math.sqrt(ground / reference));
  function setGroundColor(color: THREE.Color) {
    pavement.setColor(color); tintMatched(color);
    paint.color.setRGB(paintWhite.r*lit(color.r,dayGround.r),paintWhite.g*lit(color.g,dayGround.g),paintWhite.b*lit(color.b,dayGround.b));
  }
  const lines: THREE.BufferGeometry[] = []; const seen = new Set<string>();
  function line(x: number,z: number,length: number,yaw: number) {
    const key=[x,z,yaw].map(v=>v.toFixed(3)).join(':'); if(seen.has(key))return; seen.add(key);
    // Four-inch striping: the period standard, and wide enough to hold up at distance.
    const g=new THREE.PlaneGeometry(.33,length);g.rotateX(-Math.PI/2);g.rotateY(yaw);g.translate(x,-.082,z);lines.push(g);
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
  tintMatched(new THREE.Color('#80766b')); // createMatchedPavement's tone until a photograph is sampled
  return {setGroundColor, dispose(){owned.forEach(o=>o.dispose());group.removeFromParent();}};
}

/** Mean linear color of a texture image, so a matched surface averages to the tone it is given. */
function imageMean(image: unknown): THREE.Color {
  const mean = new THREE.Color(1, 1, 1);
  if (!image || typeof document === 'undefined') return mean;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
  const ctx = canvas.getContext('2d');
  if (!ctx) return mean;
  ctx.drawImage(image as CanvasImageSource, 0, 0, 16, 16);
  const px = ctx.getImageData(0, 0, 16, 16).data; let r = 0, g = 0, b = 0;
  for (let i = 0; i < px.length; i += 4) { r += px[i]; g += px[i+1]; b += px[i+2]; }
  mean.setRGB(r/256/255, g/256/255, b/256/255, THREE.SRGBColorSpace);
  return mean.setRGB(Math.max(mean.r, .001), Math.max(mean.g, .001), Math.max(mean.b, .001));
}
