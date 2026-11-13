import { useEffect, useState } from 'react';
import { CHARACTERS, CHARACTER_NAMES, TINTS, type AvatarLook } from '../../../shared/catalog';
import { CHANNEL_BOARDS, type Cast, type Me } from '../../../shared/protocol';
import { NEED_KEYS } from '../../../shared/world';
import { api, connect } from '../net';
import { useStore, type PhoneTab } from '../store';

function ago(iso: string) {
  const s = Math.max(1, (Date.now() - new Date(iso).getTime()) / 1000);
  return s < 60 ? `${s | 0}s` : s < 3600 ? `${(s / 60) | 0}m` : s < 86400 ? `${(s / 3600) | 0}h` : `${(s / 86400) | 0}d`;
}

const composeUrl = (text: string, channel: string | null) =>
  `https://farcaster.xyz/~/compose?text=${encodeURIComponent(text)}${channel ? `&channelKey=${encodeURIComponent(channel)}` : ''}`;

function CastCard({ cast, focus }: { cast: Cast; focus?: boolean }) {
  const sample = cast.hash.startsWith('sample-');
  return (
    <article className={'cast' + (focus ? ' focus' : '')}>
      <header>
        {cast.author.pfpUrl ? <img src={cast.author.pfpUrl} alt="" loading="lazy" /> : <span className="pfp">{cast.author.displayName[0]}</span>}
        <div>
          <b>{cast.author.displayName}</b>
          <small>@{cast.author.username} · {ago(cast.timestamp)}{cast.channel ? ` · /${cast.channel}` : ''}</small>
        </div>
      </header>
      <p>{cast.text}</p>
      {cast.image && <img className="embed" src={cast.image} alt="" loading="lazy" />}
      <footer>
        <span>💬 {cast.replies}</span><span>🔁 {cast.recasts}</span><span>♥ {cast.likes}</span>
        {!sample && (
          <a href={`https://farcaster.xyz/${cast.author.username}/${cast.hash.slice(0, 10)}`} target="_blank" rel="noopener noreferrer">Open ↗</a>
        )}
      </footer>
    </article>
  );
}

function Feed() {
  const feedChannel = useStore((s) => s.feedChannel);
  const focusCast = useStore((s) => s.focusCast);
  const me = useStore((s) => s.me)!;
  const set = useStore((s) => s.set);
  const [tab, setTab] = useState<string>(feedChannel ? 'c:' + feedChannel : me.demo ? 'trending' : 'following');
  const [data, setData] = useState<{ casts: Cast[]; sample: boolean; note?: string } | null>(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [custom, setCustom] = useState('');

  useEffect(() => { if (feedChannel) setTab('c:' + feedChannel); }, [feedChannel]);
  useEffect(() => {
    let alive = true;
    setData(null);
    setError('');
    const q = tab.startsWith('c:') ? `type=channel&channel=${tab.slice(2)}` : `type=${tab}`;
    api<{ casts: Cast[]; sample: boolean; note?: string }>('/feed?' + q)
      .then((r) => alive && setData(r))
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [tab]);

  const channel = tab.startsWith('c:') ? tab.slice(2) : null;
  const tabs = [...(me.demo ? [] : [['following', 'Following']]), ['trending', 'Trending'], ...CHANNEL_BOARDS.map((b) => ['c:' + b.id, b.label])];
  if (channel && !CHANNEL_BOARDS.some((b) => b.id === channel)) tabs.push(['c:' + channel, '/' + channel]);
  const casts = data?.casts || [];
  const ordered = focusCast ? [focusCast, ...casts.filter((c) => c.hash !== focusCast.hash)] : casts;

  return (
    <>
      <div className="chips">
        {tabs.map(([id, label]) => (
          <button key={id} className={'chip' + (tab === id ? ' on' : '')} onClick={() => { set({ focusCast: null, feedChannel: null }); setTab(id); }}>{label}</button>
        ))}
        <form onSubmit={(e) => { e.preventDefault(); const c = custom.toLowerCase().replace(/[^a-z0-9-]/g, ''); if (c) { setTab('c:' + c); setCustom(''); } }}>
          <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="/channel" maxLength={16} aria-label="Open a channel" />
        </form>
      </div>
      <form className="compose" onSubmit={(e) => { e.preventDefault(); window.open(composeUrl(draft, channel), '_blank', 'noopener'); setDraft(''); }}>
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={1024} rows={2}
          placeholder={channel ? `Cast to /${channel}…` : 'What is happening?'} aria-label="Cast text" />
        <button className="btn primary" disabled={!draft.trim()}>Cast ↗</button>
      </form>
      <p className="fine">Casting opens Farcaster to confirm. In-app posting needs a signer, which is not set up yet.</p>
      {data?.note && <p className="notice">{data.note}</p>}
      {error && <p className="error">{error}</p>}
      {!data && !error && <p className="fine">Loading casts…</p>}
      {data && !ordered.length && <p className="fine">No casts here yet.</p>}
      {ordered.map((c) => <CastCard key={c.hash} cast={c} focus={c.hash === focusCast?.hash} />)}
    </>
  );
}

function People() {
  const players = useStore((s) => s.players);
  const selfId = useStore((s) => s.selfId);
  const set = useStore((s) => s.set);
  const others = Object.values(players).filter((p) => p.id !== selfId);
  if (!others.length) return <p className="fine">Nobody else is here right now. Share the link to bring someone in.</p>;
  return (
    <>
      {others.map((p) => (
        <div className="person" key={p.id}>
          {p.pfp ? <img src={p.pfp} alt="" /> : <span className="pfp">{p.name[0]}</span>}
          <b>{p.name}</b>
          <button className="btn" onClick={() => set({ whisperTo: p.id, phone: null })}>Whisper</button>
          <button className="btn" onClick={() => set({ room: { kind: 'home', owner: p.fid }, phone: null })}>Visit</button>
        </div>
      ))}
      <p className="fine">Whispers are private to the two of you and are not stored. Farcaster direct messages are not part of the protocol, so they open in Farcaster.</p>
    </>
  );
}

function Wallet() {
  const me = useStore((s) => s.me)!;
  return (
    <>
      <div className="stat"><span>DEGEN</span><b>🎩 {me.degen.toLocaleString()}</b></div>
      <div className="stat"><span>XP</span><b>{me.xp}</b></div>
      {NEED_KEYS.map((k) => (
        <div className="stat" key={k}><span style={{ textTransform: 'capitalize' }}>{k}</span><b>{Math.round(me.needs[k])}%</b></div>
      ))}
      <p className="fine">DEGEN here is in-game currency, not the onchain token. Earn it at The Foundry and the Arcade; spend it on food, fun and furniture. Needs drop slowly over real time.</p>
    </>
  );
}

function Look() {
  const me = useStore((s) => s.me)!;
  const room = useStore((s) => s.room);
  const set = useStore((s) => s.set);
  const notify = useStore((s) => s.notify);
  const [look, setLook] = useState<AvatarLook>(me.look);
  const dirty = JSON.stringify(look) !== JSON.stringify(me.look);
  async function save() {
    try {
      const r = await api<{ me: Me }>('/me/look', { method: 'PUT', body: JSON.stringify(look) });
      set({ me: r.me });
      connect(room.kind === 'town' ? 'town' : `home:${room.owner}`); // rejoin so everyone sees the new look
      notify('Look saved');
    } catch (e) {
      notify((e as Error).message);
    }
  }
  return (
    <>
      <h4>Character</h4>
      <div className="chips">
        {CHARACTERS.map((c) => <button key={c} className={'chip' + (look.char === c ? ' on' : '')} onClick={() => setLook({ ...look, char: c })}>{CHARACTER_NAMES[c]}</button>)}
      </div>
      <h4>Tint</h4>
      <div className="swatches">
        {TINTS.map((t, i) => <button key={t} aria-label={`Tint ${i + 1}`} className={look.tint === i ? 'on' : ''} style={{ background: t }} onClick={() => setLook({ ...look, tint: i })} />)}
      </div>
      <label className="check"><input type="checkbox" checked={look.hat} onChange={(e) => setLook({ ...look, hat: e.target.checked })} /> Hat (where the character has one)</label>
      <label className="check"><input type="checkbox" checked={look.cape} onChange={(e) => setLook({ ...look, cape: e.target.checked })} /> Cape</label>
      <button className="btn primary wide" disabled={!dirty} onClick={save}>Save look</button>
    </>
  );
}

const TABS: [PhoneTab, string][] = [['feed', 'Feed'], ['people', 'People'], ['wallet', 'Wallet'], ['look', 'Look']];

export default function Phone() {
  const tab = useStore((s) => s.phone)!;
  const set = useStore((s) => s.set);
  return (
    <aside className="phone" aria-label="Phone">
      <header>
        <nav>
          {TABS.map(([id, label]) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => set({ phone: id })}>{label}</button>)}
        </nav>
        <button className="close" aria-label="Close phone" onClick={() => set({ phone: null, focusCast: null, feedChannel: null })}>✕</button>
      </header>
      <div className="phone-body">
        {tab === 'feed' && <Feed />}
        {tab === 'people' && <People />}
        {tab === 'wallet' && <Wallet />}
        {tab === 'look' && <Look />}
      </div>
    </aside>
  );
}
