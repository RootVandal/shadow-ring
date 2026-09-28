import { ramp } from '../util/math.js';
import { CONFIG } from '../config.js';

/**
 * Fused arm extension E. A straight punch goes at the camera, so it barely moves
 * in the 2D image — instead four weaker cues change together:
 *   angle   — the elbow opens (3D, from world landmarks)
 *   reach   — the wrist comes closer to the camera than the shoulder (3D depth)
 *   compact — the arm shortens in 2D (foreshortening)
 *   hand    — the fist looks bigger (it's closer)
 * Each cue is measured against the player's calibrated guard, so E = 0 in guard.
 * No single cue is trusted: any one of them can be noisy for a given camera.
 *
 * @param {import('./body.js').Arm} arm
 * @param {{angle:number, reach:number, compact:number, hand:number}} base  calibrated guard
 */
export function extension(arm, base, cfg = CONFIG) {
  const x = cfg.extension;
  const parts = {
    angle: ramp(arm.angle - base.angle, x.angle[0], x.angle[1]),
    reach: ramp(arm.reach - base.reach, x.reach[0], x.reach[1]),
    compact: ramp(1 - arm.compact / base.compact, x.compact[0], x.compact[1]),
    hand: ramp(arm.hand / base.hand - 1, x.hand[0], x.hand[1]),
  };
  const w = x.weights;
  const wh = arm.handVis > 0.3 && base.hand > 0 ? w.hand : 0;
  const forward = parts.reach * w.reach + parts.compact * w.compact + parts.hand * wh;
  const E = (parts.angle * w.angle + forward) / (w.angle + w.reach + w.compact + wh);
  // F ignores the elbow: an arm dropping to the hip straightens too, but it
  // doesn't come any closer to the camera.
  const F = forward / (w.reach + w.compact + wh);
  return { E, F, parts };
}

/**
 * Why a fist is not in guard, or null if it is.
 * 'low' — below the shoulder line, 'wide' — far from the face,
 * 'high' — above the head, 'out' — extended (mid-punch).
 *
 * @param {import('./body.js').Arm} arm
 * @param {import('./body.js').Body} body
 * @param {number} E  current extension (pass 0 before calibration)
 */
export function guardIssue(arm, body, E, cfg = CONFIG) {
  const g = cfg.guard;
  const S = body.S;
  if (arm.vis < 0.3) return 'low';
  if ((arm.wrist.y - arm.shoulder.y) / S > g.maxBelowShoulder) return 'low';
  if ((body.nose.y - arm.wrist.y) / S > g.maxAboveNose) return 'high';
  if (Math.abs(arm.wrist.x - body.nose.x) / S > g.maxFromNose) return 'wide';
  if (E > g.maxE) return 'out';
  return null;
}

export const inGuard = (arm, body, E, cfg = CONFIG) => guardIssue(arm, body, E, cfg) === null;

/** Where the fist should be in guard (player space px) — the preview draws it. */
export function guardTarget(side, body) {
  const sign = side === 'left' ? -1 : 1;
  return { x: body.nose.x + sign * 0.36 * body.S, y: body.nose.y + 0.32 * body.S, r: 0.24 * body.S };
}
