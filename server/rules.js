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
export function sanitizeRoom(room) { return room === 'arena' || room === 'home' ? room : 'plaza'; }
export function publicPlayer(p) {
  return { id:p.id, fid:p.fid, name:p.name, x:+p.x.toFixed(2), z:+p.z.toFixed(2),
           heading:+p.heading.toFixed(2), avatar:p.avatar, hp:p.hp, score:p.score };
}
