import { useEffect, useRef, useState } from 'react';
import { EMOTES } from '../../../shared/protocol';
import { ACTIONS, NEED_KEYS, type NeedKey } from '../../../shared/world';
import { api, send, serverNow } from '../net';
import { useStore } from '../store';

const NEED_LABEL: Record<NeedKey, string> = { energy: 'Energy', hunger: 'Hunger', fun: 'Fun', social: 'Social' };
const NEED_ICON: Record<NeedKey, string> = { energy: '⚡', hunger: '🍔', fun: '🎉', social: '💬' };

function ActivityBar() {
  const act = useStore((s) => (s.selfId ? s.players[s.selfId]?.act : null));
  const [, tick] = useState(0);
  useEffect(() => {
    if (!act) return;
    const t = setInterval(() => tick((n) => n + 1), 100);
    return () => clearInterval(t);
  }, [act]);
  if (!act) return null;
  const def = ACTIONS[act.action];
  const total = def.seconds * 1000;
  const left = Math.max(0, act.until - serverNow());
  return (
    <div className="activity">
      <span>{def.label}</span>
      <div className="bar"><i style={{ width: `${Math.min(100, ((total - left) / total) * 100)}%` }} /></div>
      <small>Click anywhere to cancel</small>
    </div>
  );
}

export default function Hud() {
  const me = useStore((s) => s.me)!;
  const room = useStore((s) => s.room);
  const home = useStore((s) => s.home);
  const conn = useStore((s) => s.conn);
  const connNote = useStore((s) => s.connNote);
  const chat = useStore((s) => s.chat);
  const count = useStore((s) => Object.keys(s.players).length);
  const whisperTo = useStore((s) => s.whisperTo);
  const whisperName = useStore((s) => (s.whisperTo ? s.players[s.whisperTo]?.name : null));
  const build = useStore((s) => s.build);
  const set = useStore((s) => s.set);
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [chat]);
  useEffect(() => {
    if (whisperTo) input.current?.focus();
  }, [whisperTo]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && document.activeElement?.tagName !== 'INPUT') input.current?.focus();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    if (whisperTo) send({ t: 'whisper', to: whisperTo, text: value });
    else send({ t: 'chat', text: value });
    setText('');
    set({ whisperTo: null });
    input.current?.blur();
  }

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    set({ me: null, phone: null, room: { kind: 'town' } });
  }

  const where = room.kind === 'town' ? 'Town plaza' : home ? (home.canEdit ? 'Your apartment' : `${home.ownerName}'s apartment`) : 'Apartment';

  return (
    <>
      <div className="hud top-left">
        <div className="card me">
          <div className="who">
            {me.pfpUrl ? <img src={me.pfpUrl} alt="" /> : <span className="pfp">{me.displayName[0]?.toUpperCase()}</span>}
            <div>
              <b>{me.displayName}</b>
              <small>{me.demo ? 'Demo visitor' : '@' + me.username}</small>
            </div>
            <span className="degen" title="DEGEN balance">🎩 {me.degen.toLocaleString()}</span>
          </div>
          <div className="needs">
            {NEED_KEYS.map((k) => (
              <div key={k} className={'need' + (me.needs[k] < 25 ? ' low' : '')} title={`${NEED_LABEL[k]} ${Math.round(me.needs[k])}%`}>
                <span>{NEED_ICON[k]}</span>
                <div className="bar"><i style={{ width: `${me.needs[k]}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="hud top-right">
        <span className="pill">{where} · {count} here</span>
        {room.kind === 'home' && home?.canEdit && !build && (
          <button className="btn" onClick={() => set({ build: { draft: home.items, placing: null, selected: null }, menu: null })}>🛠 Build</button>
        )}
        {room.kind === 'home' && <button className="btn" onClick={() => set({ room: { kind: 'town' } })}>← Town</button>}
        <button className="btn primary" onClick={() => set({ phone: 'feed', feedChannel: null, focusCast: null })}>📱 Phone</button>
        <button className="btn ghost" onClick={logout} title="Sign out">⎋</button>
      </div>

      {conn !== 'open' && <div className="conn" role="status">{connNote || 'Connecting…'}</div>}
      <ActivityBar />

      {!build && (
        <div className="hud bottom-left">
          <div className="chatlog" ref={log} aria-live="polite">
            {chat.slice(-30).map((l) => (
              <p key={l.id} className={l.kind + (l.mine ? ' mine' : '')}>
                {l.name && <b>{l.name}: </b>}{l.text}
              </p>
            ))}
          </div>
          <form onSubmit={submit} className="chatbox">
            {whisperTo && <button type="button" className="chip" onClick={() => set({ whisperTo: null })}>to {whisperName || '…'} ✕</button>}
            <input ref={input} value={text} onChange={(e) => setText(e.target.value)} maxLength={whisperTo ? 240 : 140}
              placeholder={whisperTo ? 'Whisper…' : 'Say something (Enter)'} aria-label="Chat message" />
            {EMOTES.map((n) => (
              <button type="button" key={n} className="emote" title={n} onClick={() => send({ t: 'emote', name: n })}>
                {n === 'wave' ? '👋' : n === 'cheer' ? '🙌' : '💃'}
              </button>
            ))}
          </form>
        </div>
      )}
      <div className="hint">Click to walk · click people and places · drag to turn · scroll to zoom</div>
    </>
  );
}
