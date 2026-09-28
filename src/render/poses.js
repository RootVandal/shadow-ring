// Key poses for the Shadow, in avatar space: meters, origin at the hip center,
// y up, z toward the viewer, +x is the fighter's own LEFT. Arm poses are written
// for the left arm; the right arm uses mirror().

const v = (x, y, z) => ({ x, y, z });

export const GUARD = {
  nose: v(0, 0.73, 0.1),
  lEar: v(0.075, 0.72, -0.01),
  rEar: v(-0.075, 0.72, -0.01),
  lSh: v(0.2, 0.5, 0.05),
  rSh: v(-0.2, 0.49, -0.05),
  lEl: v(0.19, 0.27, 0.16),
  rEl: v(-0.2, 0.25, 0.08),
  lWr: v(0.1, 0.55, 0.25),
  rWr: v(-0.1, 0.55, 0.18),
  lIdx: v(0.09, 0.62, 0.28),
  rIdx: v(-0.09, 0.62, 0.21),
  lHip: v(0.12, 0, 0.02),
  rHip: v(-0.12, 0, -0.02),
};

export const LOW = {
  lEl: v(0.24, 0.25, 0.04),
  lWr: v(0.21, 0.04, 0.14),
  lIdx: v(0.21, -0.03, 0.17),
  rEl: v(-0.24, 0.25, 0),
  rWr: v(-0.21, 0.04, 0.1),
  rIdx: v(-0.21, -0.03, 0.13),
};

export const BLOCK = {
  nose: v(0, 0.7, 0.07),
  lEl: v(0.12, 0.35, 0.18),
  lWr: v(0.07, 0.66, 0.2),
  lIdx: v(0.065, 0.73, 0.22),
  rEl: v(-0.12, 0.35, 0.16),
  rWr: v(-0.07, 0.66, 0.18),
  rIdx: v(-0.065, 0.73, 0.2),
};

export const VICTORY = {
  nose: v(0, 0.75, 0.1),
  lEl: v(0.33, 0.78, 0.02),
  lWr: v(0.3, 1.06, 0.06),
  lIdx: v(0.3, 1.14, 0.06),
  rEl: v(-0.33, 0.78, 0.02),
  rWr: v(-0.3, 1.06, 0.06),
  rIdx: v(-0.3, 1.14, 0.06),
};

/** Left-arm punches: the load (telegraph) and the moment of full extension. */
export const PUNCH_POSES = {
  straight: {
    wind: { lEl: v(0.21, 0.27, 0.09), lWr: v(0.12, 0.52, 0.16), lIdx: v(0.11, 0.59, 0.19), lSh: v(0.2, 0.5, 0.01) },
    hit: {
      lEl: v(0.12, 0.54, 0.35),
      lWr: v(0.05, 0.6, 0.63),
      lIdx: v(0.045, 0.6, 0.73),
      lSh: v(0.19, 0.5, 0.14),
      rSh: v(-0.2, 0.49, -0.11),
      nose: v(-0.02, 0.71, 0.1),
    },
  },
  hook: {
    wind: { lEl: v(0.34, 0.44, 0.08), lWr: v(0.31, 0.57, 0.21), lIdx: v(0.29, 0.63, 0.23), lSh: v(0.2, 0.5, 0), rSh: v(-0.2, 0.49, 0.02) },
    hit: {
      lEl: v(0.3, 0.5, 0.3),
      lWr: v(0.03, 0.56, 0.43),
      lIdx: v(-0.05, 0.57, 0.44),
      lSh: v(0.18, 0.5, 0.13),
      rSh: v(-0.2, 0.49, -0.12),
      nose: v(-0.03, 0.72, 0.1),
    },
  },
  upper: {
    wind: { lEl: v(0.2, 0.18, 0.07), lWr: v(0.12, 0.28, 0.22), lIdx: v(0.11, 0.33, 0.26), lSh: v(0.2, 0.46, 0.02) },
    hit: {
      lEl: v(0.12, 0.44, 0.3),
      lWr: v(0.05, 0.72, 0.37),
      lIdx: v(0.05, 0.8, 0.37),
      lSh: v(0.18, 0.53, 0.1),
      rSh: v(-0.2, 0.49, -0.07),
    },
  },
};

const SWAP = { lEar: 'rEar', rEar: 'lEar', lSh: 'rSh', rSh: 'lSh', lEl: 'rEl', rEl: 'lEl', lWr: 'rWr', rWr: 'lWr', lIdx: 'rIdx', rIdx: 'lIdx', lHip: 'rHip', rHip: 'lHip' };

/** The same pose thrown with the other side of the body. */
export function mirror(pose) {
  const out = {};
  for (const [k, p] of Object.entries(pose)) out[SWAP[k] ?? k] = v(-p.x, p.y, p.z);
  return out;
}
