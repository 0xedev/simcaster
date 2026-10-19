import React, { useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import AvatarFigure from './AvatarFigure.jsx';

function Tree({x,z,scale=1}){
  return <group position={[x,0,z]} scale={scale}>
    <mesh position={[0,.08,0]}><cylinderGeometry args={[.38,.42,.16,12]}/><meshStandardMaterial color="#e6ddf5" roughness={.8}/></mesh>
    <mesh position={[0,.48,0]} castShadow><cylinderGeometry args={[.09,.14,.85,8]}/><meshStandardMaterial color="#7c5841" roughness={.85}/></mesh>
    <mesh position={[0,1.22,0]} castShadow><dodecahedronGeometry args={[.72,1]}/><meshStandardMaterial color="#3d9978" roughness={.75}/></mesh>
    <mesh position={[.18,1.68,.12]} castShadow><dodecahedronGeometry args={[.48,1]}/><meshStandardMaterial color="#65c99d" roughness={.7}/></mesh>
  </group>;
}
function House({x,z,color="#8b7ce8",roof="#4b3b80",accent="#a78bfa",height=2.4,onClick}){
  return <group position={[x,0,z]} onClick={e=>{if(onClick){e.stopPropagation();onClick();}}}>
    <mesh position={[0,.08,0]}><boxGeometry args={[3.1,.16,2.8]}/><meshStandardMaterial color="#e5dcf4" roughness={.85}/></mesh>
    <mesh castShadow receiveShadow position={[0,height/2+.08,0]}><boxGeometry args={[2.65,height,2.35]}/><meshStandardMaterial color={color} roughness={.72}/></mesh>
    <mesh castShadow position={[0,height+.18,0]}><boxGeometry args={[2.82,.22,2.52]}/><meshStandardMaterial color={roof} roughness={.6}/></mesh>
    <mesh position={[0,height+.34,0]}><boxGeometry args={[2.2,.18,1.9]}/><meshStandardMaterial color="#f6effe" roughness={.7}/></mesh>
    <mesh position={[0,height-.28,1.21]}><boxGeometry args={[1.6,.22,.08]}/><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={.45}/></mesh>
    <mesh position={[0,1.12,1.32]} rotation={[.25,0,0]}><boxGeometry args={[2.2,.08,.42]}/><meshStandardMaterial color={roof}/></mesh>
    <mesh position={[0,.62,1.19]}><boxGeometry args={[.68,1.18,.05]}/><meshStandardMaterial color="#2a2144"/></mesh>
    {[-.78,.78].map(s=><mesh key={s} position={[s,1.58,1.19]}><boxGeometry args={[.52,.58,.05]}/><meshStandardMaterial color="#d8f3ff" emissive="#bae6fd" emissiveIntensity={.25} metalness={.2} roughness={.2}/></mesh>)}
  </group>;
}
function Town({avatar,onExplore,onArcade,onHome}) {
  const bob=useRef();
  const crystal=useRef();
  useFrame(({clock})=>{
    if(bob.current)bob.current.rotation.y=Math.sin(clock.elapsedTime*.35)*.18;
    if(crystal.current){
      crystal.current.rotation.y=clock.elapsedTime*.9;
      crystal.current.position.y=1.62+Math.sin(clock.elapsedTime*2.2)*.08;
    }
  });
  return <group rotation={[0,-.28,0]}>
    <mesh receiveShadow rotation={[-Math.PI/2,0,0]}><circleGeometry args={[15,64]}/><meshStandardMaterial color="#8cb89b" roughness={.92}/></mesh>
    <mesh receiveShadow rotation={[-Math.PI/2,0,0]} position={[0,.02,0]}><planeGeometry args={[3.4,24]}/><meshStandardMaterial color="#ede4f7" roughness={.8}/></mesh>
    <mesh receiveShadow rotation={[-Math.PI/2,0,0]} position={[0,.025,0]}><planeGeometry args={[24,3.4]}/><meshStandardMaterial color="#ede4f7" roughness={.8}/></mesh>
    <mesh receiveShadow position={[0,.06,0]}><cylinderGeometry args={[3.1,3.25,.12,36]}/><meshStandardMaterial color="#f5effc" roughness={.75}/></mesh>
    <mesh position={[0,.18,0]}><cylinderGeometry args={[1.65,1.82,.26,32]}/><meshStandardMaterial color="#6d56b8" roughness={.55}/></mesh>
    <mesh position={[0,.32,0]}><cylinderGeometry args={[1.38,1.38,.12,32]}/><meshStandardMaterial color="#5eead4" emissive="#2dd4bf" emissiveIntensity={.2} metalness={.25} roughness={.2}/></mesh>
    <mesh position={[0,.88,0]} castShadow><cylinderGeometry args={[.16,.28,1.1,16]}/><meshStandardMaterial color="#f3ebff"/></mesh>
    <mesh ref={crystal} position={[0,1.62,0]}><octahedronGeometry args={[.38,0]}/><meshStandardMaterial color="#c084fc" emissive="#8a63d2" emissiveIntensity={.65} metalness={.35} roughness={.2}/></mesh>
    <House x={-4.8} z={-4.6} color="#7c63d8" roof="#433085" accent="#a78bfa" onClick={onHome}/>
    <House x={4.8} z={-4.5} color="#334155" roof="#1e293b" accent="#38bdf8" onClick={onExplore}/>
    <House x={-4.8} z={4.5} color="#4c1d4b" roof="#31102f" accent="#f43f5e" onClick={onExplore}/>
    <House x={4.8} z={4.4} color="#1e3a8a" roof="#172554" accent="#60a5fa" onClick={onArcade}/>
    {[[-7.2,-1.2],[7.2,1.2],[-7,5.2],[6.8,-6.2],[1.2,-7.2],[-1.2,7.2]].map(([x,z],i)=><Tree key={i} x={x} z={z} scale={i%2?.85:1}/>)}
    <group ref={bob} position={[1.9,.08,2.1]} rotation={[0,-.5,0]} scale={.88}><AvatarFigure avatar={avatar} moving={false}/></group>
    <group position={[-2.4,.08,2.0]} rotation={[0,.45,0]} scale={.84}><AvatarFigure avatar={{color:'coral',hair:'curls',skin:'deep',hairColor:'chestnut',accessory:'glasses',outfit:'street'}}/></group>
    <group position={[2.8,.08,-1.8]} rotation={[0,-.25,0]} scale={.82}><AvatarFigure avatar={{color:'mint',hair:'long',skin:'light',hairColor:'auburn',outfit:'sport'}}/></group>
  </group>;
}
function Studio({avatar}){
  const group=useRef();
  useFrame(({clock})=>{if(group.current)group.current.rotation.y=Math.sin(clock.elapsedTime*.55)*.45;});
  return <group ref={group} position={[0,-.95,0]} scale={1.32}>
    <AvatarFigure avatar={avatar}/>
    <mesh receiveShadow position={[0,-.06,0]}><cylinderGeometry args={[1.25,1.38,.12,36]}/><meshStandardMaterial color="#e8dff8" roughness={.6}/></mesh>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,.005,0]}><ringGeometry args={[1.05,1.18,36]}/><meshBasicMaterial color="#8a63d2"/></mesh>
  </group>;
}
export default function SimDiorama({avatar={},variant='town',onExplore,onArcade,onHome}){
  const [supported]=useState(()=>{try{return Boolean(document.createElement('canvas').getContext('webgl2'));}catch{return false;}});
  if(!supported)return <div className="diorama-fallback" aria-label="3D preview unavailable">
    <span aria-hidden="true">🌳 🏘️ ✨</span><p>Jump into your world</p>
    {onExplore&&<button onClick={onExplore}>Explore Channels →</button>}
  </div>;
  return <div className={'sim-diorama sim-diorama-'+variant} aria-label={variant==='town'?'Interactive 3D village preview':'Rotating 3D character preview'}>
    <Canvas dpr={[1,1.6]} camera={{position:variant==='town'?[10.5,11.5,13.5]:[0,1.45,5.2],fov:variant==='town'?34:36,near:.1,far:100}} gl={{antialias:true,powerPreference:'default'}} shadows>
      <color attach="background" args={[variant==='town'?'#d8cbf8':'#d2c0f5']}/>
      <ambientLight intensity={0.68}/>
      <hemisphereLight args={['#f3e8ff','#4a6b5d',0.75]}/>
      <directionalLight position={[8,14,10]} intensity={1.45} castShadow shadow-mapSize={[1024,1024]}/>
      <directionalLight position={[-6,6,-6]} intensity={0.35} color="#c4b5fd"/>
      {variant==='town'?<Town avatar={avatar} onExplore={onExplore} onArcade={onArcade} onHome={onHome}/>:<Studio avatar={avatar}/>}
    </Canvas>
  </div>;
}
