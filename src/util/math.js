export const DEG = 180 / Math.PI;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
/** Maps v from [a, b] onto [0, 1], clamped. */
export const ramp = (v, a, b) => clamp((v - a) / (b - a), 0, 1);
export const smooth01 = (t) => t * t * (3 - 2 * t);
/** Frame-rate independent smoothing factor for time constant tau (seconds). */
export const expAlpha = (dt, tau) => 1 - Math.exp(-dt / tau);

export const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export function lerp3(a, b, t, out = { x: 0, y: 0, z: 0 }) {
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  out.z = a.z + (b.z - a.z) * t;
  return out;
}

/** Angle ABC at vertex b, degrees. */
export function angleAt(a, b, c) {
  const ux = a.x - b.x, uy = a.y - b.y, uz = (a.z ?? 0) - (b.z ?? 0);
  const vx = c.x - b.x, vy = c.y - b.y, vz = (c.z ?? 0) - (b.z ?? 0);
  const nu = Math.hypot(ux, uy, uz);
  const nv = Math.hypot(vx, vy, vz);
  if (nu < 1e-6 || nv < 1e-6) return 0;
  return Math.acos(clamp((ux * vx + uy * vy + uz * vz) / (nu * nv), -1, 1)) * DEG;
}

/** Linear-interpolated percentile of a numeric array (p in 0..1). */
export function percentile(values, p) {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const i = (s.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}

/** Small deterministic PRNG — tests and the puppet use it for repeatable noise. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randRange = (a, b, rnd = Math.random) => a + (b - a) * rnd();

/** Picks a key of `weights` with probability proportional to its value. */
export function weightedPick(weights, rnd = Math.random) {
  let total = 0;
  for (const k in weights) total += weights[k];
  let r = rnd() * total;
  for (const k in weights) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  return Object.keys(weights)[0];
}
