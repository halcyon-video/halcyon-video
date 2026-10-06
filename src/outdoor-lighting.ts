import { captureEnvironmentInSlices } from './cube-capture';
// Outside world + interior light energy: the sky dome texture per mode
// (day/night/sunset), the per-visit sun placement, and the baked-environment
// pipeline (PMREM capture of the actual store) that supplies ambient light and
// reflections. StoreScene creates the sun light and sky mesh (they're entangled
// with its shadow and shell setup) and hands them to this rig; everything about
// how the outside looks and how the room is lit by it lives here, so a
// different time-of-day system or sky can be swapped in without touching the
// scene core.
import * as THREE from 'three';
import { panoramaProfile, PANORAMA_ROTATION_Y, type OutsideMode } from './exterior-panorama-profile';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { assetUrl } from './asset-url';
import { tryLoadUserAssetTexture } from './user-assets';
import { buildPartialPanorama } from './partial-panorama';
import { CEILING_Y } from './store-layout';

export type { OutsideMode } from './exterior-panorama-profile';

// Restrained shared bounce preserves contrast between windows and the back.
export const DAY_ENV_DISPLAY_GAIN = 0.7;

export interface OutdoorLightingDeps {
  getScene: () => THREE.Scene;
  getRenderer: () => THREE.WebGLRenderer;
  getBackWallZ: () => number;
  getCeilingY: () => number;
  // The camera headlight — the one DirectionalLight the per-mode traverse must
  // NOT recolor as "the sun".
  getHeadlight: () => THREE.DirectionalLight | null;
  // Extra objects to hide while baking (e.g. the floating selection arrow).
  getBakeHidden: () => THREE.Object3D[];
  // After a re-bake the per-library reflection probes (case-material env maps)
  // were captured under stale lighting — the scene recaptures and re-applies.
  onEnvironmentRebaked: (captureProbes?: boolean) => void;
  // Per-mode interior light retune (e.g. troffer key spots carry the floor at
  // night). Called from updateSkybox BEFORE the re-bake, so the change is
  // folded into the captured environment too.
  onModeLighting?: (mode: OutsideMode) => void;
}

// Parse a numeric localStorage override; null (→ randomize) when unset,
// blank, or unparseable. Kept tolerant so a stray value can't wedge the roll.
function readNumberSetting(key: string): number | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(key);
  if (raw === null || raw.trim() === '') return null;
  const v = parseFloat(raw);
  return Number.isFinite(v) ? v : null;
}

export class OutdoorLightingRig {
  public outsideMode: OutsideMode = 'day';
  // Created by StoreScene (setupLighting / buildStore) and handed over.
  public sunLight: THREE.DirectionalLight | null = null;
  public sunShadowDistance = 100;
  public skyMesh: THREE.Mesh | null = null;
  // The storefront sign PointLight (created by buildStore). Its shadow runs with
  // autoUpdate=false (issue #111 — a PointLight's shadow is 6 cube-face passes that
  // shouldn't be paid on every interior-motion rebake); it's handed over here so a
  // genuine exterior change (day/night reroll) can re-flag a one-shot needsUpdate.
  public logoLight: THREE.PointLight | null = null;

  // Per-entry sun placement — re-rolled every time you "enter" the store
  // (construction and returnToEntrance) so the outside light never sits in the
  // same spot two visits in a row. Azimuth 0 points straight out the front
  // glass (+Z); -90 deg is the left wall (-X), +90 deg the right wall (+X) —
  // the roll spans almost the whole compass, skipping only the wedge directly
  // behind the windowless back wall. Elevation low = golden-hour rake,
  // high = flat noon. The sky sphere is rotated by the same azimuth so the
  // pano's bright side tracks the directional sun (plan item A3).
  private sunAzimuth = 0;
  private sunElevation = Math.PI / 5;
  // Per-visit hue of the low-sun tint: 0 = golden yellow, 1 = deep sunset red.
  // Only visible when the rolled elevation is low (see updateSkybox's elT ramp);
  // a high noon sun stays neutral regardless.
  private sunWarmth = 0;
  // Warm tint multiplied into the day sky pano (and echoed by fog/hemisphere)
  // when the sun is low — white at noon. applyTexture uses it instead of a
  // hardcoded white so the async texture load lands with the same tint.
  private skyTint = new THREE.Color('#ffffff');

  private skyTextureLoader = new THREE.TextureLoader();
  private partialSky: THREE.Mesh | null = null;
  // Keyed by resolved asset URL, shared across every mode's pool — a pano is
  // only ever fetched once per session even if its mode is revisited.
  private skyTex = new Map<string, THREE.Texture>();

  private groundColor = new THREE.Color('#80766b');
  private groundColorListener: ((color: THREE.Color) => void) | null = null;
  private photographicGround = false;
  private groundModeListener: ((enabled: boolean) => void) | null = null;
  setGroundModeListener(fn: (enabled: boolean) => void) { this.groundModeListener = fn; fn(this.photographicGround); }
  getGroundColor() { return this.groundColor; }
  setGroundColorListener(fn: (color: THREE.Color) => void) { this.groundColorListener = fn; }
  private sampleGround(tex: THREE.Texture) {
    const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 8;
    const ctx = canvas.getContext('2d');
    const image = tex.image as HTMLImageElement;
    if (!ctx || !image?.width) return;
    ctx.drawImage(image, image.width*.25, image.height*.82, image.width*.5, image.height*.12, 0,0,16,8);
    const data = ctx.getImageData(0,0,16,8).data; let r=0,g=0,b=0;
    for (let i=0;i<data.length;i+=4) {r+=data[i];g+=data[i+1];b+=data[i+2];}
    const n=data.length/4;
    this.groundColor.setRGB(r/n/255,g/n/255,b/n/255,THREE.SRGBColorSpace);
    this.groundColorListener?.(this.groundColor);
  }

  // Baked-environment state (see bakeEnvironment): the PMREM currently installed
  // as scene.environment, the generator it came from, and whether the first bake
  // has happened (guards re-bakes triggered by outside-mode changes during boot).
  private envRenderTarget: THREE.WebGLRenderTarget | null = null;
  private envPmremGen: THREE.PMREMGenerator | null = null;
  private envBakeReady = false;
  private disposed = false;
  private skyTextureRequest = 0;
  private skyBakeController: AbortController | null = null;
  // Display-time gain on the baked environment. Baking always happens at a fixed
  // intensity (see bakeEnvironment) so bounce energy is stable; this per-mode gain
  // is applied afterwards. Night leans hard on it: with the sun off, the troffers
  // captured in the bake are the room's entire light source.
  private envDisplayIntensity = 0.95;

  constructor(private deps: OutdoorLightingDeps) {}

  setOutsideMode(mode: OutsideMode) {
    this.outsideMode = mode;
    this.rollSunPlacement();
    this.applySunPlacement();
    // Explicit time changes must allocate/refresh depth maps before drawing
    // newly lit exterior lamps on GPUs that enforce shadow sampler types.
    this.deps.getRenderer().shadowMap.needsUpdate = true;
    this.updateSkybox();
  }

  // The panorama's sunlight has a stable direction. Explicit lighting overrides
  // remain available, but never rotate the geography to follow those overrides.
  rollSunPlacement() {
    const profile = panoramaProfile(this.outsideMode);
    const az = readNumberSetting('bb_sun_azimuth'), el = readNumberSetting('bb_sun_elevation');
    const warmth = readNumberSetting('bb_sun_warmth');
    this.sunAzimuth = THREE.MathUtils.degToRad(az ?? profile.sunAzimuth);
    this.sunElevation = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(el ?? profile.sunElevation, 1, 88));
    this.sunWarmth = THREE.MathUtils.clamp(warmth ?? profile.sunWarmth, 0, 1);
  }

  // Move the directional sun to the rolled placement and swing the sky pano's
  // bright side around with it. Color/intensity stay per-mode (updateSkybox).
  applySunPlacement() {
    if (this.sunLight) {
      const el = this.sunElevation, az = this.sunAzimuth;
      const dist = this.sunShadowDistance;
      const dir = new THREE.Vector3(
        Math.sin(az) * Math.cos(el),
        Math.sin(el),
        Math.cos(az) * Math.cos(el)
      );
      this.sunLight.position
        .copy(this.sunLight.target.position)
        .addScaledVector(dir, dist);
    }
    // Per-mode sky rotation: day/night track the rolled sun, sunset solves
    // its pano's sun onto the rolled azimuth.
    if (this.skyMesh) this.skyMesh.rotation.y = PANORAMA_ROTATION_Y;
  }

  // A visit-defining re-roll: called on every entrance (constructor already
  // rolled once before the lights were built; returnToEntrance calls this after
  // each movie). May also flip day/night unless bb_outside pins the mode.
  rerollOutsideLighting() {
    // Mode first: rollSunPlacement's elevation band depends on it (sunset
    // hugs the horizon). 50% keep this visit's mode, else hop to one of the
    // other looks.
    const forced = typeof localStorage !== 'undefined' ? localStorage.getItem('bb_outside') : null;
    if (!forced && Math.random() < 0.5) {
      const others = (['morning', 'day', 'sunset', 'night'] as OutsideMode[])
        .filter((m) => m !== this.outsideMode);
      this.outsideMode = others[Math.floor(Math.random() * others.length)];
    }
    this.rollSunPlacement();
    this.applySunPlacement();
    this.deps.getRenderer().shadowMap.needsUpdate = true;
    // The exterior actually changed this visit (new sun angle, possible day/night
    // flip) — re-flag the sign light's shadow even though it normally sits at
    // autoUpdate=false (see logoLight above).
    if (this.logoLight) this.logoLight.shadow.needsUpdate = true;
    this.updateSkybox(); // re-applies per-mode sun color/intensity and re-bakes the environment
  }

  updateSkybox() {
    if (this.disposed) return;
    this.skyBakeController?.abort();
    const request = ++this.skyTextureRequest;
    if (!this.skyMesh) return;
    const scene = this.deps.getScene();

    // Every quality tier uses the same location; only its lighting image changes.
    const texUrl = assetUrl(panoramaProfile(this.outsideMode).file);
    let sunColor = '#ffffff';
    let sunIntensity = 3.5;
    let hemisphereSky = '#dbe3f0';
    let hemisphereGround = '#2a2d30';
    let hemisphereIntensity = 0.15;
    let fogColor = '#dbe3f0';
    // Display gain on the baked environment (see envDisplayIntensity).
    let envIntensity = 0.95;
    // Neutral unless the day branch below warms it (low-sun tint).
    this.skyTint.set('#ffffff');

    if (this.outsideMode === 'day' || this.outsideMode === 'morning') {
      // The lower the rolled sun, the warmer it rakes through the glass, blending
      // to neutral daylight by ~42 deg. The low-sun hue is a per-visit roll
      // (sunWarmth) from soft gold to gentle amber.
      //
      // These endpoints are deliberately SOFT (cream-gold #ffe1b0 -> amber
      // #ffce93, not the old golden #ffc36f -> sunset-red #ff7038): the direct
      // sun is the dominant term on every lit surface, so a deep-orange sun
      // repainted the whole neutrally-tuned interior salmon (off-white shelves
      // read pink, banana wall went muddy). A soft warm keeps the golden-hour
      // MOOD while the wall/shelf/carpet stay on their reference colors — which
      // is the bright, neutrally-lit look the store is matched to.
      const elT = THREE.MathUtils.clamp(
        (THREE.MathUtils.radToDeg(this.sunElevation) - 8) / 34, 0, 1);
      const warm = new THREE.Color('#ffe1b0').lerp(new THREE.Color('#ffce93'), this.sunWarmth);
      const noon = new THREE.Color('#fff6e8');
      sunColor = '#' + warm.lerp(noon, elT).getHexString();
      sunIntensity = 3.4 + (1 - elT) * 0.8;
      // Low sun warms the whole exterior read, not just the direct light:
      // the sky pano gets a multiplied tint (white by noon), and fog +
      // hemisphere-sky drift the same way so the view out the glass stays
      // coherent. All static per visit — no per-frame cost.
      //
      // The interior spill (skyTint feeds the env bake; hemisphere lights every
      // surface) is kept modest — 0.35, down from 0.8 — so a low sun tints the
      // MOOD without repainting the wall/shelf/carpet off their reference
      // colors. The exterior read (sky pano, fog) still leans on the full warm.
      const warmAmt = (1 - elT) * 0.8;
      const interiorWarmAmt = (1 - elT) * 0.35;
      this.skyTint.set('#ffffff').lerp(
        new THREE.Color().setRGB(1.0, 0.82 - this.sunWarmth * 0.12, 0.62 - this.sunWarmth * 0.2),
        interiorWarmAmt);
      hemisphereSky = '#' + new THREE.Color('#bfd0f0')
        .lerp(new THREE.Color('#e8c49a'), interiorWarmAmt).getHexString();
      hemisphereGround = '#222225';
      hemisphereIntensity = 0.05; // Restrained sky fill lets window distance read.
      fogColor = '#' + new THREE.Color('#a0b0d0')
        .lerp(new THREE.Color('#c9a583'), warmAmt).getHexString();
      // Window and ceiling sources supply the light; the shared bake is only fill.
      envIntensity = DAY_ENV_DISPLAY_GAIN;
    } else if (this.outsideMode === 'night') {
      // A lit night pano (streetlamp glow, lit shopfronts/windows) — the view
      // out the glass after dark is a real street, not a void. It contributes
      // no directional light (sunIntensity 0 below): the troffers captured in
      // the environment bake are still the room's whole light source, so the
      // pano only changes what's SEEN, not how the store is lit.
      // Dim + cool the photograph so it reads as night rather than dusk
      // (see NIGHT_SKY_TINT).
      this.skyTint.set('#ffffff');
      sunColor = '#a0b0ff';
      sunIntensity = 0.0;
      hemisphereSky = '#040812';
      hemisphereGround = '#010205';
      hemisphereIntensity = 0.015;
      fogColor = '#010206';
      // Ceiling fixtures and parking sources carry the night scene.
      envIntensity = 0.8;
    } else {
      // sunset
      // Golden-hour direct light, per-visit hue like day's low-sun ramp but a
      // notch deeper — sunset is an opt-in look, not the neutral reference
      // read, so it's allowed more color than day's soft floor.
      const warm = new THREE.Color('#ffd2a0').lerp(new THREE.Color('#ffab78'), this.sunWarmth);
      sunColor = '#' + warm.getHexString();
      sunIntensity = 3.8;
      // The panos carry their own color — skyTint stays white (no double
      // tint); hemisphere/fog echo a dusty amber dusk so the view out the
      // glass and the interior spill agree with the photo.
      hemisphereSky = '#e0b28e';
      hemisphereGround = '#242225';
      hemisphereIntensity = 0.05;
      fogColor = '#c9a183';
      envIntensity = DAY_ENV_DISPLAY_GAIN; // same restrained bounce as day
    }

    this.envDisplayIntensity = envIntensity;
    if (this.envBakeReady) scene.environmentIntensity = envIntensity;

    // Geography never follows a lighting roll.
    this.skyMesh.rotation.y = PANORAMA_ROTATION_Y;

    // Night's sun contributes zero light (sunIntensity 0 above) but three.js still
    // pushes any castShadow light into the shadow pass regardless of intensity, so
    // every interior-motion rebake was paying a full 4096^2 depth pass of the whole
    // store for zero visible effect (issue #112). autoUpdate=false skips it —
    // preferred over toggling castShadow, which would change the shadow-casting
    // light count and force a shader program recompile hitch on the next mode flip.
    // Re-lighting only needs autoUpdate back to true: rerollOutsideLighting and
    // rebakeEnvironment (called below / by the async texture load) already set
    // renderer.shadowMap.needsUpdate=true, so the very next rebake picks the sun back
    // up without any one-shot needed here. Turning autoUpdate off, though, is paired
    // with a one-shot needsUpdate=true: this can run on a night BOOT, before the
    // constructor's own boot-time bake (three-scene.ts ~638) has ever rendered the
    // sun's shadow once, and autoUpdate=false with needsUpdate still at its default
    // false would skip that first render forever, leaving shadow.map null — the same
    // "sampler bound to nothing on a strict GPU" hazard that boot-time bake exists to
    // avoid. The one-shot guarantees the depth texture gets allocated on that render
    // regardless of which mode we booted into.
    if (this.sunLight) {
      const litNow = sunIntensity > 0;
      this.sunLight.shadow.autoUpdate = litNow;
      if (!litNow) this.sunLight.shadow.needsUpdate = true;
    }

    // Set temporary color representation of sky parameters until texture loads
    if (this.skyMesh.material instanceof THREE.MeshBasicMaterial) {
      this.skyMesh.material.color.set(
        this.outsideMode === 'night' ? '#010206'
        : this.outsideMode === 'sunset' ? '#c9a183' : '#a0b0d0');
    }

    // Load or apply cached texture — every mode's pool is keyed into the
    // same cache by resolved URL (see skyTex).
    const texture = this.skyTex.get(texUrl) ?? null;

    let bakeWithSky = true;
    const applyTexture = (tex: THREE.Texture | null) => {
      const image = tex?.image as HTMLImageElement | undefined;
      this.photographicGround = Boolean(tex?.userData.photographicGround && image && image.width / image.height <= 2.5);
      this.groundModeListener?.(this.photographicGround);
      if (tex && image && image.width / image.height > 2.5 && this.skyMesh) {
        if (!this.partialSky) {
          this.partialSky = buildPartialPanorama(tex, this.skyMesh.userData.panoramaRadius * .96);
          this.partialSky.userData.aspect = image.width / image.height;
          this.skyMesh.add(this.partialSky);
        } else {
          (this.partialSky.material as THREE.MeshBasicMaterial).map = tex;
          this.partialSky.userData.mode = tex.userData.panoramaMode;
          this.partialSky.scale.y = this.partialSky.userData.aspect / (image.width / image.height);
        }
        this.sampleGround(tex);
        const key = 'bundled:' + texUrl;
        const background = (base: THREE.Texture) => {
          if (this.disposed || request !== this.skyTextureRequest) { base.dispose(); return; }
          base.colorSpace = THREE.SRGBColorSpace;
          this.skyTex.set(key, base);
          const material = this.skyMesh!.material as THREE.MeshBasicMaterial;
          material.map = base; material.color.set('#ffffff'); material.needsUpdate = true;
          bakeWithSky = true; this.queueSkyBake();
        };
        const cached = this.skyTex.get(key);
        bakeWithSky = Boolean(cached);
        if (cached) {
          const material = this.skyMesh.material as THREE.MeshBasicMaterial;
          material.map = cached; material.color.set('#ffffff'); material.needsUpdate = true;
        } else this.skyTextureLoader.load(texUrl, background);
        return;
      }
      this.clearPartialPanorama();
      if (this.skyMesh && this.skyMesh.material instanceof THREE.MeshBasicMaterial) {
        this.skyMesh.material.map = tex;
        // White at noon / sunset/night (the panos carry their own color);
        // warm multiplied tint only when the day sun rolled low (see skyTint
        // above).
        if (tex) this.skyMesh.material.color.copy(new THREE.Color('#ffffff'));
        this.skyMesh.material.needsUpdate = true;
        if (tex) this.sampleGround(tex);
      }
    };

    if (texture) {
      applyTexture(texture);
    } else {
      const loaded = (loadedTex: THREE.Texture) => {
          // A slow pano may outlive this store or a later day/night choice.
          // It must not revive retired GPU resources or repaint a newer sky.
          if (this.disposed || request !== this.skyTextureRequest) { loadedTex.dispose(); return; }
          loadedTex.colorSpace = THREE.SRGBColorSpace;
          // Every sky pano is viewed at an extreme grazing angle where it meets
          // the horizon — at the default anisotropy of 1 that band aliases
          // into a crawling mess the instant the camera moves. Same fix (and
          // same zero per-frame cost) as the hanging signs and distant poster
          // LOD in f932ac0.
          loadedTex.anisotropy = this.deps.getRenderer().capabilities.getMaxAnisotropy();
          loadedTex.wrapS = THREE.RepeatWrapping;
          // GroundedSkybox already reverses its sphere geometry; do not mirror the image.

          loadedTex.userData.panoramaMode = this.outsideMode;
          this.skyTex.set(texUrl, loadedTex);

          applyTexture(loadedTex);
          // Sky arrived after the light traverse below already ran, so the scene
          // is fully in its new state now — fold it into the environment.
          if (bakeWithSky) this.queueSkyBake();
      };
      const bundled = () => this.skyTextureLoader.load(texUrl, loaded, undefined, (err) => {
        if (this.disposed || request !== this.skyTextureRequest) return;
        console.error(`Failed to load skybox texture: ${texUrl}`, err);
      });
      // Installed private panoramas override the matching time; hosted builds
      // skip these probes and retain the bundled neighborhood.
      const legacy = () => tryLoadUserAssetTexture(`environments/outside/${this.outsideMode}.jpg`, loaded, {
        onMiss: () => tryLoadUserAssetTexture(`environments/outside/${this.outsideMode}.png`, loaded, { onMiss: bundled })
      });
      tryLoadUserAssetTexture(`environments/outside/ground/${this.outsideMode}.png`, tex => {
        tex.userData.photographicGround = true; loaded(tex);
      }, { onMiss: legacy });
    }

    // Sync fog and ambient/sun lights if they exist
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.set(fogColor);
    }

    // Update lights dynamically
    const headlight = this.deps.getHeadlight();
    scene.traverse((child) => {
      if (child instanceof THREE.HemisphereLight && !child.userData.interiorBounce) {
        child.color.set(hemisphereSky);
        child.groundColor.set(hemisphereGround);
        child.intensity = hemisphereIntensity;
      } else if (child instanceof THREE.DirectionalLight && child !== headlight) {
        // This is sunLight
        child.color.set(sunColor);
        child.intensity = sunIntensity;
      }
    });

    // Interior per-mode retunes (troffer key spots, etc.) — before the rebake
    // below so the baked environment sees the retuned lights.
    this.deps.onModeLighting?.(this.outsideMode);

    // Sky texture was already cached → the scene is fully in its new state here;
    // re-bake the environment so ambient light and reflections follow the mode.
    // (On a cache miss the async loader callback above does this instead.)
    if (texture && bakeWithSky) this.queueSkyBake();
  }

  // StoreScene lowers this to 1 on software GL: each bounce is 6 cube-face
  // scene renders + a PMREM chain, and one bounce (direct light only) is a
  // fair approximation when frames cost CPU seconds.
  public defaultBakeBounces = 3;
  // Cube-face capture resolution. 512 on real GPUs (trivial one-time cost)
  // so satin/gloss surfaces reflect recognizable windows and troffer rows
  // instead of 256px mush; StoreScene drops it to 256 on software GL where
  // every captured pixel is CPU work.
  public bakeResolution = 512;

  bakeEnvironment(bounces = this.defaultBakeBounces) {
    for (const capture of this.environmentBakeSteps(bounces)) capture();
  }

  async bakeEnvironmentInStages(prepare: () => Promise<void>) {
    for (const capture of this.environmentBakeSteps(this.defaultBakeBounces)) {
      await prepare();
      capture();
    }
  }

  private *environmentBakeSteps(bounces: number): Generator<() => void> {
    const scene = this.deps.getScene();
    const renderer = this.deps.getRenderer();
    if (!this.envPmremGen) this.envPmremGen = new THREE.PMREMGenerator(renderer);

    // Start every bake from darkness so the result is a pure fixed-point
    // iteration over the CURRENT lights and emissives: bounce 0 captures direct
    // light only, each further bounce adds one order of indirect. Leaving the
    // previous environment installed would let stale light (the bootstrap
    // RoomEnvironment, or the previous outside mode) leak into the new bake and
    // make lighting depend on mode-switch history.
    scene.environment = null;

    // Bake at a FIXED env intensity regardless of the display gain: with gain >1
    // inside the bounce loop the iteration over-amplifies (bright albedo × gain
    // exceeds 1, so each bounce adds more light than the last). The per-mode
    // display gain is applied once, after the capture chain.
    scene.environmentIntensity = 0.95;

    // Hide objects that would pollute the capture: live planar mirrors (their
    // onBeforeRender re-renders the scene — recursion risk, same guard as
    // generateReflectionProbes) and the floating selection arrow.
    const bakeHidden = new Set(this.deps.getBakeHidden());
    const hidden: THREE.Object3D[] = [];
    // Materials whose emissive is a STAND-IN for light they should have
    // received, not light they actually emit (userData.bakeEmissiveOff — the
    // ceiling tiles, which face down and so get nothing from the hemisphere's
    // ground term or the env's dark-carpet lower hemisphere). Those must not
    // feed the capture: the bake would treat the invented glow as real emission
    // and bounce it back into the room, manufacturing energy from nothing. The
    // ceiling is the single largest surface in the store, so letting it through
    // made it rival the troffers as a light source and lifted the whole room ~47%.
    // Zero them for the capture; the display keeps the glow.
    const suppressed = new Map<THREE.Material, number>();
    scene.traverse((obj) => {
      if ((obj instanceof Reflector || bakeHidden.has(obj)) && obj.visible) {
        obj.visible = false;
        hidden.push(obj);
      }
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        // Keyed by material: these are shared across every instanced tile, so a
        // list would double-record and restore a zero.
        if ((m?.userData?.bakeEmissiveOff || Number.isFinite(m?.userData?.bakeEmissiveIntensity)) && !suppressed.has(m)) {
          suppressed.set(m, (m as THREE.MeshStandardMaterial).emissiveIntensity);
          (m as THREE.MeshStandardMaterial).emissiveIntensity = m.userData.bakeEmissiveOff ? 0 : m.userData.bakeEmissiveIntensity;
        }
      }
    });

    // Mid-store at eye height, in the clear central walkway. cy used to be a
    // flat 6.5 — fine on the default 13.5 ft deck (48% up, roughly centred
    // between floor and cornice), but on the 'high' ceiling variant (18 ft)
    // that same 6.5 sits only 36% up, and the chrome ceiling cornice/soffit
    // fascia is 100% metalness (zero diffuse term — its whole appearance IS
    // its env-map reflection). From a capture point that much lower relative
    // to the room, those bands sampled a dim, mostly-empty part of the bake
    // and rendered near-black: the wedge read as "hollow, no body" and its
    // mirror runs looked disconnected from the wall cornice they hand off to
    // (feedback: "ceiling wedges do not connect on high ceiling... hollow").
    // Scaling cy with the live ceiling height keeps the capture point at the
    // same FRACTIONAL height in the room on every preset, so it sees the same
    // relative view of the cornice/fascia regardless of how tall the deck is.
    // No-op on the default ceiling (ceilingY === CEILING_Y → cy === 6.5).
    const cx = 11.0;
    const cy = 6.5 * (this.deps.getCeilingY() / CEILING_Y);
    const cz = (15.0 + this.deps.getBackWallZ()) / 2;

    try {
      for (let b = 0; b < bounces; b++) {
        yield () => {
          // Capture scene-linear HDR: emissive surfaces can exceed 1.0.
          const cubeRT = new THREE.WebGLCubeRenderTarget(this.bakeResolution, { type: THREE.HalfFloatType });
          const cubeCam = new THREE.CubeCamera(0.5, 1000, cubeRT);
          cubeCam.position.set(cx, cy, cz);
          scene.add(cubeCam);
          try {
            cubeCam.update(renderer, scene);
            const newEnv = this.envPmremGen!.fromCubemap(cubeRT.texture);
            scene.environment = newEnv.texture;
            this.envRenderTarget?.dispose();
            this.envRenderTarget = newEnv;
          } finally {
            scene.remove(cubeCam);
            cubeRT.dispose();
          }
        };
      }
    } finally {
      hidden.forEach((o) => (o.visible = true));
      suppressed.forEach((v, m) => ((m as THREE.MeshStandardMaterial).emissiveIntensity = v));
      scene.environmentIntensity = this.envDisplayIntensity;
    }
    this.envBakeReady = true;
  }

  // Re-bake the environment after the outside mode (sky texture + sun/hemisphere
  // settings) changes, so window light and interior ambient stay coherent. No-op
  // until the first bake, unless the deferred public-entry bake is requested.
  rebakeEnvironment(allowFirstBake = false) {
    if (!this.envBakeReady && !allowFirstBake) return;
    this.deps.getRenderer().shadowMap.needsUpdate = true;
    this.bakeEnvironment();
    // The per-library reflection probes (the env maps on the case materials) were
    // captured under the previous mode's lighting — a night-baked probe leaves
    // every case dark in daylight. Re-capture them under the new environment and
    // re-apply the active probe to the shared case materials.
    this.deps.onEnvironmentRebaked();
  }

  // Time changes must not synchronously recapture every cube face and library
  // probe from an image-load callback. Use the existing sliced capture path.
  private queueSkyBake() {
    if (!this.envBakeReady || this.disposed) return;
    this.skyBakeController?.abort();
    const controller = new AbortController(); this.skyBakeController = controller;
    const wait = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    void this.rebakeEnvironmentInSlices(wait, controller.signal).catch(error => {
      if (!controller.signal.aborted && !this.disposed) console.warn('Exterior lighting refresh failed:', error);
    });
  }

  async rebakeEnvironmentInSlices(wait: () => Promise<void>, signal: AbortSignal): Promise<void> {
    const renderer = this.deps.getRenderer(), scene = this.deps.getScene();
    if (!this.envPmremGen) this.envPmremGen = new THREE.PMREMGenerator(renderer);
    const target = await captureEnvironmentInSlices(renderer, scene, this.envPmremGen,
      new THREE.Vector3(11, 6.5 * this.deps.getCeilingY() / CEILING_Y, (15 + this.deps.getBackWallZ()) / 2),
      this.bakeResolution, this.defaultBakeBounces, this.deps.getBakeHidden(), wait, signal);
    const previous = this.envRenderTarget;
    this.envRenderTarget = target; scene.environment = target.texture;
    scene.environmentIntensity = this.envDisplayIntensity; this.envBakeReady = true;
    this.deps.onEnvironmentRebaked(false);
    previous?.dispose();
  }

  private clearPartialPanorama() {
    if (!this.partialSky) return;
    this.partialSky.removeFromParent();
    this.partialSky.geometry.dispose();
    (this.partialSky.material as THREE.Material).dispose();
    this.partialSky = null;
  }

  dispose() {
    this.clearPartialPanorama();
    this.disposed = true;
    this.skyBakeController?.abort();
    this.envRenderTarget?.dispose();
    this.envRenderTarget = null;
    this.envPmremGen?.dispose();
    this.envPmremGen = null;
    this.skyTex.forEach((t) => t.dispose());
    this.skyTex.clear();
  }
}
