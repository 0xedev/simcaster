import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthKitProvider, SignInButton } from '@farcaster/auth-kit';
import '@farcaster/auth-kit/styles.css';
import { Home, Compass, Gamepad2, Radio, UserRound, Settings, LogOut, Sparkles, ArrowUpRight, ArrowRight, Plus, MessageCircle, Heart, Repeat2, Share2, Users, CircleHelp, MapPin, House, Zap, Play, Crown, Shield, Check, Pencil, Coffee, Sofa, Flower2, Lamp, RefreshCw, ExternalLink, Lock, Wifi, Globe, ChevronRight, Star, Clock3, Search, Menu, X, Palette, WandSparkles, Smartphone, RotateCw, ShoppingBag } from 'lucide-react';
const WorldView = React.lazy(() => import('./WorldView.jsx'));
const SimDiorama = React.lazy(() => import('./SimDiorama.jsx'));
const CastPhone = React.lazy(() => import('./CastPhone.jsx'));
import './styles.css';
import { soundEngine } from './sound.js';

async function api(url, options={}) {
  const res=await fetch('/api'+url,{credentials:'same-origin',
    ...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});
  let data={};try{data=await res.json();}catch{}
  if(!res.ok) {
    // Expired/restarted server sessions must invalidate the UI immediately.
    // Do not treat a failed login attempt or first unauthenticated page load as an expired session.
    if(res.status===401 && !url.startsWith('/auth/') && url!=='/me') {
      window.dispatchEvent(new Event('simcaster:session-expired'));
    }
    throw new Error(data.error || 'Request failed ('+res.status+')');
  }
  return data;
}
const icons={home:Home,feed:Radio,world:Compass,arcade:Gamepad2,profile:UserRound,settings:Settings};
const nav=[
  {id:'home',label:'Overview',icon:Home},
  {id:'feed',label:'Social feed',icon:Radio},
  {id:'world',label:'Channels',icon:Compass},
  {id:'arcade',label:'Game arcade',icon:Gamepad2},
  {id:'profile',label:'My character',icon:UserRound}
];
const PALETTES=[{id:'violet',hex:'#9871f1',label:'Lavender'},{id:'citrus',hex:'#eec75d',label:'Sunny'},{id:'coral',hex:'#ff8e97',label:'Coral'},{id:'mint',hex:'#6cdbc4',label:'Mint'},{id:'sky',hex:'#78bcf4',label:'Sky'}];
const CLOTHES=['street','casual','sport','formal'];
const HAIR=['short','curls','buzz','long'];
const SKIN=[{id:'warm',hex:'#d9a989',label:'Warm'},{id:'light',hex:'#f0c5a3',label:'Light'},{id:'tan',hex:'#c8885d',label:'Tan'},{id:'deep',hex:'#875434',label:'Deep'},{id:'dark',hex:'#523322',label:'Dark'}];
const HAIR_COLORS=[{id:'espresso',hex:'#302438',label:'Espresso'},{id:'chestnut',hex:'#70432e',label:'Chestnut'},{id:'auburn',hex:'#af5537',label:'Auburn'},{id:'blonde',hex:'#dfbb72',label:'Blonde'},{id:'silver',hex:'#a9acb8',label:'Silver'}];
const ACCESSORIES=['none','glasses','cap','headphones','earrings'];
const BUILDS=['regular','slim','broad'];
function formatTime(value) {
  const n=Date.now()-new Date(value).getTime();
  if(!Number.isFinite(n))return '';
  if(n<60000)return 'now';
  if(n<3600000)return Math.floor(n/60000)+'m';
  if(n<86400000)return Math.floor(n/3600000)+'h';
  return Math.floor(n/86400000)+'d';
}
function initials(value){return (value||'?').trim().split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase();}
function AvatarBubble({name,color='violet',image,size='normal'}) {
  return <div className={'avatar-bubble '+(size==='large'?'avatar-large':'')} style={{background:PALETTES.find(p=>p.id===color)?.hex||'#9d7ef1'}}>{image?<img src={image} alt="" referrerPolicy="no-referrer" />:initials(name)}</div>;
}
function Toast({message,onClose}) {
  useEffect(()=>{if(!message)return;const t=setTimeout(onClose,5500);return()=>clearTimeout(t);},[message,onClose]);
  return message&&<div role="status" className="toast"><span>{message}</span><button aria-label="Dismiss" onClick={onClose}><X size={15}/></button></div>;
}
function Login({config,onSignedIn,onToast}){
  const [challenge,setChallenge]=useState(null);
  const [name,setName]=useState('');
  const [busy,setBusy]=useState(false);
  const attempt=useRef(false);
  const processedNonce=useRef('');
  const handlers=useRef({challenge,onSignedIn,onToast});
  handlers.current={challenge,onSignedIn,onToast};
  useEffect(()=>{
    let mounted=true;
    api('/auth/challenge').then(c=>{if(mounted)setChallenge(c);})
      .catch(e=>{if(mounted)handlers.current.onToast(e.message);});
    return()=>{mounted=false;};
  },[]);
  // Keep the callback reference stable. AuthKit calls onSuccess in an effect:
  // changing its identity while verifying used to replay the same one-time nonce.
  const success=useCallback(async result=>{
    const nonce=handlers.current.challenge?.nonce;
    if(attempt.current || (nonce && processedNonce.current===nonce))return;
    attempt.current=true;
    if(nonce)processedNonce.current=nonce;
    setBusy(true);
    try{
      if(!nonce || typeof result?.message!=='string' || typeof result?.signature!=='string')
        throw new Error('Incomplete Farcaster authentication. Please try again.');
      await api('/auth/verify',{method:'POST',
        body:JSON.stringify({nonce,message:result.message,signature:result.signature})});
      const session=await api('/auth/session');
      if(!session.user)throw new Error('Sign-in did not establish a session. Please try again.');
      handlers.current.onSignedIn(session.user);
    }catch(e){
      handlers.current.onToast(e.message);
      // Replace the consumed/expired nonce and remount the AuthKit button.
      try{setChallenge(await api('/auth/challenge'));}catch(err){handlers.current.onToast(err.message);}
    }finally{attempt.current=false;setBusy(false);}
  },[]);
  const authError=useCallback(error=>{
    handlers.current.onToast(error?.message || 'Farcaster sign-in failed. Please try again.');
  },[]);
  async function guestLogin(){
    try{
      setBusy(true);
      const result=await api('/auth/guest',{method:'POST',body:JSON.stringify({name:name.trim()||''})});
      onSignedIn(result.user);
    }catch(e){
      onToast(e.message);
    }finally{
      setBusy(false);
    }
  }
  async function demo(e){
    e.preventDefault();try{setBusy(true);const result=await api('/auth/demo',{method:'POST',body:JSON.stringify({name})});onSignedIn(result.user);}
    catch(e){onToast(e.message);}finally{setBusy(false);}
  }
  return <div className="welcome-shell">
    <header className="welcome-header">
      <Brand/>
      <span className="header-tag"><span className="live-pulse"/> A new kind of social space</span>
      <a href="https://www.farcaster.xyz/" target="_blank" rel="noreferrer" className="quiet-link">About Farcaster <ArrowUpRight size={15}/></a>
    </header>
    <main className="welcome-main">
      <div className="welcome-copy">
        <span className="eyebrow"><Sparkles size={14}/> YOUR PEOPLE. YOUR WORLD.</span>
        <h1>Less scrolling.<br/><em>More living.</em></h1>
        <p>Meet the humans behind the handles. Explore a world with friends, make your own little corner, and jump into games together — all powered by Farcaster.</p>
        <div className="welcome-benefits"><span><Check size={16}/> Real social identities</span><span><Check size={16}/> Shared 3D spaces</span><span><Check size={16}/> Games with friends</span></div>
        <div className="login-card">
          <strong>Your next adventure starts here.</strong>
          <p>Connect with your Farcaster account or jump right in as a guest.</p>
          <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginTop:8}}>
            {challenge?<SignInButton key={challenge.nonce} nonce={challenge.nonce} onSuccess={success} onError={authError}/>:<button disabled className="primary-btn">Preparing sign in…</button>}
            <button type="button" className="secondary-btn" disabled={busy} onClick={guestLogin} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'8px 14px',fontSize:13,fontWeight:600}}>
              <span>🎮</span> Explore as Guest
            </button>
          </div>
          {busy&&<small style={{marginTop:8,display:'block'}}>Entering Simcaster…</small>}
        </div>
      </div>
      <div className="welcome-art" aria-label="Illustration of a playful social world">
        <div className="art-glow"/>
        <div className="art-world"><div className="art-building building-a"/><div className="art-building building-b"/><div className="art-building building-c"/><div className="art-road"/>
          <div className="art-fountain">✦</div><div className="art-person person-a">👩🏽‍🚀</div><div className="art-person person-b">🧑🏽‍🎤</div><div className="art-person person-c">👨🏻‍💻</div>
        </div>
        <div className="float-note note-one"><span className="note-dot"/> Ava is exploring /farcaster</div>
        <div className="float-note note-two">🎮 &nbsp; Game night is on!</div>
        <div className="float-note note-three">💜 &nbsp; Make yourself at home</div>
        <div className="welcome-deco">A WORLD BEYOND THE FEED</div>
      </div>
    </main>
    <footer className="welcome-footer">SIMCASTER / EARLY BUILD <span>Made for the Farcaster community ✳</span></footer>
  </div>;
}
function Brand(){return <div className="brand"><div className="brand-mark"><div className="mark-eye"/><div className="mark-eye"/><div className="mark-mouth"/></div><span>simcaster<span className="brand-period">.</span></span></div>;}
function Sidebar({tab,onTab,user,stats,config,onLogout,openMobile,setOpenMobile}) {
  return <>
    {openMobile&&<div className="mobile-scrim" onClick={()=>setOpenMobile(false)}/>}
    <aside className={'sidebar '+(openMobile?'sidebar-open':'')}>
      <div className="sidebar-top"><Brand/><button className="close-nav" onClick={()=>setOpenMobile(false)}><X size={19}/></button></div>
      <div className="sidebar-label">YOUR SPACE</div>
      <nav className="side-nav">{nav.map(item=>{const Icon=item.icon;return <button key={item.id} className={'nav-link '+(tab===item.id?'active':'')} onClick={()=>{onTab(item.id);setOpenMobile(false);}}><Icon size={19} strokeWidth={1.9}/><span>{item.label}</span>{item.id==='world'&&<span className="nav-online"/>}</button>;})}</nav>
      <div className="sidebar-label sidebar-label-2">YOUR CORNER</div>
      <button className="nav-link" onClick={()=>{onTab('friends');setOpenMobile(false);}}><Users size={19}/> <span>Friends & requests</span></button>
      <button className="nav-link" onClick={()=>{onTab('home-space');setOpenMobile(false);}}><House size={19}/> <span>My apartment</span></button>
      <button className="nav-link" onClick={()=>{onTab('settings');setOpenMobile(false);}}><Settings size={19}/> <span>Settings</span></button>
      <div className="sidebar-spacer"/>
      <div className="sidebar-promo"><div className="promo-icon">✳</div><strong>The world is better together.</strong><p>Invite a friend to hang out in the channels.</p><button onClick={()=>{if(navigator.clipboard?.writeText)navigator.clipboard.writeText(location.origin).catch(()=>{});}}>Copy invite link <ArrowUpRight size={14}/></button></div>
      <div className="sidebar-bottom"><AvatarBubble name={user.displayName} image={user.avatarUrl} color={user.avatar?.color}/><div><b>{user.displayName}</b><span>{user.demo?'Demo account':'@'+user.username}</span></div><button onClick={onLogout} aria-label="Log out" title="Sign out"><LogOut size={17}/></button></div>
    </aside>
  </>;
}
function Topbar({user,tab,openMenu,stats,onTab,onOpenPhone}) {
  const titles={home:'Overview',feed:'Social feed',world:'Farcaster Channels',arcade:'Game arcade',profile:'My character',friends:'Friends & requests','home-space':'My apartment',settings:'Settings',arena:'Laser Tag Arena'};
  const creds=user.creds??250;
  return <header className="topbar">
    <div className="topbar-title"><button className="hamburger" onClick={openMenu}><Menu size={22}/></button><div><small>SIMCASTER / {tab==='world'?'CHANNELS':tab.toUpperCase()}</small><h2>{titles[tab]}</h2></div></div>
    <div className="topbar-actions">
      <button type="button" className="topbar-phone-btn" onClick={()=>onOpenPhone('jobs')} title="Open Phone"><Smartphone size={15}/> Phone · 🎩 {creds.toLocaleString()} DEGEN</button>
      <span className="global-online"><span className="live-pulse"/>{stats.players??0} online</span>
      <button className="top-avatar" onClick={()=>onTab('profile')} title="Your character"><AvatarBubble name={user.displayName} image={user.avatarUrl} color={user.avatar?.color}/></button>
    </div>
  </header>;
}
function Dashboard({user,onTab,onEnterChannel,stats,config,onOpenPhone}) {
  const needs=user.needs||{energy:85,hunger:80,vibe:75,clout:10};
  const creds=user.creds??250;
  const mayor=stats.city?.mayor;
  const policy=stats.city?.policyDetails;
  const jumpChannel=ch=>{if(onEnterChannel)onEnterChannel(ch);else onTab('world');};
  return <div className="page-content dashboard-page">
    <div className="page-kicker"><span className="live-pulse"/> LIVE SOCIAL WORLD · {policy?`ACTIVE DECREE: ${policy.label.toUpperCase()}`:'FARCASTER CHANNELS'}</div>
    <div className="dashboard-hero"><div className="hero-copy"><span className="hero-pill"><Sparkles size={14}/> YOUR FARCASTER WORLD</span><h1>Hey, {user.displayName.split(' ')[0]} <span className="wave">👋</span><br/><span>Jump into</span> the channels.</h1><p>Explore live 3D Farcaster Channels (/farcaster, /dev, /memes, /base), earn DEGEN from every activity, play 4 arcade games, or customize your apartment.</p>
      <div className="hero-cta-row">
        <button className="primary-btn" onClick={()=>jumpChannel('farcaster')}>Enter Channels <ArrowUpRight size={18}/></button>
        <button className="secondary-btn" onClick={()=>onOpenPhone('jobs')}><Smartphone size={16}/> Open Phone</button>
      </div>
    </div>
      <div className="hero-illustration hero-world-preview">
        <React.Suspense fallback={<div className="diorama-fallback">Loading your 3D channels…</div>}>
          <SimDiorama avatar={user.avatar} onExplore={()=>jumpChannel('farcaster')} onArcade={()=>onTab('arcade')} onHome={()=>onTab('home-space')}/>
        </React.Suspense>
        <div className="hero-3d-label"><span className="live-pulse"/> LIVE 3D FARCASTER CHANNELS</div>
        <div className="hero-world-places">
          <button onClick={()=>jumpChannel('farcaster')}>✦ /farcaster ↗</button>
          <button onClick={()=>jumpChannel('dev')}>💻 /dev ↗</button>
          <button onClick={()=>jumpChannel('memes')}>🕹️ /memes ↗</button>
          <button onClick={()=>jumpChannel('base')}>🛍️ /base ↗</button>
          <button onClick={()=>onTab('home-space')}>🏠 My home ↗</button>
        </div>
      </div>
    </div>
    <div className="stats-row stats-row-4">
      <div className="stat-card"><div className="stat-icon lavender"><Zap size={21}/></div><div><strong>🎩 {creds.toLocaleString()} DEGEN</strong><span>Balance · {(user.career||'newcomer').toUpperCase()}</span></div></div>
      <div className="stat-card"><div className="stat-icon mint"><Heart size={21}/></div><div><strong>⚡{needs.energy}% · 🍲{needs.hunger}%</strong><span>Energy & Hunger</span></div></div>
      <div className="stat-card"><div className="stat-icon peach"><Sparkles size={21}/></div><div><strong>🎧{needs.vibe}% · 🔥{needs.clout}</strong><span>Vibe & Clout</span></div></div>
      <div className="stat-card" onClick={()=>onOpenPhone('mayor')} style={{cursor:'pointer'}}><div className="stat-icon lavender"><Crown size={21}/></div><div><strong>{mayor?mayor.displayName:'Vote Now'}</strong><span>City Mayor · {stats.players??0} online</span></div></div>
    </div>
    <div className="section-heading"><div><span className="eyebrow">PICK YOUR ACTIVITY</span><h2>Where are we hanging out today?</h2></div><button className="text-link" onClick={()=>jumpChannel('farcaster')}>Explore all channels <ArrowRight size={17}/></button></div>
    <div className="adventure-grid">
      <button className="adventure-card explore-card" onClick={()=>jumpChannel('farcaster')}><div className="adventure-deco">✦</div><span className="adventure-illustration">🟣</span><span className="card-tag">4 LIVE CHANNELS</span><h3>Explore Farcaster Channels</h3><p>Walk through /farcaster Hub, /dev Builders Foundry, /memes Lounge, and /base Market to earn DEGEN.</p><span className="adventure-cta">Enter Channels <ArrowUpRight size={17}/></span></button>
      <button className="adventure-card arcade-card" onClick={()=>onTab('arcade')}><span className="adventure-illustration">🕹️</span><span className="card-tag">4 PLAYABLE GAMES</span><h3>Play in the Arcade</h3><p>Play 3D Laser Tag Arena, Channel Trivia Blitz, Degen Catcher, and Tower Stacker for instant DEGEN rewards.</p><span className="adventure-cta">Play games <ArrowUpRight size={17}/></span></button>
      <button className="adventure-card home-card" onClick={()=>onTab('home-space')}><span className="adventure-illustration">🛋️</span><span className="card-tag">3D APARTMENTS</span><h3>Customize your home</h3><p>Place interactive furniture, spin sets on your DJ booth, brew espresso, and earn DEGEN at home.</p><span className="adventure-cta">Visit apartment <ArrowUpRight size={17}/></span></button>
    </div>
    <div className="home-bottom"><div className="community-strip"><span className="community-symbol">❋</span><div><h3>Built around real Farcaster people.</h3><p>One identity across your social feed, 3D channels, and arcade games.</p></div><button onClick={()=>onTab('feed')}>Open social feed <ArrowRight size={17}/></button></div></div>
  </div>;
}
function SocialFeed({user,onUserUpdate,notify,writeClientId}) {
  const [mode,setMode]=useState('following'),[channelFilter,setChannelFilter]=useState(''),[casts,setCasts]=useState([]),[sample,setSample]=useState(false);
  const [fallback,setFallback]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[cursor,setCursor]=useState(null),[query,setQuery]=useState('');
  const [composeText,setComposeText]=useState(''),[replyTarget,setReplyTarget]=useState(null),[quoteTarget,setQuoteTarget]=useState(null),[busy,setBusy]=useState(false);
  const [conversation,setConversation]=useState(null),[threadLoading,setThreadLoading]=useState(false);
  const [reacting,setReacting]=useState({}),[localReactions,setLocalReactions]=useState({});
  const [tipTargetHash, setTipTargetHash] = useState(null);
  const [tipLoading, setTipLoading] = useState(false);
  const [pendingTipHash, setPendingTipHash] = useState(null);
  const [pendingTipAmount, setPendingTipAmount] = useState(null);

  async function tipCastInFeed(cast, amount) {
    if (tipLoading) return;
    try {
      setTipLoading(true);
      setPendingTipHash(cast.hash);
      setPendingTipAmount(amount);

      const res = await api('/tips', {
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
      setTipTargetHash(null);
    } catch (err) {
      notify(err.message || 'Tip failed');
    } finally {
      setTipLoading(false);
      setPendingTipHash(null);
      setPendingTipAmount(null);
    }
  }
  async function load(nextMode=mode,append=false,nextCursor=null,nextChannel=channelFilter){
    setLoading(true);setError('');
    try{
      const r=await api('/feed?mode='+nextMode+(nextChannel?'&channel='+encodeURIComponent(nextChannel):'')+(nextCursor?'&cursor='+encodeURIComponent(nextCursor):''));
      setCasts(prev=>append?[...prev,...r.casts]:r.casts);setSample(!!r.sample);setFallback(!!r.feedFallback);setCursor(r.cursor||null);
    }catch(e){setError(e.message);if(!append)setCasts([]);}
    finally{setLoading(false);}
  }
  useEffect(()=>{load(mode,false,null,channelFilter);},[mode,channelFilter]);
  async function openThread(c) {
    setReplyTarget(c);setConversation(null);setThreadLoading(true);
    try{const data=await api('/casts/'+encodeURIComponent(c.hash)+'/conversation');setConversation(data.conversation||{});}
    catch(e){notify(e.message);}finally{setThreadLoading(false);}
  }
  function startQuote(c) {
    setQuoteTarget(c);
    document.getElementById('feed-compose')?.focus();
  }
  async function react(c,type) {
    if(reacting[c.hash+type])return;
    const local=localReactions[c.hash]||{};
    const wasOn=local[type]!==undefined?local[type]:!!(type==='like'?c.viewer_context?.liked:c.viewer_context?.recasted);
    setReacting(prev=>({...prev,[c.hash+type]:true}));
    try{
      await api('/reactions',{method:'POST',body:JSON.stringify({hash:c.hash,type,remove:wasOn})});
      setLocalReactions(prev=>({...prev,[c.hash]:{...(prev[c.hash]||{}),[type]:!wasOn}}));
      notify(!wasOn?(type==='like'?'Liked in Simcaster (+1 Vibe)':'Recasted in Simcaster (+1 Vibe)'):'Reaction removed');
    }catch(e){notify(e.message);}finally{setReacting(prev=>({...prev,[c.hash+type]:false}));}
  }
  async function publish(e){
    e.preventDefault();
    if(busy||!composeText.trim())return;
    try{
      setBusy(true);
      const quotePayload=quoteTarget?{
        hash:quoteTarget.hash,
        fid:quoteTarget.author?.fid||0,
        displayName:quoteTarget.author?.display_name||'Caster',
        username:quoteTarget.author?.username||'farcaster',
        text:quoteTarget.text||''
      }:undefined;
      await api('/casts',{method:'POST',body:JSON.stringify({
        text:composeText.trim(),
        ...(channelFilter?{channel:channelFilter}:{}),
        ...(replyTarget?{parent:replyTarget.hash}:{}),
        ...(quotePayload?{quote:quotePayload}:{})
      })});
      notify(replyTarget?'Reply published (+2 Clout)':quoteTarget?'Quote cast published (+2 Clout)':channelFilter?`Cast published to /${channelFilter} (+2 Clout)`:'Cast published (+2 Clout)');
      setComposeText('');setQuoteTarget(null);
      if(replyTarget){
        const target=replyTarget;
        await openThread(target);
      }
      await load(mode,false,null,channelFilter);
    }catch(e){notify(e.message);}finally{setBusy(false);}
  }
  function share(c){
    const text=`@${c.author?.username||'farcaster'}: "${c.text}" — via Simcaster`;
    if(navigator.clipboard?.writeText){navigator.clipboard.writeText(text).then(()=>notify('Cast copied to clipboard')).catch(()=>notify('Copied cast'));}
    else notify('Cast ready to share');
  }
  const visible=casts.filter(c=>(c.text+' '+c.author?.display_name+' '+c.author?.username).toLowerCase().includes(query.toLowerCase()));
  const replies=Array.isArray(conversation?.direct_replies)?conversation.direct_replies:
    Array.isArray(conversation?.cast?.direct_replies)?conversation.cast.direct_replies:[];
  const CHANNELS=[
    {id:'',label:'All Channels'},
    {id:'farcaster',label:'✦ /farcaster'},
    {id:'dev',label:'💻 /dev'},
    {id:'memes',label:'🕹️ /memes'},
    {id:'base',label:'🛍️ /base'}
  ];
  return <div className="page-content feed-page">
    <div className="section-heading page-heading">
      <div><span className="eyebrow">HAPPENING IN YOUR CHANNELS</span><h2>Your Farcaster feed, right here.</h2><p>Post, reply, quote, like, recast and tip 100% inside Simcaster across live channels.</p></div>
      <button className="primary-btn" onClick={()=>{setReplyTarget(null);setQuoteTarget(null);document.getElementById('feed-compose')?.focus();}}>
        <Pencil size={17}/> New cast
      </button>
    </div>
    {fallback&&!sample&&<div className="demo-banner"><Sparkles size={17}/><span>Showing your live Farcaster following & Simcaster channel feed.</span></div>}
    {sample&&<div className="demo-banner"><Sparkles size={17}/><span>In-app Simcaster social feed active — post, reply, quote, like & recast directly below.</span></div>}
    <div className="feed-grid"><div className="feed-main">
      <form className="inline-feed-composer" onSubmit={publish}>
        <div className="composer-byline"><AvatarBubble name={user.displayName} image={user.avatarUrl} color={user.avatar?.color}/>
          <div><b>{user.displayName}</b><small>{replyTarget?'Replying to @'+replyTarget.author?.username:quoteTarget?'Quoting @'+quoteTarget.author?.username:channelFilter?`Posting to /${channelFilter} channel`:'Share what’s happening in your world'}</small></div>
          {(replyTarget||quoteTarget)&&<button type="button" onClick={()=>{setReplyTarget(null);setQuoteTarget(null);}} aria-label="Cancel reply or quote">×</button>}
        </div>
        {quoteTarget&&<div className="thread-reply" style={{marginBottom:8,borderLeft:'3px solid #9871f1',paddingLeft:10}}>
          <b>Quoting @{quoteTarget.author?.username||'farcaster'}</b>
          <p style={{margin:'2px 0 0'}}>{quoteTarget.text}</p>
        </div>}
        <textarea id="feed-compose" value={composeText} maxLength={320} onChange={e=>setComposeText(e.target.value)} placeholder={replyTarget?'Write your reply…':quoteTarget?'Add your thoughts to this quote cast…':channelFilter?`Share what's happening in /${channelFilter}…`:'What’s happening in your world?'} rows={2}/>
        <div className="composer-actions"><span>{composeText.length}/320 · {channelFilter?`Channel: /${channelFilter}`:'Global feed'} (+2 Clout)</span>
          <button className="primary-btn" type="submit" disabled={busy||!composeText.trim()}>{busy?'Publishing…':replyTarget?'Reply':quoteTarget?'Quote cast':channelFilter?`Post to /${channelFilter}`:'Post cast'}</button>
        </div>
      </form>
      <div className="feed-tabs" style={{flexWrap:'wrap',gap:8}}>
        <button className={mode==='trending'&&!channelFilter?'selected':''} onClick={()=>{setChannelFilter('');setMode('trending');}}>For you <Sparkles size={14}/></button>
        <button className={mode==='following'&&!channelFilter?'selected':''} onClick={()=>{setChannelFilter('');setMode('following');}}>Following</button>
        {CHANNELS.filter(ch=>ch.id).map(ch=>(
          <button key={ch.id} className={channelFilter===ch.id?'selected':''} onClick={()=>setChannelFilter(channelFilter===ch.id?'':ch.id)}>{ch.label}</button>
        ))}
        <div className="feed-search"><Search size={16}/><input aria-label="Filter visible casts" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Filter posts"/></div>
      </div>
      {error&&<div className="inline-error"><p>{error}</p><button onClick={()=>load()}>Retry <RefreshCw size={15}/></button></div>}
      {loading&&!casts.length&&<div className="loading-state"><div className="spinner"/> Loading the conversation…</div>}
      {visible.map(c=>{const local=localReactions[c.hash]||{};
        const liked=local.like!==undefined?local.like:!!c.viewer_context?.liked;
        const recasted=local.recast!==undefined?local.recast:!!c.viewer_context?.recasted;
        const likes=(c.reactions?.likes_count||0)+(local.like!==undefined?(Number(local.like)-Number(!!c.viewer_context?.liked)):0);
        const recasts=(c.reactions?.recasts_count||0)+(local.recast!==undefined?(Number(local.recast)-Number(!!c.viewer_context?.recasted)):0);
        const chTag=typeof c.channel==='string'?c.channel:c.channel?.id;
        return <article className="cast-card" key={c.hash}>
          <div className="cast-head"><AvatarBubble name={c.author?.display_name || c.author?.username} image={c.author?.pfp_url}/><div className="cast-author"><div style={{display:'flex',alignItems:'center',gap:6}}><b>{c.author?.display_name || 'Farcaster user'}</b>{(c.author?.power_badge||c.author?.powerBadge)&&<span title="Power Badge" style={{color:'#8a63d2',fontSize:12}}>🟣</span>}{chTag&&<span style={{fontSize:11,padding:'1px 7px',borderRadius:99,background:'rgba(138,99,210,0.14)',color:'#8a63d2',fontWeight:700}}>/{chTag}</span>}<span>· {formatTime(c.timestamp)}</span></div><small>@{c.author?.username||'unknown'}</small></div><button title="Read conversation here" onClick={()=>openThread(c)} aria-label="Open conversation"><MessageCircle size={18}/></button></div>
          <p className="cast-text">{c.text}</p>
          {c.quote_cast&&<div className="thread-reply" style={{margin:'8px 0',borderLeft:'3px solid #9871f1',paddingLeft:10,background:'rgba(152,113,241,0.08)',borderRadius:8,padding:'8px 12px'}}>
            <b>@{c.quote_cast.username||'farcaster'}</b>
            <p style={{margin:'4px 0 0'}}>{c.quote_cast.text}</p>
          </div>}
          {c.embeds?.filter(x=>typeof x.url==='string'&&/^https:\/\//.test(x.url)).slice(0,2).map(x=><a className="cast-embed" key={x.url} href={x.url} target="_blank" rel="noreferrer"><ExternalLink size={14}/> {x.url.replace(/^https:\/\//,'').split('/')[0]}</a>)}
          <div className="cast-actions">
            <button onClick={()=>openThread(c)}><MessageCircle size={17}/> {c.replies?.count||0} Reply</button>
            <button disabled={!!reacting[c.hash+'recast']} className={recasted?'reacted':''} onClick={()=>react(c,'recast')}><Repeat2 size={17}/> {recasts} Recast</button>
            <button onClick={()=>startQuote(c)}><Pencil size={16}/> Quote</button>
            <button disabled={!!reacting[c.hash+'like']} className={liked?'reacted liked':''} onClick={()=>react(c,'like')}><Heart size={17} fill={liked?'currentColor':'none'}/> {likes} Like</button>
            <button onClick={()=>share(c)}><Share2 size={17}/> Copy</button>
            {c.author?.fid && Number(c.author.fid) !== Number(user?.fid) && (
              <button
                className={`cast-tip-btn ${tipTargetHash === c.hash ? 'active' : ''}`}
                onClick={() => setTipTargetHash(tipTargetHash === c.hash ? null : c.hash)}
                title="Tip author DEGEN"
              >
                🎩 Tip DEGEN
              </button>
            )}
          </div>
          {tipTargetHash === c.hash && (
            <div className="cast-tip-panel" style={{display:'flex',alignItems:'center',gap:8,padding:'6px 12px',background:'rgba(255,215,0,0.08)',borderRadius:8,margin:'6px 0',border:'1px solid rgba(255,215,0,0.2)'}}>
              <span style={{fontSize:12,fontWeight:600,color:'#ffd700'}}>Tip @{c.author?.username || 'author'} in DEGEN:</span>
              {[10, 50, 100].map(amt => (
                <button
                  key={amt}
                  className="secondary-btn"
                  style={{padding:'3px 8px',fontSize:12}}
                  disabled={tipLoading && pendingTipHash === c.hash}
                  onClick={() => tipCastInFeed(c, amt)}
                >
                  {tipLoading && pendingTipHash === c.hash && pendingTipAmount === amt ? '…' : `${amt} DEGEN`}
                </button>
              ))}
              <button
                style={{background:'none',border:'none',color:'#888',cursor:'pointer',fontSize:14,marginLeft:'auto'}}
                onClick={() => setTipTargetHash(null)}
                aria-label="Close tip selector"
              >
                ✕
              </button>
            </div>
          )}
          {replyTarget?.hash===c.hash&&<div className="thread-inline">
            <div className="thread-head"><strong>Conversation</strong><button onClick={()=>{setReplyTarget(null);setConversation(null);}} aria-label="Close conversation">×</button></div>
            {threadLoading?<span className="thread-status">Loading replies…</span>:
              replies.length?replies.slice(0,15).map(reply=><div className="thread-reply" key={reply.hash}>
                <b>@{reply.author?.username||'farcaster'}</b><p>{reply.text}</p>
              </div>):<p className="thread-status">No replies yet. Start the conversation above.</p>}
            <button className="secondary-btn" onClick={()=>document.getElementById('feed-compose')?.focus()}>Write a reply ↑</button>
          </div>}
        </article>;
      })}
      {!loading&&!error&&visible.length===0&&<div className="empty-state">No posts found for this view.</div>}
      {cursor&&<button className="secondary-btn load-more" disabled={loading} onClick={()=>load(mode,true,cursor)}>{loading?'Loading…':'Load more casts'} <ArrowRight size={16}/></button>}
    </div>
    <aside className="feed-aside">
      <div className="aside-card violet-aside"><span className="eyebrow">YOUR SPACE</span><h3>People, not just posts.</h3><p>One Farcaster identity across your feed and 3D channels.</p><span className="aside-decoration">✳</span></div>
      <div className="aside-card">
        <h3>Simcaster Social</h3>
        <p>Post, reply, quote, like, recast, and tip DEGEN directly inside Simcaster.</p>
        <div style={{marginTop:10,color:'#6cdbc4',fontSize:13,display:'flex',alignItems:'center',gap:6}}>
          <span>✓</span> <strong>In-app social active</strong>
        </div>
      </div>
    </aside></div>
  </div>;
}

const TRIVIA_QUESTIONS = [
  {
    q: 'Which Farcaster channel is the home district for builders shipping mini-apps and protocol code?',
    options: ['/dev', '/fitness', '/cooking', '/travel'],
    answer: 0
  },
  {
    q: 'What community currency powers tipping, activities, and arcade rewards across Simcaster?',
    options: ['DEGEN', 'Paper Coupons', 'Silver Nickels', 'Bus Tokens'],
    answer: 0
  },
  {
    q: 'Which badge grants Farcaster users free VIP entry to the Purple Rooftop Lounge?',
    options: ['🟣 Power Badge', '🟢 Bronze Ticket', '🔵 Parking Permit', '⚪ Guest Sticker'],
    answer: 0
  },
  {
    q: 'What happens when you interact with furniture inside your 3D Apartment?',
    options: ['You earn DEGEN and boost your Energy, Vibe & Clout', 'Nothing happens', 'It deletes your room', 'It logs you out'],
    answer: 0
  },
  {
    q: 'In the 3D Laser Tag Arena, how can you earn DEGEN even if no other human player is in the room?',
    options: ['Tag the 3 AI Arena Bots (+15 DEGEN per hit, +60 DEGEN per knockdown)', 'Wait in the corner', 'Turn off your monitor', 'Unplug your keyboard'],
    answer: 0
  }
];

function Arcade({onPlay,leaderboard,user,onUserUpdate,notify,onRefreshLeaderboard}) {
  const [activeGame, setActiveGame] = useState('trivia');
  const [claiming, setClaiming] = useState(false);

  // Game 2: Channel Trivia Blitz state
  const [qIndex, setQIndex] = useState(0);
  const [triviaScore, setTriviaScore] = useState(0);
  const [triviaDone, setTriviaDone] = useState(false);
  const [triviaFeedback, setTriviaFeedback] = useState('');

  // Game 3: Degen Catcher state
  const [catcherRunning, setCatcherRunning] = useState(false);
  const [catcherTime, setCatcherTime] = useState(15);
  const [catcherScore, setCatcherScore] = useState(0);
  const [catcherTargets, setCatcherTargets] = useState([
    { id: 1, icon: '🎩', label: '+25 DEGEN', val: 25, x: 18, y: 28 },
    { id: 2, icon: '🟣', label: '+35 DEGEN', val: 35, x: 52, y: 45 },
    { id: 3, icon: '⚡', label: '+20 DEGEN', val: 20, x: 76, y: 24 },
    { id: 4, icon: '💎', label: '+40 DEGEN', val: 40, x: 34, y: 66 }
  ]);

  // Game 4: Onchain Tower Stacker state
  const [stackFloors, setStackFloors] = useState(1);
  const [stackSlider, setStackSlider] = useState(50);
  const [stackDir, setStackDir] = useState(1);
  const [stackStatus, setStackStatus] = useState('Drop blocks inside the purple target zone to stack DEGEN!');

  useEffect(() => {
    if (!catcherRunning) return;
    const timer = setInterval(() => {
      setCatcherTime((prev) => {
        if (prev <= 1) {
          setCatcherRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [catcherRunning]);

  useEffect(() => {
    if (activeGame !== 'stacker') return;
    const timer = setInterval(() => {
      setStackSlider((prev) => {
        let next = prev + stackDir * 4.5;
        if (next >= 92) {
          setStackDir(-1);
          next = 92;
        } else if (next <= 8) {
          setStackDir(1);
          next = 8;
        }
        return next;
      });
    }, 45);
    return () => clearInterval(timer);
  }, [activeGame, stackDir]);

  async function claimArcadeDegen(gameName, amount, onReset) {
    if (claiming || amount <= 0) return;
    try {
      setClaiming(true);
      const res = await api('/arcade/reward', {
        method: 'POST',
        body: JSON.stringify({ game: gameName, reward: amount })
      });
      soundEngine.playPromotion();
      if (res.user && onUserUpdate) onUserUpdate(res.user);
      if (onRefreshLeaderboard) onRefreshLeaderboard();
      const earned = res.reward ?? res.rewardCreds ?? amount;
      const earnedXp = res.rewardXp ?? 20;
      notify(`🎉 Won +${earned} DEGEN & +${earnedXp} XP in ${gameName}!`);
      if (onReset) onReset();
    } catch (e) {
      notify(e.message);
    } finally {
      setClaiming(false);
    }
  }

  function answerTrivia(optIndex) {
    if (triviaDone) return;
    const currentQ = TRIVIA_QUESTIONS[qIndex];
    const correct = optIndex === currentQ.answer;
    const delta = correct ? 40 : 15;
    const nextScore = triviaScore + delta;
    setTriviaScore(nextScore);
    if (correct) {
      soundEngine.playCash();
      setTriviaFeedback(`✓ Correct! +${delta} DEGEN added to your pot.`);
    } else {
      soundEngine.playClick();
      setTriviaFeedback(`Good try! +${delta} DEGEN participation bonus added.`);
    }
    if (qIndex + 1 >= TRIVIA_QUESTIONS.length) {
      setTriviaDone(true);
    } else {
      setQIndex((prev) => prev + 1);
    }
  }

  function hitCatcherTarget(target) {
    soundEngine.playCash();
    if (!catcherRunning && catcherTime === 15) setCatcherRunning(true);
    setCatcherScore((prev) => prev + target.val);
    const icons = [
      { icon: '🎩', label: '+25 DEGEN', val: 25 },
      { icon: '🟣', label: '+35 DEGEN', val: 35 },
      { icon: '⚡', label: '+20 DEGEN', val: 20 },
      { icon: '💎', label: '+40 DEGEN', val: 40 }
    ];
    const pick = icons[Math.floor(Math.random() * icons.length)];
    setCatcherTargets((prev) =>
      prev.map((item) =>
        item.id === target.id
          ? {
              ...pick,
              id: Date.now() + Math.random(),
              x: 12 + Math.floor(Math.random() * 74),
              y: 16 + Math.floor(Math.random() * 66)
            }
          : item
      )
    );
  }

  function dropStackBlock() {
    const inZone = stackSlider >= 24 && stackSlider <= 76;
    if (inZone) {
      soundEngine.playCash();
      const nextFloors = Math.min(8, stackFloors + 1);
      setStackFloors(nextFloors);
      setStackStatus(`🔥 Stacked Floor #${nextFloors}! Pot is now ${nextFloors * 30} DEGEN.`);
    } else {
      soundEngine.playClick();
      const nextFloors = Math.min(8, stackFloors + 1);
      setStackFloors(nextFloors);
      setStackStatus(`⚡ Glitched edge block stabilized! Floor #${nextFloors} (${nextFloors * 30} DEGEN).`);
    }
  }

  const creds = user?.creds ?? 250;

  return <div className="page-content arcade-page">
    <div className="section-heading page-heading">
      <div>
        <span className="eyebrow">PLAY GAMES · STACK DEGEN</span>
        <h2>Simcaster Arcade 🕹️</h2>
        <p>All 4 games are live and pay out instant DEGEN to your wallet.</p>
      </div>
      <div style={{display:'flex',gap:10,alignItems:'center'}}>
        <span className="arcade-wallet-pill">🎩 {creds.toLocaleString()} DEGEN</span>
        <span className="arcade-live"><span className="live-pulse"/> 4 playable games</span>
      </div>
    </div>

    <div className="featured-game">
      <div className="game-feature-copy">
        <span className="hero-pill">✦ 3D ARENA · SOLO & MULTIPLAYER</span>
        <h2>LASER<br/><em>TAG ARENA.</em></h2>
        <p>Jump into the 3D neon arena against live players and 3 AI Arena Bots (Nova Bot, Byte Striker, Glitch Runner). Click any target or press Space to fire — earn +15 DEGEN per hit, +60 DEGEN per knockdown, and +150 DEGEN per win!</p>
        <div className="game-details">
          <span><Users size={15}/> 1–8 players + 3 AI Bots</span>
          <span><Clock3 size={15}/> Instant action</span>
          <span><Zap size={15}/> +15 to +150 DEGEN</span>
        </div>
        <button className="primary-btn" onClick={onPlay}><Play size={17} fill="currentColor"/> Enter 3D Laser Tag Arena <ArrowUpRight size={17}/></button>
      </div>
      <div className="game-art">
        <div className="game-art-ring"/><div className="game-art-blaster">⌁</div><div className="game-art-target">◎</div>
        <span className="game-art-caption">CLICK TARGETS OR PRESS SPACE TO TAG!</span>
      </div>
    </div>

    <div className="section-heading">
      <div>
        <span className="eyebrow">INSTANT PLAY MINI-GAMES</span>
        <h2>Play right here & earn DEGEN</h2>
      </div>
    </div>

    <div className="more-games playable-games-grid">
      <button
        type="button"
        className={'playable-game-card ' + (activeGame === 'trivia' ? 'active' : '')}
        onClick={() => { soundEngine.playClick(); setActiveGame('trivia'); }}
      >
        <span className="game-card-emoji">🎯</span>
        <div className="game-card-meta">
          <span className="game-reward-tag">UP TO +200 DEGEN</span>
          <h3>Channel Trivia Blitz</h3>
          <p>Answer fast Farcaster & channel trivia questions for instant DEGEN payouts.</p>
        </div>
        <span className="game-play-pill">{activeGame === 'trivia' ? 'Playing Below ↓' : 'Play Now →'}</span>
      </button>

      <button
        type="button"
        className={'playable-game-card ' + (activeGame === 'catcher' ? 'active' : '')}
        onClick={() => { soundEngine.playClick(); setActiveGame('catcher'); }}
      >
        <span className="game-card-emoji">🎩</span>
        <div className="game-card-meta">
          <span className="game-reward-tag">UP TO +260 DEGEN</span>
          <h3>Degen Catcher</h3>
          <p>Tap falling 🎩 DEGEN hats, 🟣 Power Badges & ⚡ Warps to build your combo pot.</p>
        </div>
        <span className="game-play-pill">{activeGame === 'catcher' ? 'Playing Below ↓' : 'Play Now →'}</span>
      </button>

      <button
        type="button"
        className={'playable-game-card ' + (activeGame === 'stacker' ? 'active' : '')}
        onClick={() => { soundEngine.playClick(); setActiveGame('stacker'); }}
      >
        <span className="game-card-emoji">🏗️</span>
        <div className="game-card-meta">
          <span className="game-reward-tag">+30 DEGEN / FLOOR</span>
          <h3>Onchain Tower Stacker</h3>
          <p>Time your block drops to stack the tallest Farcaster tower and cash out DEGEN.</p>
        </div>
        <span className="game-play-pill">{activeGame === 'stacker' ? 'Playing Below ↓' : 'Play Now →'}</span>
      </button>
    </div>

    <div className="arcade-stage-card" role="region" aria-label="Active Arcade Mini-Game">
      {activeGame === 'trivia' && (
        <div className="mini-game-shell">
          <div className="mini-game-head">
            <div>
              <span className="eyebrow">GAME 2 · CHANNEL TRIVIA BLITZ</span>
              <h3>Question {Math.min(qIndex + 1, TRIVIA_QUESTIONS.length)} of {TRIVIA_QUESTIONS.length}</h3>
            </div>
            <div className="mini-game-pot">Pot: <strong>🎩 {triviaScore} DEGEN</strong></div>
          </div>
          {!triviaDone ? (
            <>
              <p className="trivia-question-text">{TRIVIA_QUESTIONS[qIndex].q}</p>
              <div className="trivia-options-grid">
                {TRIVIA_QUESTIONS[qIndex].options.map((opt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="trivia-option-btn"
                    onClick={() => answerTrivia(idx)}
                  >
                    <span>{String.fromCharCode(65 + idx)}.</span> {opt}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="mini-game-complete">
              <h4>🎉 Round Complete! You stacked {triviaScore} DEGEN!</h4>
              <p>Claim your DEGEN reward to add it to your wallet and climb the Hall of Fame.</p>
            </div>
          )}
          {triviaFeedback && <div className="mini-game-feedback">{triviaFeedback}</div>}
          <div className="mini-game-actions">
            <button
              type="button"
              className="primary-btn"
              disabled={claiming || triviaScore <= 0}
              onClick={() =>
                claimArcadeDegen('Channel Trivia Blitz', triviaScore, () => {
                  setQIndex(0);
                  setTriviaScore(0);
                  setTriviaDone(false);
                  setTriviaFeedback('');
                })
              }
            >
              {claiming ? 'Claiming…' : `Claim +${triviaScore || 0} DEGEN Reward`}
            </button>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => {
                setQIndex(0);
                setTriviaScore(0);
                setTriviaDone(false);
                setTriviaFeedback('');
              }}
            >
              Reset Round
            </button>
          </div>
        </div>
      )}

      {activeGame === 'catcher' && (
        <div className="mini-game-shell">
          <div className="mini-game-head">
            <div>
              <span className="eyebrow">GAME 3 · DEGEN CATCHER</span>
              <h3>Click the targets to catch DEGEN! ({catcherTime}s left)</h3>
            </div>
            <div className="mini-game-pot">Caught: <strong>🎩 {catcherScore} DEGEN</strong></div>
          </div>
          <div className="catcher-arena">
            {catcherTargets.map((t) => (
              <button
                key={t.id}
                type="button"
                className="catcher-target-btn"
                style={{ left: `${t.x}%`, top: `${t.y}%` }}
                onClick={() => hitCatcherTarget(t)}
              >
                <span className="catcher-emoji">{t.icon}</span>
                <small>{t.label}</small>
              </button>
            ))}
          </div>
          <div className="mini-game-actions">
            <button
              type="button"
              className="primary-btn"
              disabled={claiming || catcherScore <= 0}
              onClick={() =>
                claimArcadeDegen('Degen Catcher', catcherScore, () => {
                  setCatcherScore(0);
                  setCatcherTime(15);
                  setCatcherRunning(false);
                })
              }
            >
              {claiming ? 'Claiming…' : `Cash Out +${catcherScore} DEGEN`}
            </button>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => {
                setCatcherScore(0);
                setCatcherTime(15);
                setCatcherRunning(true);
              }}
            >
              New 15s Round
            </button>
          </div>
        </div>
      )}

      {activeGame === 'stacker' && (
        <div className="mini-game-shell">
          <div className="mini-game-head">
            <div>
              <span className="eyebrow">GAME 4 · ONCHAIN TOWER STACKER</span>
              <h3>Tower Height: {stackFloors} / 8 Floors</h3>
            </div>
            <div className="mini-game-pot">Tower Value: <strong>🎩 {stackFloors * 30} DEGEN</strong></div>
          </div>
          <p style={{margin:'0 0 10px',color:'#5c5375'}}>{stackStatus}</p>
          <div className="stacker-track">
            <div className="stacker-target-zone">TARGET ZONE</div>
            <div className="stacker-slider-block" style={{ left: `${stackSlider}%` }}>
              🟣 BLOCK
            </div>
          </div>
          <div className="stacker-tower-preview">
            {Array.from({ length: stackFloors }, (_, i) => (
              <div key={i} className="stacker-floor-bar" style={{ width: `${Math.max(36, 78 - i * 4)}%` }}>
                Floor #{i + 1} (+30 DEGEN)
              </div>
            ))}
          </div>
          <div className="mini-game-actions">
            <button type="button" className="secondary-btn" onClick={dropStackBlock}>
              ⚡ Drop Block (+30 DEGEN)
            </button>
            <button
              type="button"
              className="primary-btn"
              disabled={claiming}
              onClick={() =>
                claimArcadeDegen('Tower Stacker', stackFloors * 30, () => {
                  setStackFloors(1);
                  setStackStatus('Tower cashed out! Drop another block to start stacking.');
                })
              }
            >
              {claiming ? 'Claiming…' : `Claim +${stackFloors * 30} DEGEN`}
            </button>
          </div>
        </div>
      )}
    </div>

    <div className="leaderboard"><div className="section-heading"><div><span className="eyebrow">BRAGGING RIGHTS</span><h2>Hall of fame</h2></div><Crown size={23} color="#c69e42"/></div>
    {leaderboard.length?leaderboard.map((p,i)=><div className="leader-row" key={p.fid}><span>#{i+1}</span><AvatarBubble name={p.displayName}/><b>{p.displayName}</b><strong>{p.wins} wins</strong></div>):<div className="empty-leader">No champions yet. Play any game above to claim the first spot!</div>}
    </div>
  </div>;
}
function Profile({user,onUser,notify}) {
  const [avatar,setAvatar]=useState(user.avatar),[saving,setSaving]=useState(false);
  useEffect(()=>setAvatar(user.avatar),[user.avatar]);
  async function save(){
    try{setSaving(true);const result=await api('/me/avatar',{method:'PUT',body:JSON.stringify(avatar)});onUser({...user,avatar:result.avatar});notify('Your character has been saved!');}
    catch(e){notify(e.message);}finally{setSaving(false);}
  }
  return <div className="page-content"><div className="section-heading page-heading"><div><span className="eyebrow">EXPRESS YOURSELF</span><h2>Your character. Your rules.</h2><p>One identity, a million ways to show up.</p></div></div>
    <div className="profile-grid">
      <div className="character-preview character-preview-3d"><span className="preview-label"><Sparkles size={14}/> LIVE 3D CHARACTER</span>
        <React.Suspense fallback={<div className="diorama-fallback">Loading 3D avatar…</div>}><SimDiorama avatar={avatar} variant="avatar"/></React.Suspense>
        <div className="character-name"><b>{user.displayName}</b><span>{user.demo?'demo player':'@'+user.username}</span></div>
      </div>
      <div className="customize-card"><div className="customize-title"><Palette size={21}/><div><h3>Make it yours</h3><p>Choose your look for the channels and arcade.</p></div></div>
        <div className="customize-group"><label>YOUR COLOUR</label><div className="palette-row">{PALETTES.map(c=><button key={c.id} aria-label={c.label} title={c.label} className={'swatch '+(avatar.color===c.id?'selected':'')} style={{background:c.hex}} onClick={()=>setAvatar({...avatar,color:c.id})}>{avatar.color===c.id&&<Check size={18}/>}</button>)}</div></div>
        <div className="customize-group"><label>OUTFIT STYLE</label><div className="option-grid">{CLOTHES.map(c=><button key={c} className={avatar.outfit===c?'selected':''} onClick={()=>setAvatar({...avatar,outfit:c})}>{c}</button>)}</div></div>
        <div className="customize-group"><label>HAIR STYLE</label><div className="option-grid">{HAIR.map(h=><button key={h} className={avatar.hair===h?'selected':''} onClick={()=>setAvatar({...avatar,hair:h})}>{h}</button>)}</div></div>
        <div className="customize-group"><label>SKIN TONE</label><div className="palette-row">{SKIN.map(c=><button key={c.id} aria-label={c.label} title={c.label} className={'swatch '+((avatar.skin||'warm')===c.id?'selected':'')} style={{background:c.hex}} onClick={()=>setAvatar({...avatar,skin:c.id})}>{(avatar.skin||'warm')===c.id&&<Check size={18}/>}</button>)}</div></div>
        <div className="customize-group"><label>HAIR COLOR</label><div className="palette-row">{HAIR_COLORS.map(c=><button key={c.id} aria-label={c.label} title={c.label} className={'swatch '+((avatar.hairColor||'espresso')===c.id?'selected':'')} style={{background:c.hex}} onClick={()=>setAvatar({...avatar,hairColor:c.id})}>{(avatar.hairColor||'espresso')===c.id&&<Check size={18}/>}</button>)}</div></div>
        <div className="customize-group"><label>BUILD</label><div className="option-grid">{BUILDS.map(v=><button key={v} className={(avatar.build||'regular')===v?'selected':''} onClick={()=>setAvatar({...avatar,build:v})}>{v}</button>)}</div></div>
        <div className="customize-group"><label>ACCESSORIES</label><div className="option-grid">{ACCESSORIES.map(v=><button key={v} className={(avatar.accessory||'none')===v?'selected':''} onClick={()=>setAvatar({...avatar,accessory:v})}>{v}</button>)}</div></div>
        <button disabled={saving} className="primary-btn full" onClick={save}><Check size={17}/>{saving?'Saving…':'Save character'}</button>
        <div className="privacy-note"><Shield size={16}/> Your Farcaster profile remains your identity. This changes only your Simcaster avatar.</div>
      </div>
    </div>
  </div>;
}
const furniture=[
  {type:'sofa',emoji:'🛋️'},{type:'table',emoji:'🪵'},{type:'plant',emoji:'🪴'},{type:'lamp',emoji:'💡'},{type:'rug',emoji:'🧶'},{type:'chair',emoji:'🪑'},
  {type:'bed',emoji:'🛏️'},{type:'espresso_bar',emoji:'☕'},{type:'dj_booth',emoji:'🎧'},{type:'arcade_cabinet',emoji:'🕹️'},{type:'work_desk',emoji:'🖥️'},{type:'neon_sign',emoji:'✨'}
];
function HomeSpace({user,onUserUpdate,ownerFid=null,notify,onArcade,onBack,onOpenShop,onVisitHome}) {
  const owner=ownerFid||user.fid, isOwner=Number(owner)===Number(user.fid);
  const [home,setHome]=useState({tier:user.homeTier||'studio',items:[]}),[busy,setBusy]=useState(false);
  const owned=new Set(user.ownedFurniture||['sofa','table','plant','lamp','rug','chair']);
  const tier=home.tier||user.homeTier||'studio';
  const maxItems=tier==='penthouse'?45:tier==='loft'?28:15;
  const bound=tier==='penthouse'?7:tier==='loft'?5:3;
  const cols=bound*2+1;
  useEffect(()=>{
    setHome({tier:user.homeTier||'studio',items:[]});
    api(isOwner?'/me/home':'/homes/'+owner).then(r=>setHome(r.home)).catch(e=>notify(e.message));
  },[owner,user.homeTier]);
  async function update(next){
    if(!isOwner)return;
    try{setBusy(true);const r=await api('/me/home',{method:'PUT',body:JSON.stringify(next)});setHome(r.home);notify('Apartment updated!');}
    catch(e){notify(e.message);}finally{setBusy(false);}
  }
  function rotateLast(){
    if(!home.items.length)return;
    const last=home.items[home.items.length-1];
    const nextRot=((last.rot||0)+90)%360;
    update({items:[...home.items.slice(0,-1),{...last,rot:nextRot}]});
  }
  return <div className="home-space"><div className="home-editor">
    <div><span className="eyebrow">{isOwner?`${tier.toUpperCase()} APARTMENT (${home.items.length}/${maxItems} ITEMS)`:'VISITING A FRIEND'}</span><h3>{isOwner?'Decorate & use your space 🪴':'Welcome to your friend’s apartment 🏠'}</h3><p>{isOwner?'Click any placed 3D furniture in the room to use it and earn DEGEN!':'You can chat and use furniture here to earn DEGEN. Only the owner can redecorate.'}</p></div>
    {isOwner&&<div className="furniture-row">
      {furniture.filter(item=>owned.has(item.type)).map((item)=><button disabled={busy||home.items.length>=maxItems} key={item.type} onClick={()=>update({items:[...home.items,{type:item.type,x:(home.items.length%cols)-bound,z:(Math.floor(home.items.length/cols)%cols)-bound}]})}><span>{item.emoji}</span> {item.type.replace('_',' ')}</button>)}
      <button disabled={!home.items.length||busy} onClick={rotateLast} title="Rotate last furniture 90°"><RotateCw size={14}/> Rotate</button>
      <button disabled={!home.items.length||busy} onClick={()=>update({items:home.items.slice(0,-1)})}>↶ Undo</button>
      <button type="button" className="shop-unlock-btn" onClick={onOpenShop}><ShoppingBag size={14}/> Shop & Upgrade</button>
    </div>}
  </div><React.Suspense fallback={<div className="world-loading"><div className="spinner"/> Opening the 3D home…</div>}><WorldView user={user} onUserUpdate={onUserUpdate} kind="home" ownerFid={owner} homeItems={home.items} homeTier={tier} onBack={onBack} onArcade={onArcade} onVisitHome={onVisitHome} onGoHome={()=>{}}/></React.Suspense></div>;
}
function FriendsPage({user,notify,onWorld,onVisit}){
  const [entries,setEntries]=useState([]),[loading,setLoading]=useState(true),[tab,setTab]=useState('friends'),[busy,setBusy]=useState(false);
  const refresh=async()=>{try{const response=await api('/friends');setEntries(response.friends);}catch(e){notify(e.message);}finally{setLoading(false);}};
  useEffect(()=>{refresh();},[]);
  async function action(fid,kind){
    try{
      setBusy(true);
      if(kind==='accept')await api('/friends/accept',{method:'POST',body:JSON.stringify({fid})});
      else await api('/friends/'+fid,{method:'DELETE'});
      notify(kind==='accept'?'Friend request accepted!':'Friendship updated');
      await refresh();
    }catch(e){notify(e.message);}finally{setBusy(false);}
  }
  const options=[{key:'friends',label:'Friends'},{key:'incoming',label:'Requests'},{key:'sent',label:'Sent'}];
  const filtered=entries.filter(e=>e.status===tab);
  return <div className="page-content">
    <div className="section-heading page-heading">
      <div><span className="eyebrow">GOOD COMPANY MAKES THE WORLD</span><h2>Your people, your little universe.</h2><p>Friendships here are private Simcaster connections, separate from Farcaster follows.</p></div>
      <button className="primary-btn" onClick={onWorld}><Compass size={16}/> Explore Channels <ArrowRight size={17}/></button>
    </div>
    <div className="friends-tabs">{options.map(o=><button key={o.key} className={tab===o.key?'active':''} onClick={()=>setTab(o.key)}>{o.label}<span>{entries.filter(e=>e.status===o.key).length}</span></button>)}</div>
    <div className="friends-list">{loading?<div className="loading-state"><div className="spinner"/> Loading friends…</div>:filtered.length===0?
      <div className="empty-state">Nothing here yet. Visit the 3D Channels, click someone’s avatar, and choose Add friend.</div>:
      filtered.map(friend=><div className="friend-card" key={friend.fid}>
        <AvatarBubble name={friend.displayName} color={friend.avatar?.color||'violet'}/>
        <div className="friend-name"><strong>{friend.displayName}</strong><small>@{friend.username||('fid-'+friend.fid)}</small></div>
        <div className="friend-state">{friend.status==='friends'?'✓ Friends':friend.status==='incoming'?'Sent you a request':'Request pending'}</div>
        <div className="friend-actions">{friend.status==='friends'&&<button className="primary-btn" onClick={()=>onVisit(friend.fid)}><House size={14}/> Visit home</button>}{friend.status==='incoming'&&<button disabled={busy} className="primary-btn" onClick={()=>action(friend.fid,'accept')}>Accept</button>}
          <button disabled={busy} className="secondary-btn" onClick={()=>action(friend.fid,'remove')}>{friend.status==='friends'?'Remove':friend.status==='sent'?'Cancel':'Decline'}</button></div>
      </div>)}
    </div>
    <div className="friends-helper"><Users size={19}/><div><strong>Connections happen in the channels.</strong><p>Walk up to another avatar in any 3D channel (/farcaster, /dev, /memes, /base), click them and send a friend request.</p></div></div>
  </div>;
}
function SettingsPage({user,config,onLogout}){
  return <div className="page-content"><div className="section-heading page-heading"><div><span className="eyebrow">YOUR ACCOUNT</span><h2>A space that's yours.</h2><p>Control your Simcaster session.</p></div></div><div className="settings-card"><div><Shield size={22}/><div><h3>Signed-in identity</h3><p>{user.demo?'Temporary demo user':'Farcaster FID: '+user.fid}</p></div></div><div><Globe size={22}/><div><h3>Feed connection</h3><p>{config.liveFeed?'Live Neynar API configured':'Neynar API key not configured'}</p></div></div><div><Lock size={22}/><div><h3>Session security</h3><p>Protected HTTP-only session cookie. Sign out to revoke it.</p></div></div><button className="secondary-btn" onClick={onLogout}><LogOut size={17}/> Sign out</button></div></div>;
}
function App(){
  const [config,setConfig]=useState({demoMode:false,liveFeed:false});
  const [user,setUser]=useState(null),[loading,setLoading]=useState(true);
  const [visitingFid,setVisitingFid]=useState(null);
  const [targetChannel,setTargetChannel]=useState('farcaster');
  const [phoneOpen,setPhoneOpen]=useState(false);
  const [phoneApp,setPhoneApp]=useState('jobs');
  function openPhone(appId='jobs'){setPhoneApp(appId);setPhoneOpen(true);}
  function navigate(id){if(id==='home-space')setVisitingFid(null);setTab(id);}
  function enterChannel(ch='farcaster'){setTargetChannel(ch);setTab('world');}
  const [tab,setTab]=useState(()=>{const room=new URLSearchParams(location.search).get('join')||'';return room.startsWith('arena:')?'arena':room.startsWith('plaza:')?'world':'home';}),[toast,setToast]=useState(''),[mobileNav,setMobileNav]=useState(false);
  const [stats,setStats]=useState({players:0,rooms:0}),[leaderboard,setLeaderboard]=useState([]);
  const notify=useCallback(message=>setToast(message),[]);
  const sessionExpiredHandled=useRef(false);
  useEffect(()=>{
    const onExpired=()=>{
      if(sessionExpiredHandled.current)return;
      sessionExpiredHandled.current=true;
      setUser(null);
      setStats({players:0,rooms:0});
      setLeaderboard([]);
      setTab('home');
      notify('Your session expired. Please sign in again.');
    };
    window.addEventListener('simcaster:session-expired',onExpired);
    return()=>window.removeEventListener('simcaster:session-expired',onExpired);
  },[notify]);
  useEffect(()=>{
    Promise.all([api('/config'),api('/auth/session')]).then(([c,m])=>{setConfig(c);setUser(m?.user||null);}).catch(e=>notify(e.message)).finally(()=>setLoading(false));
  },[]);
  useEffect(()=>{
    if(!user)return;
    sessionExpiredHandled.current=false;
    let mounted=true;
    const refresh=()=>{
      if(document.hidden)return;
      api('/world/status').then(r=>{if(mounted)setStats(r);}).catch(()=>{});
      api('/leaderboard').then(r=>{if(mounted)setLeaderboard(r.players);}).catch(()=>{});
    };
    refresh();
    const timer=setInterval(refresh,30000);
    return()=>{mounted=false;clearInterval(timer);};
  },[user?.fid]);
  async function logout(){
    try{await api('/auth/logout',{method:'POST',body:'{}'});}catch(e){notify(e.message);}
    sessionExpiredHandled.current=false;
    setUser(null);setTab('home');
  }
  const authConfig=useMemo(()=>({domain:location.host,siweUri:location.origin+'/login',rpcUrl:'https://mainnet.optimism.io',relay:'https://relay.farcaster.xyz'}),[]);
  if(loading)return <div className="splash"><div className="brand-mark"><div className="mark-eye"/><div className="mark-eye"/><div className="mark-mouth"/></div><h2>simcaster.</h2><div className="spinner"/></div>;
  return <AuthKitProvider config={authConfig}>
    {!user?<Login config={config} onSignedIn={u=>setUser(u)} onToast={notify}/>:
    <div className="app-shell">
      <Sidebar tab={tab} onTab={navigate} user={user} config={config} stats={stats} onLogout={logout} openMobile={mobileNav} setOpenMobile={setMobileNav}/>
      <div className="main-shell"><Topbar user={user} tab={tab} stats={stats} openMenu={()=>setMobileNav(true)} onTab={navigate} onOpenPhone={openPhone}/>
      {user.demo&&<div className="demo-strip"><span>◈</span> DEMO MODE — your identity is local and your social feed contains sample content. <span>Not a live Farcaster account.</span></div>}
      {tab==='home'?<Dashboard user={user} config={config} stats={stats} onTab={setTab} onOpenPhone={openPhone} onEnterChannel={enterChannel}/>:
        tab==='feed'?<SocialFeed user={user} onUserUpdate={setUser} notify={notify} writeClientId={config.writeClientId}/>:
        tab==='world'?<React.Suspense fallback={<div className="world-loading"><div className="spinner"/> Opening 3D channels…</div>}><WorldView user={user} onUserUpdate={setUser} kind="plaza" initialChannel={targetChannel} onBack={()=>setTab('home')} onArcade={()=>setTab('arcade')} onVisitHome={fid=>{setVisitingFid(fid);setTab('home-space');}} onGoHome={()=>{setVisitingFid(null);setTab('home-space');}}/></React.Suspense>:
        tab==='arena'?<React.Suspense fallback={<div className="world-loading"><div className="spinner"/> Opening the 3D arena…</div>}><WorldView user={user} onUserUpdate={setUser} kind="arena" onBack={()=>setTab('arcade')} onArcade={()=>setTab('arcade')} onVisitHome={fid=>{setVisitingFid(fid);setTab('home-space');}} onGoHome={()=>{setVisitingFid(null);setTab('home-space');}}/></React.Suspense>:
        tab==='arcade'?<Arcade onPlay={()=>setTab('arena')} leaderboard={leaderboard} user={user} onUserUpdate={setUser} notify={notify} onRefreshLeaderboard={()=>api('/leaderboard').then(r=>setLeaderboard(r.players)).catch(()=>{})}/>:
        tab==='profile'?<Profile user={user} onUser={setUser} notify={notify}/>:
        tab==='friends'?<FriendsPage user={user} notify={notify} onWorld={()=>setTab('world')} onVisit={fid=>{setVisitingFid(fid);setTab('home-space');}}/>:
        tab==='home-space'?<HomeSpace user={user} onUserUpdate={setUser} ownerFid={visitingFid} notify={notify} onBack={()=>setTab(visitingFid?'friends':'home')} onArcade={()=>setTab('arcade')} onOpenShop={()=>openPhone('shop')} onVisitHome={fid=>{setVisitingFid(fid);setTab('home-space');}}/>:
        <SettingsPage user={user} config={config} onLogout={logout}/>}
      </div>
      <React.Suspense fallback={null}>
        <CastPhone open={phoneOpen} onClose={()=>setPhoneOpen(false)} user={user} onUserUpdate={setUser} notify={notify} initialApp={phoneApp} onVisitHome={fid=>{setVisitingFid(fid);setTab('home-space');}} onGoHome={()=>{setVisitingFid(null);setTab('home-space');}} onGoPlaza={()=>setTab('world')}/>
      </React.Suspense>
      <nav className="mobile-bottom-nav">{nav.slice(0,5).map(item=>{const Icon=item.icon;return <button key={item.id} className={tab===item.id?'active':''} onClick={()=>setTab(item.id)}><Icon size={21}/><small>{item.id==='home'?'Home':item.id==='feed'?'Feed':item.id==='world'?'Channels':item.id==='arcade'?'Games':'Me'}</small></button>;})}</nav>
    </div>}
    <Toast message={toast} onClose={()=>setToast('')}/>
  </AuthKitProvider>;
}
createRoot(document.getElementById('root')).render(<App/>);
