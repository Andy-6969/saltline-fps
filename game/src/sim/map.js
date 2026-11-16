// Brinehouse Works, a salt refinery on a tidal quay, as data. Three lanes run from the slipway:
// Long Quay to the Pump House (A), the Yard to the Connector, the Packing Shed to the Silo Yard
// (B), with two cuts between them. Metres; x east, z south. Everything reads these boxes.

export const MAP_NAME = 'Brinehouse Works';
export const BOUNDS = { x0: -30, z0: -24, x1: 30, z1: 24 };

/** @type {{x0:number,y0:number,z0:number,x1:number,y1:number,z1:number,mat:string,thin:boolean,shape:string}[]} */
export const BOXES = [];
function box(x0, z0, x1, z1, y1, mat, shape = 'box', y0 = 0) {
  // Wood and sheet metal are thin: rifles punch through them at reduced damage.
  BOXES.push({ x0, y0, z0, x1, y1, z1, mat, shape, thin: mat === 'wood' || mat === 'sheet' });
}
const crate = (x, z, s = 1.6, h = 1.2) => box(x, z, x + s, z + s, h, 'wood');

// Perimeter.
box(-31, -25, 31, -24, 6.5, 'plaster');
box(-31, 24, 31, 25, 6.5, 'plaster');
box(-31, -24, -30, 24, 6.5, 'plaster');
box(30, -24, 31, 24, 6.5, 'plaster');
// The four blocks that make the lanes.
box(-22, 4, -6, 16, 7, 'brick'); // Net Loft
box(6, 4, 14, 16, 6, 'plaster'); // Chandlery
box(-22, -8, -6, 0, 6.5, 'plaster'); // Brine House
box(6, -8, 20, 0, 7, 'brick'); // Cooperage
// Harbor Watch spawn wall with its door to the Connector, and a blast wall that hides the spawn from the Yard.
box(-3.5, -18, 3.5, -17, 3, 'concrete');
box(-12, -15, -2, -13, 4, 'concrete');
box(2, -15, 12, -13, 4, 'concrete');
box(-2, -15, 2, -13, 4, 'concrete', 'box', 2.7);
// Site walls: each site has a spawn-side door and a Connector door.
for (const s of [-1, 1]) {
  const a = s < 0 ? -13 : 12;
  box(a, -24, a + 1, -21, 4, 'plaster');
  box(a, -18, a + 1, -12, 4, 'plaster');
  box(a, -9, a + 1, -8, 4, 'plaster');
  box(a, -21, a + 1, -18, 4, 'plaster', 'box', 2.7);
  box(a, -12, a + 1, -9, 4, 'plaster', 'box', 2.7);
}
// Chokes at the two outer site entrances.
box(-26, -9, -22, -8, 3.2, 'concrete');
box(20, -9, 25, -8, 3.2, 'concrete');
// Packing Shed: sheet-metal walls, a roof, two doors.
box(14, 16, 19, 17, 4.2, 'sheet');
box(23, 16, 30, 17, 4.2, 'sheet');
box(14, 4, 22, 5, 4.2, 'sheet');
box(26, 4, 30, 5, 4.2, 'sheet');
box(13.5, 3.5, 30, 17.5, 4.5, 'roof', 'box', 4.2);
box(21.7, 10.2, 22.3, 10.8, 4.2, 'metal');
// The Yard: a gatehouse wall hides it from the slipway spawn, a low wall splits it; the bridge over West Cut.
box(-4, 15, 4, 16, 4.5, 'brick');
box(-1, 7, 1, 12, 2.6, 'concrete');
box(-16, 0, -12, 4, 6, 'brick', 'box', 3.2);
// Cover. Long Quay:
crate(-30, 6);
crate(-23.6, -3);
crate(-23.4, -1.4, 1.2, 0.75);
box(-29.7, -5.7, -28.9, -4.9, 1.05, 'rust', 'barrel');
box(-28.8, -6.3, -28, -5.5, 1.05, 'rust', 'barrel');
// Yard and Connector. The tall stack in the Connector breaks the long sightline from the
// Watch House door up the Yard, so mid is fought at corners rather than across 30 m.
box(-0.9, -11.2, 0.9, -9.8, 2.6, 'wood');
crate(3, 1);
crate(-5.6, -3.4);
crate(-4, 13);
crate(-7.5, -12.6);
crate(5.5, -9.9);
// Slipway:
box(-19, 19.5, -13, 22, 2.6, 'container');
box(11, 20.5, 17, 23, 2.6, 'container');
crate(6, 18.5);
// Shed and Ramp:
box(15, 7, 17, 10, 1.2, 'wood');
crate(15, 10, 1.5, 2);
box(25, 9, 28, 11, 1.2, 'wood');
crate(20, 12.4);
crate(26.4, -3);
box(20.5, 1, 22.5, 2.6, 2, 'wood');
// Pump House (A): the pump, two salt mounds, crates.
box(-22, -16.5, -19.5, -14, 1.4, 'metal');
box(-29.6, -23.6, -25.6, -19.6, 2.6, 'salt', 'mound');
box(-19, -23.7, -15.5, -21.2, 2.2, 'salt', 'mound');
crate(-27, -12);
crate(-17.8, -9.6);
// Silo Yard (B): two silos, crates.
box(26, -23.6, 29.6, -20, 7.5, 'metal', 'silo');
box(21.4, -23.7, 24.6, -20.5, 7.5, 'metal', 'silo');
box(18.5, -16.5, 20.5, -14.5, 1.3, 'wood');
crate(26, -12.5);
crate(14, -17);
crate(-5, -22);

/** Where the charge may be planted. */
export const SITES = [
  { name: 'A', label: 'Pump House', x0: -26, z0: -20, x1: -16, z1: -11 },
  { name: 'B', label: 'Silo Yard', x0: 16, z0: -20, x1: 26, z1: -11 },
];
export function siteAt(x, z) {
  for (let i = 0; i < SITES.length; i++) {
    const s = SITES[i];
    if (x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1) return i;
  }
  return -1;
}

// Spawn rows, indexed by team (ATK, DEF): five places, facing the enemy.
export const SPAWNS = [
  { z: 20.8, yaw: 0, xs: [0, -1.6, 1.6, -3.2, 3.2] },
  { z: -19.6, yaw: Math.PI, xs: [0, -2.2, 2.2, -4.4, 4.4] },
];

// Attack routes per site, as waypoints a bot walks in order (paths between them come from nav.js).
// `nade` is the waypoint where a bot with utility throws it at the site before the push.
export const ROUTES = [
  [
    { name: 'Long Quay', nade: 2, pts: [[-26, 20], [-26, 6], [-27.5, -5], [-28, -10]] },
    { name: 'Connector', nade: 2, pts: [[-3.5, 10], [-3, -4], [-2, -10.5], [-10, -10.5]] },
    { name: 'West Cut', nade: 3, pts: [[-3.5, 10], [-4, 2], [-14, 2], [-26, 1], [-28, -10]] },
  ],
  [
    { name: 'Packing Shed', nade: 3, pts: [[21, 20], [20.5, 9], [24, 5], [27, -5], [27.5, -10]] },
    { name: 'Connector', nade: 2, pts: [[3.5, 10], [3, -4], [2, -10.5], [10, -10.5]] },
    { name: 'East Cut', nade: 3, pts: [[3.5, 10], [1.5, 2], [14, 2], [23, 0], [27.5, -10]] },
  ],
];

// Positions a defender holds: where to stand and the point to watch. Index 0/1 are sites, 2 is mid.
export const HOLDS = [
  [
    { x: -15, z: -22.3, lx: -28, lz: -9, crouch: false },
    { x: -24.6, z: -22.4, lx: -28, lz: -9, crouch: true },
    { x: -14.6, z: -10.5, lx: -2, lz: -10.5, crouch: false },
    { x: -20.8, z: -12.8, lx: -28, lz: -8, crouch: true },
  ],
  [
    { x: 15, z: -22.3, lx: 27.5, lz: -9, crouch: false },
    { x: 25.3, z: -19, lx: 27.5, lz: -9, crouch: true },
    { x: 14.6, z: -10.5, lx: 2, lz: -10.5, crouch: false },
    { x: 19.5, z: -13.4, lx: 27, lz: -8, crouch: true },
  ],
  [
    { x: 1.3, z: -16.6, lx: 0, lz: 0, crouch: false },
    { x: -4.8, z: -4.4, lx: 0, lz: 14, crouch: true },
    { x: 0, z: -12.4, lx: -8, lz: -10.5, crouch: false },
  ],
];

export const PLANT_SPOTS = [
  [[-23.6, -17.6], [-18, -13], [-24, -12.6]],
  [[22.2, -17.6], [17.5, -13], [24, -13]],
];

// Named places, for the HUD's location readout and the bots' radio calls. First match wins.
const REGIONS = [
  ['Pump House (A)', -30, -24, -13, -8],
  ['Silo Yard (B)', 13, -24, 30, -8],
  ['Watch House', -12, -24, 12, -15],
  ['Connector', -12, -13, 12, -8],
  ['Long Quay', -30, -8, -22, 16],
  ['West Cut', -22, 0, -6, 4],
  ['East Cut', 6, 0, 20, 4],
  ['Packing Shed', 14, 4, 30, 17],
  ['Ramp', 20, -8, 30, 4],
  ['Yard', -6, -8, 6, 16],
  ['Slipway', -30, 16, 30, 24],
];
export function regionAt(x, z) {
  for (let i = 0; i < REGIONS.length; i++) {
    const r = REGIONS[i];
    if (x >= r[1] && x <= r[3] && z >= r[2] && z <= r[4]) return r[0];
  }
  return MAP_NAME;
}
