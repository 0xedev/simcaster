import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Collapses a subtree of static, untextured meshes into one mesh per distinct material.
// The city was ~350 separate draw calls for buildings/windows/trees/lamps; batched it is ~40.
// Children stay declared as normal JSX (hidden), so the scenery is still easy to edit.
// Only wrap things that never move and have no click handlers or textures.
export default function StaticBatch({ children, deps = [] }) {
  const src = useRef();
  const out = useMemo(() => new THREE.Group(), []);

  useLayoutEffect(() => {
    const root = src.current;
    if (!root) return undefined;
    root.visible = true;
    root.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const rel = new THREE.Matrix4();
    const buckets = new Map();
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position) return;
      const m = o.material;
      const key = [
        m.type,
        m.color?.getHex(),
        m.emissive?.getHex(),
        m.emissiveIntensity,
        m.roughness,
        m.metalness,
        m.transparent,
        m.opacity,
        m.side,
        o.castShadow,
        o.receiveShadow
      ].join('|');
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const name of Object.keys(g.attributes)) {
        if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
      }
      g.applyMatrix4(rel.multiplyMatrices(inv, o.matrixWorld));
      if (!buckets.has(key)) buckets.set(key, { material: m, cast: o.castShadow, receive: o.receiveShadow, list: [] });
      buckets.get(key).list.push(g);
    });
    const made = [];
    for (const b of buckets.values()) {
      const geometry = mergeGeometries(b.list, false);
      b.list.forEach((g) => g.dispose());
      if (!geometry) continue;
      const mesh = new THREE.Mesh(geometry, b.material.clone());
      mesh.castShadow = b.cast;
      mesh.receiveShadow = b.receive;
      out.add(mesh);
      made.push(mesh);
    }
    root.visible = false;
    return () => {
      for (const mesh of made) {
        out.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
    };
  }, deps);

  return (
    <>
      <group ref={src}>{children}</group>
      <primitive object={out} />
    </>
  );
}
