import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { createAvatarAnimationClips, createSkinnedTorsoMesh } from './skeletal.js';

export const shirtColors = { violet: '#8d64f7', citrus: '#eec35b', coral: '#ff898a', mint: '#5dd3ba', sky: '#73bff2' };
export const skinColors = { warm: '#d9a989', light: '#f0c5a3', tan: '#c8885d', deep: '#875434', dark: '#523322' };
export const hairColors = { espresso: '#302438', chestnut: '#70432e', auburn: '#af5537', blonde: '#dfbb72', silver: '#a9acb8' };
const clothDark = '#363450';

const SHARED_CLIPS = createAvatarAnimationClips();

export default function AvatarFigure({ avatar = {}, emote = '', animate = true, moving = false, shielded = false, dashing = false }) {
  const mixerRoot = useRef();
  const body = useRef();
  const leftArm = useRef();
  const rightArm = useRef();
  const leftLeg = useRef();
  const rightLeg = useRef();
  const mixerRef = useRef(null);
  const actionsRef = useRef({});
  const currentClipRef = useRef('');

  const shirt = shirtColors[avatar.color] || shirtColors.violet;
  const skin = skinColors[avatar.skin] || skinColors.warm;
  const hair = hairColors[avatar.hairColor] || hairColors.espresso;
  const build = avatar.build === 'slim' ? 0.82 : avatar.build === 'broad' ? 1.2 : 1;
  const outfit = avatar.outfit || 'street';
  const style = avatar.hair || 'short';

  const skinnedTorso = useMemo(() => createSkinnedTorsoMesh(shirt, build), [shirt, build]);

  useEffect(() => {
    return () => {
      skinnedTorso.skinnedMesh.geometry.dispose();
      skinnedTorso.skinnedMesh.material.dispose();
    };
  }, [skinnedTorso]);

  useEffect(() => {
    if (!mixerRoot.current) return undefined;
    const mixer = new THREE.AnimationMixer(mixerRoot.current);
    mixerRef.current = mixer;
    const actions = {
      idle: mixer.clipAction(SHARED_CLIPS.idle),
      walk: mixer.clipAction(SHARED_CLIPS.walk),
      dash: mixer.clipAction(SHARED_CLIPS.dash),
      wave: mixer.clipAction(SHARED_CLIPS.wave),
      dance: mixer.clipAction(SHARED_CLIPS.dance)
    };
    actionsRef.current = actions;
    actions.idle.play();
    currentClipRef.current = 'idle';
    return () => {
      mixer.stopAllAction();
      mixerRef.current = null;
    };
  }, [skinnedTorso]);

  const targetClip =
    emote === 'dance'
      ? 'dance'
      : emote === 'wave'
        ? 'wave'
        : dashing
          ? 'dash'
          : moving
            ? 'walk'
            : 'idle';

  useEffect(() => {
    const actions = actionsRef.current;
    const nextAction = actions[targetClip];
    if (!nextAction || currentClipRef.current === targetClip) return;
    const prevAction = actions[currentClipRef.current];
    if (prevAction) prevAction.fadeOut(0.14);
    nextAction.reset().fadeIn(0.14).play();
    currentClipRef.current = targetClip;
  }, [targetClip]);

  useFrame((_, delta) => {
    if (!animate || !mixerRef.current) return;
    mixerRef.current.update(Math.min(delta, 0.1));
  });

  return (
    <group ref={mixerRoot}>
      <group ref={body} name="body">
        {shielded && (
          <mesh position={[0, 1.0, 0]}>
            <sphereGeometry args={[0.85, 16, 14]} />
            <meshStandardMaterial color="#5dd3ba" emissive="#5dd3ba" emissiveIntensity={0.45} transparent opacity={0.28} />
          </mesh>
        )}
        <primitive object={skinnedTorso.skinnedMesh} position={[0, 0.88, 0]} />
        {outfit === 'formal' && (
          <>
            <mesh position={[0, 1.1, 0.35]}>
              <coneGeometry args={[0.115, 0.3, 3]} />
              <meshStandardMaterial color="#fff0ce" />
            </mesh>
            <mesh position={[0, 0.99, 0.42]}>
              <coneGeometry args={[0.055, 0.21, 3]} />
              <meshStandardMaterial color="#312858" />
            </mesh>
          </>
        )}
        {outfit === 'sport' && (
          <mesh position={[0, 0.94, 0.35]}>
            <boxGeometry args={[0.42, 0.05, 0.03]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
        )}
        {outfit === 'street' && (
          <mesh position={[0, 1.16, 0.32]}>
            <torusGeometry args={[0.14, 0.04, 7, 16, Math.PI]} />
            <meshStandardMaterial color="#f9eaf6" />
          </mesh>
        )}
        {outfit === 'casual' && (
          <mesh position={[0, 0.91, 0.35]}>
            <circleGeometry args={[0.13, 12]} />
            <meshStandardMaterial color="#fff4b9" />
          </mesh>
        )}
        <group ref={leftLeg} name="leftLeg" position={[-0.16, 0.45, 0]}>
          <mesh position={[0, -0.17, 0]} castShadow>
            <capsuleGeometry args={[0.16, 0.37, 4, 10]} />
            <meshStandardMaterial color={clothDark} />
          </mesh>
          <mesh position={[-0.03, -0.35, 0.12]} castShadow>
            <boxGeometry args={[0.29, 0.16, 0.6]} />
            <meshStandardMaterial color="#f6f0e8" />
          </mesh>
        </group>
        <group ref={rightLeg} name="rightLeg" position={[0.16, 0.45, 0]}>
          <mesh position={[0, -0.17, 0]} castShadow>
            <capsuleGeometry args={[0.16, 0.37, 4, 10]} />
            <meshStandardMaterial color={clothDark} />
          </mesh>
          <mesh position={[0.03, -0.35, 0.12]} castShadow>
            <boxGeometry args={[0.29, 0.16, 0.6]} />
            <meshStandardMaterial color="#f6f0e8" />
          </mesh>
        </group>
        {[-1, 1].map((side) => (
          <group key={side} position={[side * (0.39 * build), 1.05, 0]} rotation={[0, 0, side * 0.09]}>
            <mesh ref={side === 1 ? rightArm : leftArm} name={side === 1 ? 'rightArm' : 'leftArm'} castShadow>
              <capsuleGeometry args={[0.14, 0.54, 4, 8]} />
              <meshStandardMaterial color={outfit === 'formal' ? '#57406b' : shirt} />
            </mesh>
            <mesh position={[0, -0.43, 0]}>
              <sphereGeometry args={[0.135, 10, 8]} />
              <meshStandardMaterial color={skin} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 1.6, 0]} castShadow>
          <sphereGeometry args={[0.345, 20, 16]} />
          <meshStandardMaterial color={skin} roughness={0.9} />
        </mesh>
        <mesh position={[0, 1.83, -0.11]} castShadow scale={[1.07, 0.8, 1.15]}>
          <sphereGeometry args={[0.355, 20, 12]} />
          <meshStandardMaterial color={hair} />
        </mesh>
        {style === 'buzz' && (
          <mesh position={[0, 1.87, 0]} scale={[1, 0.4, 1]}>
            <sphereGeometry args={[0.355, 16, 12]} />
            <meshStandardMaterial color={hair} />
          </mesh>
        )}
        {style === 'curls' &&
          [-0.23, -0.09, 0.09, 0.23].map((x, i) => (
            <mesh key={i} position={[x, 2.01, 0.1 + (i % 2) * 0.02]}>
              <sphereGeometry args={[0.17, 12, 9]} />
              <meshStandardMaterial color={hair} />
            </mesh>
          ))}
        {style === 'long' &&
          [-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.25, 1.46, -0.1]}>
              <capsuleGeometry args={[0.13, 0.56, 5, 10]} />
              <meshStandardMaterial color={hair} />
            </mesh>
          ))}
        {style === 'short' && (
          <mesh position={[0, 1.91, 0.06]} scale={[1, 0.55, 1.02]}>
            <sphereGeometry args={[0.35, 16, 10]} />
            <meshStandardMaterial color={hair} />
          </mesh>
        )}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.12, 1.63, 0.325]}>
            <sphereGeometry args={[0.028, 8, 8]} />
            <meshBasicMaterial color="#282334" />
          </mesh>
        ))}
        <mesh position={[0, 1.49, 0.335]}>
          <sphereGeometry args={[0.04, 8, 8]} />
          <meshStandardMaterial color="#955e52" />
        </mesh>
        {avatar.accessory === 'glasses' &&
          [-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.12, 1.63, 0.35]}>
              <torusGeometry args={[0.11, 0.018, 8, 24]} />
              <meshBasicMaterial color="#383044" />
            </mesh>
          ))}
        {avatar.accessory === 'cap' && (
          <>
            <mesh position={[0, 2.06, 0.02]}>
              <cylinderGeometry args={[0.34, 0.32, 0.18, 18]} />
              <meshStandardMaterial color="#262641" />
            </mesh>
            <mesh position={[0, 2.04, 0.27]}>
              <boxGeometry args={[0.55, 0.06, 0.31]} />
              <meshStandardMaterial color="#262641" />
            </mesh>
          </>
        )}
        {avatar.accessory === 'headphones' && (
          <>
            <mesh position={[0, 1.91, 0]}>
              <torusGeometry args={[0.38, 0.07, 8, 24, Math.PI]} />
              <meshStandardMaterial color="#22203b" />
            </mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * 0.36, 1.63, 0]}>
                <boxGeometry args={[0.12, 0.31, 0.19]} />
                <meshStandardMaterial color="#22203b" />
              </mesh>
            ))}
          </>
        )}
        {avatar.accessory === 'earrings' &&
          [-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.34, 1.46, 0]}>
              <torusGeometry args={[0.09, 0.025, 7, 12]} />
              <meshStandardMaterial color="#f9d67b" metalness={0.55} />
            </mesh>
          ))}
      </group>
    </group>
  );
}
