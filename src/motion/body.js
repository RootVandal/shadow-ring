import { ARM } from '../vision/landmarks.js';
import { OneEuro } from '../util/one-euro.js';
import { angleAt, clamp, dist2, dist3, expAlpha, DEG } from '../util/math.js';
import { CONFIG } from '../config.js';

// Turns raw landmarks into body features in "player space": the mirrored image
// (what the player sees in the preview), measured in units of their own
// shoulder width S so that nothing depends on distance to the camera.

const FILTERED_IMAGE = 25; // nose … hips; legs are only drawn, never measured
const FILTERED_WORLD = [11, 12, 13, 14, 15, 16, 23, 24];

/**
 * @typedef {{x:number, y:number, v:number}} Pt  mirrored pixel coords + visibility
 * @typedef {object} Arm
 * @property {'left'|'right'} side   the player's own left/right
 * @property {-1|1} sign             outward direction along x in player space
 * @property {Pt} shoulder
 * @property {Pt} elbow
 * @property {Pt} wrist
 * @property {Pt} index
 * @property {Pt} pinky
 * @property {number} vis            min visibility of elbow and wrist
 * @property {number} handVis
 * @property {number} angle          3D elbow angle, degrees
 * @property {number} reach          wrist travel toward the camera, fraction of arm length
 * @property {number} hand           knuckle span / S (grows as the fist nears the camera)
 * @property {number} compact        2D arm length / S (shrinks when the arm points at the camera)
 * @property {{x:number, y:number}} rel  wrist relative to the shoulder center, in S
 * @property {number} inward         wrist travel toward the body midline, in S
 * @property {number} up             wrist height above the shoulder line, in S
 * @property {number} elbowLift      elbow height above its shoulder, in S
 *
 * @typedef {object} Body
 * @property {boolean} present
 * @property {number} t   seconds
 * @property {number} dt  seconds since the previous frame
 * @property {number} width
 * @property {number} height
 * @property {number} S   smoothed shoulder width, px
 * @property {{x:number,y:number}} mid  shoulder center, px
 * @property {Pt} nose
 * @property {number} tilt  shoulder line angle, degrees; + = right shoulder lower
 * @property {{left: Arm, right: Arm}} arms
 * @property {Pt[]} img   all 33 landmarks in player space (for drawing)
 */

export class BodyReader {
  constructor(cfg = CONFIG) {
    this.cfg = cfg;
    const img = cfg.filter.image;
    const wld = cfg.filter.world;
    this.imgFilters = Array.from({ length: FILTERED_IMAGE }, () => [new OneEuro(img), new OneEuro(img)]);
    this.worldFilters = new Map(FILTERED_WORLD.map((i) => [i, [new OneEuro(wld), new OneEuro(wld), new OneEuro(wld)]]));
    this.S = null;
    this.lastT = null;
  }

  reset() {
    for (const f of this.imgFilters) f.forEach((x) => x.reset());
    for (const f of this.worldFilters.values()) f.forEach((x) => x.reset());
    this.S = null;
    this.lastT = null;
  }

  /**
   * @param {{image: any[]|null, world: any[]|null, width: number, height: number, t: number}} frame  t in ms
   * @returns {Body}
   */
  read(frame) {
    const t = frame.t / 1000;
    const { width, height } = frame;
    if (!frame.image || !frame.world) {
      return { present: false, t, dt: 0, width, height };
    }
    const gapMs = this.lastT === null ? Infinity : (t - this.lastT) * 1000;
    if (gapMs > this.cfg.body.maxGapMs) this.reset();
    const dt = this.lastT === null ? 1 / 30 : clamp(t - this.lastT, 0.001, 0.25);
    this.lastT = t;

    const img = new Array(frame.image.length);
    for (let i = 0; i < frame.image.length; i++) {
      const p = frame.image[i];
      let x = p.x;
      let y = p.y;
      if (i < FILTERED_IMAGE) {
        x = this.imgFilters[i][0].filter(x, t);
        y = this.imgFilters[i][1].filter(y, t);
      }
      img[i] = { x: (1 - x) * width, y: y * height, v: p.visibility ?? 1 };
    }
    const world = new Array(frame.world.length);
    for (const [i, f] of this.worldFilters) {
      const p = frame.world[i];
      world[i] = { x: -f[0].filter(p.x, t), y: f[1].filter(p.y, t), z: f[2].filter(p.z, t) };
    }

    const ls = img[11];
    const rs = img[12];
    const sw = Math.max(1, dist2(ls, rs));
    if (this.S === null) this.S = sw;
    else this.S += (sw - this.S) * expAlpha(dt, this.cfg.body.scaleTau);
    const S = this.S;
    const mid = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };

    return {
      present: Math.min(ls.v, rs.v) >= this.cfg.body.minShoulderVis,
      t,
      dt,
      width,
      height,
      S,
      sw,
      mid,
      nose: img[0],
      tilt: Math.atan2(rs.y - ls.y, rs.x - ls.x) * DEG,
      arms: { left: readArm('left', img, world, mid, S), right: readArm('right', img, world, mid, S) },
      img,
    };
  }
}

function readArm(side, img, world, mid, S) {
  const ids = ARM[side];
  const sh = img[ids.shoulder];
  const el = img[ids.elbow];
  const wr = img[ids.wrist];
  const ix = img[ids.index];
  const pk = img[ids.pinky];
  const wsh = world[ids.shoulder];
  const wel = world[ids.elbow];
  const wwr = world[ids.wrist];
  const armLen = Math.max(0.2, dist3(wsh, wel) + dist3(wel, wwr));
  const sign = side === 'left' ? -1 : 1;
  const rel = { x: (wr.x - mid.x) / S, y: (wr.y - mid.y) / S };
  return {
    side,
    sign,
    shoulder: sh,
    elbow: el,
    wrist: wr,
    index: ix,
    pinky: pk,
    vis: Math.min(el.v, wr.v),
    handVis: Math.min(ix.v, pk.v),
    angle: angleAt(wsh, wel, wwr),
    reach: (wsh.z - wwr.z) / armLen,
    hand: dist2(ix, pk) / S,
    compact: (dist2(sh, el) + dist2(el, wr)) / S,
    rel,
    inward: -sign * rel.x,
    up: -rel.y,
    elbowLift: (sh.y - el.y) / S,
  };
}
