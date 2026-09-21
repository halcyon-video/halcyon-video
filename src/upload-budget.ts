/** Cooperative work cannot preempt a driver call; admit bounded steps before the deadline. */
export type UploadStep = () => void | boolean; // false: more bounded work remains
export function drainUploadSteps(queue: UploadStep[], now: () => number, deadline: number,
  maxSteps: number, estimateMs = 0.5): number {
  let count = 0;
  while (queue.length && count < maxSteps && now() + estimateMs <= deadline) {
    const start = now();
    let complete = true;
    try { complete = queue[0]() !== false; }
    catch (err) { console.warn('Texture upload task failed:', err); }
    if (complete) queue.shift();
    count++;
    estimateMs = Math.max(0.25, now() - start, estimateMs);
  }
  return count;
}
