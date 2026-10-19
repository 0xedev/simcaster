import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { Store, validateAvatar, validateHome, sampleFeed, SUPPORTED_CURRENCIES, DEFAULT_CURRENCIES, normalizeCurrency } from '../server/storage.js';
test('avatar and furniture input validation',()=>{
  assert.deepEqual(validateAvatar({color:'violet',outfit:'street',hair:'short'}),{color:'violet',outfit:'street',hair:'short',skin:'warm',hairColor:'espresso',accessory:'none',build:'regular'});
  assert.deepEqual(validateAvatar({color:'sky',outfit:'formal',hair:'curls',skin:'deep',hairColor:'auburn',accessory:'glasses',build:'broad'}),{color:'sky',outfit:'formal',hair:'curls',skin:'deep',hairColor:'auburn',accessory:'glasses',build:'broad'});
  assert.throws(()=>validateAvatar({color:'sky',outfit:'sport',hair:'buzz',skin:'unknown'}));
  assert.throws(()=>validateAvatar({color:'sky',outfit:'sport',hair:'buzz',accessory:'unsafe'}));
  assert.throws(()=>validateAvatar({color:'admin',outfit:'street',hair:'short'}));
  assert.throws(()=>validateHome({items:[{type:'sofa',x:50,z:2}]}));
});
test('sessions are random, revocable, and account persisted',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'simcaster-'));
  try {
    const filename=path.join(temp,'store.json');
    const store=new Store(filename);
    store.userFor(99,{displayName:'Test'});
    const token=store.startSession(99);
    assert.ok(store.verifySession(token));
    assert.equal(store.verifySession('not-valid'),null);
    store.updateAvatar(99,{color:'sky',outfit:'formal',hair:'long'});
    const loaded=new Store(filename);
    assert.equal(loaded.findUser(99).avatar.color,'sky');
    store.revokeSession(token);
    assert.equal(store.verifySession(token),null);
  }finally {fs.rmSync(temp,{recursive:true,force:true});}
});

test('approved signer binding belongs to an account and survives reload',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'simcaster-signer-'));
  try{
    const file=path.join(temp,'store.json');
    const store=new Store(file);
    store.userFor(101);store.userFor(102);
    const uuid='8d0494d9-e0cf-402b-ab0a-394ac7fe07a0';
    store.setSigner(101,uuid);
    assert.equal(store.signerFor(102),null);
    assert.equal(new Store(file).signerFor(101),uuid);
    store.setSigner(101,null);
    assert.equal(store.signerFor(101),null);
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
});

test('friend requests require consent and persist across restarts',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'simcaster-friends-'));
  try{
    const store=new Store(path.join(temp,'state.json'));
    store.userFor(101,{displayName:'Alex'});store.userFor(102,{displayName:'Mia'});
    assert.throws(()=>store.requestFriend(101,999),/not joined/);
    store.requestFriend(101,102);
    assert.equal(store.friendsFor(101)[0].status,'sent');
    assert.equal(store.friendsFor(102)[0].status,'incoming');
    assert.throws(()=>store.acceptFriend(101,102));
    store.acceptFriend(102,101);
    assert.equal(store.friendsFor(101)[0].status,'friends');
    const fromDisk=new Store(path.join(temp,'state.json'));
    assert.equal(fromDisk.friendsFor(102)[0].status,'friends');
    fromDisk.block(101,102);
    assert.equal(fromDisk.friendsFor(101).length,0);
    assert.throws(()=>fromDisk.requestFriend(102,101),/blocked/);
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
});

test('home visits require accepted friendship and respect blocking',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'simcaster-visits-'));
  try{
    const store=new Store(path.join(temp,'state.json'));
    store.userFor(701,{displayName:'Owner'});store.userFor(702,{displayName:'Guest'});
    assert.equal(store.canVisitHome(701,701),true);
    assert.equal(store.canVisitHome(702,701),false);
    store.requestFriend(701,702);
    assert.equal(store.canVisitHome(702,701),false);
    store.acceptFriend(702,701);
    assert.equal(store.canVisitHome(702,701),true);
    store.block(701,702);
    assert.equal(store.canVisitHome(702,701),false);
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
});

test('economy, hotspot jobs, furniture catalog, home upgrades, and mayor election work end-to-end',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'simcaster-econ-'));
  try{
    const store=new Store(path.join(temp,'state.json'));
    const u=store.userFor(801,{displayName:'Tunde'});
    assert.equal(u.creds,250);
    assert.equal(u.homeTier,'studio');
    const job=store.performHotspotAction(801,'foundry-hub');
    assert.ok(job.deltaCreds>=55);
    assert.ok(store.findUser(801).xp>=18);
    store.buyFurniture(801,'arcade_cabinet');
    assert.ok(store.findUser(801).ownedFurniture.includes('arcade_cabinet'));
    store.updateHome(801,{items:[{type:'arcade_cabinet',x:2,z:2,rot:90}]});
    assert.equal(store.homeFor(801).items[0].rot,90);
    // Grant enough creds & xp for loft + mayor nomination
    const raw=store.state.accounts['801'];
    raw.creds=3000;
    raw.xp=500;
    store.upgradeHomeTier(801,'loft');
    assert.equal(store.findUser(801).homeTier,'loft');
    store.nominateMayor(801,'Free espresso for every builder!','zero_cafe_tax');
    const city=store.voteMayor(801,801);
    assert.equal(city.mayor.fid,801);
    assert.equal(city.activePolicy,'zero_cafe_tax');
    // civic_life quest is now 1/1 from voting/nominating; claim it!
    const claimed=store.claimQuest(801,'civic_life');
    assert.equal(claimed.rewardCreds,100);
    assert.equal(store.findUser(801).quests.civic_life.claimed,true);
    assert.throws(()=>store.claimQuest(801,'civic_life'),/already claimed/);
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
});

test('sampleFeed generates rich district-themed feeds filtered by channel', () => {
  const allCasts = sampleFeed();
  assert.ok(Array.isArray(allCasts));
  assert.ok(allCasts.length >= 8);

  const devCasts = sampleFeed('dev');
  assert.ok(devCasts.length >= 2);
  assert.ok(devCasts.every((c) => c.channel === 'dev'));

  const memesCasts = sampleFeed('/memes'); // with leading slash
  assert.ok(memesCasts.length >= 2);
  assert.ok(memesCasts.every((c) => c.channel === 'memes'));

  const baseCasts = sampleFeed('base');
  assert.ok(baseCasts.length >= 2);
  assert.ok(baseCasts.every((c) => c.channel === 'base'));

  const farcasterCasts = sampleFeed('/farcaster');
  assert.ok(farcasterCasts.length >= 2);
  assert.ok(farcasterCasts.every((c) => c.channel === 'farcaster'));

  // Invalid channel returns empty array
  assert.deepEqual(sampleFeed('non-existent-channel'), []);
});

test('createCast tags casts with normalized channel and persists across reload', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'simcaster-cast-channel-'));
  try {
    const file = path.join(temp, 'store.json');
    const store = new Store(file);
    store.userFor(901, { displayName: 'Devon Builder' });

    // 1. Cast with plain channel identifier
    const c1 = store.createCast(901, { text: 'Building on /dev!', channel: 'dev' });
    assert.equal(c1.channel, 'dev');

    // 2. Cast with leading slash normalized
    const c2 = store.createCast(901, { text: 'Arcade meme time!', channel: '/memes' });
    assert.equal(c2.channel, 'memes');

    // 3. Cast with object format
    const c3 = store.createCast(901, { text: 'Base market drop!', channel: { id: 'base' } });
    assert.equal(c3.channel, 'base');

    // 4. Untagged cast defaults to null
    const c4 = store.createCast(901, { text: 'Global plaza cast!' });
    assert.equal(c4.channel, null);

    // 5. Verification on reload from disk
    const reloaded = new Store(file);
    const devFound = reloaded.state.casts.find((c) => c.hash === c1.hash);
    assert.ok(devFound);
    assert.equal(devFound.channel, 'dev');

    // 6. Channel filtering in decorateCasts
    const devFeed = reloaded.decorateCasts([], 901, 'dev');
    assert.ok(devFeed.some((c) => c.hash === c1.hash));
    assert.ok(!devFeed.some((c) => c.hash === c2.hash));
    assert.ok(!devFeed.some((c) => c.hash === c3.hash));

    const memesFeed = reloaded.decorateCasts([], 901, '/memes');
    assert.ok(memesFeed.some((c) => c.hash === c2.hash));
    assert.ok(!memesFeed.some((c) => c.hash === c1.hash));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('multi-currency initialization and creds synchronization', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'simcaster-currencies-'));
  try {
    const filename = path.join(temp, 'store.json');
    const store = new Store(filename);
    const u1 = store.userFor(101, { displayName: 'Alice' });

    assert.equal(u1.creds, 250);
    assert.ok(u1.currencies, 'currencies object exists');
    assert.equal(u1.currencies.degen, 1000);
    assert.equal(u1.currencies.moxie, 500);
    assert.equal(u1.currencies.warps, 100);
    assert.equal(u1.currencies.creds, 250);

    // Sync verification: modifying creds syncs currencies.creds and vice versa
    u1.creds = 400;
    store.ensureLifeState(u1);
    assert.equal(u1.currencies.creds, 400);

    u1.currencies.creds = 300;
    u1.creds = 300;
    store.ensureLifeState(u1);
    assert.equal(u1.creds, 300);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('transferTip transfers balance, awards clout and vibe, and persists across reload', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'simcaster-tip-'));
  try {
    const filename = path.join(temp, 'store.json');
    const store = new Store(filename);
    const alice = store.userFor(201, { displayName: 'Alice', username: 'alice' });
    const bob = store.userFor(202, { displayName: 'Bob', username: 'bob' });

    const initialAliceClout = alice.needs.clout;
    const initialAliceVibe = alice.needs.vibe;
    const initialBobClout = bob.needs.clout;
    const initialBobVibe = bob.needs.vibe;

    // Tip 50 DEGEN
    const tipResult = store.transferTip(201, 202, 50, 'degen');
    assert.equal(tipResult.fromFid, 201);
    assert.equal(tipResult.toFid, 202);
    assert.equal(tipResult.amount, 50);
    assert.equal(tipResult.currency, 'degen');
    assert.equal(tipResult.fromBalance, 950);
    assert.equal(tipResult.toBalance, 1050);
    assert.equal(tipResult.cloutAwarded, 5);
    assert.equal(tipResult.vibeAwarded, 5);

    assert.equal(alice.currencies.degen, 950);
    assert.equal(bob.currencies.degen, 1050);
    assert.equal(alice.needs.clout, Math.min(100, initialAliceClout + 5));
    assert.equal(alice.needs.vibe, Math.min(100, initialAliceVibe + 5));
    assert.equal(bob.needs.clout, Math.min(100, initialBobClout + 5));
    assert.equal(bob.needs.vibe, Math.min(100, initialBobVibe + 5));

    // Tip 25 CREDS (must update both creds and currencies.creds)
    const credTip = store.transferTip(201, 202, 25, 'creds');
    assert.equal(credTip.fromBalance, 225);
    assert.equal(credTip.toBalance, 275);
    assert.equal(alice.creds, 225);
    assert.equal(alice.currencies.creds, 225);
    assert.equal(bob.creds, 275);
    assert.equal(bob.currencies.creds, 275);

    // Verify persistence in newly instantiated store
    const reloaded = new Store(filename);
    const reloadedAlice = reloaded.findUser(201);
    const reloadedBob = reloaded.findUser(202);

    assert.equal(reloadedAlice.currencies.degen, 950);
    assert.equal(reloadedBob.currencies.degen, 1050);
    assert.equal(reloadedAlice.creds, 225);
    assert.equal(reloadedBob.creds, 275);
    assert.equal(reloadedAlice.needs.clout, alice.needs.clout);
    assert.equal(reloadedBob.needs.clout, bob.needs.clout);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('transferTip input validation and error rejection invariants', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'simcaster-tip-guards-'));
  try {
    const filename = path.join(temp, 'store.json');
    const store = new Store(filename);
    store.userFor(301, { displayName: 'Sender' });
    store.userFor(302, { displayName: 'Recipient' });

    // Self-tipping
    assert.throws(
      () => store.transferTip(301, 301, 10, 'degen'),
      (err) => err.message.includes('Cannot tip yourself')
    );

    // Negative / zero / float / non-numeric amounts
    assert.throws(() => store.transferTip(301, 302, 0, 'degen'), /positive integer/);
    assert.throws(() => store.transferTip(301, 302, -10, 'degen'), /positive integer/);
    assert.throws(() => store.transferTip(301, 302, 12.5, 'degen'), /positive integer/);
    assert.throws(() => store.transferTip(301, 302, NaN, 'degen'), /positive integer/);
    assert.throws(() => store.transferTip(301, 302, 'abc', 'degen'), /positive integer/);

    // Unsupported currency
    assert.throws(() => store.transferTip(301, 302, 10, 'bitcoin'), /Unsupported currency/);
    assert.throws(() => store.transferTip(301, 302, 10, ''), /Unsupported currency/);

    // Insufficient balance (402)
    assert.throws(
      () => store.transferTip(301, 302, 50000, 'degen'),
      (err) => err.code === 'INSUFFICIENT_BALANCE'
    );

    // Non-existent recipient (404)
    assert.throws(
      () => store.transferTip(301, 999999999, 10, 'degen'),
      (err) => err.code === 'RECIPIENT_NOT_FOUND'
    );

    // Blocked recipient
    store.block(301, 302);
    assert.throws(
      () => store.transferTip(301, 302, 10, 'degen'),
      /Cannot tip a blocked player/
    );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});



