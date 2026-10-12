import * as THREE from 'three';
import type { FixtureContext } from '../fixtures';
import type { FixturePlacement } from '../store-layout';
import { createWallStripeTexture, wallStripe1990Top, WALL_STRIPE_1990_HEIGHT } from '../wall-stripe-1990';

/** A continuous painted structural column, with the room's stripe at the same height. */
export function buildPaintedColumn1990(ctx: FixtureContext, placement: FixturePlacement, side: number) {
  const group = new THREE.Group();
  group.name = 'painted-column-1990';
  group.position.set(placement.position.x, 0, placement.position.z);
  group.rotation.y = placement.yaw ?? 0;
  const stripe = createWallStripeTexture();
  const white = new THREE.MeshStandardMaterial({ color: ctx.activeTheme.palette.wall, roughness: .92 });
  const paint = new THREE.MeshStandardMaterial({ map: stripe, roughness: .92 });
  const top = wallStripe1990Top(ctx.ceilingY), bottom = top - WALL_STRIPE_1990_HEIGHT;
  // One welded shell, with material boundaries cut into its four faces. No
  // mirror frame, raised trim or floating strip around the white plaster.
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const corners = [[-side/2, side/2], [side/2, side/2], [side/2, -side/2], [-side/2, -side/2]];
  const geometry = new THREE.BufferGeometry();
  for (const [lo, hi, material] of [[0,bottom,0],[bottom,top,1],[top,ctx.ceilingY,0]]) {
    const start = indices.length;
    for (let face=0; face<4; face++) {
      const a=corners[face], b=corners[(face+1)%4], offset=positions.length/3;
      positions.push(a[0],lo,a[1], b[0],lo,b[1], b[0],hi,b[1], a[0],hi,a[1]);
      uvs.push(0,0,1,0,1,1,0,1);
      indices.push(offset,offset+1,offset+2,offset,offset+2,offset+3);
    }
    geometry.addGroup(start, indices.length-start, material);
  }
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  const column=new THREE.Mesh(geometry,[white,paint]);
  column.castShadow=column.receiveShadow=true;group.add(column);
  ctx.scene.add(group);ctx.addCollider(group);
  return {group, dispose:()=>{geometry.dispose();white.dispose();paint.dispose();stripe.dispose();}};
}
