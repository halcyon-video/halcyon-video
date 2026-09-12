import * as THREE from 'three';
import { CLUBHOUSE } from './fixtures/clubhouse-layout';
import { createCeilingTileTexture } from './canvas-textures';

/** Original fitted ceiling construction; inferred dimensions in clubhouse-model.md.
 * The exposed edge meets the room cornice; the other two edges meet real walls.
 */
export function clubhouseSoffitPolygon(left: number, back: number) {
  return [[0,0],[19,0],[19,9],[9,19],[0,19]].map(([x,z])=>({x:left+x,z:back+z}));
}

export function buildClubhouseSoffit(left: number, back: number, ceiling: number,
  lens: THREE.Material, frame: THREE.Material): THREE.Group {
  const root=new THREE.Group();root.name='Clubhouse dropped soffit';
  const poly=clubhouseSoffitPolygon(left,back), shape=new THREE.Shape();
  poly.forEach((p,i)=>i?shape.lineTo(p.x,-p.z):shape.moveTo(p.x,-p.z));shape.closePath();
  // Full solid chase: .2 ft painted return remains below the mirror's 10.8 datum.
  const bodyGeo=new THREE.ExtrudeGeometry(shape,{depth:ceiling-CLUBHOUSE.height,bevelEnabled:false});
  bodyGeo.rotateX(-Math.PI/2);
  const paint=new THREE.MeshStandardMaterial({name:'ClubhouseSoffitPaint',color:0xf0eee7,roughness:.9});
  const body=new THREE.Mesh(bodyGeo,paint);body.position.y=CLUBHOUSE.height;
  body.name='Soffit fascia and wall returns';body.castShadow=body.receiveShadow=true;root.add(body);
  const tiles=createCeilingTileTexture();tiles.wrapS=tiles.wrapT=THREE.RepeatWrapping;tiles.repeat.set(.5,.5);
  tiles.offset.set(-left/2,back/2);
  const tileMat=new THREE.MeshStandardMaterial({name:'ClubhouseCeilingTile',map:tiles,color:0xf4f4f0,roughness:.92,bumpMap:tiles,bumpScale:.01,side:THREE.DoubleSide});
  // Generic shell teardown releases materials; this finish owns its tile map.
  tileMat.addEventListener('dispose',()=>tiles.dispose());
  const underside=new THREE.Mesh(new THREE.ShapeGeometry(shape),tileMat);underside.rotation.x=-Math.PI/2;
  underside.position.y=CLUBHOUSE.height-.006;underside.name='Lower acoustic tile ceiling';underside.receiveShadow=true;root.add(underside);
  // Flush diffusers on the lower grid, including the neighboring shelving bays.
  const trimGeo=new THREE.BoxGeometry(1.98,.06,1.98),lightGeo=new THREE.BoxGeometry(1.82,.025,1.82);
  for(const [x,z] of [[5,5],[3,15],[15,3]]){
    const trim=new THREE.Mesh(trimGeo,frame);trim.position.set(left+x,CLUBHOUSE.height-.035,back+z);root.add(trim);
    const panel=new THREE.Mesh(lightGeo,lens);panel.position.set(left+x,CLUBHOUSE.height-.074,back+z);root.add(panel);
  }
  return root;
}
