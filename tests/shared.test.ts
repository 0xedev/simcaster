import { describe, expect, it } from 'vitest';
import { CATALOG, CATALOG_LIST, STARTER_HOME, cleanLook, footprint, placementError } from '../shared/catalog';
import { GAMES, gameReward } from '../shared/protocol';
import {
  ACTIONS, HOME_DOOR, TOWN, WALK_SPEED, clearLine, findPath, homeNav, pathLength, samplePath, townNav, validatePath, walkable,
  type HomeItem, type Vec2,
} from '../shared/world';

describe('town navigation', () => {
  const g = townNav();
  it('can reach every hotspot from the spawn area', () => {
    for (const h of TOWN.hotspots) {
      const path = findPath(g, [0, 10], [h.x, h.z]);
      expect(path, h.id).not.toBeNull();
      const end = path![path!.length - 1];
      expect(Math.hypot(end[0] - h.x, end[1] - h.z), h.id).toBeLessThan(1.5);
    }
  });
  it('never routes through a building', () => {
    const path = findPath(g, [-20, -20], [20, 20])!;
    for (let i = 1; i < path.length; i++) expect(clearLine(g, path[i - 1], path[i])).toBe(true);
    for (const b of TOWN.buildings) expect(walkable(g, b.x, b.z)).toBe(false);
  });
  it('gives hotspot actions that exist', () => {
    for (const h of TOWN.hotspots) for (const a of h.actions) expect(ACTIONS[a]).toBeDefined();
  });
});

describe('server path validation', () => {
  const g = townNav();
  it('accepts a path the pathfinder produced', () => {
    const path = findPath(g, [0, 10], [-10, -23.4])!;
    expect(validatePath(g, path, [0, 10])).not.toBeNull();
  });
  it('rejects teleports, wall-walking and junk', () => {
    expect(validatePath(g, [[20, 20], [21, 20]], [0, 10])).toBeNull(); // starts far from where the sim is
    expect(validatePath(g, [[0, 10], [0, -34]], [0, 10])).toBeNull(); // straight through the water tower and a building
    expect(validatePath(g, [[0, 10], [NaN, 3]], [0, 10])).toBeNull();
    expect(validatePath(g, 'nope', [0, 10])).toBeNull();
    expect(validatePath(g, Array.from({ length: 40 }, (_, i) => [i * 0.1, 10]), [0, 10])).toBeNull();
  });
});

describe('deterministic movement', () => {
  it('samples the same position on every machine', () => {
    const path: Vec2[] = [[0, 0], [10, 0], [10, 10]];
    expect(samplePath(path, 0, 0)).toMatchObject({ x: 0, z: 0 });
    const mid = samplePath(path, 0, 1000, WALK_SPEED, { x: 0, z: 0, heading: 0, moving: false });
    expect(mid.x).toBeCloseTo(WALK_SPEED);
    expect(mid.moving).toBe(true);
    const end = samplePath(path, 0, 60_000);
    expect(end).toMatchObject({ x: 10, z: 10, moving: false });
    expect(pathLength(path)).toBe(20);
  });
});

describe('homes', () => {
  it('starter home is legal and leaves the door reachable', () => {
    for (const item of STARTER_HOME) expect(placementError(item, STARTER_HOME), item.model).toBeNull();
    const g = homeNav(STARTER_HOME, footprint);
    for (const item of STARTER_HOME.filter((i) => CATALOG[i.model].solid)) {
      const f = footprint(item);
      expect(findPath(g, HOME_DOOR, [item.x, item.z + f.hd + 0.7]), item.model).not.toBeNull();
    }
  });
  it('rejects overlaps, off-grid, out-of-room and unknown items', () => {
    const bed: HomeItem = { id: 'a', model: 'furniture/bed_double_A', x: 0, z: 0, rot: 0 };
    expect(placementError({ id: 'b', model: 'furniture/couch', x: 0.5, z: 0, rot: 0 }, [bed])).toMatch(/Overlaps/);
    expect(placementError({ id: 'b', model: 'furniture/couch', x: 0.3, z: -4, rot: 0 }, [bed])).toMatch(/grid/);
    expect(placementError({ id: 'b', model: 'furniture/couch', x: 40, z: 0, rot: 0 }, [bed])).toMatch(/Outside/);
    expect(placementError({ id: 'b', model: 'furniture/nope', x: 0, z: 0, rot: 0 }, [bed])).toMatch(/Unknown/);
    expect(placementError({ id: 'b', model: 'furniture/rug_oval_A', x: 0, z: 0, rot: 0 }, [bed])).toBeNull(); // rugs go under things
    expect(placementError({ id: 'b', model: 'furniture/couch', x: 0, z: 5, rot: 0 }, [])).toMatch(/doorway/);
  });
  it('every catalog entry has sane dimensions and actions', () => {
    for (const e of CATALOG_LIST) {
      expect(e.w, e.key).toBeGreaterThan(0.1);
      expect(e.price, e.key).toBeGreaterThan(0);
      for (const a of e.actions || []) expect(ACTIONS[a], e.key).toBeDefined();
    }
  });
});

describe('avatars and games', () => {
  it('cleans untrusted avatar input', () => {
    expect(cleanLook({ char: 'dragon', tint: 999, hat: 'yes' }, 5)).toMatchObject({ hat: true, cape: false });
    expect(cleanLook({ char: 'mage', tint: 2, hat: false, cape: true })).toEqual({ char: 'mage', tint: 2, hat: false, cape: true });
  });
  it('caps rewards at the game maximum', () => {
    expect(gameReward('stacker', 9999)).toBe(gameReward('stacker', GAMES.stacker.maxScore));
    expect(gameReward('catcher', -5)).toBe(0);
  });
});
