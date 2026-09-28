import { CONFIG } from '../config.js';

/**
 * The most important thing wrong with how the player stands in the frame,
 * or null. Order matters: "step back" beats "move left".
 *
 * @param {import('./body.js').Body} body
 * @param {number|null} luma  average frame brightness 0..255, if measured
 */
export function framingIssue(body, luma, cfg = CONFIG) {
  const f = cfg.framing;
  if (!body.present) return 'no_person';
  const scale = body.S / body.width;
  if (scale > f.maxScale || body.nose.y < body.height * 0.03) return 'too_close';
  for (const side of ['left', 'right']) {
    const a = body.arms[side];
    if (a.vis < 0.3 || a.elbow.y > body.height * 0.97) return 'partial';
  }
  if (scale < f.minScale) return 'too_far';
  const cx = body.mid.x / body.width;
  // Player space is mirrored: showing up on the left means stepping to their right.
  if (cx < f.edge) return 'off_left';
  if (cx > 1 - f.edge) return 'off_right';
  if (luma != null && luma < f.minLuma) return 'dark';
  return null;
}
