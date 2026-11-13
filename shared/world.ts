// World layout, navigation and movement rules. Imported by BOTH the client and the Worker so the
// renderer, the pathfinder and the server-side validator can never disagree about the map.

export type Vec2 = [number, number]; // [x, z] world units
export type RoomKind = 'town' | 'home';

export const WALK_SPEED = 5.2; // world units / second
export const INTERACT_RANGE = 3.2;
export const MAX_PATH_POINTS = 20;
export const MAX_PATH_LENGTH = 260;

// ---------------------------------------------------------------- town layout
export const TILE = 10; // KayKit city tiles are 2 units; rendered at CITY_SCALE
export const CITY_SCALE = 5;
export const TOWN_TILES = 7;
export const TOWN_HALF = (TOWN_TILES * TILE) / 2; // 35

// B = building lot, R = road, P = pedestrian plaza
const TOWN_MAP = [
  'BBBBBBB',
  'BRRRRRB',
  'BRPPPRB',
  'BRPPPRB',
  'BRPPPRB',
  'BRRRRRB',
  'BBBBBBB',
];

export interface Placement {
  model: string; // node name inside the pack GLB
  x: number;
  z: number;
  rot: number; // radians around Y
  scale: number;
  y?: number;
}

export interface Hotspot {
  id: string;
  name: string;
  icon: string;
  blurb: string;
  x: number; // where the sim stands
  z: number;
  face: number; // heading while using it
  actions: ActionId[];
  pose?: 'sit';
}

export type ActionId =
  | 'coffee' | 'meal' | 'work' | 'gig' | 'party' | 'arcade' | 'go_home' | 'rest'
  | 'sleep' | 'nap' | 'snack' | 'cook' | 'relax' | 'leave_home';

export interface ActionDef {
  label: string;
  seconds: number;
  cost: number; // DEGEN spent up front
  pay: number; // DEGEN earned on completion
  xp: number;
  needs: Partial<Record<NeedKey, number>>;
  minEnergy?: number;
  anim: 'Interact' | 'Use_Item' | 'Sit_Chair_Idle' | 'Lie_Idle' | 'Cheer' | 'Spellcasting' | 'PickUp';
  /** Client-side navigation instead of a timed activity. */
  nav?: 'arcade' | 'home' | 'town';
}

export type NeedKey = 'energy' | 'hunger' | 'fun' | 'social';
export const NEED_KEYS: NeedKey[] = ['energy', 'hunger', 'fun', 'social'];
// Points lost per hour of real time. Needs are computed lazily from a timestamp, never ticked.
export const NEED_DECAY_PER_HOUR: Record<NeedKey, number> = { energy: 6, hunger: 8, fun: 7, social: 5 };

export const ACTIONS: Record<ActionId, ActionDef> = {
  coffee: { label: 'Grab a coffee', seconds: 4, cost: 12, pay: 0, xp: 2, needs: { energy: 14, fun: 4 }, anim: 'Use_Item' },
  meal: { label: 'Eat a full meal', seconds: 6, cost: 25, pay: 0, xp: 3, needs: { hunger: 45, fun: 5 }, anim: 'Use_Item' },
  work: { label: 'Work a shift', seconds: 10, cost: 0, pay: 45, xp: 12, needs: { energy: -16, hunger: -8, fun: -6 }, minEnergy: 20, anim: 'Spellcasting' },
  gig: { label: 'Ship a quick gig', seconds: 6, cost: 0, pay: 22, xp: 6, needs: { energy: -9, fun: -3 }, minEnergy: 15, anim: 'Interact' },
  party: { label: 'Hit the dance floor', seconds: 7, cost: 15, pay: 0, xp: 4, needs: { fun: 38, social: 18, energy: -6 }, anim: 'Cheer' },
  arcade: { label: 'Play arcade games', seconds: 0, cost: 0, pay: 0, xp: 0, needs: {}, anim: 'Interact', nav: 'arcade' },
  go_home: { label: 'Go to my apartment', seconds: 0, cost: 0, pay: 0, xp: 0, needs: {}, anim: 'Interact', nav: 'home' },
  rest: { label: 'Sit for a while', seconds: 6, cost: 0, pay: 0, xp: 1, needs: { energy: 6, social: 4 }, anim: 'Sit_Chair_Idle' },
  sleep: { label: 'Sleep', seconds: 10, cost: 0, pay: 0, xp: 1, needs: { energy: 60 }, anim: 'Lie_Idle' },
  nap: { label: 'Take a nap', seconds: 6, cost: 0, pay: 0, xp: 1, needs: { energy: 22, fun: 4 }, anim: 'Sit_Chair_Idle' },
  relax: { label: 'Relax', seconds: 5, cost: 0, pay: 0, xp: 1, needs: { fun: 16, energy: 5 }, anim: 'Sit_Chair_Idle' },
  snack: { label: 'Grab a snack', seconds: 4, cost: 5, pay: 0, xp: 1, needs: { hunger: 18 }, anim: 'Use_Item' },
  cook: { label: 'Cook dinner', seconds: 8, cost: 8, pay: 0, xp: 3, needs: { hunger: 50, fun: 6, energy: -4 }, anim: 'Interact' },
  leave_home: { label: 'Head into town', seconds: 0, cost: 0, pay: 0, xp: 0, needs: {}, anim: 'Interact', nav: 'town' },
};

const tileCenter = (col: number, row: number): Vec2 => [
  (col - (TOWN_TILES - 1) / 2) * TILE,
  (row - (TOWN_TILES - 1) / 2) * TILE,
];

const BUILDINGS = ['building_A', 'building_B', 'building_C', 'building_D', 'building_E', 'building_F', 'building_G', 'building_H'];

export interface TownData {
  ground: Placement[]; // road + plaza tiles
  buildings: Placement[];
  props: Placement[];
  hotspots: Hotspot[];
  blockers: { x: number; z: number; hw: number; hd: number }[];
}

function buildTown(): TownData {
  const ground: Placement[] = [];
  const buildings: Placement[] = [];
  const props: Placement[] = [];
  const blockers: TownData['blockers'] = [];
  const at = (c: number, r: number) => (TOWN_MAP[r]?.[c] ?? ' ');
  let b = 0;
  for (let r = 0; r < TOWN_TILES; r++) {
    for (let c = 0; c < TOWN_TILES; c++) {
      const [x, z] = tileCenter(c, r);
      const kind = at(c, r);
      if (kind === 'B') {
        // Face the ring road: pick the direction of the nearest inner tile.
        const dx = c === 0 ? 1 : c === TOWN_TILES - 1 ? -1 : 0;
        const dz = r === 0 ? 1 : r === TOWN_TILES - 1 ? -1 : 0;
        const rot = dz !== 0 && (dx === 0 || (c + r) % 2 === 0) ? (dz > 0 ? 0 : Math.PI) : dx > 0 ? Math.PI / 2 : -Math.PI / 2;
        buildings.push({ model: BUILDINGS[(b * 3 + (b >> 2)) % BUILDINGS.length], x, z, rot, scale: CITY_SCALE });
        b++;
      } else if (kind === 'R') {
        const n = at(c, r - 1) === 'R', s = at(c, r + 1) === 'R', w = at(c - 1, r) === 'R', e = at(c + 1, r) === 'R';
        let model = 'road_straight';
        let rot = 0;
        if ((n || s) && (w || e)) {
          model = 'road_corner_curved';
          // Model's default corner joins +X and +Z (verified against the GLB).
          rot = s && e ? 0 : s && w ? -Math.PI / 2 : n && w ? Math.PI : Math.PI / 2;
        } else if (w || e) {
          rot = Math.PI / 2;
          if (c === 3) model = 'road_straight_crossing';
        } else if (r === 3) {
          model = 'road_straight_crossing';
        }
        ground.push({ model, x, z, rot, scale: CITY_SCALE });
      } else {
        ground.push({ model: 'base', x, z, rot: 0, scale: CITY_SCALE });
      }
    }
  }

  const prop = (model: string, x: number, z: number, rot = 0, block?: [number, number], scale = CITY_SCALE) => {
    props.push({ model, x, z, rot, scale });
    if (block) blockers.push({ x, z, hw: block[0], hd: block[1] });
  };
  // Plaza dressing
  prop('watertower', 0, 0, 0, [1.6, 1.6], 6.5);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as Vec2[]) {
    prop('streetlight', sx * 13.2, sz * 13.2, sx > 0 ? Math.PI : 0);
    prop('bush', sx * 11.4, sz * 13.4, 0, undefined, 7);
    prop('bush', sx * 13.4, sz * 11.4, 0.8, undefined, 7);
    prop('bush', sx * 3.2, sz * 3.2, 0.4, undefined, 6);
  }
  const benches: [number, number, number][] = [[-7, 0, Math.PI / 2], [7, 0, -Math.PI / 2], [0, -7, 0], [0, 7, Math.PI]];
  for (const [x, z, rot] of benches) prop('bench', x, z, rot, [1.2, 0.6]);
  prop('dumpster', -13.2, 5.5, Math.PI / 2, [1.0, 1.5]);
  prop('firehydrant', 13.6, -6, 0);
  prop('box_A', -12.6, 8.2, 0.3);
  prop('box_B', -11.8, 7.4, 1.1);
  // Parked cars on the ring road (kept to the kerb so the road stays walkable)
  prop('car_taxi', -17.6, -22.4, Math.PI / 2, [2.6, 1.3]);
  prop('car_sedan', 0.5, -22.6, Math.PI / 2, [2.6, 1.3]);
  prop('car_hatchback', 22.4, 11, 0, [1.3, 2.4]);
  prop('car_stationwagon', -22.4, -8, 0, [1.3, 2.6]);
  prop('car_police', 0.5, 22.6, -Math.PI / 2, [2.6, 1.3]);
  prop('trafficlight_A', -15.6, -15.6, 0);
  prop('trafficlight_A', 15.6, 15.6, Math.PI);

  const hotspots: Hotspot[] = [
    { id: 'cafe', name: 'Warp Bean Café', icon: '☕', blurb: 'Coffee and hot food', x: -10, z: -23.4, face: Math.PI, actions: ['coffee', 'meal'] },
    { id: 'foundry', name: 'The Foundry', icon: '💻', blurb: 'Ship things, get paid', x: 10, z: -23.4, face: Math.PI, actions: ['work', 'gig'] },
    { id: 'lounge', name: 'Purple Lounge', icon: '🎧', blurb: 'Music and people', x: 23.4, z: 0, face: Math.PI / 2, actions: ['party'] },
    { id: 'arcade', name: 'Arcade', icon: '🕹️', blurb: 'Mini-games for DEGEN', x: 10, z: 23.4, face: 0, actions: ['arcade'] },
    { id: 'apartments', name: 'Apartments', icon: '🏠', blurb: 'Your own place', x: -10, z: 23.4, face: 0, actions: ['go_home'] },
    ...benches.map(([x, z, rot], i): Hotspot => ({
      id: 'bench' + i, name: 'Bench', icon: '🪑', blurb: 'Take a seat',
      x: x + Math.sin(rot) * 0.2, z: z + Math.cos(rot) * 0.2, face: rot, actions: ['rest'], pose: 'sit',
    })),
  ];
  return { ground, buildings, props, hotspots, blockers };
}

export const TOWN: TownData = buildTown();

// ---------------------------------------------------------------- home layout
export const HOME_W = 16; // cells (1 unit each), x axis
export const HOME_D = 12; // z axis
export const HOME_DOOR: Vec2 = [0, HOME_D / 2 - 0.8];

export interface HomeItem {
  id: string;
  model: string; // catalog key
  x: number; // centre, world units (snapped to 0.5)
  z: number;
  rot: 0 | 1 | 2 | 3; // quarter turns
}

// ---------------------------------------------------------------- nav grid
export interface NavGrid {
  w: number;
  h: number;
  ox: number; // world x of cell 0's min edge
  oz: number;
  cell: number;
  blocked: Uint8Array;
}

function makeGrid(w: number, h: number, cell: number): NavGrid {
  return { w, h, cell, ox: (-w * cell) / 2, oz: (-h * cell) / 2, blocked: new Uint8Array(w * h) };
}

function blockRect(g: NavGrid, x: number, z: number, hw: number, hd: number, pad = 0.35) {
  const x0 = Math.floor((x - hw - pad - g.ox) / g.cell), x1 = Math.floor((x + hw + pad - g.ox) / g.cell);
  const z0 = Math.floor((z - hd - pad - g.oz) / g.cell), z1 = Math.floor((z + hd + pad - g.oz) / g.cell);
  for (let cz = Math.max(0, z0); cz <= Math.min(g.h - 1, z1); cz++) {
    for (let cx = Math.max(0, x0); cx <= Math.min(g.w - 1, x1); cx++) g.blocked[cz * g.w + cx] = 1;
  }
}

let townGrid: NavGrid | null = null;
export function townNav(): NavGrid {
  if (townGrid) return townGrid;
  const g = makeGrid(TOWN_TILES * TILE, TOWN_TILES * TILE, 1);
  for (const b of TOWN.buildings) blockRect(g, b.x, b.z, TILE / 2, TILE / 2, -0.01);
  for (const b of TOWN.blockers) blockRect(g, b.x, b.z, b.hw, b.hd);
  // Hotspot standing cells always stay open, even next to a blocker.
  for (const h of TOWN.hotspots) g.blocked[cellIndex(g, h.x, h.z)] = 0;
  townGrid = g;
  return g;
}

export function homeNav(items: HomeItem[], footprint: (item: HomeItem) => { hw: number; hd: number; solid: boolean }): NavGrid {
  const g = makeGrid(HOME_W * 2, HOME_D * 2, 0.5);
  for (const it of items) {
    const f = footprint(it);
    if (f.solid) blockRect(g, it.x, it.z, f.hw, f.hd, 0.12);
  }
  g.blocked[cellIndex(g, HOME_DOOR[0], HOME_DOOR[1])] = 0;
  return g;
}

export function cellIndex(g: NavGrid, x: number, z: number): number {
  const cx = Math.min(g.w - 1, Math.max(0, Math.floor((x - g.ox) / g.cell)));
  const cz = Math.min(g.h - 1, Math.max(0, Math.floor((z - g.oz) / g.cell)));
  return cz * g.w + cx;
}

export function inBounds(g: NavGrid, x: number, z: number): boolean {
  return x >= g.ox && z >= g.oz && x < g.ox + g.w * g.cell && z < g.oz + g.h * g.cell;
}

export function walkable(g: NavGrid, x: number, z: number): boolean {
  return inBounds(g, x, z) && g.blocked[cellIndex(g, x, z)] === 0;
}

/** True when the straight segment a→b stays on walkable cells (sampled at a quarter cell). */
export function clearLine(g: NavGrid, a: Vec2, b: Vec2): boolean {
  const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const steps = Math.max(1, Math.ceil(dist / (g.cell * 0.25)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!walkable(g, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return false;
  }
  return true;
}

/** Nearest walkable point to (x,z), searched in growing rings. */
export function nearestWalkable(g: NavGrid, x: number, z: number, maxRing = 14): Vec2 | null {
  if (walkable(g, x, z)) return [x, z];
  const cx = Math.floor((x - g.ox) / g.cell), cz = Math.floor((z - g.oz) / g.cell);
  let best: Vec2 | null = null;
  let bestD = Infinity;
  for (let ring = 1; ring <= maxRing && !best; ring++) {
    for (let dz = -ring; dz <= ring; dz++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= g.w || nz >= g.h || g.blocked[nz * g.w + nx]) continue;
        const wx = g.ox + (nx + 0.5) * g.cell, wz = g.oz + (nz + 0.5) * g.cell;
        const d = Math.hypot(wx - x, wz - z);
        if (d < bestD) { bestD = d; best = [wx, wz]; }
      }
    }
  }
  return best;
}

/** A* over the grid (8-way, no corner cutting) followed by line-of-sight smoothing. */
export function findPath(g: NavGrid, from: Vec2, to: Vec2): Vec2[] | null {
  const start = nearestWalkable(g, from[0], from[1]);
  const goal = nearestWalkable(g, to[0], to[1]);
  if (!start || !goal) return null;
  if (clearLine(g, start, goal)) return [start, goal];
  const si = cellIndex(g, start[0], start[1]), gi = cellIndex(g, goal[0], goal[1]);
  const n = g.w * g.h;
  const gScore = new Float32Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const heap: number[] = [];
  const f = new Float32Array(n).fill(Infinity);
  const gx = gi % g.w, gz = (gi / g.w) | 0;
  const hcost = (i: number) => {
    const dx = Math.abs((i % g.w) - gx), dz = Math.abs(((i / g.w) | 0) - gz);
    return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz);
  };
  const push = (i: number) => {
    heap.push(i);
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (f[heap[p]] <= f[heap[c]]) break;
      [heap[p], heap[c]] = [heap[c], heap[p]];
      c = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let p = 0;
      for (;;) {
        const l = p * 2 + 1, r = l + 1;
        let m = p;
        if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l;
        if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r;
        if (m === p) break;
        [heap[p], heap[m]] = [heap[m], heap[p]];
        p = m;
      }
    }
    return top;
  };
  gScore[si] = 0;
  f[si] = hcost(si);
  push(si);
  let found = false;
  while (heap.length) {
    const cur = pop();
    if (cur === gi) { found = true; break; }
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % g.w, cz = (cur / g.w) | 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= g.w || nz >= g.h) continue;
        const ni = nz * g.w + nx;
        if (g.blocked[ni] || closed[ni]) continue;
        if (dx && dz && (g.blocked[cz * g.w + nx] || g.blocked[nz * g.w + cx])) continue;
        const cost = gScore[cur] + (dx && dz ? 1.4142 : 1);
        if (cost < gScore[ni]) {
          gScore[ni] = cost;
          came[ni] = cur;
          f[ni] = cost + hcost(ni);
          push(ni);
        }
      }
    }
  }
  if (!found) return null;
  const cells: Vec2[] = [];
  for (let i = gi; i !== -1; i = came[i]) {
    cells.push([g.ox + ((i % g.w) + 0.5) * g.cell, g.oz + (((i / g.w) | 0) + 0.5) * g.cell]);
  }
  cells.reverse();
  cells[0] = start;
  cells[cells.length - 1] = goal;
  // String-pull: keep only the corners that are needed.
  const out: Vec2[] = [cells[0]];
  let anchor = 0;
  while (anchor < cells.length - 1) {
    let next = cells.length - 1;
    while (next > anchor + 1 && !clearLine(g, cells[anchor], cells[next])) next--;
    out.push(cells[next]);
    anchor = next;
  }
  return out;
}

// ---------------------------------------------------------------- movement along a path
export function pathLength(path: Vec2[]): number {
  let len = 0;
  for (let i = 1; i < path.length; i++) len += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
  return len;
}

export interface PathSample { x: number; z: number; heading: number; moving: boolean }

/** Where a sim that started `path` at time t0 is at time `now` (ms). Deterministic on every machine. */
export function samplePath(path: Vec2[], t0: number, now: number, speed = WALK_SPEED, out?: PathSample): PathSample {
  const res = out || { x: 0, z: 0, heading: 0, moving: false };
  if (!path.length) { res.moving = false; return res; }
  let remaining = (Math.max(0, now - t0) / 1000) * speed;
  for (let i = 1; i < path.length; i++) {
    const ax = path[i - 1][0], az = path[i - 1][1], bx = path[i][0], bz = path[i][1];
    const seg = Math.hypot(bx - ax, bz - az);
    if (seg < 1e-6) continue;
    res.heading = Math.atan2(bx - ax, bz - az);
    if (remaining < seg) {
      const t = remaining / seg;
      res.x = ax + (bx - ax) * t;
      res.z = az + (bz - az) * t;
      res.moving = true;
      return res;
    }
    remaining -= seg;
  }
  const last = path[path.length - 1];
  res.x = last[0];
  res.z = last[1];
  res.moving = false;
  return res;
}

/** Server-side check of a client-proposed path. Returns a cleaned path or null. */
export function validatePath(g: NavGrid, raw: unknown, current: Vec2): Vec2[] | null {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > MAX_PATH_POINTS) return null;
  const path: Vec2[] = [];
  for (const p of raw) {
    if (!Array.isArray(p) || p.length !== 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
    path.push([Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]);
  }
  // The client predicts its own position; allow a little latency drift but no teleporting.
  if (Math.hypot(path[0][0] - current[0], path[0][1] - current[1]) > 4) return null;
  if (pathLength(path) > MAX_PATH_LENGTH) return null;
  for (let i = 1; i < path.length; i++) if (!clearLine(g, path[i - 1], path[i])) return null;
  return path;
}
