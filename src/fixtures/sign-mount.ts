import * as THREE from 'three';
import type { FixtureContext } from '../fixtures';
import { installDisplayModel } from './display-model';

import { prepareSignMount, signCeilingContacts, type SignMountSpec } from './sign-mount-layout';

/** Builders retain their exact procedural supports until the kit is installed. */
export function registerSignMount(parent: THREE.Group, fallback: THREE.Group, spec: SignMountSpec): void {
  fallback.name = 'sign-mount-fallback';
  parent.add(fallback);
  parent.userData.signMount = spec;
}

export function installSignMount(ctx: FixtureContext, parent: THREE.Group): void {
  const spec = parent.userData.signMount as SignMountSpec | undefined;
  const fallback = parent.getObjectByName('sign-mount-fallback') as THREE.Group | undefined;
  if (!spec || !fallback) return;
  const cleanup = installDisplayModel(ctx, parent, fallback, 'models/sign-mount.glb', {},
    new THREE.Vector3(1, 1, 1), model => {
      spec.contactYs = signCeilingContacts(ctx.scene, parent, spec);
      prepareSignMount(model, spec);
    });
  // Signage removal is synchronous; cancelling here also rejects in-flight
  // loads. Loaded resources are removed before the normal signage traversal.
  const removed = () => { parent.removeEventListener('removed', removed); cleanup(); };
  parent.addEventListener('removed', removed);
}
