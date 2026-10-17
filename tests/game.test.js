import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const sleep = ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function healthy(origin) {
  for(let i=0;i<75;i++){
    try {if((await fetch(origin+'/api/health')).ok)return;}catch{}
    await sleep(120);
  }
  throw new Error('server unavailable');
}
async function socket(url,cookie,origin){
  const ws=new WebSocket(url,{headers:{cookie,origin}});
  await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
  return ws;
}
test('server-owned Laser Tag hits reduce HP and award a point after 3 hits', {timeout:25000},async()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'simcaster-arena-'));
  const port=35000+Math.floor(Math.random()*18000), origin='http://localhost:'+port;
  const child=spawn(process.execPath,['server/index.js'],{cwd:process.cwd(),stdio:'ignore',
    env:{...process.env,NODE_ENV:'test',PORT:String(port),APP_ORIGIN:origin,
      SIMCASTER_DEMO_MODE:'true',DATA_FILE:path.join(tmp,'state.json')}});
  let attackerSocket,targetSocket;
  const json=(url,body)=>fetch(origin+'/api'+url,{method:'POST',
    headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
  const state={players:[],hits:[]};
  const attackerName='Attacker',targetName='Target';
  try{
    await healthy(origin);
    const a=await json('/auth/demo',{name:attackerName});
    const b=await json('/auth/demo',{name:targetName});
    assert.equal(a.status,200);assert.equal(b.status,200);
    attackerSocket=await socket('ws://localhost:'+port+'/socket?room=arena',a.headers.get('set-cookie').split(';')[0],origin);
    targetSocket=await socket('ws://localhost:'+port+'/socket?room=arena',b.headers.get('set-cookie').split(';')[0],origin);
    attackerSocket.on('message',raw=>{
      const packet=JSON.parse(raw.toString());
      if(packet.event==='snapshot')state.players=packet.data.players;
      if(packet.event==='shot')state.hits.push(packet.data);
    });
    for(let i=0;i<100;i++){
      const shooter=state.players.find(x=>x.name===attackerName),victim=state.players.find(x=>x.name===targetName);
      if(!shooter||!victim){await sleep(95);continue;}
      const dx=victim.x-shooter.x,dz=victim.z-shooter.z,dist=Math.hypot(dx,dz);
      if(dist<3.6)break;
      attackerSocket.send(JSON.stringify({event:'move',data:{dx:dx/dist,dz:dz/dist}}));
      await sleep(90);
    }
    let shooter=state.players.find(x=>x.name===attackerName),victim=state.players.find(x=>x.name===targetName);
    assert.ok(shooter && victim,'both players joined arena');
    assert.ok(Math.hypot(shooter.x-victim.x,shooter.z-victim.z)<5,'attacker approached target');
    const dx=victim.x-shooter.x,dz=victim.z-shooter.z,dist=Math.hypot(dx,dz);
    attackerSocket.send(JSON.stringify({event:'move',data:{dx:dx/dist,dz:dz/dist}}));
    await sleep(200);
    attackerSocket.send(JSON.stringify({event:'move',data:{dx:0,dz:0}}));
    for(let i=0;i<3;i++){
      attackerSocket.send(JSON.stringify({event:'shoot'}));
      await sleep(790);
    }
    await sleep(200);
    shooter=state.players.find(x=>x.name===attackerName);
    assert.equal(state.hits.filter(x=>x.hit).length,3);
    assert.equal(shooter.score,1,'server awarded one point');
  }finally{
    attackerSocket?.close();
    targetSocket?.close();
    child.kill();
    fs.rmSync(tmp,{recursive:true,force:true});
  }
});
