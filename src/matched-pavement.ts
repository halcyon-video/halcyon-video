import * as THREE from 'three';
import { selfLit } from './material-lighting';
import { tryLoadUserAssetTexture } from './user-assets';
import { aniso } from './canvas-textures';

// One 8 ft tile of seeded asphalt (GH #398): fine grain, sparse light and dark
// aggregate and a faint periodic mottle, normalized to a mean of one so the
// tile still averages to the photograph's sampled color. Shared by every
// instance; only the color multiply is per material.
const TILE_TEXELS = 256;
let pavementField: Float32Array | null = null;
function asphaltField(): Float32Array {
  if (pavementField) return pavementField;
  const size = TILE_TEXELS, field = new Float32Array(size * size);
  let seed = 731;
  const rand = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  // Periodic value noise: cells of 2, 1, .5 and .25 ft, wrapping at the tile edge.
  const octaves = ([[4, .022], [8, .018], [16, .014], [32, .01]] as const).map(([n, amp]) => {
    const lattice = new Float32Array(n * n);
    for (let i = 0; i < lattice.length; i++) lattice[i] = rand() * 2 - 1;
    return { n, amp, lattice };
  });
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 1;
    for (const { n, amp, lattice } of octaves) {
      const fx = x / size * n, fy = y / size * n, x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const at = (i: number, j: number) => lattice[(j % n) * n + (i % n)];
      const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
      v += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
    }
    v += (rand() - .5) * .08;
    const stone = rand();
    if (stone < .025) v += .14; else if (stone > .975) v -= .16;
    field[y * size + x] = v;
  }
  let mean = 0;
  for (const v of field) mean += v;
  mean /= field.length;
  for (let i = 0; i < field.length; i++) field[i] /= mean;
  return pavementField = field;
}

// Constant world-scale pavement, color matched to the selected surroundings.
export function createMatchedPavement() {
  const size=TILE_TEXELS,data=new Uint8Array(size*size*4),field=asphaltField();
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.anisotropy=aniso(16);
  const material=selfLit(new THREE.MeshBasicMaterial({map:texture,toneMapped:false,fog:false}),'baked-backdrop');
  material.name='photograph-matched-pavement';
  const srgb=new THREE.Color(),target=new THREE.Color('#80766b'),mean=new THREE.Color(.5,.5,.5),repeat=new THREE.Vector2(1,1);
  let tile:THREE.Texture|null=null,disposed=false;
  function setColor(color:THREE.Color){
    target.copy(color);
    if(tile){material.color.setRGB(target.r/Math.max(mean.r,.001),target.g/Math.max(mean.g,.001),target.b/Math.max(mean.b,.001));return;}
    color.getRGB(srgb,THREE.SRGBColorSpace);
    for(let i=0;i<size*size;i++){
      const grain=field[i],at=i*4;
      data[at]=Math.round(Math.min(1,srgb.r*grain)*255);data[at+1]=Math.round(Math.min(1,srgb.g*grain)*255);data[at+2]=Math.round(Math.min(1,srgb.b*grain)*255);data[at+3]=255;
    }
    texture.needsUpdate=true;
  }
  function setRepeat(x:number,y:number){repeat.set(x,y);texture.repeat.copy(repeat);tile?.repeat.copy(repeat);}
  setColor(target);
  tryLoadUserAssetTexture('environments/outside/ground/pavement.png',loaded=>{
    if(disposed){loaded.dispose();return;}
    const canvas=document.createElement('canvas');canvas.width=canvas.height=16;
    const context=canvas.getContext('2d');
    if(context){context.drawImage(loaded.image as HTMLImageElement,0,0,16,16);const pixels=context.getImageData(0,0,16,16).data;let r=0,g=0,b=0;
      for(let i=0;i<pixels.length;i+=4){r+=pixels[i];g+=pixels[i+1];b+=pixels[i+2];}
      mean.setRGB(r/256/255,g/256/255,b/256/255,THREE.SRGBColorSpace);
    }
    tile=loaded;tile.wrapS=tile.wrapT=THREE.RepeatWrapping;tile.repeat.copy(repeat);tile.anisotropy=16;
    material.map=tile;material.needsUpdate=true;setColor(target);
  });
  return {material,setColor,setRepeat,dispose(){disposed=true;texture.dispose();tile?.dispose();material.dispose();}};
}
