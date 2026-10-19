import React, { useEffect, useRef, useState } from 'react';
import {
  Briefcase,
  ShoppingBag,
  Crown,
  Radio,
  Users,
  X,
  Zap,
  Sparkles,
  Check,
  House,
  Send,
  Heart,
  Flame,
  Coffee,
  Volume2,
  VolumeX
} from 'lucide-react';
import { soundEngine } from './sound.js';

async function phoneApi(url, options = {}) {
  const res = await fetch('/api' + url, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  let data = {};
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ')');
  return data;
}

export default function CastPhone({
  open,
  onClose,
  user,
  onUserUpdate,
  notify,
  onVisitHome,
  onGoHome,
  onGoPlaza,
  initialApp = 'jobs'
}) {
  const dialogRef = useRef(null);
  const [app, setApp] = useState(initialApp);
  const [catalog, setCatalog] = useState({
    furniture: [],
    homeTiers: {},
    policies: {},
    hotspots: [],
    careers: [],
    quests: []
  });
  const [city, setCity] = useState({ mayor: null, activePolicy: 'creator_stimulus', candidates: [] });
  const [casts, setCasts] = useState([]);
  const [friends, setFriends] = useState([]);
  const [busy, setBusy] = useState(false);
  const [slogan, setSlogan] = useState('');
  const [policy, setPolicy] = useState('creator_stimulus');
  const [castText, setCastText] = useState('');
  const [radioOn, setRadioOn] = useState(soundEngine.radioPlaying);

  useEffect(() => {
    return soundEngine.subscribe((s) => setRadioOn(s.radioPlaying));
  }, []);

  useEffect(() => {
    if (initialApp) setApp(initialApp);
  }, [initialApp]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => {
      if (open) onClose();
    };
    dialog.addEventListener('close', handleClose);

    // Fallback for browsers without declarative closedby="any" support
    let handleBackdropClick = null;
    if (typeof HTMLDialogElement !== 'undefined' && !('closedBy' in HTMLDialogElement.prototype)) {
      handleBackdropClick = (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (isDialogContent) return;
        dialog.close();
      };
      dialog.addEventListener('click', handleBackdropClick);
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
      if (handleBackdropClick) dialog.removeEventListener('click', handleBackdropClick);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    phoneApi('/catalog').then(setCatalog).catch(() => {});
    phoneApi('/city').then(setCity).catch(() => {});
    phoneApi('/me')
      .then((r) => {
        if (r.user && onUserUpdate) onUserUpdate(r.user);
      })
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (app === 'feed') {
      phoneApi('/feed?mode=trending')
        .then((r) => setCasts(r.casts || []))
        .catch(() => {});
    } else if (app === 'friends') {
      phoneApi('/friends')
        .then((r) => setFriends(r.friends || []))
        .catch(() => {});
    } else if (app === 'mayor') {
      phoneApi('/city').then(setCity).catch(() => {});
    }
  }, [open, app]);

  const needs = user?.needs || { energy: 85, hunger: 80, vibe: 75, clout: 10 };
  const creds = user?.creds ?? 250;
  const xp = user?.xp ?? 0;
  const currentCareer =
    catalog.careers.find((c) => c.id === (user?.career || 'newcomer')) || {
      id: 'newcomer',
      title: 'Street Newcomer',
      mult: 1.0,
      minXp: 0
    };
  const nextCareer = catalog.careers.find((c) => c.minXp > xp) || null;
  const ownedSet = new Set(user?.ownedFurniture || ['sofa', 'table', 'plant', 'lamp', 'rug', 'chair']);

  async function runHotspotAction(hotspotId, actionId) {
    try {
      setBusy(true);
      const res = await phoneApi('/world/interact', {
        method: 'POST',
        body: JSON.stringify({ hotspotId, actionId })
      });
      if (res.user && onUserUpdate) onUserUpdate(res.user);
      if (res.promoted) soundEngine.playPromotion();
      else if (res.deltaCreds > 0) soundEngine.playCash();
      else soundEngine.playClick();
      const sign = res.deltaCreds >= 0 ? `+₡${res.deltaCreds}` : `-₡${Math.abs(res.deltaCreds)}`;
      notify(`${res.hotspot}: ${res.action} (${sign})${res.promoted ? ` · Promoted to ${res.promoted}!` : ''}`);
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function claimQuestReward(questId) {
    try {
      setBusy(true);
      const res = await phoneApi('/quests/claim', {
        method: 'POST',
        body: JSON.stringify({ questId })
      });
      if (res.user && onUserUpdate) onUserUpdate(res.user);
      soundEngine.playPromotion();
      notify(
        `Quest Completed: ${res.quest.title} (+₡${res.rewardCreds}, +${res.rewardXp} XP)${
          res.promoted ? ` · Promoted to ${res.promoted}!` : ''
        }`
      );
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function buyItem(type) {
    try {
      setBusy(true);
      const res = await phoneApi('/shop/furniture', {
        method: 'POST',
        body: JSON.stringify({ type })
      });
      if (res.user && onUserUpdate) onUserUpdate(res.user);
      soundEngine.playCash();
      notify(`Unlocked ${res.item.label}! Place it in your apartment.`);
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function upgradeTier(tier) {
    try {
      setBusy(true);
      const res = await phoneApi('/me/home/upgrade', {
        method: 'POST',
        body: JSON.stringify({ tier })
      });
      if (res.user && onUserUpdate) onUserUpdate(res.user);
      soundEngine.playPromotion();
      notify(`Upgraded your real estate to ${catalog.homeTiers[tier]?.name || tier}!`);
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function nominateSelf(e) {
    e.preventDefault();
    try {
      setBusy(true);
      const res = await phoneApi('/city/nominate', {
        method: 'POST',
        body: JSON.stringify({ slogan, policy })
      });
      setCity(res.city);
      setSlogan('');
      soundEngine.playPromotion();
      notify('You are now on the City Mayor ballot!');
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function castVote(candidateFid) {
    try {
      setBusy(true);
      const res = await phoneApi('/city/vote', {
        method: 'POST',
        body: JSON.stringify({ candidateFid })
      });
      setCity(res.city);
      soundEngine.playCash();
      notify('Your vote has been counted at City Hall!');
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy(false);
    }
  }

  const [phoneReply, setPhoneReply] = useState(null);
  const [phoneQuote, setPhoneQuote] = useState(null);

  async function postQuickCast(e) {
    e.preventDefault();
    if (!castText.trim()) return;
    try {
      setBusy(true);
      await phoneApi('/casts', {
        method: 'POST',
        body: JSON.stringify({
          text: castText.trim(),
          ...(phoneReply ? { parent: phoneReply.hash } : {}),
          ...(phoneQuote
            ? {
                quote: {
                  hash: phoneQuote.hash,
                  fid: phoneQuote.author?.fid || 0,
                  displayName: phoneQuote.author?.display_name || 'Caster',
                  username: phoneQuote.author?.username || 'farcaster',
                  text: phoneQuote.text || ''
                }
              }
            : {})
        })
      });
      setCastText('');
      setPhoneReply(null);
      setPhoneQuote(null);
      notify(phoneReply ? 'Reply published (+2 Clout)!' : phoneQuote ? 'Quote cast published (+2 Clout)!' : 'Cast published (+2 Clout)!');
      const r = await phoneApi('/feed?mode=trending');
      setCasts(r.casts || []);
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function reactInPhone(cast, type) {
    const wasOn = type === 'like' ? !!cast.viewer_context?.liked : !!cast.viewer_context?.recasted;
    try {
      await phoneApi('/reactions', {
        method: 'POST',
        body: JSON.stringify({ hash: cast.hash, type, remove: wasOn })
      });
      const r = await phoneApi('/feed?mode=trending');
      setCasts(r.casts || []);
      notify(!wasOn ? (type === 'like' ? 'Liked (+1 Vibe)' : 'Recasted (+1 Vibe)') : 'Reaction removed');
    } catch (err) {
      notify(err.message);
    }
  }

  async function acceptFriend(fid) {
    try {
      setBusy(true);
      await phoneApi('/friends/accept', { method: 'POST', body: JSON.stringify({ fid }) });
      const r = await phoneApi('/friends');
      setFriends(r.friends || []);
      notify('Friend request accepted!');
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={dialogRef} className="castphone-dialog" closedby="any" aria-label="CastPhone OS">
      <div className="castphone-frame">
        <header className="castphone-status">
          <div className="castphone-brand">
            <span className="live-pulse" />
            <strong>CastPhone OS</strong>
            <span className="castphone-career">{currentCareer.title}</span>
          </div>
          <button
            type="button"
            className={'castphone-radio-btn ' + (radioOn ? 'active' : '')}
            onClick={() => soundEngine.toggleRadio()}
            title="Toggle Lo-Fi & Synthwave FM Radio"
          >
            {radioOn ? <Volume2 size={13} /> : <VolumeX size={13} />} FM
          </button>
          <div className="castphone-wallet" title="Simcaster Creds">
            ₡{creds.toLocaleString()}
          </div>
          <button
            type="button"
            className="castphone-close"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close CastPhone"
          >
            <X size={18} />
          </button>
        </header>

        <div className="castphone-needs">
          <div className="need-pill" title="Energy">
            <span>⚡ Energy</span>
            <div className="need-bar">
              <div style={{ width: `${needs.energy}%`, background: '#5dd3ba' }} />
            </div>
            <small>{needs.energy}%</small>
          </div>
          <div className="need-pill" title="Hunger">
            <span>🍲 Hunger</span>
            <div className="need-bar">
              <div style={{ width: `${needs.hunger}%`, background: '#eec35b' }} />
            </div>
            <small>{needs.hunger}%</small>
          </div>
          <div className="need-pill" title="Vibe">
            <span>🎧 Vibe</span>
            <div className="need-bar">
              <div style={{ width: `${needs.vibe}%`, background: '#ff898a' }} />
            </div>
            <small>{needs.vibe}%</small>
          </div>
          <div className="need-pill" title="Clout">
            <span>🔥 Clout</span>
            <div className="need-bar">
              <div style={{ width: `${needs.clout}%`, background: '#9871f1' }} />
            </div>
            <small>{needs.clout}</small>
          </div>
        </div>

        <nav className="castphone-tabs" aria-label="CastPhone Apps">
          <button type="button" className={app === 'jobs' ? 'active' : ''} onClick={() => { soundEngine.playClick(); setApp('jobs'); }}>
            <Briefcase size={15} /> Hustle
          </button>
          <button type="button" className={app === 'shop' ? 'active' : ''} onClick={() => { soundEngine.playClick(); setApp('shop'); }}>
            <ShoppingBag size={15} /> Shop & Pad
          </button>
          <button type="button" className={app === 'mayor' ? 'active' : ''} onClick={() => { soundEngine.playClick(); setApp('mayor'); }}>
            <Crown size={15} /> City Hall
          </button>
          <button type="button" className={app === 'feed' ? 'active' : ''} onClick={() => { soundEngine.playClick(); setApp('feed'); }}>
            <Radio size={15} /> Casts
          </button>
          <button type="button" className={app === 'friends' ? 'active' : ''} onClick={() => { soundEngine.playClick(); setApp('friends'); }}>
            <Users size={15} /> Crew
          </button>
        </nav>

        <div className="castphone-body">
          {app === 'jobs' && (
            <div className="phone-section">
              <div className="phone-card highlight-card">
                <div className="phone-card-row">
                  <div>
                    <small>CAREER TRACK</small>
                    <h4>
                      {currentCareer.title} ({currentCareer.mult}x Pay)
                    </h4>
                  </div>
                  <span className="xp-badge">{xp} XP</span>
                </div>
                <p>
                  {nextCareer
                    ? `${nextCareer.minXp - xp} XP until promotion to ${nextCareer.title} (${nextCareer.mult}x pay)`
                    : 'Maximum Mogul rank achieved! You run this city.'}
                </p>
                {city.policyDetails && (
                  <div className="policy-banner">
                    <Sparkles size={13} /> Active City Decree: <b>{city.policyDetails.label}</b> —{' '}
                    {city.policyDetails.description}
                  </div>
                )}
              </div>

              {(catalog.quests || []).length > 0 && (
                <>
                  <div className="phone-section-title">DAILY HUSTLE QUESTS</div>
                  <div className="hotspot-list">
                    {catalog.quests.map((q) => {
                      const qState = user?.quests?.[q.id] || { progress: 0, claimed: false };
                      const prog = Math.min(q.target, qState.progress || 0);
                      const ready = prog >= q.target && !qState.claimed;
                      return (
                        <div className="phone-card" key={q.id}>
                          <div className="phone-card-row">
                            <div>
                              <strong>{q.title}</strong>
                              <small style={{ display: 'block', color: '#7a7090' }}>{q.description}</small>
                            </div>
                            <span className="xp-badge">
                              +₡{q.rewardCreds} · +{q.rewardXp} XP
                            </span>
                          </div>
                          <div className="quest-bar-row">
                            <div className="need-bar" style={{ flex: 1 }}>
                              <div
                                style={{
                                  width: `${Math.round((prog / q.target) * 100)}%`,
                                  background: qState.claimed ? '#5dd3ba' : '#7a52d1'
                                }}
                              />
                            </div>
                            <small style={{ fontWeight: 800 }}>
                              {prog}/{q.target}
                            </small>
                            {qState.claimed ? (
                              <span className="owned-tag">
                                <Check size={12} /> Claimed
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={!ready || busy}
                                className={ready ? 'phone-btn-earn' : 'phone-btn-secondary'}
                                onClick={() => claimQuestReward(q.id)}
                              >
                                {ready ? `Claim +₡${q.rewardCreds}` : 'In Progress'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              <div className="phone-section-title">CITY HUSTLES & VENUES</div>
              <div className="hotspot-list">
                {catalog.hotspots.map((h) => (
                  <div className="phone-card" key={h.id}>
                    <div className="hotspot-head">
                      <span className="hotspot-emoji">{h.icon}</span>
                      <div>
                        <strong>{h.name}</strong>
                        <small>{h.tagline}</small>
                      </div>
                    </div>
                    <div className="hotspot-actions">
                      {h.actions.map((act) => (
                        <button
                          type="button"
                          key={act.id}
                          disabled={busy}
                          className={act.pay > 0 ? 'phone-btn-earn' : 'phone-btn-spend'}
                          onClick={() => runHotspotAction(h.id, act.id)}
                        >
                          {act.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {app === 'shop' && (
            <div className="phone-section">
              <div className="phone-section-title">REAL ESTATE UPGRADES</div>
              <div className="tier-grid">
                {Object.values(catalog.homeTiers || {}).map((t) => {
                  const isCurrent = (user?.homeTier || 'studio') === t.id;
                  const order = ['studio', 'loft', 'penthouse'];
                  const owned = order.indexOf(t.id) <= order.indexOf(user?.homeTier || 'studio');
                  return (
                    <div key={t.id} className={'phone-card tier-card ' + (isCurrent ? 'tier-current' : '')}>
                      <div className="phone-card-row">
                        <strong>{t.name}</strong>
                        <span className="tier-price">{t.price === 0 ? 'Starter' : `₡${t.price}`}</span>
                      </div>
                      <small>{t.description}</small>
                      <div className="tier-actions">
                        {isCurrent ? (
                          <button
                            type="button"
                            className="phone-btn-secondary"
                            onClick={() => {
                              dialogRef.current?.close();
                              if (onGoHome) onGoHome();
                            }}
                          >
                            <House size={13} /> Enter My Pad
                          </button>
                        ) : owned ? (
                          <span className="owned-tag">
                            <Check size={13} /> Unlocked
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={busy || creds < t.price}
                            className="phone-btn-earn"
                            onClick={() => upgradeTier(t.id)}
                          >
                            Upgrade (₡{t.price})
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="phone-section-title">FURNITURE & INTERACTIVE GEAR</div>
              <div className="shop-grid">
                {catalog.furniture.map((item) => {
                  const has = ownedSet.has(item.type);
                  return (
                    <div className="phone-card shop-item" key={item.type}>
                      <span className="shop-emoji">{item.emoji}</span>
                      <div className="shop-info">
                        <strong>{item.label}</strong>
                        <small>{item.effect}</small>
                      </div>
                      {has ? (
                        <span className="owned-tag">
                          <Check size={13} /> Owned
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={busy || creds < item.price}
                          className="phone-btn-earn"
                          onClick={() => buyItem(item.type)}
                        >
                          Buy ₡{item.price}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {app === 'mayor' && (
            <div className="phone-section">
              <div className="phone-card highlight-card">
                <small>WEEKLY CITY GOVERNOR / MAYOR</small>
                <h4>
                  {city.mayor ? `👑 Mayor ${city.mayor.displayName} (${city.mayor.votes} votes)` : 'Seat Open — Run Today!'}
                </h4>
                <p>
                  Active Policy: <b>{city.policyDetails?.label || 'Creator Stimulus'}</b> —{' '}
                  {city.policyDetails?.description || '+25% Creds on Plaza shifts'}
                </p>
              </div>

              <form className="phone-card mayor-form" onSubmit={nominateSelf}>
                <strong>Run for City Mayor</strong>
                <input
                  value={slogan}
                  onChange={(e) => setSlogan(e.target.value)}
                  placeholder="Your campaign slogan (e.g. Zero taxes & 24/7 power!)"
                  maxLength={90}
                  required
                />
                <select value={policy} onChange={(e) => setPolicy(e.target.value)} aria-label="Select City Policy">
                  {Object.values(catalog.policies || {}).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} — {p.description}
                    </option>
                  ))}
                </select>
                <button type="submit" disabled={busy} className="phone-btn-earn">
                  <Crown size={14} /> Launch Campaign
                </button>
              </form>

              <div className="phone-section-title">LIVE BALLOT</div>
              {city.candidates?.length ? (
                city.candidates.map((c, idx) => (
                  <div className="phone-card candidate-row" key={c.fid}>
                    <div>
                      <strong>
                        #{idx + 1} {c.displayName}
                      </strong>
                      <p>“{c.slogan}”</p>
                      <small>Platform: {catalog.policies?.[c.policy]?.label || c.policy}</small>
                    </div>
                    <button type="button" disabled={busy} className="phone-btn-earn" onClick={() => castVote(c.fid)}>
                      Vote ({c.votes})
                    </button>
                  </div>
                ))
              ) : (
                <div className="phone-empty">No candidates yet. Launch your campaign above to become Mayor!</div>
              )}
            </div>
          )}

          {app === 'feed' && (
            <div className="phone-section">
              <form className="phone-card mayor-form" onSubmit={postQuickCast}>
                <div className="phone-card-row">
                  <strong>
                    {phoneReply
                      ? `Reply to @${phoneReply.author?.username || 'farcaster'}`
                      : phoneQuote
                        ? `Quote @${phoneQuote.author?.username || 'farcaster'}`
                        : 'Quick Farcaster Cast'}
                  </strong>
                  {(phoneReply || phoneQuote) && (
                    <button
                      type="button"
                      className="phone-btn-secondary"
                      onClick={() => {
                        setPhoneReply(null);
                        setPhoneQuote(null);
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
                {phoneQuote && (
                  <small style={{ display: 'block', marginBottom: 6, opacity: 0.8 }}>
                    “{phoneQuote.text?.slice(0, 90)}”
                  </small>
                )}
                <input
                  value={castText}
                  onChange={(e) => setCastText(e.target.value)}
                  placeholder={
                    phoneReply
                      ? 'Write your reply…'
                      : phoneQuote
                        ? 'Add your quote commentary…'
                        : "Share what's happening in the Plaza…"
                  }
                  maxLength={320}
                />
                <button type="submit" disabled={busy || !castText.trim()} className="phone-btn-earn">
                  <Send size={13} /> {phoneReply ? 'Post Reply' : phoneQuote ? 'Post Quote' : 'Post Cast'}
                </button>
              </form>
              <div className="phone-section-title">LATEST CASTS</div>
              {casts.slice(0, 8).map((c) => (
                <div className="phone-card" key={c.hash}>
                  <div className="phone-card-row">
                    <strong>{c.author?.display_name || c.author?.username || 'Caster'}</strong>
                    <small>@{c.author?.username || 'farcaster'}</small>
                  </div>
                  <p className="phone-cast-text">{c.text}</p>
                  {c.quote_cast && (
                    <div
                      style={{
                        borderLeft: '2px solid #9871f1',
                        paddingLeft: 8,
                        margin: '6px 0',
                        fontSize: 12,
                        opacity: 0.9
                      }}
                    >
                      <b>@{c.quote_cast.username}</b>: {c.quote_cast.text}
                    </div>
                  )}
                  <div className="phone-action-list" style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      className="phone-btn-secondary"
                      onClick={() => reactInPhone(c, 'like')}
                    >
                      ♥ {c.reactions?.likes_count || 0}
                    </button>
                    <button
                      type="button"
                      className="phone-btn-secondary"
                      onClick={() => reactInPhone(c, 'recast')}
                    >
                      ↻ {c.reactions?.recasts_count || 0}
                    </button>
                    <button
                      type="button"
                      className="phone-btn-secondary"
                      onClick={() => {
                        setPhoneQuote(null);
                        setPhoneReply(c);
                      }}
                    >
                      Reply ({c.replies?.count || 0})
                    </button>
                    <button
                      type="button"
                      className="phone-btn-secondary"
                      onClick={() => {
                        setPhoneReply(null);
                        setPhoneQuote(c);
                      }}
                    >
                      Quote
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {app === 'friends' && (
            <div className="phone-section">
              <div className="phone-section-title">SIMCASTER CONTACTS</div>
              {friends.length === 0 ? (
                <div className="phone-empty">
                  Click any player avatar in the Plaza and choose <b>Add friend</b> to connect and visit each other’s
                  apartments!
                </div>
              ) : (
                friends.map((f) => (
                  <div className="phone-card candidate-row" key={f.fid}>
                    <div>
                      <strong>{f.displayName}</strong>
                      <small>
                        @{f.username || 'fid-' + f.fid} · {f.homeTier || 'studio'} pad
                      </small>
                    </div>
                    {f.status === 'friends' ? (
                      <button
                        type="button"
                        className="phone-btn-earn"
                        onClick={() => {
                          dialogRef.current?.close();
                          if (onVisitHome) onVisitHome(f.fid);
                        }}
                      >
                        <House size={13} /> Visit Pad
                      </button>
                    ) : f.status === 'incoming' ? (
                      <button type="button" disabled={busy} className="phone-btn-earn" onClick={() => acceptFriend(f.fid)}>
                        Accept
                      </button>
                    ) : (
                      <small>Pending</small>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
