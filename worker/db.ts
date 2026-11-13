import { cleanLook } from '../shared/catalog';
import type { Me } from '../shared/protocol';
import { NEED_DECAY_PER_HOUR, NEED_KEYS, type NeedKey } from '../shared/world';

export interface Env {
  DB: D1Database;
  ROOMS: DurableObjectNamespace;
  ASSETS: Fetcher;
  DEMO_MODE?: string;
  NEYNAR_API_KEY?: string;
  OPTIMISM_RPC_URL?: string;
}

export interface UserRow {
  fid: number;
  username: string;
  display_name: string;
  pfp_url: string | null;
  demo: number;
  avatar: string;
  degen: number;
  xp: number;
  energy: number;
  hunger: number;
  fun: number;
  social: number;
  needs_at: number;
  created_at: number;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));

/** Needs are stored with a timestamp and decay lazily; nothing ticks on the server. */
export function needsNow(row: UserRow, now: number): Record<NeedKey, number> {
  const hours = Math.max(0, now - row.needs_at) / 3_600_000;
  const out = {} as Record<NeedKey, number>;
  for (const k of NEED_KEYS) out[k] = Math.round(clamp(row[k] - NEED_DECAY_PER_HOUR[k] * hours, 5, 100) * 10) / 10;
  return out;
}

export function toMe(row: UserRow, now = Date.now()): Me {
  let look: unknown = {};
  try { look = JSON.parse(row.avatar); } catch { /* default look */ }
  return {
    fid: row.fid, username: row.username, displayName: row.display_name, pfpUrl: row.pfp_url, demo: !!row.demo,
    look: cleanLook(look, row.fid), degen: row.degen, xp: row.xp, needs: needsNow(row, now),
  };
}

export async function getUser(db: D1Database, fid: number): Promise<UserRow | null> {
  return db.prepare('SELECT * FROM users WHERE fid = ?').bind(fid).first<UserRow>();
}

export async function upsertUser(
  db: D1Database, p: { fid: number; username: string; displayName: string; pfpUrl: string | null; demo: boolean },
): Promise<UserRow> {
  const now = Date.now();
  await db.prepare(
    `INSERT INTO users (fid, username, display_name, pfp_url, demo, needs_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
     ON CONFLICT(fid) DO UPDATE SET username = ?2, display_name = ?3, pfp_url = ?4`,
  ).bind(p.fid, p.username.slice(0, 40), p.displayName.slice(0, 40), p.pfpUrl, p.demo ? 1 : 0, now).run();
  return (await getUser(db, p.fid))!;
}

export interface Settlement {
  degen?: number;
  xp?: number;
  needs?: Partial<Record<NeedKey, number>>;
  minEnergy?: number;
  reason: string;
}

/** Applies a DEGEN / XP / needs change atomically enough for a single-writer D1 database. */
export async function settle(db: D1Database, fid: number, s: Settlement): Promise<{ ok: true; me: Me } | { ok: false; error: string }> {
  const row = await getUser(db, fid);
  if (!row) return { ok: false, error: 'Account not found' };
  const now = Date.now();
  const needs = needsNow(row, now);
  if (s.minEnergy !== undefined && needs.energy < s.minEnergy) return { ok: false, error: 'Too tired. Get some rest first.' };
  const delta = Math.round(s.degen ?? 0);
  if (row.degen + delta < 0) return { ok: false, error: 'Not enough DEGEN' };
  for (const k of NEED_KEYS) needs[k] = clamp(needs[k] + (s.needs?.[k] ?? 0), 5, 100);
  const stmts = [
    // The degen guard in WHERE makes a concurrent double-spend fail instead of going negative.
    db.prepare(
      `UPDATE users SET degen = degen + ?1, xp = xp + ?2, energy = ?3, hunger = ?4, fun = ?5, social = ?6, needs_at = ?7
       WHERE fid = ?8 AND degen + ?1 >= 0`,
    ).bind(delta, Math.max(0, Math.round(s.xp ?? 0)), needs.energy, needs.hunger, needs.fun, needs.social, now, fid),
  ];
  if (delta !== 0) stmts.push(db.prepare('INSERT INTO ledger (fid, delta, reason, at) VALUES (?, ?, ?, ?)').bind(fid, delta, s.reason, now));
  const res = await db.batch(stmts);
  if (!res[0].meta.changes) return { ok: false, error: 'Not enough DEGEN' };
  return { ok: true, me: toMe((await getUser(db, fid))!, now) };
}

// ---------------------------------------------------------------- sessions
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const randomToken = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));
export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return b64url(new Uint8Array(digest));
}

const SESSION_MS = 14 * 86_400_000;
export const COOKIE = 'sc_session';

export async function createSession(db: D1Database, fid: number): Promise<string> {
  const token = randomToken();
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Date.now()),
    db.prepare('INSERT INTO sessions (token_hash, fid, expires_at) VALUES (?, ?, ?)').bind(await sha256(token), fid, Date.now() + SESSION_MS),
  ]);
  return token;
}

export function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export async function sessionUser(db: D1Database, req: Request): Promise<UserRow | null> {
  const token = readCookie(req, COOKIE);
  if (!token) return null;
  return db.prepare(
    'SELECT u.* FROM sessions s JOIN users u ON u.fid = s.fid WHERE s.token_hash = ? AND s.expires_at > ?',
  ).bind(await sha256(token), Date.now()).first<UserRow>();
}

export function sessionCookie(req: Request, token: string | null): string {
  const secure = new URL(req.url).protocol === 'https:' || req.headers.get('X-Forwarded-Proto') === 'https';
  const base = `${COOKIE}=${token ?? ''}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
  return token ? `${base}; Max-Age=${SESSION_MS / 1000}` : `${base}; Max-Age=0`;
}
