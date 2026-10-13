import test from 'node:test';
import assert from 'node:assert/strict';
import { movement, cleanChat, canHit, sanitizeRoom, SHOT_COOLDOWN_MS } from '../server/rules.js';
test('movement is normalized, bounded and cannot teleport',()=>{
  const a=movement({dx:100,dz:100},10);
  assert.ok(Math.hypot(a.dx,a.dz)<=0.85);
  assert.deepEqual(movement({dx:Infinity,dz:0},1),{dx:0,dz:0});
  assert.deepEqual(movement(null,1),{dx:0,dz:0});
});
test('chat limits length and strips HTML delimiters',()=>{
  assert.equal(cleanChat(' <hello> '),'hello');
  assert.equal(cleanChat('a'.repeat(500)).length,180);
});
test('rooms sanitize unknown types',()=>{
  assert.equal(sanitizeRoom('root-admin'),'plaza');
  assert.equal(sanitizeRoom('arena'),'arena');
});
test('shot requires facing, distance and rate limit',()=>{
  const p={id:1,x:0,z:0,heading:0,lastShot:0,hp:3};
  const t={id:2,x:0,z:5,hp:3};
  assert.equal(canHit(p,t,SHOT_COOLDOWN_MS+10),true);
  assert.equal(canHit({...p,heading:Math.PI},t,2000),false);
  assert.equal(canHit(p,{...t,z:30},2000),false);
  assert.equal(canHit({...p,lastShot:1000},t,1001),false);
  assert.equal(canHit(p,{...t,hp:0},2000),false);
});
