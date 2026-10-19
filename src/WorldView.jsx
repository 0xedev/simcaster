import React, { useEffect, useMemo, useRef, useState } from 'react';
import AvatarFigure from './AvatarFigure.jsx';
import CastPhone from './CastPhone.jsx';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  ArrowLeft,
  Send,
  Users,
  Move,
  Crosshair,
  Heart,
  Wifi,
  WifiOff,
  Trophy,
  Flag,
  MessageCircle,
  ExternalLink,
  Smartphone,
  Camera,
  Zap,
  Sparkles,
  House,
  Volume2,
  VolumeX,
  Compass
} from 'lucide-react';
import { soundEngine } from './sound.js';
import { loadGltfModel } from './skeletal.js';
import { DISTRICTS, getPlazaDistrict } from '../server/rules.js';

const HEX = { violet: '#8d64f7', citrus: '#eec35b', coral: '#ff898a', mint: '#5dd3ba', sky: '#73bff2' };

const BUILDINGS = [
  [-14, -13, 5.8, 6, 5, '#aea5ed'],
  [-6, -14, 5.2, 7, 4.8, '#e9a9bd'],
  [6, -14, 5.8, 5.5, 4.8, '#87b8df'],
  [14, -13, 5.4, 7, 6, '#b1cea8'],
  [-14, 13, 6, 6, 4.8, '#efca9f'],
  [-5.5, 14, 6, 7, 5, '#97c7bd'],
  [6.5, 14, 5, 8, 5, '#b7a1e5'],
  [15, 13, 5, 6, 4.8, '#e9abb1'],
  [-15, 0, 5, 5, 5, '#94b3dc'],
  [15, 0, 5, 5, 5, '#dfa5cf']
];

const DEFAULT_HOTSPOTS = [
  {
    id: 'warp-cafe',
    name: 'Warp Bean Café',
    x: -6,
    z: -10.8,
    color: '#e9a9bd',
    icon: '☕',
    tagline: 'Refuel with artisan espresso & matcha or work a barista shift',
    actions: [
      { id: 'eat', label: 'Order Espresso & Pastry (₡15)', cost: 15, pay: 0 },
      { id: 'work', label: 'Work Barista Shift (+₡45)', cost: 0, pay: 45 }
    ]
  },
  {
    id: 'foundry-hub',
    name: 'The Foundry Studio',
    x: 6,
    z: -10.8,
    color: '#87b8df',
    icon: '💻',
    tagline: 'Ship mini-apps, stream casts, and build protocol clout',
    actions: [
      { id: 'work', label: 'Ship Farcaster Mini-App (+₡75)', cost: 0, pay: 75 },
      { id: 'stream', label: 'Host Live Cast Stream (+₡50)', cost: 0, pay: 50 }
    ]
  },
  {
    id: 'neon-lounge',
    name: 'Purple Channel Lounge',
    x: -5.5,
    z: 10.6,
    color: '#97c7bd',
    icon: '🎧',
    tagline: 'Lo-fi synth & rooftop social club — boost your Vibe & Clout',
    actions: [
      { id: 'party', label: 'VIP Rooftop Session (₡25)', cost: 25, pay: 0 },
      { id: 'dj', label: 'Spin Headline Synth Set (+₡60)', cost: 0, pay: 60 }
    ]
  },
  {
    id: 'night-market',
    name: 'Onchain Pop-Up Market',
    x: 6.5,
    z: 10.6,
    color: '#b7a1e5',
    icon: '🛍️',
    tagline: 'Collect limited creator drops and grab quick street snacks',
    actions: [
      { id: 'hustle', label: 'Flip Limited Merch Drop (+₡55)', cost: 0, pay: 55 },
      { id: 'snack', label: 'Grab Ramen & Boba (₡8)', cost: 8, pay: 0 }
    ]
  },
  {
    id: 'power-grid',
    name: 'Hub Relay Core',
    x: 0,
    z: -3.2,
    color: '#ffd28c',
    icon: '⚡',
    tagline: 'Keep the Farcaster Hub relay synced and recharge your battery',
    actions: [{ id: 'stabilize', label: 'Sync Hub Relay Node (+₡40)', cost: 0, pay: 40 }]
  },
  {
    id: 'arcade-hq',
    name: 'Laser Tag Arcade HQ',
    x: 11.6,
    z: 0,
    color: '#dfa5cf',
    icon: '🕹️',
    tagline: 'Warm up your aim or jump straight into the Laser Tag Arena',
    actions: [{ id: 'train', label: 'Reflex Target Drill (+₡30)', cost: 0, pay: 30 }]
  },
  {
    id: 'transit-hub',
    name: 'Warp Transit Station',
    x: -11.6,
    z: 0,
    color: '#8d64f7',
    icon: '🚝',
    tagline: 'Hop the autonomous electric shuttle across Plaza districts',
    actions: [
      { id: 'dispatch', label: 'Coordinate Pod Dispatch (+₡42)', cost: 0, pay: 42 },
      { id: 'shuttle', label: 'Board Express Plaza Pod (₡5)', cost: 5, pay: 0 }
    ]
  }
];

const ARENA_BUNKERS = [
  [-7.5, -7.5, 2.2, 2.2],
  [7.5, -7.5, 2.2, 2.2],
  [-7.5, 7.5, 2.2, 2.2],
  [7.5, 7.5, 2.2, 2.2]
];

const TREES = [
  [-10, -7],
  [-11, 7],
  [10, 7],
  [10, -7],
  [-7, 9],
  [7, -9],
  [-18, 7],
  [18, -7],
  [0, 17],
  [0, -17]
];

function Tree({ x, z }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.19, 0.26, 1.8, 7]} />
        <meshStandardMaterial color="#97734f" />
      </mesh>
      <mesh position={[0, 2.25, 0]} castShadow>
        <coneGeometry args={[1.35, 3.1, 8]} />
        <meshStandardMaterial color="#4a9c81" roughness={1} />
      </mesh>
      <mesh position={[0, 3.2, 0]} castShadow>
        <coneGeometry args={[0.9, 2.2, 8]} />
        <meshStandardMaterial color="#6cba97" roughness={1} />
      </mesh>
    </group>
  );
}

function Building({ item, index, night, blackout }) {
  const [x, z, w, h, d, col] = item;
  const winGlow = blackout ? '#2d293e' : night ? '#ffe39f' : '#d4f2ff';
  const winEmissive = blackout ? '#000000' : night ? '#ffbe55' : '#000000';
  return (
    <group position={[x, 0, z]}>
      <mesh castShadow receiveShadow position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={col} roughness={0.83} />
      </mesh>
      <mesh castShadow position={[0, h + 0.15, 0]}>
        <boxGeometry args={[w + 0.35, 0.35, d + 0.35]} />
        <meshStandardMaterial color="#f5e8d8" />
      </mesh>
      <mesh position={[0, 1.16, d / 2 + 0.017]}>
        <boxGeometry args={[1.25, 2.3, 0.04]} />
        <meshStandardMaterial color="#463d66" />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * w * 0.29, h * 0.65, d / 2 + 0.03]}>
          <boxGeometry args={[0.83, 0.96, 0.04]} />
          <meshStandardMaterial
            color={winGlow}
            emissive={winEmissive}
            emissiveIntensity={night && !blackout ? 0.45 : 0}
            metalness={0.1}
            roughness={0.25}
          />
        </mesh>
      ))}
      <mesh position={[0, h * 0.3, d / 2 + 0.05]}>
        <boxGeometry args={[Math.min(2.3, w * 0.7), 0.36, 0.13]} />
        <meshStandardMaterial
          color={index % 2 ? '#ffd28c' : '#8c6be8'}
          emissive={blackout ? '#000000' : index % 2 ? '#ffd28c' : '#8c6be8'}
          emissiveIntensity={blackout ? 0 : 0.35}
        />
      </mesh>
      <mesh receiveShadow position={[0, 0.16, 0]}>
        <boxGeometry args={[w + 1.5, 0.3, d + 1.5]} />
        <meshStandardMaterial color="#ddd3ed" />
      </mesh>
    </group>
  );
}

function HotspotMarker({ spot, active, onSelect }) {
  const ringRef = useRef();
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 420;
    canvas.height = 110;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = active ? 'rgba(120, 81, 222, 0.96)' : 'rgba(26, 20, 46, 0.88)';
    ctx.beginPath();
    ctx.roundRect(10, 10, 400, 90, 24);
    ctx.fill();
    ctx.strokeStyle = spot.color || '#a589ff';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${spot.icon} ${spot.name}`, 210, 55, 376);
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    return result;
  }, [spot.name, spot.icon, spot.color, active]);

  useEffect(() => () => texture.dispose(), [texture]);

  useFrame(({ clock }) => {
    if (ringRef.current) {
      const s = 1 + Math.sin(clock.elapsedTime * 3.5) * 0.08;
      ringRef.current.scale.set(s, s, 1);
    }
  });

  return (
    <group
      position={[spot.x, 0.05, spot.z]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(spot);
      }}
    >
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.15, 1.5, 32]} />
        <meshBasicMaterial color={active ? '#6cdeb5' : spot.color || '#a589ff'} side={THREE.DoubleSide} />
      </mesh>
      <sprite position={[0, 3.3, 0]} scale={[3.4, 0.88, 1]}>
        <spriteMaterial map={texture} transparent depthTest={false} depthWrite={false} />
      </sprite>
    </group>
  );
}

function TransitPod({ night, blackout }) {
  const ref = useRef();
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime * 0.28;
    const rx = 7.4;
    const rz = 7.4;
    const x = Math.cos(t) * rx;
    const z = Math.sin(t) * rz;
    const dx = -Math.sin(t) * rx;
    const dz = Math.cos(t) * rz;
    ref.current.position.set(x, 0, z);
    ref.current.rotation.y = Math.atan2(dx, dz);
  });

  return (
    <group ref={ref} position={[7.4, 0, 0]}>
      {/* Autonomous Farcaster Transit Pod body */}
      <mesh castShadow position={[0, 0.62, 0]}>
        <boxGeometry args={[1.25, 0.9, 2.3]} />
        <meshStandardMaterial color="#f4effe" roughness={0.35} />
      </mesh>
      {/* Farcaster Purple accent band */}
      <mesh position={[0, 0.52, 0]}>
        <boxGeometry args={[1.27, 0.22, 2.32]} />
        <meshStandardMaterial
          color="#8d64f7"
          emissive={blackout ? '#000000' : '#6c3fd1'}
          emissiveIntensity={blackout ? 0 : 0.35}
        />
      </mesh>
      {/* Panoramic glass canopy */}
      <mesh position={[0, 0.82, 0.08]}>
        <boxGeometry args={[1.28, 0.34, 1.9]} />
        <meshStandardMaterial
          color={night && !blackout ? '#9df0e2' : '#3a335c'}
          emissive={night && !blackout ? '#5dd3ba' : '#000000'}
          emissiveIntensity={night && !blackout ? 0.35 : 0}
        />
      </mesh>
      {/* Roof sensor dome */}
      <mesh position={[0, 1.12, 0]}>
        <boxGeometry args={[0.7, 0.1, 1.1]} />
        <meshStandardMaterial color="#6e56af" />
      </mesh>
      {/* LED Headlights */}
      {[-0.42, 0.42].map((hx) => (
        <mesh key={hx} position={[hx, 0.45, 1.16]}>
          <boxGeometry args={[0.22, 0.12, 0.04]} />
          <meshStandardMaterial
            color="#d8fff6"
            emissive="#5dd3ba"
            emissiveIntensity={blackout ? 0.2 : 0.9}
          />
        </mesh>
      ))}
      {/* 4 Wheels */}
      {[
        [-0.62, 0.22, -0.72],
        [0.62, 0.22, -0.72],
        [-0.62, 0.22, 0.72],
        [0.62, 0.22, 0.72]
      ].map(([wx, wy, wz], idx) => (
        <mesh key={idx} position={[wx, wy, wz]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.22, 0.22, 0.14, 12]} />
          <meshStandardMaterial color="#231d36" />
        </mesh>
      ))}
    </group>
  );
}

function FarcasterGltfBeacon({ blackout }) {
  const [gltfScene, setGltfScene] = useState(null);
  const beaconRef = useRef();

  useEffect(() => {
    let mounted = true;
    loadGltfModel('/models/farcaster-arch.gltf')
      .then((gltf) => {
        if (mounted && gltf?.scene) {
          setGltfScene(gltf.scene.clone(true));
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useFrame(({ clock }) => {
    if (!beaconRef.current) return;
    beaconRef.current.rotation.y = clock.elapsedTime * 1.1;
    beaconRef.current.position.y = 3.15 + Math.sin(clock.elapsedTime * 2.2) * 0.14;
  });

  if (!gltfScene) return null;
  return (
    <group ref={beaconRef} position={[0, 3.15, 0]} scale={[0.45, 0.45, 0.45]}>
      <primitive object={gltfScene} />
      {!blackout && <pointLight color="#a589ff" intensity={0.6} distance={6} />}
    </group>
  );
}

const DISTRICT_AMBIENT_CASTS = {
  farcaster: {
    author: { display_name: 'Maya Chen', username: 'maya.world' },
    text: 'Welcome to Simcaster Metropolis Plaza! Central fountain relay is synced. ✦'
  },
  dev: {
    author: { display_name: 'Alex Rivera', username: 'alexr.eth' },
    text: 'Shipping new Farcaster Frames & mini-apps at Foundry Studio today! 💻'
  },
  memes: {
    author: { display_name: 'Theo Rivers', username: 'theor' },
    text: 'Laser tag championship at Arcade HQ tonight! Who can beat 7-0? 🕹️'
  },
  base: {
    author: { display_name: 'Sarah Connor', username: 'sarahc.base' },
    text: 'Limited creator drops live at the Pop-Up Market. Collect on Base 🔵'
  }
};

const DISTRICT_KIOSKS = [
  { districtId: 'farcaster', pos: [0, 0, -5.5], rotY: 0 },
  { districtId: 'dev', pos: [6.8, 0, -7.5], rotY: -Math.PI * 0.65 },
  { districtId: 'memes', pos: [-5.5, 0, 7.5], rotY: Math.PI * 0.35 },
  { districtId: 'base', pos: [6.5, 0, 7.5], rotY: -Math.PI * 0.35 }
];

function DistrictKiosk({ district, cast, pos, rotY, onOpenChannel, blackout }) {
  const crystalRef = useRef();

  useFrame(({ clock }) => {
    if (crystalRef.current) {
      crystalRef.current.rotation.y = clock.elapsedTime * 1.8;
      crystalRef.current.position.y = 3.35 + Math.sin(clock.elapsedTime * 3) * 0.08;
    }
  });

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#1a142c');
    grad.addColorStop(1, '#0e0b19');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 256);

    // Glowing border
    ctx.strokeStyle = district.color;
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, 500, 244);

    // Header bar
    ctx.fillStyle = district.color;
    ctx.fillRect(10, 10, 492, 54);

    // Header text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${district.pill} · ${district.name.toUpperCase()}`, 24, 37);

    // Author line
    ctx.fillStyle = district.accent || '#a78bfa';
    ctx.font = 'bold 20px sans-serif';
    const author = cast?.author?.display_name ? `${cast.author.display_name} (@${cast.author.username})` : 'Simcaster Ambient Feed';
    ctx.fillText(author, 24, 95);

    // Cast text
    ctx.fillStyle = '#eee9f9';
    ctx.font = '500 18px sans-serif';
    const text = cast?.text || district.tagline || 'Explore the district and join the conversation.';

    // Multi-line wrap
    const words = text.split(' ');
    let line = '';
    let y = 132;
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      if (ctx.measureText(testLine).width > 464 && n > 0) {
        ctx.fillText(line, 24, y);
        line = words[n] + ' ';
        y += 28;
        if (y > 175) break;
      } else {
        line = testLine;
      }
    }
    if (y <= 175) ctx.fillText(line, 24, y);

    // CTA Footer
    ctx.fillStyle = '#a78bfa';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('CLICK TO OPEN IN CASTPHONE ↗', 24, 224);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [district, cast]);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <group
      position={pos}
      rotation={[0, rotY || 0, 0]}
      onClick={(e) => {
        e.stopPropagation();
        if (onOpenChannel) onOpenChannel(district.id);
      }}
    >
      {/* Base */}
      <mesh castShadow receiveShadow position={[0, 0.09, 0]}>
        <cylinderGeometry args={[0.7, 0.85, 0.18, 16]} />
        <meshStandardMaterial color="#2d2547" roughness={0.5} />
      </mesh>
      {/* Pillar */}
      <mesh castShadow position={[0, 1.14, 0]}>
        <boxGeometry args={[0.26, 2.1, 0.26]} />
        <meshStandardMaterial color="#1a142c" />
      </mesh>
      {/* Bezel frame */}
      <mesh castShadow position={[0, 2.4, 0]}>
        <boxGeometry args={[2.5, 1.45, 0.16]} />
        <meshStandardMaterial color="#120e20" roughness={0.4} />
      </mesh>
      {/* Screen */}
      <mesh position={[0, 2.4, 0.09]}>
        <planeGeometry args={[2.36, 1.32]} />
        <meshBasicMaterial map={texture} />
      </mesh>
      {/* Neon Top Accent */}
      <mesh position={[0, 3.14, 0]}>
        <boxGeometry args={[2.5, 0.06, 0.18]} />
        <meshStandardMaterial
          color={district.color}
          emissive={blackout ? '#000000' : district.color}
          emissiveIntensity={blackout ? 0 : 0.6}
        />
      </mesh>
      {/* Floating Hologram Diamond */}
      <mesh ref={crystalRef} position={[0, 3.35, 0]}>
        <octahedronGeometry args={[0.25, 0]} />
        <meshStandardMaterial
          color={district.color}
          emissive={blackout ? '#000000' : district.color}
          emissiveIntensity={blackout ? 0 : 0.8}
        />
      </mesh>
      {!blackout && <pointLight color={district.color} intensity={0.4} distance={4.5} position={[0, 2.4, 0.4]} />}
    </group>
  );
}

function Plaza({ hotspots, activeHotspotId, onSelectHotspot, onOpenChannel, timePhase, cityEvent }) {
  const night = timePhase === 'night';
  const blackout = cityEvent === 'blackout';
  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[45, 45]} />
        <meshStandardMaterial color={night ? '#597468' : '#a9ccb1'} />
      </mesh>
      <mesh receiveShadow position={[0, 0.025, 0]}>
        <boxGeometry args={[8, 0.05, 46]} />
        <meshStandardMaterial color="#e3d4c6" />
      </mesh>
      <mesh receiveShadow position={[0, 0.03, 0]}>
        <boxGeometry args={[46, 0.06, 8]} />
        <meshStandardMaterial color="#e3d4c6" />
      </mesh>
      <mesh receiveShadow position={[0, 0.08, 0]}>
        <cylinderGeometry args={[5.4, 5.4, 0.1, 32]} />
        <meshStandardMaterial color="#f2e5d7" />
      </mesh>
      <mesh receiveShadow position={[0, 0.17, 0]}>
        <cylinderGeometry args={[2.1, 2.3, 0.28, 32]} />
        <meshStandardMaterial color="#9b90d7" />
      </mesh>
      <mesh position={[0, 0.36, 0]}>
        <cylinderGeometry args={[1.76, 1.76, 0.16, 32]} />
        <meshStandardMaterial color="#8bd4e5" metalness={0.25} roughness={0.25} />
      </mesh>
      <mesh position={[0, 1.2, 0]} castShadow>
        <cylinderGeometry args={[0.17, 0.31, 1.7, 16]} />
        <meshStandardMaterial color="#ece2f9" />
      </mesh>
      <mesh position={[0, 2.07, 0]} castShadow>
        <icosahedronGeometry args={[0.55, 1]} />
        <meshStandardMaterial
          color="#d6a4f1"
          emissive={blackout ? '#ff4444' : '#9c62ff'}
          emissiveIntensity={blackout ? 0.6 : 0.25}
          metalness={0.25}
        />
      </mesh>
      <FarcasterGltfBeacon blackout={blackout} />
      <TransitPod night={night} blackout={blackout} />
      {DISTRICT_KIOSKS.map(({ districtId, pos, rotY }) => {
        const district = DISTRICTS[districtId];
        const cast = DISTRICT_AMBIENT_CASTS[districtId];
        if (!district) return null;
        return (
          <DistrictKiosk
            key={districtId}
            district={district}
            cast={cast}
            pos={pos}
            rotY={rotY}
            onOpenChannel={onOpenChannel}
            blackout={blackout}
          />
        );
      })}
      {BUILDINGS.map((item, i) => (
        <Building key={i} item={item} index={i} night={night} blackout={blackout} />
      ))}
      {TREES.map(([x, z], i) => (
        <Tree key={i} x={x} z={z} />
      ))}
      {hotspots.map((spot) => (
        <HotspotMarker
          key={spot.id}
          spot={spot}
          active={activeHotspotId === spot.id}
          onSelect={onSelectHotspot}
        />
      ))}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 8.5, 0, 0]}>
          <mesh castShadow position={[0, 0.53, 0]}>
            <boxGeometry args={[1.4, 0.15, 0.55]} />
            <meshStandardMaterial color="#aa78c5" />
          </mesh>
          <mesh position={[-0.56, 0.25, 0]}>
            <boxGeometry args={[0.14, 0.5, 0.55]} />
            <meshStandardMaterial color="#f0e0c7" />
          </mesh>
          <mesh position={[0.56, 0.25, 0]}>
            <boxGeometry args={[0.14, 0.5, 0.55]} />
            <meshStandardMaterial color="#f0e0c7" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function ArenaPowerup({ powerup }) {
  const ref = useRef();
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.y = clock.elapsedTime * 2.4;
      ref.current.position.y = 1.1 + Math.sin(clock.elapsedTime * 4) * 0.2;
    }
  });
  if (!powerup) return null;
  const isShield = powerup.type === 'shield';
  return (
    <group position={[powerup.x || 0, 0, powerup.z || 0]}>
      <mesh ref={ref} position={[0, 1.1, 0]}>
        <octahedronGeometry args={[0.55, 0]} />
        <meshStandardMaterial
          color={isShield ? '#5dd3ba' : '#ff898a'}
          emissive={isShield ? '#199c82' : '#d94560'}
          emissiveIntensity={0.75}
        />
      </mesh>
    </group>
  );
}

function Arena({ powerup, beams = [] }) {
  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[35, 35]} />
        <meshStandardMaterial color="#25203c" />
      </mesh>
      {Array.from({ length: 13 }, (_, i) => (
        <group key={i}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.013, i * 2 - 12]}>
            <planeGeometry args={[26, 0.024]} />
            <meshBasicMaterial color="#4c436c" />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[i * 2 - 12, 0.014, 0]}>
            <planeGeometry args={[0.024, 26]} />
            <meshBasicMaterial color="#4c436c" />
          </mesh>
        </group>
      ))}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * 13, 0.65, 0]}>
            <boxGeometry args={[0.2, 1.3, 27]} />
            <meshStandardMaterial color="#9b74f9" emissive="#7646d0" emissiveIntensity={0.55} />
          </mesh>
          <mesh position={[0, 0.65, s * 13]}>
            <boxGeometry args={[27, 1.3, 0.2]} />
            <meshStandardMaterial color="#65e2c3" emissive="#168e86" emissiveIntensity={0.55} />
          </mesh>
        </group>
      ))}
      {ARENA_BUNKERS.map(([bx, bz, w, d], i) => (
        <group key={i} position={[bx, 0, bz]}>
          <mesh castShadow receiveShadow position={[0, 0.95, 0]}>
            <boxGeometry args={[w, 1.9, d]} />
            <meshStandardMaterial color="#382d5e" roughness={0.6} />
          </mesh>
          <mesh position={[0, 1.92, 0]}>
            <boxGeometry args={[w + 0.08, 0.08, d + 0.08]} />
            <meshStandardMaterial
              color={i % 2 ? '#65e2c3' : '#ff898a'}
              emissive={i % 2 ? '#65e2c3' : '#ff898a'}
              emissiveIntensity={0.7}
            />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2, 2.07, 64]} />
        <meshBasicMaterial color="#dd90fa" side={THREE.DoubleSide} />
      </mesh>
      <ArenaPowerup powerup={powerup} />
      {beams.map((b) => {
        const dx = b.x2 - b.x1;
        const dz = b.z2 - b.z1;
        const len = Math.hypot(dx, dz);
        const cx = (b.x1 + b.x2) / 2;
        const cz = (b.z1 + b.z2) / 2;
        const angle = Math.atan2(dx, dz);
        return (
          <mesh key={b.id} position={[cx, 1.15, cz]} rotation={[0, angle, 0]}>
            <boxGeometry args={[0.09, 0.09, len]} />
            <meshBasicMaterial color={b.hit ? '#ff6198' : '#73bff2'} />
          </mesh>
        );
      })}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 12, 2.1, s * 12]}>
          <octahedronGeometry args={[0.7]} />
          <meshStandardMaterial color="#fbd185" emissive="#9c62ff" emissiveIntensity={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function Furniture({ item, index, onUse }) {
  const rotY = ((item.rot || 0) * Math.PI) / 180;
  return (
    <group
      position={[item.x, 0.02, item.z]}
      rotation={[0, rotY, 0]}
      onClick={(e) => {
        if (onUse) {
          e.stopPropagation();
          onUse(item);
        }
      }}
    >
      {item.type === 'plant' ? (
        <Tree x={0} z={0} />
      ) : item.type === 'rug' ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <planeGeometry args={[2.4, 1.6]} />
          <meshStandardMaterial color="#b898e8" />
        </mesh>
      ) : item.type === 'lamp' ? (
        <>
          <mesh position={[0, 0.7, 0]}>
            <cylinderGeometry args={[0.06, 0.14, 1.4]} />
            <meshStandardMaterial color="#e5ba88" />
          </mesh>
          <mesh position={[0, 1.48, 0]}>
            <coneGeometry args={[0.58, 0.8, 8]} />
            <meshStandardMaterial color="#ffe2a5" emissive="#e6b873" emissiveIntensity={0.35} />
          </mesh>
        </>
      ) : item.type === 'bed' ? (
        <group>
          <mesh castShadow position={[0, 0.32, 0]}>
            <boxGeometry args={[2.1, 0.55, 2.4]} />
            <meshStandardMaterial color="#f5ecf9" />
          </mesh>
          <mesh castShadow position={[0, 0.45, 0.25]}>
            <boxGeometry args={[1.95, 0.35, 1.7]} />
            <meshStandardMaterial color="#9871f1" />
          </mesh>
          <mesh castShadow position={[0, 0.75, -1.05]}>
            <boxGeometry args={[2.1, 0.9, 0.22]} />
            <meshStandardMaterial color="#5c4678" />
          </mesh>
        </group>
      ) : item.type === 'espresso_bar' ? (
        <group>
          <mesh castShadow position={[0, 0.55, 0]}>
            <boxGeometry args={[1.8, 1.1, 0.85]} />
            <meshStandardMaterial color="#70432e" />
          </mesh>
          <mesh castShadow position={[0, 1.25, 0]}>
            <boxGeometry args={[0.6, 0.45, 0.45]} />
            <meshStandardMaterial color="#eec35b" metalness={0.4} roughness={0.2} />
          </mesh>
        </group>
      ) : item.type === 'dj_booth' ? (
        <group>
          <mesh castShadow position={[0, 0.55, 0]}>
            <boxGeometry args={[2.1, 1.1, 0.9]} />
            <meshStandardMaterial color="#28203e" />
          </mesh>
          <mesh position={[0, 0.6, 0.46]}>
            <boxGeometry args={[1.8, 0.4, 0.05]} />
            <meshStandardMaterial color="#5dd3ba" emissive="#5dd3ba" emissiveIntensity={0.65} />
          </mesh>
        </group>
      ) : item.type === 'arcade_cabinet' ? (
        <group>
          <mesh castShadow position={[0, 1.0, 0]}>
            <boxGeometry args={[1.0, 2.0, 0.9]} />
            <meshStandardMaterial color="#3c2a63" />
          </mesh>
          <mesh position={[0, 1.35, 0.46]}>
            <boxGeometry args={[0.78, 0.65, 0.05]} />
            <meshStandardMaterial color="#ff898a" emissive="#ff898a" emissiveIntensity={0.55} />
          </mesh>
        </group>
      ) : item.type === 'work_desk' ? (
        <group>
          <mesh castShadow position={[0, 0.48, 0]}>
            <boxGeometry args={[1.7, 0.9, 0.85]} />
            <meshStandardMaterial color="#d9c6b0" />
          </mesh>
          <mesh position={[0, 1.15, -0.1]}>
            <boxGeometry args={[0.85, 0.5, 0.08]} />
            <meshStandardMaterial color="#73bff2" emissive="#73bff2" emissiveIntensity={0.4} />
          </mesh>
        </group>
      ) : item.type === 'neon_sign' ? (
        <mesh position={[0, 1.6, 0]}>
          <torusGeometry args={[0.65, 0.09, 12, 32]} />
          <meshStandardMaterial color="#ff77ac" emissive="#ff77ac" emissiveIntensity={0.85} />
        </mesh>
      ) : (
        <mesh castShadow position={[0, 0.4, 0]}>
          <boxGeometry args={[item.type === 'sofa' ? 2 : 1.15, 0.8, item.type === 'table' ? 1.35 : 0.8]} />
          <meshStandardMaterial color={index % 2 ? '#8e8bd4' : '#de9fba'} />
        </mesh>
      )}
    </group>
  );
}

function Home({ items = [], tier = 'studio', onUseFurniture }) {
  const size = tier === 'penthouse' ? 22 : tier === 'loft' ? 16 : 12;
  const half = size / 2;
  const floorCol = tier === 'penthouse' ? '#f6efe9' : tier === 'loft' ? '#e7d2bc' : '#f3e5d8';
  const wallCol = tier === 'penthouse' ? '#9871f1' : tier === 'loft' ? '#97c7bd' : '#c4aedd';
  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[44, 44]} />
        <meshStandardMaterial color="#c8c5de" />
      </mesh>
      <mesh receiveShadow position={[0, 0.04, 0]}>
        <boxGeometry args={[size, 0.08, size]} />
        <meshStandardMaterial color={floorCol} />
      </mesh>
      <mesh position={[-half, 2.1, 0]}>
        <boxGeometry args={[0.25, 4.2, size]} />
        <meshStandardMaterial color={wallCol} />
      </mesh>
      <mesh position={[0, 2.1, -half]}>
        <boxGeometry args={[size, 4.2, 0.25]} />
        <meshStandardMaterial color={wallCol} />
      </mesh>
      {tier === 'penthouse' && (
        <mesh position={[half - 3.2, 0.09, half - 3.2]}>
          <boxGeometry args={[4.5, 0.08, 4.5]} />
          <meshStandardMaterial color="#6cdbc4" metalness={0.35} roughness={0.15} />
        </mesh>
      )}
      {items.map((item, i) => (
        <Furniture key={i} item={item} index={i} onUse={onUseFurniture} />
      ))}
      <mesh position={[-2, 2.2, -half + 0.18]}>
        <boxGeometry args={[2.5, 1.9, 0.1]} />
        <meshStandardMaterial color="#a6cbde" />
      </mesh>
      <Tree x={half + 3} z={5} />
    </group>
  );
}

function AvatarName({ name, you, bubble, career, powerBadge }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 440;
    canvas.height = bubble ? 165 : 96;
    const ctx = canvas.getContext('2d');

    if (bubble) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
      ctx.beginPath();
      ctx.roundRect(14, 6, 412, 68, 20);
      ctx.fill();
      ctx.strokeStyle = '#8d64f7';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#251c3b';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(bubble.slice(0, 32), 220, 40, 390);
    }

    const yOffset = bubble ? 82 : 10;
    ctx.fillStyle = you ? 'rgba(88, 55, 145, 0.95)' : 'rgba(34, 26, 55, 0.88)';
    ctx.beginPath();
    ctx.roundRect(26, yOffset, 388, 74, 22);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const badge = powerBadge ? '🟣 ' : career === 'mogul' ? '👑 ' : you ? '★ ' : '';
    ctx.fillText(badge + name.slice(0, 18), 220, yOffset + 37, 360);

    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    return result;
  }, [name, you, bubble, career, powerBadge]);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <sprite position={[0, bubble ? 2.85 : 2.5, 0]} scale={[2.8, bubble ? 1.05 : 0.62, 1]}>
      <spriteMaterial map={texture} transparent depthTest={false} depthWrite={false} />
    </sprite>
  );
}

function Avatar({ p, you, emote, onSelect }) {
  const groupRef = useRef();
  const [moving, setMoving] = useState(false);
  const lastPos = useRef({ x: p.x, z: p.z });

  useFrame((_, dt) => {
    if (!groupRef.current) return;
    groupRef.current.position.x = THREE.MathUtils.lerp(groupRef.current.position.x, p.x, Math.min(1, dt * 12));
    groupRef.current.position.z = THREE.MathUtils.lerp(groupRef.current.position.z, p.z, Math.min(1, dt * 12));
    groupRef.current.rotation.y = p.heading || 0;
    const speed = Math.hypot(p.x - lastPos.current.x, p.z - lastPos.current.z);
    lastPos.current = { x: p.x, z: p.z };
    const isNowMoving = speed > 0.005 || Math.hypot(groupRef.current.position.x - p.x, groupRef.current.position.z - p.z) > 0.08;
    if (isNowMoving !== moving) setMoving(isNowMoving);
  });

  return (
    <group
      ref={groupRef}
      position={[p.x, 0, p.z]}
      rotation={[0, p.heading || 0, 0]}
      onClick={(e) => {
        e.stopPropagation();
        if (!you) onSelect(p);
      }}
    >
      <AvatarName name={p.name || 'Player'} you={you} bubble={p.bubble} career={p.career} powerBadge={!!p.powerBadge} />
      <AvatarFigure
        avatar={p.avatar}
        emote={emote}
        moving={moving}
        shielded={!!p.shielded}
        dashing={!!p.dashing}
      />
      {p.powerBadge && (
        <group position={[0, 2.18, 0]}>
          <mesh rotation={[-Math.PI / 6, 0, 0]}>
            <torusGeometry args={[0.26, 0.04, 12, 32]} />
            <meshStandardMaterial color="#8a63d2" emissive="#8a63d2" emissiveIntensity={0.85} roughness={0.2} metalness={0.7} />
          </mesh>
          <mesh position={[0, 0.16, 0]}>
            <octahedronGeometry args={[0.09, 0]} />
            <meshStandardMaterial color="#c084fc" emissive="#c084fc" emissiveIntensity={0.9} />
          </mesh>
        </group>
      )}
      {you && (
        <mesh position={[0, 2.3, 0]}>
          <octahedronGeometry args={[0.2]} />
          <meshStandardMaterial color="#f9d875" emissive="#f9d875" emissiveIntensity={0.5} />
        </mesh>
      )}
      {emote === 'heart' && (
        <mesh position={[0, 2.3, 0]}>
          <sphereGeometry args={[0.2, 10, 10]} />
          <meshStandardMaterial color="#ff77ac" emissive="#ff77ac" emissiveIntensity={0.6} />
        </mesh>
      )}
    </group>
  );
}

function CameraRig({ players, selfId, mode = 'orbit' }) {
  const canvas = useThree((s) => s.gl.domElement);
  const orbit = useRef({ theta: 0.73, phi: 0.69, distance: 26, dragging: false, x: 0, y: 0, pointerId: null });
  const goal = useMemo(() => new THREE.Vector3(), []);
  const lookAt = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    const state = orbit.current;
    const onDown = (e) => {
      if (e.button !== 0 && e.button !== 2) return;
      state.dragging = true;
      state.x = e.clientX;
      state.y = e.clientY;
      state.pointerId = e.pointerId;
      canvas.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e) => {
      if (!state.dragging || state.pointerId !== e.pointerId) return;
      const dx = e.clientX - state.x;
      const dy = e.clientY - state.y;
      state.theta -= dx * 0.007;
      state.phi = THREE.MathUtils.clamp(state.phi + dy * 0.006, 0.25, 1.35);
      state.x = e.clientX;
      state.y = e.clientY;
    };
    const onUp = (e) => {
      if (e.pointerId !== state.pointerId) return;
      state.dragging = false;
      state.pointerId = null;
      if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    };
    const onWheel = (e) => {
      e.preventDefault();
      state.distance = THREE.MathUtils.clamp(state.distance + Math.sign(e.deltaY) * 2.1, 8, 44);
    };
    const onContext = (e) => e.preventDefault();
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContext);
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContext);
    };
  }, [canvas]);

  useFrame(({ camera }) => {
    const me = players.find((p) => p.id === selfId);
    const x = me?.x || 0;
    const z = me?.z || 0;
    const heading = me?.heading || 0;
    const o = orbit.current;

    if (mode === 'eyes') {
      goal.set(x + Math.sin(heading) * 0.4, 1.72, z + Math.cos(heading) * 0.4);
      lookAt.set(x + Math.sin(heading) * 8, 1.55, z + Math.cos(heading) * 8);
      camera.position.lerp(goal, 0.25);
      camera.lookAt(lookAt);
    } else if (mode === 'street') {
      goal.set(x - Math.sin(heading) * 6.5, 3.6, z - Math.cos(heading) * 6.5);
      lookAt.set(x + Math.sin(heading) * 3, 1.4, z + Math.cos(heading) * 3);
      camera.position.lerp(goal, 0.12);
      camera.lookAt(lookAt);
    } else if (mode === 'top') {
      goal.set(x, 34, z + 4);
      lookAt.set(x, 0, z);
      camera.position.lerp(goal, 0.12);
      camera.lookAt(lookAt);
    } else {
      goal.set(
        x + Math.sin(o.theta) * Math.cos(o.phi) * o.distance,
        1.1 + Math.sin(o.phi) * o.distance,
        z + Math.cos(o.theta) * Math.cos(o.phi) * o.distance
      );
      lookAt.set(x, 1, z);
      camera.position.lerp(goal, 0.09);
      camera.lookAt(lookAt);
    }
  });
  return null;
}

function MinimapRadar({ kind, me, players, npcs, hotspots, powerup, activeDistrict, onSelectHotspot }) {
  const bound = kind === 'arena' ? 14 : kind === 'home' ? 10 : 20;
  const toPct = (val) => Math.max(6, Math.min(94, 50 + (val / bound) * 42));

  return (
    <div className="minimap-radar" aria-label="City radar minimap">
      <div className="minimap-ring" />
      <div className="minimap-cross-h" />
      <div className="minimap-cross-v" />
      {kind === 'plaza' &&
        hotspots.map((h) => (
          <button
            key={h.id}
            type="button"
            className="minimap-hotspot"
            style={{ left: `${toPct(h.x)}%`, top: `${toPct(h.z)}%`, borderColor: h.color || '#a589ff' }}
            title={h.name}
            onClick={() => onSelectHotspot && onSelectHotspot(h)}
          >
            {h.icon}
          </button>
        ))}
      {kind === 'arena' && powerup && (
        <span
          className="minimap-dot minimap-powerup"
          style={{ left: `${toPct(powerup.x || 0)}%`, top: `${toPct(powerup.z || 0)}%` }}
          title="Power-up"
        />
      )}
      {(npcs || []).map((n) => (
        <span
          key={n.id}
          className="minimap-dot minimap-npc"
          style={{ left: `${toPct(n.x)}%`, top: `${toPct(n.z)}%` }}
          title={n.name}
        />
      ))}
      {players
        .filter((p) => p.id !== me?.id)
        .map((p) => (
          <span
            key={p.id}
            className="minimap-dot minimap-other"
            style={{ left: `${toPct(p.x)}%`, top: `${toPct(p.z)}%` }}
            title={p.name}
          />
        ))}
      {me && (
        <span
          className="minimap-dot minimap-me"
          style={{
            left: `${toPct(me.x)}%`,
            top: `${toPct(me.z)}%`,
            transform: `translate(-50%, -50%) rotate(${-(me.heading || 0)}rad)`
          }}
          title="You"
        />
      )}
      <span
        className="minimap-label"
        style={kind === 'plaza' && activeDistrict ? { color: activeDistrict.color } : undefined}
      >
        <Compass size={11} /> {kind === 'plaza' && activeDistrict ? activeDistrict.pill.toUpperCase() : kind.toUpperCase()}
      </span>
    </div>
  );
}

function VirtualJoystick({ touchRef }) {
  const baseRef = useRef(null);
  const [knob, setKnob] = useState({ x: 0, y: 0, active: false });

  const updateStick = (clientX, clientY) => {
    const rect = baseRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxR = rect.width * 0.36;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR) {
      dx = (dx / dist) * maxR;
      dy = (dy / dist) * maxR;
    }
    setKnob({ x: dx, y: dy, active: true });
    touchRef.current = {
      dx: +(dx / maxR).toFixed(2),
      dz: +(dy / maxR).toFixed(2)
    };
  };

  const resetStick = () => {
    setKnob({ x: 0, y: 0, active: false });
    touchRef.current = { dx: 0, dz: 0 };
  };

  return (
    <div
      ref={baseRef}
      className={'virtual-joystick ' + (knob.active ? 'is-active' : '')}
      aria-label="360 degree touch joystick"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        updateStick(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (!knob.active) return;
        updateStick(e.clientX, e.clientY);
      }}
      onPointerUp={resetStick}
      onPointerCancel={resetStick}
    >
      <div
        className="joystick-knob"
        style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
      />
    </div>
  );
}

// --- Milestone 2: 3D Floating Coin Animation & Particle FX ---

function FloatingCoin({ offsetAngle, radius, initialY, rotSpeed, progress, color }) {
  const meshRef = useRef();

  const easeOut = 1 - Math.pow(1 - progress, 2);
  const currentY = initialY + easeOut * 1.85;

  const currentRadius = radius * (1 + progress * 0.75);
  const currentX = Math.cos(offsetAngle) * currentRadius;
  const currentZ = Math.sin(offsetAngle) * currentRadius;

  const opacity = progress < 0.65 ? 1.0 : Math.max(0, 1.0 - (progress - 0.65) / 0.35);

  const scale =
    progress < 0.1
      ? Math.max(0.1, progress / 0.1)
      : progress > 0.8
        ? Math.max(0.2, ((1.0 - progress) / 0.2) * 0.4 + 0.6)
        : 1.0;

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    meshRef.current.rotation.x += delta * rotSpeed.x;
    meshRef.current.rotation.y += delta * rotSpeed.y;
    meshRef.current.rotation.z += delta * rotSpeed.z;
  });

  return (
    <group position={[currentX, currentY, currentZ]} scale={scale}>
      <mesh ref={meshRef}>
        <cylinderGeometry args={[0.18, 0.18, 0.04, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.3}
          metalness={0.88}
          roughness={0.18}
          transparent
          opacity={opacity}
        />
      </mesh>
    </group>
  );
}

function TipValueBillboard({ amount, currency, progress }) {
  const texture = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 360;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = 'rgba(24, 18, 38, 0.88)';
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 4;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(8, 8, 344, 80, 40);
    } else {
      ctx.rect(8, 8, 344, 80);
    }
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const currTag = (currency || 'degen').toUpperCase();
    ctx.fillText(`+${amount} ₡${currTag}`, 180, 48);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [amount, currency]);

  useEffect(() => () => texture?.dispose(), [texture]);

  if (!texture) return null;

  const y = 2.4 + progress * 1.5;
  const opacity = progress < 0.65 ? 1.0 : Math.max(0, 1.0 - (progress - 0.65) / 0.35);

  return (
    <sprite position={[0, y, 0]} scale={[2.2, 0.6, 1]}>
      <spriteMaterial map={texture} transparent opacity={opacity} depthTest={false} depthWrite={false} />
    </sprite>
  );
}

function TipBurstInstance({ burst, onComplete }) {
  const [progress, setProgress] = useState(0);
  const startTime = useRef(burst.createdAt || Date.now());
  const DURATION_MS = 1800;

  const coins = useMemo(() => {
    const count = burst.amount >= 100 ? 12 : burst.amount >= 50 ? 9 : 6;
    const arr = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      arr.push({
        id: i,
        offsetAngle: angle,
        radius: 0.18 + Math.random() * 0.35,
        initialY: 1.9 + Math.random() * 0.3,
        rotSpeed: {
          x: 4 + Math.random() * 6,
          y: 7 + Math.random() * 8,
          z: 2 + Math.random() * 4
        }
      });
    }
    return arr;
  }, [burst.amount]);

  const coinColor = useMemo(() => {
    const c = (burst.currency || 'degen').toLowerCase();
    if (c === 'moxie') return '#10b981';
    if (c === 'warps') return '#8a63d2';
    if (c === 'creds') return '#f59e0b';
    return '#ffd700'; // Degen gold
  }, [burst.currency]);

  useFrame(() => {
    const elapsed = Date.now() - startTime.current;
    const p = Math.min(1, elapsed / DURATION_MS);
    setProgress(p);
    if (p >= 1 && onComplete) {
      onComplete(burst.id);
    }
  });

  if (progress >= 1) return null;

  return (
    <group position={[burst.x, 0, burst.z]}>
      {coins.map((c) => (
        <FloatingCoin
          key={c.id}
          offsetAngle={c.offsetAngle}
          radius={c.radius}
          initialY={c.initialY}
          rotSpeed={c.rotSpeed}
          progress={progress}
          color={coinColor}
        />
      ))}
      <TipValueBillboard amount={burst.amount} currency={burst.currency} progress={progress} />
    </group>
  );
}

export function TipBurstFX({ bursts = [], onComplete }) {
  if (!bursts || bursts.length === 0) return null;
  return (
    <group name="tip-burst-fx">
      {bursts.map((b) => (
        <TipBurstInstance key={b.id} burst={b} onComplete={onComplete} />
      ))}
    </group>
  );
}

function Scene({
  players,
  npcs = [],
  selfId,
  kind,
  homeItems,
  homeTier,
  effects,
  tipBursts = [],
  onTipBurstComplete,
  onSelect,
  hotspots,
  activeHotspotId,
  onSelectHotspot,
  onOpenChannel,
  timePhase,
  cityEvent,
  powerup,
  beams,
  cameraMode,
  onUseFurniture
}) {
  const isNight = timePhase === 'night' || cityEvent === 'blackout';
  const isSunset = timePhase === 'sunset';
  const bg =
    kind === 'arena'
      ? '#2b2345'
      : isNight
        ? '#1f1b38'
        : isSunset
          ? '#e8b4b8'
          : '#b2b9e5';
  const ambient =
    kind === 'arena' ? 1.7 : cityEvent === 'blackout' ? 0.85 : isNight ? 1.2 : 1.9;

  return (
    <>
      <color attach="background" args={[bg]} />
      <fog attach="fog" args={[bg, 24, 66]} />
      <ambientLight intensity={ambient} />
      <directionalLight
        position={[11, 22, 15]}
        intensity={isNight ? 1.15 : 2.1}
        color={isSunset ? '#ffd1a6' : '#ffffff'}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
      />
      {kind === 'arena' ? (
        <Arena powerup={powerup} beams={beams} />
      ) : kind === 'home' ? (
        <Home items={homeItems} tier={homeTier} onUseFurniture={onUseFurniture} />
      ) : (
        <Plaza
          hotspots={hotspots}
          activeHotspotId={activeHotspotId}
          onSelectHotspot={onSelectHotspot}
          onOpenChannel={onOpenChannel}
          timePhase={timePhase}
          cityEvent={cityEvent}
        />
      )}
      {players.map((p) => (
        <Avatar key={p.id} p={p} you={p.id === selfId} emote={effects[p.id]} onSelect={onSelect} />
      ))}
      {npcs.map((n) => (
        <Avatar key={n.id} p={n} you={false} emote={null} onSelect={onSelect} />
      ))}
      <TipBurstFX bursts={tipBursts} onComplete={onTipBurstComplete} />
      <CameraRig players={players} selfId={selfId} mode={cameraMode} />
    </>
  );
}

export default function WorldView({
  user,
  onUserUpdate,
  kind = 'plaza',
  ownerFid = null,
  homeItems = [],
  homeTier = 'studio',
  onBack,
  onArcade,
  onVisitHome,
  onGoHome
}) {
  const [webglSupported] = useState(() => {
    try {
      const probe = document.createElement('canvas');
      const context = probe.getContext('webgl2', { failIfMajorPerformanceCaveat: false });
      return Boolean(context);
    } catch {
      return false;
    }
  });
  const [players, setPlayers] = useState([]);
  const [npcs, setNpcs] = useState([]);
  const [liveHomeItems, setLiveHomeItems] = useState(homeItems);
  const [liveHomeTier, setLiveHomeTier] = useState(homeTier);
  useEffect(() => setLiveHomeItems(homeItems), [homeItems]);
  useEffect(() => setLiveHomeTier(homeTier), [homeTier]);

  const playersRef = useRef([]);
  const [selfId, setSelfId] = useState('');
  const [room, setRoom] = useState('');
  const [state, setState] = useState('Connecting to world…');
  const [messages, setMessages] = useState([]);
  const [effects, setEffects] = useState({});
  const [selected, setSelected] = useState(null);
  const [selectedHotspot, setSelectedHotspot] = useState(null);
  const [hotspots, setHotspots] = useState(DEFAULT_HOTSPOTS);
  const [timePhase, setTimePhase] = useState('day');
  const [cityEvent, setCityEvent] = useState(null);
  const [powerup, setPowerup] = useState(null);
  const [beams, setBeams] = useState([]);
  const [cameraMode, setCameraMode] = useState('orbit');
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phoneApp, setPhoneApp] = useState('jobs');
  const [radioOn, setRadioOn] = useState(soundEngine.radioPlaying);
  const [banner, setBanner] = useState('');
  const [tipBursts, setTipBursts] = useState([]);
  const [showTipMenu, setShowTipMenu] = useState(false);
  const [tipBusy, setTipBusy] = useState(false);
  const [pendingTipAmount, setPendingTipAmount] = useState(null);

  useEffect(() => {
    setShowTipMenu(false);
    setTipBusy(false);
    setPendingTipAmount(null);
  }, [selected?.id]);

  const triggerTipFx = (tipData) => {
    if (!tipData) return;
    if (soundEngine.playTipCoin) soundEngine.playTipCoin(tipData.amount || 50);
    else soundEngine.playCash();

    const targetPlayer = (playersRef.current || []).find(
      (p) => Number(p.fid) === Number(tipData.toFid) || p.id === tipData.targetId || p.name === tipData.toName
    );
    const mePlayer = (playersRef.current || []).find((p) => p.id === selfId);
    const targetX = targetPlayer ? targetPlayer.x : (mePlayer?.x ?? 0);
    const targetZ = targetPlayer ? targetPlayer.z : (mePlayer?.z ?? 0);

    const burstId = 'tip_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    setTipBursts((prev) => [
      ...prev.slice(-9),
      {
        id: burstId,
        x: targetX,
        z: targetZ,
        amount: tipData.amount || 50,
        currency: tipData.currency || 'degen',
        createdAt: Date.now()
      }
    ]);
  };

  useEffect(() => {
    const onLocalTip = (e) => {
      if (e.detail) triggerTipFx(e.detail);
    };
    window.addEventListener('simcaster:tip', onLocalTip);
    return () => window.removeEventListener('simcaster:tip', onLocalTip);
  }, [selfId]);

  useEffect(() => {
    return soundEngine.subscribe((s) => setRadioOn(s.radioPlaying));
  }, []);
  const [text, setText] = useState('');
  const [seconds, setSeconds] = useState(null);
  const [end, setEnd] = useState(null);
  const [showChat, setShowChat] = useState(() => typeof window !== 'undefined' && window.innerWidth > 1100);
  const ws = useRef(null);
  const keys = useRef(new Set());
  const touch = useRef({ dx: 0, dz: 0 });
  const scroll = useRef(null);

  const showBanner = (msg) => {
    setBanner(msg);
    setTimeout(() => setBanner((prev) => (prev === msg ? '' : prev)), 4500);
  };

  async function handleTipAvatar(amount) {
    if (!selected || tipBusy) return;
    const target = [...players, ...npcs].find((p) => p.id === selected.id);
    if (!target) return;
    try {
      setTipBusy(true);
      setPendingTipAmount(amount);

      const response = await fetch('/api/tips', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toFid: target.fid,
          amount,
          currency: 'degen'
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send tip');
      }

      if (soundEngine.playTipCoin) soundEngine.playTipCoin(amount);
      else soundEngine.playCash();

      triggerTipFx({
        toFid: target.fid,
        toName: target.name,
        targetId: target.id,
        amount,
        currency: 'degen'
      });

      if (onUserUpdate && data.tip) {
        onUserUpdate((prev) => ({
          ...prev,
          creds: data.tip.fromBalance ?? ((prev?.creds ?? 250) - amount),
          needs: {
            ...(prev?.needs || {}),
            clout: Math.min(100, (prev?.needs?.clout || 0) + (data.tip.cloutAwarded || 5)),
            vibe: Math.min(100, (prev?.needs?.vibe || 0) + (data.tip.vibeAwarded || 5))
          }
        }));
      }

      showBanner(`🪙 Tipped ${target.name} ${amount} ₡DEGEN! (+${data.tip?.cloutAwarded || 5} Clout, +${data.tip?.vibeAwarded || 5} Vibe)`);
      setMessages((prev) => [
        ...prev.slice(-36),
        {
          type: 'notice',
          text: `🪙 You tipped ${target.name} ${amount} ₡DEGEN`
        }
      ]);

      setShowTipMenu(false);
      setSelected(null);
    } catch (err) {
      showBanner(`⚠️ ${err.message}`);
    } finally {
      setTipBusy(false);
      setPendingTipAmount(null);
    }
  }

  useEffect(() => {
    let active = true;
    let socket = null;
    let retryTimer = null;
    let retryCount = 0;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const invite = new URLSearchParams(location.search).get('join');
    const query =
      'room=' +
      encodeURIComponent(kind) +
      (kind !== 'home' && invite?.startsWith(kind + ':') ? '&instance=' + encodeURIComponent(invite) : '');
    const url =
      proto + '//' + location.host + '/socket?' + query + (kind === 'home' ? '&owner=' + encodeURIComponent(ownerFid || user.fid) : '');

    const retryConnection = () => {
      if (!active) return;
      if (retryCount >= 4) {
        setState('Connection unavailable. Return to the menu and try again.');
        return;
      }
      const delay = Math.min(1000 * 2 ** retryCount++, 8000);
      setState('Reconnecting…');
      retryTimer = setTimeout(connect, delay);
    };

    const connect = async () => {
      if (!active) return;
      setState(retryCount ? 'Reconnecting…' : 'Connecting to world…');
      try {
        const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' });
        if (!response.ok) throw new Error('Session probe unavailable');
        const session = await response.json();
        if (!session.user || Number(session.user.fid) !== Number(user.fid)) {
          setState('Your session expired. Sign in again.');
          window.dispatchEvent(new Event('simcaster:session-expired'));
          return;
        }
      } catch {
        retryConnection();
        return;
      }
      if (!active) return;
      try {
        socket = new WebSocket(url);
      } catch {
        retryConnection();
        return;
      }
      ws.current = socket;
      socket.onopen = () => {
        retryCount = 0;
        if (active) setState('Connected');
      };
      socket.onerror = () => {
        if (active) setState('Connection interrupted');
      };
      socket.onclose = (event) => {
        if (!active) return;
        playersRef.current = [];
        setPlayers([]);
        setSelfId('');
        ws.current = null;
        if (event.code === 1008) {
          setState('Room session closed. Return and re-enter.');
          return;
        }
        retryConnection();
      };
      socket.onmessage = (e) => {
        if (!active) return;
        let packet;
        try {
          packet = JSON.parse(e.data);
        } catch {
          return;
        }
        const d = packet.data;
        if (packet.event === 'welcome') {
          setSelfId(d.id);
          setRoom(d.room);
          if (Array.isArray(d.hotspots) && d.hotspots.length) setHotspots(d.hotspots);
        }
        if (packet.event === 'snapshot') {
          playersRef.current = d.players;
          setPlayers(d.players);
          setNpcs(d.npcs || []);
          setSeconds(d.secondsLeft);
          if (d.timePhase) setTimePhase(d.timePhase);
          setCityEvent(d.cityEvent || null);
          setPowerup(d.powerup || null);
        }
        if (packet.event === 'home-updated' && kind === 'home') {
          setLiveHomeItems(d.items || []);
          if (d.tier) setLiveHomeTier(d.tier);
        }
        if (packet.event === 'activity') {
          if (d.ok) {
            if (d.promoted) soundEngine.playPromotion();
            else if (typeof d.deltaCreds === 'number' && d.deltaCreds > 0) soundEngine.playCash();
            else soundEngine.playClick();
            const delta =
              typeof d.deltaCreds === 'number'
                ? d.deltaCreds >= 0
                  ? ` (+₡${d.deltaCreds})`
                  : ` (-₡${Math.abs(d.deltaCreds)})`
                : '';
            showBanner(`${d.hotspot ? d.hotspot + ': ' : ''}${d.action}${delta}${d.promoted ? ` · 🎉 Promoted to ${d.promoted}!` : ''}`);
            if (onUserUpdate && (d.creds !== undefined || d.needs)) {
              onUserUpdate({
                ...user,
                creds: d.creds ?? user.creds,
                needs: d.needs ?? user.needs,
                career: d.career ?? user.career,
                quests: d.quests ?? user.quests
              });
            }
          } else if (d.error) {
            showBanner(`⚠️ ${d.error}`);
          }
        }
        if (packet.event === 'dash') {
          soundEngine.playDash();
        }
        if (packet.event === 'shot') {
          if (d.hit) soundEngine.playHit();
          else soundEngine.playLaser();
          if (d.from) {
            const x1 = d.from.x;
            const z1 = d.from.z;
            const x2 = d.to ? d.to.x : x1 + Math.sin(d.from.heading || 0) * 10;
            const z2 = d.to ? d.to.z : z1 + Math.cos(d.from.heading || 0) * 10;
            const beamId = Math.random().toString(36);
            setBeams((prev) => [...prev.slice(-8), { id: beamId, x1, z1, x2, z2, hit: d.hit }]);
            setTimeout(() => {
              if (active) setBeams((prev) => prev.filter((b) => b.id !== beamId));
            }, 220);
          }
        }
        if (packet.event === 'chat') setMessages((prev) => [...prev.slice(-36), { ...d, type: 'chat' }]);
        if (packet.event === 'emote') {
          setEffects((prev) => ({ ...prev, [d.id]: d.name }));
          setTimeout(() => {
            if (active) {
              setEffects((prev) => {
                const next = { ...prev };
                delete next[d.id];
                return next;
              });
            }
          }, 1800);
          setMessages((prev) => [
            ...prev.slice(-36),
            {
              type: 'notice',
              text:
                (playersRef.current.find((p) => p.id === d.id)?.name || 'Someone') +
                ' ' +
                (d.name === 'dance' ? 'is dancing 💃' : d.name === 'heart' ? 'sent love 💜' : 'waved 👋')
            }
          ]);
        }
        if (packet.event === 'notice') setMessages((prev) => [...prev.slice(-36), { ...d, type: 'notice' }]);
        if (packet.event === 'tip' || packet.type === 'tip') {
          const tipInfo = packet.data || packet;
          triggerTipFx(tipInfo);
          const isRecipient = Number(tipInfo.toFid) === Number(user?.fid);
          const isSender = Number(tipInfo.fromFid) === Number(user?.fid);
          if (isRecipient) {
            showBanner(`🎉 ${tipInfo.fromName || 'Someone'} tipped you ${tipInfo.amount} ₡${(tipInfo.currency || 'degen').toUpperCase()}! (+5 Clout, +5 Vibe)`);
            if (onUserUpdate) {
              onUserUpdate((prev) => ({
                ...prev,
                creds: tipInfo.toBalance !== undefined ? tipInfo.toBalance : ((prev?.creds ?? 250) + Number(tipInfo.amount)),
                needs: {
                  ...(prev?.needs || {}),
                  clout: Math.min(100, (prev?.needs?.clout || 0) + 5),
                  vibe: Math.min(100, (prev?.needs?.vibe || 0) + 5)
                }
              }));
            }
          } else if (!isSender) {
            showBanner(`🪙 ${tipInfo.fromName || 'Someone'} tipped ${tipInfo.toName || 'someone'} ${tipInfo.amount} ₡${(tipInfo.currency || 'degen').toUpperCase()}`);
          }
          setMessages((prev) => [
            ...prev.slice(-36),
            {
              type: 'notice',
              text: `🪙 ${tipInfo.fromName || 'Someone'} tipped ${tipInfo.toName || 'someone'} ${tipInfo.amount} ₡${(tipInfo.currency || 'degen').toUpperCase()}`
            }
          ]);
        }
        if (packet.event === 'match-end') {
          soundEngine.playPromotion();
          setEnd(d);
          setTimeout(() => {
            if (active) setEnd(null);
          }, 10000);
        }
        if (packet.event === 'error') setState(d.message);
      };
    };

    connect();

    const onDown = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright', ' '].includes(k)) e.preventDefault();
      keys.current.add(k);
      if (k === 'p') {
        soundEngine.playClick();
        setPhoneOpen((prev) => !prev);
      }
      if (e.code === 'Space' && kind === 'arena' && ws.current?.readyState === 1) {
        ws.current.send(JSON.stringify({ event: 'shoot' }));
      }
      if (e.key === 'Shift' && ws.current?.readyState === 1) {
        ws.current.send(JSON.stringify({ event: 'dash' }));
      }
    };
    const onUp = (e) => keys.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);

    const interval = setInterval(() => {
      if (ws.current?.readyState !== 1) return;
      const down = keys.current;
      const dx = Number(down.has('d') || down.has('arrowright')) - Number(down.has('a') || down.has('arrowleft')) + touch.current.dx;
      const dz = Number(down.has('s') || down.has('arrowdown')) - Number(down.has('w') || down.has('arrowup')) + touch.current.dz;
      ws.current.send(JSON.stringify({ event: 'move', data: { dx: Math.max(-1, Math.min(1, dx)), dz: Math.max(-1, Math.min(1, dz)) } }));
    }, 90);

    return () => {
      active = false;
      clearTimeout(retryTimer);
      clearInterval(interval);
      socket?.close();
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      keys.current.clear();
    };
  }, [kind, ownerFid]);

  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [messages]);

  const me = players.find((p) => p.id === selfId);
  const myCreds = me?.creds ?? user?.creds ?? 250;
  const myNeeds = me?.needs || user?.needs || { energy: 85, hunger: 80, vibe: 75, clout: 10 };

  const activeDistrict = useMemo(() => {
    if (kind !== 'plaza' || !me || typeof me.x !== 'number' || typeof me.z !== 'number') {
      return DISTRICTS.farcaster;
    }
    return getPlazaDistrict(me.x, me.z);
  }, [kind, me?.x, me?.z]);

  const [zoneBanner, setZoneBanner] = useState(null);
  const lastZoneChangeTime = useRef(0);
  const lastReportedDistrict = useRef(null);

  useEffect(() => {
    if (kind !== 'plaza' || !me || typeof me.x !== 'number' || typeof me.z !== 'number') return;
    const currentDistrict = getPlazaDistrict(me.x, me.z);

    if (lastReportedDistrict.current === null) {
      lastReportedDistrict.current = currentDistrict.id;
      return;
    }

    if (currentDistrict.id !== lastReportedDistrict.current) {
      const now = Date.now();
      lastReportedDistrict.current = currentDistrict.id;
      if (now - lastZoneChangeTime.current > 1800) {
        lastZoneChangeTime.current = now;
        setZoneBanner(currentDistrict);
        soundEngine.playTone({ freq: 520, endFreq: 780, duration: 0.12, gain: 0.08 });
        const timer = setTimeout(() => {
          setZoneBanner((prev) => (prev?.id === currentDistrict.id ? null : prev));
        }, 3200);
        return () => clearTimeout(timer);
      }
    }
  }, [kind, me?.x, me?.z]);

  function handleOpenKioskChannel(districtId) {
    soundEngine.playClick();
    setPhoneApp('feed');
    setPhoneOpen(true);
  }

  const nearestHotspot = useMemo(() => {
    if (kind !== 'plaza' || !me) return null;
    let best = null;
    let bestDist = Infinity;
    for (const h of hotspots) {
      const dist = Math.hypot(me.x - h.x, me.z - h.z);
      if (dist < 4.5 && dist < bestDist) {
        best = h;
        bestDist = dist;
      }
    }
    return best;
  }, [kind, me?.x, me?.z, hotspots]);

  const activeHotspot = selectedHotspot || nearestHotspot;
  const hotspotDist = me && activeHotspot ? Math.hypot(me.x - activeHotspot.x, me.z - activeHotspot.z) : Infinity;

  const activeTarget = selected ? [...players, ...npcs].find((p) => p.id === selected.id) : null;
  const distanceToTarget = me && activeTarget ? Math.hypot(me.x - activeTarget.x, me.z - activeTarget.z) : Infinity;
  const closeEnough = distanceToTarget <= 5;

  const send = (event, data = {}) => {
    if (ws.current?.readyState === 1) ws.current.send(JSON.stringify({ event, data }));
  };

  function cycleCamera() {
    soundEngine.playClick();
    const order = ['orbit', 'street', 'eyes', 'top'];
    setCameraMode((prev) => order[(order.indexOf(prev) + 1) % order.length]);
  }

  function shareMatch() {
    if (!end) return;
    const myResult = end.scores?.find((p) => p.id === selfId);
    const text =
      end.winner === selfId
        ? 'I won a Laser Tag match on Simcaster 🎮 — ' + (myResult?.score || 0) + ' points. Come join the social gaming world!'
        : 'Just played a Laser Tag match on Simcaster 🎮 — ' + (myResult?.score || 0) + ' points. Meet me in the arcade!';
    window.open('https://warpcast.com/~/compose?text=' + encodeURIComponent(text), '_blank', 'noopener,noreferrer');
  }

  function inviteFriend() {
    const url = new URL(location.origin);
    url.searchParams.set('join', room);
    if (!room || kind === 'home') return;
    const notifyMsg = (t) => setMessages((prev) => [...prev, { type: 'notice', text: t }]);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(url.toString())
        .then(() => notifyMsg('Invite link copied!'))
        .catch(() => notifyMsg(url.toString()));
    } else {
      notifyMsg('Share this URL: ' + url.toString());
    }
  }

  async function action(fid, type) {
    if (!fid || fid === user.fid) return;
    if (!window.confirm(type === 'blocks' ? 'Block this player from room chat?' : 'Report this player for harassment?')) return;
    try {
      const response = await fetch('/api/' + type, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fid, ...(type === 'reports' ? { reason: 'harassment' } : {}) })
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Request failed');
      setMessages((prev) => [...prev, { type: 'notice', text: type === 'blocks' ? 'Player blocked' : 'Report submitted' }]);
    } catch (e) {
      setMessages((prev) => [...prev, { type: 'notice', text: e.message }]);
    }
  }

  function sendChat(e) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    send('chat', { text: value });
    setText('');
  }

  const direction = (dx, dz) => ({
    onPointerDown: (e) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      touch.current = { dx, dz };
    },
    onPointerUp: () => {
      touch.current = { dx: 0, dz: 0 };
    },
    onPointerCancel: () => {
      touch.current = { dx: 0, dz: 0 };
    }
  });

  return (
    <div className="world-layout">
      <div className="world-stage">
        {webglSupported ? (
          <Canvas
            shadows
            dpr={[1, 1.6]}
            camera={{ position: [18, 18, 22], fov: 48, near: 0.1, far: 150 }}
            gl={{ antialias: true, powerPreference: 'high-performance' }}
          >
            <Scene
              kind={kind}
              players={players}
              npcs={npcs}
              selfId={selfId}
              homeItems={liveHomeItems}
              homeTier={liveHomeTier}
              effects={effects}
              tipBursts={tipBursts}
              onTipBurstComplete={(id) => setTipBursts((prev) => prev.filter((b) => b.id !== id))}
              onSelect={setSelected}
              hotspots={hotspots}
              activeHotspotId={activeHotspot?.id}
              onSelectHotspot={setSelectedHotspot}
              onOpenChannel={handleOpenKioskChannel}
              timePhase={timePhase}
              cityEvent={cityEvent}
              powerup={powerup}
              beams={beams}
              cameraMode={cameraMode}
              onUseFurniture={(item) => {
                if (item.type === 'dj_booth') soundEngine.toggleRadio(true);
                send('use-furniture', { type: item.type });
              }}
            />
          </Canvas>
        ) : (
          <div className="graphics-unavailable" role="alert">
            <h2>3D graphics unavailable</h2>
            <p>
              Your browser needs WebGL2 and hardware graphics enabled to enter the Simcaster world. Update your desktop
              browser or enable graphics acceleration.
            </p>
            <button onClick={onBack}>Return to dashboard</button>
          </div>
        )}

        <div className="stage-top">
          <button className="stage-back" onClick={onBack}>
            <ArrowLeft size={16} /> Back
          </button>
          <div
            className={`location-pill ${kind === 'plaza' ? 'district-channel-pill' : ''}`}
            data-testid="hud-location-pill"
            data-district={kind === 'plaza' ? activeDistrict?.id : undefined}
            data-channel={kind === 'plaza' ? activeDistrict?.channel : undefined}
            title={kind === 'plaza' ? `${activeDistrict?.name} (${activeDistrict?.pill}) — ${activeDistrict?.tagline}` : undefined}
          >
            <span
              className="live-pulse"
              style={
                kind === 'plaza' && activeDistrict?.color
                  ? {
                      backgroundColor: activeDistrict.color,
                      boxShadow: `0 0 0 4px ${activeDistrict.color}38`
                    }
                  : undefined
              }
            />
            {kind === 'arena' ? (
              'LASER TAG ARENA'
            ) : kind === 'home' ? (
              ownerFid && Number(ownerFid) !== Number(user.fid) ? (
                'FRIEND’S APARTMENT'
              ) : (
                `MY ${liveHomeTier.toUpperCase()} PAD`
              )
            ) : (
              <>
                <span
                  className="channel-tag"
                  style={{ color: activeDistrict?.color || '#8a63d2', fontWeight: 900 }}
                >
                  {activeDistrict?.pill || '/farcaster'}
                </span>
                <span className="district-sep" style={{ opacity: 0.45, margin: '0 2px' }}>·</span>
                <span className="district-name" style={{ color: '#39324f', fontWeight: 800 }}>{activeDistrict?.name || 'Main Plaza'}</span>
              </>
            )}
          </div>

          <div className="world-vitals-bar" aria-label="Character needs and economy">
            <span className="vital-creds" title="Creds">
              ₡{myCreds}
            </span>
            <span title="Energy">⚡{myNeeds.energy}%</span>
            <span title="Hunger">🍲{myNeeds.hunger}%</span>
            <span title="Vibe">🎧{myNeeds.vibe}%</span>
            <span title="Clout">🔥{myNeeds.clout}</span>
          </div>

          <button
            type="button"
            className="stage-back castphone-trigger"
            onClick={() => {
              soundEngine.playClick();
              setPhoneApp('jobs');
              setPhoneOpen(true);
            }}
          >
            <Smartphone size={15} /> CastPhone
          </button>

          <button
            type="button"
            className={'stage-back ' + (radioOn ? 'radio-live' : '')}
            onClick={() => soundEngine.toggleRadio()}
            title="Toggle Lo-Fi & Synthwave FM Radio"
          >
            {radioOn ? <Volume2 size={15} /> : <VolumeX size={15} />} {radioOn ? 'FM ON' : 'FM'}
          </button>

          <button type="button" className="stage-back" onClick={cycleCamera} title="Switch camera view">
            <Camera size={15} /> {cameraMode.toUpperCase()}
          </button>

          <div className="stage-counter">
            <Users size={15} /> {players.length} online
          </div>
          {kind !== 'home' && (
            <button className="stage-back stage-invite" onClick={inviteFriend}>
              Invite ↗
            </button>
          )}
        </div>

        {zoneBanner && (
          <div
            className="zone-transition-banner"
            role="status"
            data-testid="zone-transition-banner"
            style={{
              position: 'absolute',
              top: 76,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 9,
              background: 'rgba(26, 20, 44, 0.94)',
              backdropFilter: 'blur(10px)',
              color: '#fff',
              padding: '8px 18px 8px 10px',
              borderRadius: 99,
              fontSize: 12,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              border: `1.5px solid ${zoneBanner.color}88`,
              boxShadow: `0 8px 30px ${zoneBanner.color}35`,
              pointerEvents: 'none'
            }}
          >
            <span
              className="zone-banner-pill"
              style={{
                backgroundColor: zoneBanner.color,
                color: '#fff',
                fontWeight: 900,
                fontSize: 10,
                padding: '4px 10px',
                borderRadius: 99,
                letterSpacing: 0.6
              }}
            >
              {zoneBanner.pill}
            </span>
            <span className="zone-banner-title" style={{ color: '#ded7ee', fontSize: 11 }}>
              Entering <strong style={{ color: '#ffffff', fontWeight: 900 }}>{zoneBanner.name}</strong>
            </span>
          </div>
        )}

        <MinimapRadar
          kind={kind}
          me={me}
          players={players}
          npcs={npcs}
          hotspots={hotspots}
          powerup={powerup}
          activeDistrict={activeDistrict}
          onSelectHotspot={setSelectedHotspot}
        />

        {cityEvent && (
          <div className={'city-event-banner ' + (cityEvent === 'blackout' ? 'event-blackout' : 'event-happy')}>
            <Sparkles size={15} />
            <span>
              {cityEvent === 'blackout'
                ? 'HUB RELAY OUTAGE! Visit the Hub Relay Core near the fountain to restore power (+₡70 Bonus)!'
                : 'CITY HAPPY HOUR! Vibe & Clout rewards are boosted across the Plaza!'}
            </span>
          </div>
        )}

        {banner && (
          <div className="world-activity-toast" role="status">
            {banner}
          </div>
        )}

        <button
          type="button"
          className={'room-chat-toggle ' + (showChat ? 'is-open' : '')}
          onClick={() => setShowChat((open) => !open)}
          aria-expanded={showChat}
          aria-controls="simcaster-room-chat"
          aria-label={showChat ? 'Close room chat' : 'Open room chat'}
        >
          <MessageCircle size={17} /> {showChat ? 'Close chat' : 'Room chat'}{' '}
          {messages.length > 0 && !showChat ? '· ' + Math.min(messages.length, 99) : ''}
        </button>

        <div className="stage-info">
          <span className={state === 'Connected' ? 'connection-good' : 'connection-bad'}>
            {state === 'Connected' ? <Wifi size={13} /> : <WifiOff size={13} />} {state}
          </span>
          <span>Room {room.split(':').slice(-1)[0] || '—'}</span>
          {kind === 'plaza' && <span>{timePhase === 'night' ? '🌙 Night Neon' : timePhase === 'sunset' ? '🌅 Golden Hour' : '☀️ Day'}</span>}
          {kind === 'arena' && <span>{seconds ?? 180}s left</span>}
        </div>

        {kind === 'arena' && (
          <div className="game-hud">
            <span>
              <Heart size={17} fill="#ff868e" color="#ff868e" /> {me?.hp ?? 3} HP
            </span>
            <strong>
              <Trophy size={18} /> {me?.score ?? 0} / 7
            </strong>
            <span>SPACE TO FIRE · SHIFT TO DASH</span>
          </div>
        )}

        {kind === 'plaza' && activeHotspot && (
          <div className="hotspot-hud-card" role="region" aria-label={activeHotspot.name}>
            <div className="hotspot-hud-head">
              <span>
                {activeHotspot.icon} <b>{activeHotspot.name}</b>
              </span>
              {selectedHotspot && (
                <button type="button" onClick={() => setSelectedHotspot(null)} aria-label="Close venue panel">
                  ×
                </button>
              )}
            </div>
            <p>{activeHotspot.tagline}</p>
            {hotspotDist > 4.5 ? (
              <small className="hotspot-dist-hint">
                Walk closer ({hotspotDist.toFixed(1)}m away) or use your <b>CastPhone</b> to interact remotely.
              </small>
            ) : (
              <div className="hotspot-hud-actions">
                {activeHotspot.actions?.map((act) => (
                  <button
                    key={act.id}
                    type="button"
                    onClick={() => send('interact', { hotspotId: activeHotspot.id, actionId: act.id })}
                  >
                    {act.label}
                  </button>
                ))}
                {activeHotspot.id === 'arcade-hq' && (
                  <button type="button" className="hotspot-enter-arcade" onClick={onArcade}>
                    🕹️ Enter Laser Tag Arena
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="controls-hint">
          <Move size={15} /> WASD / Arrows or Joystick · Shift to Dash · P for CastPhone ·{' '}
          {kind === 'arena' ? 'Space to shoot (use bunkers for cover!)' : kind === 'home' ? 'Click any furniture to use it!' : 'Walk to venues to hustle & chill'}
        </div>

        <VirtualJoystick touchRef={touch} />

        <div className="touch-pad" aria-label="Touch movement controls">
          <button {...direction(0, -1)} aria-label="Move forward">
            ↑
          </button>
          <div>
            <button {...direction(-1, 0)} aria-label="Move left">
              ←
            </button>
            <button {...direction(0, 1)} aria-label="Move backward">
              ↓
            </button>
            <button {...direction(1, 0)} aria-label="Move right">
              →
            </button>
          </div>
        </div>

        {kind === 'arena' ? (
          <div className="arena-controls">
            <button className="dash-control" onClick={() => send('dash')}>
              <Zap size={18} /> DASH
            </button>
            <button className="shoot-control" onClick={() => send('shoot')}>
              <Crosshair size={23} /> FIRE
            </button>
          </div>
        ) : (
          <div className="stage-emotes">
            <button onClick={() => send('dash')}>⚡ Dash</button>
            <button onClick={() => send('emote', { name: 'wave' })}>👋 Wave</button>
            <button onClick={() => send('emote', { name: 'heart' })}>💜 Love</button>
            <button onClick={() => send('emote', { name: 'dance' })}>💃 Dance</button>
          </div>
        )}

        {activeTarget && activeTarget.id !== selfId && (
          <div className="interact-panel">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <b>{activeTarget.name}</b>
                {activeTarget.powerBadge && (
                  <span className="power-badge-indicator" style={{ color: '#8a63d2', fontSize: 11, fontWeight: 800, background: 'rgba(138, 99, 210, 0.18)', padding: '2px 7px', borderRadius: 99 }}>
                    🟣 Power Badge
                  </span>
                )}
              </div>
              <button onClick={() => setSelected(null)} aria-label="Close interaction menu">
                ×
              </button>
            </div>
            <p>{closeEnough ? 'You’re close enough to interact!' : 'Move closer to interact (' + distanceToTarget.toFixed(1) + 'm away).'}</p>

            {showTipMenu ? (
              <div className="tip-preset-row">
                <div className="tip-preset-row-head">
                  <span>Select tip amount:</span>
                  <button type="button" onClick={() => setShowTipMenu(false)} aria-label="Back to actions">
                    Back
                  </button>
                </div>
                <div className="tip-presets">
                  {[10, 50, 100].map((amt) => {
                    const canAfford = myCreds >= amt;
                    const isThisBusy = tipBusy && pendingTipAmount === amt;
                    return (
                      <button
                        key={amt}
                        type="button"
                        className="tip-preset-btn"
                        disabled={tipBusy || !canAfford || !closeEnough}
                        onClick={() => handleTipAvatar(amt)}
                        title={!canAfford ? 'Insufficient balance' : `Tip ${amt} ₡DEGEN`}
                      >
                        {isThisBusy ? '...' : `${amt} ₡DEGEN`}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="interact-actions">
                <button
                  disabled={!closeEnough}
                  onClick={() => {
                    send('emote', { name: 'wave', targetId: activeTarget.id });
                    setSelected(null);
                  }}
                >
                  👋 Wave
                </button>
                <button
                  disabled={!closeEnough}
                  onClick={() => {
                    send('emote', { name: 'heart', targetId: activeTarget.id });
                    setSelected(null);
                  }}
                >
                  💜 Send love
                </button>
                <button
                  disabled={!closeEnough}
                  onClick={() => {
                    send('emote', { name: 'dance', targetId: activeTarget.id });
                    setSelected(null);
                  }}
                >
                  💃 Dance
                </button>
                <button
                  disabled={!closeEnough || tipBusy}
                  className="interact-tip-btn"
                  onClick={() => setShowTipMenu(true)}
                >
                  🪙 Tip
                </button>
                <button
                  onClick={async () => {
                    try {
                      const response = await fetch('/api/friends/requests', {
                        method: 'POST',
                        credentials: 'same-origin',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ fid: activeTarget.fid })
                      });
                      if (!response.ok) throw new Error((await response.json()).error || 'Friend request failed');
                      setMessages((prev) => [...prev.slice(-36), { type: 'notice', text: 'Friend request sent to ' + activeTarget.name }]);
                    } catch (e) {
                      setMessages((prev) => [...prev.slice(-36), { type: 'notice', text: e.message }]);
                    }
                    setSelected(null);
                  }}
                >
                  ➕ Add friend
                </button>
                {activeTarget.fid < 900000000 && (
                  <a href={'https://warpcast.com/~/profiles/' + activeTarget.fid} target="_blank" rel="noopener noreferrer">
                    View Farcaster ↗
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {kind === 'plaza' && (
          <button className="goto-arcade" onClick={onArcade}>
            <Crosshair size={16} /> Enter arcade
          </button>
        )}

        {end && (
          <div className="match-result">
            <Flag size={25} />
            <h2>{end.winner === selfId ? 'You won! (+₡100)' : end.winner ? 'Match complete' : "It's a draw!"}</h2>
            <p>{end.scores.map((s) => s.name + ' ' + s.score).join(' · ')}</p>
            <button className="share-match" onClick={shareMatch}>
              Share to Farcaster <ExternalLink size={14} />
            </button>
            <button className="close-match" onClick={() => setEnd(null)} aria-label="Close match result">
              ×
            </button>
          </div>
        )}
      </div>

      {showChat && (
        <aside id="simcaster-room-chat" className="world-panel" aria-label="Room chat">
          <div className="world-panel-head">
            <div>
              <strong>Live room</strong>
              <small>{players.length} people here</small>
            </div>
            <button type="button" onClick={() => setShowChat(false)} aria-label="Close room chat">
              ×
            </button>
          </div>
          <>
            <div className="room-people">
              {players.map((p) => (
                <div key={p.id} className="room-person">
                  <span className="tiny-avatar" style={{ background: HEX[p.avatar?.color] || HEX.violet }}>
                    {p.name[0]?.toUpperCase()}
                  </span>
                  <span>
                    {p.name}
                    {p.id === selfId ? ' (you)' : ''}
                  </span>
                  <span className="online-dot" />
                  {p.id !== selfId && (
                    <span className="person-actions">
                      <button title="Block chat" onClick={() => action(p.fid, 'blocks')}>
                        Block
                      </button>
                      <button title="Report player" onClick={() => action(p.fid, 'reports')}>
                        Report
                      </button>
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div className="room-chat-title">
              <MessageCircle size={15} /> Room chat
            </div>
            <div className="room-messages" ref={scroll}>
              {messages.length === 0 && <p className="room-hint">Say hello! Everyone in this room can see your messages.</p>}
              {messages.map((msg, i) =>
                msg.type === 'notice' ? (
                  <div className="room-notice" key={i}>
                    {msg.text}
                  </div>
                ) : (
                  <div className="room-msg" key={i}>
                    <b>{msg.name}</b>
                    <p>{msg.text}</p>
                  </div>
                )
              )}
            </div>
            <form className="room-compose" onSubmit={sendChat}>
              <input
                aria-label="Chat message"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Say something…"
                maxLength={180}
              />
              <button aria-label="Send message" type="submit">
                <Send size={17} />
              </button>
            </form>
            <div className="chat-footnote">Messages also appear above your 3D avatar!</div>
          </>
        </aside>
      )}

      <CastPhone
        open={phoneOpen}
        onClose={() => setPhoneOpen(false)}
        user={{ ...user, creds: myCreds, needs: myNeeds, career: me?.career || user?.career }}
        onUserUpdate={onUserUpdate}
        notify={showBanner}
        onVisitHome={onVisitHome}
        onGoHome={onGoHome}
        initialApp={phoneApp}
        activeDistrict={activeDistrict}
        activeChannel={activeDistrict?.id || 'farcaster'}
      />
    </div>
  );
}
