// Byte-budgeted LRU cache with a Map-compatible surface (get/has/set/delete/
// clear) so it drops in wherever a plain `Map<string, Uint8Array>` was used
// directly, including call sites in OTHER modules that reach for
// `.get()`/`.has()`/`.set()` on an exported cache without going through this
// file at all.
//
// Recency is Map insertion order, the same zero-dependency idiom already
// used elsewhere in this codebase (video-case.ts's caseMaterialLRU /
// heroPosterTextureLRU): a hit re-inserts the entry (delete + set), moving it
// to the newest end; eviction always takes from the oldest end.
//
// The budget is enforced by BYTES (summed from each value's `byteLength`),
// not entry count, so callers whose buffers vary in size still get a real
// memory bound instead of a count that silently means different things
// depending on what's cached.
export class LruByteCache {
  private map = new Map<string, Uint8Array>();
  private bytes = 0;
  private budgetBytes: number;

  constructor(budgetBytes: number) {
    this.budgetBytes = budgetBytes;
  }

  get(key: string): Uint8Array | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    // Refresh recency: delete + re-set moves this entry to the newest end of
    // Map insertion order — the LRU idiom this whole class relies on.
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  set(key: string, value: Uint8Array): void {
    const existing = this.map.get(key);
    if (existing !== undefined) this.bytes -= existing.byteLength;
    this.map.delete(key); // drop first so the set below lands at the newest end
    this.map.set(key, value);
    this.bytes += value.byteLength;
    this.evictOverflow();
  }

  delete(key: string): boolean {
    const existing = this.map.get(key);
    if (existing === undefined) return false;
    this.bytes -= existing.byteLength;
    return this.map.delete(key);
  }

  clear(): void {
    // Drop every reference so the typed arrays are free to be GC'd — nothing
    // in this class holds them anywhere else.
    this.map.clear();
    this.bytes = 0;
  }

  get size(): number {
    return this.map.size;
  }

  /** Current total bytes held. Diagnostics/tests only — not read on any hot path. */
  get byteSize(): number {
    return this.bytes;
  }

  /** Re-applies a new budget immediately (evicts if the new budget is smaller). */
  setBudget(budgetBytes: number): void {
    this.budgetBytes = budgetBytes;
    this.evictOverflow();
  }

  private evictOverflow(): void {
    // Never evict the sole most-recent entry, even if it alone exceeds
    // budget — a single oversized buffer must not thrash the cache to empty.
    while (this.bytes > this.budgetBytes && this.map.size > 1) {
      const oldestKey = this.map.keys().next().value as string;
      const oldestValue = this.map.get(oldestKey)!;
      this.map.delete(oldestKey); // drop the reference — lets the typed array be GC'd
      this.bytes -= oldestValue.byteLength;
    }
  }
}
