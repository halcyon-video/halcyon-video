// Props that react when the walking player is stopped by store geometry —
// feedback pin 272: the counter pumpkin hops a little when bumped. The walk
// loop calls notifyWalkBlocked() only on frames where the collision clamp
// actually changed the requested step, with the stopped eye position; each
// listener decides whether that stop was against ITS prop. No allocation per
// call, and an empty list costs one loop test.
type WalkBlockedListener = (x: number, z: number) => void;

const listeners: WalkBlockedListener[] = [];

export function onWalkBlocked(listener: WalkBlockedListener): () => void {
  listeners.push(listener);
  return () => {
    const i = listeners.indexOf(listener);
    if (i >= 0) listeners.splice(i, 1);
  };
}

export function notifyWalkBlocked(x: number, z: number): void {
  for (let i = 0; i < listeners.length; i++) listeners[i](x, z);
}
