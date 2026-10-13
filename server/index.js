import 'node:process';
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppClient, viemConnector } from '@farcaster/auth-client';
import { Store } from './storage.js';
import { attachWorld } from './world.js';

const dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(dirname,'..');
const PORT=Number(process.env.PORT || 3001);
const APP_ORIGIN=process.env.APP_ORIGIN || 'http://localhost:5173';
const DOMAIN=new URL(APP_ORIGIN).host;
const DEMO=process.env.SIMCASTER_DEMO_MODE === 'true';
const STORE_FILE=path.resolve(root,process.env.DATA_FILE || '.data/simcaster.json');
if (process.env.NODE_ENV === 'production' && DEMO) {
  throw new Error('Refusing to start with SIMCASTER_DEMO_MODE=true in production');
}
const store=new Store(STORE_FILE);
const challenges=new Map();
const signerClient=createAppClient({
  relay:'https://relay.farcaster.xyz',
  ethereum:viemConnector(process.env.OPTIMISM_RPC_URL || 'https://mainnet.optimism.io')
});
const app=express();
app.disable('x-powered-by');
app.use(express.json({limit:'24kb'}));
app.use((req,res,next)=>{
  res.set('X-Content-Type-Options','nosniff');
  res.set('Referrer-Policy','strict-origin-when-cross-origin');
  res.set('X-Frame-Options','DENY');
  if (req.path.startsWith('/api/')) res.set('Cache-Control','no-store');
  if (['POST','PATCH','PUT','DELETE'].includes(req.method)) {
    if (req.headers.origin !== APP_ORIGIN) return res.status(403).json({error:'Invalid request origin'});
    if (!req.is('application/json')) return res.status(415).json({error:'JSON required'});
  }
  next();
});
const cookie=(req)=> {
  const str=req.headers.cookie || '';
  const raw=str.split(';').map(v=>v.trim()).find(v=>v.startsWith('simcaster_session='));
  return raw ? raw.slice('simcaster_session='.length) : null;
};
const authFromReq=req=>store.verifySession(cookie(req));
const requireAuth=(req,res,next)=>{
  const user=authFromReq(req);
  if (!user) return res.status(401).json({error:'Sign in to continue'});
  req.user=user;
  next();
};
function setSession(res,token) {
  const secure=new URL(APP_ORIGIN).protocol==='https:';
  res.cookie('simcaster_session',token,{httpOnly:true,secure,sameSite:'lax',path:'/',maxAge:7*864e5});
}
function fail(res,error,status=400) { return res.status(status).json({error}); }
async function neynar(path,params) {
  if (!process.env.NEYNAR_API_KEY) throw new Error('NEYNAR_API_KEY not configured');
  const url=new URL('https://api.neynar.com/v2/farcaster/'+path);
  for (const [key,value] of Object.entries(params)) if(value!==null&&value!==undefined&&value!=='') url.searchParams.set(key,String(value));
  const response=await fetch(url,{headers:{'x-api-key':process.env.NEYNAR_API_KEY,accept:'application/json'},
    signal:AbortSignal.timeout(8000)});
  if (!response.ok) throw new Error('Farcaster provider returned '+response.status);
  return response.json();
}
function sampleFeed() {
  return [
    {hash:'demo-1',author:{fid:1,display_name:'Maya Chen',username:'maya.world',pfp_url:''},
      text:'Built my first little place in Simcaster today 🪴 Come say hi in the plaza!',timestamp:new Date(Date.now()-23*60000).toISOString(),reactions:{likes_count:42,recasts_count:6},replies:{count:9}},
    {hash:'demo-2',author:{fid:2,display_name:'Theo Rivers',username:'theor',pfp_url:''},
      text:'The arcade is officially open. Who’s up for a laser tag match? 🕹️',timestamp:new Date(Date.now()-2*3600000).toISOString(),reactions:{likes_count:28,recasts_count:4},replies:{count:12}},
    {hash:'demo-3',author:{fid:3,display_name:'Ari Okafor',username:'ari',pfp_url:''},
      text:'Less scrolling, more hanging out. That’s the internet I want to see. ✨',timestamp:new Date(Date.now()-5*3600000).toISOString(),reactions:{likes_count:67,recasts_count:15},replies:{count:18}}
  ];
}
app.get('/api/health',(_,res)=>res.json({ok:true,service:'simcaster'}));
app.get('/api/config',(_,res)=>res.json({demoMode:DEMO,liveFeed:!!process.env.NEYNAR_API_KEY,origin:APP_ORIGIN}));
app.get('/api/auth/challenge',(_,res)=>{
  const nonce=crypto.randomBytes(16).toString('hex');
  challenges.set(nonce,Date.now()+5*60000);
  if(challenges.size>2000) for(const [key,time] of challenges) if(time<Date.now()) challenges.delete(key);
  res.json({nonce,expiresIn:300});
});
app.post('/api/auth/verify',async(req,res)=>{
  const {nonce,message,signature}=req.body || {};
  if (typeof nonce!=='string' || typeof message!=='string' || typeof signature!=='string' ||
      signature.length>1500 || message.length>4000) return fail(res,'Invalid SIWF payload');
  const expiry=challenges.get(nonce);
  challenges.delete(nonce);
  if (!expiry || expiry<Date.now()) return fail(res,'Challenge expired or already used',401);
  try {
    const verified=await signerClient.verifySignInMessage({nonce,domain:DOMAIN,message,signature});
    if (!verified.success || !Number.isSafeInteger(verified.fid) || verified.fid<1) return fail(res,'Signature verification failed',401);
    const fid=verified.fid;
    let profile={};
    try {
      const remote=await neynar('user/bulk',{fids:fid});
      const u=remote.users?.[0];
      if (u && u.fid===fid) profile={username:u.username,displayName:u.display_name,avatarUrl:u.pfp_url};
    } catch {}
    const user=store.userFor(fid,profile);
    setSession(res,store.startSession(fid));
    return res.json({user});
  } catch { return fail(res,'Unable to verify Farcaster signature',401); }
});
app.post('/api/auth/demo',(req,res)=>{
  if(!DEMO) return fail(res,'Demo authentication disabled',403);
  const name=typeof req.body?.name==='string'?req.body.name.trim().replace(/[<>]/g,'').slice(0,32):'';
  if (!name || name.length<2) return fail(res,'Enter a display name (2+ characters)');
  const fid=900000000+crypto.randomInt(10000000);
  const user=store.userFor(fid,{username:'demo-'+fid,displayName:name});
  user.demo=true; store.save();
  setSession(res,store.startSession(fid));
  return res.json({user});
});
app.get('/api/me',requireAuth,(req,res)=>res.json({user:req.user}));
app.post('/api/auth/logout',requireAuth,(req,res)=>{
  store.revokeSession(cookie(req));
  res.clearCookie('simcaster_session',{path:'/'});
  res.json({ok:true});
});
app.put('/api/me/avatar',requireAuth,(req,res)=>{
  try { res.json({avatar:store.updateAvatar(req.user.fid,req.body)}); }
  catch(e){fail(res,e.message);}
});
app.get('/api/me/home',requireAuth,(req,res)=>res.json({home:store.homeFor(req.user.fid)}));
app.put('/api/me/home',requireAuth,(req,res)=>{
  try {res.json({home:store.updateHome(req.user.fid,req.body)});}
  catch(e){fail(res,e.message);}
});
app.post('/api/blocks',requireAuth,(req,res)=>{
  const fid=Number(req.body?.fid);
  if(!Number.isSafeInteger(fid)||fid<1) return fail(res,'Invalid fid');
  try {store.block(req.user.fid,fid);res.json({ok:true});}
  catch(e){fail(res,e.message);}
});
app.get('/api/feed',requireAuth,async(req,res)=>{
  const mode=req.query.mode==='following'?'following':'trending';
  if(!process.env.NEYNAR_API_KEY) {
    return DEMO?res.json({casts:sampleFeed(),sample:true,cursor:null}):fail(res,'Live Farcaster feed requires NEYNAR_API_KEY',503);
  }
  try{
    const params=mode==='following'
      ? {feed_type:'following',fid:req.user.fid,limit:20}
      : {feed_type:'filter',filter_type:'global_trending',limit:20};
    if(typeof req.query.cursor==='string') params.cursor=req.query.cursor.slice(0,500);
    const data=await neynar('feed',params);
    res.json({casts:data.casts || [],cursor:data.next?.cursor || null,sample:false});
  }catch(e){fail(res,e.message,502);}
});
app.get('/api/leaderboard',requireAuth,(_,res)=>res.json({players:store.leaderboard()}));
app.post('/api/casts',requireAuth,(_,res)=>fail(res,'In-app publishing needs a per-user approved signer. Open the Farcaster composer instead.',501));
const dist=path.resolve(root,'dist');
if(fs.existsSync(dist)) {
  app.use(express.static(dist,{maxAge:'1h'}));
  app.get('*',(req,res)=>res.sendFile(path.join(dist,'index.html')));
}
const server=app.listen(PORT,()=>console.log('Simcaster API listening on '+PORT+'; demo='+DEMO));
const world=attachWorld(server,store,authFromReq,APP_ORIGIN);
app.get('/api/world/status',requireAuth,(_,res)=>res.json(world.stats()));
process.on('SIGTERM',()=>{world.close();server.close();});
