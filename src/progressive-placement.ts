/** Per-frame admission budget for initial instance matrices, excluding animation. */
export function placementBudget(now = () => performance.now(), limit = 96, milliseconds = 2): () => boolean {
  let deadline = 0;
  let count = 0;
  return () => {
    if (count >= limit) return false;
    const t = now();
    if (count === 0) deadline = t + milliseconds;
    else if (t >= deadline) return false;
    count++;
    return true;
  };
}

import { Vector3, type Camera } from 'three';
import type { MovieSlot } from './store-layout.ts';
const viewPoint = new Vector3();
function placementDistance(slot:MovieSlot,eye:{x:number;y:number;z:number}) { return (slot.restingX-eye.x)**2+(slot.restingY-eye.y)**2+(slot.restingZ-eye.z)**2; }
const placementOrders = new WeakMap<Set<MovieSlot>, { order: MovieSlot[]; visible: Set<MovieSlot> }>();
/** Visible retail fronts should appear before distant stock when the customer
 * approaches a shelf. Rental repeats are already baked; insertion-order drains
 * otherwise leave an approached late-platform bay showing only those repeats.
 * Reuse scratch storage and keep the caller's existing time/count admission.
 */
export function prioritizeInitialPlacements(slots: Set<MovieSlot>, camera: Camera): MovieSlot[] {
  let state = placementOrders.get(slots);
  if (!state) { state={order:[],visible:new Set()}; placementOrders.set(slots,state); }
  const { order, visible } = state; order.length=0; visible.clear();
  camera.updateMatrixWorld();
  const eye=camera.position;

  for (const slot of slots) {
    if (!slot.needsInitialMatrixUpdate || slot.hidden || placementDistance(slot,eye)>900) continue;
    viewPoint.set(slot.restingX,slot.restingY,slot.restingZ).project(camera);
    if (viewPoint.z < -1 || viewPoint.z > 1 || Math.abs(viewPoint.x)>1.3 || Math.abs(viewPoint.y)>1.3) continue;
    const d=placementDistance(slot,eye);
    // Keep only the nearest admission window; never sort the full catalog.
    if (order.length===96 && d>=placementDistance(order[95],eye)) continue;
    let low=0,high=order.length;
    while(low<high) {const mid=(low+high)>>>1;if(placementDistance(order[mid],eye)<=d)low=mid+1;else high=mid;}
    order.length=Math.min(96,order.length+1);
    for(let i=order.length-1;i>low;i--)order[i]=order[i-1];
    order[low]=slot;
  }
  for(const slot of order)visible.add(slot);
  for (const slot of slots) if (!visible.has(slot)) order.push(slot);
  return order;
}
