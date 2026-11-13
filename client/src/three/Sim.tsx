import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { TINTS, type AvatarLook } from '../../../shared/catalog';
import type { PathSample } from '../../../shared/world';
import { FONT, labelTexture, loadGLB, wrapText } from './assets';

export interface Pose extends PathSample { y?: number }

interface Props {
  look: AvatarLook;
  name: string;
  self?: boolean;
  accent?: string; // name-tag colour for feed sims
  bubble?: string;
  /** Returns the pose for this frame. Called inside the render loop, so it must not allocate. */
  pose: () => Pose | null;
  /** Animation clip to hold (activities, emotes); falls back to walk/idle. */
  clip?: string | null;
  onPick?: (e: { clientX: number; clientY: number }) => void;
}

const blobGeo = new THREE.CircleGeometry(0.62, 20);
const blobMat = new THREE.MeshBasicMaterial({ color: '#0d0a1c', transparent: true, opacity: 0.28, depthWrite: false });
const pickGeo = new THREE.CylinderGeometry(0.75, 0.75, 2.6, 8);
const pickMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
const ringGeo = new THREE.RingGeometry(0.72, 0.9, 32);
const ringMat = new THREE.MeshBasicMaterial({ color: '#6fe3c1', transparent: true, opacity: 0.9, depthWrite: false });

function nameTexture(name: string, color: string) {
  return labelTexture(`name|${name}|${color}`, (ctx, w, h) => {
    ctx.font = `600 44px ${FONT}`;
    const tw = Math.min(w - 40, ctx.measureText(name).width + 56);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect((w - tw) / 2, 22, tw, 84, 42);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, w / 2, 66, w - 80);
  });
}

function bubbleTexture(text: string) {
  return labelTexture(`bubble|${text}`, (ctx, w, h) => {
    ctx.font = `500 34px ${FONT}`;
    const lines = wrapText(ctx, text, w - 72, 3);
    const bh = 44 + lines.length * 42;
    const top = h - bh - 22;
    ctx.fillStyle = 'rgba(255,255,255,0.97)';
    ctx.beginPath();
    ctx.roundRect(12, top, w - 24, bh, 26);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w / 2 - 16, top + bh - 1);
    ctx.lineTo(w / 2, top + bh + 20);
    ctx.lineTo(w / 2 + 16, top + bh - 1);
    ctx.fill();
    ctx.fillStyle = '#1d1733';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((line, i) => ctx.fillText(line, w / 2, top + 43 + i * 42));
  }, 512, 256);
}

const lerpAngle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

export default function Sim({ look, name, self, accent, bubble, pose, clip, onPick }: Props) {
  const root = useRef<THREE.Group>(null);
  const [body, setBody] = useState<THREE.Object3D | null>(null);
  const mixer = useRef<THREE.AnimationMixer | null>(null);
  const actions = useRef<Record<string, THREE.AnimationAction>>({});
  const current = useRef('');
  const placed = useRef(false);

  useEffect(() => {
    let alive = true;
    const owned: THREE.Material[] = [];
    Promise.all([loadGLB('char-' + look.char), loadGLB('char-rogue')]).then(([model, anims]) => {
      if (!alive) return;
      const copy = cloneSkinned(model.scene);
      const tint = new THREE.Color(TINTS[look.tint] || '#ffffff');
      copy.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (/Hat|Helmet/.test(o.name)) o.visible = look.hat;
        if (/Cape/.test(o.name)) o.visible = look.cape;
        if (!mesh.isMesh) return;
        mesh.castShadow = false; // sims use a blob shadow; the shadow map is static
        mesh.frustumCulled = false; // skinned bounds are unreliable once animated
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        mat.color.copy(tint);
        mesh.material = mat;
        owned.push(mat);
      });
      const mx = new THREE.AnimationMixer(copy);
      const map: Record<string, THREE.AnimationAction> = {};
      for (const c of anims.animations) map[c.name] = mx.clipAction(c);
      mixer.current = mx;
      actions.current = map;
      current.current = '';
      setBody(copy);
    });
    return () => {
      alive = false;
      mixer.current?.stopAllAction();
      mixer.current = null;
      owned.forEach((m) => m.dispose());
    };
  }, [look.char, look.tint, look.hat, look.cape]);

  useFrame((_, dt) => {
    const g = root.current;
    const p = pose();
    if (!g || !p) return;
    if (!placed.current) {
      g.position.set(p.x, p.y ?? 0, p.z);
      g.rotation.y = p.heading;
      placed.current = true;
    } else {
      const k = 1 - Math.exp(-dt * 22);
      g.position.x += (p.x - g.position.x) * k;
      g.position.z += (p.z - g.position.z) * k;
      g.position.y += ((p.y ?? 0) - g.position.y) * k;
      g.rotation.y = lerpAngle(g.rotation.y, p.heading, 1 - Math.exp(-dt * 12));
    }
    const mx = mixer.current;
    if (!mx) return;
    const want = clip && actions.current[clip] ? clip : p.moving ? 'Running_A' : 'Idle';
    if (want !== current.current) {
      const next = actions.current[want];
      const prev = actions.current[current.current];
      if (next) {
        next.reset().setEffectiveTimeScale(want === 'Running_A' ? 0.95 : 1).fadeIn(0.18).play();
        if (prev) prev.fadeOut(0.18);
        current.current = want;
      }
    }
    mx.update(Math.min(dt, 0.05));
  });

  const tagColor = accent || (self ? '#5a3bc4' : 'rgba(27,21,48,0.86)');
  const tag = useMemo(() => nameTexture(name.slice(0, 20), tagColor), [name, tagColor]);
  const bubbleTex = useMemo(() => (bubble ? bubbleTexture(bubble.slice(0, 120)) : null), [bubble]);

  return (
    <group ref={root}>
      <mesh geometry={blobGeo} material={blobMat} rotation-x={-Math.PI / 2} position-y={0.03} />
      {self && <mesh geometry={ringGeo} material={ringMat} rotation-x={-Math.PI / 2} position-y={0.05} />}
      {body && <primitive object={body} />}
      <sprite position={[0, 3.25, 0]} scale={[3.2, 0.8, 1]} renderOrder={5}>
        <spriteMaterial map={tag} transparent depthWrite={false} />
      </sprite>
      {bubbleTex && (
        <sprite position={[0, 5.0, 0]} scale={[5.2, 2.6, 1]} renderOrder={6}>
          <spriteMaterial map={bubbleTex} transparent depthWrite={false} depthTest={false} />
        </sprite>
      )}
      {onPick && (
        <mesh
          geometry={pickGeo}
          material={pickMat}
          position-y={1.3}
          onClick={(e) => {
            if (e.delta > 6) return;
            e.stopPropagation();
            onPick(e.nativeEvent);
          }}
        />
      )}
    </group>
  );
}
