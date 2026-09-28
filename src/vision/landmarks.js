// MediaPipe Pose landmark indices. "Left" is always the person's own left —
// in the raw camera image it appears on the right side.

export const LM = Object.freeze({
  NOSE: 0,
  L_EYE_IN: 1, L_EYE: 2, L_EYE_OUT: 3,
  R_EYE_IN: 4, R_EYE: 5, R_EYE_OUT: 6,
  L_EAR: 7, R_EAR: 8,
  L_MOUTH: 9, R_MOUTH: 10,
  L_SHOULDER: 11, R_SHOULDER: 12,
  L_ELBOW: 13, R_ELBOW: 14,
  L_WRIST: 15, R_WRIST: 16,
  L_PINKY: 17, R_PINKY: 18,
  L_INDEX: 19, R_INDEX: 20,
  L_THUMB: 21, R_THUMB: 22,
  L_HIP: 23, R_HIP: 24,
  L_KNEE: 25, R_KNEE: 26,
  L_ANKLE: 27, R_ANKLE: 28,
  L_HEEL: 29, R_HEEL: 30,
  L_FOOT: 31, R_FOOT: 32,
});

export const LANDMARK_COUNT = 33;

export const ARM = Object.freeze({
  left: { shoulder: 11, elbow: 13, wrist: 15, pinky: 17, index: 19, thumb: 21, hip: 23 },
  right: { shoulder: 12, elbow: 14, wrist: 16, pinky: 18, index: 20, thumb: 22, hip: 24 },
});

/** Bones drawn in the camera preview. */
export const PREVIEW_BONES = [
  [11, 12], [11, 23], [12, 24], [23, 24],
  [11, 13], [13, 15], [15, 19], [15, 17], [17, 19],
  [12, 14], [14, 16], [16, 20], [16, 18], [18, 20],
  [0, 7], [0, 8],
];

/**
 * Joints that make up a fighter's "skeleton" for the avatar and the network.
 * Keys are the JointSet field names, values are landmark indices.
 */
export const JOINTS = Object.freeze({
  nose: 0, lEar: 7, rEar: 8,
  lSh: 11, rSh: 12, lEl: 13, rEl: 14, lWr: 15, rWr: 16,
  lIdx: 19, rIdx: 20, lHip: 23, rHip: 24,
});
export const JOINT_NAMES = Object.keys(JOINTS);

/**
 * MediaPipe world landmarks (x right in the image, y down, z away from the
 * camera, hips at origin) → avatar space (y up, z toward the viewer).
 * The camera looks at the player the way the opponent does, so no mirroring:
 * the player's left hand ends up on the viewer's right, as it should.
 */
export function worldToJointSet(world) {
  const out = {};
  for (const name of JOINT_NAMES) {
    const p = world[JOINTS[name]];
    out[name] = { x: p.x, y: -p.y, z: -p.z };
  }
  return out;
}
