import test from 'node:test';
import assert from 'node:assert/strict';
import { movement, cleanChat, canHit, sanitizeRoom, SHOT_COOLDOWN_MS, collidesWithPlaza, collidesWithArena, lineBlockedByArena, careerForXp } from '../server/rules.js';
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

test('plaza geometry blocks the fountain and buildings',()=>{
  assert.equal(collidesWithPlaza(0,0),true);
  assert.equal(collidesWithPlaza(-14,-13),true);
  assert.equal(collidesWithPlaza(5,5),false);
});

test('arena cover bunkers block movement and laser line-of-sight',()=>{
  assert.equal(collidesWithArena(7.5,7.5),true);
  assert.equal(collidesWithArena(0,0),false);
  assert.equal(lineBlockedByArena(5,7.5,10,7.5),true);
  assert.equal(lineBlockedByArena(0,0,0,5),false);
  const shooter={id:1,x:5,z:7.5,heading:Math.PI/2,lastShot:0,hp:3};
  const behindCover={id:2,x:10,z:7.5,hp:3};
  assert.equal(canHit(shooter,behindCover,SHOT_COOLDOWN_MS+10),false);
});

test('career promotion scales with XP thresholds',()=>{
  assert.equal(careerForXp(0).id,'newcomer');
  assert.equal(careerForXp(150).id,'creator');
  assert.equal(careerForXp(2500).id,'mogul');
});

