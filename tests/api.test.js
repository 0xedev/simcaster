import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

async function waitFor(url, attempts=60){
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

test('demo login, avatar persistence, origin checks and 2-player realtime world', {timeout:25000},async()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'simcaster-api-'));
  const port=34000+Math.floor(Math.random()*18000);
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
    const challenge=await(await fetch(origin+'/api/auth/challenge')).json();
    assert.ok(challenge.nonce.length>=16);
    const bad=await fetch(origin+'/api/auth/demo',{method:'POST',headers:{origin:'https://attacker.example','content-type':'application/json'},body:'{"name":"Eve"}'});
    assert.equal(bad.status,403);
    const login=await post('/auth/demo',{name:'Alice'});
    assert.equal(login.status,200);
    const cookie=login.headers.get('set-cookie').split(';')[0];
    const user=await(await fetch(origin+'/api/me',{headers:{cookie}})).json();
    assert.equal(user.user.displayName,'Alice');
    const update=await fetch(origin+'/api/me/avatar',{method:'PUT',headers:{origin,cookie,'content-type':'application/json'},
      body:JSON.stringify({color:'mint',outfit:'sport',hair:'curls'})});
    assert.equal(update.status,200);
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
    assert.ok(snapshot.players.find(p=>p.name==='Alice' && p.avatar.color==='mint'));
    second.send(JSON.stringify({event:'chat',data:{text:'Hello from Bob'}}));
    const chat=await waitPacket(first,'chat',d=>d.text==='Hello from Bob');
    assert.equal(chat.name,'Bob');
    const anonymous=new WebSocket('ws://localhost:'+port+'/socket?room=plaza',{headers:{origin}});
    const closed=await new Promise(resolve=>{anonymous.on('error',()=>resolve(true));anonymous.on('close',()=>resolve(true));});
    assert.equal(closed,true);
    const logout=await post('/auth/logout',{},cookie);
    assert.equal(logout.status,200);
    const denied=await fetch(origin+'/api/me',{headers:{cookie}});
    assert.equal(denied.status,401);
  } finally {
    first?.close();second?.close();child.kill();
    fs.rmSync(tmp,{recursive:true,force:true});
  }
});
