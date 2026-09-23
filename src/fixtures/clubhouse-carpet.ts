import * as THREE from 'three';
import { neutralizeScanTexture } from '../canvas-textures';
import { formatCarpetHex } from '../format-surfaces';
import { onBrandChange } from '../brand-live';
import type { FixtureContext } from '../fixtures';
import { coordinateClubhouseCarpetHex } from './clubhouse-carpet-color';

/** Same weave, world UVs and contact shadows as the floor, with the nook's own dye. */
export function installClubhouseCarpet(ctx: FixtureContext, root: THREE.Group): () => void {
  const floor = ctx.scene.getObjectByName('store-floor') as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial> | undefined;
  if (!floor) return () => {};
  const shape = new THREE.Shape();
  const points = [[-6.775,-6.775],[6.775,-6.775],[6.775,1.22],[1.22,6.775],[-6.775,6.775]];
  points.forEach(([x,z],i) => i ? shape.lineTo(x,-z) : shape.moveTo(x,-z));shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);geometry.rotateX(-Math.PI/2);
  const pos=geometry.getAttribute('position'),uv=geometry.getAttribute('uv');
  const {width,height}=floor.geometry.parameters;
  for(let i=0;i<pos.count;i++)uv.setXY(i,(pos.getX(i)+root.position.x-floor.position.x)/width+.5,
    .5-(pos.getZ(i)+root.position.z-floor.position.z)/height);
  geometry.setAttribute('uv1',uv.clone());
  const material=floor.material.clone();material.name='ClubhouseCarpet';
  material.polygonOffset=true;material.polygonOffsetFactor=-1;material.polygonOffsetUnits=-1;
  material.onBeforeCompile=floor.material.onBeforeCompile;
  material.customProgramCacheKey=floor.material.customProgramCacheKey;
  let source: THREE.Texture|null=null, neutral: THREE.CanvasTexture|null=null;
  const sync=()=>{
    const base=floor.material;
    if(source!==base.map){source=base.map;neutral?.dispose();neutral=source?neutralizeScanTexture(source):null;material.map=neutral;material.needsUpdate=true;}
    if(material.normalMap!==base.normalMap||material.roughnessMap!==base.roughnessMap||material.aoMap!==base.aoMap){
      material.normalMap=base.normalMap;material.roughnessMap=base.roughnessMap;material.aoMap=base.aoMap;material.needsUpdate=true;
    }
    material.normalScale.copy(base.normalScale);material.roughness=base.roughness;
    material.aoMapIntensity=base.aoMapIntensity;
  };
  const dye=()=>{material.color.set(coordinateClubhouseCarpetHex(formatCarpetHex()));ctx.requestRender();};
  const carpet=new THREE.Mesh(geometry,material);carpet.name='clubhouse-contrasting-carpet';
  carpet.position.y=floor.position.y+.003;carpet.receiveShadow=true;carpet.onBeforeRender=sync;root.add(carpet);
  sync();dye();const unsubscribe=onBrandChange(dye);
  return ()=>{unsubscribe();carpet.removeFromParent();geometry.dispose();neutral?.dispose();material.dispose();};
}
