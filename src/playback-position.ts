import type { StoreScene } from './three-scene';

export function quickPlayback(): boolean {
  return typeof localStorage !== 'undefined' && localStorage.getItem('bb_quick_playback') === '1';
}
const positions = new WeakMap<StoreScene, ReturnType<typeof snapshot>>();
function snapshot(scene: StoreScene) {
  return {
    selectedLibraryIdx: scene.selectedLibraryIdx, selectedUnitIdx: scene.selectedUnitIdx,
    selectedSide: scene.selectedSide, selectedShelf: scene.selectedShelf, selectedCol: scene.selectedCol,
    selectedUnitSource: scene.selectedUnitSource, selectedFixtureId: scene.selectedFixtureId,
    cameraWindowMinCol: scene.cameraWindowMinCol,
    isBrowsingNewReleasesDirectly: scene.isBrowsingNewReleasesDirectly,
    walkReturnPose: scene.walkReturnPose ? { ...scene.walkReturnPose } : scene.isWalkAroundMode ? { x: scene.currentCameraPos.x, z: scene.currentCameraPos.z, yaw: scene.yaw, pitch: scene.pitch, savedMode: scene.savedModeBeforeWalk } : null,
  };
}
export function rememberPlaybackPosition(scene: StoreScene): void {
  if (scene.mode === 'browse' || scene.mode === 'inspect' || scene.isWalkAroundMode) positions.set(scene, snapshot(scene));
}
export function restorePlaybackPosition(scene: StoreScene, returnHeld = true): void {
  const position = positions.get(scene);
  if (!position) { scene.returnToEntrance(); return; }
  positions.delete(scene);
  scene.launchAnim = null; scene.checkoutExit = null; scene.checkoutRunning = false;
  scene.returnDropWatch = false;
  scene.entrance?.hideBag(); scene.clerk?.releaseFromRegister(); scene.hideHeroCases();
  scene.whiteoutEl()?.classList.remove('active', 'instant');
  const returned = scene.pendingReturnDrop;
  scene.pendingReturnDrop = [];
  for (const movie of returnHeld ? scene.collectHeldTapesForReturn() : []) {
    if (!returned.some(item => item.id === movie.id)) returned.push(movie);
  }
  if (!quickPlayback() && returned.length && scene.entrance?.hasReturnSlot()) {
    scene.entrance.dropReturnedTapes(returned, performance.now());
  }
  Object.assign(scene, position);
  scene.isFlipped = false; scene.heroSpine = false;
  scene.selectedBackCoverRegionIdx = -1; scene.highlightedBackRegionName = '';
  scene.resetHeroFace();
  if (position.walkReturnPose) {
    const pose = position.walkReturnPose;
    scene.walkReturnPose = null;
    scene.teleportWalk(pose.x, pose.z, pose.yaw * 180 / Math.PI, pose.pitch * 180 / Math.PI);
    scene.savedModeBeforeWalk = pose.savedMode;
  } else {
    scene.mode = scene.personEndcap ? 'person-endcap' : 'browse';
    scene.onModeChange?.(scene.mode); scene.updateColsCount(); scene.updateCameraTarget();
    scene.currentCameraPos.copy(scene.targetCameraPos);
    scene.currentLookAt.copy(scene.targetLookAt);
    scene.camera.position.copy(scene.currentCameraPos); scene.camera.lookAt(scene.currentLookAt);
  }
  scene.onSelectionChange?.(scene.getSelectedMovie()); scene.requestRender();
}
