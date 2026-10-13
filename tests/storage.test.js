import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { Store,validateAvatar,validateHome } from '../server/storage.js';
test('avatar and furniture input validation',()=>{
  assert.deepEqual(validateAvatar({color:'violet',outfit:'street',hair:'short'}),{color:'violet',outfit:'street',hair:'short'});
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
