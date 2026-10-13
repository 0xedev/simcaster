import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ArrowLeft, Send, Users, Move, Crosshair, Heart, Smile, Wifi, WifiOff, Trophy, Flag, MessageCircle, Volume2, ExternalLink } from 'lucide-react';

const HEX={violet:'#8d64f7',citrus:'#eec35b',coral:'#ff898a',mint:'#5dd3ba',sky:'#73bff2'};
const BUILDINGS=[
  [-14,-13,5.8,6,5,'#aea5ed'],[-6,-14,5.2,7,4.8,'#e9a9bd'],[6,-14,5.8,5.5,4.8,'#87b8df'],
  [14,-13,5.4,7,6,'#b1cea8'],[-14,13,6,6,4.8,'#efca9f'],[-5.5,14,6,7,5,'#97c7bd'],
  [6.5,14,5,8,5,'#b7a1e5'],[15,13,5,6,4.8,'#e9abb1'],
  [-15,0,5,5,5,'#94b3dc'],[15,0,5,5,5,'#dfa5cf']
];
const TREES=[[-10,-7],[-11,7],[10,7],[10,-7],[-7,9],[7,-9],[-18,7],[18,-7],[0,17],[0,-17]];
function Tree({x,z}){
  return <group position={[x,0,z]}>
    <mesh position={[0,.9,0]} castShadow><cylinderGeometry args={[.19,.26,1.8,7]}/><meshStandardMaterial color="#97734f"/></mesh>
    <mesh position={[0,2.25,0]} castShadow><coneGeometry args={[1.35,3.1,8]}/><meshStandardMaterial color="#4a9c81" roughness={1}/></mesh>
    <mesh position={[0,3.2,0]} castShadow><coneGeometry args={[.9,2.2,8]}/><meshStandardMaterial color="#6cba97" roughness={1}/></mesh>
  </group>;
}
function Building({item,index}){
  const [x,z,w,h,d,col]=item;
  return <group position={[x,0,z]}>
    <mesh castShadow receiveShadow position={[0,h/2,0]}><boxGeometry args={[w,h,d]}/><meshStandardMaterial color={col} roughness={.83}/></mesh>
    <mesh castShadow position={[0,h+.15,0]}><boxGeometry args={[w+.35,.35,d+.35]}/><meshStandardMaterial color="#f5e8d8"/></mesh>
    <mesh position={[0,1.16,d/2+.017]}><boxGeometry args={[1.25,2.3,.04]}/><meshStandardMaterial color="#463d66"/></mesh>
    {[-1,1].map((s)=><mesh key={s} position={[s*w*.29,h*.65,d/2+.03]}><boxGeometry args={[.83,.96,.04]}/><meshStandardMaterial color="#d4f2ff" metalness={.1} roughness={.25}/></mesh>)}
    <mesh position={[0,h*.3,d/2+.05]}><boxGeometry args={[Math.min(2.3,w*.7),.36,.13]}/><meshStandardMaterial color={index%2?'#ffd28c':'#8c6be8'} emissive={index%2?'#ffd28c':'#8c6be8'} emissiveIntensity={.2}/></mesh>
    <mesh receiveShadow position={[0,.16,0]}><boxGeometry args={[w+1.5,.3,d+1.5]}/><meshStandardMaterial color="#ddd3ed"/></mesh>
  </group>;
}
function Plaza(){
  return <group>
    <mesh receiveShadow rotation={[-Math.PI/2,0,0]}><planeGeometry args={[45,45]}/><meshStandardMaterial color="#a9ccb1"/></mesh>
    <mesh receiveShadow position={[0,.025,0]}><boxGeometry args={[8,.05,46]}/><meshStandardMaterial color="#e3d4c6"/></mesh>
    <mesh receiveShadow position={[0,.03,0]}><boxGeometry args={[46,.06,8]}/><meshStandardMaterial color="#e3d4c6"/></mesh>
    <mesh receiveShadow position={[0,.08,0]}><cylinderGeometry args={[5.4,5.4,.1,32]}/><meshStandardMaterial color="#f2e5d7"/></mesh>
    <mesh receiveShadow position={[0,.17,0]}><cylinderGeometry args={[2.1,2.3,.28,32]}/><meshStandardMaterial color="#9b90d7"/></mesh>
    <mesh position={[0,.36,0]}><cylinderGeometry args={[1.76,1.76,.16,32]}/><meshStandardMaterial color="#8bd4e5" metalness={.25} roughness={.25}/></mesh>
    <mesh position={[0,1.2,0]} castShadow><cylinderGeometry args={[.17,.31,1.7,16]}/><meshStandardMaterial color="#ece2f9"/></mesh>
    <mesh position={[0,2.07,0]} castShadow><icosahedronGeometry args={[.55,1]}/><meshStandardMaterial color="#d6a4f1" metalness={.25}/></mesh>
    {BUILDINGS.map((item,i)=><Building key={i} item={item} index={i}/>)}
    {TREES.map(([x,z],i)=><Tree key={i} x={x} z={z}/>)}
    {[-1,1].map(s=><group key={s} position={[s*8.5,0,0]}>
      <mesh castShadow position={[0,.53,0]}><boxGeometry args={[1.4,.15,.55]}/><meshStandardMaterial color="#aa78c5"/></mesh>
      <mesh position={[-.56,.25,0]}><boxGeometry args={[.14,.5,.55]}/><meshStandardMaterial color="#f0e0c7"/></mesh>
      <mesh position={[.56,.25,0]}><boxGeometry args={[.14,.5,.55]}/><meshStandardMaterial color="#f0e0c7"/></mesh>
    </group>)}
  </group>;
}
function Arena(){
  return <group>
    <mesh receiveShadow rotation={[-Math.PI/2,0,0]}><planeGeometry args={[35,35]}/><meshStandardMaterial color="#25203c"/></mesh>
    {Array.from({length:13},(_,i)=><group key={i}>
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,.013,i*2-12]}><planeGeometry args={[26,.024]}/><meshBasicMaterial color="#4c436c"/></mesh>
      <mesh rotation={[-Math.PI/2,0,0]} position={[i*2-12,.014,0]}><planeGeometry args={[.024,26]}/><meshBasicMaterial color="#4c436c"/></mesh>
    </group>)}
    {[-1,1].map(s=><group key={s}>
      <mesh position={[s*13,.65,0]}><boxGeometry args={[.2,1.3,27]}/><meshStandardMaterial color="#9b74f9" emissive="#7646d0" emissiveIntensity={.55}/></mesh>
      <mesh position={[0,.65,s*13]}><boxGeometry args={[27,1.3,.2]}/><meshStandardMaterial color="#65e2c3" emissive="#168e86" emissiveIntensity={.55}/></mesh>
    </group>)}
    <mesh position={[0,.01,0]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[2,2.07,64]}/><meshBasicMaterial color="#dd90fa" side={THREE.DoubleSide}/></mesh>
    {[-1,1].map((s)=><mesh key={s} position={[s*12,2.1,s*12]}><octahedronGeometry args={[.7]}/><meshStandardMaterial color="#fbd185" emissive="#9c62ff" emissiveIntensity={.8}/></mesh>)}
  </group>;
}
function Furniture({item,index}){
  return <group position={[item.x,.02,item.z]}>
    {item.type==='plant'?<Tree x={0} z={0}/>:
    item.type==='rug'?<mesh rotation={[-Math.PI/2,0,0]} position={[0,.03,0]}><planeGeometry args={[2.2,1.5]}/><meshStandardMaterial color="#b898e8"/></mesh>:
    item.type==='lamp'?<><mesh position={[0,.7,0]}><cylinderGeometry args={[.06,.14,1.4]}/><meshStandardMaterial color="#e5ba88"/></mesh><mesh position={[0,1.48,0]}><coneGeometry args={[.58,.8,8]}/><meshStandardMaterial color="#ffe2a5" emissive="#e6b873" emissiveIntensity={.3}/></mesh></>:
    <mesh castShadow position={[0,.4,0]}><boxGeometry args={[item.type==='sofa'?2:1.15,.8,item.type==='table'?1.35:.8]}/><meshStandardMaterial color={index%2?'#8e8bd4':'#de9fba'}/></mesh>}
  </group>;
}
function Home({items=[]}){
  return <group>
    <mesh receiveShadow rotation={[-Math.PI/2,0,0]}><planeGeometry args={[40,40]}/><meshStandardMaterial color="#c8c5de"/></mesh>
    <mesh receiveShadow position={[0,.04,0]}><boxGeometry args={[12,.08,12]}/><meshStandardMaterial color="#f3e5d8"/></mesh>
    <mesh position={[-6,2.1,0]}><boxGeometry args={[.25,4.2,12]}/><meshStandardMaterial color="#c4aedd"/></mesh>
    <mesh position={[0,2.1,-6]}><boxGeometry args={[12,4.2,.25]}/><meshStandardMaterial color="#c4aedd"/></mesh>
    {items.map((item,i)=><Furniture key={i} item={item} index={i}/>)}
    <mesh position={[-2,2.2,-5.82]}><boxGeometry args={[2.5,1.9,.1]}/><meshStandardMaterial color="#a6cbde"/></mesh>
    <Tree x={9} z={5}/>
  </group>;
}
function AvatarName({name,you}){
  const texture=useMemo(()=>{
    const canvas=document.createElement('canvas');
    canvas.width=384;canvas.height=96;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle=you?'rgba(88,55,145,.95)':'rgba(34,26,55,.88)';
    ctx.beginPath();ctx.roundRect(8,10,368,74,22);ctx.fill();
    ctx.fillStyle='#ffffff';ctx.font='bold 32px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText((you?'★ ':'')+name.slice(0,18),192,47,340);
    const result=new THREE.CanvasTexture(canvas);result.colorSpace=THREE.SRGBColorSpace;
    return result;
  },[name,you]);
  useEffect(()=>()=>texture.dispose(),[texture]);
  return <sprite position={[0,2.50,0]} scale={[2.5,.62,1]}>
    <spriteMaterial map={texture} transparent depthTest={false} depthWrite={false}/>
  </sprite>;
}
function Avatar({p,you,emote,onSelect}){
  const body=useRef();
  const rightArm=useRef();
  const leftArm=useRef();
  useFrame(({clock})=>{
    const time=clock.elapsedTime;
    if(body.current){
      body.current.position.y=Math.sin(time*2.4+p.x)*.035+(emote==='dance'?Math.abs(Math.sin(time*6))*.17:0);
      body.current.rotation.z=emote==='dance'?Math.sin(time*7)*.2:0;
    }
    if(rightArm.current)rightArm.current.rotation.z=emote==='wave'?-.9+Math.sin(time*13)*.35:emote==='dance'?Math.sin(time*7)*.65:-.12;
    if(leftArm.current)leftArm.current.rotation.z=emote==='dance'?-Math.sin(time*7)*.65:.12;
  });
  const color=HEX[p.avatar?.color]||HEX.violet;
  return <group position={[p.x,0,p.z]} rotation={[0,p.heading||0,0]}
    onClick={e=>{e.stopPropagation();if(!you)onSelect(p);}}>
    <AvatarName name={p.name||'Player'} you={you}/>
    <group ref={body}>
      <mesh castShadow position={[0,.68,0]}><capsuleGeometry args={[.36,.62,4,8]}/><meshStandardMaterial color={color} roughness={.75}/></mesh>
      <mesh castShadow position={[0,1.58,0]}><sphereGeometry args={[.31,14,10]}/><meshStandardMaterial color="#d9a989"/></mesh>
      <mesh castShadow position={[0,1.84,0]}><sphereGeometry args={[.33,12,8]}/><meshStandardMaterial color={p.avatar?.hair==='buzz'?'#302b40':'#453752'}/></mesh>
      <mesh position={[-.11,1.61,.28]}><sphereGeometry args={[.035,7,6]}/><meshBasicMaterial color="#33293b"/></mesh>
      <mesh position={[.11,1.61,.28]}><sphereGeometry args={[.035,7,6]}/><meshBasicMaterial color="#33293b"/></mesh>
      {[-1,1].map(s=><group key={s}>
        <mesh ref={s===1?rightArm:leftArm} castShadow position={[s*.48,.83,0]}>
          <capsuleGeometry args={[.13,.5,4,6]}/><meshStandardMaterial color={color}/>
        </mesh>
        <mesh castShadow position={[s*.18,.1,0]}><capsuleGeometry args={[.16,.22,4,6]}/><meshStandardMaterial color="#39364e"/></mesh>
      </group>)}
      {you&&<mesh position={[0,2.10,0]}><octahedronGeometry args={[.20]}/><meshStandardMaterial color="#f9d875" emissive="#f9d875" emissiveIntensity={.7}/></mesh>}
      {emote==='heart'&&<mesh position={[0,2.25,0]}><sphereGeometry args={[.20,10,10]}/><meshStandardMaterial color="#ff77ac" emissive="#ff77ac" emissiveIntensity={.65}/></mesh>}
    </group>
  </group>;
}
function CameraRig({players,selfId}){
  const canvas=useThree(s=>s.gl.domElement);
  const orbit=useRef({theta:.73,phi:.69,distance:28,dragging:false,x:0,y:0,pointerId:null});
  const goal=useMemo(()=>new THREE.Vector3(),[]);
  const lookAt=useMemo(()=>new THREE.Vector3(),[]);
  useEffect(()=>{
    const state=orbit.current;
    const onDown=e=>{
      if(e.button!==0&&e.button!==2)return;
      state.dragging=true;state.x=e.clientX;state.y=e.clientY;state.pointerId=e.pointerId;
      canvas.setPointerCapture?.(e.pointerId);
    };
    const onMove=e=>{
      if(!state.dragging||state.pointerId!==e.pointerId)return;
      const dx=e.clientX-state.x,dy=e.clientY-state.y;
      state.theta-=dx*.007;
      state.phi=THREE.MathUtils.clamp(state.phi+dy*.006,.30,1.30);
      state.x=e.clientX;state.y=e.clientY;
    };
    const onUp=e=>{
      if(e.pointerId!==state.pointerId)return;
      state.dragging=false;state.pointerId=null;
      if(canvas.hasPointerCapture?.(e.pointerId))canvas.releasePointerCapture(e.pointerId);
    };
    const onWheel=e=>{
      e.preventDefault();
      state.distance=THREE.MathUtils.clamp(state.distance+Math.sign(e.deltaY)*2.1,11,42);
    };
    const onContext=e=>e.preventDefault();
    canvas.addEventListener('pointerdown',onDown);
    canvas.addEventListener('pointermove',onMove);
    canvas.addEventListener('pointerup',onUp);
    canvas.addEventListener('pointercancel',onUp);
    canvas.addEventListener('wheel',onWheel,{passive:false});
    canvas.addEventListener('contextmenu',onContext);
    return ()=>{
      canvas.removeEventListener('pointerdown',onDown);
      canvas.removeEventListener('pointermove',onMove);
      canvas.removeEventListener('pointerup',onUp);
      canvas.removeEventListener('pointercancel',onUp);
      canvas.removeEventListener('wheel',onWheel);
      canvas.removeEventListener('contextmenu',onContext);
    };
  },[canvas]);
  useFrame(({camera})=>{
    const me=players.find(p=>p.id===selfId);
    const x=me?.x||0,z=me?.z||0;
    const o=orbit.current;
    goal.set(x+Math.sin(o.theta)*Math.cos(o.phi)*o.distance,
      1.1+Math.sin(o.phi)*o.distance,
      z+Math.cos(o.theta)*Math.cos(o.phi)*o.distance);
    lookAt.set(x,1,z);
    camera.position.lerp(goal,.09);
    camera.lookAt(lookAt);
  });
  return null;
}
function Scene({players,selfId,kind,homeItems,effects,onSelect}){
  return <>
    <color attach="background" args={[kind==='arena'?'#2b2345':'#b2b9e5']}/>
    <fog attach="fog" args={[kind==='arena'?'#2b2345':'#bac5e0',24,64]}/>
    <ambientLight intensity={kind==='arena'?1.7:1.9}/>
    <directionalLight position={[11,22,15]} intensity={2.1} castShadow shadow-mapSize={[1024,1024]} shadow-camera-left={-24} shadow-camera-right={24} shadow-camera-top={24} shadow-camera-bottom={-24}/>
    {kind==='arena'?<Arena/>:kind==='home'?<Home items={homeItems}/>:<Plaza/>}
    {players.map(p=><Avatar key={p.id} p={p} you={p.id===selfId} emote={effects[p.id]} onSelect={onSelect}/>)}
    <CameraRig players={players} selfId={selfId}/>
  </>;
}
export default function WorldView({user,kind='plaza',ownerFid=null,homeItems=[],onBack,onArcade}){
  const [players,setPlayers]=useState([]);
  const playersRef=useRef([]);
  const [selfId,setSelfId]=useState('');
  const [room,setRoom]=useState('');
  const [state,setState]=useState('Connecting to world…');
  const [messages,setMessages]=useState([]);
  const [effects,setEffects]=useState({});
  const [selected,setSelected]=useState(null);
  const [text,setText]=useState('');
  const [seconds,setSeconds]=useState(null);
  const [end,setEnd]=useState(null);
  const [showChat,setShowChat]=useState(true);
  const ws=useRef(null);
  const keys=useRef(new Set());
  const touch=useRef({dx:0,dz:0});
  const scroll=useRef(null);
  useEffect(()=>{
    let active=true, socket=null, retryTimer=null, retryCount=0;
    const proto=location.protocol==='https:'?'wss:':'ws:';
    const invite=new URLSearchParams(location.search).get('join');
    const query='room='+encodeURIComponent(kind)+((kind!=='home' && invite?.startsWith(kind+':'))?'&instance='+encodeURIComponent(invite):'');
    const url=proto+'//'+location.host+'/socket?'+query+(kind==='home'?'&owner='+encodeURIComponent(ownerFid||user.fid):'');
    const connect=()=>{
      if(!active)return;
      setState(retryCount?'Reconnecting…':'Connecting to world…');
      socket=new WebSocket(url);
      ws.current=socket;
      socket.onopen=()=>{retryCount=0;if(active)setState('Connected');};
      socket.onerror=()=>{if(active)setState('Connection interrupted');};
      socket.onclose=event=>{
        if(!active)return;
        playersRef.current=[];
        setPlayers([]);
        setSelfId('');
        if(event.code===1008){setState('Room session closed — please return and re-enter');return;}
        setState('Reconnecting…');
        const delay=Math.min(500*2**Math.min(retryCount++,4),6000);
        retryTimer=setTimeout(connect,delay);
      };
    socket.onmessage=e=>{
      if(!active)return;
      let packet;try{packet=JSON.parse(e.data);}catch{return;}
      const d=packet.data;
      if(packet.event==='welcome'){setSelfId(d.id);setRoom(d.room);}
      if(packet.event==='snapshot'){playersRef.current=d.players;setPlayers(d.players);setSeconds(d.secondsLeft);}
      if(packet.event==='chat')setMessages(prev=>[...prev.slice(-36),{...d,type:'chat'}]);
      if(packet.event==='emote'){
        setEffects(prev=>({...prev,[d.id]:d.name}));
        setTimeout(()=>{if(active)setEffects(prev=>{const next={...prev};delete next[d.id];return next;});},1800);
        setMessages(prev=>[...prev.slice(-36),{type:'notice',text:(playersRef.current.find(p=>p.id===d.id)?.name||'Someone')+' '+(d.name==='dance'?'is dancing 💃':d.name==='heart'?'sent love 💜':'waved 👋')}]);
      }
      if(packet.event==='notice')setMessages(prev=>[...prev.slice(-36),{...d,type:'notice'}]);
      if(packet.event==='match-end'){setEnd(d);setTimeout(()=>{if(active)setEnd(null);},10000);}
      if(packet.event==='error')setState(d.message);
    };
    };
    connect();
    const onDown=e=>{
      if(['INPUT','TEXTAREA'].includes(document.activeElement?.tagName))return;
      if(['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright',' '].includes(e.key.toLowerCase()))e.preventDefault();
      keys.current.add(e.key.toLowerCase());
      if(e.code==='Space' && kind==='arena' && ws.current?.readyState===1)ws.current.send(JSON.stringify({event:'shoot'}));
    };
    const onUp=e=>keys.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown',onDown);window.addEventListener('keyup',onUp);
    const interval=setInterval(()=>{
      if(ws.current?.readyState!==1)return;
      const down=keys.current;
      const dx=Number(down.has('d')||down.has('arrowright'))-Number(down.has('a')||down.has('arrowleft'))+touch.current.dx;
      const dz=Number(down.has('s')||down.has('arrowdown'))-Number(down.has('w')||down.has('arrowup'))+touch.current.dz;
      ws.current.send(JSON.stringify({event:'move',data:{dx:Math.max(-1,Math.min(1,dx)),dz:Math.max(-1,Math.min(1,dz))}}));
    },90);
    return ()=>{active=false;clearTimeout(retryTimer);clearInterval(interval);socket?.close();window.removeEventListener('keydown',onDown);window.removeEventListener('keyup',onUp);keys.current.clear();};
  },[kind,ownerFid]);
  useEffect(()=>{if(scroll.current)scroll.current.scrollTop=scroll.current.scrollHeight;},[messages]);
  const me=players.find(p=>p.id===selfId);
  const send=(event,data={})=>{if(ws.current?.readyState===1)ws.current.send(JSON.stringify({event,data}));};
  function shareMatch() {
    if(!end)return;
    const myResult=end.scores?.find(p=>p.id===selfId);
    const text=end.winner===selfId
      ? 'I won a Laser Tag match on Simcaster 🎮 — '+(myResult?.score||0)+' points. Come join the social gaming world!'
      : 'Just played a Laser Tag match on Simcaster 🎮 — '+(myResult?.score||0)+' points. Meet me in the arcade!';
    window.open('https://warpcast.com/~/compose?text='+encodeURIComponent(text),'_blank','noopener,noreferrer');
  }
  function inviteFriend() {
    const url=new URL(location.origin);
    url.searchParams.set('join',room);
    if (!room || kind==='home')return;
    const notify=text=>setMessages(prev=>[...prev,{type:'notice',text}]);
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url.toString()).then(()=>notify('Invite link copied!')).catch(()=>notify(url.toString()));
    else notify('Share this URL: '+url.toString());
  }
  async function action(fid,type) {
    if(!fid || fid===user.fid)return;
    if(!window.confirm(type==='blocks'?'Block this player from room chat?':'Report this player for harassment?'))return;
    try {
      const response=await fetch('/api/'+type,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({fid,...(type==='reports'?{reason:'harassment'}:{})})});
      if(!response.ok)throw new Error((await response.json()).error||'Request failed');
      setMessages(prev=>[...prev,{type:'notice',text:type==='blocks'?'Player blocked':'Report submitted'}]);
    }catch(e){setMessages(prev=>[...prev,{type:'notice',text:e.message}]);}
  }
  function sendChat(e){e.preventDefault();const value=text.trim();if(!value)return;send('chat',{text:value});setText('');}
  const direction=(dx,dz)=>({onPointerDown:e=>{e.currentTarget.setPointerCapture(e.pointerId);touch.current={dx,dz};},
    onPointerUp:()=>{touch.current={dx:0,dz:0};},onPointerCancel:()=>{touch.current={dx:0,dz:0};}});
  return <div className="world-layout">
    <div className="world-stage">
      <Canvas shadows dpr={[1,1.6]} camera={{position:[18,18,22],fov:48,near:.1,far:150}} gl={{antialias:true,powerPreference:'high-performance'}}>
        <Scene kind={kind} players={players} selfId={selfId} homeItems={homeItems} effects={effects} onSelect={setSelected}/>
      </Canvas>
      <div className="stage-top">
        <button className="stage-back" onClick={onBack}><ArrowLeft size={16}/> Back</button>
        <div className="location-pill"><span className="live-pulse"/> {kind==='arena'?'LASER TAG ARENA':kind==='home'?(ownerFid&&Number(ownerFid)!==Number(user.fid)?'FRIEND’S APARTMENT':'MY APARTMENT'):'THE COMMONS PLAZA'}</div>
        <div className="stage-counter"><Users size={15}/> {players.length} online</div>
        {kind!=='home'&&<button className="stage-back stage-invite" onClick={inviteFriend}>Invite ↗</button>}
      </div>
      <div className="stage-info">
        <span className={state==='Connected'?'connection-good':'connection-bad'}>{state==='Connected'?<Wifi size={13}/>:<WifiOff size={13}/>} {state}</span>
        <span>Room {room.split(':').slice(-1)[0]||'—'}</span>
        {kind==='arena' && <span>{seconds ?? 180}s left</span>}
      </div>
      {kind==='arena' && <div className="game-hud">
        <span><Heart size={17} fill="#ff868e" color="#ff868e"/> {me?.hp??3} HP</span>
        <strong><Trophy size={18}/> {me?.score??0} / 7</strong>
        <span>SPACE / TAP TO FIRE</span>
      </div>}
      <div className="controls-hint"><Move size={15}/> WASD / Arrows to move · Drag to orbit · Wheel to zoom · {kind==='arena'?'Space to shoot':'Explore the city'}</div>
      <div className="touch-pad" aria-label="Touch movement controls">
        <button {...direction(0,-1)} aria-label="Move forward">↑</button>
        <div><button {...direction(-1,0)} aria-label="Move left">←</button><button {...direction(0,1)} aria-label="Move backward">↓</button><button {...direction(1,0)} aria-label="Move right">→</button></div>
      </div>
      {kind==='arena'?<button className="shoot-control" onClick={()=>send('shoot')}><Crosshair size={23}/> FIRE</button>:
        <div className="stage-emotes"><button onClick={()=>send('emote',{name:'wave'})}>👋 Wave</button><button onClick={()=>send('emote',{name:'heart'})}>💜 Love</button><button onClick={()=>send('emote',{name:'dance'})}>💃 Dance</button></div>}
      {selected&&selected.id!==selfId&&<div className="interact-panel">
        <div><b>Say hello to {selected.name}</b><button onClick={()=>setSelected(null)} aria-label="Close interaction menu">×</button></div>
        <p>Click an avatar to interact in the world.</p>
        <div className="interact-actions">
          <button onClick={()=>{send('emote',{name:'wave',targetId:selected.id});setSelected(null);}}>👋 Wave</button>
          <button onClick={()=>{send('emote',{name:'heart',targetId:selected.id});setSelected(null);}}>💜 Send love</button>
          <button onClick={()=>{send('emote',{name:'dance',targetId:selected.id});setSelected(null);}}>💃 Dance</button>
          <button onClick={async()=>{
            try {
              const response=await fetch('/api/friends/requests',{method:'POST',credentials:'same-origin',
                headers:{'Content-Type':'application/json'},body:JSON.stringify({fid:selected.fid})});
              if(!response.ok)throw new Error((await response.json()).error||'Friend request failed');
              setMessages(prev=>[...prev.slice(-36),{type:'notice',text:'Friend request sent to '+selected.name}]);
            }catch(e){setMessages(prev=>[...prev.slice(-36),{type:'notice',text:e.message}]);}
            setSelected(null);
          }}>➕ Add friend</button>
        </div>
      </div>}
      {kind==='plaza' && <button className="goto-arcade" onClick={onArcade}><Crosshair size={16}/> Enter arcade</button>}
      {end&&<div className="match-result"><Flag size={25}/><h2>{end.winner===selfId?'You won!':end.winner?'Match complete':'It's a draw!'}</h2><p>{end.scores.map(s=>s.name+' '+s.score).join(' · ')}</p><button className="share-match" onClick={shareMatch}>Share to Farcaster <ExternalLink size={14}/></button><button className="close-match" onClick={()=>setEnd(null)} aria-label="Close match result">×</button></div>}
    </div>
    <aside className={'world-panel '+(!showChat?'panel-collapsed':'')}>
      <div className="world-panel-head"><div><strong>Live room</strong><small>{players.length} people here</small></div><button onClick={()=>setShowChat(!showChat)} aria-label="Toggle chat"><MessageCircle size={19}/></button></div>
      {showChat&&<>
        <div className="room-people">{players.map(p=><div key={p.id} className="room-person"><span className="tiny-avatar" style={{background:HEX[p.avatar?.color]||HEX.violet}}>{p.name[0]?.toUpperCase()}</span><span>{p.name}{p.id===selfId?' (you)':''}</span><span className="online-dot"/>{p.id!==selfId&&<span className="person-actions"><button title="Block chat" onClick={()=>action(p.fid,'blocks')}>Block</button><button title="Report player" onClick={()=>action(p.fid,'reports')}>Report</button></span>}</div>)}</div>
        <div className="room-chat-title"><MessageCircle size={15}/> Room chat</div>
        <div className="room-messages" ref={scroll}>{messages.length===0&&<p className="room-hint">Say hello! Everyone in this room can see your messages.</p>}{messages.map((msg,i)=>msg.type==='notice'?<div className="room-notice" key={i}>{msg.text}</div>:<div className="room-msg" key={i}><b>{msg.name}</b><p>{msg.text}</p></div>)}</div>
        <form className="room-compose" onSubmit={sendChat}><input aria-label="Chat message" value={text} onChange={e=>setText(e.target.value)} placeholder="Say something…" maxLength={180}/><button aria-label="Send message" type="submit"><Send size={17}/></button></form>
        <div className="chat-footnote">Be kind. Room chat is temporary.</div>
      </>}
    </aside>
  </div>;
}
