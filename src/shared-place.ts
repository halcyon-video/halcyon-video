// Public URL contract for sharing a place in the store (issue #137). A link
// carries a VIEWPOINT, never a person -- no visitor identity, no telemetry,
// just enough state to replay through the same jumpToTitle / teleportWalk
// checkpoints every dev screenshot already uses (src/store-camera.ts). Two
// shapes only, matched to those two entry points:
//   ?title=<name>[&flip=1]   -- inspecting one case (jumpToTitle)
//   ?walk=x,z,yaw,pitch,y    -- standing somewhere in the store (teleportWalk)
// Deliberately NOT the private harness's ?state=/?lib=/bb_* surface -- this
// is the two-parameter subset of that contract that is safe to publish.
// Dependency-free like demo-mode.ts so any module can import it without
// creating cycles.

export interface SharedPlaceTitle {
  kind: 'title';
  title: string;
  flip: boolean;
}

export interface SharedPlaceWalk {
  kind: 'walk';
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  y: number;
}

export type SharedPlace = SharedPlaceTitle | SharedPlaceWalk;

/** Reads `title`/`flip` or `walk` off a query string into a SharedPlace, or null if absent/malformed. */
export function parseSharedPlace(search?: string): SharedPlace | null {
  const raw = search ?? (typeof location !== 'undefined' ? location.search : '');
  const params = new URLSearchParams(raw);

  const title = params.get('title');
  if (title && title.trim()) {
    return { kind: 'title', title: title.trim(), flip: params.get('flip') === '1' };
  }

  const walk = params.get('walk');
  if (walk) {
    const parts = walk.split(',').map((p) => Number(p.trim()));
    if (parts.length >= 2 && parts.every((n) => Number.isFinite(n))) {
      const [x, z, yaw = 0, pitch = 0, y = 5.5] = parts;
      return { kind: 'walk', x, z, yaw, pitch, y };
    }
  }

  return null;
}

/** Builds a shareable absolute URL (current origin+path) for inspecting a title. */
export function buildTitleShareUrl(title: string, flip: boolean): string {
  const params = new URLSearchParams();
  params.set('title', title);
  if (flip) params.set('flip', '1');
  return `${location.origin}${location.pathname}?${params.toString()}`;
}

/** Builds a shareable absolute URL (current origin+path) for a standing camera pose. */
export function buildWalkShareUrl(x: number, z: number, yaw: number, pitch: number, y: number): string {
  const params = new URLSearchParams();
  params.set('walk', [x, z, yaw, pitch, y].map((n) => n.toFixed(2)).join(','));
  return `${location.origin}${location.pathname}?${params.toString()}`;
}

/** Builds a shareable absolute URL for whichever SharedPlace shape was captured. */
export function buildShareUrl(place: SharedPlace): string {
  return place.kind === 'title'
    ? buildTitleShareUrl(place.title, place.flip)
    : buildWalkShareUrl(place.x, place.z, place.yaw, place.pitch, place.y);
}
