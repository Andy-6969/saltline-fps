// Every texture in SALTLINE is painted here at load, per pixel, from seeded noise: no image files.
// One painter per surface returns a colour for (u, v); the same canvas doubles as the bump map,
// so mortar lines sink and plank edges catch the low sun.

import * as THREE from 'three';
import { makeRng } from '../sim/math.js';

const rng = makeRng(77);
const LATTICE = 64;
const grid = new Float32Array(LATTICE * LATTICE).map(() => rng());
const smooth = (t) => t * t * (3 - 2 * t);

// Tileable value noise: `cells` lattice cells across the texture, wrapping at the edges.
function vnoise(u, v, cells) {
  const x = u * cells, y = v * cells;
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = smooth(x - xi), fy = smooth(y - yi);
  const at = (i, j) => grid[(((j % cells) + cells) % cells % LATTICE) * LATTICE + ((((i % cells) + cells) % cells) % LATTICE)];
  const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
const fbm = (u, v, cells) => vnoise(u, v, cells) * 0.5 + vnoise(u, v, cells * 2) * 0.27 + vnoise(u, v, cells * 4) * 0.15 + vnoise(u, v, cells * 8) * 0.08;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const edge = (t, w) => Math.min(1, Math.min(t, 1 - t) / w); // 0 at a cell's border, 1 inside

// The palette: sun-bleached plaster and salt against rust, teal sheet metal and tarred wood.
const P = {
  plaster: [222, 210, 188], stain: [150, 128, 100], brick: [142, 82, 62], mortar: [176, 166, 150],
  concrete: [142, 138, 130], wood: [150, 108, 66], teal: [62, 118, 116], rust: [146, 74, 38],
  steel: [70, 82, 84], navy: [44, 74, 108], salt: [236, 236, 230], quay: [168, 152, 126],
};

const PAINT = {
  plaster(u, v) {
    const n = fbm(u, v, 4), streak = vnoise(u * 6, v * 0.4, 8);
    const c = mix(P.plaster, P.stain, Math.max(0, n - 0.55) * 1.6 + streak * 0.12);
    return shade(c, 0.9 + fbm(u, v, 32) * 0.16);
  },
  brick(u, v) {
    const row = Math.floor(v * 12), bx = u * 6 + (row % 2) * 0.5, col = Math.floor(bx);
    const m = Math.min(edge(bx - col, 0.05), edge(v * 12 - row, 0.1));
    const tone = 0.72 + grid[(row * 13 + col * 7) % 4096] * 0.42;
    return mix(shade(P.mortar, 0.75 + fbm(u, v, 32) * 0.2), shade(P.brick, tone * (0.85 + fbm(u, v, 16) * 0.25)), m);
  },
  concrete(u, v) {
    const n = fbm(u, v, 6), pits = vnoise(u, v, 64) > 0.8 ? 0.82 : 1;
    const seam = Math.min(edge((u * 2) % 1, 0.012), edge(v % 1, 0.012));
    return shade(P.concrete, (0.78 + n * 0.36) * pits * (0.6 + seam * 0.4));
  },
  wood(u, v) {
    // A crate face: planks inside a nailed frame.
    const frame = Math.min(u, v, 1 - u, 1 - v) < 0.11;
    const p = frame ? (Math.min(u, 1 - u) < 0.11 ? v : u) : u * 5;
    const grain = vnoise(frame ? p * 3 : Math.floor(p) * 0.37 + u * 0.3, v * (frame ? 30 : 3) + (frame ? 0 : u * 40), 32);
    const gap = frame ? 1 : edge(p % 1, 0.06);
    return shade(P.wood, (frame ? 0.78 : 0.95) * (0.72 + grain * 0.45) * (0.45 + gap * 0.55));
  },
  sheet(u, v) {
    const wave = 0.72 + 0.28 * Math.sin(u * Math.PI * 2 * 12);
    const rusty = Math.max(0, fbm(u, v, 5) - 0.52) * 3 + Math.max(0, v - 0.82) * 2.5;
    return shade(mix(P.teal, P.rust, Math.min(1, rusty)), wave * (0.85 + fbm(u, v, 32) * 0.2));
  },
  metal(u, v) {
    const panel = Math.min(edge((u * 2) % 1, 0.02), edge((v * 2) % 1, 0.02));
    const rivet = Math.hypot(((u * 16) % 1) - 0.5, ((v * 16) % 1) - 0.5) < 0.12 && (Math.floor(v * 16) % 8 === 0 || Math.floor(u * 16) % 8 === 0);
    const c = mix(P.steel, P.rust, Math.max(0, fbm(u, v, 6) - 0.6) * 2.2);
    return shade(c, (0.8 + fbm(u, v, 24) * 0.3) * (0.55 + panel * 0.45) * (rivet ? 1.35 : 1));
  },
  rust(u, v) {
    const rib = 0.75 + 0.25 * Math.abs(Math.sin(v * Math.PI * 3));
    return shade(mix(P.rust, P.steel, fbm(u, v, 5) * 0.6), rib * (0.8 + fbm(u, v, 32) * 0.3));
  },
  container(u, v) {
    const wave = 0.7 + 0.3 * Math.sin(u * Math.PI * 2 * 16);
    const c = mix(P.navy, P.rust, Math.max(0, fbm(u, v, 4) - 0.6) * 2.5);
    return shade(c, wave * (0.85 + fbm(u, v, 32) * 0.2) * (edge(v, 0.04) * 0.4 + 0.6));
  },
  roof(u, v) {
    return shade(P.steel, (0.55 + 0.25 * Math.sin(u * Math.PI * 2 * 14)) * (0.8 + fbm(u, v, 8) * 0.3));
  },
  salt(u, v) {
    const sparkle = vnoise(u, v, 64) > 0.86 ? 1.08 : 1;
    return shade(mix(P.salt, P.quay, fbm(u, v, 5) * 0.28), (0.88 + fbm(u, v, 16) * 0.14) * sparkle);
  },
  ground(u, v) {
    // Quay paving: big worn slabs, drifted salt in the joints, oil-dark patches.
    const slab = Math.min(edge((u * 4) % 1, 0.012), edge((v * 4) % 1, 0.012));
    const drift = Math.max(0, fbm(u, v, 3) - 0.5) * 2.4;
    const c = mix(mix(P.quay, P.concrete, fbm(u + 0.3, v, 5)), P.salt, Math.min(0.75, drift));
    return shade(c, (0.74 + fbm(u, v, 48) * 0.3) * (0.62 + slab * 0.38) * (vnoise(u, v, 7) < 0.22 ? 0.8 : 1));
  },
};

// Metres one texture repeat covers, and the PBR response of each surface. `fit` surfaces map one
// texture to each face instead (a crate face is one crate).
export const SURFACES = {
  plaster: { tile: 4, rough: 0.94, metal: 0, bump: 0.35 },
  brick: { tile: 2.4, rough: 0.9, metal: 0, bump: 0.9 },
  concrete: { tile: 3, rough: 0.88, metal: 0, bump: 0.5 },
  wood: { tile: 0, rough: 0.82, metal: 0, bump: 0.8 },
  sheet: { tile: 2.4, rough: 0.55, metal: 0.55, bump: 1.2 },
  metal: { tile: 2, rough: 0.5, metal: 0.7, bump: 0.5 },
  rust: { tile: 0, rough: 0.75, metal: 0.15, bump: 0.6 },
  container: { tile: 2.6, rough: 0.6, metal: 0.5, bump: 1.2 },
  roof: { tile: 2.4, rough: 0.6, metal: 0.6, bump: 1 },
  salt: { tile: 3, rough: 0.97, metal: 0, bump: 0.6 },
  ground: { tile: 10, rough: 0.92, metal: 0, bump: 0.6 },
};

function paint(name, size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const fn = PAINT[name];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = fn(x / size, y / size), i = (y * size + x) * 4;
      img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** One lit material per surface, keyed by the names the map's boxes use. */
export function makeSurfaceMaterials() {
  const out = {};
  for (const name of Object.keys(SURFACES)) {
    const s = SURFACES[name], map = paint(name, name === 'ground' ? 512 : 256);
    out[name] = new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: s.bump, roughness: s.rough, metalness: s.metal, vertexColors: true });
  }
  return out;
}

/** A soft round sprite (smoke, dust, glow) or, with `rays`, a muzzle-flash star. */
export function makeSpriteTexture(rays = 0) {
  const size = 128, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x / size - 0.5, dy = y / size - 0.5, d = Math.hypot(dx, dy) * 2;
      let a = Math.max(0, 1 - d);
      if (rays) a = Math.pow(a, 1.5) * (0.35 + 0.65 * Math.pow(Math.abs(Math.cos(Math.atan2(dy, dx) * rays * 0.5)), 6)) + Math.max(0, 1 - d * 3);
      else a = a * a * (0.7 + 0.3 * fbm(x / size, y / size, 6));
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.min(255, a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

/** Painted ground markings and signs: a letter in a ring, as stencilled site markers. */
export function makeStencil(text, color) {
  const size = 256, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = ctx.fillStyle = color;
  ctx.lineWidth = 12;
  ctx.setLineDash([34, 12]);
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 14, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = '900 150px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2, size / 2 + 8);
  // Wear the paint so it reads as stencilled on, not printed.
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] *= 0.45 + 0.55 * fbm(((i >> 2) % size) / size, (i >> 2) / size / size, 12);
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
