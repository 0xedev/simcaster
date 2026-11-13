// Player intents: everything a click in the world can mean.
import { CATALOG, footprint } from '../../shared/catalog';
import type { PlayerState } from '../../shared/protocol';
import {
  ACTIONS, HOME_DOOR, TOWN, findPath, homeNav, nearestWalkable, townNav, walkable,
  type ActionId, type HomeItem, type Hotspot, type NavGrid, type Vec2,
} from '../../shared/world';
import { pending, send, simPos, walk } from './net';
import { store, type MenuOption } from './store';

let homeGridKey: HomeItem[] | null = null;
let homeGrid: NavGrid | null = null;

export function nav(): NavGrid {
  const { room, home } = store.getState();
  if (room.kind === 'town') return townNav();
  const items = home?.items || [];
  if (homeGridKey !== items || !homeGrid) {
    homeGrid = homeNav(items, footprint);
    homeGridKey = items;
  }
  return homeGrid;
}

function selfPos(): Vec2 | null {
  const p = simPos(store.getState().selfId);
  return p ? [p.x, p.z] : null;
}

export const DOOR_SPOT: Hotspot = {
  id: 'door', name: 'Front door', icon: '🚪', blurb: 'Back to town', x: HOME_DOOR[0], z: HOME_DOOR[1], face: 0, actions: ['leave_home'],
};

export function moveTo(x: number, z: number): boolean {
  const from = selfPos();
  if (!from) return false;
  const path = findPath(nav(), from, [x, z]);
  if (!path) return false;
  walk(path.slice(0, 20));
  return true;
}

function describe(action: ActionId): string {
  const d = ACTIONS[action];
  const bits: string[] = [];
  if (d.cost) bits.push(`−${d.cost} DEGEN`);
  if (d.pay) bits.push(`+${d.pay} DEGEN`);
  for (const [k, v] of Object.entries(d.needs)) if (v) bits.push(`${v > 0 ? '+' : '−'}${Math.abs(v)} ${k}`);
  if (d.seconds) bits.push(`${d.seconds}s`);
  return bits.join(' · ');
}

function blockedReason(action: ActionId): string | null {
  const d = ACTIONS[action];
  const me = store.getState().me;
  if (!me) return 'Not signed in';
  if (d.cost > me.degen) return 'Not enough DEGEN';
  if (d.minEnergy !== undefined && me.needs.energy < d.minEnergy) return 'Too tired';
  return null;
}

function goAndDo(target: string, action: ActionId, stand: Vec2) {
  const from = selfPos();
  if (!from) return;
  const st = store.getState();
  const def = ACTIONS[action];
  const navFn = def.nav
    ? () => {
        if (def.nav === 'arcade') st.set({ arcade: true });
        else if (def.nav === 'home') st.set({ room: { kind: 'home', owner: st.me!.fid } });
        else st.set({ room: { kind: 'town' } });
      }
    : undefined;
  const path = findPath(nav(), from, stand);
  if (!path) return st.notify("Can't get there");
  walk(path.slice(0, 20), { target, action, at: path[path.length - 1], nav: navFn });
}

export function hotspotMenu(spot: Hotspot, x: number, y: number) {
  const options: MenuOption[] = spot.actions.map((a) => {
    const why = blockedReason(a);
    return { label: ACTIONS[a].label, hint: why || describe(a), disabled: !!why, run: () => goAndDo(spot.id, a, [spot.x, spot.z]) };
  });
  store.getState().set({ menu: { x, y, title: `${spot.icon} ${spot.name}`, subtitle: spot.blurb, options } });
}

/** A walkable spot beside a piece of furniture, preferring the side nearest the sim. */
function standBeside(item: HomeItem): Vec2 | null {
  const g = nav();
  const f = footprint(item);
  const from = selfPos() || [0, 0];
  const cands: Vec2[] = [
    [item.x, item.z + f.hd + 0.7], [item.x, item.z - f.hd - 0.7], [item.x + f.hw + 0.7, item.z], [item.x - f.hw - 0.7, item.z],
  ];
  let best: Vec2 | null = null;
  let bestD = Infinity;
  for (const c of cands) {
    if (!walkable(g, c[0], c[1])) continue;
    const d = Math.hypot(c[0] - from[0], c[1] - from[1]);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best || nearestWalkable(g, item.x, item.z, 6);
}

export function furnitureMenu(item: HomeItem, x: number, y: number) {
  const entry = CATALOG[item.model];
  if (!entry?.actions?.length) return;
  const options: MenuOption[] = entry.actions.map((a) => {
    const why = blockedReason(a);
    return {
      label: ACTIONS[a].label, hint: why || describe(a), disabled: !!why,
      run: () => {
        const stand = standBeside(item);
        if (stand) goAndDo(item.id, a, stand);
        else store.getState().notify("Can't reach that");
      },
    };
  });
  store.getState().set({ menu: { x, y, title: entry.name, options } });
}

export function playerMenu(p: PlayerState, x: number, y: number) {
  const st = store.getState();
  const options: MenuOption[] = [
    { label: 'Wave', run: () => send({ t: 'emote', name: 'wave' }) },
    { label: 'Whisper…', hint: 'Private, this room only', run: () => st.set({ whisperTo: p.id }) },
    { label: 'Visit their apartment', run: () => st.set({ room: { kind: 'home', owner: p.fid } }) },
  ];
  if (p.fid < 900_000_000) {
    options.push({ label: 'Message on Farcaster ↗', hint: 'Opens a direct cast', run: () => window.open(`https://farcaster.xyz/~/inbox/create/${p.fid}`, '_blank', 'noopener') });
  }
  st.set({ menu: { x, y, title: p.name, subtitle: p.fid < 900_000_000 ? `fid ${p.fid}` : 'Demo visitor', options } });
}

export const hasPending = () => !!pending;
export { TOWN };
