export const WORLD_SIZE = 19;
export const PLAYER_SPEED = 4.2;
export const ARENA_SIZE = 13;
export const SHOT_RANGE = 12;
export const SHOT_COOLDOWN_MS = 680;
export const DASH_COOLDOWN_MS = 3200;
export const INTERACT_RANGE = 4.5;

export const CAREERS = [
  { id: 'newcomer', title: 'Street Newcomer', minXp: 0, mult: 1.0 },
  { id: 'hustler', title: 'Plaza Hustler', minXp: 50, mult: 1.15 },
  { id: 'creator', title: 'Verified Creator', minXp: 150, mult: 1.35 },
  { id: 'founder', title: 'Protocol Founder', minXp: 350, mult: 1.6 },
  { id: 'mogul', title: 'Simcaster Mogul', minXp: 700, mult: 2.0 }
];

export function careerForXp(xp = 0) {
  let current = CAREERS[0];
  for (const tier of CAREERS) {
    if (xp >= tier.minXp) current = tier;
  }
  return current;
}

export const PLAZA_HOTSPOTS = [
  {
    id: 'warp-cafe',
    name: 'Warp Bean Café',
    buildingIndex: 1,
    x: -6,
    z: -10.8,
    color: '#e9a9bd',
    icon: '☕',
    tagline: 'Refuel with artisan espresso & matcha or work a barista shift',
    actions: [
      { id: 'eat', label: 'Order Espresso & Pastry (₡15)', cost: 15, pay: 0, xp: 4, energy: 22, hunger: 38, vibe: 8, clout: 1, cooldownMs: 3000 },
      { id: 'work', label: 'Work Barista Shift (+₡45)', cost: 0, pay: 45, xp: 14, energy: -16, hunger: -12, vibe: -4, clout: 3, cooldownMs: 4500 }
    ]
  },
  {
    id: 'foundry-hub',
    name: 'The Foundry Studio',
    buildingIndex: 2,
    x: 6,
    z: -10.8,
    color: '#87b8df',
    icon: '💻',
    tagline: 'Ship mini-apps, stream casts, and build protocol clout',
    actions: [
      { id: 'work', label: 'Ship Farcaster Mini-App (+₡75)', cost: 0, pay: 75, xp: 22, energy: -24, hunger: -14, vibe: -6, clout: 12, cooldownMs: 5500 },
      { id: 'stream', label: 'Host Live Cast Stream (+₡50)', cost: 0, pay: 50, xp: 16, energy: -14, hunger: -8, vibe: 12, clout: 18, cooldownMs: 4500 }
    ]
  },
  {
    id: 'neon-lounge',
    name: 'Purple Channel Lounge',
    buildingIndex: 5,
    x: -5.5,
    z: 10.6,
    color: '#97c7bd',
    icon: '🎧',
    tagline: 'Lo-fi synth & rooftop social club — boost your Vibe & Clout',
    actions: [
      { id: 'party', label: 'VIP Rooftop Session (₡25)', cost: 25, pay: 0, xp: 8, energy: -8, hunger: -6, vibe: 45, clout: 14, cooldownMs: 3500 },
      { id: 'dj', label: 'Spin Headline Synth Set (+₡60)', cost: 0, pay: 60, xp: 18, energy: -18, hunger: -10, vibe: 20, clout: 16, cooldownMs: 5000 }
    ]
  },
  {
    id: 'night-market',
    name: 'Onchain Pop-Up Market',
    buildingIndex: 6,
    x: 6.5,
    z: 10.6,
    color: '#b7a1e5',
    icon: '🛍️',
    tagline: 'Collect limited creator drops and grab quick street snacks',
    actions: [
      { id: 'hustle', label: 'Flip Limited Merch Drop (+₡55)', cost: 0, pay: 55, xp: 16, energy: -15, hunger: -10, vibe: 5, clout: 8, cooldownMs: 4500 },
      { id: 'snack', label: 'Grab Ramen & Boba (₡8)', cost: 8, pay: 0, xp: 2, energy: 12, hunger: 26, vibe: 6, clout: 0, cooldownMs: 2500 }
    ]
  },
  {
    id: 'power-grid',
    name: 'Hub Relay Core',
    buildingIndex: -1,
    x: 0,
    z: -3.2,
    color: '#ffd28c',
    icon: '⚡',
    tagline: 'Keep the Farcaster Hub relay synced and recharge your battery',
    actions: [
      { id: 'stabilize', label: 'Sync Hub Relay Node (+₡40)', cost: 0, pay: 40, xp: 15, energy: 28, hunger: -6, vibe: 10, clout: 10, cooldownMs: 5000 }
    ]
  },
  {
    id: 'arcade-hq',
    name: 'Laser Tag Arcade HQ',
    buildingIndex: 9,
    x: 11.6,
    z: 0,
    color: '#dfa5cf',
    icon: '🕹️',
    tagline: 'Warm up your aim or jump straight into the Laser Tag Arena',
    actions: [
      { id: 'train', label: 'Reflex Target Drill (+₡30)', cost: 0, pay: 30, xp: 12, energy: -10, hunger: -6, vibe: 22, clout: 9, cooldownMs: 3500 }
    ]
  },
  {
    id: 'transit-hub',
    name: 'Warp Transit Station',
    buildingIndex: 8,
    x: -11.6,
    z: 0,
    color: '#8d64f7',
    icon: '🚝',
    tagline: 'Hop the autonomous electric shuttle across Plaza districts',
    actions: [
      { id: 'dispatch', label: 'Coordinate Pod Dispatch (+₡42)', cost: 0, pay: 42, xp: 14, energy: -12, hunger: -8, vibe: 12, clout: 7, cooldownMs: 4000 },
      { id: 'shuttle', label: 'Board Express Plaza Pod (₡5)', cost: 5, pay: 0, xp: 6, energy: 10, hunger: 0, vibe: 24, clout: 5, cooldownMs: 2500 }
    ]
  }
];

export const DAILY_QUESTS = [
  { id: 'hustle_shifts', title: 'Plaza Builder', description: 'Complete 2 venue activities in the Plaza', target: 2, rewardCreds: 120, rewardXp: 40 },
  { id: 'arena_tags', title: 'Laser Gladiator', description: 'Land 2 laser hits in the Arena', target: 2, rewardCreds: 150, rewardXp: 50 },
  { id: 'civic_life', title: 'City Insider', description: 'Vote in City Hall or use home furniture', target: 1, rewardCreds: 100, rewardXp: 35 }
];

export const CITY_NPCS = [
  {
    id: 'npc-maya',
    fid: 9001,
    name: 'Maya (Café Curator)',
    cx: -5.2,
    cz: -8.2,
    radius: 1.6,
    speed: 0.55,
    phase: 0,
    avatar: { color: 'citrus', outfit: 'formal', hair: 'curls', skin: 'warm', hairColor: 'espresso', accessory: 'earrings', build: 'regular' },
    lines: [
      'Fresh espresso & matcha at Warp Bean Café! ☕✨',
      'Keep your Energy topped up before shipping mini-apps!',
      'Vote Zero Café Tax at City Hall for 50% off meals!'
    ]
  },
  {
    id: 'npc-kora',
    fid: 9002,
    name: 'DJ Kora (Purple Lounge)',
    cx: -4.8,
    cz: 8.2,
    radius: 1.8,
    speed: 0.7,
    phase: 2.1,
    avatar: { color: 'violet', outfit: 'street', hair: 'long', skin: 'deep', hairColor: 'silver', accessory: 'headphones', build: 'slim' },
    lines: [
      'Lo-fi & Synthwave streaming live all night! 🎧',
      'Toggle FM Radio in the top bar to vibe!',
      'Come spin a set at Purple Channel Lounge!'
    ]
  },
  {
    id: 'npc-devon',
    fid: 9003,
    name: 'Devon (Hub Engineer)',
    cx: -8.6,
    cz: 0,
    radius: 1.9,
    speed: 0.6,
    phase: 4.2,
    avatar: { color: 'mint', outfit: 'sport', hair: 'buzz', skin: 'light', hairColor: 'chestnut', accessory: 'cap', build: 'regular' },
    lines: [
      'Hop the Warp Transit Pod to fast-travel the Plaza! 🚝',
      'Relay Outages pay a +₡70 bonus at the Hub Relay Core! ⚡',
      'Open CastPhone (P) to claim your Daily Quests! 📱'
    ]
  }
];

export const ARENA_OBSTACLES = [
  [-7.5, -7.5, 2.2, 2.2],
  [7.5, -7.5, 2.2, 2.2],
  [-7.5, 7.5, 2.2, 2.2],
  [7.5, 7.5, 2.2, 2.2]
];

export function cleanChat(text) {
  return typeof text === 'string' ? text.trim().replace(/[<>]/g, '').slice(0, 180) : '';
}

export function clamp(n, low, high) {
  return Math.min(high, Math.max(low, n));
}

export function movement(input, dt, size = WORLD_SIZE, speedMult = 1) {
  if (!input || !Number.isFinite(input.dx) || !Number.isFinite(input.dz)) return { dx: 0, dz: 0 };
  const magnitude = Math.hypot(input.dx, input.dz);
  if (magnitude < 0.01) return { dx: 0, dz: 0 };
  const mult = clamp(Number.isFinite(speedMult) ? speedMult : 1, 0.5, 1.8);
  const distance = PLAYER_SPEED * mult * clamp(dt, 0, 0.2);
  return {
    dx: (input.dx / Math.max(1, magnitude)) * distance,
    dz: (input.dz / Math.max(1, magnitude)) * distance
  };
}

function segmentIntersectsBox(x1, z1, x2, z2, cx, cz, w, d) {
  const minX = cx - w / 2;
  const maxX = cx + w / 2;
  const minZ = cz - d / 2;
  const maxZ = cz + d / 2;
  const dx = x2 - x1;
  const dz = z2 - z1;
  let t0 = 0;
  let t1 = 1;
  const checks = [
    [-dx, x1 - minX],
    [dx, maxX - x1],
    [-dz, z1 - minZ],
    [dz, maxZ - z1]
  ];
  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-8) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return t0 <= t1;
}

export function lineBlockedByArena(x1, z1, x2, z2) {
  return ARENA_OBSTACLES.some(([ox, oz, w, d]) => segmentIntersectsBox(x1, z1, x2, z2, ox, oz, w, d));
}

export function collidesWithArena(x, z) {
  return ARENA_OBSTACLES.some(([ox, oz, w, d]) => Math.abs(x - ox) < w / 2 + 0.35 && Math.abs(z - oz) < d / 2 + 0.35);
}

export function canHit(shooter, target, now) {
  if (!shooter || !target || shooter.id === target.id || target.hp <= 0) return false;
  if (target.shieldUntil && target.shieldUntil > now) return false;
  if (now - shooter.lastShot < SHOT_COOLDOWN_MS) return false;
  const dx = target.x - shooter.x;
  const dz = target.z - shooter.z;
  const distance = Math.hypot(dx, dz);
  if (distance > SHOT_RANGE || distance < 0.3) return false;
  const angle = Math.atan2(dx, dz);
  const diff = Math.atan2(Math.sin(angle - shooter.heading), Math.cos(angle - shooter.heading));
  if (Math.abs(diff) >= 0.35) return false;
  if (lineBlockedByArena(shooter.x, shooter.z, target.x, target.z)) return false;
  return true;
}

export const BUILDING_FOOTPRINTS = [
  [-14, -13, 5.8, 5],
  [-6, -14, 5.2, 4.8],
  [6, -14, 5.8, 4.8],
  [14, -13, 5.4, 6],
  [-14, 13, 6, 4.8],
  [-5.5, 14, 6, 5],
  [6.5, 14, 5, 5],
  [15, 13, 5, 4.8],
  [-15, 0, 5, 5],
  [15, 0, 5, 5]
];

export function collidesWithPlaza(x, z) {
  if (Math.hypot(x, z) < 2.65) return true; // central fountain
  return BUILDING_FOOTPRINTS.some(
    ([bx, bz, w, d]) => Math.abs(x - bx) < w / 2 + 0.38 && Math.abs(z - bz) < d / 2 + 0.38
  );
}

export function sanitizeRoom(room) {
  return room === 'arena' || room === 'home' ? room : 'plaza';
}

export function publicPlayer(p) {
  const out = {
    id: p.id,
    fid: p.fid,
    name: p.name,
    x: +p.x.toFixed(2),
    z: +p.z.toFixed(2),
    heading: +p.heading.toFixed(2),
    avatar: p.avatar,
    hp: p.hp,
    score: p.score
  };
  if (typeof p.creds === 'number') out.creds = p.creds;
  if (p.needs) out.needs = p.needs;
  if (p.career) out.career = p.career;
  if (p.bubble && p.bubbleUntil > Date.now()) out.bubble = p.bubble;
  if (p.shieldUntil && p.shieldUntil > Date.now()) out.shielded = true;
  if (p.dashUntil && p.dashUntil > Date.now()) out.dashing = true;
  return out;
}

