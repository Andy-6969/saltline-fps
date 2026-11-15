// Small numeric helpers shared by the simulation. No three.js here: the simulation is plain numbers.

export const TAU = Math.PI * 2;
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/** Shortest signed difference between two angles, in (-PI, PI]. */
export function angleDiff(to, from) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d <= -Math.PI) d += TAU;
  return d;
}

/** Yaw that looks from (x,z) towards (tx,tz); yaw 0 faces -z, as the camera does. */
export const yawTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));

/** mulberry32: a seeded generator, so a match replays the same from the same seed. */
export function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
