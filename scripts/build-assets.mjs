// Packs CC0 KayKit model kits (https://github.com/KayKit-Game-Assets) into a few GLBs.
// Usage: node scripts/build-assets.mjs <dir containing the cloned KayKit repos>
// Output: public/models/{city,furniture,kitchen}.glb, public/models/char-*.glb, shared/models.json
import { NodeIO, Document } from '@gltf-transform/core';
import { dedup, prune, mergeDocuments, unpartition, getBounds, textureCompress, weld, quantize } from '@gltf-transform/functions';
import sharp from 'sharp';
import { KHRMeshQuantization } from '@gltf-transform/extensions';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(process.argv[2] || '../assets');
const OUT = path.resolve('public/models');
const io = new NodeIO().registerExtensions([KHRMeshQuantization]);
const webp = textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 88 });
const manifest = {};
const r3 = (n) => Math.round(n * 1000) / 1000;

function findGltfDir(repo) {
  const hits = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.git') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.gltf')) hits.push(p);
    }
  };
  walk(path.join(SRC, repo));
  return hits;
}

async function pack(name, repo, filter) {
  const files = findGltfDir(repo).filter((f) => filter(path.basename(f, '.gltf'))).sort();
  const doc = new Document();
  doc.createBuffer();
  const scene = doc.createScene(name);
  doc.getRoot().setDefaultScene(scene);
  manifest[name] = {};
  for (const file of files) {
    const id = path.basename(file, '.gltf');
    const part = await io.read(file);
    const before = new Set(doc.getRoot().listNodes());
    const map = mergeDocuments(doc, part);
    const group = doc.createNode(id);
    for (const s of part.getRoot().listScenes()) {
      const merged = map.get(s);
      for (const child of merged.listChildren()) group.addChild(child);
      if (merged !== scene) merged.dispose();
    }
    scene.addChild(group);
    const b = getBounds(group);
    manifest[name][id] = { min: b.min.map(r3), max: b.max.map(r3) };
  }
  await doc.transform(unpartition(), dedup(), prune(), webp);
  const out = path.join(OUT, name + '.glb');
  await io.write(out, doc);
  console.log(name, files.length, 'models', (fs.statSync(out).size / 1024).toFixed(0), 'KB',
    'materials', doc.getRoot().listMaterials().length, 'textures', doc.getRoot().listTextures().length);
}

const KEEP_ANIMS = ['Idle', 'Walking_A', 'Running_A', 'Sit_Chair_Down', 'Sit_Chair_Idle', 'Sit_Chair_StandUp',
  'Sit_Floor_Idle', 'Lie_Down', 'Lie_Idle', 'Interact', 'PickUp', 'Use_Item', 'Cheer', 'Jump_Full_Short',
  'Spellcasting', 'Throw', 'Hit_A'];

async function character(id, file, keepAnims) {
  const doc = await io.read(file);
  for (const a of doc.getRoot().listAnimations()) {
    if (!keepAnims || !KEEP_ANIMS.includes(a.getName())) a.dispose();
  }
  // Adventurer props (weapons, shields, books) don't belong in a social sim.
  for (const n of doc.getRoot().listNodes()) {
    if (n.getMesh() && /Knife|Crossbow|Sword|Axe|Shield|Spellbook|Wand|Staff|Throwable|Mug/.test(n.getName())) n.dispose();
  }
  await doc.transform(dedup(), prune(), webp);
  const out = path.join(OUT, `char-${id}.glb`);
  await io.write(out, doc);
  const nodes = doc.getRoot().listNodes().filter((n) => n.getMesh()).map((n) => n.getName());
  manifest.chars ||= {};
  manifest.chars[id] = { parts: nodes };
  console.log('char', id, (fs.statSync(out).size / 1024).toFixed(0), 'KB', 'anims', doc.getRoot().listAnimations().length, nodes.join(','));
}

fs.mkdirSync(OUT, { recursive: true });
await pack('city', 'KayKit-City-Builder-Bits-1.0', (n) => !n.endsWith('_withoutBase'));
await pack('furniture', 'KayKit-Furniture-Bits-1.0', () => true);
await pack('kitchen', 'KayKit-Restaurant-Bits-1.0', (n) =>
  /^(fridge_A|fridge_B|stove_multi|oven|kitchencounter_straight_A|kitchencounter_sink|kitchentable_A|table_round_A|chair_A|food_burger|plate|floor_kitchen|wall|wall_doorway|wall_half|door_A)$/.test(n));
const chars = path.join(SRC, 'KayKit-Character-Pack-Adventures-1.0/addons/kaykit_character_pack_adventures/Characters/gltf');
await character('rogue', path.join(chars, 'Rogue.glb'), true);
for (const c of ['Mage', 'Knight', 'Barbarian', 'Rogue_Hooded']) await character(c.toLowerCase(), path.join(chars, c + '.glb'), false);
fs.writeFileSync('shared/models.json', JSON.stringify(manifest, null, 1));
