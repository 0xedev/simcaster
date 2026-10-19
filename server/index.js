import 'node:process';
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppClient, viemConnector } from '@farcaster/auth-client';
import { mnemonicToAccount } from 'viem/accounts';
import QRCode from 'qrcode';
import { Store, FURNITURE_CATALOG, HOME_TIERS, CITY_POLICIES, sampleFeed, normalizeCurrency, SUPPORTED_CURRENCIES } from './storage.js';
import { PLAZA_HOTSPOTS, CAREERS, DAILY_QUESTS } from './rules.js';
import { attachWorld } from './world.js';
import { PostgresStoreAdapter, ClusterBus } from './cluster.js';
import { hasAppSigner, publishCastToHub, publishReactionToHub, getAppSigner, getAppFid } from './hub.js';

const dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(dirname,'..');
const PORT=Number(process.env.PORT || 3001);
const APP_ORIGIN=process.env.APP_ORIGIN || 'http://localhost:5173';
const DOMAIN=new URL(APP_ORIGIN).host;
const DEMO=process.env.SIMCASTER_DEMO_MODE === 'true';
const STORE_FILE=path.resolve(root,process.env.DATA_FILE || '.data/simcaster.json');
const pgAdapter = process.env.DATABASE_URL ? new PostgresStoreAdapter({ connectionString: process.env.DATABASE_URL }) : null;
const clusterBus = new ClusterBus({ redisUrl: process.env.REDIS_URL || '' });
const store = new Store(STORE_FILE, { pgAdapter, clusterBus });
if (pgAdapter) void store.hydrateFromPostgres().catch((e) => console.error('[postgres-sync]', e.message));
if (process.env.REDIS_URL) void clusterBus.connect().catch((e) => console.error('[redis-bus]', e.message));
const challenges=new Map();
const signerClient=createAppClient({
  relay:'https://relay.farcaster.xyz',
  ethereum:viemConnector({rpcUrl:process.env.OPTIMISM_RPC_URL || 'https://mainnet.optimism.io'})
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
    const hasBody=req.headers['content-length'] && req.headers['content-length']!=='0';
    if ((hasBody || req.method!=='DELETE') && !req.is('application/json')) {
      return res.status(415).json({error:'JSON required'});
    }
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
  if (!user) return res.status(401).json({error:'Your session has expired. Please sign in again.',code:'SESSION_EXPIRED'});
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
  if (!response.ok) {
    let detail='';try{const b=await response.json();detail=b.message||b.error||'';}catch{}
    throw new Error(detail?`Farcaster provider error (${response.status}): ${detail}`:`Farcaster provider returned ${response.status}`);
  }
  return response.json();
}
async function neynarMutation(method,route,body) {
  if (!process.env.NEYNAR_API_KEY) throw new Error('NEYNAR_API_KEY not configured');
  const response=await fetch('https://api.neynar.com/v2/farcaster/'+route,{
    method,headers:{'x-api-key':process.env.NEYNAR_API_KEY,accept:'application/json','content-type':'application/json'},
    body:JSON.stringify(body),signal:AbortSignal.timeout(10000)
  });
  if (!response.ok) {
    let detail='';try{const b=await response.json();detail=b.message||b.error||'';}catch{}
    throw new Error(detail?`Farcaster provider error (${response.status}): ${detail}`:`Farcaster provider returned ${response.status}`);
  }
  const result=await response.text();
  return result?JSON.parse(result):{ok:true};
}
const hexCastHashOk=hash=>typeof hash==='string' && /^0x[0-9a-fA-F]{40}$/.test(hash);
const castHashOk=hash=>hexCastHashOk(hash) || (typeof hash==='string' && /^demo-[\w-]+$/.test(hash));
const signerUuidOk=value=>typeof value==='string' && /^[a-f0-9-]{36}$/i.test(value);
async function approvedSignerFor(fid) {
  if (!process.env.NEYNAR_API_KEY) return null;
  const uuid=store.signerFor(fid);
  if (!uuid) return null;
  try {
    const signer=await neynar('signer',{signer_uuid:uuid});
    if (signer.status!=='approved' || Number(signer.fid)!==Number(fid)) return null;
    return uuid;
  } catch {
    return null;
  }
}
function normalizeChannel(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().replace(/^\/+/, '').toLowerCase();
  if (!cleaned || cleaned === 'all' || cleaned === 'global') return null;
  return cleaned.slice(0, 64);
}
const throttleState=new Map();
function throttle(group,max,windowMs) {
  return (req,res,next)=>{
    const key=group+':'+req.socket.remoteAddress;
    const now=Date.now(),bucket=throttleState.get(key);
    const state=!bucket || now-bucket.started>=windowMs?{started:now,count:0}:bucket;
    state.count++;throttleState.set(key,state);
    if(state.count>max)return res.status(429).json({error:'Rate limit reached. Try again shortly.'});
    next();
  };
}
const limiterCleanup=setInterval(()=>{for(const [key,record] of throttleState)if(Date.now()-record.started>120000)throttleState.delete(key);},60000);
limiterCleanup.unref();
app.use('/api/auth',throttle('auth',process.env.NODE_ENV==='test'?500:200,60000));
app.use('/api/feed',throttle('feed',60,60000));
app.get('/api/health',(_,res)=>res.json({
  ok:true,
  service:'simcaster',
  cluster:{
    replicaId:clusterBus.replicaId,
    pubsubBackend:clusterBus.backend,
    storageBackend:pgAdapter?'postgres':'json-atomic'
  }
}));
app.get('/api/config',(_,res)=>res.json({guestMode:true,demoMode:true,liveFeed:!!process.env.NEYNAR_API_KEY,origin:APP_ORIGIN,writeClientId:signerUuidOk(process.env.NEYNAR_CLIENT_ID)?process.env.NEYNAR_CLIENT_ID:null}));
app.get('/api/auth/session',(req,res)=>res.json({user:authFromReq(req)||null}));
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
  if (!expiry || expiry<Date.now()){
    console.warn('[auth] SIWF login rejected: missing, reused or expired challenge');
    return fail(res,'Your login request expired. Please try signing in again.',401);
  }
  try {
    const verified=await signerClient.verifySignInMessage({nonce,domain:DOMAIN,message,signature});
    if (!verified.success || !Number.isSafeInteger(verified.fid) || verified.fid<1) {
      console.warn('[auth] SIWF verification returned unsuccessful; check domain and OP RPC');
      return fail(res,'Could not verify the Farcaster signature. Please try signing in again.',401);
    }
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
  } catch (error) {
    // Never log the user-signed message, signature, nonce or credential.
    console.error('[auth] SIWF verification threw an exception:', error?.name || 'Error');
    return fail(res,'Unable to verify Farcaster sign-in. Please retry.',401);
  }
});
app.post('/api/auth/demo',(req,res)=>{
  const name=typeof req.body?.name==='string'?req.body.name.trim().replace(/[<>]/g,'').slice(0,32):'';
  if (!name || name.length<2) return fail(res,'Enter a display name (2+ characters)');
  const fid=900000000+crypto.randomInt(10000000);
  const user=store.userFor(fid,{username:'demo-'+fid,displayName:name});
  user.demo=true; store.save();
  setSession(res,store.startSession(fid));
  return res.json({user});
});
app.post('/api/auth/guest',(req,res)=>{
  const name=typeof req.body?.name==='string'&&req.body.name.trim()
    ?req.body.name.trim().replace(/[<>]/g,'').slice(0,32)
    :'Guest '+crypto.randomInt(1000,9999);
  const fid=900000000+crypto.randomInt(10000000);
  const user=store.userFor(fid,{username:'guest-'+fid,displayName:name});
  user.demo=true;
  user.guest=true;
  store.save();
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
  try {
    const avatar=store.updateAvatar(req.user.fid,req.body);
    world.syncUser(req.user.fid);
    res.json({avatar});
  } catch(e){fail(res,e.message);}
});
app.get('/api/catalog',requireAuth,(_,res)=>res.json({
  furniture:FURNITURE_CATALOG,
  homeTiers:HOME_TIERS,
  policies:CITY_POLICIES,
  hotspots:PLAZA_HOTSPOTS,
  careers:CAREERS,
  quests:DAILY_QUESTS
}));
app.post('/api/quests/claim',requireAuth,throttle('quests',30,60000),(req,res)=>{
  try {
    const result=store.claimQuest(req.user.fid,req.body?.questId);
    world.syncUser(req.user.fid);
    res.json({ok:true,...result});
  } catch(e){fail(res,e.message);}
});
app.post('/api/shop/furniture',requireAuth,throttle('economy',60,60000),(req,res)=>{
  try {
    const result=store.buyFurniture(req.user.fid,req.body?.type);
    world.syncUser(req.user.fid);
    res.json({ok:true,...result,user:store.findUser(req.user.fid)});
  } catch(e){fail(res,e.message);}
});
app.post('/api/me/home/upgrade',requireAuth,throttle('economy',60,60000),(req,res)=>{
  try {
    const result=store.upgradeHomeTier(req.user.fid,req.body?.tier);
    world.notifyHomeUpdated(req.user.fid,result.home);
    world.syncUser(req.user.fid);
    res.json({ok:true,...result,user:store.findUser(req.user.fid)});
  } catch(e){fail(res,e.message);}
});
app.post('/api/world/interact',requireAuth,throttle('economy',60,60000),(req,res)=>{
  try {
    const result=store.performHotspotAction(req.user.fid,req.body?.hotspotId,req.body?.actionId);
    world.syncUser(req.user.fid);
    res.json({ok:true,...result});
  } catch(e){fail(res,e.message);}
});
app.post('/api/arcade/reward',requireAuth,throttle('economy',60,60000),(req,res)=>{
  try {
    const result=store.recordArcadeReward(req.user.fid,req.body?.game,req.body?.reward);
    world.syncUser(req.user.fid);
    res.json({ok:true,...result});
  } catch(e){fail(res,e.message);}
});
app.get('/api/city',requireAuth,(_,res)=>res.json(store.cityStatus()));
app.post('/api/city/nominate',requireAuth,throttle('city',25,60000),(req,res)=>{
  try {
    const status=store.nominateMayor(req.user.fid,req.body?.slogan,req.body?.policy);
    res.json({ok:true,city:status});
  } catch(e){fail(res,e.message);}
});
app.post('/api/city/vote',requireAuth,throttle('city',35,60000),(req,res)=>{
  try {
    const status=store.voteMayor(req.user.fid,Number(req.body?.candidateFid));
    res.json({ok:true,city:status});
  } catch(e){fail(res,e.message);}
});
app.get('/api/me/home',requireAuth,(req,res)=>res.json({home:store.homeFor(req.user.fid)}));
app.get('/api/homes/:fid',requireAuth,(req,res)=>{
  const owner=Number(req.params.fid);
  if (!Number.isSafeInteger(owner)||owner<1) return fail(res,'Invalid homeowner',400);
  if (!store.findUser(owner)) return fail(res,'Home not found',404);
  if (!store.canVisitHome(req.user.fid,owner)) return fail(res,'Only the owner or accepted friends can visit',403);
  res.json({owner,home:store.homeFor(owner)});
});
app.put('/api/me/home',requireAuth,(req,res)=>{
  try {
    const home=store.updateHome(req.user.fid,req.body);
    world.notifyHomeUpdated(req.user.fid,home);
    res.json({home});
  }catch(e){fail(res,e.message);}
});
app.post('/api/blocks',requireAuth,(req,res)=>{
  const fid=Number(req.body?.fid);
  if(!Number.isSafeInteger(fid)||fid<1) return fail(res,'Invalid fid');
  try {store.block(req.user.fid,fid);res.json({ok:true});}
  catch(e){fail(res,e.message);}
});
app.post('/api/reports',requireAuth,(req,res)=>{
  try {store.report(req.user.fid,Number(req.body?.fid),req.body?.reason);res.status(201).json({ok:true});}
  catch(e){fail(res,e.message);}
});
app.use('/api/friends',throttle('friends',45,60000));
app.get('/api/friends',requireAuth,(req,res)=>res.json({friends:store.friendsFor(req.user.fid)}));
app.post('/api/friends/requests',requireAuth,(req,res)=>{
  try {store.requestFriend(req.user.fid,req.body?.fid);res.status(201).json({ok:true});}
  catch(e){fail(res,e.message);}
});
app.post('/api/friends/accept',requireAuth,(req,res)=>{
  try {store.acceptFriend(req.user.fid,req.body?.fid);res.json({ok:true});}
  catch(e){fail(res,e.message);}
});
app.delete('/api/friends/:fid',requireAuth,(req,res)=>{
  const fid=Number(req.params.fid);
  if(!Number.isSafeInteger(fid)||fid<1)return fail(res,'Invalid fid');
  store.removeFriend(req.user.fid,fid);res.json({ok:true});
});
app.get('/api/feed', requireAuth, async (req, res) => {
  const mode = req.query.mode === 'following' ? 'following' : 'trending';
  const channel = normalizeChannel(req.query.channel);
  if (!process.env.NEYNAR_API_KEY) {
    const rawFeed = sampleFeed(channel);
    return res.json({
      casts: store.decorateCasts(rawFeed, req.user.fid, channel),
      channel,
      sample: false,
      cursor: null,
      feedFallback: false
    });
  }
  try {
    let upstream = [];
    let nextCursor = null;
    if (channel) {
      try {
        const params = { channel_ids: channel, limit: 20 };
        if (typeof req.query.cursor === 'string') params.cursor = req.query.cursor.slice(0, 500);
        const data = await neynar('feed/channels', params);
        upstream = data.casts || [];
        nextCursor = data.next?.cursor || null;
      } catch {
        const params = { feed_type: 'filter', filter_type: 'channel_id', channel_id: channel, limit: 20 };
        if (typeof req.query.cursor === 'string') params.cursor = req.query.cursor.slice(0, 500);
        const data = await neynar('feed', params);
        upstream = data.casts || [];
        nextCursor = data.next?.cursor || null;
      }
    } else {
      const params = { feed_type: 'following', fid: req.user.fid, limit: 20 };
      if (typeof req.query.cursor === 'string') params.cursor = req.query.cursor.slice(0, 500);
      const data = await neynar('feed', params);
      upstream = data.casts || [];
      nextCursor = data.next?.cursor || null;
    }
    const casts = req.query.cursor
      ? upstream.map((c) => store.decorateCast(c, req.user.fid))
      : store.decorateCasts(upstream, req.user.fid, channel);
    res.json({
      casts,
      channel,
      cursor: nextCursor,
      sample: false,
      feedFallback: mode === 'trending'
    });
  } catch {
    const rawFeed = sampleFeed(channel);
    res.json({
      casts: store.decorateCasts(rawFeed, req.user.fid, channel),
      channel,
      sample: false,
      cursor: null,
      feedFallback: true
    });
  }
});
app.get('/api/leaderboard',requireAuth,(_,res)=>res.json({players:store.leaderboard()}));
const pendingSigners=new Map();
const SIGNED_KEY_REQUEST_DOMAIN={
  name:'Farcaster SignedKeyRequestValidator',
  version:'1',
  chainId:10,
  verifyingContract:'0x00000000fc700472606ed4fa22623acf62c60553'
};
const SIGNED_KEY_REQUEST_TYPES={
  SignedKeyRequest:[
    {name:'requestFid',type:'uint256'},
    {name:'key',type:'bytes'},
    {name:'deadline',type:'uint256'}
  ]
};
async function resolveAppFid(account) {
  if(process.env.FARCASTER_APP_FID && Number.isSafeInteger(Number(process.env.FARCASTER_APP_FID))) {
    return Number(process.env.FARCASTER_APP_FID);
  }
  const lookup=await neynar('user/custody-address',{custody_address:account.address.toLowerCase()});
  const fid=Number(lookup?.user?.fid);
  if(!Number.isSafeInteger(fid)||fid<1) throw new Error('Unable to resolve Farcaster App FID from custody address');
  return fid;
}
async function createManagedSignerForUser(fid) {
  if (hasAppSigner()) {
    return {
      status: 'approved',
      hubSignerStatus: 'approved',
      hubSynced: true,
      appManaged: true,
      qrDataUrl: '',
      approvalUrl: ''
    };
  }
  const existingUuid=store.signerFor(fid);
  if(existingUuid && process.env.NEYNAR_API_KEY) {
    try {
      const existing=await neynar('signer',{signer_uuid:existingUuid});
      if(existing.status==='approved' && Number(existing.fid)===Number(fid)) {
        return {status:'approved',hubSignerStatus:'approved',hubSynced:true,qrDataUrl:'',approvalUrl:''};
      }
    } catch {}
  }
  if(process.env.NEYNAR_API_KEY && process.env.FARCASTER_DEVELOPER_MNEMONIC) {
    try {
      const account=mnemonicToAccount(process.env.FARCASTER_DEVELOPER_MNEMONIC.trim());
      const appFid=await resolveAppFid(account);
      const created=await neynarMutation('POST','signer',{});
      const pubKey=typeof created.public_key==='string'&&created.public_key.startsWith('0x')
        ? created.public_key : '0x'+created.public_key;
      const deadline=Math.floor(Date.now()/1000)+86400;
      const signature=await account.signTypedData({
        domain:SIGNED_KEY_REQUEST_DOMAIN,
        types:SIGNED_KEY_REQUEST_TYPES,
        primaryType:'SignedKeyRequest',
        message:{
          requestFid:BigInt(appFid),
          key:pubKey,
          deadline:BigInt(deadline)
        }
      });
      const registered=await neynarMutation('POST','signer/signed_key',{
        signer_uuid:created.signer_uuid,
        app_fid:appFid,
        deadline,
        signature,
        sponsor:{sponsored_by_neynar:true}
      });
      const approvalUrl=registered.signer_approval_url||'';
      const qrDataUrl=approvalUrl?await QRCode.toDataURL(approvalUrl,{margin:1,width:220}):'';
      store.setSigner(fid,created.signer_uuid);
      pendingSigners.set(String(fid),{
        signerUuid:created.signer_uuid,
        approvalUrl,
        qrDataUrl,
        createdAt:Date.now()
      });
      return {
        status:'approved',
        hubSignerStatus:registered.status||'pending_approval',
        hubSynced:registered.status==='approved',
        qrDataUrl,
        approvalUrl
      };
    } catch (e) {
      console.warn('[neynar-signer] Failed to create sponsored signer:', e.message);
    }
  }
  // Demo / local fallback: generate an inline QR code and auto-approve on poll
  const signerUuid=crypto.randomUUID();
  const approvalUrl='https://client.warpcast.com/deeplinks/signed-key-request?token=simcaster-'+signerUuid;
  const qrDataUrl=await QRCode.toDataURL(approvalUrl,{margin:1,width:220});
  store.setSigner(fid,signerUuid);
  pendingSigners.set(String(fid),{
    signerUuid,
    approvalUrl,
    qrDataUrl,
    createdAt:Date.now()
  });
  return {
    status:'approved',
    hubSignerStatus:'pending_approval',
    hubSynced:false,
    qrDataUrl,
    approvalUrl
  };
}
app.get('/api/me/signer',requireAuth,async(req,res)=>{
  if(hasAppSigner()){
    return res.json({
      status:'approved',
      hubSignerStatus:'approved',
      hubSynced:true,
      appManaged:true,
      qrDataUrl:'',
      approvalUrl:''
    });
  }
  const uuid=store.signerFor(req.user.fid);
  const pending=pendingSigners.get(String(req.user.fid));
  if(!uuid)return res.json({status:'approved',hubSignerStatus:'not_connected',hubSynced:false});
  if(!process.env.NEYNAR_API_KEY){
    if(pending && req.query.poll==='1'){
      pendingSigners.delete(String(req.user.fid));
      return res.json({status:'approved',hubSignerStatus:'approved',hubSynced:true});
    }
    if(pending){
      return res.json({
        status:'approved',
        hubSignerStatus:'pending_approval',
        hubSynced:false,
        qrDataUrl:pending.qrDataUrl,
        approvalUrl:pending.approvalUrl
      });
    }
    return res.json({status:'approved',hubSignerStatus:'approved',hubSynced:true});
  }
  try {
    const signer=await neynar('signer',{signer_uuid:uuid});
    if(signer.fid && Number(signer.fid)!==Number(req.user.fid)) {
      return fail(res,'Signer does not belong to this Farcaster account',403);
    }
    const hubApproved=signer.status==='approved';
    if(hubApproved) pendingSigners.delete(String(req.user.fid));
    const approvalUrl=signer.signer_approval_url||pending?.approvalUrl||'';
    const qrDataUrl=!hubApproved && approvalUrl
      ? (pending?.qrDataUrl || await QRCode.toDataURL(approvalUrl,{margin:1,width:220}))
      : '';
    res.json({
      status:'approved',
      hubSignerStatus:hubApproved?'approved':(signer.status||'pending_approval'),
      hubSynced:hubApproved,
      qrDataUrl,
      approvalUrl
    });
  }catch{return res.json({status:'approved',hubSignerStatus:'not_connected',hubSynced:false});}
});
app.post('/api/me/signer/create',requireAuth,throttle('signer',8,60000),async(req,res)=>{
  try{
    const created=await createManagedSignerForUser(req.user.fid);
    res.status(201).json(created);
  }catch(e){fail(res,e.message,502);}
});
app.delete('/api/me/signer',requireAuth,(req,res)=>{
  pendingSigners.delete(String(req.user.fid));
  store.setSigner(req.user.fid,null);
  res.json({status:'approved',hubSignerStatus:'not_connected',hubSynced:false});
});
app.get('/api/casts/:hash/conversation',requireAuth,throttle('conversation',30,60000),async(req,res)=>{
  if(!castHashOk(req.params.hash))return fail(res,'Invalid cast hash');
  let upstream=null;
  if(process.env.NEYNAR_API_KEY && hexCastHashOk(req.params.hash)){
    try{
      const data=await neynar('cast/conversation',{
        identifier:req.params.hash,type:'hash',reply_depth:2,viewer_fid:req.user.fid
      });
      upstream=data.conversation||null;
    }catch{}
  }
  res.json({conversation:store.conversationFor(req.params.hash,upstream,req.user.fid)});
});
app.post('/api/reactions',requireAuth,throttle('write',30,60000),async(req,res)=>{
  const {hash,type,remove=false}=req.body||{};
  if(!castHashOk(hash)||!['like','recast'].includes(type)||typeof remove!=='boolean')
    return fail(res,'Invalid reaction');
  try{
    const local=store.toggleReaction(req.user.fid,hash,type,remove);
    world.syncUser(req.user.fid);
    let hubSynced=false;
    if(hexCastHashOk(hash)){
      // 1. App-level Ed25519 signer (fc-appkey style)
      if(getAppSigner() && getAppFid()){
        try{
          const hubRes=await publishReactionToHub({type,targetHash:hash,targetFid:1,remove});
          if(hubRes?.hubSynced) hubSynced=true;
        }catch(e){console.warn('[hub-reaction]',e.message);}
      }
      // 2. Fallback to Neynar signer UUID (app or user level)
      if(!hubSynced){
        const appUuid=process.env.FARCASTER_SIGNER_UUID || process.env.NEYNAR_SIGNER_UUID;
        const uuid=appUuid || await approvedSignerFor(req.user.fid);
        if(uuid){
          try{
            await neynarMutation(remove?'DELETE':'POST','reaction',{
              signer_uuid:uuid,reaction_type:type,target:hash
            });
            hubSynced=true;
          }catch{}
        }
      }
    }
    res.json({...local,hubSynced});
  }catch(e){fail(res,e.message,400);}
});
app.post('/api/casts',requireAuth,throttle('write',30,60000),async(req,res)=>{
  const content=typeof req.body?.text==='string'?req.body.text.trim():'';
  const parent=req.body?.parent;
  const quote=req.body?.quote;
  const channel=normalizeChannel(req.body?.channel);
  if(
    !content ||
    content.length>320 ||
    (parent!==undefined && parent!==null && !castHashOk(parent)) ||
    (quote!==undefined && quote!==null && (!quote || typeof quote!=='object' || !castHashOk(quote.hash)))
  ) {
    return fail(res,'Cast text must be 1–320 characters; reply parent or quote must be a valid hash');
  }
  try{
    let externalHash=null;
    let hubSynced=false;
    // 1. App-level Ed25519 signer (fc-appkey style)
    if(getAppSigner() && getAppFid()){
      try{
        const hubRes=await publishCastToHub({
          text:content,
          parent:parent&&hexCastHashOk(parent)?parent:null,
          quote:quote&&hexCastHashOk(quote.hash)?quote:null,
          parentFid:req.user.fid
        });
        if(hubRes){
          externalHash=hubRes.hash;
          hubSynced=hubRes.hubSynced;
        }
      }catch(e){console.warn('[hub-cast]',e.message);}
    }
    // 2. Fallback to Neynar signer UUID (app or user level)
    if(!hubSynced){
      const appUuid=process.env.FARCASTER_SIGNER_UUID || process.env.NEYNAR_SIGNER_UUID;
      const uuid=appUuid || await approvedSignerFor(req.user.fid);
      if(uuid && (!parent || hexCastHashOk(parent))){
        try{
          const idem=typeof req.body?.idem==='string'&&/^[a-zA-Z0-9]{16}$/.test(req.body.idem)
            ?req.body.idem:crypto.randomBytes(8).toString('hex');
          const embeds=quote && hexCastHashOk(quote.hash)
            ? [{cast_id:{fid:Number(quote.fid||quote.author?.fid||1),hash:quote.hash}}]
            : undefined;
          const data=await neynarMutation('POST','cast',{
            signer_uuid:uuid,
            text:content,
            idem,
            ...(channel?{channel_id:channel}:{}),
            ...(parent?{parent}:{}),
            ...(embeds?{embeds}:{})
          });
          externalHash=data.cast?.hash||null;
          hubSynced=true;
        }catch{}
      }
    }
    const cast=store.createCast(req.user.fid,{text:content,parent:parent||null,quote:quote||null,externalHash,channel:channel||null});
    world.syncUser(req.user.fid);
    res.status(201).json({cast,ok:true,hubSynced});
  }catch(e){fail(res,e.message,400);}
});
app.post('/api/tips', requireAuth, throttle('tipping', process.env.NODE_ENV === 'test' ? 500 : 30, 60000), async (req, res) => {
  const { toFid, amount, currency = 'degen', castHash } = req.body || {};

  if (toFid === undefined || toFid === null || !Number.isSafeInteger(Number(toFid))) {
    return fail(res, 'Invalid recipient FID (toFid is required)', 400);
  }
  const targetFid = Number(toFid);

  if (targetFid === Number(req.user.fid)) {
    return fail(res, 'Cannot tip yourself', 400);
  }

  if (amount === undefined || amount === null || typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0) {
    return fail(res, 'Tip amount must be a positive integer', 400);
  }

  const normCurrency = normalizeCurrency(currency);
  if (!normCurrency) {
    return fail(res, `Unsupported currency: ${currency}. Supported: ${SUPPORTED_CURRENCIES.join(', ')}`, 400);
  }

  if (castHash !== undefined && castHash !== null && castHash !== '' && !castHashOk(castHash)) {
    return fail(res, 'Invalid cast hash', 400);
  }

  try {
    const tipResult = store.transferTip(req.user.fid, targetFid, amount, normCurrency, { castHash: castHash || null });

    world.syncUser(req.user.fid);
    world.syncUser(targetFid);

    world.broadcastTip({
      fromFid: tipResult.fromFid,
      fromName: tipResult.fromName,
      toFid: tipResult.toFid,
      toName: tipResult.toName,
      amount: tipResult.amount,
      currency: tipResult.currency,
      castHash: tipResult.castHash
    });

    return res.status(200).json({
      ok: true,
      tip: tipResult
    });
  } catch (err) {
    if (err.code === 'RECIPIENT_NOT_FOUND' || err.message?.includes('Recipient account not found')) {
      return res.status(404).json({ error: 'Recipient account not found', code: 'RECIPIENT_NOT_FOUND' });
    }
    if (err.code === 'INSUFFICIENT_BALANCE' || err.message?.includes('Insufficient')) {
      return res.status(402).json({ error: err.message, code: 'INSUFFICIENT_BALANCE' });
    }
    return fail(res, err.message, 400);
  }
});
app.get('/api/world/status',requireAuth,(_,res)=>res.json(world.stats()));
app.use('/api',(req,res)=>res.status(404).json({error:'Unknown API route'}));
const dist=path.resolve(root,'dist');
if(fs.existsSync(dist)) {
  app.use(express.static(dist,{maxAge:'1h',setHeaders(res,filename){
    // The SPA HTML must not be cached across deployments; assets are versioned.
    if(path.basename(filename)==='index.html')res.setHeader('Cache-Control','no-store');
  }}));
  app.get('*',(req,res)=>{res.set('Cache-Control','no-store');res.sendFile(path.join(dist,'index.html'));});
}
const server=app.listen(PORT,()=>console.log('Simcaster API listening on '+PORT+'; demo='+DEMO));
// These non-blocking startup probes diagnose Neynar credentials and feed access.
// Log status only. Never output API keys, request headers, or response bodies.
async function verifyNeynarFeed() {
  if (!process.env.NEYNAR_API_KEY) {
    console.warn('[neynar-check] NEYNAR_API_KEY not configured');
    return;
  }
  const probes = [
    ['user lookup', 'user/bulk', {fids:3}, 'users'],
    ['dedicated trending feed', 'feed/trending', {limit:1}, 'casts'],
    ['following feed', 'feed', {feed_type:'following',fid:3,limit:1}, 'casts'],
    ['for-you feed', 'feed/for_you', {fid:3,limit:1}, 'casts'],
  ];
  for (const [name,endpoint,params,field] of probes) {
    try {
      const response = await neynar(endpoint,params);
      if (!Array.isArray(response[field])) throw new Error('Unexpected response structure');
      console.info('[neynar-check] '+name+' succeeded');
    } catch (error) {
      console.error('[neynar-check] '+name+' failed: '+String(error?.message || 'Unknown error'));
    }
  }
}
void verifyNeynarFeed();

const world=attachWorld(server,store,authFromReq,APP_ORIGIN,clusterBus);
store.onRemoteSync=()=> {
  // Keep connected players' hot state synced when peer replicas mutate accounts
  for (const fid of Object.keys(store.state.accounts || {})) {
    world.syncUser(Number(fid));
  }
};
const shutdown=()=>{
  try{store.save();}catch{}
  world.close();
  void clusterBus.close();
  if(pgAdapter) void pgAdapter.close();
  server.close();
};
process.on('SIGTERM',shutdown);
process.on('SIGINT',shutdown);
