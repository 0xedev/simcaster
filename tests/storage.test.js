import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { Store,validateAvatar,validateHome } from '../server/storage.js';
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
