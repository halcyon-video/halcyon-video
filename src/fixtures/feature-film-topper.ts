import * as THREE from 'three';
import type { Movie } from '../jellyfin';
import type { FixtureContext } from '../fixtures';
import { posterQueue, loadDecorPosterTexture } from '../video-case';
import { createPromoTopperFactory, type PromoTopperFactory } from './promo-topper';

/** Catalog poster mounted on a black corrugated header, not newly invented sign art.
 * One shared fixture-pinned texture serves all four faces; the poster cache owns it.
 */
export function createFeatureFilmTopper(movie: Movie, ctx: FixtureContext): PromoTopperFactory {
  if (!movie.posterUrl) return createPromoTopperFactory();
  let retired = false;
  const prints: THREE.MeshStandardMaterial[] = [];
  let art: THREE.Texture | null = null;
  const panels: THREE.Group[] = [];
  const fallback = createPromoTopperFactory();
  posterQueue.load(movie, 10, () => loadDecorPosterTexture(movie, texture => {
    if (retired) return;
    art = texture;
    prints.forEach(m => {m.map=texture;m.needsUpdate=true;});
    panels.forEach(p => {
      p.getObjectByName('feature-art')!.visible=true;
      p.getObjectByName('feature-label-fallback')!.visible=false;
    });
    ctx.requestRender();
  }));
  return {
    height: 1.9,
    build(label,width) {
      const root=new THREE.Group();root.name='feature-film-header: '+movie.title;
      const fallbackLabel=fallback.build(label,width);fallbackLabel.name='feature-label-fallback';root.add(fallbackLabel);
      const artwork=new THREE.Group();artwork.name='feature-art';artwork.visible=Boolean(art);root.add(artwork);
      const w=Math.min(width-.12,1.27),h=w*1.5;
      const backing=new THREE.Mesh(new THREE.BoxGeometry(w+.04,h+.04,.035),new THREE.MeshStandardMaterial({color:0x111111,roughness:.85}));
      backing.position.y=h/2;backing.castShadow=backing.receiveShadow=true;artwork.add(backing);
      const material=new THREE.MeshStandardMaterial({map:art,roughness:.72});prints.push(material);
      const print=new THREE.Mesh(new THREE.PlaneGeometry(w,h),material);print.position.set(0,h/2,.019);artwork.add(print);
      panels.push(root);return root;
    },
    dispose(){retired=true;fallback.dispose();prints.length=0;panels.length=0;},
  };
}
