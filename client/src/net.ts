// HTTP helpers and the room socket. Sim transforms live in `sims` (a plain Map read inside the
// render loop), never in React state, so network traffic cannot cause React renders per frame.
import type { ClientMsg, PlayerState, ServerMsg } from '../../shared/protocol';
import { ACTIONS, samplePath, type ActionId, type PathSample, type Vec2 } from '../../shared/world';
import { store } from './store';

export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch('/api' + path, {
    credentials: 'same-origin',
    ...init,
    headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

export interface SimRuntime { path: Vec2[]; t0: number }
export const sims = new Map<string, SimRuntime>();

let clockOffset = 0; // server time - local time
export const serverNow = () => Date.now() + clockOffset;

const scratch: PathSample = { x: 0, z: 0, heading: 0, moving: false };
export function simPos(id: string, out: PathSample = scratch): PathSample | null {
  const s = sims.get(id);
  return s ? samplePath(s.path, s.t0, serverNow(), undefined, out) : null;
}

let socket: WebSocket | null = null;
let generation = 0;
let retry = 0;
let doneTimer: ReturnType<typeof setTimeout> | undefined;

export function send(msg: ClientMsg) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
}

function setPlayer(p: PlayerState) {
  sims.set(p.id, { path: p.path, t0: p.t0 });
  store.setState((s) => ({ players: { ...s.players, [p.id]: p } }));
}

function scheduleDone(act: PlayerState['act']) {
  clearTimeout(doneTimer);
  if (!act) return;
  doneTimer = setTimeout(() => send({ t: 'done' }), Math.max(0, act.until - serverNow()) + 60);
}

function handle(msg: ServerMsg) {
  const st = store.getState();
  switch (msg.t) {
    case 'hello': {
      clockOffset = msg.now - Date.now();
      sims.clear();
      const players: Record<string, PlayerState> = {};
      for (const p of msg.players) {
        players[p.id] = p;
        sims.set(p.id, { path: p.path, t0: p.t0 });
      }
      store.setState({ selfId: msg.you, players, home: msg.home ?? null, conn: 'open', connNote: '', bubbles: {}, emotes: {} });
      break;
    }
    case 'join':
      setPlayer(msg.p);
      st.say({ kind: 'note', text: `${msg.p.name} arrived` });
      break;
    case 'leave': {
      const gone = st.players[msg.id];
      sims.delete(msg.id);
      store.setState((s) => {
        const players = { ...s.players };
        delete players[msg.id];
        return { players };
      });
      if (gone) st.say({ kind: 'note', text: `${gone.name} left` });
      break;
    }
    case 'move':
      if (msg.id !== st.selfId) sims.set(msg.id, { path: msg.path, t0: msg.t0 });
      break;
    case 'snap':
      sims.set(msg.id, { path: [[msg.x, msg.z]], t0: msg.t0 });
      if (msg.id === st.selfId) pending = null;
      break;
    case 'chat': {
      st.say({ kind: 'chat', name: msg.name, text: msg.text, mine: msg.id === st.selfId });
      store.setState((s) => ({ bubbles: { ...s.bubbles, [msg.id]: { text: msg.text, until: Date.now() + 5200 } } }));
      break;
    }
    case 'whisper': {
      const mine = msg.from === st.selfId;
      st.say({ kind: 'whisper', name: mine ? `to ${msg.toName}` : `${msg.fromName} whispers`, text: msg.text, mine });
      break;
    }
    case 'emote':
      store.setState((s) => ({ emotes: { ...s.emotes, [msg.id]: { name: msg.name, until: Date.now() + 2400 } } }));
      break;
    case 'act': {
      const p = st.players[msg.id];
      if (!p) break;
      if (msg.act) sims.set(msg.id, { path: [msg.act.at], t0: serverNow() });
      store.setState((s) => ({ players: { ...s.players, [msg.id]: { ...p, act: msg.act } } }));
      if (msg.id === st.selfId) scheduleDone(msg.act);
      break;
    }
    case 'me':
      store.setState({ me: msg.me });
      if (msg.note) st.notify(msg.note);
      break;
    case 'home':
      store.setState((s) => (s.home ? { home: { ...s.home, items: msg.items } } : {}));
      break;
    case 'pong':
      clockOffset = msg.now - (msg.c + (Date.now() - msg.c) / 2);
      break;
    case 'err':
      st.notify(msg.msg);
      pending = null;
      break;
  }
}

export function connect(room: string) {
  const gen = ++generation;
  socket?.close();
  clearTimeout(doneTimer);
  pending = null;
  sims.clear();
  store.setState({ conn: 'connecting', players: {}, selfId: '', home: null, menu: null, build: null });
  const open = () => {
    if (gen !== generation) return;
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/${encodeURIComponent(room)}`);
    socket = ws;
    ws.onopen = () => {
      retry = 0;
      ws.send(JSON.stringify({ t: 'ping', c: Date.now() }));
    };
    ws.onmessage = (e) => {
      if (gen !== generation) return;
      try { handle(JSON.parse(e.data)); } catch (err) { console.error('bad message', err); }
    };
    ws.onclose = (e) => {
      if (gen !== generation) return;
      if (e.code === 4001) {
        store.setState({ conn: 'closed', connNote: 'Simcaster was opened in another tab.' });
        return;
      }
      store.setState({ conn: 'connecting', connNote: 'Reconnecting…' });
      setTimeout(open, Math.min(8000, 600 * 2 ** retry++));
    };
  };
  open();
}

export function disconnect() {
  generation++;
  socket?.close();
  socket = null;
}

// ---------------------------------------------------------------- local player intent
export let pending: { target: string; action: ActionId; at: Vec2; nav?: () => void } | null = null;

/** Start walking along `path` right now (prediction) and tell the server. */
export function walk(path: Vec2[], then: typeof pending = null) {
  const { selfId, players } = store.getState();
  if (!selfId) return;
  const self = players[selfId];
  if (self?.act) store.setState((s) => ({ players: { ...s.players, [selfId]: { ...self, act: null } } }));
  clearTimeout(doneTimer);
  sims.set(selfId, { path, t0: serverNow() });
  pending = then;
  send({ t: 'move', path });
}

/** Called every frame for the local sim: fires the queued interaction on arrival. */
export function tickPending(pos: PathSample) {
  if (!pending || pos.moving) return;
  const p = pending;
  if (Math.hypot(pos.x - p.at[0], pos.z - p.at[1]) > 1.6) return;
  pending = null;
  if (p.nav) p.nav();
  else if (!ACTIONS[p.action].nav) send({ t: 'act', target: p.target, action: p.action });
}
