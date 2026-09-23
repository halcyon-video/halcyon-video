// A held streaming sleeve and its store case turn as one compact deck.
// Reuse the scratch pose: this is evaluated for the active slot each frame.
export const STREAMING_PAIR_X = 0.045;
const pose = { targetX: 0, targetZ: 0, targetRotY: 0,
  targetFrontX: STREAMING_PAIR_X, targetBackX: -STREAMING_PAIR_X,
  targetFrontZ: 0, targetBackZ: 0, targetFrontRotY: 0, targetBackRotY: 0 };

export function streamingInspectPose(x: number, z: number, yaw: number,
  retailDepth: number, rentalDepth: number, forward: number, flipped: boolean) {
  pose.targetX = x + forward * Math.sin(yaw);
  pose.targetZ = z + forward * Math.cos(yaw);
  pose.targetRotY = yaw + (flipped ? Math.PI : 0);
  // Both half-depths plus a small air gap: solid shells never intersect.
  pose.targetFrontZ = (retailDepth + rentalDepth) / 4 + 0.007;
  pose.targetBackZ = -pose.targetFrontZ;
  return pose;
}
