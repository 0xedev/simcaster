export const WORLD_SIZE = 19;
export const PLAYER_SPEED = 4.2;
export const ARENA_SIZE = 13;
export const SHOT_RANGE = 12;
export const SHOT_COOLDOWN_MS = 680;

export function cleanChat(text) {
  return typeof text === 'string' ? text.trim().replace(/[<>]/g, '').slice(0, 180) : '';
}
export function clamp(n, low, high) { return Math.min(high, Math.max(low, n)); }
export function movement(input, dt, size = WORLD_SIZE) {
  if (!input || !Number.isFinite(input.dx) || !Number.isFinite(input.dz)) return { dx: 0, dz: 0 };
  const magnitude = Math.hypot(input.dx, input.dz);
  if (magnitude < 0.01) return { dx:0, dz:0 };
  const distance = PLAYER_SPEED * clamp(dt, 0, 0.2);
  return { dx: input.dx / Math.max(1, magnitude) * distance,
           dz: input.dz / Math.max(1, magnitude) * distance };
}
export function canHit(shooter, target, now) {
  if (!shooter || !target || shooter.id === target.id || target.hp <= 0) return false;
  if (now - shooter.lastShot < SHOT_COOLDOWN_MS) return false;
  const dx = target.x - shooter.x, dz = target.z - shooter.z;
  const distance = Math.hypot(dx,dz);
  if (distance > SHOT_RANGE || distance < 0.3) return false;
  const angle = Math.atan2(dx, dz);
  const diff = Math.atan2(Math.sin(angle - shooter.heading), Math.cos(angle - shooter.heading));
  return Math.abs(diff) < 0.35;
}
export const BUILDING_FOOTPRINTS = [[-14,-13,5.8,5],[-6,-14,5.2,4.8],[6,-14,5.8,4.8],[14,-13,5.4,6],[-14,13,6,4.8],[-5.5,14,6,5],[6.5,14,5,5],[15,13,5,4.8],[-15,0,5,5],[15,0,5,5]];
export function collidesWithPlaza(x,z){
  if(Math.hypot(x,z)<2.65) return true; // central fountain
  return BUILDING_FOOTPRINTS.some(([bx,bz,w,d])=>
    Math.abs(x-bx) < w/2 + .38 && Math.abs(z-bz) < d/2 + .38);
}
export function sanitizeRoom(room) { return room === 'arena' || room === 'home' ? room : 'plaza'; }
export function publicPlayer(p) {
  return { id:p.id, fid:p.fid, name:p.name, x:+p.x.toFixed(2), z:+p.z.toFixed(2),
           heading:+p.heading.toFixed(2), avatar:p.avatar, hp:p.hp, score:p.score };
}
