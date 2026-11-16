// The armoury as geometry: each weapon is a table of boxes and barrels, pointing down -z with the
// grip at the origin, in metres. The first-person view and the soldiers share these models.

import * as THREE from 'three';

const MATS = [
  new THREE.MeshStandardMaterial({ color: 0x4a4f56, roughness: 0.36, metalness: 0.85 }), // 0 blued steel
  new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.7, metalness: 0.1 }), // 1 polymer
  new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.58, metalness: 0 }), // 2 oiled wood
  new THREE.MeshStandardMaterial({ color: 0x8b8f92, roughness: 0.3, metalness: 0.95 }), // 3 bare steel
  new THREE.MeshStandardMaterial({ color: 0x4d5a45, roughness: 0.66, metalness: 0.2 }), // 4 olive furniture
  new THREE.MeshStandardMaterial({ color: 0x0a1418, roughness: 0.05, metalness: 1 }), // 5 lens
];

// Part: [shape, a, b, c, x, y, z, material, tilt]. 'b' is a box a x b x c; 'c' is a barrel of
// radius a and length c along the bore. `tilt` leans a part about x (magazines, grips).
const B = 'b', C = 'c';
const PARTS = {
  wren: [
    [B, 0.03, 0.036, 0.19, 0, 0.045, -0.05, 0], [B, 0.026, 0.03, 0.18, 0, 0.012, -0.045, 1], [C, 0.008, 0, 0.03, 0, 0.045, -0.155, 3],
    [B, 0.03, 0.11, 0.045, 0, -0.045, 0.02, 1, -0.2], [B, 0.008, 0.012, 0.012, 0, 0.07, 0.035, 0], [B, 0.006, 0.012, 0.008, 0, 0.07, -0.135, 0],
    [B, 0.012, 0.03, 0.05, 0, -0.005, -0.03, 1],
  ],
  mako: [
    [B, 0.036, 0.045, 0.24, 0, 0.05, -0.07, 3], [B, 0.03, 0.03, 0.2, 0, 0.012, -0.05, 0], [C, 0.012, 0, 0.05, 0, 0.05, -0.21, 0],
    [B, 0.034, 0.12, 0.05, 0, -0.05, 0.025, 2, -0.22], [B, 0.01, 0.014, 0.014, 0, 0.08, 0.04, 0], [B, 0.008, 0.014, 0.01, 0, 0.08, -0.18, 0],
    [B, 0.04, 0.012, 0.1, 0, 0.076, -0.08, 0],
  ],
  vesper: [
    [B, 0.05, 0.075, 0.3, 0, 0.04, -0.1, 1], [C, 0.012, 0, 0.12, 0, 0.045, -0.3, 0], [C, 0.022, 0, 0.14, 0, 0.045, -0.22, 0],
    [B, 0.03, 0.2, 0.04, 0, -0.1, -0.08, 0], [B, 0.034, 0.1, 0.045, 0, -0.05, 0.06, 1, -0.25], [B, 0.012, 0.012, 0.22, 0, 0.045, 0.16, 3],
    [B, 0.05, 0.08, 0.02, 0, 0.02, 0.28, 1], [B, 0.012, 0.03, 0.05, 0, 0.09, -0.02, 0], [B, 0.03, 0.05, 0.03, 0, -0.01, -0.2, 1],
  ],
  breaker: [
    [B, 0.05, 0.07, 0.26, 0, 0.035, -0.05, 0], [C, 0.016, 0, 0.5, 0, 0.055, -0.42, 0], [C, 0.015, 0, 0.36, 0, 0.02, -0.36, 3],
    [B, 0.048, 0.045, 0.2, 0, 0.02, -0.34, 2], [B, 0.04, 0.085, 0.3, 0, 0, 0.24, 2, 0.12], [B, 0.034, 0.08, 0.05, 0, -0.04, 0.08, 2, -0.4],
    [B, 0.008, 0.016, 0.01, 0, 0.078, -0.64, 3],
  ],
  halyard: [
    [B, 0.052, 0.075, 0.3, 0, 0.03, -0.05, 0], [B, 0.05, 0.058, 0.24, 0, 0.03, -0.32, 2], [C, 0.011, 0, 0.3, 0, 0.04, -0.56, 0],
    [C, 0.017, 0, 0.06, 0, 0.04, -0.72, 0], [C, 0.009, 0, 0.22, 0, 0.068, -0.36, 3], [B, 0.034, 0.18, 0.06, 0, -0.09, -0.1, 0, 0.28],
    [B, 0.036, 0.1, 0.045, 0, -0.06, 0.07, 2, -0.3], [B, 0.04, 0.07, 0.26, 0, 0.005, 0.26, 2, 0.08], [B, 0.012, 0.025, 0.02, 0, 0.08, 0.04, 0],
    [B, 0.008, 0.04, 0.012, 0, 0.075, -0.66, 0], [B, 0.05, 0.02, 0.2, 0, 0.075, -0.05, 3],
  ],
  bastion: [
    [B, 0.05, 0.08, 0.34, 0, 0.03, -0.06, 4], [B, 0.046, 0.05, 0.26, 0, 0.035, -0.35, 1], [C, 0.01, 0, 0.2, 0, 0.04, -0.56, 0],
    [C, 0.02, 0, 0.12, 0, 0.04, -0.7, 1], [B, 0.03, 0.15, 0.055, 0, -0.08, -0.12, 1, 0.08], [B, 0.034, 0.1, 0.045, 0, -0.06, 0.08, 1, -0.3],
    [B, 0.036, 0.06, 0.2, 0, 0.02, 0.24, 4], [B, 0.044, 0.09, 0.03, 0, 0.005, 0.35, 1], [B, 0.03, 0.02, 0.36, 0, 0.08, -0.12, 0],
    [B, 0.03, 0.034, 0.07, 0, 0.105, -0.06, 0], [C, 0.012, 0, 0.012, 0, 0.11, -0.1, 5],
  ],
  longshore: [
    [B, 0.05, 0.07, 0.36, 0, 0.03, -0.06, 4], [C, 0.012, 0, 0.62, 0, 0.045, -0.54, 0], [C, 0.019, 0, 0.1, 0, 0.045, -0.9, 0],
    [B, 0.046, 0.06, 0.3, 0, 0.01, 0.27, 4, 0.06], [B, 0.034, 0.1, 0.045, 0, -0.06, 0.07, 1, -0.3], [B, 0.03, 0.09, 0.06, 0, -0.05, -0.1, 0],
    [C, 0.026, 0, 0.3, 0, 0.12, -0.06, 0], [C, 0.032, 0, 0.06, 0, 0.12, -0.22, 0], [C, 0.027, 0, 0.012, 0, 0.12, -0.25, 5],
    [B, 0.014, 0.04, 0.03, 0, 0.09, -0.12, 0], [B, 0.014, 0.04, 0.03, 0, 0.09, 0.02, 0], [B, 0.012, 0.012, 0.07, 0.04, 0.05, 0.03, 3],
  ],
};

// Per weapon: where the muzzle is (z, y), where the off hand grips (z), and how it sits in view.
export const GUN_FIT = {
  wren: { muzzle: -0.17, bore: 0.045, off: 0.02, hold: [0.17, -0.2, -0.42] },
  mako: { muzzle: -0.24, bore: 0.05, off: 0.03, hold: [0.17, -0.2, -0.42] },
  vesper: { muzzle: -0.37, bore: 0.045, off: -0.2, hold: [0.16, -0.19, -0.36] },
  breaker: { muzzle: -0.68, bore: 0.055, off: -0.34, hold: [0.16, -0.2, -0.3] },
  halyard: { muzzle: -0.76, bore: 0.04, off: -0.32, hold: [0.16, -0.19, -0.3] },
  bastion: { muzzle: -0.77, bore: 0.04, off: -0.35, hold: [0.16, -0.19, -0.3] },
  longshore: { muzzle: -0.96, bore: 0.045, off: -0.3, hold: [0.15, -0.2, -0.26] },
};

/** Assemble a weapon model. Geometry is shared by nothing else, so a model can be disposed whole. */
export function buildGun(id) {
  const group = new THREE.Group();
  for (const [shape, a, b, c, x, y, z, mat, tilt] of PARTS[id]) {
    const geo = shape === B ? new THREE.BoxGeometry(a, b, c) : new THREE.CylinderGeometry(a, a, c, 14).rotateX(Math.PI / 2);
    const mesh = new THREE.Mesh(geo, MATS[mat]);
    mesh.position.set(x, y, z);
    if (tilt) mesh.rotation.x = tilt;
    mesh.castShadow = true;
    group.add(mesh);
  }
  return group;
}

/** A hand grenade, coloured by kind: olive frag, pale flash, grey smoke. */
export function buildNade(kind) {
  const color = kind === 'frag' ? 0x4a5a3a : kind === 'flash' ? 0xb8bcc0 : 0x5d646b;
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.1, 12), new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.4 }));
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.035, 8), MATS[3]);
  cap.position.y = 0.066;
  body.castShadow = true;
  group.add(body, cap);
  return group;
}
