/** Per-frame admission budget for initial instance matrices, excluding animation. */
export function placementBudget(now = () => performance.now(), limit = 96, milliseconds = 2): () => boolean {
  const deadline = now() + milliseconds;
  let count = 0;
  return () => count < limit && now() < deadline ? (++count, true) : false;
}
