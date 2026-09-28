/**
 * Every tunable number of the game lives here.
 *
 * Units used across the motion code:
 *   S — body scale: the player's shoulder width in pixels. Positions are divided
 *       by S, so thresholds don't depend on how far the player stands.
 *   E — fused arm extension: 0 is the player's own guard, ~1 is an arm fully
 *       thrown at the camera (see motion/punch-tracker.js).
 */
export const CONFIG = {
  camera: { width: 640, height: 480, fps: 30 },

  detector: {
    model: 'lite', // 'lite' | 'full'
    minDetection: 0.5,
    minPresence: 0.5,
    minTracking: 0.5,
  },

  // One Euro filter params. MediaPipe already smooths in VIDEO mode, so ours
  // only takes the edge off jitter before we differentiate.
  filter: {
    image: { minCutoff: 2.2, beta: 4.0, dCutoff: 1.2 }, // normalized image units
    world: { minCutoff: 2.2, beta: 2.0, dCutoff: 1.2 }, // meters
  },

  body: {
    minShoulderVis: 0.45,
    scaleTau: 0.45, // s — smoothing of S
    maxGapMs: 250, // longer gaps reset velocities
  },

  calibration: {
    holdSeconds: 1.1,
    maxWristSpeed: 1.4, // S/s — must hold reasonably still
  },

  // Cues fused into the extension signal E. Each cue maps [from, to] → [0, 1]
  // relative to the calibrated guard.
  extension: {
    weights: { angle: 0.3, reach: 0.3, compact: 0.2, hand: 0.2 },
    angle: [15, 85], // elbow opening, degrees
    reach: [0.06, 0.5], // wrist travel toward the camera, fraction of arm length
    compact: [0.1, 0.5], // 2D foreshortening of the arm
    hand: [0.06, 0.45], // apparent growth of the fist (knuckle span)
  },

  punch: {
    // Any of these rates opens a strike window.
    trigger: { vE: 1.5, vIn: 1.6, vUp: 1.6 },
    settleMs: 90, // no new maximum for this long → the punch is over
    maxStrikeMs: 650,
    minRecoverMs: 80,
    rearmMs: 140, // earliest re-trigger from a half-retracted arm (double jab)
    returnTimeoutMs: 1100,
    historyMs: 1200,

    // gate: travel needed to count at all. Speed is judged by duration — from the
    // moment the fist starts moving to full extension: goodMs is crisp, slowMs is
    // the full penalty, beyond maxMs it's a push, not a punch.
    straight: { gate: 0.32, minForward: 0.2, maxDrop: 0.45, straightAngle: 140, goodMs: 280, slowMs: 460, maxMs: 560 },
    hook: { gate: 0.5, bentAngle: 135, minElbowLift: -0.45, goodMs: 340, slowMs: 560, maxMs: 700 },
    upper: { gate: 0.45, bentAngle: 135, goodMs: 340, slowMs: 560, maxMs: 700 },

    // Personal reference: a punch is "short" when it reaches less than this share
    // of what this player usually reaches (rolling 75th percentile).
    shortRatio: 0.78,
    refFloor: { straight: 0.55, hook: 0.6, upper: 0.55 },
    refDefault: { straight: 0.85, hook: 0.9, upper: 0.85 },

    nearMiss: 0.6, // share of the gate that still counts as an attempt
    otherHandDropRatio: 0.5,
  },

  guard: {
    maxBelowShoulder: 0.2, // S — wrist may sit this much below the shoulder line
    maxFromNose: 1.05, // S — horizontal distance of the fist from the nose
    maxAboveNose: 0.6, // S
    maxE: 0.5,
    dropWarnMs: 1400,
  },

  dodge: {
    slipOn: 0.4, // S of lateral head travel
    slipOff: 0.22,
    tiltOn: 12, // deg, with at least tiltAssist lateral travel
    tiltAssist: 0.25,
    duckOn: 0.35, // S of shoulder drop
    duckOff: 0.2,
    freshMs: 1300, // a dodge only protects shortly after it started
    neutralTau: 4, // s — neutral head position follows slow drift
  },

  framing: {
    minScale: 0.11, // S / frame width
    maxScale: 0.5,
    edge: 0.24, // shoulders' center must stay inside [edge, 1 - edge]
    minLuma: 45, // 0..255
    persistMs: 600,
  },

  cursor: {
    dwellMs: 1100,
    cooldownMs: 700,
    magnetPx: 36,
  },

  fight: {
    rounds: 3,
    roundSeconds: 45,
    breakSeconds: 12,
    introSeconds: 4,
    maxHp: 100,
    breakHeal: 6,
    stamina: { max: 100, regen: 16, regenDelayMs: 350 },
    counterWindowMs: 800,
    counterBonus: 1.3,
    myProjectileMs: 240,
    knockMs: 10000, // the timekeeper knocks 10 s before the bell
  },

  bot: {
    easy: { interval: [2.6, 4.0], window: 850, combo: 0, defend: 0.25, smart: 0.5, guardUp: 0.45, damage: 0.55, reads: 0.2 },
    normal: { interval: [2.0, 3.2], window: 700, combo: 0.25, defend: 0.42, smart: 0.7, guardUp: 0.6, damage: 0.7, reads: 0.5 },
    hard: { interval: [1.3, 2.3], window: 560, combo: 0.45, defend: 0.58, smart: 0.85, guardUp: 0.7, damage: 0.85, reads: 0.8 },
  },

  net: {
    prefix: 'shadowring-v1-',
    quickSlots: 6,
    poseHz: 20,
    stateHz: 5,
    pingMs: 2000,
    connectTimeoutMs: 6000,
    rescanMs: 4000,
    renderDelayMs: 110,
  },
};

/** Sensitivity presets scale the recognition gates and speeds. */
export const SENSITIVITY = { low: 1.18, normal: 1, high: 0.84 };
