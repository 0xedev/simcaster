import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';
import {
  Store,
  SUPPORTED_CURRENCIES,
  DEFAULT_CURRENCIES,
  normalizeCurrency
} from '../server/storage.js';

// Helper for waiting until HTTP server is ready
async function waitFor(url, attempts = 120) {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Server did not start at ' + url);
}

// Helper for WebSocket event waiting
const openSocket = (url, cookie, origin) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers: { cookie, origin } });
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });

const waitPacket = (ws, event, match = () => true, timeoutMs = 4000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMessage);
      reject(new Error(`Timeout waiting for event "${event}"`));
    }, timeoutMs);
    function onMessage(raw) {
      let packet;
      try {
        packet = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (packet.event === event && match(packet.data)) {
        clearTimeout(timer);
        ws.off('message', onMessage);
        resolve(packet.data);
      }
    }
    ws.on('message', onMessage);
  });

// =========================================================================
// SECTION 1: IN-MEMORY & PERSISTENCE STORAGE PROBES (transferTip invariants)
// =========================================================================

test('CHALLENGER: Storage transferTip - Overdraft Protection & Balance Conservation', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'simcaster-chal-overdraft-'));
  try {
    const file = path.join(temp, 'store.json');
    const store = new Store(file);

    const alice = store.userFor(1001, { displayName: 'Alice' });
    const bob = store.userFor(1002, { displayName: 'Bob' });

    // Set exact balance for Alice
    alice.currencies.degen = 250;
    bob.currencies.degen = 100;
    const initialTotal = alice.currencies.degen + bob.currencies.degen;

    // 1. Tipping exact balance (250) succeeds, leaving exactly 0
    const tip1 = store.transferTip(1001, 1002, 250, 'degen');
    assert.equal(tip1.fromBalance, 0);
    assert.equal(tip1.toBalance, 350);
    assert.equal(alice.currencies.degen, 0);
    assert.equal(bob.currencies.degen, 350);
    assert.equal(alice.currencies.degen + bob.currencies.degen, initialTotal, 'Total currency conserved');

    // 2. Off-by-one overdraft: tipping 1 when balance is 0 fails with INSUFFICIENT_BALANCE
    assert.throws(
      () => store.transferTip(1001, 1002, 1, 'degen'),
      (err) => err.code === 'INSUFFICIENT_BALANCE' && err.message.includes('Insufficient DEGEN balance')
    );
    assert.equal(alice.currencies.degen, 0, 'Balance must remain 0 on failed overdraft');
    assert.equal(bob.currencies.degen, 350, 'Recipient balance unchanged on failed overdraft');

    // 3. Multi-currency isolation: Alice has 500 moxie but 0 degen.
    alice.currencies.moxie = 500;
    bob.currencies.moxie = 500;
    // Tipping degen fails
    assert.throws(() => store.transferTip(1001, 1002, 10, 'degen'), (err) => err.code === 'INSUFFICIENT_BALANCE');
    // Tipping moxie succeeds
    const tipMoxie = store.transferTip(1001, 1002, 100, 'moxie');
    assert.equal(tipMoxie.fromBalance, 400);
    assert.equal(alice.currencies.moxie, 400);
    assert.equal(bob.currencies.moxie, 600);

    // 4. Creds dual-synchronization under overdraft
    alice.creds = 50;
    alice.currencies.creds = 50;
    bob.creds = 100;
    bob.currencies.creds = 100;

    // Attempting to tip 51 creds fails
    assert.throws(
      () => store.transferTip(1001, 1002, 51, 'creds'),
      (err) => err.code === 'INSUFFICIENT_BALANCE'
    );
    assert.equal(alice.creds, 50, 'creds field must remain untouched');
    assert.equal(alice.currencies.creds, 50, 'currencies.creds must remain untouched');

    // Tipping exactly 50 creds succeeds and drains both fields to 0
    const credTip = store.transferTip(1001, 1002, 50, 'creds');
    assert.equal(credTip.fromBalance, 0);
    assert.equal(alice.creds, 0);
    assert.equal(alice.currencies.creds, 0);
    assert.equal(bob.creds, 150);
    assert.equal(bob.currencies.creds, 150);

    // Reload store from disk to ensure persistence integrity
    const reloaded = new Store(file);
    const rAlice = reloaded.findUser(1001);
    const rBob = reloaded.findUser(1002);
    assert.equal(rAlice.currencies.degen, 0);
    assert.equal(rAlice.currencies.creds, 0);
    assert.equal(rAlice.creds, 0);
    assert.equal(rBob.currencies.degen, 350);
    assert.equal(rBob.currencies.creds, 150);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('CHALLENGER: Storage transferTip - Zero, Negative, Non-Integer, and Non-Numeric Amount Invariants', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'simcaster-chal-amounts-'));
  try {
    const file = path.join(temp, 'store.json');
    const store = new Store(file);
    store.userFor(2001, { displayName: 'Sender' });
    store.userFor(2002, { displayName: 'Recipient' });

    const strictlyRejectedAmounts = [
      // Zero & negative
      0,
      -0,
      -1,
      -50,
      -1000,
      -Number.MAX_SAFE_INTEGER,
      // Fractional / Float
      0.1,
      0.5,
      1.0000000001,
      12.5,
      99.99,
      Number.EPSILON,
      1e-10,
      1e-300,
      // Special numbers
      NaN,
      Infinity,
      -Infinity,
      // Unsafe integers
      Number.MAX_SAFE_INTEGER + 1,
      2 ** 54,
      // Non-numeric types that fail Number.isSafeInteger or <= 0
      'abc',
      '',
      '   ',
      '0',
      '-10',
      '12.5',
      'NaN',
      {},
      [],
      { amount: 50 },
      null,
      undefined,
      false
    ];

    for (const val of strictlyRejectedAmounts) {
      assert.throws(
        () => store.transferTip(2001, 2002, val, 'degen'),
        /positive integer/,
        `Amount ${String(val)} must be rejected as non-positive-integer`
      );
    }

    // Adversarial finding: JavaScript Number(x) implicit coercion probe:
    // In transferTip, `Number([10]) === 10` and `Number(true) === 1`.
    // We empirically probe that transferTip coerces [10] to 10 and true to 1:
    const sender = store.findUser(2001);
    const balanceBefore = sender.currencies.degen;
    const probeCoerce = store.transferTip(2001, 2002, true, 'degen');
    assert.equal(probeCoerce.amount, 1, 'transferTip implicitly coerced boolean true to integer 1');
    assert.equal(sender.currencies.degen, balanceBefore - 1);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('CHALLENGER: Storage transferTip - Self-Tipping Prohibition & State Non-Disruption', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'simcaster-chal-selftip-'));
  try {
    const file = path.join(temp, 'store.json');
    const store = new Store(file);
    const self = store.userFor(3001, { displayName: 'Narcissus' });

    const initialDegen = self.currencies.degen;
    const initialClout = self.needs.clout;
    const initialVibe = self.needs.vibe;

    // Self tip attempt with number
    assert.throws(
      () => store.transferTip(3001, 3001, 50, 'degen'),
      /Cannot tip yourself/
    );

    // Self tip attempt with string FID
    assert.throws(
      () => store.transferTip(3001, '3001', 50, 'degen'),
      /Cannot tip yourself/
    );

    // Invariant: No balance deducted, no clout/vibe awarded
    assert.equal(self.currencies.degen, initialDegen);
    assert.equal(self.needs.clout, initialClout);
    assert.equal(self.needs.vibe, initialVibe);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('CHALLENGER: Storage transferTip - Non-Existent and Blocked Account Invariants', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'simcaster-chal-accounts-'));
  try {
    const file = path.join(temp, 'store.json');
    const store = new Store(file);
    store.userFor(4001, { displayName: 'Alice' });
    store.userFor(4002, { displayName: 'Bob' });

    // 1. Non-existent recipient account (> 10 and not 12345)
    assert.throws(
      () => store.transferTip(4001, 9999999, 10, 'degen'),
      (err) => err.code === 'RECIPIENT_NOT_FOUND' && err.message.includes('Recipient account not found')
    );

    // 2. Invalid recipient FIDs
    const badFids = [0, -1, -999, 1.5, NaN, Infinity, -Infinity, 'abc', '', null, undefined];
    for (const badFid of badFids) {
      assert.throws(
        () => store.transferTip(4001, badFid, 10, 'degen'),
        /Invalid recipient FID/
      );
    }

    // 3. Invalid sender FID
    for (const badFid of badFids) {
      assert.throws(
        () => store.transferTip(badFid, 4002, 10, 'degen'),
        /Invalid sender FID/
      );
    }

    // 4. Non-existent sender account
    assert.throws(
      () => store.transferTip(8888888, 4002, 10, 'degen'),
      /Sender account not found/
    );

    // 5. Blocked relationships (Bidirectional enforcement)
    // Scenario A: Alice blocks Bob
    store.block(4001, 4002);
    assert.throws(
      () => store.transferTip(4001, 4002, 10, 'degen'),
      /Cannot tip a blocked player/
    );
    // Bob attempts to tip Alice (blocked by Alice)
    assert.throws(
      () => store.transferTip(4002, 4001, 10, 'degen'),
      /Cannot tip a blocked player/
    );

    // Scenario B: Unblock by clearing block record
    store.state.blocked['4001'] = [];
    // Tip now succeeds
    const tipAfterUnblock = store.transferTip(4001, 4002, 10, 'degen');
    assert.equal(tipAfterUnblock.amount, 10);

    // Scenario C: Bob blocks Alice
    store.block(4002, 4001);
    assert.throws(
      () => store.transferTip(4001, 4002, 10, 'degen'),
      /Cannot tip a blocked player/
    );
    assert.throws(
      () => store.transferTip(4002, 4001, 10, 'degen'),
      /Cannot tip a blocked player/
    );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('CHALLENGER: Storage transferTip - Clout and Vibe Clamping at Exactly 100', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'simcaster-chal-clamping-'));
  try {
    const file = path.join(temp, 'store.json');
    const store = new Store(file);
    const alice = store.userFor(5001, { displayName: 'Alice' });
    const bob = store.userFor(5002, { displayName: 'Bob' });

    // Test vectors for need values before tip
    const testCases = [
      { startAlice: 90, startBob: 90, expectedAlice: 95, expectedBob: 95, desc: 'Normal increment (+5)' },
      { startAlice: 95, startBob: 95, expectedAlice: 100, expectedBob: 100, desc: 'Exact hit to 100' },
      { startAlice: 97, startBob: 98, expectedAlice: 100, expectedBob: 100, desc: 'Overflow clamped to 100' },
      { startAlice: 99, startBob: 99, expectedAlice: 100, expectedBob: 100, desc: 'Single-point overflow clamped' },
      { startAlice: 100, startBob: 100, expectedAlice: 100, expectedBob: 100, desc: 'Already at ceiling remains 100' }
    ];

    for (const tc of testCases) {
      alice.needs.clout = tc.startAlice;
      alice.needs.vibe = tc.startAlice;
      bob.needs.clout = tc.startBob;
      bob.needs.vibe = tc.startBob;

      store.transferTip(5001, 5002, 10, 'degen');

      assert.equal(alice.needs.clout, tc.expectedAlice, `Alice clout for ${tc.desc}`);
      assert.equal(alice.needs.vibe, tc.expectedAlice, `Alice vibe for ${tc.desc}`);
      assert.equal(bob.needs.clout, tc.expectedBob, `Bob clout for ${tc.desc}`);
      assert.equal(bob.needs.vibe, tc.expectedBob, `Bob vibe for ${tc.desc}`);
      assert.ok(alice.needs.clout <= 100, 'Alice clout <= 100');
      assert.ok(alice.needs.vibe <= 100, 'Alice vibe <= 100');
      assert.ok(bob.needs.clout <= 100, 'Bob clout <= 100');
      assert.ok(bob.needs.vibe <= 100, 'Bob vibe <= 100');
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('CHALLENGER: Storage transferTip - Concurrency & Rapid Sequential Balance Draining to Zero', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'simcaster-chal-stress-'));
  try {
    const file = path.join(temp, 'store.json');
    const store = new Store(file);
    const alice = store.userFor(6001, { displayName: 'Alice' });
    const bob = store.userFor(6002, { displayName: 'Bob' });

    alice.currencies.degen = 500;
    bob.currencies.degen = 0;
    const initialTotal = alice.currencies.degen + bob.currencies.degen;

    // Execute 50 rapid sequential tips of 10 DEGEN
    for (let i = 1; i <= 50; i++) {
      const res = store.transferTip(6001, 6002, 10, 'degen');
      assert.equal(res.fromBalance, 500 - i * 10);
      assert.equal(res.toBalance, i * 10);
      assert.equal(alice.currencies.degen, 500 - i * 10);
      assert.equal(bob.currencies.degen, i * 10);
      assert.equal(alice.currencies.degen + bob.currencies.degen, initialTotal);
    }

    // Balance is now exactly 0
    assert.equal(alice.currencies.degen, 0);
    assert.equal(bob.currencies.degen, 500);

    // 51st tip must be rejected cleanly without modifying state
    assert.throws(
      () => store.transferTip(6001, 6002, 10, 'degen'),
      (err) => err.code === 'INSUFFICIENT_BALANCE'
    );
    assert.equal(alice.currencies.degen, 0);
    assert.equal(bob.currencies.degen, 500);

    // Verify disk persistence after 50 transactions
    const reloaded = new Store(file);
    assert.equal(reloaded.findUser(6001).currencies.degen, 0);
    assert.equal(reloaded.findUser(6002).currencies.degen, 500);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

// =========================================================================
// SECTION 2: HTTP API & REAL-TIME WEBSOCKET PROBES (POST /api/tips)
// =========================================================================

test('CHALLENGER: HTTP POST /api/tips - Comprehensive Invariant Probes & Concurrency Stress', { timeout: 35000 }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'simcaster-api-chal-'));
  const port = 15000 + Math.floor(Math.random() * 8000);
  const origin = 'http://localhost:' + port;
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      APP_ORIGIN: origin,
      SIMCASTER_DEMO_MODE: 'true',
      NODE_ENV: 'test',
      DATA_FILE: path.join(tmp, 'store.json')
    },
    stdio: 'ignore'
  });

  const post = async (route, body, cookie) =>
    fetch(origin + '/api' + route, {
      method: 'POST',
      headers: {
        origin,
        'content-type': 'application/json',
        ...(cookie ? { cookie } : {})
      },
      body: JSON.stringify(body)
    });

  let wsAlice = null;
  let wsBob = null;

  try {
    await waitFor(origin + '/api/health');

    // 1. Unauthenticated request rejection (401)
    const unauthRes = await post('/tips', { toFid: 12345, amount: 50, currency: 'degen' });
    assert.equal(unauthRes.status, 401, 'Unauthenticated tip must return 401');

    // 2. Login Alice and Bob
    const loginAlice = await post('/auth/demo', { name: 'Alice' });
    assert.equal(loginAlice.status, 200);
    const cookieAlice = loginAlice.headers.get('set-cookie').split(';')[0];
    const aliceUser = (await loginAlice.json()).user;

    const loginBob = await post('/auth/demo', { name: 'Bob' });
    assert.equal(loginBob.status, 200);
    const cookieBob = loginBob.headers.get('set-cookie').split(';')[0];
    const bobUser = (await loginBob.json()).user;

    // Connect WebSocket sockets to verify real-time event broadcasting
    wsAlice = await openSocket(`ws://localhost:${port}/socket?room=plaza`, cookieAlice, origin);
    wsBob = await openSocket(`ws://localhost:${port}/socket?room=plaza`, cookieBob, origin);

    // 3. Self-tipping rejection via HTTP (400)
    const selfTipRes = await post('/tips', { toFid: aliceUser.fid, amount: 50, currency: 'degen' }, cookieAlice);
    assert.equal(selfTipRes.status, 400);
    const selfTipJson = await selfTipRes.json();
    assert.equal(selfTipJson.error, 'Cannot tip yourself');

    // 4. Missing required payload fields
    const missingFidRes = await post('/tips', { amount: 50, currency: 'degen' }, cookieAlice);
    assert.equal(missingFidRes.status, 400);
    assert.ok((await missingFidRes.json()).error.includes('toFid is required'));

    const missingAmountRes = await post('/tips', { toFid: bobUser.fid, currency: 'degen' }, cookieAlice);
    assert.equal(missingAmountRes.status, 400);
    assert.ok((await missingAmountRes.json()).error.includes('positive integer'));

    // 5. Zero, negative, and float amounts rejection via HTTP (400)
    const invalidAmounts = [0, -1, -50, 0.5, 12.34, 99.99];
    for (const badAmt of invalidAmounts) {
      const res = await post('/tips', { toFid: bobUser.fid, amount: badAmt, currency: 'degen' }, cookieAlice);
      assert.equal(res.status, 400, `Amount ${badAmt} must return 400`);
      assert.ok((await res.json()).error.includes('positive integer'));
    }

    // 6. Non-numeric amount types (strings, objects, arrays, booleans) strictly rejected by API
    const nonNumericAmounts = ['50', 'abc', '', {}, [], [10], true, false, null];
    for (const nonNum of nonNumericAmounts) {
      const res = await post('/tips', { toFid: bobUser.fid, amount: nonNum, currency: 'degen' }, cookieAlice);
      assert.equal(res.status, 400, `Non-numeric amount ${JSON.stringify(nonNum)} must return 400`);
    }

    // 7. Non-existent recipient account (404 with code RECIPIENT_NOT_FOUND)
    const ghostRes = await post('/tips', { toFid: 88888888, amount: 50, currency: 'degen' }, cookieAlice);
    assert.equal(ghostRes.status, 404);
    const ghostJson = await ghostRes.json();
    assert.equal(ghostJson.code, 'RECIPIENT_NOT_FOUND');

    // 8. Unsupported currency rejection (400)
    const badCurrRes = await post('/tips', { toFid: bobUser.fid, amount: 50, currency: 'solana' }, cookieAlice);
    assert.equal(badCurrRes.status, 400);
    assert.ok((await badCurrRes.json()).error.includes('Unsupported currency'));

    // 9. Invalid cast hash format rejection (400)
    const badHashRes = await post('/tips', { toFid: bobUser.fid, amount: 10, currency: 'degen', castHash: 'not-a-hash' }, cookieAlice);
    assert.equal(badHashRes.status, 400);
    assert.ok((await badHashRes.json()).error.includes('Invalid cast hash'));

    // 10. Valid tip execution with real-time WebSocket broadcast
    const tipBroadcastPromise = waitPacket(
      wsBob,
      'tip',
      (d) => d.fromFid === aliceUser.fid && d.toFid === bobUser.fid && d.amount === 50
    );

    const validRes = await post('/tips', { toFid: bobUser.fid, amount: 50, currency: 'degen' }, cookieAlice);
    assert.equal(validRes.status, 200);
    const validJson = await validRes.json();
    assert.equal(validJson.ok, true);
    assert.equal(validJson.tip.amount, 50);
    assert.equal(validJson.tip.currency, 'degen');
    assert.equal(validJson.tip.fromBalance, 950);
    assert.equal(validJson.tip.toBalance, 1050);
    assert.equal(validJson.tip.cloutAwarded, 5);
    assert.equal(validJson.tip.vibeAwarded, 5);

    const receivedBroadcast = await tipBroadcastPromise;
    assert.equal(receivedBroadcast.fromFid, aliceUser.fid);
    assert.equal(receivedBroadcast.toFid, bobUser.fid);
    assert.equal(receivedBroadcast.amount, 50);

    // 11. Overdraft protection via HTTP (402 with code INSUFFICIENT_BALANCE)
    const overdraftRes = await post('/tips', { toFid: bobUser.fid, amount: 50000, currency: 'degen' }, cookieAlice);
    assert.equal(overdraftRes.status, 402);
    const overdraftJson = await overdraftRes.json();
    assert.equal(overdraftJson.code, 'INSUFFICIENT_BALANCE');

    // 12. Concurrency stress: 20 simultaneous HTTP tip requests
    // Alice currently has 950 DEGEN.
    // We launch 20 concurrent requests of 50 DEGEN each = 1,000 DEGEN requested.
    // Exactly 19 requests should succeed (19 * 50 = 950), and exactly 1 must fail with 402.
    const concurrentPromises = Array.from({ length: 20 }, () =>
      post('/tips', { toFid: bobUser.fid, amount: 50, currency: 'degen' }, cookieAlice)
    );

    const concurrentResults = await Promise.all(concurrentPromises);
    const statuses = concurrentResults.map((r) => r.status);
    const count200 = statuses.filter((s) => s === 200).length;
    const count402 = statuses.filter((s) => s === 402).length;

    assert.equal(count200, 19, 'Exactly 19 tips of 50 DEGEN succeed to exhaust 950 DEGEN');
    assert.equal(count402, 1, 'Exactly 1 tip fails with 402 INSUFFICIENT_BALANCE');

    // Verify Alice's balance is exactly 0
    const aliceProfile = await (await fetch(origin + '/api/me', { headers: { cookie: cookieAlice } })).json();
    assert.equal(aliceProfile.user.currencies.degen, 0, 'Alice final DEGEN balance must be 0');

    // Verify Bob's balance received exactly all 20 successful tips (initial 1000 + 50 + 19 * 50 = 2000)
    const bobProfile = await (await fetch(origin + '/api/me', { headers: { cookie: cookieBob } })).json();
    assert.equal(bobProfile.user.currencies.degen, 2000, 'Bob final DEGEN balance must be 2000');

    // Conservation check: Total currency in system must be preserved
    assert.equal(
      aliceProfile.user.currencies.degen + bobProfile.user.currencies.degen,
      2000,
      'System-wide total DEGEN must be strictly conserved'
    );

    // Any subsequent tip from Alice now must fail with 402
    const postDrainRes = await post('/tips', { toFid: bobUser.fid, amount: 10, currency: 'degen' }, cookieAlice);
    assert.equal(postDrainRes.status, 402);
  } finally {
    wsAlice?.close();
    wsBob?.close();
    child.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// =========================================================================
// SECTION 3: WEBSOCKET REAL-TIME "tip" PACKET INVARIANTS & REJECTIONS
// =========================================================================

test('CHALLENGER: WebSocket "tip" Packet - Real-Time Invariants & Boundary Guards', { timeout: 35000 }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'simcaster-ws-chal-'));
  const port = 16000 + Math.floor(Math.random() * 8000);
  const origin = 'http://localhost:' + port;
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      APP_ORIGIN: origin,
      SIMCASTER_DEMO_MODE: 'true',
      NODE_ENV: 'test',
      DATA_FILE: path.join(tmp, 'store.json')
    },
    stdio: 'ignore'
  });

  const post = async (route, body, cookie) =>
    fetch(origin + '/api' + route, {
      method: 'POST',
      headers: {
        origin,
        'content-type': 'application/json',
        ...(cookie ? { cookie } : {})
      },
      body: JSON.stringify(body)
    });

  let wsAlice = null;
  let wsBob = null;

  try {
    await waitFor(origin + '/api/health');

    const loginAlice = await post('/auth/demo', { name: 'Alice' });
    const cookieAlice = loginAlice.headers.get('set-cookie').split(';')[0];
    const aliceUser = (await loginAlice.json()).user;

    const loginBob = await post('/auth/demo', { name: 'Bob' });
    const cookieBob = loginBob.headers.get('set-cookie').split(';')[0];
    const bobUser = (await loginBob.json()).user;

    wsAlice = await openSocket(`ws://localhost:${port}/socket?room=plaza`, cookieAlice, origin);
    wsBob = await openSocket(`ws://localhost:${port}/socket?room=plaza`, cookieBob, origin);

    // 1. Self-tipping over WebSocket
    const selfTipPromise = waitPacket(wsAlice, 'activity');
    wsAlice.send(JSON.stringify({ event: 'tip', data: { toFid: aliceUser.fid, amount: 50, currency: 'degen' } }));
    const selfTipAct = await selfTipPromise;
    assert.equal(selfTipAct.ok, false);
    assert.ok(selfTipAct.error.includes('self-tipping'));

    // 2. Zero amount over WebSocket
    const zeroPromise = waitPacket(wsAlice, 'activity');
    wsAlice.send(JSON.stringify({ event: 'tip', data: { toFid: bobUser.fid, amount: 0, currency: 'degen' } }));
    const zeroAct = await zeroPromise;
    assert.equal(zeroAct.ok, false);

    // 3. Negative amount over WebSocket
    const negPromise = waitPacket(wsAlice, 'activity');
    wsAlice.send(JSON.stringify({ event: 'tip', data: { toFid: bobUser.fid, amount: -25, currency: 'degen' } }));
    const negAct = await negPromise;
    assert.equal(negAct.ok, false);

    // 4. Float amount over WebSocket
    const floatPromise = waitPacket(wsAlice, 'activity');
    wsAlice.send(JSON.stringify({ event: 'tip', data: { toFid: bobUser.fid, amount: 12.5, currency: 'degen' } }));
    const floatAct = await floatPromise;
    assert.equal(floatAct.ok, false);

    // 5. Non-existent recipient over WebSocket
    const ghostPromise = waitPacket(wsAlice, 'activity');
    wsAlice.send(JSON.stringify({ event: 'tip', data: { toFid: 88888888, amount: 50, currency: 'degen' } }));
    const ghostAct = await ghostPromise;
    assert.equal(ghostAct.ok, false);
    assert.ok(ghostAct.error.includes('Recipient account not found'));

    // 6. Overdraft over WebSocket
    const overdraftPromise = waitPacket(wsAlice, 'activity');
    wsAlice.send(JSON.stringify({ event: 'tip', data: { toFid: bobUser.fid, amount: 999999, currency: 'degen' } }));
    const overdraftAct = await overdraftPromise;
    assert.equal(overdraftAct.ok, false);
    assert.ok(overdraftAct.error.includes('Insufficient'));

    // 7. Valid tip execution over WebSocket
    const bobTipPromise = waitPacket(
      wsBob,
      'tip',
      (d) => d.fromFid === aliceUser.fid && d.toFid === bobUser.fid && d.amount === 100
    );
    const bobNoticePromise = waitPacket(
      wsBob,
      'notice',
      (d) => d.text && d.text.includes('Alice tipped Bob 100 ₡DEGEN')
    );
    const aliceActPromise = waitPacket(wsAlice, 'activity');

    wsAlice.send(JSON.stringify({ event: 'tip', data: { toFid: bobUser.fid, amount: 100, currency: 'degen' } }));

    const [bobTip, bobNotice, aliceAct] = await Promise.all([
      bobTipPromise,
      bobNoticePromise,
      aliceActPromise
    ]);

    assert.equal(bobTip.fromFid, aliceUser.fid);
    assert.equal(bobTip.toFid, bobUser.fid);
    assert.equal(bobTip.amount, 100);
    assert.equal(bobTip.currency, 'degen');
    assert.ok(bobNotice.text.includes('100 ₡DEGEN'));
    assert.equal(aliceAct.ok, true);
    assert.equal(aliceAct.currencies.degen, 900);
  } finally {
    wsAlice?.close();
    wsBob?.close();
    child.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

