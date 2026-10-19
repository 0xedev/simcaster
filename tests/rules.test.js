import test from 'node:test';
import assert from 'node:assert/strict';
import {
  movement,
  cleanChat,
  canHit,
  sanitizeRoom,
  SHOT_COOLDOWN_MS,
  collidesWithPlaza,
  collidesWithArena,
  lineBlockedByArena,
  careerForXp,
  DISTRICTS,
  getPlazaDistrict,
  getDistrictByChannel
} from '../server/rules.js';

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

test('DISTRICTS definition contains all four required Farcaster channel zones', () => {
  const expectedKeys = ['farcaster', 'dev', 'memes', 'base'];
  assert.deepEqual(Object.keys(DISTRICTS), expectedKeys);

  // Validate /farcaster
  assert.equal(DISTRICTS.farcaster.id, 'farcaster');
  assert.equal(DISTRICTS.farcaster.channel, 'farcaster');
  assert.equal(DISTRICTS.farcaster.pill, '/farcaster');
  assert.equal(DISTRICTS.farcaster.name, 'Main Plaza');
  assert.ok(DISTRICTS.farcaster.color.startsWith('#'));
  assert.ok(DISTRICTS.farcaster.accent.startsWith('#'));

  // Validate /dev
  assert.equal(DISTRICTS.dev.id, 'dev');
  assert.equal(DISTRICTS.dev.channel, 'dev');
  assert.equal(DISTRICTS.dev.pill, '/dev');
  assert.equal(DISTRICTS.dev.name, 'Builders Foundry');

  // Validate /memes
  assert.equal(DISTRICTS.memes.id, 'memes');
  assert.equal(DISTRICTS.memes.channel, 'memes');
  assert.equal(DISTRICTS.memes.pill, '/memes');
  assert.equal(DISTRICTS.memes.name, 'Arcade Lounge');

  // Validate /base
  assert.equal(DISTRICTS.base.id, 'base');
  assert.equal(DISTRICTS.base.channel, 'base');
  assert.equal(DISTRICTS.base.pill, '/base');
  assert.equal(DISTRICTS.base.name, 'Onchain Market');
});

test('getPlazaDistrict classifies coordinates by center radius and quadrants', () => {
  // Center fountain core (radius <= 4.0) -> /farcaster
  assert.equal(getPlazaDistrict(0, 0).id, 'farcaster');
  assert.equal(getPlazaDistrict(0, -3.2).id, 'farcaster'); // Hub Relay Core
  assert.equal(getPlazaDistrict(2.5, 2.5).id, 'farcaster'); // hypot ≈ 3.53 <= 4.0
  assert.equal(getPlazaDistrict(4.0, 0).id, 'farcaster'); // exactly on boundary

  // Northeast (+X, -Z) -> /dev Builders Foundry
  assert.equal(getPlazaDistrict(6, -10.8).id, 'dev'); // The Foundry Studio
  assert.equal(getPlazaDistrict(12, -4).id, 'dev');
  assert.equal(getPlazaDistrict(0.1, -4.5).id, 'dev');

  // Southwest (-X, +Z) -> /memes Arcade Lounge
  assert.equal(getPlazaDistrict(-5.5, 10.6).id, 'memes'); // Purple Channel Lounge
  assert.equal(getPlazaDistrict(-10, 5).id, 'memes');
  assert.equal(getPlazaDistrict(-4.5, 0.1).id, 'memes');

  // Southeast (+X, +Z) -> /base Onchain Market
  assert.equal(getPlazaDistrict(6.5, 10.6).id, 'base'); // Onchain Pop-Up Market
  assert.equal(getPlazaDistrict(10, 10).id, 'base');
  assert.equal(getPlazaDistrict(5, 5).id, 'base');

  // Northwest (-X, -Z) -> /farcaster Main Plaza Extension
  assert.equal(getPlazaDistrict(-6, -10.8).id, 'farcaster'); // Warp Bean Café
  assert.equal(getPlazaDistrict(-12, -12).id, 'farcaster');

  // Robustness & fallback on invalid inputs
  assert.equal(getPlazaDistrict(null, undefined).id, 'farcaster');
  assert.equal(getPlazaDistrict(NaN, 0).id, 'farcaster');
  assert.equal(getPlazaDistrict('abc', 'def').id, 'farcaster');
});

test('getDistrictByChannel normalizes channel queries with or without slashes', () => {
  assert.equal(getDistrictByChannel('farcaster')?.id, 'farcaster');
  assert.equal(getDistrictByChannel('/farcaster')?.id, 'farcaster');
  assert.equal(getDistrictByChannel('/dev')?.id, 'dev');
  assert.equal(getDistrictByChannel('DEV')?.id, 'dev');
  assert.equal(getDistrictByChannel('  /memes  ')?.id, 'memes');
  assert.equal(getDistrictByChannel('/base')?.id, 'base');
  assert.equal(getDistrictByChannel('unknown-channel'), null);
  assert.equal(getDistrictByChannel(null), null);
});


