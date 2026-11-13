import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { CATALOG, footprint, placementError, cleanLook } from '../../../shared/catalog';
import { CHANNEL_BOARDS, type Cast, type ChannelBoard } from '../../../shared/protocol';
import { ACTIONS, HOME_D, HOME_W, TOWN, TOWN_HALF, type HomeItem, type Hotspot, type PathSample, type Placement } from '../../../shared/world';
import { DOOR_SPOT, furnitureMenu, hotspotMenu, moveTo, playerMenu } from '../actions';
import { api, simPos, tickPending } from '../net';
import { useStore, store } from '../store';
import { FONT, cloneModel, disposeGroup, labelTexture, loadGLB, mergeStatic, wrapText } from './assets';
import Sim, { type Pose } from './Sim';

// ---------------------------------------------------------------- camera
function CameraRig({ home }: { home: boolean }) {
  const { camera, gl } = useThree();
  const orbit = useRef({ az: home ? 0 : 0.7, el: home ? 0.95 : 0.74, dist: home ? 32 : 50, tx: 0, tz: 0, init: false });

  useEffect(() => {
    const o = orbit.current;
    o.az = home ? 0 : 0.7;
    o.el = home ? 0.95 : 0.74;
    o.dist = home ? 32 : 50;
    o.init = false;
    const el = gl.domElement;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    const down = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const move = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      if (pointers.size === 1) {
        o.az -= (e.clientX - prev.x) * 0.006;
        o.el = THREE.MathUtils.clamp(o.el + (e.clientY - prev.y) * 0.004, 0.45, 1.3);
        if (home) o.az = THREE.MathUtils.clamp(o.az, -0.75, 0.75);
      }
      prev.x = e.clientX;
      prev.y = e.clientY;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) o.dist = THREE.MathUtils.clamp(o.dist * (pinch / d), 14, 90);
        pinch = d;
      }
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      pinch = 0;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      o.dist = THREE.MathUtils.clamp(o.dist * (e.deltaY > 0 ? 1.1 : 0.9), 14, 90);
    };
    const keys = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'q') o.az += Math.PI / 4;
      if (e.key === 'e') o.az -= Math.PI / 4;
      if (home) o.az = THREE.MathUtils.clamp(o.az, -0.75, 0.75);
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', keys);
    const noMenu = (e: Event) => e.preventDefault();
    el.addEventListener('contextmenu', noMenu);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', keys);
      el.removeEventListener('contextmenu', noMenu);
    };
  }, [gl, home]);

  const goal = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  const sample = useMemo<PathSample>(() => ({ x: 0, z: 0, heading: 0, moving: false }), []);
  useFrame((_, dt) => {
    const o = orbit.current;
    const me = simPos(store.getState().selfId, sample);
    const fx = home ? (me ? me.x * 0.35 : 0) : me ? me.x : 0;
    const fz = home ? (me ? me.z * 0.35 : 0) : me ? me.z : 0;
    const k = o.init ? 1 - Math.exp(-dt * 6) : 1;
    o.tx += (fx - o.tx) * k;
    o.tz += (fz - o.tz) * k;
    const flat = Math.cos(o.el) * o.dist;
    goal.set(o.tx + Math.sin(o.az) * flat, Math.sin(o.el) * o.dist, o.tz + Math.cos(o.az) * flat);
    if (!o.init) camera.position.copy(goal);
    else camera.position.lerp(goal, 1 - Math.exp(-dt * 10));
    o.init = true;
    look.set(o.tx, 1.2, o.tz);
    camera.lookAt(look);
  });
  return null;
}

/** The lit scene is static, so the shadow map is rendered only when `stamp` changes. */
function ShadowBaker({ stamp }: { stamp: unknown }) {
  const gl = useThree((s) => s.gl);
  const left = useRef(0);
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    left.current = 6;
  }, [gl, stamp]);
  useFrame(() => {
    if (left.current > 0) {
      left.current--;
      gl.shadowMap.needsUpdate = true;
    }
  });
  return null;
}

function Lights({ extent }: { extent: number }) {
  return (
    <>
      <hemisphereLight args={['#fff6e8', '#6f7fa8', 1.15]} />
      <directionalLight
        position={[extent * 0.6, extent * 1.2, extent * 0.45]}
        intensity={2.1}
        color="#fff1dc"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-camera-left={-extent}
        shadow-camera-right={extent}
        shadow-camera-top={extent}
        shadow-camera-bottom={-extent}
        shadow-camera-far={extent * 4}
      />
    </>
  );
}

// ---------------------------------------------------------------- shared bits
const markerRing = new THREE.RingGeometry(0.95, 1.2, 36);
const clickPlane = new THREE.PlaneGeometry(400, 400);
const invisible = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

function Marker({ spot, onPick, size = 1 }: { spot: Hotspot; onPick: (e: MouseEvent) => void; size?: number }) {
  const ring = useRef<THREE.Mesh>(null);
  const tex = useMemo(
    () => labelTexture(`spot|${spot.icon}|${spot.name}`, (ctx, w, h) => {
      ctx.font = `600 40px ${FONT}`;
      const text = `${spot.icon}  ${spot.name}`;
      const tw = Math.min(w - 20, ctx.measureText(text).width + 64);
      ctx.fillStyle = 'rgba(255,255,255,0.96)';
      ctx.beginPath();
      ctx.roundRect((w - tw) / 2, 20, tw, 88, 44);
      ctx.fill();
      ctx.fillStyle = '#231a44';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, w / 2, 66, w - 60);
    }),
    [spot.icon, spot.name],
  );
  useFrame(({ clock }) => {
    if (ring.current) ring.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 3 + spot.x) * 0.07);
  });
  const pick = (e: any) => {
    if (e.delta > 6) return;
    e.stopPropagation();
    onPick(e.nativeEvent);
  };
  const small = spot.id.startsWith('bench');
  return (
    <group position={[spot.x, 0, spot.z]}>
      <mesh ref={ring} geometry={markerRing} rotation-x={-Math.PI / 2} position-y={0.07} onClick={pick}>
        <meshBasicMaterial color={small ? '#ffd166' : '#8f6bff'} transparent opacity={0.9} depthWrite={false} />
      </mesh>
      <mesh position-y={1.4} material={invisible} onClick={pick}>
        <cylinderGeometry args={[1.5, 1.5, 2.8, 8]} />
      </mesh>
      {!small && (
        <sprite position={[0, 4.6 * size, 0]} scale={[5.4 * size, 1.35 * size, 1]} renderOrder={4} onClick={pick}>
          <spriteMaterial map={tex} transparent depthWrite={false} />
        </sprite>
      )}
    </group>
  );
}

function ClickRipple({ at }: { at: { x: number; z: number; n: number } | null }) {
  const ref = useRef<THREE.Mesh>(null);
  const t = useRef(1);
  useEffect(() => {
    t.current = 0;
  }, [at?.n]);
  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    t.current = Math.min(1, t.current + dt * 2.2);
    m.visible = t.current < 1 && !!at;
    m.scale.setScalar(0.4 + t.current * 1.1);
    (m.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - t.current);
  });
  return (
    <mesh ref={ref} geometry={markerRing} rotation-x={-Math.PI / 2} position={[at?.x ?? 0, 0.09, at?.z ?? 0]} visible={false}>
      <meshBasicMaterial color="#ffffff" transparent depthWrite={false} />
    </mesh>
  );
}

function Players() {
  const players = useStore((s) => s.players);
  const selfId = useStore((s) => s.selfId);
  const bubbles = useStore((s) => s.bubbles);
  const emotes = useStore((s) => s.emotes);
  const home = useStore((s) => s.home);
  const [, force] = useState(0);
  // Expire bubbles/emotes without a per-frame React render.
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 700);
    return () => clearInterval(t);
  }, []);
  const now = Date.now();
  return (
    <>
      {Object.values(players).map((p) => {
        const self = p.id === selfId;
        const emote = emotes[p.id] && emotes[p.id].until > now ? emotes[p.id].name : null;
        const bubble = bubbles[p.id] && bubbles[p.id].until > now ? bubbles[p.id].text : undefined;
        let clip: string | null = emote ? (emote === 'wave' ? 'Interact' : emote === 'cheer' ? 'Cheer' : 'Jump_Full_Short') : null;
        // Furniture poses: sit or lie on the piece itself rather than beside it.
        let seat: HomeItem | null = null;
        if (p.act) {
          clip = ACTIONS[p.act.action].anim;
          if (home && (clip === 'Sit_Chair_Idle' || clip === 'Lie_Idle')) seat = home.items.find((i) => i.id === p.act!.target) || null;
        }
        return (
          <PlayerSim key={p.id} id={p.id} self={self} name={p.name} look={p.look} clip={clip} bubble={bubble}
            face={p.act ? p.act.face : null} seat={seat} lying={clip === 'Lie_Idle'}
            onPick={self ? undefined : (e) => playerMenu(p, e.clientX, e.clientY)} />
        );
      })}
    </>
  );
}

function PlayerSim(props: {
  id: string; self: boolean; name: string; look: ReturnType<typeof cleanLook>; clip: string | null; bubble?: string;
  face: number | null; seat: HomeItem | null; lying: boolean; onPick?: (e: { clientX: number; clientY: number }) => void;
}) {
  const out = useMemo<Pose>(() => ({ x: 0, z: 0, heading: 0, moving: false, y: 0 }), []);
  const { id, self, face, seat, lying } = props;
  const pose = () => {
    const p = simPos(id, out);
    if (!p) return null;
    if (self) tickPending(p);
    out.y = 0;
    if (seat) {
      out.x = seat.x;
      out.z = seat.z;
      out.heading = seat.rot * (Math.PI / 2);
      out.y = lying ? 0.62 : 0;
    } else if (face !== null && !p.moving) out.heading = face;
    return out;
  };
  return <Sim look={props.look} name={props.name} self={self} bubble={props.bubble} clip={props.clip} pose={pose} onPick={props.onPick} />;
}

// ---------------------------------------------------------------- town
function ChannelBoardView({ board, cast, onPick }: { board: ChannelBoard; cast: Cast | null; onPick: () => void }) {
  const tex = useMemo(
    () => labelTexture(`board|${board.id}|${cast?.hash || ''}`, (ctx, w, h) => {
      ctx.fillStyle = '#17122b';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = board.color;
      ctx.fillRect(0, 0, w, 74);
      ctx.fillStyle = '#fff';
      ctx.font = `700 40px ${FONT}`;
      ctx.textBaseline = 'middle';
      ctx.fillText(board.label, 24, 39);
      ctx.font = `600 26px ${FONT}`;
      ctx.fillStyle = '#c9bdf5';
      ctx.fillText(cast ? `${cast.author.displayName}  @${cast.author.username}` : 'Loading casts…', 24, 112, w - 48);
      ctx.font = `400 28px ${FONT}`;
      ctx.fillStyle = '#f4f1ff';
      wrapText(ctx, cast?.text || '', w - 48, 4).forEach((line, i) => ctx.fillText(line, 24, 158 + i * 36));
      ctx.font = `600 22px ${FONT}`;
      ctx.fillStyle = '#8f7fd0';
      ctx.fillText('Tap to open the channel', 24, h - 26);
    }, 512, 320),
    [board, cast],
  );
  return (
    <group position={[board.x, 0, board.z]} rotation-y={board.rot}>
      <mesh position={[0, 1.2, 0]} castShadow>
        <boxGeometry args={[0.3, 2.4, 0.3]} />
        <meshStandardMaterial color="#2a2147" />
      </mesh>
      <mesh position={[0, 3.6, 0]} castShadow>
        <boxGeometry args={[5.0, 3.2, 0.24]} />
        <meshStandardMaterial color="#231b40" />
      </mesh>
      {[1, -1].map((side) => (
        <mesh key={side} position={[0, 3.6, 0.13 * side]} rotation-y={side > 0 ? 0 : Math.PI}
          onClick={(e) => { if (e.delta > 6) return; e.stopPropagation(); onPick(); }}>
          <planeGeometry args={[4.7, 2.94]} />
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Authors of recent channel casts stand by their channel's board. They are local-only ghosts. */
function FeedSims({ feeds }: { feeds: Record<string, Cast[]> }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 6000);
    return () => clearInterval(t);
  }, []);
  const list = useMemo(() => {
    const out: { key: string; cast: Cast; board: ChannelBoard; x: number; z: number; heading: number; slot: number }[] = [];
    for (const board of CHANNEL_BOARDS) {
      const seen = new Set<number>();
      let slot = 0;
      for (const cast of feeds[board.id] || []) {
        if (seen.has(cast.author.fid) || slot >= 3) continue;
        seen.add(cast.author.fid);
        // Fan out in front of the board, facing it.
        const side = (slot - 1) * 2.3;
        const fx = Math.sin(board.rot), fz = Math.cos(board.rot);
        const x = board.x + fx * 3.4 + fz * side;
        const z = board.z + fz * 3.4 - fx * side;
        out.push({ key: board.id + cast.author.fid, cast, board, x, z, heading: Math.atan2(board.x - x, board.z - z), slot: slot++ });
      }
    }
    return out;
  }, [feeds]);
  return (
    <>
      {list.map((g, i) => (
        <GhostSim key={g.key} g={g} speaking={tick % list.length === i} />
      ))}
    </>
  );
}

function GhostSim({ g, speaking }: { g: { cast: Cast; board: ChannelBoard; x: number; z: number; heading: number }; speaking: boolean }) {
  const pose = useMemo<Pose>(() => ({ x: g.x, z: g.z, heading: g.heading, moving: false, y: 0 }), [g.x, g.z, g.heading]);
  const look = useMemo(() => cleanLook({}, g.cast.author.fid * 7 + 3), [g.cast.author.fid]);
  return (
    <Sim look={look} name={'@' + g.cast.author.username} accent={g.board.color} pose={() => pose}
      bubble={speaking ? g.cast.text : undefined} clip={speaking ? 'Interact' : null}
      onPick={() => store.getState().set({ phone: 'feed', feedChannel: g.board.id, focusCast: g.cast, menu: null })} />
  );
}

function TownScene() {
  const [city, setCity] = useState<THREE.Group | null>(null);
  const [feeds, setFeeds] = useState<Record<string, Cast[]>>({});
  const [ripple, setRipple] = useState<{ x: number; z: number; n: number } | null>(null);

  useEffect(() => {
    let alive = true;
    let built: THREE.Group | null = null;
    loadGLB('city').then((gltf) => {
      if (!alive) return;
      const group = new THREE.Group();
      group.add(mergeStatic(gltf.scene, TOWN.ground, { cast: false }));
      group.add(mergeStatic(gltf.scene, [...TOWN.buildings, ...TOWN.props]));
      built = group;
      setCity(group);
    });
    return () => {
      alive = false;
      if (built) disposeGroup(built);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const load = () => {
      for (const b of CHANNEL_BOARDS) {
        api<{ casts: Cast[] }>(`/feed?type=channel&channel=${b.id}`)
          .then((r) => alive && setFeeds((f) => ({ ...f, [b.id]: r.casts })))
          .catch(() => {});
      }
    };
    load();
    const t = setInterval(load, 120_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <>
      <color attach="background" args={['#bfe3ff']} />
      <fog attach="fog" args={['#bfe3ff', 90, 190]} />
      <Lights extent={46} />
      <ShadowBaker stamp={city} />
      <mesh rotation-x={-Math.PI / 2} position-y={-0.05} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color="#8fcf8a" roughness={1} />
      </mesh>
      {city && <primitive object={city} />}
      <mesh
        geometry={clickPlane}
        material={invisible}
        rotation-x={-Math.PI / 2}
        position-y={0.5}
        onClick={(e) => {
          if (e.delta > 6) return;
          store.getState().set({ menu: null });
          const x = THREE.MathUtils.clamp(e.point.x, -TOWN_HALF + 0.5, TOWN_HALF - 0.5);
          const z = THREE.MathUtils.clamp(e.point.z, -TOWN_HALF + 0.5, TOWN_HALF - 0.5);
          if (moveTo(x, z)) setRipple({ x, z, n: Date.now() });
        }}
      />
      <ClickRipple at={ripple} />
      {TOWN.hotspots.map((h) => (
        <Marker key={h.id} spot={h} onPick={(e) => hotspotMenu(h, e.clientX, e.clientY)} />
      ))}
      {CHANNEL_BOARDS.map((b) => (
        <ChannelBoardView key={b.id} board={b} cast={feeds[b.id]?.[0] || null}
          onPick={() => store.getState().set({ phone: 'feed', feedChannel: b.id, focusCast: null, menu: null })} />
      ))}
      <FeedSims feeds={feeds} />
      <Players />
      <CameraRig home={false} />
    </>
  );
}

// ---------------------------------------------------------------- home
function itemTransform(item: Pick<HomeItem, 'model' | 'x' | 'z' | 'rot'>) {
  const e = CATALOG[item.model];
  const a = item.rot * (Math.PI / 2);
  // Rotate the model about its footprint centre, not its authored origin.
  const cx = e.cx * Math.cos(a) + e.cz * Math.sin(a);
  const cz = -e.cx * Math.sin(a) + e.cz * Math.cos(a);
  const y = e.wall ? 2.2 : e.category === 'Rugs' ? 0.02 : 0;
  return { position: [item.x - cx, y, item.z - cz] as [number, number, number], rotation: a };
}

function Furniture({ packs, item, ghost, bad, selected, onPick }: {
  packs: Record<string, THREE.Object3D>; item: HomeItem; ghost?: boolean; bad?: boolean; selected?: boolean; onPick?: (e: MouseEvent) => void;
}) {
  const obj = useMemo(() => {
    const e = CATALOG[item.model];
    const node = e && cloneModel(packs[e.pack], e.model);
    if (!node) return null;
    node.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = !ghost;
      mesh.receiveShadow = !ghost;
      if (ghost) {
        const m = (mesh.material as THREE.MeshStandardMaterial).clone();
        m.transparent = true;
        m.opacity = 0.7;
        m.color.set(bad ? '#ff6b6b' : '#9dffcf');
        mesh.material = m;
      }
    });
    return node;
  }, [packs, item.model, ghost, bad]);
  if (!obj) return null;
  const t = itemTransform(item);
  const f = footprint(item);
  return (
    <group>
      <group position={t.position} rotation-y={t.rotation}
        onClick={onPick ? (e) => { if (e.delta > 6) return; e.stopPropagation(); onPick(e.nativeEvent); } : undefined}>
        <primitive object={obj} />
      </group>
      {(selected || ghost) && (
        <mesh position={[item.x, 0.04, item.z]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[f.hw * 2, f.hd * 2]} />
          <meshBasicMaterial color={bad ? '#ff5d5d' : '#6fe3c1'} transparent opacity={0.35} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

function HomeScene() {
  const home = useStore((s) => s.home);
  const build = useStore((s) => s.build);
  const [packs, setPacks] = useState<Record<string, THREE.Object3D> | null>(null);
  const [shell, setShell] = useState<THREE.Group | null>(null);
  const [ripple, setRipple] = useState<{ x: number; z: number; n: number } | null>(null);

  useEffect(() => {
    let alive = true;
    let built: THREE.Group | null = null;
    Promise.all([loadGLB('furniture'), loadGLB('kitchen')]).then(([f, k]) => {
      if (!alive) return;
      const floor: Placement[] = [];
      for (let x = -HOME_W / 2 + 2; x < HOME_W / 2; x += 4) {
        for (let z = -HOME_D / 2 + 2; z < HOME_D / 2; z += 4) floor.push({ model: 'floor_kitchen', x, z, rot: 0, scale: 1, y: -0.5 });
      }
      const walls: Placement[] = [];
      for (let x = -HOME_W / 2 + 2; x < HOME_W / 2; x += 4) walls.push({ model: 'wall', x, z: -HOME_D / 2 - 0.25, rot: 0, scale: 1 });
      for (let z = -HOME_D / 2 + 2; z < HOME_D / 2; z += 4) {
        walls.push({ model: 'wall', x: -HOME_W / 2 - 0.25, z, rot: Math.PI / 2, scale: 1 });
        walls.push({ model: 'wall', x: HOME_W / 2 + 0.25, z, rot: Math.PI / 2, scale: 1 });
      }
      const group = new THREE.Group();
      group.add(mergeStatic(k.scene, floor, { cast: false }));
      group.add(mergeStatic(k.scene, walls));
      built = group;
      setShell(group);
      setPacks({ furniture: f.scene, kitchen: k.scene });
    });
    return () => {
      alive = false;
      if (built) disposeGroup(built);
    };
  }, []);

  const items = build ? build.draft : home?.items || [];
  const placing = build?.placing || null;
  const placingBad = placing ? !!placementError(placing, items) : false;
  const snap = (v: number) => Math.round(v * 2) / 2;

  return (
    <>
      <color attach="background" args={['#241d3d']} />
      <Lights extent={14} />
      <ShadowBaker stamp={`${shell?.uuid}|${JSON.stringify(items)}`} />
      <mesh rotation-x={-Math.PI / 2} position-y={-0.52}>
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial color="#1b1530" />
      </mesh>
      {shell && <primitive object={shell} />}
      <mesh
        geometry={clickPlane}
        material={invisible}
        rotation-x={-Math.PI / 2}
        position-y={0.01}
        onPointerMove={(e) => {
          const b = store.getState().build;
          if (!b?.placing) return;
          const x = snap(e.point.x), z = snap(e.point.z);
          if (x !== b.placing.x || z !== b.placing.z) store.getState().set({ build: { ...b, placing: { ...b.placing, x, z } } });
        }}
        onClick={(e) => {
          if (e.delta > 6) return;
          const st = store.getState();
          const b = st.build;
          if (b) {
            if (b.placing) {
              const item = { ...b.placing, x: snap(e.point.x), z: snap(e.point.z) };
              const err = placementError(item, b.draft);
              if (err) return st.notify(err);
              st.set({ build: { draft: [...b.draft.filter((i) => i.id !== item.id), item], placing: null, selected: item.id } });
            } else st.set({ build: { ...b, selected: null } });
            return;
          }
          st.set({ menu: null });
          const x = THREE.MathUtils.clamp(e.point.x, -HOME_W / 2 + 0.3, HOME_W / 2 - 0.3);
          const z = THREE.MathUtils.clamp(e.point.z, -HOME_D / 2 + 0.3, HOME_D / 2 - 0.3);
          if (moveTo(x, z)) setRipple({ x, z, n: Date.now() });
        }}
      />
      <ClickRipple at={ripple} />
      {packs && items.filter((i) => i.id !== placing?.id).map((item) => (
        <Furniture key={item.id} packs={packs} item={item} selected={build?.selected === item.id}
          onPick={(e) => {
            const st = store.getState();
            if (st.build) st.set({ build: { ...st.build, selected: item.id, placing: null } });
            else furnitureMenu(item, e.clientX, e.clientY);
          }} />
      ))}
      {packs && placing && <Furniture packs={packs} item={placing} ghost bad={placingBad} />}
      {!build && <Marker spot={DOOR_SPOT} size={0.5} onPick={(e) => hotspotMenu(DOOR_SPOT, e.clientX, e.clientY)} />}
      <Players />
      <CameraRig home />
    </>
  );
}

export default function World() {
  const kind = useStore((s) => s.room.kind);
  return (
    <Canvas shadows dpr={[1, 1.75]} camera={{ fov: 32, near: 0.5, far: 400, position: [30, 30, 30] }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.05; }}>
      {kind === 'town' ? <TownScene /> : <HomeScene />}
    </Canvas>
  );
}
