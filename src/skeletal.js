import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

if (typeof globalThis.ProgressEvent === 'undefined') {
  globalThis.ProgressEvent = class ProgressEvent extends Event {
    constructor(type, init = {}) {
      super(type);
      this.lengthComputable = !!init.lengthComputable;
      this.loaded = init.loaded || 0;
      this.total = init.total || 0;
    }
  };
}

const gltfCache = new Map();

function eulerQuat(rx, ry, rz) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ'));
  return [q.x, q.y, q.z, q.w];
}

/**
 * Builds a vertex-skinned torso SkinnedMesh bound to a 3-bone spine hierarchy
 * (pelvis -> waist -> chest) so the avatar's upper body deforms smoothly via GPU skinning.
 */
export function createSkinnedTorsoMesh(color = '#8d64f7', buildScale = 1) {
  const geometry = new THREE.CapsuleGeometry(0.34, 0.63, 8, 16);
  geometry.scale(buildScale, 1, 1);

  const pos = geometry.attributes.position;
  const skinIndices = [];
  const skinWeights = [];

  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i); // ranges roughly from -0.65 to +0.65
    const normalized = THREE.MathUtils.clamp((y + 0.65) / 1.3, 0, 1);
    if (normalized < 0.45) {
      const t = normalized / 0.45;
      skinIndices.push(0, 1, 0, 0);
      skinWeights.push(1 - t, t, 0, 0);
    } else {
      const t = (normalized - 0.45) / 0.55;
      skinIndices.push(1, 2, 0, 0);
      skinWeights.push(1 - t, t, 0, 0);
    }
  }

  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

  const pelvisBone = new THREE.Bone();
  pelvisBone.name = 'pelvis';
  pelvisBone.position.set(0, -0.32, 0);

  const waistBone = new THREE.Bone();
  waistBone.name = 'waist';
  waistBone.position.set(0, 0.32, 0);
  pelvisBone.add(waistBone);

  const chestBone = new THREE.Bone();
  chestBone.name = 'chest';
  chestBone.position.set(0, 0.32, 0);
  waistBone.add(chestBone);

  const bones = [pelvisBone, waistBone, chestBone];
  const skeleton = new THREE.Skeleton(bones);

  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.76
  });

  const skinnedMesh = new THREE.SkinnedMesh(geometry, material);
  skinnedMesh.name = 'AvatarSkinnedTorso';
  skinnedMesh.castShadow = true;
  skinnedMesh.receiveShadow = true;
  skinnedMesh.add(pelvisBone);
  skinnedMesh.bind(skeleton);

  return { skinnedMesh, skeleton, bones: { pelvisBone, waistBone, chestBone } };
}

/**
 * Generates authored Three.js keyframe AnimationClips ('idle', 'walk', 'dash', 'wave', 'dance')
 * for the avatar's skeletal rig driven by THREE.AnimationMixer.
 */
export function createAvatarAnimationClips() {
  // 1. IDLE CLIP (2.0s breathing & subtle posture sway)
  const idleTimes = [0, 1.0, 2.0];
  const idleClip = new THREE.AnimationClip('idle', 2.0, [
    new THREE.VectorKeyframeTrack(
      'body.position',
      idleTimes,
      [0, 0, 0, 0, 0.03, 0, 0, 0, 0]
    ),
    new THREE.QuaternionKeyframeTrack(
      'body.quaternion',
      idleTimes,
      [...eulerQuat(0, 0, 0), ...eulerQuat(0.015, 0, 0.01), ...eulerQuat(0, 0, 0)]
    ),
    new THREE.QuaternionKeyframeTrack(
      'waist.quaternion',
      idleTimes,
      [...eulerQuat(0, 0, 0), ...eulerQuat(0.025, 0.02, 0), ...eulerQuat(0, 0, 0)]
    ),
    new THREE.QuaternionKeyframeTrack(
      'leftArm.quaternion',
      idleTimes,
      [...eulerQuat(0, 0, 0.08), ...eulerQuat(0.04, 0, 0.11), ...eulerQuat(0, 0, 0.08)]
    ),
    new THREE.QuaternionKeyframeTrack(
      'rightArm.quaternion',
      idleTimes,
      [...eulerQuat(0, 0, -0.08), ...eulerQuat(-0.04, 0, -0.11), ...eulerQuat(0, 0, -0.08)]
    ),
    new THREE.QuaternionKeyframeTrack(
      'leftLeg.quaternion',
      idleTimes,
      [...eulerQuat(0, 0, 0), ...eulerQuat(0, 0, 0), ...eulerQuat(0, 0, 0)]
    ),
    new THREE.QuaternionKeyframeTrack(
      'rightLeg.quaternion',
      idleTimes,
      [...eulerQuat(0, 0, 0), ...eulerQuat(0, 0, 0), ...eulerQuat(0, 0, 0)]
    )
  ]);

  // 2. WALK CLIP (0.6s biped stride cycle)
  const walkTimes = [0, 0.15, 0.3, 0.45, 0.6];
  const walkClip = new THREE.AnimationClip('walk', 0.6, [
    new THREE.VectorKeyframeTrack(
      'body.position',
      walkTimes,
      [0, 0.01, 0, 0, 0.065, 0, 0, 0.01, 0, 0, 0.065, 0, 0, 0.01, 0]
    ),
    new THREE.QuaternionKeyframeTrack(
      'body.quaternion',
      walkTimes,
      [
        ...eulerQuat(0.08, 0, 0),
        ...eulerQuat(0.09, 0.04, 0.02),
        ...eulerQuat(0.08, 0, 0),
        ...eulerQuat(0.09, -0.04, -0.02),
        ...eulerQuat(0.08, 0, 0)
      ]
    ),
    new THREE.QuaternionKeyframeTrack(
      'waist.quaternion',
      walkTimes,
      [
        ...eulerQuat(0.04, 0, 0),
        ...eulerQuat(0.05, 0.08, 0),
        ...eulerQuat(0.04, 0, 0),
        ...eulerQuat(0.05, -0.08, 0),
        ...eulerQuat(0.04, 0, 0)
      ]
    ),
    new THREE.QuaternionKeyframeTrack(
      'leftArm.quaternion',
      walkTimes,
      [
        ...eulerQuat(0, 0, 0.09),
        ...eulerQuat(0.42, 0, 0.09),
        ...eulerQuat(0, 0, 0.09),
        ...eulerQuat(-0.42, 0, 0.09),
        ...eulerQuat(0, 0, 0.09)
      ]
    ),
    new THREE.QuaternionKeyframeTrack(
      'rightArm.quaternion',
      walkTimes,
      [
        ...eulerQuat(0, 0, -0.09),
        ...eulerQuat(-0.42, 0, -0.09),
        ...eulerQuat(0, 0, -0.09),
        ...eulerQuat(0.42, 0, -0.09),
        ...eulerQuat(0, 0, -0.09)
      ]
    ),
    new THREE.QuaternionKeyframeTrack(
      'leftLeg.quaternion',
      walkTimes,
      [
        ...eulerQuat(0, 0, 0),
        ...eulerQuat(-0.54, 0, 0),
        ...eulerQuat(0, 0, 0),
        ...eulerQuat(0.54, 0, 0),
        ...eulerQuat(0, 0, 0)
      ]
    ),
    new THREE.QuaternionKeyframeTrack(
      'rightLeg.quaternion',
      walkTimes,
      [
        ...eulerQuat(0, 0, 0),
        ...eulerQuat(0.54, 0, 0),
        ...eulerQuat(0, 0, 0),
        ...eulerQuat(-0.54, 0, 0),
        ...eulerQuat(0, 0, 0)
      ]
    )
  ]);

  // 3. DASH CLIP (0.36s forward-leaning sprint cycle)
  const dashTimes = [0, 0.09, 0.18, 0.27, 0.36];
  const dashClip = new THREE.AnimationClip('dash', 0.36, [
    new THREE.VectorKeyframeTrack(
      'body.position',
      dashTimes,
      [0, 0.02, 0, 0, 0.09, 0, 0, 0.02, 0, 0, 0.09, 0, 0, 0.02, 0]
    ),
    new THREE.QuaternionKeyframeTrack(
      'body.quaternion',
      dashTimes,
      [
        ...eulerQuat(0.28, 0, 0),
        ...eulerQuat(0.3, 0.06, 0),
        ...eulerQuat(0.28, 0, 0),
        ...eulerQuat(0.3, -0.06, 0),
        ...eulerQuat(0.28, 0, 0)
      ]
    ),
    new THREE.QuaternionKeyframeTrack(
      'leftArm.quaternion',
      dashTimes,
      [
        ...eulerQuat(0, 0, 0.12),
        ...eulerQuat(0.75, 0, 0.12),
        ...eulerQuat(0, 0, 0.12),
        ...eulerQuat(-0.75, 0, 0.12),
        ...eulerQuat(0, 0, 0.12)
      ]
    ),
    new THREE.QuaternionKeyframeTrack(
      'rightArm.quaternion',
      dashTimes,
      [
        ...eulerQuat(0, 0, -0.12),
        ...eulerQuat(-0.75, 0, -0.12),
        ...eulerQuat(0, 0, -0.12),
        ...eulerQuat(0.75, 0, -0.12),
        ...eulerQuat(0, 0, -0.12)
      ]
    ),
    new THREE.QuaternionKeyframeTrack(
      'leftLeg.quaternion',
      dashTimes,
      [
        ...eulerQuat(0, 0, 0),
        ...eulerQuat(-0.82, 0, 0),
        ...eulerQuat(0, 0, 0),
        ...eulerQuat(0.82, 0, 0),
        ...eulerQuat(0, 0, 0)
      ]
    ),
    new THREE.QuaternionKeyframeTrack(
      'rightLeg.quaternion',
      dashTimes,
      [
        ...eulerQuat(0, 0, 0),
        ...eulerQuat(0.82, 0, 0),
        ...eulerQuat(0, 0, 0),
        ...eulerQuat(-0.82, 0, 0),
        ...eulerQuat(0, 0, 0)
      ]
    )
  ]);

  // 4. WAVE CLIP (0.8s greeting wave)
  const waveTimes = [0, 0.2, 0.4, 0.6, 0.8];
  const waveClip = new THREE.AnimationClip('wave', 0.8, [
    new THREE.QuaternionKeyframeTrack(
      'rightArm.quaternion',
      waveTimes,
      [
        ...eulerQuat(0, 0, -0.85),
        ...eulerQuat(0, 0, -1.18),
        ...eulerQuat(0, 0, -0.62),
        ...eulerQuat(0, 0, -1.18),
        ...eulerQuat(0, 0, -0.85)
      ]
    ),
    new THREE.QuaternionKeyframeTrack(
      'waist.quaternion',
      waveTimes,
      [
        ...eulerQuat(0, 0, 0),
        ...eulerQuat(0, 0, 0.05),
        ...eulerQuat(0, 0, -0.03),
        ...eulerQuat(0, 0, 0.05),
        ...eulerQuat(0, 0, 0)
      ]
    )
  ]);

  // 5. DANCE CLIP (1.0s multi-bone groove & spine twist)
  const danceTimes = [0, 0.25, 0.5, 0.75, 1.0];
  const danceClip = new THREE.AnimationClip('dance', 1.0, [
    new THREE.VectorKeyframeTrack(
      'body.position',
      danceTimes,
      [0, 0, 0, 0, 0.15, 0, 0, 0.02, 0, 0, 0.15, 0, 0, 0, 0]
    ),
    new THREE.QuaternionKeyframeTrack(
      'body.quaternion',
      danceTimes,
      [
        ...eulerQuat(0, 0, 0),
        ...eulerQuat(0.05, 0.15, 0.12),
        ...eulerQuat(0, 0, 0),
        ...eulerQuat(0.05, -0.15, -0.12),
        ...eulerQuat(0, 0, 0)
      ]
    ),
    new THREE.QuaternionKeyframeTrack(
      'waist.quaternion',
      danceTimes,
      [
        ...eulerQuat(0, 0, 0),
        ...eulerQuat(0.08, 0.22, 0.14),
        ...eulerQuat(0, 0, 0),
        ...eulerQuat(0.08, -0.22, -0.14),
        ...eulerQuat(0, 0, 0)
      ]
    ),
    new THREE.QuaternionKeyframeTrack(
      'leftArm.quaternion',
      danceTimes,
      [
        ...eulerQuat(0, 0, 0.3),
        ...eulerQuat(-0.4, 0, 0.85),
        ...eulerQuat(0, 0, 0.3),
        ...eulerQuat(0.4, 0, 0.2),
        ...eulerQuat(0, 0, 0.3)
      ]
    ),
    new THREE.QuaternionKeyframeTrack(
      'rightArm.quaternion',
      danceTimes,
      [
        ...eulerQuat(0, 0, -0.3),
        ...eulerQuat(0.4, 0, -0.2),
        ...eulerQuat(0, 0, -0.3),
        ...eulerQuat(-0.4, 0, -0.85),
        ...eulerQuat(0, 0, -0.3)
      ]
    )
  ]);

  return {
    idle: idleClip,
    walk: walkClip,
    dash: dashClip,
    wave: waveClip,
    dance: danceClip
  };
}

/**
 * Loads and caches a glTF 2.0 (.gltf / .glb) 3D model using Three.js GLTFLoader.
 */
export function loadGltfModel(url = '/models/farcaster-arch.gltf') {
  if (!gltfCache.has(url)) {
    const loader = new GLTFLoader();
    const promise = new Promise((resolve, reject) => {
      loader.load(
        url,
        (gltf) => resolve(gltf),
        undefined,
        (err) => reject(err)
      );
    });
    gltfCache.set(url, promise);
  }
  return gltfCache.get(url);
}
