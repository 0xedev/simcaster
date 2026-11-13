// GLB loading, cached by URL, plus helpers to turn pack nodes into render-ready objects.
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Placement } from '../../../shared/world';

const loader = new GLTFLoader();
const cache = new Map<string, Promise<GLTF>>();

export function loadGLB(name: string): Promise<GLTF> {
  const url = `/models/${name}.glb`;
  let p = cache.get(url);
  if (!p) {
    p = loader.loadAsync(url).then((gltf) => {
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          const mat = m as THREE.MeshStandardMaterial;
          // KayKit materials ship slightly metallic, which reads as dull grey without an env map.
          mat.metalness = 0;
          mat.roughness = 0.85;
          if (mat.map) mat.map.anisotropy = 4;
        }
      });
      return gltf;
    });
    cache.set(url, p);
  }
  return p;
}

/**
 * Bakes many placements of pack models into ONE mesh per material. A whole town of KayKit pieces
 * shares a single atlas material, so it renders in a single draw call.
 */
export function mergeStatic(pack: THREE.Object3D, placements: Placement[], opts: { cast?: boolean; receive?: boolean } = {}): THREE.Group {
  pack.updateWorldMatrix(true, true);
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const place = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const nodes = new Map<string, THREE.Object3D>();
  for (const child of pack.children) nodes.set(child.name, child);
  for (const p of placements) {
    const node = nodes.get(p.model);
    if (!node) {
      console.warn('missing model', p.model);
      continue;
    }
    place.compose(new THREE.Vector3(p.x, p.y ?? 0, p.z), q.setFromAxisAngle(up, p.rot), new THREE.Vector3(p.scale, p.scale, p.scale));
    const inv = new THREE.Matrix4().copy(node.matrixWorld).invert();
    node.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      // node-local transform (pack nodes sit at the origin), then the placement.
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld)).applyMatrix4(place);
      const mat = mesh.material as THREE.Material;
      if (!buckets.has(mat)) buckets.set(mat, []);
      buckets.get(mat)!.push(g);
    });
  }
  const group = new THREE.Group();
  for (const [mat, list] of buckets) {
    const merged = mergeGeometries(list, false);
    list.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = opts.cast ?? true;
    mesh.receiveShadow = opts.receive ?? true;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  return group;
}

export function disposeGroup(group: THREE.Object3D) {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) mesh.geometry.dispose();
  });
}

/** A single pack node, cloned (geometry and material stay shared). */
export function cloneModel(pack: THREE.Object3D, model: string): THREE.Object3D | null {
  const node = pack.children.find((c) => c.name === model);
  if (!node) return null;
  const copy = node.clone(true);
  copy.position.set(0, 0, 0);
  return copy;
}

// ---------------------------------------------------------------- text sprites
const textureCache = new Map<string, THREE.CanvasTexture>();

export function labelTexture(key: string, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, w = 512, h = 128): THREE.CanvasTexture {
  let tex = textureCache.get(key);
  if (tex) return tex;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d')!, w, h);
  tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  textureCache.set(key, tex);
  if (textureCache.size > 400) {
    const first = textureCache.keys().next().value as string;
    textureCache.get(first)?.dispose();
    textureCache.delete(first);
  }
  return tex;
}

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else line = test;
  }
  if (lines.length < maxLines && line) lines.push(line);
  else if (line && lines.length === maxLines) lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,2}$/, '…');
  return lines;
}

export const FONT = '"Inter", "Segoe UI", system-ui, sans-serif';
