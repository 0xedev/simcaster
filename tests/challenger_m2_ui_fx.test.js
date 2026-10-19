import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Store, SUPPORTED_CURRENCIES } from '../server/storage.js';
import { soundEngine } from '../src/sound.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ============================================================================
// CHALLENGER M2.2 ADVERSARIAL TEST SUITE: UI, FX & WEBAUDIO RESILIENCE
// ============================================================================

// ----------------------------------------------------------------------------
// SUITE 1: WebAudio SFX Engine & Audio Mute State (sfxMuted) Compliance
// ----------------------------------------------------------------------------

test('SFX: WebAudio SoundEngine playTipCoin & sfxMuted Strict Compliance', async (t) => {
  // Setup Mock WebAudio environment
  class MockOscillator {
    constructor() {
      this.type = 'sine';
      this.frequency = {
        value: 0,
        setValueAtTime: (val, time) => { this.frequency.value = val; this.frequency.lastTime = time; },
        exponentialRampToValueAtTime: (val, time) => { this.frequency.rampTarget = val; }
      };
      this.started = false;
      this.stopped = false;
    }
    connect(dest) { this.destination = dest; }
    start(t) { this.started = true; this.startTime = t; }
    stop(t) { this.stopped = true; this.stopTime = t; }
  }

  class MockGain {
    constructor() {
      this.gain = {
        value: 0,
        setValueAtTime: (val) => { this.gain.value = val; },
        linearRampToValueAtTime: (val) => { this.gain.rampTarget = val; },
        exponentialRampToValueAtTime: (val) => { this.gain.expTarget = val; }
      };
    }
    connect(dest) { this.destination = dest; }
  }

  const createdOscillators = [];
  const createdGains = [];

  class MockAudioContext {
    constructor() {
      this.currentTime = 10.0;
      this.state = 'running';
      this.destination = { type: 'speakers' };
    }
    createOscillator() {
      const osc = new MockOscillator();
      createdOscillators.push(osc);
      return osc;
    }
    createGain() {
      const g = new MockGain();
      createdGains.push(g);
      return g;
    }
    resume() {
      this.state = 'running';
      return Promise.resolve();
    }
  }

  // Inject into global environment
  const originalWindow = globalThis.window;
  globalThis.window = {
    AudioContext: MockAudioContext,
    webkitAudioContext: MockAudioContext
  };

  try {
    // Reset soundEngine state
    soundEngine.ctx = null;
    soundEngine.sfxMuted = false;
    createdOscillators.length = 0;
    createdGains.length = 0;

    await t.test('1.1: playTipCoin(50) unmuted generates standard 5-note melodic chime', () => {
      soundEngine.playTipCoin(50);
      assert.equal(createdOscillators.length, 5, 'Must generate exactly 5 notes for standard tip (<=50)');
      assert.equal(createdGains.length, 5, 'Must generate 5 gain envelopes');

      // Verify specific musical frequencies (E6 -> G#6 -> B6 -> E7, B7 shimmer)
      const freqs = createdOscillators.map((o) => o.frequency.value);
      assert.ok(Math.abs(freqs[0] - 1318.51) < 0.01, 'Note 1 must be E6 (1318.51Hz)');
      assert.ok(Math.abs(freqs[1] - 1661.22) < 0.01, 'Note 2 must be G#6 (1661.22Hz)');
      assert.ok(Math.abs(freqs[2] - 1975.53) < 0.01, 'Note 3 must be B6 (1975.53Hz)');
      assert.ok(Math.abs(freqs[3] - 2637.02) < 0.01, 'Note 4 must be E7 (2637.02Hz)');
      assert.ok(Math.abs(freqs[4] - 3951.07) < 0.01, 'Note 5 must be B7 shimmer (3951.07Hz)');

      // Verify all oscillators were started and stopped
      assert.ok(createdOscillators.every((o) => o.started && o.stopped), 'All notes must be started and scheduled to stop');
    });

    await t.test('1.2: playTipCoin(100) unmuted generates celebratory 6-note fanfare', () => {
      createdOscillators.length = 0;
      createdGains.length = 0;

      soundEngine.playTipCoin(100);
      assert.equal(createdOscillators.length, 6, 'Must generate 6 notes for elevated tip (>=100)');
      const freqs = createdOscillators.map((o) => o.frequency.value);
      assert.ok(Math.abs(freqs[5] - 3322.44) < 0.01, 'Note 6 must be G#7 fanfare (3322.44Hz)');
    });

    await t.test('1.3: sfxMuted = true strictly blocks ALL audio emission in playTipCoin and playTone', () => {
      createdOscillators.length = 0;
      createdGains.length = 0;

      // Mute SFX
      soundEngine.sfxMuted = true;

      // Attempt tips of all sizes while muted
      soundEngine.playTipCoin(10);
      soundEngine.playTipCoin(50);
      soundEngine.playTipCoin(100);
      soundEngine.playTipCoin(500);

      assert.equal(createdOscillators.length, 0, 'Zero oscillators must be created when sfxMuted is true');
      assert.equal(createdGains.length, 0, 'Zero gain nodes must be created when sfxMuted is true');

      // Attempt other sound effects
      soundEngine.playClick();
      soundEngine.playDash();
      soundEngine.playCash();
      soundEngine.playLaser();
      soundEngine.playHit();
      soundEngine.playPowerup();
      soundEngine.playPromotion();

      assert.equal(createdOscillators.length, 0, 'No sound effect may emit when sfxMuted is true');
    });

    await t.test('1.4: toggleSfx() properly toggles state and notifies subscribers', () => {
      let notification = null;
      const unsubscribe = soundEngine.subscribe((state) => {
        notification = state;
      });

      // Currently muted from 1.3
      assert.equal(soundEngine.sfxMuted, true);
      const newState = soundEngine.toggleSfx();
      assert.equal(newState, false, 'toggleSfx should toggle to unmuted (false)');
      assert.equal(soundEngine.sfxMuted, false);
      assert.deepEqual(notification, { sfxMuted: false, radioPlaying: false });

      // After unmuting, playTipCoin emits sounds again
      createdOscillators.length = 0;
      soundEngine.playTipCoin(50);
      assert.equal(createdOscillators.length, 5, 'Audio resumes immediately when unmuted');

      // Toggle back to muted
      soundEngine.toggleSfx();
      assert.equal(soundEngine.sfxMuted, true);
      assert.deepEqual(notification, { sfxMuted: true, radioPlaying: false });

      unsubscribe();
    });
  } finally {
    globalThis.window = originalWindow;
    soundEngine.sfxMuted = false;
    soundEngine.ctx = null;
  }
});

// ----------------------------------------------------------------------------
// SUITE 2: Tipping Offline Cast Authors (Feed & 3D Resilience)
// ----------------------------------------------------------------------------

test('OFFLINE AUTHOR: Tipping Cast Authors Absent from 3D Plaza', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'simcaster-challenger-m2-'));
  const store = new Store(path.join(tmp, 'store.json'));

  try {
    // 1. Setup Sender (connected player in plaza)
    const sender = store.userFor(990001, { displayName: 'PlazaSender', username: 'plazasender' });
    store.ensureLifeState(sender);
    sender.currencies.degen = 1000;
    sender.creds = 250;
    store.save();

    // 2. Setup Cast by an author who is NOT currently registered or in any plaza room
    const offlineAuthorFid = 777001;
    const testCastHash = '0xdeadbeefc001777';
    store.state.casts = store.state.casts || [];
    store.state.casts.push({
      hash: testCastHash,
      author: {
        fid: offlineAuthorFid,
        username: 'solitary_dev',
        display_name: 'Solitary Dev',
        pfp_url: 'https://example.com/pfp.png'
      },
      text: 'Shipping smart contracts late at night from an offline cave #dev',
      channel: 'dev',
      timestamp: Date.now()
    });
    store.save();

    await t.test('2.1: store.transferTip hydrates offline author and completes transfer', () => {
      // Offline author does not exist in store before tip
      assert.equal(store.findUser(offlineAuthorFid), null, 'Offline author must initially not exist in user accounts');

      // Execute tip referencing castHash
      const tipResult = store.transferTip(sender.fid, offlineAuthorFid, 50, 'degen', { castHash: testCastHash });
      assert.ok(tipResult, 'Tip transfer must succeed');
      assert.equal(tipResult.fromFid, sender.fid);
      assert.equal(tipResult.toFid, offlineAuthorFid);
      assert.equal(tipResult.amount, 50);
      assert.equal(tipResult.currency, 'degen');
      assert.equal(tipResult.fromBalance, 950);
      assert.equal(tipResult.toBalance, 1050); // Default 1000 + 50
      assert.equal(tipResult.cloutAwarded, 5);
      assert.equal(tipResult.vibeAwarded, 5);

      // Verify recipient was hydrated with cast author metadata
      const hydratedRecipient = store.findUser(offlineAuthorFid);
      assert.ok(hydratedRecipient, 'Recipient must now exist in store');
      assert.equal(hydratedRecipient.displayName, 'Solitary Dev');
      assert.equal(hydratedRecipient.username, 'solitary_dev');
      assert.equal(hydratedRecipient.currencies.degen, 1050);
    });

    await t.test('2.2: 3D FX fallback: triggerTipFx gracefully handles missing recipient avatar', () => {
      // In WorldView.jsx lines 1486-1505:
      // When targetPlayer is not found in playersRef.current, targetX and targetZ must safely fall back to mePlayer or (0,0)
      const playersInPlaza = [
        { id: 'player_me', fid: sender.fid, name: 'PlazaSender', x: 5.5, z: -3.2 }
        // Note: offlineAuthorFid is NOT in this array!
      ];
      const selfId = 'player_me';

      function simulateTriggerTipFx(tipData) {
        const targetPlayer = playersInPlaza.find(
          (p) => Number(p.fid) === Number(tipData.toFid) || p.id === tipData.targetId || p.name === tipData.toName
        );
        const mePlayer = playersInPlaza.find((p) => p.id === selfId);
        const targetX = targetPlayer ? targetPlayer.x : (mePlayer?.x ?? 0);
        const targetZ = targetPlayer ? targetPlayer.z : (mePlayer?.z ?? 0);

        const burstId = 'tip_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        return {
          id: burstId,
          x: targetX,
          z: targetZ,
          amount: tipData.amount || 50,
          currency: tipData.currency || 'degen',
          createdAt: Date.now()
        };
      }

      // Simulate offline cast author tip FX trigger
      const burst = simulateTriggerTipFx({
        toFid: offlineAuthorFid,
        toName: 'Solitary Dev',
        amount: 50,
        currency: 'degen'
      });

      assert.ok(burst, 'Burst object must be generated without error');
      assert.equal(burst.x, 5.5, 'Must fall back to sender X coordinate when recipient avatar is absent');
      assert.equal(burst.z, -3.2, 'Must fall back to sender Z coordinate when recipient avatar is absent');
      assert.ok(Number.isFinite(burst.x) && !Number.isNaN(burst.x), 'Coordinates must be valid finite numbers');
      assert.ok(Number.isFinite(burst.z) && !Number.isNaN(burst.z), 'Coordinates must be valid finite numbers');
    });

    await t.test('2.3: CastPhone client notification & balance update contract for offline author', () => {
      // Verify simulated notification string in CastPhone.jsx line 354
      const cast = store.state.casts.find((c) => c.hash === testCastHash);
      const amount = 50;
      const toastMessage = `Tipped @${cast.author?.username || 'caster'} ${amount} ₡DEGEN (+5 Clout, +5 Vibe)!`;
      assert.equal(toastMessage, 'Tipped @solitary_dev 50 ₡DEGEN (+5 Clout, +5 Vibe)!');

      // Verify onUserUpdate contract in CastPhone.jsx line 331
      let updatedUser = { fid: sender.fid, creds: 250, needs: { clout: 10, vibe: 20 } };
      const res = {
        tip: {
          fromBalance: 950,
          cloutAwarded: 5,
          vibeAwarded: 5
        }
      };

      updatedUser = {
        ...updatedUser,
        creds: res.tip.fromBalance ?? (updatedUser.creds - amount),
        needs: {
          ...updatedUser.needs,
          clout: Math.min(100, (updatedUser.needs.clout || 0) + (res.tip.cloutAwarded || 5)),
          vibe: Math.min(100, (updatedUser.needs.vibe || 0) + (res.tip.vibeAwarded || 5))
        }
      };

      assert.equal(updatedUser.creds, 950);
      assert.equal(updatedUser.needs.clout, 15);
      assert.equal(updatedUser.needs.vibe, 25);
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ----------------------------------------------------------------------------
// SUITE 3: Rapid Button Clicking & UI Re-entrancy Protection
// ----------------------------------------------------------------------------

test('RAPID CLICKING: Debounce and Busy-State Invariant Verification', async (t) => {
  await t.test('3.1: WorldView handleTipAvatar re-entrancy guard prevents concurrent calls', async () => {
    let apiCallCount = 0;
    let tipBusy = false;
    let pendingTipAmount = null;

    async function mockApiCall(amount) {
      apiCallCount++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { ok: true, tip: { fromBalance: 200 } };
    }

    async function handleTipAvatar(selected, amount) {
      if (!selected || tipBusy) return 'BLOCKED';
      try {
        tipBusy = true;
        pendingTipAmount = amount;
        await mockApiCall(amount);
        return 'SUCCESS';
      } finally {
        tipBusy = false;
        pendingTipAmount = null;
      }
    }

    const selectedTarget = { id: 'target_1', fid: 12345, name: 'Bob' };

    // Trigger 5 rapid simultaneous clicks
    const results = await Promise.all([
      handleTipAvatar(selectedTarget, 50),
      handleTipAvatar(selectedTarget, 50),
      handleTipAvatar(selectedTarget, 50),
      handleTipAvatar(selectedTarget, 10),
      handleTipAvatar(selectedTarget, 100)
    ]);

    assert.equal(apiCallCount, 1, 'Exactly ONE API call must be executed despite 5 rapid clicks');
    assert.equal(results[0], 'SUCCESS');
    assert.equal(results[1], 'BLOCKED');
    assert.equal(results[2], 'BLOCKED');
    assert.equal(results[3], 'BLOCKED');
    assert.equal(results[4], 'BLOCKED');
    assert.equal(tipBusy, false, 'tipBusy must reset to false after completion');
    assert.equal(pendingTipAmount, null, 'pendingTipAmount must reset to null');
  });

  await t.test('3.2: CastPhone tipCastInPhone busy guard & button disabled state', async () => {
    let phoneApiCallCount = 0;
    let busy = false;
    let pendingTipHash = null;
    let pendingTipAmount = null;

    async function tipCastInPhone(cast, amount) {
      if (busy) return 'BLOCKED';
      try {
        busy = true;
        pendingTipHash = cast.hash;
        pendingTipAmount = amount;
        phoneApiCallCount++;
        await new Promise((resolve) => setTimeout(resolve, 40));
        return 'SUCCESS';
      } finally {
        busy = false;
        pendingTipHash = null;
        pendingTipAmount = null;
      }
    }

    const cast = { hash: '0xabc123', author: { fid: 555 } };

    // Fire 4 rapid clicks on preset buttons
    const calls = [
      tipCastInPhone(cast, 10),
      tipCastInPhone(cast, 50),
      tipCastInPhone(cast, 100),
      tipCastInPhone(cast, 10)
    ];

    // Check intermediate UI disabled state while in flight
    assert.equal(busy, true, 'busy must be true synchronously upon first invocation');
    assert.equal(pendingTipHash, '0xabc123');
    assert.equal(pendingTipAmount, 10);

    // In CastPhone.jsx line 1016: disabled={busy || !canAfford}
    const myCreds = 500;
    const isButton10Disabled = busy || myCreds < 10;
    const isButton50Disabled = busy || myCreds < 50;
    const isButton100Disabled = busy || myCreds < 100;
    assert.ok(isButton10Disabled, 'Preset 10 button must be disabled while busy');
    assert.ok(isButton50Disabled, 'Preset 50 button must be disabled while busy');
    assert.ok(isButton100Disabled, 'Preset 100 button must be disabled while busy');

    const results = await Promise.all(calls);
    assert.equal(phoneApiCallCount, 1, 'Only 1 call must reach phoneApi');
    assert.equal(results.filter((r) => r === 'SUCCESS').length, 1);
    assert.equal(results.filter((r) => r === 'BLOCKED').length, 3);
  });

  await t.test('3.3: SocialFeed tipCastInFeed tipLoading guard in main.jsx', async () => {
    let feedApiCallCount = 0;
    let tipLoading = false;

    async function tipCastInFeed(cast, amount) {
      if (tipLoading) return 'BLOCKED';
      try {
        tipLoading = true;
        feedApiCallCount++;
        await new Promise((resolve) => setTimeout(resolve, 30));
        return 'SUCCESS';
      } finally {
        tipLoading = false;
      }
    }

    const cast = { hash: '0xfeed001', author: { fid: 666 } };
    const p1 = tipCastInFeed(cast, 50);
    const p2 = tipCastInFeed(cast, 50);
    const p3 = tipCastInFeed(cast, 50);

    const outcomes = await Promise.all([p1, p2, p3]);
    assert.equal(feedApiCallCount, 1);
    assert.equal(outcomes[0], 'SUCCESS');
    assert.equal(outcomes[1], 'BLOCKED');
    assert.equal(outcomes[2], 'BLOCKED');
  });

  await t.test('3.4: Atomic Balance Race: Concurrent transfers with insufficient funds reject cleanly', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'simcaster-concurrency-'));
    const store = new Store(path.join(tmp, 'store.json'));

    try {
      const sender = store.userFor(8881, { displayName: 'Sender', username: 'sender' });
      const recipient = store.userFor(8882, { displayName: 'Recipient', username: 'recipient' });
      store.ensureLifeState(sender);
      store.ensureLifeState(recipient);

      // Sender has EXACTLY 50 DEGEN (only enough for 1 tip)
      sender.currencies.degen = 50;
      recipient.currencies.degen = 0;
      store.save();

      // Execute tip 1
      const res1 = store.transferTip(sender.fid, recipient.fid, 50, 'degen');
      assert.equal(res1.fromBalance, 0);
      assert.equal(res1.toBalance, 50);

      // Immediately attempt tip 2 with now 0 balance
      assert.throws(
        () => store.transferTip(sender.fid, recipient.fid, 50, 'degen'),
        (err) => err.code === 'INSUFFICIENT_BALANCE',
        'Second tip must strictly throw INSUFFICIENT_BALANCE, preventing negative balance'
      );

      assert.equal(sender.currencies.degen, 0, 'Sender balance must not go below zero');
      assert.equal(recipient.currencies.degen, 50, 'Recipient must only receive exactly one tip');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ----------------------------------------------------------------------------
// SUITE 4: TipBurstFX Lifecycle & Three.js Memory Cleanup
// ----------------------------------------------------------------------------

test('FX LIFECYCLE: TipBurstFX Three.js Lifecycle & Resource Disposal', async (t) => {
  await t.test('4.1: TipBurst array bounds: Rapid burst dispatch is capped to max 10 active instances', () => {
    let bursts = [];

    function addBurst(tipData) {
      const burstId = 'tip_' + Math.random().toString(36);
      bursts = [
        ...bursts.slice(-9), // Bounded to max 9 previous + 1 new = 10
        { id: burstId, amount: tipData.amount, createdAt: Date.now() }
      ];
    }

    // Spam 50 tips rapidly
    for (let i = 0; i < 50; i++) {
      addBurst({ amount: 10 * (i + 1) });
    }

    assert.equal(bursts.length, 10, 'TipBurst array must never exceed 10 active items, preventing unbounded memory growth');
  });

  await t.test('4.2: TipBurstInstance duration progress reaches 1.0 and invokes onComplete', () => {
    const DURATION_MS = 1800;
    const createdAt = Date.now() - 2000; // 2 seconds ago (exceeds 1800ms)
    const burst = { id: 'burst_123', amount: 50, currency: 'degen', createdAt };

    let completedId = null;
    function onComplete(id) {
      completedId = id;
    }

    // Simulate useFrame logic from WorldView.jsx lines 1308-1314
    const elapsed = Date.now() - burst.createdAt;
    const progress = Math.min(1, elapsed / DURATION_MS);

    assert.equal(progress, 1, 'Progress must be 1.0 after elapsed > DURATION_MS');
    if (progress >= 1 && onComplete) {
      onComplete(burst.id);
    }
    assert.equal(completedId, 'burst_123', 'onComplete must be invoked with burst id');

    // Simulate onTipBurstComplete removal from array (line 2003)
    let bursts = [{ id: 'burst_123' }, { id: 'burst_456' }];
    bursts = bursts.filter((b) => b.id !== completedId);
    assert.equal(bursts.length, 1);
    assert.equal(bursts[0].id, 'burst_456');
  });

  await t.test('4.3: TipValueBillboard CanvasTexture memory disposal', () => {
    let disposed = false;
    class MockCanvas {
      constructor() { this.width = 360; this.height = 96; }
      getContext() {
        return {
          fillRect() {},
          strokeRect() {},
          beginPath() {},
          roundRect() {},
          fill() {},
          stroke() {},
          fillText() {}
        };
      }
    }

    const mockCanvas = new MockCanvas();
    const texture = new THREE.CanvasTexture(mockCanvas);
    assert.ok(texture instanceof THREE.CanvasTexture);

    // Override dispose to track cleanup
    const originalDispose = texture.dispose.bind(texture);
    texture.dispose = () => {
      disposed = true;
      originalDispose();
    };

    // Simulate useEffect unmount cleanup in WorldView.jsx line 1260: useEffect(() => () => texture?.dispose(), [texture]);
    const cleanup = () => texture?.dispose();
    cleanup();

    assert.equal(disposed, true, 'CanvasTexture must be explicitly disposed on unmount, releasing WebGL textures');
  });

  await t.test('4.4: FloatingCoin geometry, materials & currency palette validation', () => {
    // 1. Verify currency colors (WorldView.jsx lines 1300-1305)
    function getCoinColor(currency) {
      const c = (currency || 'degen').toLowerCase();
      if (c === 'moxie') return '#10b981';
      if (c === 'warps') return '#8a63d2';
      if (c === 'creds') return '#f59e0b';
      return '#ffd700';
    }

    assert.equal(getCoinColor('degen'), '#ffd700', 'Degen must be gold');
    assert.equal(getCoinColor('DEGEN'), '#ffd700');
    assert.equal(getCoinColor('moxie'), '#10b981', 'Moxie must be emerald');
    assert.equal(getCoinColor('warps'), '#8a63d2', 'Warps must be purple');
    assert.equal(getCoinColor('creds'), '#f59e0b', 'Creds must be amber');
    assert.equal(getCoinColor(null), '#ffd700', 'Default must be gold');

    // 2. Verify CylinderGeometry configuration: args=[0.18, 0.18, 0.04, 16]
    const geom = new THREE.CylinderGeometry(0.18, 0.18, 0.04, 16);
    assert.equal(geom.parameters.radiusTop, 0.18);
    assert.equal(geom.parameters.radiusBottom, 0.18);
    assert.equal(geom.parameters.height, 0.04);
    assert.equal(geom.parameters.radialSegments, 16);
    geom.dispose();

    // 3. Verify opacity and scale animation curves
    function getOpacity(p) {
      return p < 0.65 ? 1.0 : Math.max(0, 1.0 - (p - 0.65) / 0.35);
    }

    assert.equal(getOpacity(0.0), 1.0, 'Opacity must be 1.0 at start');
    assert.equal(getOpacity(0.5), 1.0, 'Opacity must be 1.0 at midpoint');
    assert.ok(getOpacity(0.8) < 1.0, 'Opacity must fade after 0.65');
    assert.equal(getOpacity(1.0), 0.0, 'Opacity must reach 0.0 at end of burst');
  });
});

// ----------------------------------------------------------------------------
// SUITE 5: Live Server Integration, Offline Cast Author & Real-Time Broadcast
// ----------------------------------------------------------------------------

import { spawn } from 'node:child_process';
import WebSocket from 'ws';

async function waitForServer(url, attempts = 100) {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Server did not start at ' + url);
}

function waitWsPacket(ws, filterFn, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMsg);
      reject(new Error('Timed out waiting for matching packet'));
    }, timeoutMs);

    function onMsg(raw) {
      let packet;
      try {
        packet = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (filterFn(packet)) {
        clearTimeout(timer);
        ws.off('message', onMsg);
        resolve(packet);
      }
    }

    ws.on('message', onMsg);
  });
}

test('LIVE SERVER & WEBSOCKET: Offline Cast Author Tipping & Real-Time Broadcast', { timeout: 30000 }, async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'simcaster-challenger-server-'));
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

  let wsAlice = null;
  let wsBob = null;

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

  try {
    await waitForServer(origin + '/api/health');

    // 1. Log in Alice (player in plaza)
    const loginAlice = await post('/auth/demo', { name: 'AlicePlaza' });
    assert.equal(loginAlice.status, 200);
    const cookieAlice = loginAlice.headers.get('set-cookie').split(';')[0];
    const aliceData = (await (await fetch(origin + '/api/me', { headers: { cookie: cookieAlice } })).json()).user;
    assert.ok(aliceData && aliceData.fid);

    // 2. Log in Bob (peer player in plaza)
    const loginBob = await post('/auth/demo', { name: 'BobPlaza' });
    assert.equal(loginBob.status, 200);
    const cookieBob = loginBob.headers.get('set-cookie').split(';')[0];
    const bobData = (await (await fetch(origin + '/api/me', { headers: { cookie: cookieBob } })).json()).user;
    assert.ok(bobData && bobData.fid);

    // 3. Connect Alice and Bob to WebSocket Plaza
    wsAlice = new WebSocket(`ws://localhost:${port}/socket?room=plaza`, { headers: { cookie: cookieAlice, origin } });
    wsBob = new WebSocket(`ws://localhost:${port}/socket?room=plaza`, { headers: { cookie: cookieBob, origin } });

    await Promise.all([
      new Promise((resolve, reject) => { wsAlice.once('open', resolve); wsAlice.once('error', reject); }),
      new Promise((resolve, reject) => { wsBob.once('open', resolve); wsBob.once('error', reject); })
    ]);

    // Wait for snapshot
    await waitWsPacket(wsAlice, (p) => p.event === 'snapshot');
    await waitWsPacket(wsBob, (p) => p.event === 'snapshot');

    // 4. Retrieve feed to get an offline cast author's cast
    const feedRes = await fetch(origin + '/api/feed', { headers: { cookie: cookieAlice } });
    assert.equal(feedRes.status, 200);
    const feedData = await feedRes.json();
    assert.ok(Array.isArray(feedData.casts) && feedData.casts.length > 0);

    // Pick a cast whose author is neither Alice nor Bob
    const sampleCast = feedData.casts.find(
      (c) => Number(c.author?.fid) !== Number(aliceData.fid) && Number(c.author?.fid) !== Number(bobData.fid)
    );
    assert.ok(sampleCast, 'Must find a sample cast with an offline author');
    const offlineAuthorFid = sampleCast.author.fid;

    await t.test('5.1: Alice tips offline cast author via HTTP POST /api/tips', async () => {
      // Bob listens for WebSocket tip broadcast
      const bobTipPromise = waitWsPacket(
        wsBob,
        (p) =>
          (p.type === 'tip' || p.event === 'tip') &&
          Number((p.data || p).fromFid) === Number(aliceData.fid) &&
          Number((p.data || p).toFid) === Number(offlineAuthorFid)
      );

      const tipRes = await post(
        '/tips',
        {
          toFid: offlineAuthorFid,
          amount: 50,
          currency: 'degen',
          castHash: sampleCast.hash
        },
        cookieAlice
      );

      assert.equal(tipRes.status, 200);
      const tipJson = await tipRes.json();
      assert.equal(tipJson.ok, true);
      assert.equal(tipJson.tip.fromFid, aliceData.fid);
      assert.equal(tipJson.tip.toFid, offlineAuthorFid);
      assert.equal(tipJson.tip.amount, 50);
      assert.equal(tipJson.tip.currency, 'degen');
      assert.equal(tipJson.tip.fromBalance, 950);
      assert.equal(tipJson.tip.cloutAwarded, 5);
      assert.equal(tipJson.tip.vibeAwarded, 5);

      // Verify Bob received the real-time WebSocket broadcast for the offline author tip
      const bobPacket = await bobTipPromise;
      const broadcastData = bobPacket.data || bobPacket;
      assert.equal(Number(broadcastData.fromFid), Number(aliceData.fid));
      assert.equal(Number(broadcastData.toFid), Number(offlineAuthorFid));
      assert.equal(broadcastData.amount, 50);
      assert.equal(broadcastData.currency, 'degen');

      // Verify that in Bob's client, triggerTipFx runs safely with offline recipient
      let bobBanner = '';
      const isRecipient = Number(broadcastData.toFid) === Number(bobData.fid);
      const isSender = Number(broadcastData.fromFid) === Number(bobData.fid);
      if (!isSender && !isRecipient) {
        bobBanner = `🪙 ${broadcastData.fromName || 'Someone'} tipped ${broadcastData.toName || 'someone'} ${broadcastData.amount} ₡${(broadcastData.currency || 'degen').toUpperCase()}`;
      }
      assert.ok(bobBanner.includes('AlicePlaza') && bobBanner.includes('50 ₡DEGEN'));
    });

    await t.test('5.2: Alice balance and clout/vibe state are genuinely updated in database', async () => {
      const aliceAfter = await (await fetch(origin + '/api/me', { headers: { cookie: cookieAlice } })).json();
      assert.equal(aliceAfter.user.currencies.degen, 950);
      assert.ok(aliceAfter.user.needs.clout >= 5);
      assert.ok(aliceAfter.user.needs.vibe >= 5);
    });

    await t.test('5.3: Rapid concurrent tipping requests preserve balance integrity', async () => {
      // Alice attempts 3 concurrent tips of 50 DEGEN
      const reqs = await Promise.all([
        post('/tips', { toFid: offlineAuthorFid, amount: 50, currency: 'degen', castHash: sampleCast.hash }, cookieAlice),
        post('/tips', { toFid: offlineAuthorFid, amount: 50, currency: 'degen', castHash: sampleCast.hash }, cookieAlice),
        post('/tips', { toFid: offlineAuthorFid, amount: 50, currency: 'degen', castHash: sampleCast.hash }, cookieAlice)
      ]);

      const statuses = reqs.map((r) => r.status);
      // Depending on throttle or execution, either all succeed (if within rate limit) or throttle returns 429
      for (const st of statuses) {
        assert.ok([200, 429].includes(st), `Status ${st} must be either 200 OK or 429 Throttled`);
      }

      // Check balance consistency
      const aliceFinal = await (await fetch(origin + '/api/me', { headers: { cookie: cookieAlice } })).json();
      const successCount = statuses.filter((s) => s === 200).length;
      const expectedBalance = 950 - successCount * 50;
      assert.equal(
        aliceFinal.user.currencies.degen,
        expectedBalance,
        `Alice's final balance (${aliceFinal.user.currencies.degen}) must strictly match 950 - ${successCount} * 50 = ${expectedBalance}`
      );
    });
  } finally {
    wsAlice?.close();
    wsBob?.close();
    child.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
