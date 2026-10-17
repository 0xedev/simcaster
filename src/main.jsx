import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthKitProvider, SignInButton } from '@farcaster/auth-kit';
import '@farcaster/auth-kit/styles.css';
import { Home, Compass, Gamepad2, Radio, UserRound, Settings, LogOut, Sparkles, ArrowUpRight, ArrowRight, Plus, MessageCircle, Heart, Repeat2, Share2, Users, CircleHelp, MapPin, House, Zap, Play, Crown, Shield, Check, Pencil, Coffee, Sofa, Flower2, Lamp, RefreshCw, ExternalLink, Lock, Wifi, Globe, ChevronRight, Star, Clock3, Search, Menu, X, Palette, WandSparkles } from 'lucide-react';
const WorldView = React.lazy(() => import('./WorldView.jsx'));
import './styles.css';

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
  {id:'world',label:'Explore world',icon:Compass},
  {id:'arcade',label:'Game arcade',icon:Gamepad2},
  {id:'profile',label:'My character',icon:UserRound}
];
const PALETTES=[{id:'violet',hex:'#9871f1',label:'Lavender'},{id:'citrus',hex:'#eec75d',label:'Sunny'},{id:'coral',hex:'#ff8e97',label:'Coral'},{id:'mint',hex:'#6cdbc4',label:'Mint'},{id:'sky',hex:'#78bcf4',label:'Sky'}];
const CLOTHES=['street','casual','sport','formal'];
const HAIR=['short','curls','buzz','long'];
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
    if(attempt.current)return;
    attempt.current=true;
    setBusy(true);
    try{
      const nonce=handlers.current.challenge?.nonce;
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
          <strong>Your next adventure starts here.</strong><p>Connect your Farcaster account to join the world.</p>
          {challenge?<SignInButton key={challenge.nonce} nonce={challenge.nonce} onSuccess={success} onError={authError}/>:<button disabled className="primary-btn">Preparing secure sign in…</button>}
          {busy&&<small>Verifying your sign-in securely…</small>}
          {config.demoMode&&<form onSubmit={demo} className="demo-login">
            <span>OR EXPLORE A PRIVATE DEMO</span>
            <div><input aria-label="Demo display name" placeholder="Your display name" value={name} onChange={e=>setName(e.target.value)} maxLength={32} required minLength={2}/><button disabled={busy} type="submit">Try demo <ArrowRight size={16}/></button></div>
            <small>Demo users are not Farcaster identities. This mode is for development only.</small>
          </form>}
        </div>
      </div>
      <div className="welcome-art" aria-label="Illustration of a playful social world">
        <div className="art-glow"/>
        <div className="art-world"><div className="art-building building-a"/><div className="art-building building-b"/><div className="art-building building-c"/><div className="art-road"/>
          <div className="art-fountain">✦</div><div className="art-person person-a">👩🏽‍🚀</div><div className="art-person person-b">🧑🏽‍🎤</div><div className="art-person person-c">👨🏻‍💻</div>
        </div>
        <div className="float-note note-one"><span className="note-dot"/> Ava is exploring the plaza</div>
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
      <div className="sidebar-promo"><div className="promo-icon">✳</div><strong>The world is better together.</strong><p>Invite a friend to hang out in the plaza.</p><button onClick={()=>{if(navigator.clipboard?.writeText)navigator.clipboard.writeText(location.origin).catch(()=>{});}}>Copy invite link <ArrowUpRight size={14}/></button></div>
      <div className="sidebar-bottom"><AvatarBubble name={user.displayName} image={user.avatarUrl} color={user.avatar?.color}/><div><b>{user.displayName}</b><span>{user.demo?'Demo account':'@'+user.username}</span></div><button onClick={onLogout} aria-label="Log out" title="Sign out"><LogOut size={17}/></button></div>
    </aside>
  </>;
}
function Topbar({user,tab,openMenu,stats,onTab}) {
  const titles={home:'Your dashboard',feed:'Social feed',world:'Explore the world',arcade:'Game arcade',profile:'My character',friends:'Friends & requests','home-space':'My apartment',settings:'Settings',arena:'Laser tag'};
  return <header className="topbar">
    <div className="topbar-title"><button className="hamburger" onClick={openMenu}><Menu size={22}/></button><div><small>SIMCASTER / {tab.toUpperCase()}</small><h2>{titles[tab]}</h2></div></div>
    <div className="topbar-actions"><span className="global-online"><span className="live-pulse"/>{stats.players??0} exploring</span><button className="top-avatar" onClick={()=>onTab('profile')} title="Your character"><AvatarBubble name={user.displayName} image={user.avatarUrl} color={user.avatar?.color}/></button></div>
  </header>;
}
function Dashboard({user,onTab,stats,config}) {
  return <div className="page-content dashboard-page">
    <div className="page-kicker"><span className="live-pulse"/> YOUR LITTLE UNIVERSE IS READY</div>
    <div className="dashboard-hero"><div className="hero-copy"><span className="hero-pill"><Sparkles size={14}/> YOUR NEW SOCIAL WORLD</span><h1>Hey, {user.displayName.split(' ')[0]} <span className="wave">👋</span><br/><span>Let's make</span> some memories.</h1><p>Somewhere between a social network and a whole new world. Your friends, your stories, your adventure.</p><button className="primary-btn" onClick={()=>onTab('world')}>Enter the world <ArrowUpRight size={18}/></button></div>
      <div className="hero-illustration"><div className="hero-orb"/><div className="hero-city"><span className="city-house city-h1">⌂</span><span className="city-house city-h2">⌂</span><span className="city-house city-h3">⌂</span><span className="city-face">🙂</span><span className="city-star">✦</span></div><span className="hero-sticker sticker-1">✨ good vibes only</span><span className="hero-sticker sticker-2">👋 hey, friend!</span></div>
    </div>
    <div className="stats-row">
      <div className="stat-card"><div className="stat-icon lavender"><Users size={21}/></div><div><strong>{stats.players??0}</strong><span>Exploring right now</span></div></div>
      <div className="stat-card"><div className="stat-icon peach"><MapPin size={21}/></div><div><strong>{stats.rooms??0}</strong><span>Active rooms</span></div></div>
      <div className="stat-card"><div className="stat-icon mint"><Gamepad2 size={21}/></div><div><strong>1</strong><span>Game to play</span></div></div>
    </div>
    <div className="section-heading"><div><span className="eyebrow">PICK YOUR ADVENTURE</span><h2>What are we doing today?</h2></div><button className="text-link" onClick={()=>onTab('world')}>Explore the world <ArrowRight size={17}/></button></div>
    <div className="adventure-grid">
      <button className="adventure-card explore-card" onClick={()=>onTab('world')}><div className="adventure-deco">✦</div><span className="adventure-illustration">🏙️</span><span className="card-tag">SOCIAL WORLD</span><h3>Meet me at the plaza</h3><p>Wander around. Say hello. Make a new friend.</p><span className="adventure-cta">Start exploring <ArrowUpRight size={17}/></span></button>
      <button className="adventure-card arcade-card" onClick={()=>onTab('arcade')}><span className="adventure-illustration">🕹️</span><span className="card-tag">GAME ON</span><h3>One more round?</h3><p>Challenge someone to a playful laser tag match.</p><span className="adventure-cta">Visit arcade <ArrowUpRight size={17}/></span></button>
      <button className="adventure-card home-card" onClick={()=>onTab('home-space')}><span className="adventure-illustration">🛋️</span><span className="card-tag">YOUR OWN SPACE</span><h3>There's no place like home</h3><p>Decorate a corner of the universe that's yours.</p><span className="adventure-cta">Visit apartment <ArrowUpRight size={17}/></span></button>
    </div>
    <div className="home-bottom"><div className="community-strip"><span className="community-symbol">❋</span><div><h3>Built around real people.</h3><p>Simcaster connects to Farcaster — one identity across your feed and your world.</p></div><button onClick={()=>onTab('feed')}>Open social feed <ArrowRight size={17}/></button></div></div>
  </div>;
}
function SocialFeed({user,notify}) {
  const [mode,setMode]=useState('following'),[casts,setCasts]=useState([]),[sample,setSample]=useState(false),[fallback,setFallback]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[cursor,setCursor]=useState(null),[query,setQuery]=useState('');
  async function load(nextMode=mode,append=false,nextCursor=null){
    setLoading(true);setError('');
    try{
      const r=await api('/feed?mode='+nextMode+(nextCursor?'&cursor='+encodeURIComponent(nextCursor):''));
      setCasts(prev=>append?[...prev,...r.casts]:r.casts);setSample(!!r.sample);setFallback(!!r.feedFallback);setCursor(r.cursor||null);
    }catch(e){setError(e.message);if(!append)setCasts([]);}
    finally{setLoading(false);}
  }
  useEffect(()=>{load(mode);},[mode]);
  function compose(){window.open('https://warpcast.com/~/compose','_blank','noopener,noreferrer');}
  function openCast(c){if(!sample&&c.hash)window.open('https://warpcast.com/~/conversations/'+c.hash,'_blank','noopener,noreferrer');else notify('This is a sample cast, not a real Farcaster post.');}
  const visible=casts.filter(c=>(c.text+' '+c.author?.display_name+' '+c.author?.username).toLowerCase().includes(query.toLowerCase()));
  return <div className="page-content feed-page"><div className="section-heading page-heading"><div><span className="eyebrow">GOOD THINGS ARE HAPPENING</span><h2>The social side of your world.</h2><p>Stay in the loop with the people who make your world.</p></div><button className="primary-btn" onClick={compose}><Pencil size={17}/> Create cast <ExternalLink size={15}/></button></div>
    {fallback&&!sample&&<div className="demo-banner"><Sparkles size={17}/><span>Discovery is temporarily unavailable. Showing your Farcaster following feed instead.</span></div>}
    {sample&&<div className="demo-banner"><Sparkles size={17}/><span><strong>Preview feed.</strong> These are fictional example posts. Add a Neynar API key to see live Farcaster casts.</span></div>}
    <div className="feed-grid"><div className="feed-main">
      <div className="composer-card"><AvatarBubble name={user.displayName} image={user.avatarUrl} color={user.avatar?.color}/><button onClick={compose}>What's happening in your world?</button><button className="compose-round" onClick={compose} aria-label="Create a cast"><Plus size={20}/></button></div>
      <div className="feed-tabs"><button className={mode==='trending'?'selected':''} onClick={()=>setMode('trending')}>For you <Sparkles size={14}/></button><button className={mode==='following'?'selected':''} onClick={()=>setMode('following')}>Following</button><div className="feed-search"><Search size={16}/><input aria-label="Filter visible casts" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Filter posts"/></div></div>
      {error&&<div className="inline-error"><p>{error}</p><button onClick={()=>load()}>Retry <RefreshCw size={15}/></button></div>}
      {loading&&!casts.length&&<div className="loading-state"><div className="spinner"/> Loading the conversation…</div>}
      {visible.map(c=><article className="cast-card" key={c.hash}><div className="cast-head"><AvatarBubble name={c.author?.display_name || c.author?.username} image={c.author?.pfp_url}/><div className="cast-author"><div><b>{c.author?.display_name || 'Farcaster user'}</b><span>· {formatTime(c.timestamp)}</span></div><small>@{c.author?.username||'unknown'}</small></div><button onClick={()=>openCast(c)} aria-label="Open cast"><ArrowUpRight size={18}/></button></div>
        <p className="cast-text">{c.text}</p>
        {c.embeds?.filter(x=>typeof x.url==='string'&&/^https:\/\//.test(x.url)).slice(0,2).map(x=><a className="cast-embed" key={x.url} href={x.url} target="_blank" rel="noreferrer"><ExternalLink size={14}/> {x.url.replace(/^https:\/\//,'').split('/')[0]}</a>)}
        <div className="cast-actions"><button onClick={()=>openCast(c)}><MessageCircle size={17}/> {c.replies?.count||0}</button><button onClick={()=>openCast(c)}><Repeat2 size={17}/> {c.reactions?.recasts_count||0}</button><button onClick={()=>openCast(c)}><Heart size={17}/> {c.reactions?.likes_count||0}</button><button onClick={()=>openCast(c)}><Share2 size={17}/> Share</button></div>
      </article>)}
      {!loading&&!error&&visible.length===0&&<div className="empty-state">No posts found for this view.</div>}
      {cursor&&<button className="secondary-btn load-more" disabled={loading} onClick={()=>load(mode,true,cursor)}>{loading?'Loading…':'Load more casts'} <ArrowRight size={16}/></button>}
    </div>
    <aside className="feed-aside"><div className="aside-card violet-aside"><span className="eyebrow">THE BEST PART?</span><h3>People, not just posts.</h3><p>Your Farcaster identity is also your identity inside Simcaster's living world.</p><span className="aside-decoration">✳</span></div><div className="aside-card"><h3>A little note 💜</h3><p>Reading casts works through Neynar when configured. Writing, reacting and replying currently open the Farcaster client until per-user signer permissions are implemented.</p></div></aside>
    </div>
  </div>;
}
function Arcade({onPlay,leaderboard}) {
  return <div className="page-content"><div className="section-heading page-heading"><div><span className="eyebrow">PRESS START. MAKE MEMORIES.</span><h2>Welcome to the arcade. 🕹️</h2><p>Friendly competition is always welcome around here.</p></div><span className="arcade-live"><span className="live-pulse"/> 1 playable game</span></div>
    <div className="featured-game"><div className="game-feature-copy"><span className="hero-pill">✦ FEATURED MULTIPLAYER GAME</span><h2>LASER<br/><em>TAG.</em></h2><p>Run, aim, and tag your way to the top. First to 7 points wins. Bring a friend — or find a challenger online.</p><div className="game-details"><span><Users size={15}/> 2–8 players</span><span><Clock3 size={15}/> 3 min rounds</span><span><Zap size={15}/> Real-time action</span></div><button className="primary-btn" onClick={onPlay}><Play size={17} fill="currentColor"/> Play now <ArrowUpRight size={17}/></button></div><div className="game-art"><div className="game-art-ring"/><div className="game-art-blaster">⌁</div><div className="game-art-target">◎</div><span className="game-art-caption">READY, AIM, PLAY!</span></div></div>
    <div className="section-heading"><div><span className="eyebrow">WHAT'S NEXT</span><h2>More ways to play.</h2></div></div>
    <div className="more-games"><div className="soon-card"><span>🏎️</span><h3>Street Sprint</h3><p>Race around the city</p><small>COMING SOON</small></div><div className="soon-card"><span>🎯</span><h3>Trivia Night</h3><p>Show off what you know</p><small>COMING SOON</small></div><div className="soon-card"><span>🎲</span><h3>Party Games</h3><p>Make game night a thing</p><small>COMING SOON</small></div></div>
    <div className="leaderboard"><div className="section-heading"><div><span className="eyebrow">BRAGGING RIGHTS</span><h2>Hall of fame</h2></div><Crown size={23} color="#c69e42"/></div>
    {leaderboard.length?leaderboard.map((p,i)=><div className="leader-row" key={p.fid}><span>#{i+1}</span><AvatarBubble name={p.displayName}/><b>{p.displayName}</b><strong>{p.wins} wins</strong></div>):<div className="empty-leader">No champions yet. Play a match to claim the first spot.</div>}
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
      <div className="character-preview"><span className="preview-label"><Sparkles size={14}/> THE REAL YOU, IN 3D(ISH)</span><div className="character-halo"/>
        <div className="character-body"><div className="character-hair" style={{background:avatar.hair==='buzz'?'#4b3550':'#382e48'}}/><div className="character-face"><span>• &nbsp; •</span><small>⌣</small></div><div className="character-shirt" style={{background:PALETTES.find(p=>p.id===avatar.color)?.hex}}/><div className="character-pants"/><div className="character-shoes"/></div>
        <div className="character-name"><b>{user.displayName}</b><span>{user.demo?'demo player':'@'+user.username}</span></div>
      </div>
      <div className="customize-card"><div className="customize-title"><Palette size={21}/><div><h3>Make it yours</h3><p>Choose your look for the plaza and arcade.</p></div></div>
        <div className="customize-group"><label>YOUR COLOUR</label><div className="palette-row">{PALETTES.map(c=><button key={c.id} aria-label={c.label} title={c.label} className={'swatch '+(avatar.color===c.id?'selected':'')} style={{background:c.hex}} onClick={()=>setAvatar({...avatar,color:c.id})}>{avatar.color===c.id&&<Check size={18}/>}</button>)}</div></div>
        <div className="customize-group"><label>OUTFIT STYLE</label><div className="option-grid">{CLOTHES.map(c=><button key={c} className={avatar.outfit===c?'selected':''} onClick={()=>setAvatar({...avatar,outfit:c})}>{c}</button>)}</div></div>
        <div className="customize-group"><label>HAIR STYLE</label><div className="option-grid">{HAIR.map(h=><button key={h} className={avatar.hair===h?'selected':''} onClick={()=>setAvatar({...avatar,hair:h})}>{h}</button>)}</div></div>
        <button disabled={saving} className="primary-btn full" onClick={save}><Check size={17}/>{saving?'Saving…':'Save character'}</button>
        <div className="privacy-note"><Shield size={16}/> Your Farcaster profile remains your identity. This changes only your Simcaster avatar.</div>
      </div>
    </div>
  </div>;
}
const furniture=[{type:'sofa',emoji:'🛋️'},{type:'table',emoji:'🪵'},{type:'plant',emoji:'🪴'},{type:'lamp',emoji:'💡'},{type:'rug',emoji:'🧶'},{type:'chair',emoji:'🪑'}];
function HomeSpace({user,ownerFid=null,notify,onArcade,onBack}) {
  const owner=ownerFid||user.fid, isOwner=Number(owner)===Number(user.fid);
  const [home,setHome]=useState({items:[]}),[busy,setBusy]=useState(false);
  useEffect(()=>{
    setHome({items:[]});
    api(isOwner?'/me/home':'/homes/'+owner).then(r=>setHome(r.home)).catch(e=>notify(e.message));
  },[owner]);
  async function update(next){
    if(!isOwner)return;
    try{setBusy(true);const r=await api('/me/home',{method:'PUT',body:JSON.stringify(next)});setHome(r.home);notify('Apartment updated!');}
    catch(e){notify(e.message);}finally{setBusy(false);}
  }
  return <div className="home-space"><div className="home-editor">
    <div><span className="eyebrow">{isOwner?'YOUR OWN LITTLE CORNER':'VISITING A FRIEND'}</span><h3>{isOwner?'Decorate your space 🪴':'Welcome to your friend’s apartment 🏠'}</h3><p>{isOwner?'Add up to 15 pieces of furniture. Placement is automatic for now.':'You can chat and interact here. Only the owner can move furniture.'}</p></div>
    {isOwner&&<div className="furniture-row">{furniture.map((item,i)=><button disabled={busy||home.items.length>=15} key={item.type} onClick={()=>update({items:[...home.items,{type:item.type,x:(home.items.length%5)-2,z:Math.floor(home.items.length/5)-2}]})}><span>{item.emoji}</span> {item.type}</button>)}<button disabled={!home.items.length||busy} onClick={()=>update({items:home.items.slice(0,-1)})}>↶ Undo</button></div>}
  </div><React.Suspense fallback={<div className="world-loading"><div className="spinner"/> Opening the 3D home…</div>}><WorldView user={user} kind="home" ownerFid={owner} homeItems={home.items} onBack={onBack} onArcade={onArcade}/></React.Suspense></div>;
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
      <button className="primary-btn" onClick={onWorld}><Compass size={16}/> Meet players <ArrowRight size={17}/></button>
    </div>
    <div className="friends-tabs">{options.map(o=><button key={o.key} className={tab===o.key?'active':''} onClick={()=>setTab(o.key)}>{o.label}<span>{entries.filter(e=>e.status===o.key).length}</span></button>)}</div>
    <div className="friends-list">{loading?<div className="loading-state"><div className="spinner"/> Loading friends…</div>:filtered.length===0?
      <div className="empty-state">Nothing here yet. Visit the Plaza, click someone’s avatar, and choose Add friend.</div>:
      filtered.map(friend=><div className="friend-card" key={friend.fid}>
        <AvatarBubble name={friend.displayName} color={friend.avatar?.color||'violet'}/>
        <div className="friend-name"><strong>{friend.displayName}</strong><small>@{friend.username||('fid-'+friend.fid)}</small></div>
        <div className="friend-state">{friend.status==='friends'?'✓ Friends':friend.status==='incoming'?'Sent you a request':'Request pending'}</div>
        <div className="friend-actions">{friend.status==='friends'&&<button className="primary-btn" onClick={()=>onVisit(friend.fid)}><House size={14}/> Visit home</button>}{friend.status==='incoming'&&<button disabled={busy} className="primary-btn" onClick={()=>action(friend.fid,'accept')}>Accept</button>}
          <button disabled={busy} className="secondary-btn" onClick={()=>action(friend.fid,'remove')}>{friend.status==='friends'?'Remove':friend.status==='sent'?'Cancel':'Decline'}</button></div>
      </div>)}
    </div>
    <div className="friends-helper"><Users size={19}/><div><strong>Connections happen in the world.</strong><p>Walk up to another avatar in the Plaza, click them and send a friend request. The other player can accept it here.</p></div></div>
  </div>;
}
function SettingsPage({user,config,onLogout}){
  return <div className="page-content"><div className="section-heading page-heading"><div><span className="eyebrow">YOUR ACCOUNT</span><h2>A space that's yours.</h2><p>Control your Simcaster session.</p></div></div><div className="settings-card"><div><Shield size={22}/><div><h3>Signed-in identity</h3><p>{user.demo?'Temporary demo user':'Farcaster FID: '+user.fid}</p></div></div><div><Globe size={22}/><div><h3>Feed connection</h3><p>{config.liveFeed?'Live Neynar API configured':'Neynar API key not configured'}</p></div></div><div><Lock size={22}/><div><h3>Session security</h3><p>Protected HTTP-only session cookie. Sign out to revoke it.</p></div></div><button className="secondary-btn" onClick={onLogout}><LogOut size={17}/> Sign out</button></div></div>;
}
function App(){
  const [config,setConfig]=useState({demoMode:false,liveFeed:false});
  const [user,setUser]=useState(null),[loading,setLoading]=useState(true);
  const [visitingFid,setVisitingFid]=useState(null);
  function navigate(id){if(id==='home-space')setVisitingFid(null);setTab(id);}
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
      <div className="main-shell"><Topbar user={user} tab={tab} stats={stats} openMenu={()=>setMobileNav(true)} onTab={navigate}/>
      {user.demo&&<div className="demo-strip"><span>◈</span> DEMO MODE — your identity is local and your social feed contains sample content. <span>Not a live Farcaster account.</span></div>}
      {tab==='home'?<Dashboard user={user} config={config} stats={stats} onTab={setTab}/>:
        tab==='feed'?<SocialFeed user={user} notify={notify}/>:
        tab==='world'?<React.Suspense fallback={<div className="world-loading"><div className="spinner"/> Opening the 3D plaza…</div>}><WorldView user={user} kind="plaza" onBack={()=>setTab('home')} onArcade={()=>setTab('arcade')}/></React.Suspense>:
        tab==='arena'?<React.Suspense fallback={<div className="world-loading"><div className="spinner"/> Opening the 3D arena…</div>}><WorldView user={user} kind="arena" onBack={()=>setTab('arcade')} onArcade={()=>setTab('arcade')}/></React.Suspense>:
        tab==='arcade'?<Arcade onPlay={()=>setTab('arena')} leaderboard={leaderboard}/>:
        tab==='profile'?<Profile user={user} onUser={setUser} notify={notify}/>:
        tab==='friends'?<FriendsPage user={user} notify={notify} onWorld={()=>setTab('world')} onVisit={fid=>{setVisitingFid(fid);setTab('home-space');}}/>:
        tab==='home-space'?<HomeSpace user={user} ownerFid={visitingFid} notify={notify} onBack={()=>setTab(visitingFid?'friends':'home')} onArcade={()=>setTab('arcade')}/>:
        <SettingsPage user={user} config={config} onLogout={logout}/>}
      </div>
      <nav className="mobile-bottom-nav">{nav.slice(0,5).map(item=>{const Icon=item.icon;return <button key={item.id} className={tab===item.id?'active':''} onClick={()=>setTab(item.id)}><Icon size={21}/><small>{item.id==='home'?'Home':item.id==='feed'?'Feed':item.id==='world'?'World':item.id==='arcade'?'Games':'Me'}</small></button>;})}</nav>
    </div>}
    <Toast message={toast} onClose={()=>setToast('')}/>
  </AuthKitProvider>;
}
createRoot(document.getElementById('root')).render(<App/>);
