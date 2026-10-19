import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

async function waitFor(url, attempts=120){
  for(let i=0;i<attempts;i++){
    try {const response=await fetch(url);if(response.ok)return;} catch {}
    await new Promise(resolve=>setTimeout(resolve,130));
  }
  throw new Error('server did not start');
}
const openSocket=(url,cookie,origin)=>new Promise((resolve,reject)=>{
  const ws=new WebSocket(url,{headers:{cookie,origin}});
  ws.once('open',()=>resolve(ws));ws.once('error',reject);
});
const waitPacket=(ws,event,match=()=>true)=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{ws.off('message',onMessage);reject(new Error('no '+event+' event'));},4000);
  function onMessage(raw){
    let packet;try{packet=JSON.parse(raw.toString());}catch{return;}
    if(packet.event===event&&match(packet.data)){clearTimeout(timer);ws.off('message',onMessage);resolve(packet.data);}
  }
  ws.on('message',onMessage);
});

test('demo login, avatar persistence, origin checks and 2-player realtime world', {timeout:35000},async()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'simcaster-api-'));
  const port=14000+Math.floor(Math.random()*8000);
  const origin='http://localhost:'+port;
  const child=spawn(process.execPath,['server/index.js'],{cwd:process.cwd(),
    env:{...process.env,PORT:String(port),APP_ORIGIN:origin,
      SIMCASTER_DEMO_MODE:'true',NODE_ENV:'test',DATA_FILE:path.join(tmp,'store.json')},
    stdio:'ignore'
  });
  let first=null,second=null;
  const post=async(route,body,cookie)=>fetch(origin+'/api'+route,{
    method:'POST',headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)
  });
  try {
    await waitFor(origin+'/api/health');
    const anonymousSession=await fetch(origin+'/api/auth/session');
    assert.equal(anonymousSession.status,200);
    assert.equal((await anonymousSession.json()).user,null);
    const challenge=await(await fetch(origin+'/api/auth/challenge')).json();
    assert.ok(challenge.nonce.length>=16);
    const bad=await fetch(origin+'/api/auth/demo',{method:'POST',headers:{origin:'https://attacker.example','content-type':'application/json'},body:'{"name":"Eve"}'});
    assert.equal(bad.status,403);
    const login=await post('/auth/demo',{name:'Alice'});
    assert.equal(login.status,200);
    const cookie=login.headers.get('set-cookie').split(';')[0];
    const user=await(await fetch(origin+'/api/me',{headers:{cookie}})).json();
    assert.equal(user.user.displayName,'Alice');
    const validSession=await fetch(origin+'/api/auth/session',{headers:{cookie}});
    assert.equal(validSession.status,200);
    assert.equal((await validSession.json()).user.fid,user.user.fid);
    const update=await fetch(origin+'/api/me/avatar',{method:'PUT',headers:{origin,cookie,'content-type':'application/json'},
      body:JSON.stringify({color:'mint',outfit:'sport',hair:'curls'})});
    assert.equal(update.status,200);
    const catalogRes=await fetch(origin+'/api/catalog',{headers:{cookie}});
    assert.equal(catalogRes.status,200);
    const catalogData=await catalogRes.json();
    assert.ok(Array.isArray(catalogData.furniture) && catalogData.furniture.length>=12);
    assert.ok(Array.isArray(catalogData.quests) && catalogData.quests.length===3);
    const interactRes=await post('/world/interact',{hotspotId:'foundry-hub'},cookie);
    assert.equal(interactRes.status,200);
    const interactData=await interactRes.json();
    assert.ok(interactData.user.creds>250);
    await post('/world/interact',{hotspotId:'power-grid'},cookie);
    const claimRes=await post('/quests/claim',{questId:'hustle_shifts'},cookie);
    assert.equal(claimRes.status,200);
    const buyRes=await post('/shop/furniture',{type:'work_desk'},cookie);
    assert.equal(buyRes.status,200);
    const cityRes=await fetch(origin+'/api/city',{headers:{cookie}});
    assert.equal(cityRes.status,200);
    // In-app Farcaster social actions: post cast, quote cast (requote), reply, like, recast
    const castRes=await post('/casts',{text:'Hello Simcaster Plaza!'},cookie);
    assert.equal(castRes.status,201);
    const createdCast=(await castRes.json()).cast;
    assert.ok(createdCast.hash.startsWith('0x'));
    const quoteRes=await post('/casts',{
      text:'Quoting my own cast right inside Simcaster!',
      quote:{hash:createdCast.hash,fid:user.user.fid,username:user.user.username,text:createdCast.text}
    },cookie);
    assert.equal(quoteRes.status,201);
    const quotedCast=(await quoteRes.json()).cast;
    assert.equal(quotedCast.quote_cast.hash,createdCast.hash);
    const replyRes=await post('/casts',{text:'First reply in-app!',parent:createdCast.hash},cookie);
    assert.equal(replyRes.status,201);
    const likeRes=await post('/reactions',{hash:createdCast.hash,type:'like',remove:false},cookie);
    assert.equal(likeRes.status,200);
    const recastRes=await post('/reactions',{hash:createdCast.hash,type:'recast',remove:false},cookie);
    assert.equal(recastRes.status,200);
    const feedRes=await(await fetch(origin+'/api/feed?mode=trending',{headers:{cookie}})).json();
    const foundRoot=feedRes.casts.find(c=>c.hash===createdCast.hash);
    assert.ok(foundRoot);
    assert.equal(foundRoot.reactions.likes_count,1);
    assert.equal(foundRoot.reactions.recasts_count,1);
    assert.equal(foundRoot.replies.count,1);
    const convoRes=await(await fetch(origin+'/api/casts/'+createdCast.hash+'/conversation',{headers:{cookie}})).json();
    assert.equal(convoRes.conversation.direct_replies.length,1);
    assert.equal(convoRes.conversation.direct_replies[0].text,'First reply in-app!');
    // Auto-provisioned inline QR managed signer flow
    const createSignerRes=await post('/me/signer/create',{},cookie);
    assert.equal(createSignerRes.status,201);
    const signerData=await createSignerRes.json();
    assert.equal(signerData.status,'approved');
    assert.ok(signerData.qrDataUrl.startsWith('data:image/png;base64,'));
    assert.ok(signerData.approvalUrl.includes('signed-key-request'));
    // Polling triggers approval
    const pollRes=await(await fetch(origin+'/api/me/signer?poll=1',{headers:{cookie}})).json();
    assert.equal(pollRes.hubSynced,true);
    // Delete resets signer
    const deleteSignerRes=await fetch(origin+'/api/me/signer',{method:'DELETE',headers:{origin,cookie}});
    assert.equal(deleteSignerRes.status,200);
    const resetRes=await(await fetch(origin+'/api/me/signer',{headers:{cookie}})).json();
    assert.equal(resetRes.hubSynced,false);
    const login2=await post('/auth/demo',{name:'Bob'});
    const cookie2=login2.headers.get('set-cookie').split(';')[0];
    const secondUser=(await login2.json()).user;
    const deniedHome=await fetch(origin+'/api/homes/'+user.user.fid,{headers:{cookie:cookie2}});
    assert.equal(deniedHome.status,403);
    const request=await post('/friends/requests',{fid:secondUser.fid},cookie);
    assert.equal(request.status,201);
    const pendingHome=await fetch(origin+'/api/homes/'+user.user.fid,{headers:{cookie:cookie2}});
    assert.equal(pendingHome.status,403);
    const acceptance=await post('/friends/accept',{fid:user.user.fid},cookie2);
    assert.equal(acceptance.status,200);
    const sharedHome=await fetch(origin+'/api/homes/'+user.user.fid,{headers:{cookie:cookie2}});
    assert.equal(sharedHome.status,200);
    assert.ok(Array.isArray((await sharedHome.json()).home.items));
    const ownerHome=await openSocket('ws://localhost:'+port+'/socket?room=home&owner='+user.user.fid,cookie,origin);
    const guestHome=await openSocket('ws://localhost:'+port+'/socket?room=home&owner='+user.user.fid,cookie2,origin);
    try{
      const broadcast=waitPacket(guestHome,'home-updated',d=>d.items?.[0]?.type==='chair');
      const decoration=await fetch(origin+'/api/me/home',{method:'PUT',
        headers:{origin,cookie,'content-type':'application/json'},
        body:JSON.stringify({items:[{type:'chair',x:1,z:1}]})});
      assert.equal(decoration.status,200);
      const updated=await broadcast;
      assert.equal(updated.items[0].x,1);
    }finally{ownerHome.close();guestHome.close();}
    first=await openSocket('ws://localhost:'+port+'/socket?room=plaza',cookie,origin);
    second=await openSocket('ws://localhost:'+port+'/socket?room=plaza',cookie2,origin);
    const snapshot=await waitPacket(first,'snapshot',d=>d.players.length===2);
    assert.equal(snapshot.players.length,2);
    assert.ok(Array.isArray(snapshot.npcs) && snapshot.npcs.length===3);
    assert.ok(snapshot.players.find(p=>p.name==='Alice' && p.avatar.color==='mint'));
    second.send(JSON.stringify({event:'chat',data:{text:'Hello from Bob'}}));
    const chat=await waitPacket(first,'chat',d=>d.text==='Hello from Bob');
    assert.equal(chat.name,'Bob');

    // --- Street Tipping & Real-Time WebSocket Broadcast Verification ---
    // 1. Self-tipping guard (400)
    const selfTipRes = await post('/tips', { toFid: user.user.fid, amount: 10, currency: 'degen' }, cookie);
    assert.equal(selfTipRes.status, 400);

    // 2. Invalid / float amounts guard (400)
    const floatTipRes = await post('/tips', { toFid: secondUser.fid, amount: 12.5, currency: 'degen' }, cookie);
    assert.equal(floatTipRes.status, 400);

    // 3. Non-existent recipient (404)
    const ghostTipRes = await post('/tips', { toFid: 888888888, amount: 10, currency: 'degen' }, cookie);
    assert.equal(ghostTipRes.status, 404);

    // 4. Insufficient balance guard (402)
    const brokeTipRes = await post('/tips', { toFid: secondUser.fid, amount: 999999, currency: 'degen' }, cookie);
    assert.equal(brokeTipRes.status, 402);

    // 5. Valid tip execution and WebSocket broadcast to peer in plaza
    const tipPromise = waitPacket(
      second,
      'tip',
      (d) => d.fromFid === user.user.fid && d.toFid === secondUser.fid && d.amount === 50
    );
    const validTipRes = await post(
      '/tips',
      { toFid: secondUser.fid, amount: 50, currency: 'degen' },
      cookie
    );
    assert.equal(validTipRes.status, 200);
    const validTipJson = await validTipRes.json();
    assert.equal(validTipJson.ok, true);
    assert.equal(validTipJson.tip.amount, 50);
    assert.equal(validTipJson.tip.currency, 'degen');
    assert.equal(validTipJson.tip.fromBalance, 950);
    assert.equal(validTipJson.tip.toBalance, 1050);
    assert.equal(validTipJson.tip.cloutAwarded, 5);
    assert.equal(validTipJson.tip.vibeAwarded, 5);

    const tipPacket = await tipPromise;
    assert.equal(tipPacket.fromFid, user.user.fid);
    assert.equal(tipPacket.toFid, secondUser.fid);
    assert.equal(tipPacket.amount, 50);

    const meAfterTip = await (await fetch(origin + '/api/me', { headers: { cookie } })).json();
    assert.equal(meAfterTip.user.currencies.degen, 950);

    const anonymous=new WebSocket('ws://localhost:'+port+'/socket?room=plaza',{headers:{origin}});
    const closed=await new Promise(resolve=>{anonymous.on('error',()=>resolve(true));anonymous.on('close',()=>resolve(true));});
    assert.equal(closed,true);
    const logout=await post('/auth/logout',{},cookie);
    assert.equal(logout.status,200);
    const denied=await fetch(origin+'/api/me',{headers:{cookie}});
    assert.equal(denied.status,401);
    const sessionAfterLogout=await fetch(origin+'/api/auth/session',{headers:{cookie}});
    assert.equal(sessionAfterLogout.status,200);
    assert.equal((await sessionAfterLogout.json()).user,null);
  } finally {
    first?.close();second?.close();child.kill();
    fs.rmSync(tmp,{recursive:true,force:true});
  }
});


