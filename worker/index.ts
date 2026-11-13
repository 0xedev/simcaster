import { CATALOG, MAX_HOME_ITEMS, SELL_BACK, cleanLook, placementError } from '../shared/catalog';
import { GAMES, GAME_DAILY_CAP, channelUrl, gameReward, type Cast, type GameId } from '../shared/protocol';
import type { HomeItem } from '../shared/world';
import {
  createSession, getUser, randomToken, readCookie, sessionCookie, sessionUser, settle, sha256, toMe, upsertUser, COOKIE,
  type Env, type UserRow,
} from './db';
import { Room, loadHome } from './room';

export { Room };

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });
const fail = (error: string, status = 400) => json({ error }, status);

async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try { return (await req.json()) as T; } catch { return {} as T; }
}

/** Cookie auth + JSON bodies: refuse cross-site writes outright. */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('Origin');
  if (!origin) return true; // non-browser clients send no Origin and carry no ambient cookie
  try { return new URL(origin).host === (req.headers.get('X-Forwarded-Host') || new URL(req.url).host); } catch { return false; }
}

// ---------------------------------------------------------------- Farcaster data (Neynar)
async function neynar(env: Env, path: string, params: Record<string, string | number>): Promise<any> {
  const url = new URL('https://api.neynar.com/v2/farcaster/' + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { 'x-api-key': env.NEYNAR_API_KEY!, accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Farcaster provider returned ${res.status}`);
  return res.json();
}

function mapCast(c: any): Cast {
  const image = (c.embeds || []).map((e: any) => e?.url).find((u: unknown) => typeof u === 'string' && /\.(png|jpe?g|gif|webp)(\?|$)/i.test(u)) || null;
  return {
    hash: String(c.hash), text: String(c.text || ''), timestamp: String(c.timestamp || ''),
    author: {
      fid: Number(c.author?.fid) || 0, username: String(c.author?.username || 'unknown'),
      displayName: String(c.author?.display_name || c.author?.username || 'Unknown'), pfpUrl: c.author?.pfp_url || null,
    },
    likes: c.reactions?.likes_count ?? 0, recasts: c.reactions?.recasts_count ?? 0, replies: c.replies?.count ?? 0,
    channel: c.channel?.id || null, image,
  };
}

const SAMPLE_AUTHORS = ['maya', 'theo', 'ines', 'kofi', 'sora', 'lena', 'amir', 'juno'];
const SAMPLE_TEXT = [
  'gm from the plaza. who is around today?',
  'Shipped a tiny mini app last night. Feedback welcome.',
  'Hot take: the best client is the one your friends are in.',
  'Looking for a co-builder for a weekend hack.',
  'The café does a good flat white, for a simulation.',
  'New here. What channels should I follow?',
  'Reminder that sample casts are not real Farcaster data.',
  'Anyone up for the arcade later?',
];
function sampleFeed(channel: string | null): Cast[] {
  return SAMPLE_TEXT.map((text, i) => ({
    hash: `sample-${channel || 'home'}-${i}`, text, timestamp: new Date(Date.now() - i * 1_380_000).toISOString(),
    author: { fid: 800000 + i, username: SAMPLE_AUTHORS[i], displayName: SAMPLE_AUTHORS[i][0].toUpperCase() + SAMPLE_AUTHORS[i].slice(1), pfpUrl: null },
    likes: (i * 7) % 23, recasts: (i * 3) % 7, replies: (i * 5) % 9, channel, image: null,
  }));
}

async function feed(env: Env, user: UserRow, type: string, channel: string | null): Promise<{ casts: Cast[]; sample: boolean; note?: string }> {
  if (!env.NEYNAR_API_KEY) return { casts: sampleFeed(channel), sample: true, note: 'Sample casts: no NEYNAR_API_KEY is configured.' };
  try {
    let data: any;
    if (type === 'channel' && channel) data = await neynar(env, 'feed/channels', { channel_ids: channel, limit: 25, with_recasts: 'false' });
    else if (type === 'following' && !user.demo) data = await neynar(env, 'feed/following', { fid: user.fid, limit: 25 });
    else data = await neynar(env, 'feed/trending', { limit: 10, time_window: '24h' });
    return { casts: (data.casts || []).map(mapCast), sample: false };
  } catch (e) {
    return { casts: sampleFeed(channel), sample: true, note: `Live feed unavailable (${(e as Error).message}); showing sample casts.` };
  }
}

// ---------------------------------------------------------------- routes
async function api(req: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname.slice(4);
  const method = req.method;
  if (method !== 'GET' && !sameOrigin(req)) return fail('Cross-site request refused', 403);
  const demo = env.DEMO_MODE === 'true';

  if (path === '/config' && method === 'GET') return json({ demo, liveFeed: !!env.NEYNAR_API_KEY });

  if (path === '/auth/nonce' && method === 'POST') {
    const nonce = randomToken(12).replace(/[^a-zA-Z0-9]/g, 'x');
    await env.DB.batch([
      env.DB.prepare('DELETE FROM nonces WHERE expires_at < ?').bind(Date.now()),
      env.DB.prepare('INSERT INTO nonces (nonce, expires_at) VALUES (?, ?)').bind(nonce, Date.now() + 10 * 60_000),
    ]);
    return json({ nonce });
  }

  if (path === '/auth/siwf' && method === 'POST') {
    const b = await body<{ message?: string; signature?: string; nonce?: string; username?: string; displayName?: string; pfpUrl?: string }>(req);
    if (typeof b.message !== 'string' || typeof b.signature !== 'string' || typeof b.nonce !== 'string') return fail('Missing sign-in fields');
    // Nonces are single use: delete first, and only continue if it existed and had not expired.
    const used = await env.DB.prepare('DELETE FROM nonces WHERE nonce = ? AND expires_at > ?').bind(b.nonce, Date.now()).run();
    if (!used.meta.changes) return fail('Sign-in request expired. Try again.', 401);
    const { createAppClient, viemConnector } = await import('@farcaster/auth-client');
    const client = createAppClient({ ethereum: viemConnector({ rpcUrl: env.OPTIMISM_RPC_URL || 'https://mainnet.optimism.io' }) });
    const host = req.headers.get('X-Forwarded-Host') || url.host;
    const result = await client.verifySignInMessage({ nonce: b.nonce, domain: host, message: b.message, signature: b.signature as `0x${string}` });
    if (!result.success || !result.fid) return fail('Signature could not be verified', 401);
    const fid = Number(result.fid);
    // Only the fid is signed. Profile fields come from Neynar when configured, else from the wallet app's relay.
    let profile = { username: String(b.username || `fid-${fid}`), displayName: String(b.displayName || b.username || `fid ${fid}`), pfpUrl: typeof b.pfpUrl === 'string' && b.pfpUrl.startsWith('https://') ? b.pfpUrl : null };
    if (env.NEYNAR_API_KEY) {
      try {
        const u = (await neynar(env, 'user/bulk', { fids: fid })).users?.[0];
        if (u) profile = { username: u.username, displayName: u.display_name || u.username, pfpUrl: u.pfp_url || null };
      } catch { /* keep relay profile */ }
    }
    const row = await upsertUser(env.DB, { fid, ...profile, demo: false });
    return json({ me: toMe(row) }, 200, { 'Set-Cookie': sessionCookie(req, await createSession(env.DB, fid)) });
  }

  if (path === '/auth/demo' && method === 'POST') {
    if (!demo) return fail('Demo sign-in is disabled', 403);
    const b = await body<{ name?: string }>(req);
    const name = String(b.name || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 24);
    if (name.length < 2) return fail('Enter a name (2+ characters)');
    const fid = 900_000_000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 90_000_000);
    const row = await upsertUser(env.DB, { fid, username: 'demo-' + fid, displayName: name, pfpUrl: null, demo: true });
    return json({ me: toMe(row) }, 200, { 'Set-Cookie': sessionCookie(req, await createSession(env.DB, fid)) });
  }

  if (path === '/auth/logout' && method === 'POST') {
    const token = readCookie(req, COOKIE);
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(req, null) });
  }

  const user = await sessionUser(env.DB, req);
  if (path === '/me' && method === 'GET') return json({ me: user ? toMe(user) : null });
  if (!user) return fail('Sign in first', 401);

  if (path === '/me/look' && method === 'PUT') {
    const look = cleanLook(await body(req), user.fid);
    await env.DB.prepare('UPDATE users SET avatar = ? WHERE fid = ?').bind(JSON.stringify(look), user.fid).run();
    return json({ me: toMe((await getUser(env.DB, user.fid))!) });
  }

  if (path === '/feed' && method === 'GET') {
    const channel = (url.searchParams.get('channel') || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20) || null;
    const out = await feed(env, user, url.searchParams.get('type') || 'trending', channel);
    return json({ ...out, channelUrl: channel ? channelUrl(channel) : null });
  }

  if (path === '/home' && method === 'GET') {
    const owner = Number(url.searchParams.get('fid')) || user.fid;
    return json({ owner, items: await loadHome(env.DB, owner) });
  }

  if (path === '/home' && method === 'PUT') {
    const b = await body<{ items?: HomeItem[] }>(req);
    if (!Array.isArray(b.items) || b.items.length > MAX_HOME_ITEMS) return fail(`A home holds at most ${MAX_HOME_ITEMS} items`);
    const next: HomeItem[] = [];
    const ids = new Set<string>();
    for (const raw of b.items) {
      const item: HomeItem = { id: String(raw?.id || '').slice(0, 16), model: String(raw?.model || ''), x: Number(raw?.x), z: Number(raw?.z), rot: (Number(raw?.rot) & 3) as HomeItem['rot'] };
      if (!item.id || ids.has(item.id)) return fail('Duplicate or missing item id');
      ids.add(item.id);
      next.push(item);
    }
    for (const item of next) {
      const err = placementError(item, next);
      if (err) return fail(`${CATALOG[item.model]?.name || 'Item'}: ${err}`);
    }
    // Price the difference against what is stored: new pieces are bought, removed ones sold back.
    const prev = await loadHome(env.DB, user.fid);
    const prevById = new Map(prev.map((i) => [i.id, i]));
    let cost = 0;
    for (const item of next) {
      const old = prevById.get(item.id);
      if (old && old.model === item.model) prevById.delete(item.id);
      else cost += CATALOG[item.model].price;
    }
    for (const gone of prevById.values()) cost -= Math.round((CATALOG[gone.model]?.price || 0) * SELL_BACK);
    const paid = await settle(env.DB, user.fid, { degen: -cost, reason: 'home' });
    if (!paid.ok) return fail(paid.error, 402);
    await env.DB.prepare(
      'INSERT INTO homes (fid, items, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(fid) DO UPDATE SET items = ?2, updated_at = ?3',
    ).bind(user.fid, JSON.stringify(next), Date.now()).run();
    const stub = env.ROOMS.get(env.ROOMS.idFromName('home:' + user.fid));
    await stub.fetch('https://room/notify-home', { headers: { 'x-sc-room': 'home:' + user.fid } });
    return json({ items: next, me: paid.me, cost });
  }

  if (path === '/games/start' && method === 'POST') {
    const b = await body<{ game?: string }>(req);
    if (!b.game || !(b.game in GAMES)) return fail('Unknown game');
    const id = randomToken(12);
    await env.DB.prepare('INSERT INTO game_runs (id, fid, game, started_at) VALUES (?, ?, ?, ?)').bind(id, user.fid, b.game, Date.now()).run();
    return json({ run: id });
  }

  if (path === '/games/finish' && method === 'POST') {
    const b = await body<{ run?: string; score?: number }>(req);
    const run = await env.DB.prepare('SELECT * FROM game_runs WHERE id = ? AND fid = ? AND finished_at IS NULL')
      .bind(String(b.run || ''), user.fid).first<{ id: string; game: GameId; started_at: number }>();
    if (!run) return fail('That run is not open');
    const def = GAMES[run.game];
    const now = Date.now();
    const score = Math.max(0, Math.min(def.maxScore, Math.floor(Number(b.score) || 0)));
    // The client reports the score, so bound it by what is physically possible in the elapsed time
    // and by a daily cap. That keeps the damage of a forged score small.
    if (now - run.started_at < score * def.minMsPerPoint) return fail('Score rejected', 422);
    const since = now - 86_400_000;
    const today = await env.DB.prepare('SELECT COALESCE(SUM(reward), 0) AS total FROM game_runs WHERE fid = ? AND finished_at > ?')
      .bind(user.fid, since).first<{ total: number }>();
    const reward = Math.max(0, Math.min(gameReward(run.game, score), GAME_DAILY_CAP - (today?.total || 0)));
    const closed = await env.DB.prepare('UPDATE game_runs SET finished_at = ?, score = ?, reward = ? WHERE id = ? AND finished_at IS NULL')
      .bind(now, score, reward, run.id).run();
    if (!closed.meta.changes) return fail('That run is not open');
    const paid = await settle(env.DB, user.fid, { degen: reward, xp: Math.round(score / 4), needs: { fun: 12 }, reason: 'game:' + run.game });
    return json({ score, reward, capped: reward < gameReward(run.game, score), me: paid.ok ? paid.me : toMe(user) });
  }

  if (path === '/games/board' && method === 'GET') {
    const game = url.searchParams.get('game') || '';
    if (!(game in GAMES)) return fail('Unknown game');
    const rows = await env.DB.prepare(
      `SELECT u.display_name AS name, MAX(r.score) AS score FROM game_runs r JOIN users u ON u.fid = r.fid
       WHERE r.game = ? AND r.finished_at IS NOT NULL GROUP BY r.fid ORDER BY score DESC LIMIT 10`,
    ).bind(game).all<{ name: string; score: number }>();
    return json({ board: rows.results });
  }

  return fail('Not found', 404);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    try {
      if (url.pathname.startsWith('/api/')) return await api(req, env, url);
      if (url.pathname.startsWith('/ws/')) {
        if (req.headers.get('Upgrade') !== 'websocket') return fail('Expected websocket', 426);
        if (!sameOrigin(req)) return fail('Cross-site socket refused', 403);
        const user = await sessionUser(env.DB, req);
        if (!user) return fail('Sign in first', 401);
        let room = decodeURIComponent(url.pathname.slice(4));
        if (room === 'home') room = 'home:' + user.fid;
        if (room !== 'town' && !/^home:\d{1,12}$/.test(room)) return fail('Unknown room', 404);
        const headers = new Headers(req.headers);
        headers.set('x-sc-fid', String(user.fid));
        headers.set('x-sc-room', room);
        return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(new Request(req, { headers }));
      }
      return env.ASSETS.fetch(req);
    } catch (e) {
      console.error('request failed', url.pathname, e);
      return fail('Server error', 500);
    }
  },
} satisfies ExportedHandler<Env>;
