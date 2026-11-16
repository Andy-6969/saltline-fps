// The static scene from the map's boxes, built once: a merged mesh per surface, baked contact
// shadows, windows, signs, salt mounds and silos, sky, sun and haze.

import * as THREE from 'three';
import { BOXES, BOUNDS, SITES } from '../sim/map.js';
import { makeRng } from '../sim/math.js';
import { SURFACES, makeSign, makeSurfaceMaterials, makeStencil } from './textures.js';

/** Where the low evening sun sits; the sky shader, the light and the shadows all use it. */
export const SUN_DIR = new THREE.Vector3(-0.55, 0.34, 0.76).normalize();
const SUN_COLOR = 0xffbf80, HAZE = 0xd8a27a;
const UNIT = [0, 0, 1, 0, 1, 1, 0, 1]; // UVs of a quad that shows a whole texture

// A growing set of quads that becomes one BufferGeometry.
class Batch {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; }
  // Corners a,b,c,d counter-clockwise seen from outside; lo/hi are the shades of the lower (a,b)
  // and upper (c,d) edge, which is how walls get darker towards the ground.
  quad(a, b, c, d, n, uv, lo, hi) {
    const base = this.pos.length / 3;
    this.pos.push(...a, ...b, ...c, ...d);
    for (let i = 0; i < 4; i++) this.nor.push(...n);
    this.uv.push(...uv);
    this.col.push(lo, lo, lo, lo, lo, lo, hi, hi, hi, hi, hi, hi);
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  mesh(material, shadows = true) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    const m = new THREE.Mesh(g, material);
    m.castShadow = m.receiveShadow = shadows;
    return m;
  }
}

// The four sides of a box seen from above: corners a to b (counter-clockwise) and the outward normal.
const sides = (b) => [[b.x0, b.z1, b.x1, b.z1, 0, 1], [b.x1, b.z1, b.x1, b.z0, 1, 0], [b.x1, b.z0, b.x0, b.z0, 0, -1], [b.x0, b.z0, b.x0, b.z1, -1, 0]];

// The walls of a box and its lid (and floor, when it hangs in the air), UV-mapped in world
// metres so a texture keeps its scale across every wall it covers.
function addBox(batch, b, tile, tint) {
  const { x0, y0, z0, x1, y1, z1 } = b;
  const t = tile || 1, lo = tint * (y0 === 0 ? 0.66 : 0.9), hi = tint;
  for (const [ax, az, bx, bz, nx, nz] of sides(b)) {
    const u0 = tile ? (ax + az) / t : 0, u1 = tile ? u0 + Math.hypot(bx - ax, bz - az) / t : 1, v0 = tile ? y0 / t : 0, v1 = tile ? y1 / t : 1;
    batch.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], [nx, 0, nz], [u0, v0, u1, v0, u1, v1, u0, v1], lo, hi);
  }
  const uv = tile ? [x0 / t, z1 / t, x1 / t, z1 / t, x1 / t, z0 / t, x0 / t, z0 / t] : UNIT;
  batch.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], uv, hi, hi);
  if (y0 > 0) batch.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], uv, lo, lo);
}

// Baked ambient occlusion: a dark fade on the ground around every standing box and up the foot
// of its walls. It is what seats the geometry on the quay instead of floating over it.
function addContact(batch, b) {
  const w = 0.7, y = 0.012, h = Math.min(0.55, b.y1);
  for (const [ax, az, bx, bz, nx, nz] of sides(b)) {
    const tx = Math.sign(bx - ax), tz = Math.sign(bz - az), ex = nx * 0.006, ez = nz * 0.006;
    batch.quad([ax, y, az], [bx, y, bz], [bx + (nx + tx) * w, y, bz + (nz + tz) * w], [ax + (nx - tx) * w, y, az + (nz - tz) * w], [0, 1, 0], UNIT, 1, 1);
    batch.quad([ax + ex, 0, az + ez], [bx + ex, 0, bz + ez], [bx + ex, h, bz + ez], [ax + ex, h, az + ez], [nx, 0, nz], UNIT, 1, 1);
  }
}

// Give a library geometry the vertex colours the surface materials expect, darker at its foot.
function tinted(geo, height) {
  const p = geo.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) col.fill(0.68 + 0.32 * Math.min(1, (p.getY(i) + height / 2) / 1.2), i * 3, i * 3 + 3);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function fadeTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 64;
  const ctx = c.getContext('2d'), g = ctx.createLinearGradient(0, 64, 0, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.42)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.12)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 64);
  return new THREE.CanvasTexture(c);
}

// Dress a building: rows of windows (a few lit) with sills on every side, and a cornice.
function dress(b, rng, glass, lit, trim) {
  const group = [];
  for (const [ax, az, bx, bz, nx, nz] of sides(b)) {
    const len = Math.hypot(bx - ax, bz - az), n = Math.floor(len / 3.2);
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n, x = ax + (bx - ax) * k, z = az + (bz - az) * k;
      for (let y = 3.6; y + 1.4 < b.y1; y += 2.6) {
        const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.5), rng() < 0.22 ? lit : glass);
        const sill = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.1, 0.16), trim);
        pane.position.set(x + nx * 0.02, y + 0.75, z + nz * 0.02);
        sill.position.set(x + nx * 0.06, y - 0.06, z + nz * 0.06);
        pane.rotation.y = sill.rotation.y = Math.atan2(nx, nz);
        group.push(pane, sill);
      }
    }
  }
  const cornice = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0 + 0.4, 0.3, b.z1 - b.z0 + 0.4), trim);
  cornice.position.set((b.x0 + b.x1) / 2, b.y1 + 0.05, (b.z0 + b.z1) / 2);
  cornice.castShadow = true;
  group.push(cornice);
  return group;
}

function makeSky() {
  // Evening sky: a warm horizon under a deepening blue, a sun disc with a wide glow, thin cloud bands.
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sun: { value: SUN_DIR } },
    vertexShader: 'varying vec3 d; void main(){ d = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 d; uniform vec3 sun;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){ vec3 v = normalize(d); float up = max(v.y, 0.0);
        vec3 col = mix(vec3(1.0, 0.56, 0.3), vec3(0.2, 0.36, 0.66), pow(up, 0.5));
        float s = max(dot(v, sun), 0.0);
        col += vec3(1.0, 0.72, 0.4) * (pow(s, 6.0) * 0.5 + pow(s, 900.0) * 30.0);
        vec2 c = v.xz / (v.y + 0.25) * 1.6;
        float cl = smoothstep(0.55, 0.9, n(c) * 0.6 + n(c * 2.7) * 0.4) * smoothstep(0.0, 0.25, v.y);
        col = mix(col, vec3(1.0, 0.82, 0.68) + s * 0.3, cl * 0.6);
        gl_FragColor = vec4(mix(vec3(0.75, 0.6, 0.48), col, smoothstep(-0.08, 0.04, v.y)), 1.0); }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), mat);
}

export function buildWorld(scene, renderer) {
  const rng = makeRng(2024);
  const mats = makeSurfaceMaterials();
  const batches = {}, contact = new Batch();
  const glass = new THREE.MeshStandardMaterial({ color: 0x1b2a33, roughness: 0.08, metalness: 0.9 });
  const lit = new THREE.MeshStandardMaterial({ color: 0x332211, emissive: 0xffb760, emissiveIntensity: 2.2 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x8f877b, roughness: 0.9 });
  const add = (m, x, y, z) => { m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; scene.add(m); return m; };

  for (const b of BOXES) {
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, w = b.x1 - b.x0, d = b.z1 - b.z0;
    if (b.shape === 'mound') {
      // A heap of raked salt: a cone with its surface roughed up.
      const g = new THREE.ConeGeometry(w * 0.56, b.y1, 28, 5), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.9 + rng() * 0.2), p.getY(i) * (p.getY(i) > 0 ? 0.82 : 1), p.getZ(i) * (0.9 + rng() * 0.2));
      g.computeVertexNormals();
      add(new THREE.Mesh(tinted(g, b.y1), mats.salt), cx, b.y1 / 2, cz);
    } else if (b.shape === 'silo') {
      const r = w * 0.48;
      add(new THREE.Mesh(tinted(new THREE.CylinderGeometry(r, r, b.y1, 32), b.y1), mats.sheet), cx, b.y1 / 2, cz);
      add(new THREE.Mesh(tinted(new THREE.ConeGeometry(r + 0.15, 1.3, 32), 9), mats.roof), cx, b.y1 + 0.65, cz);
      for (let y = 1.2; y < b.y1; y += 2) add(new THREE.Mesh(new THREE.TorusGeometry(r + 0.02, 0.05, 6, 32), trim), cx, y, cz).rotation.x = Math.PI / 2;
    } else if (b.shape === 'barrel') {
      add(new THREE.Mesh(tinted(new THREE.CylinderGeometry(0.4, 0.4, b.y1, 18), b.y1), mats.rust), cx, b.y1 / 2, cz);
    } else {
      addBox((batches[b.mat] ||= new Batch()), b, SURFACES[b.mat].tile, 0.9 + rng() * 0.14);
      if (b.y0 === 0 && b.y1 >= 6 && Math.min(w, d) > 3) for (const m of dress(b, rng, glass, lit, trim)) scene.add(m);
    }
    if (b.y0 === 0) addContact(contact, b);
  }
  for (const name of Object.keys(batches)) scene.add(batches[name].mesh(mats[name]));
  scene.add(contact.mesh(new THREE.MeshBasicMaterial({ map: fadeTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), false));

  // The quay floor, reaching past the walls.
  const ground = new Batch(), G = 12, t = SURFACES.ground.tile;
  ground.quad([BOUNDS.x0 - G, 0, BOUNDS.z1 + G], [BOUNDS.x1 + G, 0, BOUNDS.z1 + G], [BOUNDS.x1 + G, 0, BOUNDS.z0 - G], [BOUNDS.x0 - G, 0, BOUNDS.z0 - G],
    [0, 1, 0], [0, 0, 84 / t, 0, 84 / t, 72 / t, 0, 72 / t], 1, 1);
  const floor = ground.mesh(mats.ground);
  floor.castShadow = false;
  scene.add(floor);

  // Wall signs, so every screen says where it is: [big, caption, colour, x, y, z, facing].
  const A = '#e8a13a', B = '#4fb3a8', N = '#c9c2b2';
  const SIGNS = [['A', 'PUMP HOUSE ↑', A, -24, 2.1, -7.97, 0], ['B', 'SILO YARD ↑', B, 22.5, 2.1, -7.97, 0],
    ['A', 'PUMP HOUSE', A, -13.03, 2.4, -15, -Math.PI / 2], ['B', 'SILO YARD', B, 13.03, 2.4, -15, Math.PI / 2],
    ['←A', 'CONNECTOR  B→', N, 7, 2.2, -12.97, 0], ['BRINEHOUSE', 'WORKS', N, 0, 2.7, 16.03, 0],
    ['←A', 'LONG QUAY', A, -22.03, 2.4, 10, -Math.PI / 2], ['B→', 'PACKING SHED', B, 13.97, 2.4, 10, Math.PI / 2]];
  for (const [big, small, color, x, y, z, rot] of SIGNS) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.975), new THREE.MeshStandardMaterial({ map: makeSign(big, small, color), roughness: 0.6, metalness: 0.2 }));
    sign.position.set(x, y, z);
    sign.rotation.y = rot;
    scene.add(sign);
  }

  // Site markings: a stencilled letter on the paving and a hazard border round the plant zone.
  for (const s of SITES) {
    const color = s.name === 'A' ? '#e8a13a' : '#4fb3a8';
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshBasicMaterial({ map: makeStencil(s.name, color), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
    mark.rotation.x = -Math.PI / 2;
    mark.position.set((s.x0 + s.x1) / 2, 0.02, (s.z0 + s.z1) / 2 + 1.5);
    scene.add(mark);
    const line = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    for (const [x, z, w, d] of [[s.x0, s.z0, s.x1 - s.x0, 0.12], [s.x0, s.z1, s.x1 - s.x0, 0.12], [s.x0, s.z0, 0.12, s.z1 - s.z0], [s.x1, s.z0, 0.12, s.z1 - s.z0]]) {
      const edge = new THREE.Mesh(new THREE.PlaneGeometry(w, d), line);
      edge.rotation.x = -Math.PI / 2;
      edge.position.set(x + w / 2, 0.021, z + d / 2);
      scene.add(edge);
    }
  }

  // Lamps: a post, a shade, a warm bulb; four of them carry a real light for the covered places.
  const bulb = new THREE.MeshStandardMaterial({ color: 0x221a10, emissive: 0xffc878, emissiveIntensity: 5 });
  const LAMPS = [[22, 4.1, 10.5, 1], [-14, 3.1, 2, 1], [0, 3.9, -14.2, 0], [0, 4.4, 15.6, 0], [-29.6, 4, -2, 0], [29.6, 4, -4, 0], [-21.6, 4, -19, 0], [13.4, 4, -15, 0]];
  for (const [x, y, z, real] of LAMPS) {
    add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), bulb), x, y, z).castShadow = false;
    add(new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.3, 16, 1, true), trim), x, y + 0.18, z);
    if (real) {
      const light = new THREE.PointLight(0xffb866, 14, 13, 1.6);
      light.position.set(x, y - 0.3, z);
      scene.add(light);
    }
  }
  // Pipework along the Brine House, and the skyline over the walls: a gantry crane and two stacks.
  const pipe = new THREE.MeshStandardMaterial({ color: 0x6f4a32, roughness: 0.5, metalness: 0.7 });
  for (const [x, y, z, len, r, vertical] of [[-22.25, 2.4, -4, 7.6, 0.18, 0], [-22.3, 3, -4, 7.6, 0.1, 0], [-22.25, 1.2, -7.6, 2.4, 0.18, 1], [5.75, 3.2, 10, 11, 0.14, 0], [20.25, 2.8, -4, 7.4, 0.16, 0]]) {
    const m = add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), pipe), x, y, z);
    if (!vertical) m.rotation.x = Math.PI / 2;
  }
  const far = new THREE.MeshStandardMaterial({ color: 0x5a5f66, roughness: 0.9 });
  for (const [x, y, z, w, h, d] of [[-46, 9, -8, 1.2, 18, 1.2], [-46, 17.4, 0, 1.4, 1.4, 22], [-46, 9, 8, 1.2, 18, 1.2], [44, 11, -30, 3, 22, 3], [38, 8, -34, 2.4, 16, 2.4], [0, 5, -40, 30, 10, 8], [-20, 6, 42, 26, 12, 8]]) {
    add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), far), x, y, z);
  }

  // Light: the sun casts the shadows, the sky fills them, and the sky itself is the reflection map.
  const sky = makeSky();
  scene.add(sky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyScene = new THREE.Scene();
  skyScene.add(sky.clone());
  scene.environment = pmrem.fromScene(skyScene).texture;
  scene.environmentIntensity = 0.9;
  pmrem.dispose();
  scene.fog = new THREE.FogExp2(HAZE, 0.0075);
  scene.add(new THREE.HemisphereLight(0x9fb6e0, 0x8a6244, 1.15));
  const sun = new THREE.DirectionalLight(SUN_COLOR, 4.2);
  sun.position.copy(SUN_DIR).multiplyScalar(70);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const cam = sun.shadow.camera;
  cam.left = -44; cam.right = 44; cam.top = 40; cam.bottom = -40; cam.near = 10; cam.far = 150;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
}
