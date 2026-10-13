import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'node:crypto';
import { WORLD_SIZE, ARENA_SIZE, SHOT_COOLDOWN_MS, cleanChat, clamp, movement, canHit, publicPlayer, sanitizeRoom, collidesWithPlaza } from './rules.js';

export function attachWorld(server, store, sessionFromRequest, allowedOrigin) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  const instances = new Map();
  let nextInstance = 1;
  const findRoom = (type, fid, requested) => {
    if (type !== 'home' && typeof requested === 'string') {
      const existing = instances.get(requested);
      if (existing && existing.type === type &&
          existing.players.size < (type === 'arena' ? 8 : 24) && !existing.locked) return existing;
    }
    const key = type === 'home' ? 'home:' + fid : type;
    if (type === 'home') return instances.get(key) || createRoom(key,type);
    for (const room of instances.values()) {
      if (room.type === type && room.players.size < (type === 'arena' ? 8 : 24) && !room.locked) return room;
    }
    return createRoom(key + ':' + nextInstance++,type);
  };
  function createRoom(key,type) {
    const room = { key,type,players:new Map(),locked:false,created:Date.now(),started:null };
    instances.set(key,room);
    return room;
  }
  function send(ws, event, data) {
    if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 128000) ws.send(JSON.stringify({event,data}));
  }
  function broadcast(room,event,data) { for (const p of room.players.values()) send(p.ws,event,data); }
  server.on('upgrade', (req,socket,head) => {
    const origin = req.headers.origin;
    let url;
    try { url = new URL(req.url,'http://localhost'); } catch { socket.destroy(); return; }
    if (url.pathname !== '/socket') return socket.destroy();
    if (origin !== allowedOrigin) return socket.destroy();
    const user = sessionFromRequest(req);
    if (!user) return socket.destroy();
    wss.handleUpgrade(req,socket,head,ws => {
      wss.emit('connection',ws,req,user,sanitizeRoom(url.searchParams.get('room')),url.searchParams.get('instance'));
    });
  });
  wss.on('connection', (ws,req,user,type,requested) => {
    const room = findRoom(type,user.fid,requested);
    if ([...room.players.values()].some(p => p.fid === user.fid)) {
      send(ws,'error',{message:'Already connected to this room in another tab'});
      ws.close(1008,'Duplicate session'); return;
    }
    const id = crypto.randomUUID();
    const spawn = room.type === 'arena' ? ARENA_SIZE - 2 : 4;
    const p = { id,fid:user.fid,name:user.displayName,avatar:user.avatar,
      x:type==='plaza'?3+Math.random()*2:(Math.random()-.5)*spawn,z:type==='plaza'?3+Math.random()*2:(Math.random()-.5)*spawn,
      heading:0,hp:3,score:0,ws,input:{dx:0,dz:0},lastInput:0,lastShot:0,lastChat:0,lastMove:Date.now(),downUntil:0 };
    room.players.set(id,p);
    send(ws,'welcome',{id,room:room.key,type:room.type,serverTime:Date.now()});
    broadcast(room,'notice',{text:user.displayName.slice(0,32)+' joined the '+(type==='arena'?'arena':'world')});
    let messageWindow=Date.now(),messageCount=0;
    ws.on('message',raw => {
      if(Date.now()-messageWindow>=1000){messageWindow=Date.now();messageCount=0;}
      if(++messageCount>35){ws.close(1008,'Too many messages');return;}
      let packet;
      try { packet=JSON.parse(raw.toString()); } catch { return; }
      if (!packet || typeof packet.event !== 'string') return;
      const now=Date.now();
      if (packet.event === 'move') {
        if (now-p.lastInput<30) return;
        p.lastInput=now;
        const value=packet.data || {};
        if (Number.isFinite(value.dx) && Number.isFinite(value.dz)) {
          p.input={ dx:clamp(value.dx,-1,1), dz:clamp(value.dz,-1,1) };
          if (Math.hypot(p.input.dx,p.input.dz) > 0.01) p.heading=Math.atan2(p.input.dx,p.input.dz);
        }
      } else if (packet.event === 'chat') {
        if (now-p.lastChat < 1500) return;
        const text=cleanChat(packet.data?.text);
        if (!text) return;
        p.lastChat=now;
        for (const target of room.players.values()) {
          if (!store.isBlocked(p.fid,target.fid)) send(target.ws,'chat',{id:p.id,fid:p.fid,name:p.name,text,time:now});
        }
      } else if (packet.event === 'emote') {
        if (['wave','dance','heart'].includes(packet.data?.name)) broadcast(room,'emote',{id:p.id,name:packet.data.name});
      } else if (packet.event === 'shoot' && type === 'arena') {
        if (now-p.lastShot < SHOT_COOLDOWN_MS || p.hp <= 0) return;
        const targets=[...room.players.values()].filter(target => canHit(p,target,now));
        p.lastShot=now; // cooldown consumed even on miss
        targets.sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z));
        const hit=targets[0];
        if (hit) {
          hit.hp -= 1;
          if (hit.hp <= 0) {
            hit.downUntil=now+2800;
            p.score += 1;
          }
        }
        broadcast(room,'shot',{id:p.id,target:hit?.id || null,hit:!!hit});
      }
    });
    ws.on('close',()=> {
      room.players.delete(id);
      broadcast(room,'notice',{text:user.displayName.slice(0,32)+' left'});
      if (!room.players.size) instances.delete(room.key);
    });
    ws.on('error',()=>{});
  });
  const ticker=setInterval(() => {
    const now=Date.now();
    for (const room of instances.values()) {
      for (const p of room.players.values()) {
        const dt=clamp((now-p.lastMove)/1000,0,0.15);
        p.lastMove=now;
        if (p.hp <= 0 && now>=p.downUntil) {
          p.hp=3;
          p.x=(Math.random()-.5)*8;
          p.z=(Math.random()-.5)*8;
        }
        if (p.hp>0) {
          const d=movement(p.input,dt);
          const size=room.type==='arena'?ARENA_SIZE:WORLD_SIZE;
          const nextX=clamp(p.x+d.dx,-size,size);
          const nextZ=clamp(p.z+d.dz,-size,size);
          if(room.type!=='plaza' || !collidesWithPlaza(nextX,p.z))p.x=nextX;
          if(room.type!=='plaza' || !collidesWithPlaza(p.x,nextZ))p.z=nextZ;
        }
      }
      if (room.type==='arena' && room.players.size>1) {
        if (!room.started) room.started=now;
        const winner=[...room.players.values()].find(p=>p.score>=7);
        if (winner || now-room.started>180000) {
          const ranked=[...room.players.values()].sort((a,b)=>b.score-a.score);
          if (!winner) winner=ranked[0];
          if (winner && winner.score > (ranked[1]?.score ?? -1)) store.recordWin(winner.fid);
          broadcast(room,'match-end',{winner:winner?.id || null, scores:ranked.map(p=>({id:p.id,name:p.name,score:p.score}))});
          room.started=now; for(const p of room.players.values()) p.score=0;
        }
      }
      broadcast(room,'snapshot',{at:now,players:[...room.players.values()].map(publicPlayer),
        secondsLeft:room.type==='arena' && room.started?Math.max(0,Math.ceil((180000-(now-room.started))/1000)):null});
    }
  },100);
  ticker.unref?.();
  return {
    close:()=>{clearInterval(ticker);wss.close();},
    stats:()=>({players:[...instances.values()].reduce((n,r)=>n+r.players.size,0),
      rooms:instances.size,arcade:[...instances.values()].filter(r=>r.type==='arena').length})
  };
}
