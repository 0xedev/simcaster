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
      {/* Ground contact shadow disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <circleGeometry args={[0.48, 24]} />
        <meshBasicMaterial color="#140e24" transparent opacity={0.28} depthWrite={false} />
      </mesh>

      <group ref={body} name="body">
        {shielded && (
          <mesh position={[0, 1.0, 0]}>
            <sphereGeometry args={[0.85, 20, 16]} />
            <meshStandardMaterial color="#5dd3ba" emissive="#5dd3ba" emissiveIntensity={0.45} transparent opacity={0.26} />
          </mesh>
        )}

        {/* Skinned Torso */}
        <primitive object={skinnedTorso.skinnedMesh} position={[0, 0.88, 0]} />

        {/* Belt / Waistband */}
        <mesh position={[0, 0.56, 0]} scale={[build, 1, 0.96]}>
          <cylinderGeometry args={[0.345, 0.345, 0.09, 20]} />
          <meshStandardMaterial color="#262138" roughness={0.6} />
        </mesh>

        {/* Neck */}
        <mesh position={[0, 1.32, 0]} castShadow>
          <cylinderGeometry args={[0.13, 0.15, 0.22, 14]} />
          <meshStandardMaterial color={skin} roughness={0.75} />
        </mesh>

        {outfit === 'formal' && (
          <>
            <mesh position={[0, 1.15, 0.33]}>
              <coneGeometry args={[0.12, 0.28, 3]} />
              <meshStandardMaterial color="#fff4dc" />
            </mesh>
            <mesh position={[0, 0.96, 0.36]}>
              <coneGeometry args={[0.06, 0.26, 4]} />
              <meshStandardMaterial color="#e11d48" />
            </mesh>
          </>
        )}
        {outfit === 'sport' && (
          <mesh position={[0, 0.96, 0.34]}>
            <boxGeometry args={[0.42, 0.08, 0.04]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
        )}
        {outfit === 'street' && (
          <mesh position={[0, 1.22, 0.18]} rotation={[0.25, 0, 0]}>
            <torusGeometry args={[0.22, 0.065, 10, 20]} />
            <meshStandardMaterial color="#f4effc" roughness={0.7} />
          </mesh>
        )}
        {outfit === 'casual' && (
          <mesh position={[0, 0.95, 0.34]}>
            <circleGeometry args={[0.12, 16]} />
            <meshStandardMaterial color="#fde68a" />
          </mesh>
        )}

        {/* Left Leg & Sneaker */}
        <group ref={leftLeg} name="leftLeg" position={[-0.16, 0.48, 0]}>
          <mesh position={[0, -0.18, 0]} castShadow>
            <capsuleGeometry args={[0.145, 0.34, 6, 12]} />
            <meshStandardMaterial color={clothDark} roughness={0.8} />
          </mesh>
          <group position={[-0.02, -0.38, 0.08]}>
            <mesh castShadow>
              <boxGeometry args={[0.27, 0.14, 0.46]} />
              <meshStandardMaterial color={shirt} roughness={0.5} />
            </mesh>
            <mesh position={[0, -0.06, 0]}>
              <boxGeometry args={[0.29, 0.06, 0.49]} />
              <meshStandardMaterial color="#f8f5fc" roughness={0.4} />
            </mesh>
          </group>
        </group>

        {/* Right Leg & Sneaker */}
        <group ref={rightLeg} name="rightLeg" position={[0.16, 0.48, 0]}>
          <mesh position={[0, -0.18, 0]} castShadow>
            <capsuleGeometry args={[0.145, 0.34, 6, 12]} />
            <meshStandardMaterial color={clothDark} roughness={0.8} />
          </mesh>
          <group position={[0.02, -0.38, 0.08]}>
            <mesh castShadow>
              <boxGeometry args={[0.27, 0.14, 0.46]} />
              <meshStandardMaterial color={shirt} roughness={0.5} />
            </mesh>
            <mesh position={[0, -0.06, 0]}>
              <boxGeometry args={[0.29, 0.06, 0.49]} />
              <meshStandardMaterial color="#f8f5fc" roughness={0.4} />
            </mesh>
          </group>
        </group>

        {/* Arms with attached hands */}
        {[-1, 1].map((side) => (
          <group key={side} position={[side * (0.38 * build), 1.16, 0]} rotation={[0, 0, side * 0.08]}>
            <group ref={side === 1 ? rightArm : leftArm} name={side === 1 ? 'rightArm' : 'leftArm'}>
              <mesh position={[0, -0.18, 0]} castShadow>
                <capsuleGeometry args={[0.115, 0.36, 6, 12]} />
                <meshStandardMaterial color={outfit === 'formal' ? '#4c3863' : shirt} roughness={0.7} />
              </mesh>
              <mesh position={[0, -0.44, 0]} castShadow>
                <sphereGeometry args={[0.115, 14, 12]} />
                <meshStandardMaterial color={skin} roughness={0.75} />
              </mesh>
            </group>
          </group>
        ))}

        {/* Head */}
        <mesh position={[0, 1.62, 0]} castShadow>
          <sphereGeometry args={[0.35, 24, 20]} />
          <meshStandardMaterial color={skin} roughness={0.72} />
        </mesh>

        {/* Ears */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.33, 1.61, -0.02]}>
            <sphereGeometry args={[0.075, 10, 10]} />
            <meshStandardMaterial color={skin} roughness={0.75} />
          </mesh>
        ))}

        {/* Base Hair Cap */}
        <mesh position={[0, 1.76, -0.05]} castShadow scale={[1.05, 0.88, 1.08]}>
          <sphereGeometry args={[0.355, 22, 16]} />
          <meshStandardMaterial color={hair} roughness={0.65} />
        </mesh>
        {style === 'buzz' && (
          <mesh position={[0, 1.84, 0.02]} scale={[1.01, 0.48, 1.02]}>
            <sphereGeometry args={[0.355, 18, 14]} />
            <meshStandardMaterial color={hair} roughness={0.75} />
          </mesh>
        )}
        {style === 'curls' &&
          [-0.22, -0.08, 0.08, 0.22].map((x, i) => (
            <mesh key={i} position={[x, 1.96, 0.12 + (i % 2) * 0.03]} castShadow>
              <sphereGeometry args={[0.155, 14, 12]} />
              <meshStandardMaterial color={hair} roughness={0.65} />
            </mesh>
          ))}
        {style === 'long' &&
          [-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.26, 1.48, -0.08]} castShadow>
              <capsuleGeometry args={[0.12, 0.5, 6, 12]} />
              <meshStandardMaterial color={hair} roughness={0.65} />
            </mesh>
          ))}
        {style === 'short' && (
          <mesh position={[0, 1.89, 0.07]} scale={[1.02, 0.52, 1.04]} castShadow>
            <sphereGeometry args={[0.345, 18, 14]} />
            <meshStandardMaterial color={hair} roughness={0.65} />
          </mesh>
        )}

        {/* Expressive Eyes (Sclera + Iris/Pupil + Highlight + Brow) */}
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.125, 1.64, 0.315]}>
            <mesh scale={[1, 1.15, 0.5]}>
              <sphereGeometry args={[0.052, 12, 12]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
            <mesh position={[0, 0, 0.022]} scale={[1, 1.15, 0.6]}>
              <sphereGeometry args={[0.032, 10, 10]} />
              <meshBasicMaterial color="#1e1829" />
            </mesh>
            <mesh position={[s * 0.012, 0.016, 0.038]}>
              <sphereGeometry args={[0.01, 8, 8]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
            <mesh position={[0, 0.085, 0.01]} rotation={[0, 0, s * -0.08]}>
              <boxGeometry args={[0.085, 0.02, 0.02]} />
              <meshBasicMaterial color={hair} />
            </mesh>
          </group>
        ))}

        {/* Subtle Cheek Blush */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.19, 1.56, 0.305]} scale={[1.2, 0.7, 0.3]}>
            <sphereGeometry args={[0.042, 10, 10]} />
            <meshBasicMaterial color="#f472b6" transparent opacity={0.38} />
          </mesh>
        ))}

        {/* Smile Mouth */}
        <mesh position={[0, 1.53, 0.332]} rotation={[Math.PI, 0, 0]}>
          <torusGeometry args={[0.048, 0.012, 8, 16, Math.PI]} />
          <meshBasicMaterial color="#582f32" />
        </mesh>

        {/* Accessories */}
        {avatar.accessory === 'glasses' && (
          <group position={[0, 1.64, 0.35]}>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * 0.125, 0, 0]}>
                <torusGeometry args={[0.085, 0.016, 10, 24]} />
                <meshStandardMaterial color="#1f192e" metalness={0.5} roughness={0.2} />
              </mesh>
            ))}
            <mesh position={[0, 0.01, 0]}>
              <boxGeometry args={[0.08, 0.016, 0.016]} />
              <meshStandardMaterial color="#1f192e" />
            </mesh>
          </group>
        )}
        {avatar.accessory === 'cap' && (
          <>
            <mesh position={[0, 1.94, 0.01]} castShadow>
              <cylinderGeometry args={[0.34, 0.35, 0.18, 20]} />
              <meshStandardMaterial color="#2a2448" roughness={0.6} />
            </mesh>
            <mesh position={[0, 1.88, 0.26]}>
              <boxGeometry args={[0.52, 0.045, 0.28]} />
              <meshStandardMaterial color="#3d336b" roughness={0.5} />
            </mesh>
          </>
        )}
        {avatar.accessory === 'headphones' && (
          <>
            <mesh position={[0, 1.72, 0]}>
              <torusGeometry args={[0.37, 0.045, 10, 28, Math.PI]} />
              <meshStandardMaterial color="#221e38" metalness={0.4} roughness={0.3} />
            </mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * 0.36, 1.62, 0]}>
                <cylinderGeometry args={[0.11, 0.11, 0.09, 16]} rotation={[0, 0, Math.PI / 2]} />
                <meshStandardMaterial color="#8a63d2" emissive="#8a63d2" emissiveIntensity={0.25} />
              </mesh>
            ))}
          </>
        )}
        {avatar.accessory === 'earrings' &&
          [-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.35, 1.52, 0]}>
              <torusGeometry args={[0.055, 0.016, 8, 16]} />
              <meshStandardMaterial color="#fbbf24" metalness={0.85} roughness={0.15} />
            </mesh>
          ))}
      </group>
    </group>
  );
}
