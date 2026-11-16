// Every tunable number of SALTLINE lives here: rules, movement, the armoury and the economy.
// The simulation reads these tables; nothing else in the game hard-codes a balance value.

export const TICK = 1 / 60; // fixed simulation step, seconds
export const ATK = 0;
export const DEF = 1;
export const TEAM_NAMES = ['Tide Runners', 'Harbor Watch'];
export const BOT_NAMES = [
  ['Marrow', 'Skiff', 'Brack', 'Loom', 'Dredge'],
  ['Pike', 'Ansel', 'Corwen', 'Hale', 'Tamsin'],
];

export const RULES = {
  teamSize: 5,
  winRounds: 7, // first team to seven rounds takes the match
  halfRounds: 6, // sides swap after six rounds
  freezeT: 7, // buy time before the round goes live
  roundT: 105,
  bombT: 40,
  overT: 6,
  buyT: 15, // seconds into a live round the buy menu stays open
  plantT: 3.2,
  defuseT: 8,
  defuseKitT: 4,
  blastRadius: 16,
  blastDamage: 320,
};

export const ECON = {
  start: 800,
  max: 16000,
  win: 3250,
  lossBase: 1400,
  lossStep: 500, // each consecutive loss pays this much more
  lossMax: 3400,
  plant: 300,
  defuse: 300,
};

export const MOVE = {
  radius: 0.32,
  standH: 1.8,
  crouchH: 1.25,
  eyeDrop: 0.16, // eyes sit this far under the top of the head
  run: 5.3,
  walkMul: 0.5, // shift-walk: slower, silent
  crouchMul: 0.36,
  accel: 52,
  friction: 9,
  airAccel: 9,
  jump: 5.6,
  gravity: 17.5,
  stepUp: 0.32,
  crouchRate: 7,
};

// kick/sway: recoil per shot (rad). spread: standing cone; moveSpread: extra at a full run, so
// stopping pays. falloff: damage kept per 10 m; armor: share through a vest; wall: through cover.
export const WEAPONS = {
  wren: { name: 'Wren-9', kind: 'pistol', slot: 1, price: 0, reward: 300, dmg: 26, head: 3.6, armor: 0.52, wall: 0.3,
    rate: 6.5, auto: false, mag: 12, reserve: 36, reload: 1.9, falloff: 0.86, spread: 0.007, moveSpread: 0.03,
    kick: 0.018, sway: 0.004, recover: 9, speed: 1, pellets: 1, zoom: 0 },
  mako: { name: 'Mako .50', kind: 'pistol', slot: 1, price: 700, reward: 300, dmg: 55, head: 3.4, armor: 0.9, wall: 0.5,
    rate: 3.6, auto: false, mag: 7, reserve: 28, reload: 2.2, falloff: 0.9, spread: 0.006, moveSpread: 0.06,
    kick: 0.05, sway: 0.008, recover: 6, speed: 0.97, pellets: 1, zoom: 0 },
  vesper: { name: 'Vesper SMG', kind: 'smg', slot: 0, price: 1250, reward: 600, dmg: 24, head: 3.4, armor: 0.6, wall: 0.3,
    rate: 13.5, auto: true, mag: 30, reserve: 90, reload: 2.3, falloff: 0.8, spread: 0.011, moveSpread: 0.022,
    kick: 0.011, sway: 0.007, recover: 10, speed: 0.98, pellets: 1, zoom: 0 },
  breaker: { name: 'Breaker-12', kind: 'shotgun', slot: 0, price: 1700, reward: 900, dmg: 19, head: 2, armor: 0.5, wall: 0,
    rate: 1.25, auto: false, mag: 6, reserve: 24, reload: 3.1, falloff: 0.55, spread: 0.055, moveSpread: 0.02,
    kick: 0.09, sway: 0.01, recover: 5, speed: 0.92, pellets: 9, zoom: 0 },
  halyard: { name: 'Halyard AR', kind: 'rifle', slot: 0, price: 2700, reward: 300, dmg: 34, head: 4, armor: 0.78, wall: 0.55,
    rate: 10, auto: true, mag: 30, reserve: 90, reload: 2.5, falloff: 0.93, spread: 0.0035, moveSpread: 0.075,
    kick: 0.021, sway: 0.011, recover: 7.5, speed: 0.9, pellets: 1, zoom: 0 },
  bastion: { name: 'Bastion CR', kind: 'rifle', slot: 0, price: 2950, reward: 300, dmg: 31, head: 4, armor: 0.72, wall: 0.5,
    rate: 11.2, auto: true, mag: 25, reserve: 75, reload: 2.9, falloff: 0.95, spread: 0.0026, moveSpread: 0.07,
    kick: 0.016, sway: 0.008, recover: 8.5, speed: 0.9, pellets: 1, zoom: 0 },
  longshore: { name: 'Longshore LR', kind: 'sniper', slot: 0, price: 4750, reward: 100, dmg: 112, head: 3, armor: 0.97, wall: 0.7,
    rate: 0.72, auto: false, mag: 5, reserve: 20, reload: 3.4, falloff: 0.99, spread: 0.04, moveSpread: 0.16,
    kick: 0.07, sway: 0.004, recover: 4, speed: 0.8, pellets: 1, zoom: 0.3 },
};

// Hand slots: 0 primary, 1 sidearm, then the grenades in this order (2 frag, 3 flash, 4 smoke).
export const NADE_KINDS = ['frag', 'flash', 'smoke'];
export const NADE_SLOT = { frag: 2, flash: 3, smoke: 4 };
export const NADES = {
  frag: { name: 'Frag', price: 300, fuse: 1.7, radius: 7.5, damage: 105, max: 1 },
  flash: { name: 'Flash', price: 200, fuse: 1.4, radius: 22, max: 2 },
  smoke: { name: 'Smoke', price: 300, fuse: 1.5, radius: 3.4, life: 15, max: 1 },
};
export const GEAR = {
  vest: { name: 'Vest', price: 650 },
  helm: { name: 'Vest + Helmet', price: 1000 },
  kit: { name: 'Defuse Kit', price: 400 },
};
// The order the buy menu lists things in; number keys 1-9 and 0 pick a row.
export const BUY_ORDER = ['mako', 'vesper', 'breaker', 'halyard', 'bastion', 'longshore', 'vest', 'helm', 'frag', 'flash', 'smoke', 'kit'];
