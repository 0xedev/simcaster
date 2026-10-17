import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

export const shirtColors = {violet:'#8d64f7',citrus:'#eec35b',coral:'#ff898a',mint:'#5dd3ba',sky:'#73bff2'};
export const skinColors = {warm:'#d9a989',light:'#f0c5a3',tan:'#c8885d',deep:'#875434',dark:'#523322'};
export const hairColors = {espresso:'#302438',chestnut:'#70432e',auburn:'#af5537',blonde:'#dfbb72',silver:'#a9acb8'};
const clothDark = '#363450';

export default function AvatarFigure({avatar={},emote='',animate=true}) {
  const body = useRef(), leftArm = useRef(), rightArm = useRef();
  const shirt = shirtColors[avatar.color] || shirtColors.violet;
  const skin = skinColors[avatar.skin] || skinColors.warm;
  const hair = hairColors[avatar.hairColor] || hairColors.espresso;
  const build = avatar.build === 'slim' ? .82 : avatar.build === 'broad' ? 1.20 : 1;
  const outfit = avatar.outfit || 'street';
  const style = avatar.hair || 'short';
  useFrame(({clock})=>{
    if(!animate)return;
    const t=clock.elapsedTime;
    if(body.current){body.current.position.y=Math.sin(t*2.5)*.028+(emote==='dance'?Math.abs(Math.sin(t*5))*.15:0);body.current.rotation.z=emote==='dance'?Math.sin(t*6)*.12:0;}
    if(rightArm.current)rightArm.current.rotation.z=emote==='wave'?-.85+Math.sin(t*12)*.32:emote==='dance'?Math.sin(t*6)*.60:-.10;
    if(leftArm.current)leftArm.current.rotation.z=emote==='dance'?-Math.sin(t*6)*.60:.10;
  });
  return <group ref={body}>
    <mesh castShadow position={[0,.88,0]} scale={[build,1,1]}><capsuleGeometry args={[.34,.63,5,12]}/><meshStandardMaterial color={shirt} roughness={.78}/></mesh>
    {outfit==='formal'&&<><mesh position={[0,1.10,.35]}><coneGeometry args={[.115,.30,3]}/><meshStandardMaterial color="#fff0ce"/></mesh><mesh position={[0,.99,.42]}><coneGeometry args={[.055,.21,3]}/><meshStandardMaterial color="#312858"/></mesh></>}
    {outfit==='sport'&&<mesh position={[0,.94,.35]}><boxGeometry args={[.42,.05,.03]}/><meshStandardMaterial color="#ffffff"/></mesh>}
    {outfit==='street'&&<mesh position={[0,1.16,.32]}><torusGeometry args={[.14,.04,7,16,Math.PI]}/><meshStandardMaterial color="#f9eaf6"/></mesh>}
    {outfit==='casual'&&<mesh position={[0,.91,.35]}><circleGeometry args={[.13,12]}/><meshStandardMaterial color="#fff4b9"/></mesh>}
    <mesh position={[-.16,.28,0]} castShadow><capsuleGeometry args={[.16,.37,4,10]}/><meshStandardMaterial color={clothDark}/></mesh>
    <mesh position={[.16,.28,0]} castShadow><capsuleGeometry args={[.16,.37,4,10]}/><meshStandardMaterial color={clothDark}/></mesh>
    {[-1,1].map(side=><group key={side}>
      <group position={[side*(.39*build),1.05,0]} rotation={[0,0,side*.09]}>
        <mesh ref={side===1?rightArm:leftArm} castShadow><capsuleGeometry args={[.14,.54,4,8]}/><meshStandardMaterial color={outfit==='formal'?'#57406b':shirt}/></mesh>
        <mesh position={[0,-.43,0]}><sphereGeometry args={[.135,10,8]}/><meshStandardMaterial color={skin}/></mesh>
      </group>
      <mesh position={[side*.19,.10,.12]} castShadow><boxGeometry args={[.29,.16,.60]}/><meshStandardMaterial color="#f6f0e8"/></mesh>
    </group>)}
    <mesh position={[0,1.60,0]} castShadow><sphereGeometry args={[.345,20,16]}/><meshStandardMaterial color={skin} roughness={.9}/></mesh>
    <mesh position={[0,1.83,-.11]} castShadow scale={[1.07,.8,1.15]}><sphereGeometry args={[.355,20,12]}/><meshStandardMaterial color={hair}/></mesh>
    {style==='buzz'&&<mesh position={[0,1.87,0]} scale={[1,.40,1]}><sphereGeometry args={[.355,16,12]}/><meshStandardMaterial color={hair}/></mesh>}
    {style==='curls'&&[-.23,-.09,.09,.23].map((x,i)=><mesh key={i} position={[x,2.01, .10+(i%2)*.02]}><sphereGeometry args={[.17,12,9]}/><meshStandardMaterial color={hair}/></mesh>)}
    {style==='long'&&[-1,1].map(s=><mesh key={s} position={[s*.25,1.46,-.10]}><capsuleGeometry args={[.13,.56,5,10]}/><meshStandardMaterial color={hair}/></mesh>)}
    {style==='short'&&<mesh position={[0,1.91,.06]} scale={[1,.55,1.02]}><sphereGeometry args={[.35,16,10]}/><meshStandardMaterial color={hair}/></mesh>}
    {[-1,1].map(s=><mesh key={s} position={[s*.12,1.63,.325]}><sphereGeometry args={[.028,8,8]}/><meshBasicMaterial color="#282334"/></mesh>)}
    <mesh position={[0,1.49,.335]}><sphereGeometry args={[.04,8,8]}/><meshStandardMaterial color="#955e52"/></mesh>
    {avatar.accessory==='glasses'&&[-1,1].map(s=><mesh key={s} position={[s*.12,1.63,.35]}><torusGeometry args={[.11,.018,8,24]}/><meshBasicMaterial color="#383044"/></mesh>)}
    {avatar.accessory==='cap'&&<><mesh position={[0,2.06,.02]}><cylinderGeometry args={[.34,.32,.18,18]}/><meshStandardMaterial color="#262641"/></mesh><mesh position={[0,2.04,.27]}><boxGeometry args={[.55,.06,.31]}/><meshStandardMaterial color="#262641"/></mesh></>}
    {avatar.accessory==='headphones'&&<><mesh position={[0,1.91,0]}><torusGeometry args={[.38,.07,8,24,Math.PI]}/><meshStandardMaterial color="#22203b"/></mesh>{[-1,1].map(s=><mesh key={s} position={[s*.36,1.63,0]}><boxGeometry args={[.12,.31,.19]}/><meshStandardMaterial color="#22203b"/></mesh>)}</>}
    {avatar.accessory==='earrings'&&[-1,1].map(s=><mesh key={s} position={[s*.34,1.46,0]}><torusGeometry args={[.09,.025,7,12]}/><meshStandardMaterial color="#f9d67b" metalness={.55}/></mesh>)}
  </group>;
}
