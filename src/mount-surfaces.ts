// Named mount surfaces (T-mount-surfaces): a small, plain-math registry so
// "put this on the window" or "put this on the counter" is a data lookup
// against a named surface instead of hand-derived world coordinates baked
// into call sites. No THREE imports — this is pure geometry so it can be
// unit-tested and read without pulling in the renderer.
//
// A MountSurface is a flat rectangle in world space: `origin` is its
// bottom-left corner, `uDir`/`vDir` are unit vectors spanning its width/height,
// and `normal` is the outward-facing unit vector (the direction whatever is
// mounted on it should face). place(u, v, offset) returns a world position on
// (or pushed off) that rectangle plus a yaw for orienting the mounted object.
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface MountSurface {
  id: string;                // 'window-bay-0', 'counter-top', 'wall-back'
  origin: Vec3;               // bottom-left corner, world feet
  uDir: Vec3;                 // unit vector along width
  vDir: Vec3;                 // unit vector along height
  normal: Vec3;                // outward-facing unit normal
  width: number;
  height: number;              // feet
}

export interface MountPose {
  position: Vec3;
  yaw: number;
}

export class SurfaceRegistry {
  private surfaces = new Map<string, MountSurface>();

  register(s: MountSurface): void {
    this.surfaces.set(s.id, s);
  }

  get(id: string): MountSurface | undefined {
    return this.surfaces.get(id);
  }

  ids(): string[] {
    return Array.from(this.surfaces.keys());
  }

  // Pose for an object mounted at (u,v) on the surface, pushed out `offset`
  // ft along the normal. yaw = heading of `normal` in the scene's convention
  // (same atan2(x,z) convention as FixturePlacement.yaw — a horizontal
  // normal gives a meaningful facing direction; a vertical normal, like
  // counter-top's, degenerates to 0 and isn't meant to be used as an
  // orientation source for that surface).
  place(id: string, u: number, v: number, offset: number = 0): MountPose | null {
    const s = this.surfaces.get(id);
    if (!s) {
      console.error(`[mount] place() called with unknown surface id "${id}"`);
      return null;
    }

    let cu = u;
    if (cu < 0 || cu > s.width) {
      console.warn(`[mount] surface "${id}": u=${u} out of [0, ${s.width}], clamping`);
      cu = Math.min(Math.max(cu, 0), s.width);
    }
    let cv = v;
    if (cv < 0 || cv > s.height) {
      console.warn(`[mount] surface "${id}": v=${v} out of [0, ${s.height}], clamping`);
      cv = Math.min(Math.max(cv, 0), s.height);
    }

    const position: Vec3 = {
      x: s.origin.x + s.uDir.x * cu + s.vDir.x * cv + s.normal.x * offset,
      y: s.origin.y + s.uDir.y * cu + s.vDir.y * cv + s.normal.y * offset,
      z: s.origin.z + s.uDir.z * cu + s.vDir.z * cv + s.normal.z * offset,
    };
    const yaw = Math.atan2(s.normal.x, s.normal.z);

    return { position, yaw };
  }
}
