import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Store } from '../server/storage.js';
import { attachWorld } from '../server/world.js';
import {
  PostgresStoreAdapter,
  ClusterBus,
  createMemorySqlDriver,
  createMemoryPubSubBroker
} from '../server/cluster.js';
import { createSkinnedTorsoMesh, createAvatarAnimationClips } from '../src/skeletal.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('PostgreSQL adapter persists and hydrates Store state across independent server instances', async () => {
  const sqlDriver = createMemorySqlDriver();
  const pg1 = new PostgresStoreAdapter({ client: sqlDriver });
  const store1 = new Store(null, { pgAdapter: pg1 });

  await store1.hydrateFromPostgres();
  store1.userFor(777, { username: 'vitalik', displayName: 'Vitalik' });
  store1.performHotspotAction(777, 'warp-cafe', 'work');
  store1.performHotspotAction(777, 'foundry-hub', 'work');
  const claim = store1.claimQuest(777, 'hustle_shifts');
  assert.equal(claim.rewardCreds, 120);
  await store1.flush();

  // Cold-start a second Store instance backed by the same PostgreSQL tables
  const pg2 = new PostgresStoreAdapter({ client: sqlDriver });
  const store2 = new Store(null, { pgAdapter: pg2 });
  await store2.hydrateFromPostgres();

  const hydratedUser = store2.findUser(777);
  assert.ok(hydratedUser, 'account hydrated from PostgreSQL');
  assert.equal(hydratedUser.displayName, 'Vitalik');
  assert.equal(hydratedUser.quests.hustle_shifts.claimed, true);
  assert.equal(hydratedUser.creds, store1.findUser(777).creds);
});

test('Multi-replica ClusterBus syncs live WebSocket players and chat across two server nodes', async () => {
  const sqlDriver = createMemorySqlDriver();
  const broker = createMemoryPubSubBroker();

  const busA = new ClusterBus({ broker, replicaId: 'replica-a' });
  const busB = new ClusterBus({ broker, replicaId: 'replica-b' });
  await Promise.all([busA.connect(), busB.connect()]);

  const storeA = new Store(null, {
    pgAdapter: new PostgresStoreAdapter({ client: sqlDriver }),
    clusterBus: busA
  });
  const storeB = new Store(null, {
    pgAdapter: new PostgresStoreAdapter({ client: sqlDriver }),
    clusterBus: busB
  });

  const user1 = storeA.userFor(101, { username: 'alice', displayName: 'Alice' });
  const token1 = storeA.startSession(user1.fid);
  await storeA.flush();

  const user2 = storeB.userFor(202, { username: 'bob', displayName: 'Bob' });
  const token2 = storeB.startSession(user2.fid);
  await storeB.flush();

  const origin = 'http://localhost';
  const sessionFromReq = (store) => (req) => {
    const token = (req.headers.cookie || '').replace('simcaster_session=', '').trim();
    return store.verifySession(token);
  };

  const srvA = http.createServer();
  const srvB = http.createServer();
  const worldA = attachWorld(srvA, storeA, sessionFromReq(storeA), origin, busA);
  const worldB = attachWorld(srvB, storeB, sessionFromReq(storeB), origin, busB);

  await new Promise((r) => srvA.listen(0, r));
  await new Promise((r) => srvB.listen(0, r));
  const portA = srvA.address().port;
  const portB = srvB.address().port;

  let ws1;
  let ws2;
  try {
    ws1 = new WebSocket(`ws://localhost:${portA}/socket?room=plaza`, {
      headers: { cookie: `simcaster_session=${token1}`, origin }
    });
    ws2 = new WebSocket(`ws://localhost:${portB}/socket?room=plaza`, {
      headers: { cookie: `simcaster_session=${token2}`, origin }
    });
    await Promise.all([
      new Promise((res, rej) => {
        ws1.once('open', res);
        ws1.once('error', rej);
      }),
      new Promise((res, rej) => {
        ws2.once('open', res);
        ws2.once('error', rej);
      })
    ]);

    let bobSnapshots = [];
    let bobChat = [];
    ws2.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.event === 'snapshot') bobSnapshots = msg.data.players;
      if (msg.event === 'chat') bobChat.push(msg.data);
    });

    // Wait for 10Hz ticks to exchange presence across ClusterBus
    for (let i = 0; i < 15; i++) {
      if (bobSnapshots.some((p) => p.fid === 101) && bobSnapshots.some((p) => p.fid === 202)) break;
      await sleep(80);
    }

    assert.ok(bobSnapshots.some((p) => p.fid === 101), 'Replica B snapshot includes Alice from Replica A');
    assert.ok(bobSnapshots.some((p) => p.fid === 202), 'Replica B snapshot includes local player Bob');

    ws1.send(JSON.stringify({ event: 'chat', data: { text: 'gm from replica A!' } }));
    for (let i = 0; i < 15; i++) {
      if (bobChat.length > 0) break;
      await sleep(60);
    }
    assert.equal(bobChat.length, 1);
    assert.equal(bobChat[0].text, 'gm from replica A!');
    assert.equal(worldA.stats().cluster.replicaId, 'replica-a');
    assert.ok(worldB.stats().cluster.peers.includes('replica-a'));
  } finally {
    ws1?.close();
    ws2?.close();
    worldA.close();
    worldB.close();
    await busA.close();
    await busB.close();
    srvA.close();
    srvB.close();
  }
});

test('Three.js SkinnedMesh skeletal rig, AnimationMixer clips, and glTF 2.0 model parse cleanly', async () => {
  const { skinnedMesh, skeleton, bones } = createSkinnedTorsoMesh('#8d64f7', 1);
  assert.ok(skinnedMesh instanceof THREE.SkinnedMesh, 'creates a THREE.SkinnedMesh');
  assert.equal(skeleton.bones.length, 3, 'skeleton has 3 spine bones (pelvis, waist, chest)');
  assert.equal(bones.waistBone.name, 'waist');

  const skinWeightAttr = skinnedMesh.geometry.attributes.skinWeight;
  assert.ok(skinWeightAttr.count > 0, 'geometry has vertex skinWeight attributes');
  const sumWeights =
    skinWeightAttr.getX(0) + skinWeightAttr.getY(0) + skinWeightAttr.getZ(0) + skinWeightAttr.getW(0);
  assert.ok(Math.abs(sumWeights - 1.0) < 1e-5, 'vertex skin weights sum to 1.0');

  // Verify AnimationMixer drives keyframe tracks on an avatar hierarchy
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  body.add(skinnedMesh);
  const leftArm = new THREE.Mesh();
  leftArm.name = 'leftArm';
  const rightArm = new THREE.Mesh();
  rightArm.name = 'rightArm';
  const leftLeg = new THREE.Group();
  leftLeg.name = 'leftLeg';
  const rightLeg = new THREE.Group();
  rightLeg.name = 'rightLeg';
  body.add(leftArm, rightArm, leftLeg, rightLeg);
  root.add(body);

  const clips = createAvatarAnimationClips();
  const mixer = new THREE.AnimationMixer(root);
  const walkAction = mixer.clipAction(clips.walk);
  walkAction.play();
  mixer.update(0.15);
  assert.ok(Math.abs(leftLeg.quaternion.x) > 0.1, 'AnimationMixer rotates leg bone during walk cycle');

  // Verify glTF 2.0 asset on disk parses into a Three.js scene
  const gltfPath = path.resolve(process.cwd(), 'public/models/farcaster-arch.gltf');
  const rawGltf = fs.readFileSync(gltfPath, 'utf8');
  const loader = new GLTFLoader();
  const parsed = await new Promise((resolve, reject) => {
    loader.parse(rawGltf, '', resolve, reject);
  });
  assert.ok(parsed.scene instanceof THREE.Group, 'glTF 2.0 asset parses into THREE.Group scene');
  const meshNode = parsed.scene.getObjectByName('FarcasterCrystalNode');
  assert.ok(meshNode && meshNode.isMesh, 'glTF scene contains FarcasterCrystalNode mesh');
});
