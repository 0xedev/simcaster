// Furniture catalog and avatar options, shared by the build-mode UI and the server validator.
import models from './models.json';
import { HOME_D, HOME_W, type ActionId, type HomeItem } from './world';

export type Pack = 'furniture' | 'kitchen';
export interface CatalogEntry {
  key: string;
  pack: Pack;
  model: string;
  name: string;
  category: 'Seating' | 'Beds' | 'Tables' | 'Storage' | 'Kitchen' | 'Decor' | 'Rugs';
  price: number;
  solid: boolean; // blocks walking
  wall?: boolean; // hangs on a wall (not grid-blocking, raised)
  actions?: ActionId[];
  w: number; // footprint along x at rot 0
  d: number;
  h: number;
  cx: number; // model-space centre offset
  cz: number;
}

type Bounds = { min: number[]; max: number[] };
const bounds = models as unknown as Record<string, Record<string, Bounds>>;

function entry(
  pack: Pack, model: string, name: string, category: CatalogEntry['category'], price: number,
  opts: { solid?: boolean; wall?: boolean; actions?: ActionId[] } = {},
): CatalogEntry {
  const b = bounds[pack][model];
  if (!b) throw new Error(`catalog: unknown model ${pack}/${model}`);
  return {
    key: `${pack}/${model}`, pack, model, name, category, price,
    solid: opts.solid ?? true, wall: opts.wall, actions: opts.actions,
    w: b.max[0] - b.min[0], d: b.max[2] - b.min[2], h: b.max[1] - b.min[1],
    cx: (b.max[0] + b.min[0]) / 2, cz: (b.max[2] + b.min[2]) / 2,
  };
}

const LIST: CatalogEntry[] = [
  entry('furniture', 'bed_single_A', 'Single bed', 'Beds', 120, { actions: ['sleep'] }),
  entry('furniture', 'bed_single_B', 'Single bed (blue)', 'Beds', 120, { actions: ['sleep'] }),
  entry('furniture', 'bed_double_A', 'Double bed', 'Beds', 260, { actions: ['sleep'] }),
  entry('furniture', 'bed_double_B', 'Double bed (blue)', 'Beds', 260, { actions: ['sleep'] }),
  entry('furniture', 'couch', 'Couch', 'Seating', 180, { actions: ['relax', 'nap'] }),
  entry('furniture', 'couch_pillows', 'Couch with pillows', 'Seating', 210, { actions: ['relax', 'nap'] }),
  entry('furniture', 'armchair', 'Armchair', 'Seating', 110, { actions: ['relax'] }),
  entry('furniture', 'armchair_pillows', 'Armchair with pillow', 'Seating', 125, { actions: ['relax'] }),
  entry('furniture', 'chair_A', 'Dining chair', 'Seating', 40, { actions: ['relax'] }),
  entry('furniture', 'chair_A_wood', 'Wooden chair', 'Seating', 35, { actions: ['relax'] }),
  entry('furniture', 'chair_B', 'Cushioned chair', 'Seating', 45, { actions: ['relax'] }),
  entry('furniture', 'chair_C', 'Desk chair', 'Seating', 55, { actions: ['relax'] }),
  entry('furniture', 'chair_stool', 'Stool', 'Seating', 25, { actions: ['relax'] }),
  entry('furniture', 'table_small', 'Side table', 'Tables', 45),
  entry('furniture', 'table_low', 'Coffee table', 'Tables', 70),
  entry('furniture', 'table_medium', 'Dining table', 'Tables', 110),
  entry('furniture', 'table_medium_long', 'Long table', 'Tables', 140),
  entry('furniture', 'cabinet_small', 'Small cabinet', 'Storage', 60),
  entry('furniture', 'cabinet_small_decorated', 'Small cabinet, styled', 'Storage', 80),
  entry('furniture', 'cabinet_medium', 'Cabinet', 'Storage', 95),
  entry('furniture', 'cabinet_medium_decorated', 'Cabinet, styled', 'Storage', 125),
  entry('kitchen', 'fridge_A', 'Fridge', 'Kitchen', 220, { actions: ['snack'] }),
  entry('kitchen', 'stove_multi', 'Stove', 'Kitchen', 240, { actions: ['cook'] }),
  entry('kitchen', 'oven', 'Oven', 'Kitchen', 260, { actions: ['cook'] }),
  entry('kitchen', 'kitchencounter_straight_A', 'Counter', 'Kitchen', 90),
  entry('kitchen', 'kitchencounter_sink', 'Sink counter', 'Kitchen', 130),
  entry('kitchen', 'table_round_A', 'Round table', 'Tables', 150),
  entry('furniture', 'lamp_standing', 'Floor lamp', 'Decor', 60),
  entry('furniture', 'lamp_table', 'Table lamp', 'Decor', 35, { solid: false }),
  entry('furniture', 'cactus_medium_A', 'Cactus', 'Decor', 30),
  entry('furniture', 'cactus_small_A', 'Small cactus', 'Decor', 18, { solid: false }),
  entry('furniture', 'book_set', 'Books', 'Decor', 15, { solid: false }),
  entry('furniture', 'pictureframe_standing_A', 'Standing frame', 'Decor', 20, { solid: false }),
  entry('furniture', 'pictureframe_large_A', 'Large picture', 'Decor', 40, { solid: false, wall: true }),
  entry('furniture', 'pictureframe_large_B', 'Wide picture', 'Decor', 60, { solid: false, wall: true }),
  entry('furniture', 'pictureframe_medium', 'Picture', 'Decor', 30, { solid: false, wall: true }),
  entry('furniture', 'shelf_B_large_decorated', 'Wall shelf, styled', 'Decor', 70, { solid: false, wall: true }),
  entry('furniture', 'shelf_A_big', 'Wall shelf', 'Decor', 40, { solid: false, wall: true }),
  entry('furniture', 'rug_rectangle_A', 'Rug', 'Rugs', 50, { solid: false }),
  entry('furniture', 'rug_rectangle_stripes_A', 'Striped rug', 'Rugs', 55, { solid: false }),
  entry('furniture', 'rug_oval_A', 'Oval rug', 'Rugs', 55, { solid: false }),
  entry('furniture', 'rug_oval_B', 'Oval rug (warm)', 'Rugs', 55, { solid: false }),
];

export const CATALOG: Record<string, CatalogEntry> = Object.fromEntries(LIST.map((e) => [e.key, e]));
export const CATALOG_LIST = LIST;
export const MAX_HOME_ITEMS = 40;
export const SELL_BACK = 0.5;

/** Half extents of an item on the floor, accounting for rotation. */
export function footprint(item: Pick<HomeItem, 'model' | 'rot'>): { hw: number; hd: number; solid: boolean } {
  const e = CATALOG[item.model];
  if (!e) return { hw: 0.5, hd: 0.5, solid: false };
  const turned = item.rot % 2 === 1;
  return { hw: (turned ? e.d : e.w) / 2, hd: (turned ? e.w : e.d) / 2, solid: e.solid };
}

const overlaps = (a: HomeItem, b: HomeItem) => {
  const fa = footprint(a), fb = footprint(b);
  return Math.abs(a.x - b.x) < fa.hw + fb.hw - 0.05 && Math.abs(a.z - b.z) < fa.hd + fb.hd - 0.05;
};

/** Why `item` cannot be placed among `others`, or null when the placement is legal. */
export function placementError(item: HomeItem, others: HomeItem[]): string | null {
  const e = CATALOG[item.model];
  if (!e) return 'Unknown item';
  if (![0, 1, 2, 3].includes(item.rot)) return 'Bad rotation';
  if (!Number.isFinite(item.x) || !Number.isFinite(item.z)) return 'Bad position';
  if (Math.abs(item.x * 2 - Math.round(item.x * 2)) > 1e-6 || Math.abs(item.z * 2 - Math.round(item.z * 2)) > 1e-6) return 'Off grid';
  const f = footprint(item);
  if (item.x - f.hw < -HOME_W / 2 - 0.01 || item.x + f.hw > HOME_W / 2 + 0.01) return 'Outside the room';
  if (item.z - f.hd < -HOME_D / 2 - 0.01 || item.z + f.hd > HOME_D / 2 + 0.01) return 'Outside the room';
  if (e.wall) {
    const againstWall = Math.abs(item.z - f.hd + HOME_D / 2) < 0.3 || Math.abs(item.x - f.hw + HOME_W / 2) < 0.3 || Math.abs(item.x + f.hw - HOME_W / 2) < 0.3;
    if (!againstWall) return 'Hang it on a wall';
  }
  // The doorway must stay clear.
  if (e.solid && Math.abs(item.x) < f.hw + 1 && item.z + f.hd > HOME_D / 2 - 1.6) return 'Keep the doorway clear';
  for (const o of others) {
    if (o.id === item.id) continue;
    const oe = CATALOG[o.model];
    if (!oe) continue;
    // Rugs sit under things, wall items above things; only like-with-like collides.
    const layer = (c: CatalogEntry) => (c.wall ? 'wall' : c.category === 'Rugs' ? 'rug' : c.solid ? 'solid' : 'small');
    const la = layer(e), lb = layer(oe);
    const clash = la === lb ? la !== 'small' : false;
    if (clash && overlaps(item, o)) return 'Overlaps another item';
  }
  return null;
}

export const STARTER_HOME: HomeItem[] = [
  { id: 's1', model: 'furniture/bed_single_A', x: -6.5, z: -4.5, rot: 0 },
  { id: 's2', model: 'furniture/couch', x: 1.5, z: -5, rot: 0 },
  { id: 's3', model: 'furniture/rug_rectangle_A', x: 1.5, z: -2.5, rot: 0 },
  { id: 's4', model: 'kitchen/fridge_A', x: 6.5, z: -4.5, rot: 0 },
  { id: 's5', model: 'furniture/table_low', x: 1.5, z: -2.5, rot: 0 },
];

// ---------------------------------------------------------------- avatars
export const CHARACTERS = ['rogue', 'mage', 'knight', 'barbarian', 'rogue_hooded'] as const;
export type CharacterId = (typeof CHARACTERS)[number];
export const CHARACTER_NAMES: Record<CharacterId, string> = {
  rogue: 'Scout', mage: 'Sage', knight: 'Guard', barbarian: 'Brawler', rogue_hooded: 'Hood',
};
export const TINTS = ['#ffffff', '#ffd9c2', '#c9e4ff', '#d6ffd9', '#f3d1ff', '#fff2b8', '#ffc9d6', '#c2fff3'];

export interface AvatarLook { char: CharacterId; tint: number; hat: boolean; cape: boolean }

export function cleanLook(raw: unknown, seed = 0): AvatarLook {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const char = CHARACTERS.includes(r.char as CharacterId) ? (r.char as CharacterId) : CHARACTERS[Math.abs(seed) % CHARACTERS.length];
  const tint = Number.isInteger(r.tint) && (r.tint as number) >= 0 && (r.tint as number) < TINTS.length ? (r.tint as number) : Math.abs(seed >> 3) % TINTS.length;
  return { char, tint, hat: r.hat !== false, cape: r.cape === true };
}
