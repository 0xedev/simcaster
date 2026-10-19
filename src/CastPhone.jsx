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
  initialApp = 'jobs',
  activeChannel = null
}) {
  const dialogRef = useRef(null);
  const [app, setApp] = useState(initialApp);

  const channelId = typeof activeChannel === 'string'
    ? activeChannel.replace(/^\/+/, '').toLowerCase()
    : activeChannel?.channel
      ? String(activeChannel.channel).replace(/^\/+/, '').toLowerCase()
      : activeChannel?.id
        ? String(activeChannel.id).replace(/^\/+/, '').toLowerCase()
        : null;

  const channelName = typeof activeChannel === 'object' && activeChannel?.name
    ? activeChannel.name
    : channelId
      ? channelId.charAt(0).toUpperCase() + channelId.slice(1)
      : null;

  const channelPill = typeof activeChannel === 'object' && activeChannel?.pill
    ? activeChannel.pill
    : channelId
      ? `/${channelId}`
      : null;

  const channelColor = typeof activeChannel === 'object' && activeChannel?.color
    ? activeChannel.color
    : channelId === 'dev'
      ? '#38bdf8'
      : channelId === 'memes'
        ? '#f43f5e'
        : channelId === 'base'
          ? '#0052ff'
          : '#8a63d2';
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
      const feedQuery = channelId
        ? `/feed?mode=trending&channel=${encodeURIComponent(channelId)}`
        : '/feed?mode=trending';
      phoneApi(feedQuery)
        .then((r) => setCasts(r.casts || []))
        .catch(() => {});
    } else if (app === 'friends') {
      phoneApi('/friends')
        .then((r) => setFriends(r.friends || []))
        .catch(() => {});
    } else if (app === 'mayor') {
      phoneApi('/city').then(setCity).catch(() => {});
    }
  }, [open, app, channelId]);

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
      const sign = res.deltaCreds >= 0 ? `+${res.deltaCreds} DEGEN` : `-${Math.abs(res.deltaCreds)} DEGEN`;
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
        `Quest Completed: ${res.quest.title} (+${res.rewardCreds} DEGEN, +${res.rewardXp} XP)${
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
      notify(`Upgraded your apartment to ${catalog.homeTiers[tier]?.name || tier}!`);
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
  const [tipCastHash, setTipCastHash] = useState(null);
  const [pendingTipHash, setPendingTipHash] = useState(null);
  const [pendingTipAmount, setPendingTipAmount] = useState(null);

  async function tipCastInPhone(cast, amount) {
    if (busy) return;
    try {
      setBusy(true);
      setPendingTipHash(cast.hash);
      setPendingTipAmount(amount);

      const res = await phoneApi('/tips', {
        method: 'POST',
        body: JSON.stringify({
          toFid: cast.author?.fid,
          amount,
          currency: 'degen',
          castHash: cast.hash
        })
      });

      if (soundEngine.playTipCoin) soundEngine.playTipCoin(amount);
      else soundEngine.playCash();

      if (res.user && onUserUpdate) {
        onUserUpdate(res.user);
      } else if (res.tip && onUserUpdate) {
        onUserUpdate((prev) => ({
          ...prev,
          creds: res.tip.fromBalance ?? ((prev?.creds ?? 250) - amount),
          needs: {
            ...(prev?.needs || {}),
            clout: Math.min(100, (prev?.needs?.clout || 0) + (res.tip.cloutAwarded || 5)),
            vibe: Math.min(100, (prev?.needs?.vibe || 0) + (res.tip.vibeAwarded || 5))
          }
        }));
      }

      window.dispatchEvent(
        new CustomEvent('simcaster:tip', {
          detail: {
            toFid: cast.author?.fid,
            toName: cast.author?.display_name || cast.author?.username,
            amount,
            currency: 'degen',
            castHash: cast.hash
          }
        })
      );

      notify(`Tipped @${cast.author?.username || 'caster'} ${amount} DEGEN (+5 Clout, +5 Vibe)!`);
      setTipCastHash(null);
    } catch (err) {
      notify(err.message || 'Tip failed');
    } finally {
      setBusy(false);
      setPendingTipHash(null);
      setPendingTipAmount(null);
    }
  }

  async function postQuickCast(e) {
    e.preventDefault();
    if (!castText.trim()) return;
    try {
      setBusy(true);
      await phoneApi('/casts', {
        method: 'POST',
        body: JSON.stringify({
          text: castText.trim(),
          ...(channelId ? { channel: channelId } : {}),
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
      notify(
        phoneReply
          ? 'Reply published (+2 Clout)!'
          : phoneQuote
            ? 'Quote cast published (+2 Clout)!'
            : channelId
              ? `Cast published to /${channelId} (+2 Clout)!`
              : 'Cast published (+2 Clout)!'
      );
      const feedQuery = channelId
        ? `/feed?mode=trending&channel=${encodeURIComponent(channelId)}`
        : '/feed?mode=trending';
      const r = await phoneApi(feedQuery);
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
      const feedQuery = channelId
        ? `/feed?mode=trending&channel=${encodeURIComponent(channelId)}`
        : '/feed?mode=trending';
      const r = await phoneApi(feedQuery);
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
    <dialog ref={dialogRef} className="castphone-dialog" closedby="any" aria-label="Phone">
      <div className="castphone-frame">
        <header className="castphone-status">
          <div className="castphone-brand">
            <span className="live-pulse" />
            <strong>Phone</strong>
            <span className="castphone-career">{currentCareer.title}</span>
            {user?.powerBadge && (
              <span
                className="castphone-vip-pill"
                title="Farcaster Power Badge Active"
                style={{
                  color: '#8a63d2',
                  fontWeight: 900,
                  fontSize: 10,
                  background: 'rgba(138, 99, 210, 0.2)',
                  padding: '2px 6px',
                  borderRadius: 99
                }}
              >
                🟣 VIP
              </span>
            )}
          </div>
          <button
            type="button"
            className={'castphone-radio-btn ' + (radioOn ? 'active' : '')}
            onClick={() => soundEngine.toggleRadio()}
            title="Toggle Lo-Fi & Synthwave FM Radio"
          >
            {radioOn ? <Volume2 size={13} /> : <VolumeX size={13} />} FM
          </button>
          <div className="castphone-wallet" title="DEGEN Balance">
            🎩 {creds.toLocaleString()} DEGEN
          </div>
          <button
            type="button"
            className="castphone-close"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close Phone"
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

        <nav className="castphone-tabs" aria-label="Phone Apps">
          <button type="button" className={app === 'jobs' ? 'active' : ''} onClick={() => { soundEngine.playClick(); setApp('jobs'); }}>
            <Briefcase size={15} /> Activities
          </button>
          <button type="button" className={app === 'shop' ? 'active' : ''} onClick={() => { soundEngine.playClick(); setApp('shop'); }}>
            <ShoppingBag size={15} /> Shop
          </button>
          <button type="button" className={app === 'mayor' ? 'active' : ''} onClick={() => { soundEngine.playClick(); setApp('mayor'); }}>
            <Crown size={15} /> City Hall
          </button>
          <button type="button" className={app === 'feed' ? 'active' : ''} onClick={() => { soundEngine.playClick(); setApp('feed'); }}>
            <Radio size={15} /> Casts
          </button>
          <button type="button" className={app === 'friends' ? 'active' : ''} onClick={() => { soundEngine.playClick(); setApp('friends'); }}>
            <Users size={15} /> Friends
          </button>
        </nav>

        <div className="castphone-body">
          {app === 'jobs' && (
            <div className="phone-section">
              <div className="phone-card highlight-card">
                <div className="phone-card-row">
                  <div>
                    <small>CAREER LEVEL</small>
                    <h4>
                      {currentCareer.title} ({currentCareer.mult}x DEGEN Bonus)
                    </h4>
                  </div>
                  <span className="xp-badge">{xp} XP</span>
                </div>
                <p>
                  {nextCareer
                    ? `${nextCareer.minXp - xp} XP until promotion to ${nextCareer.title} (${nextCareer.mult}x DEGEN)`
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
                  <div className="phone-section-title">DAILY QUESTS</div>
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
                              +{q.rewardCreds} DEGEN · +{q.rewardXp} XP
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
                                {ready ? `Claim +${q.rewardCreds} DEGEN` : 'In Progress'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              <div className="phone-section-title">CHANNEL VENUES & ACTIVITIES</div>
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
              <div className="phone-section-title">APARTMENT UPGRADES</div>
              <div className="tier-grid">
                {Object.values(catalog.homeTiers || {}).map((t) => {
                  const isCurrent = (user?.homeTier || 'studio') === t.id;
                  const order = ['studio', 'loft', 'penthouse'];
                  const owned = order.indexOf(t.id) <= order.indexOf(user?.homeTier || 'studio');
                  return (
                    <div key={t.id} className={'phone-card tier-card ' + (isCurrent ? 'tier-current' : '')}>
                      <div className="phone-card-row">
                        <strong>{t.name}</strong>
                        <span className="tier-price">{t.price === 0 ? 'Starter' : `${t.price.toLocaleString()} DEGEN`}</span>
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
                            <House size={13} /> Enter Home
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
                            Upgrade ({t.price.toLocaleString()} DEGEN)
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
                          Buy {item.price} DEGEN
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
                <small>WEEKLY CITY MAYOR</small>
                <h4>
                  {city.mayor ? `👑 Mayor ${city.mayor.displayName} (${city.mayor.votes} votes)` : 'Seat Open — Run Today!'}
                </h4>
                <p>
                  Active Policy: <b>{city.policyDetails?.label || 'Creator Stimulus'}</b> —{' '}
                  {city.policyDetails?.description || '+25% DEGEN on all Channel activities'}
                </p>
              </div>

              <form className="phone-card mayor-form" onSubmit={nominateSelf}>
                <strong>Run for City Mayor</strong>
                <input
                  value={slogan}
                  onChange={(e) => setSlogan(e.target.value)}
                  placeholder="Your campaign slogan (e.g. More DEGEN rewards for everyone!)"
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
                        : channelId
                          ? `Cast to /${channelId}`
                          : 'New Cast'}
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

                {channelId && !phoneReply && !phoneQuote && (
                  <div
                    className="phone-composer-channel"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      color: channelColor,
                      marginBottom: 6
                    }}
                  >
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: channelColor,
                        display: 'inline-block'
                      }}
                    />
                    Posting in {channelPill || `/${channelId}`} ({channelName || 'Channel'})
                  </div>
                )}

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
                        : channelId
                          ? `Share what's happening in ${channelPill || `/${channelId}`}…`
                          : "What's happening on Farcaster?"
                  }
                  maxLength={320}
                />
                <button type="submit" disabled={busy || !castText.trim()} className="phone-btn-earn">
                  <Send size={13} />{' '}
                  {phoneReply ? 'Post Reply' : phoneQuote ? 'Post Quote' : channelId ? `Cast to /${channelId}` : 'Publish Cast'}
                </button>
              </form>

              <div
                className="phone-feed-header"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: 10,
                  marginBottom: 6
                }}
              >
                <div className="phone-section-title" style={{ margin: 0 }}>
                  {channelId ? 'CHANNEL FEED' : 'LATEST CASTS'}
                </div>
                {channelId && (
                  <div
                    className="phone-channel-pill"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '3px 8px',
                      borderRadius: 12,
                      fontSize: 11,
                      fontWeight: 600,
                      background: channelColor + '20',
                      color: channelColor,
                      border: `1px solid ${channelColor}55`
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: channelColor,
                        display: 'inline-block'
                      }}
                    />
                    {channelPill || `/${channelId}`}
                  </div>
                )}
              </div>

              {casts.length === 0 ? (
                <div className="phone-empty">
                  {channelId
                    ? `No casts in ${channelPill || `/${channelId}`} yet. Be the first to cast here!`
                    : 'No casts found in the feed.'}
                </div>
              ) : (
                casts.slice(0, 8).map((c) => (
                  <div className="phone-card" key={c.hash}>
                    <div className="phone-card-row">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <strong>{c.author?.display_name || c.author?.username || 'Caster'}</strong>
                        {(c.author?.power_badge || c.author?.powerBadge) && (
                          <span title="Farcaster Power Badge" style={{ color: '#8a63d2', fontSize: 11 }}>
                            🟣
                          </span>
                        )}
                        {c.channel && (
                          <span
                            style={{
                              fontSize: 10,
                              padding: '1px 5px',
                              borderRadius: 8,
                              background: '#8a63d222',
                              color: '#8a63d2',
                              fontWeight: 600
                            }}
                          >
                            /{typeof c.channel === 'string' ? c.channel : c.channel?.id}
                          </span>
                        )}
                      </div>
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
                      {Number(c.author?.fid) !== Number(user?.fid) && (
                        <button
                          type="button"
                          className={`phone-btn-secondary ${tipCastHash === c.hash ? 'active' : ''}`}
                          onClick={() => setTipCastHash(tipCastHash === c.hash ? null : c.hash)}
                          aria-label={`Tip @${c.author?.username || 'caster'}`}
                        >
                          🎩 Tip DEGEN
                        </button>
                      )}
                    </div>

                    {tipCastHash === c.hash && (
                      <div className="phone-tip-panel" role="region" aria-label="Tip options" style={{
                        background: '#fdfcf7',
                        border: '1px solid #f3e6b5',
                        borderRadius: 10,
                        padding: '8px 10px',
                        marginTop: 8
                      }}>
                        <div className="phone-tip-header" style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          color: '#634b07'
                        }}>
                          <span>Tip @{c.author?.username || 'caster'} in DEGEN:</span>
                          <button
                            type="button"
                            className="phone-tip-close"
                            onClick={() => setTipCastHash(null)}
                            aria-label="Close tip options"
                            style={{ background: 'none', border: 'none', color: '#927e48', fontSize: 16, cursor: 'pointer' }}
                          >
                            ×
                          </button>
                        </div>
                        <div className="phone-tip-presets" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {[10, 50, 100].map((amt) => {
                            const canAfford = creds >= amt;
                            const isThisBusy = busy && pendingTipHash === c.hash && pendingTipAmount === amt;
                            return (
                              <button
                                key={amt}
                                type="button"
                                className="phone-btn-tip-preset"
                                disabled={busy || !canAfford}
                                onClick={() => tipCastInPhone(c, amt)}
                                title={!canAfford ? 'Insufficient DEGEN balance' : `Tip ${amt} DEGEN`}
                                style={{
                                  background: canAfford ? '#fff8dd' : '#f0eddf',
                                  color: canAfford ? '#795b05' : '#9a9484',
                                  border: canAfford ? '1.5px solid #f2db8a' : '1.5px solid #ded9c7',
                                  borderRadius: 8,
                                  padding: '5px 10px',
                                  fontSize: 11,
                                  fontWeight: 800,
                                  cursor: canAfford && !busy ? 'pointer' : 'not-allowed',
                                  opacity: canAfford ? 1 : 0.5
                                }}
                              >
                                {isThisBusy ? '...' : `${amt} DEGEN`}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {app === 'friends' && (
            <div className="phone-section">
              <div className="phone-section-title">FRIENDS & NEIGHBORS</div>
              {friends.length === 0 ? (
                <div className="phone-empty">
                  Click any player avatar in the world and choose <b>Add friend</b> to connect and visit each other’s
                  apartments!
                </div>
              ) : (
                friends.map((f) => (
                  <div className="phone-card candidate-row" key={f.fid}>
                    <div>
                      <strong>{f.displayName}</strong>
                      <small>
                        @{f.username || 'fid-' + f.fid} · {f.homeTier || 'studio'} apartment
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
                        <House size={13} /> Visit Home
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
