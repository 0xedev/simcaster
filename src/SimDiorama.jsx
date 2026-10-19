import React, { useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import AvatarFigure from './AvatarFigure.jsx';

function Tree({x,z,scale=1}){
  return <group position={[x,0,z]} scale={scale}>
    <mesh position={[0,.46,0]} castShadow><cylinderGeometry args={[.10,.14,.92,7]}/><meshStandardMaterial color="#a57a68"/></mesh>
    <mesh position={[0,1.25,0]} castShadow><dodecahedronGeometry args={[.72,0]}/><meshStandardMaterial color="#5aa78e" flatShading/></mesh>
    <mesh position={[.17,1.69,.11]} castShadow><dodecahedronGeometry args={[.48,0]}/><meshStandardMaterial color="#89cfa7" flatShading/></mesh>
  </group>;
}
function House({x,z,color="#a3a0e8",roof="#64539b",height=2.2,onClick}){
  return <group position={[x,0,z]} onClick={e=>{if(onClick){e.stopPropagation();onClick();}}}>
    <mesh castShadow position={[0,height/2,0]}><boxGeometry args={[2.65,height,2.35]}/><meshStandardMaterial color={color} roughness={.92}/></mesh>
    <mesh castShadow position={[0,height+.26,0]} rotation={[0,Math.PI/4,0]}><coneGeometry args={[2.05,.95,4]}/><meshStandardMaterial color={roof} flatShading/></mesh>
    <mesh position={[0,.79,1.19]}><boxGeometry args={[.61,1.53,.045]}/><meshStandardMaterial color="#453767"/></mesh>
    {[-.9,.9].map(s=><mesh key={s} position={[s,1.3,1.20]}><boxGeometry args={[.43,.52,.055]}/><meshStandardMaterial color="#d9f0ff" metalness={.1}/></mesh>)}
  </group>;
}
function Town({avatar,onExplore,onArcade,onHome}) {
  const bob=useRef();
  useFrame(({clock})=>{if(bob.current)bob.current.rotation.y=Math.sin(clock.elapsedTime*.23)*.12;});
  return <group rotation={[0,-.23,0]}>
    <mesh receiveShadow rotation={[-Math.PI/2,0,0]}><circleGeometry args={[15,48]}/><meshStandardMaterial color="#c7dfb8" roughness={1}/></mesh>
    <mesh receiveShadow rotation={[-Math.PI/2,0,-.13]} position={[0,.03,0]}><planeGeometry args={[4,24]}/><meshStandardMaterial color="#f6e9cf"/></mesh>
    <mesh receiveShadow rotation={[-Math.PI/2,0,0]} position={[0,.045,0]}><planeGeometry args={[22,3.8]}/><meshStandardMaterial color="#f6e9cf"/></mesh>
    <mesh position={[0,.11,0]}><cylinderGeometry args={[1.75,1.9,.25,24]}/><meshStandardMaterial color="#afa0d7"/></mesh>
    <mesh position={[0,.26,0]}><cylinderGeometry args={[1.38,1.38,.19,24]}/><meshStandardMaterial color="#8ed6e1" roughness={.35}/></mesh>
    <mesh position={[0,.8,0]}><cylinderGeometry args={[.16,.27,1.0,12]}/><meshStandardMaterial color="#fff1d8"/></mesh>
    <mesh position={[0,1.48,0]}><icosahedronGeometry args={[.38,0]}/><meshStandardMaterial color="#f8c9eb" emissive="#bd75c7" emissiveIntensity={.17}/></mesh>
    <House x={-4.7} z={-4.6} color="#b7a1ee" onClick={onHome}/>
    <House x={4.8} z={-4.5} color="#f2bc9f" roof="#9d679c" onClick={onExplore}/>
    <House x={-4.8} z={4.5} color="#97cfbe" roof="#538e85" onClick={onExplore}/>
    <House x={4.7} z={4.4} color="#9fbbeb" roof="#6154a7" onClick={onArcade}/>
    {[[-7,-1],[7,1],[-7,5],[6.5,-6],[1,-7],[-1,7]].map(([x,z],i)=><Tree key={i} x={x} z={z} scale={i%2?.8:1}/>)}
    <group ref={bob} position={[2,.15,2.0]} rotation={[0,-.5,0]} scale={.85}><AvatarFigure avatar={avatar}/></group>
    <group position={[-2.6,.12,2.0]} rotation={[0,.35,0]} scale={.8}><AvatarFigure avatar={{color:'coral',hair:'curls',skin:'deep',hairColor:'chestnut',accessory:'glasses',outfit:'street'}}/></group>
    <group position={[3,.13,-1.9]} rotation={[0,-.1,0]} scale={.77}><AvatarFigure avatar={{color:'mint',hair:'long',skin:'light',hairColor:'auburn',outfit:'sport'}}/></group>
  </group>;
}
function Studio({avatar}){
  const group=useRef();
  useFrame(({clock})=>{if(group.current)group.current.rotation.y=clock.elapsedTime*.3;});
  return <group ref={group} position={[0,-.9,0]} scale={1.3}>
    <AvatarFigure avatar={avatar}/>
    <mesh receiveShadow rotation={[-Math.PI/2,0,0]} position={[0,-.035,0]}><circleGeometry args={[1.4,32]}/><meshStandardMaterial color="#cfbfec"/></mesh>
  </group>;
}
export default function SimDiorama({avatar={},variant='town',onExplore,onArcade,onHome}){
  const [supported]=useState(()=>{try{return Boolean(document.createElement('canvas').getContext('webgl2'));}catch{return false;}});
  if(!supported)return <div className="diorama-fallback" aria-label="3D preview unavailable">
    <span aria-hidden="true">🌳 🏘️ ✨</span><p>Jump into your world</p>
    {onExplore&&<button onClick={onExplore}>Explore Channels →</button>}
  </div>;
  return <div className={'sim-diorama sim-diorama-'+variant} aria-label={variant==='town'?'Interactive 3D village preview':'Rotating 3D character preview'}>
    <Canvas dpr={[1,1.5]} camera={{position:variant==='town'?[10,12,14]:[0,1.55,5.7],fov:variant==='town'?35:38,near:.1,far:100}} gl={{antialias:true,powerPreference:'default'}} shadows={false}>
      <color attach="background" args={[variant==='town'?'#ded2fb':'#d7c6f5']}/>
      <ambientLight intensity={2.15}/>
      <directionalLight position={[6,12,9]} intensity={2.1}/>
      {variant==='town'?<Town avatar={avatar} onExplore={onExplore} onArcade={onArcade} onHome={onHome}/>:<Studio avatar={avatar}/>}
    </Canvas>
  </div>;
}
