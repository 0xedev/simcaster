// One Durable Object per room ("town", "home:<fid>"). It holds no simulation loop: sims walk along
// server-validated paths that every client replays deterministically, so the object can hibernate
// between messages and still be authoritative about position, money and needs.
import { DurableObject } from 'cloudflare:workers';
import { CATALOG, STARTER_HOME, footprint } from '../shared/catalog';
import { EMOTES, type ClientMsg, type PlayerState, type ServerMsg } from '../shared/protocol';
import {
  ACTIONS, HOME_DOOR, INTERACT_RANGE, TOWN, homeNav, samplePath, townNav, validatePath,
  type HomeItem, type NavGrid, type Vec2,
} from '../shared/world';
import { getUser, settle, toMe, type Env } from './db';

const MAX_PLAYERS = 48;
const CHAT_MS = 900;

interface Limits { chat: number; move: number; social: number }

export async function loadHome(db: D1Database, fid: number): Promise<HomeItem[]> {
  const row = await db.prepare('SELECT items FROM homes WHERE fid = ?').bind(fid).first<{ items: string }>();
  if (!row) return STARTER_HOME;
  try { return JSON.parse(row.items) as HomeItem[]; } catch { return STARTER_HOME; }
}

export class Room extends DurableObject<Env> {
  private limits = new WeakMap<WebSocket, Limits>();
  private homeItems: HomeItem[] | null = null;
  private nav: NavGrid | null = null;

  private name = '';

  private players(): { ws: WebSocket; p: PlayerState }[] {
    const out: { ws: WebSocket; p: PlayerState }[] = [];
    for (const ws of this.ctx.getWebSockets()) {
      const p = ws.deserializeAttachment() as PlayerState | null;
      if (p) out.push({ ws, p });
    }
    return out;
  }

  private send(ws: WebSocket, msg: ServerMsg) {
    try { ws.send(JSON.stringify(msg)); } catch { /* socket already gone */ }
  }

  private broadcast(msg: ServerMsg, except?: WebSocket) {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      try { ws.send(data); } catch { /* ignore */ }
    }
  }

  private async room(): Promise<{ name: string; owner: number | null }> {
    if (!this.name) this.name = (await this.ctx.storage.get<string>('name')) || 'town';
    const owner = this.name.startsWith('home:') ? Number(this.name.slice(5)) : null;
    return { name: this.name, owner };
  }

  private async grid(): Promise<NavGrid> {
    const { owner } = await this.room();
    if (owner === null) return townNav();
    if (!this.nav) {
      this.homeItems = await loadHome(this.env.DB, owner);
      this.nav = homeNav(this.homeItems, footprint);
    }
    return this.nav;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const name = req.headers.get('x-sc-room') || 'town';
    if (!this.name) {
      this.name = name;
      await this.ctx.storage.put('name', name);
    }
    if (url.pathname === '/notify-home') {
      // The owner saved a new layout through the HTTP API.
      this.homeItems = null;
      this.nav = null;
      await this.grid();
      this.broadcast({ t: 'home', items: this.homeItems || [] });
      return new Response('ok');
    }
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected websocket', { status: 426 });
    const fid = Number(req.headers.get('x-sc-fid'));
    const row = await getUser(this.env.DB, fid);
    if (!row) return new Response('No user', { status: 401 });
    const existing = this.players();
    if (existing.filter((e) => e.p.fid !== fid).length >= MAX_PLAYERS) return new Response('Room is full', { status: 503 });

    const me = toMe(row);
    const { owner } = await this.room();
    await this.grid();
    const now = Date.now();
    const spawn: Vec2 = owner === null
      ? [(Math.random() - 0.5) * 8, 9 + Math.random() * 3]
      : [HOME_DOOR[0] + (Math.random() - 0.5), HOME_DOOR[1] - 0.6];
    const player: PlayerState = {
      id: crypto.randomUUID().slice(0, 8), fid, name: me.displayName, pfp: me.pfpUrl, look: me.look,
      path: [spawn], t0: now, act: null,
    };

    // One body per account per room: a second tab replaces the first.
    for (const e of existing) {
      if (e.p.fid === fid) {
        this.broadcast({ t: 'leave', id: e.p.id }, e.ws);
        e.ws.serializeAttachment(null);
        try { e.ws.close(4001, 'Opened in another tab'); } catch { /* ignore */ }
      }
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(player);
    let home;
    if (owner !== null) {
      const ownerRow = owner === fid ? row : await getUser(this.env.DB, owner);
      home = { owner, ownerName: ownerRow?.display_name || 'Someone', items: this.homeItems || [], canEdit: owner === fid };
    }
    this.send(server, {
      t: 'hello', you: player.id, now, room: this.name, home,
      players: this.players().map((e) => e.p),
    });
    this.send(server, { t: 'me', me });
    this.broadcast({ t: 'join', p: player }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  private posOf(p: PlayerState, now: number): Vec2 {
    const s = samplePath(p.path, p.t0, now);
    return [s.x, s.z];
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== 'string' || raw.length > 4000) return;
    let msg: ClientMsg;
    try { msg = JSON.parse(raw); } catch { return; }
    const p = ws.deserializeAttachment() as PlayerState | null;
    if (!p || !msg || typeof msg.t !== 'string') return;
    const now = Date.now();
    let lim = this.limits.get(ws);
    if (!lim) this.limits.set(ws, (lim = { chat: 0, move: 0, social: 0 }));

    switch (msg.t) {
      case 'ping':
        return this.send(ws, { t: 'pong', c: Number(msg.c) || 0, now });

      case 'move': {
        if (now - lim.move < 80) return;
        lim.move = now;
        const grid = await this.grid();
        const cur = this.posOf(p, now);
        const path = validatePath(grid, msg.path, cur);
        if (!path) {
          // Tell the client where it really is so it can re-plan from there.
          p.path = [cur];
          p.t0 = now;
          ws.serializeAttachment(p);
          return this.send(ws, { t: 'snap', id: p.id, x: cur[0], z: cur[1], t0: now });
        }
        p.path = path;
        p.t0 = now;
        const hadAct = !!p.act;
        p.act = null;
        ws.serializeAttachment(p);
        if (hadAct) this.broadcast({ t: 'act', id: p.id, act: null });
        return this.broadcast({ t: 'move', id: p.id, path, t0: now });
      }

      case 'chat': {
        if (now - lim.chat < CHAT_MS) return;
        const text = String(msg.text || '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 140);
        if (!text) return;
        lim.chat = now;
        this.broadcast({ t: 'chat', id: p.id, name: p.name, text });
        if (now - lim.social > 20_000 && this.ctx.getWebSockets().length > 1) {
          lim.social = now;
          const r = await settle(this.env.DB, p.fid, { needs: { social: 4 }, reason: 'chat' });
          if (r.ok) this.send(ws, { t: 'me', me: r.me });
        }
        return;
      }

      case 'emote': {
        if (!EMOTES.includes(msg.name) || now - lim.chat < CHAT_MS) return;
        lim.chat = now;
        return this.broadcast({ t: 'emote', id: p.id, name: msg.name });
      }

      case 'whisper': {
        // Private, in-room only, never stored. Farcaster DMs are not part of the protocol.
        if (now - lim.chat < CHAT_MS) return;
        const text = String(msg.text || '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 240);
        const target = this.players().find((e) => e.p.id === msg.to);
        if (!text || !target || target.p.id === p.id) return;
        lim.chat = now;
        const out: ServerMsg = { t: 'whisper', from: p.id, to: target.p.id, fromName: p.name, toName: target.p.name, text };
        this.send(target.ws, out);
        return this.send(ws, out);
      }

      case 'act': {
        const def = ACTIONS[msg.action];
        if (!def || def.nav || p.act) return;
        const { owner } = await this.room();
        const cur = this.posOf(p, now);
        let stand: Vec2 = cur;
        let face = 0;
        if (owner === null) {
          const spot = TOWN.hotspots.find((h) => h.id === msg.target);
          if (!spot || !spot.actions.includes(msg.action)) return;
          if (Math.hypot(cur[0] - spot.x, cur[1] - spot.z) > INTERACT_RANGE) return this.send(ws, { t: 'err', msg: 'Walk over there first' });
          stand = [spot.x, spot.z];
          face = spot.face;
        } else {
          await this.grid();
          const item = (this.homeItems || []).find((i) => i.id === msg.target);
          const entry = item && CATALOG[item.model];
          if (!item || !entry?.actions?.includes(msg.action)) return;
          const f = footprint(item);
          if (Math.hypot(cur[0] - item.x, cur[1] - item.z) > INTERACT_RANGE + Math.max(f.hw, f.hd)) {
            return this.send(ws, { t: 'err', msg: 'Walk over there first' });
          }
          face = Math.atan2(item.x - cur[0], item.z - cur[1]);
        }
        if (def.cost > 0 || def.minEnergy !== undefined) {
          const paid = await settle(this.env.DB, p.fid, { degen: -def.cost, minEnergy: def.minEnergy, reason: 'act:' + msg.action });
          if (!paid.ok) return this.send(ws, { t: 'err', msg: paid.error });
          this.send(ws, { t: 'me', me: paid.me });
        }
        p.path = [stand];
        p.t0 = now;
        p.act = { target: msg.target, action: msg.action, until: now + def.seconds * 1000, face, at: stand };
        ws.serializeAttachment(p);
        return this.broadcast({ t: 'act', id: p.id, act: p.act });
      }

      case 'done': {
        if (!p.act || now < p.act.until - 400) return;
        const def = ACTIONS[p.act.action];
        const action = p.act.action;
        p.act = null;
        ws.serializeAttachment(p);
        this.broadcast({ t: 'act', id: p.id, act: null });
        const r = await settle(this.env.DB, p.fid, { degen: def.pay, xp: def.xp, needs: def.needs, reason: 'act:' + action });
        if (r.ok) this.send(ws, { t: 'me', me: r.me, note: def.pay > 0 ? `+${def.pay} DEGEN` : undefined });
        return;
      }
    }
  }

  async webSocketClose(ws: WebSocket) {
    const p = ws.deserializeAttachment() as PlayerState | null;
    if (p) this.broadcast({ t: 'leave', id: p.id }, ws);
  }

  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws);
  }
}
