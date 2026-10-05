/** Only the request still registered for a key may publish or retire it.
 * Identity survives shared callback fan-out and rejects work cleared/replaced
 * while decode or a deferred upload was in flight.
 */
export function guardPosterRequest<Key, Request, Args extends unknown[]>(
  requests: ReadonlyMap<Key, Request>, key: Key, request: Request,
  commit: (...args: Args) => void,
): (...args: Args) => void {
  return (...args) => { if (requests.get(key) === request) commit(...args); };
}
