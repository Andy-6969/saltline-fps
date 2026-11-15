// Navigation: a 1 m grid baked from the map's boxes and an A* search over it.
// Bots ask for a path between two points and get waypoints written into their own buffer.

import { BOUNDS, BOXES } from './map.js';
import { MOVE } from './config.js';

const W = BOUNDS.x1 - BOUNDS.x0;
const H = BOUNDS.z1 - BOUNDS.z0;
const N = W * H;
const blocked = new Uint8Array(N);
const gCost = new Float32Array(N);
const fCost = new Float32Array(N);
const parent = new Int32Array(N);
const stamp = new Uint32Array(N); // search id a cell was last opened in
const closed = new Uint32Array(N);
const heap = new Int32Array(N * 4);
const trail = new Int32Array(N);
let searchId = 0;

// A cell is blocked when a box at body height comes within a body's radius of its centre.
(function bake() {
  const pad = MOVE.radius + 0.12;
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const cx = BOUNDS.x0 + i + 0.5, cz = BOUNDS.z0 + j + 0.5;
      for (let k = 0; k < BOXES.length; k++) {
        const b = BOXES[k];
        if (b.y0 < 1.6 && b.y1 > MOVE.stepUp && cx > b.x0 - pad && cx < b.x1 + pad && cz > b.z0 - pad && cz < b.z1 + pad) {
          blocked[j * W + i] = 1;
          break;
        }
      }
    }
  }
})();

const cellOf = (x, z) => {
  const i = Math.min(W - 1, Math.max(0, Math.floor(x - BOUNDS.x0)));
  const j = Math.min(H - 1, Math.max(0, Math.floor(z - BOUNDS.z0)));
  return j * W + i;
};
export const isWalkable = (x, z) => !blocked[cellOf(x, z)];

// The nearest open cell to a point, searched in growing rings: goals may sit inside cover.
function openCell(x, z) {
  const c = cellOf(x, z);
  if (!blocked[c]) return c;
  const ci = c % W, cj = (c / W) | 0;
  for (let r = 1; r < 6; r++) {
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        const i = ci + di, j = cj + dj;
        if (i >= 0 && j >= 0 && i < W && j < H && !blocked[j * W + i]) return j * W + i;
      }
    }
  }
  return c;
}

/** Walkable straight line between two points, sampled every 0.3 m: used to straighten paths. */
export function lineWalkable(ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const steps = Math.ceil(Math.hypot(dx, dz) / 0.3);
  for (let s = 1; s < steps; s++) {
    if (blocked[cellOf(ax + (dx * s) / steps, az + (dz * s) / steps)]) return false;
  }
  return true;
}

function heapPush(n, cell) {
  let i = n;
  heap[i] = cell;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (fCost[heap[p]] <= fCost[cell]) break;
    heap[i] = heap[p];
    i = p;
  }
  heap[i] = cell;
  return n + 1;
}
function heapPop(n) {
  const top = heap[0];
  const last = heap[--n];
  let i = 0;
  for (;;) {
    let c = i * 2 + 1;
    if (c >= n) break;
    if (c + 1 < n && fCost[heap[c + 1]] < fCost[heap[c]]) c++;
    if (fCost[last] <= fCost[heap[c]]) break;
    heap[i] = heap[c];
    i = c;
  }
  heap[i] = last;
  heapSize = n;
  return top;
}
let heapSize = 0;

/**
 * A* from (ax,az) to (bx,bz). Writes x,z pairs into `out` (a Float32Array), straightened so a bot
 * walks corner to corner, and returns the number of waypoints (0 when no path exists).
 */
export function findPath(ax, az, bx, bz, out) {
  const start = openCell(ax, az), goal = openCell(bx, bz);
  const gi = goal % W, gj = (goal / W) | 0;
  searchId++;
  heapSize = heapPush(0, start);
  gCost[start] = 0;
  fCost[start] = 0;
  parent[start] = -1;
  stamp[start] = searchId;
  let found = false;
  while (heapSize > 0) {
    const cur = heapPop(heapSize);
    if (cur === goal) { found = true; break; }
    if (closed[cur] === searchId) continue;
    closed[cur] = searchId;
    const ci = cur % W, cj = (cur / W) | 0;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= W || j >= H) continue;
        const n = j * W + i;
        if (blocked[n] || closed[n] === searchId) continue;
        // No cutting a corner diagonally past a blocked cell.
        if (di && dj && (blocked[cj * W + i] || blocked[j * W + ci])) continue;
        const g = gCost[cur] + (di && dj ? 1.4142 : 1);
        if (stamp[n] === searchId && g >= gCost[n]) continue;
        stamp[n] = searchId;
        gCost[n] = g;
        fCost[n] = g + Math.hypot(i - gi, j - gj);
        parent[n] = cur;
        heapSize = heapPush(heapSize, n);
      }
    }
  }
  if (!found) return 0;
  let len = 0;
  for (let c = goal; c !== -1; c = parent[c]) trail[len++] = c;
  // Walk the trail from the start, keeping only the cells a straight line cannot skip.
  const max = out.length >> 1;
  let count = 0, px = ax, pz = az;
  for (let k = len - 2; k >= 0 && count < max - 1; k--) {
    const nx = BOUNDS.x0 + (trail[k] % W) + 0.5, nz = BOUNDS.z0 + ((trail[k] / W) | 0) + 0.5;
    if (k === 0 || !lineWalkable(px, pz, BOUNDS.x0 + (trail[k - 1] % W) + 0.5, BOUNDS.z0 + ((trail[k - 1] / W) | 0) + 0.5)) {
      out[count * 2] = nx;
      out[count * 2 + 1] = nz;
      count++;
      px = nx;
      pz = nz;
    }
  }
  if (!count) { out[0] = bx; out[1] = bz; count = 1; }
  return count;
}
