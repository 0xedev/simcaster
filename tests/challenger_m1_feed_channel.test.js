import test, { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sampleFeed, Store } from '../server/storage.js';

async function waitForServer(url, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error('Server did not start within timeout');
}

// ============================================================================
// VECTOR 1: EMPIRICAL PROBES ON sampleFeed(channel)
// ============================================================================
describe('CHALLENGER V1: sampleFeed Empirical Probing', () => {
  it('P1.1: Missing / null / undefined / non-string arguments gracefully return full 8 sample casts', () => {
    const defaultFeed = sampleFeed();
    assert.ok(Array.isArray(defaultFeed), 'sampleFeed() must return an array');
    assert.equal(defaultFeed.length, 8, 'default feed must return all 8 curated sample casts');

    const nullFeed = sampleFeed(null);
    assert.equal(nullFeed.length, 8, 'sampleFeed(null) must return full feed');

    const undefFeed = sampleFeed(undefined);
    assert.equal(undefFeed.length, 8, 'sampleFeed(undefined) must return full feed');

    const nonStrings = [123, 0, -1, true, false, {}, [], () => {}, Symbol('ch'), NaN, Infinity];
    for (const input of nonStrings) {
      const feed = sampleFeed(input);
      assert.ok(Array.isArray(feed), `sampleFeed(${String(input)}) must return an array`);
      assert.equal(feed.length, 8, `sampleFeed(${String(input)}) must fallback to 8 casts`);
    }
  });

  it('P1.2: Empty strings, whitespace, and slash-only inputs fallback to full 8 sample casts', () => {
    const emptyFeed = sampleFeed('');
    assert.equal(emptyFeed.length, 8, 'empty string must return full feed');

    const whitespaceInputs = ['   ', '\t', '\n\r  ', '       '];
    for (const ws of whitespaceInputs) {
      const feed = sampleFeed(ws);
      assert.equal(feed.length, 8, `whitespace '${ws}' must fallback to 8 casts`);
    }

    const slashesOnly = ['/', '///', '////'];
    for (const sl of slashesOnly) {
      const feed = sampleFeed(sl);
      assert.equal(feed.length, 8, `slashes only '${sl}' must fallback to 8 casts`);
    }
  });

  it('P1.3: Keyword channels ("all", "global") case-insensitively return full 8 sample casts', () => {
    const keywords = ['all', 'ALL', 'All', ' global ', '/global', 'GLOBAL', '/all'];
    for (const kw of keywords) {
      const feed = sampleFeed(kw);
      assert.equal(feed.length, 8, `keyword '${kw}' must return full feed`);
    }
  });

  it('P1.4: Valid channels with uppercase, leading slashes, and surrounding whitespace return expected 2 casts', () => {
    const validProbes = [
      { input: 'farcaster', expected: 'farcaster' },
      { input: '/farcaster', expected: 'farcaster' },
      { input: '///farcaster', expected: 'farcaster' },
      { input: 'FARCASTER', expected: 'farcaster' },
      { input: '  /FARCASTER  ', expected: 'farcaster' },
      { input: 'dev', expected: 'dev' },
      { input: '/dev', expected: 'dev' },
      { input: 'DEV', expected: 'dev' },
      { input: '  Dev  ', expected: 'dev' },
      { input: 'memes', expected: 'memes' },
      { input: '/memes', expected: 'memes' },
      { input: 'MeMeS', expected: 'memes' },
      { input: 'base', expected: 'base' },
      { input: '/base', expected: 'base' },
      { input: 'BASE', expected: 'base' }
    ];

    for (const { input, expected } of validProbes) {
      const feed = sampleFeed(input);
      assert.equal(feed.length, 2, `probe '${input}' must return 2 casts`);
      assert.ok(feed.every((c) => c.channel === expected), `all casts must have channel '${expected}'`);
    }
  });

  it('P1.5: Non-existent channels, special chars, %20, and trailing slashes return empty array []', () => {
    const emptyExpected = [
      'non-existent',
      'solana',
      'ethereum',
      '%20',
      'dev/sub',
      'dev/', // trailing slash does not match 'dev'
      '!@#$%^&*()',
      '<script>alert(1)</script>',
      '../../etc/passwd',
      '🦄',
      'a'.repeat(2000)
    ];

    for (const input of emptyExpected) {
      const feed = sampleFeed(input);
      assert.ok(Array.isArray(feed), `sampleFeed('${input}') must return an array`);
      assert.equal(feed.length, 0, `sampleFeed('${input}') must return empty array []`);
    }
  });

  it('P1.6: Cast schema invariants on all sample casts', () => {
    const allCasts = sampleFeed();
    for (const cast of allCasts) {
      assert.ok(typeof cast.hash === 'string' && cast.hash.length > 0, 'cast hash must be non-empty string');
      assert.ok(typeof cast.channel === 'string' && ['farcaster', 'dev', 'memes', 'base'].includes(cast.channel), 'cast channel must be valid district channel');
      assert.ok(cast.author && typeof cast.author.fid === 'number', 'cast author must have fid');
      assert.ok(typeof cast.text === 'string' && cast.text.length > 0, 'cast text must be non-empty');
      assert.ok(!isNaN(Date.parse(cast.timestamp)), 'cast timestamp must be valid ISO date');
      assert.ok(typeof cast.reactions?.likes_count === 'number', 'likes_count must be number');
      assert.ok(typeof cast.replies?.count === 'number', 'replies count must be number');
    }
  });
});

// ============================================================================
// VECTOR 2, 3, 4: LIVE HTTP SERVER ADVERSARIAL PROBING
// ============================================================================
describe('CHALLENGER V2-V4: Live API Resilience, Feed Routing, & Cast Tagging', { timeout: 35000 }, () => {
  let tmpDir = null;
  let port = null;
  let origin = null;
  let serverProcess = null;
  let authCookie = null;

  const get = (url, cookie = authCookie) =>
    fetch(origin + '/api' + url, {
      headers: { ...(cookie ? { cookie } : {}) }
    });

  const post = (url, body, cookie = authCookie) =>
    fetch(origin + '/api' + url, {
      method: 'POST',
      headers: {
        origin,
        'content-type': 'application/json',
        ...(cookie ? { cookie } : {})
      },
      body: JSON.stringify(body)
    });

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'simcaster-challenger-feed-'));
    port = 39000 + Math.floor(Math.random() * 15000);
    origin = 'http://localhost:' + port;

    serverProcess = spawn(process.execPath, ['server/index.js'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        APP_ORIGIN: origin,
        SIMCASTER_DEMO_MODE: 'true',
        NODE_ENV: 'test',
        DATA_FILE: path.join(tmpDir, 'store.json')
      },
      stdio: 'ignore'
    });

    await waitForServer(origin + '/api/health');

    // Create authenticated guest session
    const loginRes = await post('/auth/guest', { name: 'EmpiricalChallenger' }, null);
    assert.equal(loginRes.status, 200, 'Guest login must succeed');
    authCookie = loginRes.headers.get('set-cookie')?.split(';')[0];
    assert.ok(authCookie, 'Must receive auth cookie');
  });

  after(() => {
    if (serverProcess) {
      serverProcess.kill();
    }
    if (tmpDir) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    }
  });

  // --- VECTOR 2: GET /api/feed?channel=... Edge Cases ---
  describe('V2: GET /api/feed Channel Parameter Resilience', () => {
    it('P2.1: Missing channel parameter returns global feed with channel: null', async () => {
      const res = await get('/feed');
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.channel, null);
      assert.ok(Array.isArray(data.casts));
      assert.equal(data.casts.length, 8);
    });

    it('P2.2: Empty channel query (?channel=) returns global feed with channel: null', async () => {
      const res = await get('/feed?channel=');
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.channel, null);
      assert.ok(Array.isArray(data.casts));
      assert.equal(data.casts.length, 8);
    });

    it('P2.3: Whitespace and slashes (?channel=%20%20, ?channel=///) normalize to channel: null', async () => {
      const resWs = await get('/feed?channel=%20%20');
      assert.equal(resWs.status, 200);
      const dataWs = await resWs.json();
      assert.equal(dataWs.channel, null);
      assert.equal(dataWs.casts.length, 8);

      const resSl = await get('/feed?channel=///');
      assert.equal(resSl.status, 200);
      const dataSl = await resSl.json();
      assert.equal(dataSl.channel, null);
      assert.equal(dataSl.casts.length, 8);
    });

    it('P2.4: Keyword queries (?channel=all, ?channel=global) normalize to channel: null', async () => {
      for (const kw of ['all', 'global', 'ALL', 'Global', '/all']) {
        const res = await get(`/feed?channel=${encodeURIComponent(kw)}`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.channel, null, `Keyword ${kw} should normalize channel to null`);
        assert.equal(data.casts.length, 8);
      }
    });

    it('P2.5: Valid channels (dev, memes, base, farcaster) return filtered feeds with channel ID', async () => {
      const targets = [
        { q: 'dev', expectedChan: 'dev' },
        { q: '/dev', expectedChan: 'dev' },
        { q: 'DEV', expectedChan: 'dev' },
        { q: 'memes', expectedChan: 'memes' },
        { q: '/memes', expectedChan: 'memes' },
        { q: 'base', expectedChan: 'base' },
        { q: '/base', expectedChan: 'base' },
        { q: 'farcaster', expectedChan: 'farcaster' },
        { q: '/farcaster', expectedChan: 'farcaster' }
      ];

      for (const { q, expectedChan } of targets) {
        const res = await get(`/feed?channel=${encodeURIComponent(q)}`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.channel, expectedChan);
        assert.ok(Array.isArray(data.casts));
        assert.equal(data.casts.length, 2);
        assert.ok(data.casts.every((c) => c.channel === expectedChan));
      }
    });

    it('P2.6: Non-existent channel (?channel=nonexistent) returns 200 OK with empty casts array []', async () => {
      const res = await get('/feed?channel=nonexistent_zone_xyz');
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.channel, 'nonexistent_zone_xyz');
      assert.ok(Array.isArray(data.casts));
      assert.equal(data.casts.length, 0);
    });

    it('P2.7: Special characters, %20, and XSS probe strings return 200 OK without crashing server', async () => {
      const hostileQueries = [
        '%20',
        '<script>alert("feed")</script>',
        '../../etc/shadow',
        "' OR '1'='1",
        '${7*7}',
        'channel?with#fragment',
        '🦄_crypto_zone'
      ];

      for (const hq of hostileQueries) {
        const res = await get(`/feed?channel=${encodeURIComponent(hq)}`);
        assert.equal(res.status, 200, `Query ${hq} must return 200 OK`);
        const data = await res.json();
        assert.ok(Array.isArray(data.casts), `Query ${hq} must return casts array`);
      }
    });

    it('P2.8: Duplicate array parameter (?channel=dev&channel=memes) is handled safely without crash', async () => {
      const res = await get('/feed?channel=dev&channel=memes');
      assert.equal(res.status, 200);
      const data = await res.json();
      // Express parses duplicate query keys into an array ['dev', 'memes'].
      // normalizeChannel checks `typeof raw === 'string'`, so array safely falls back to null.
      assert.equal(data.channel, null);
      assert.ok(Array.isArray(data.casts));
      assert.equal(data.casts.length, 8);
    });

    it('P2.9: Extremely long channel query string is capped at 64 chars and does not crash server', async () => {
      const hugeParam = 'longchannel_'.repeat(200); // 2400 chars
      const res = await get(`/feed?channel=${encodeURIComponent(hugeParam)}`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(typeof data.channel === 'string');
      assert.ok(data.channel.length <= 64, 'Channel parameter must be capped at 64 characters');
    });

    it('P2.10: Unauthenticated access to /api/feed returns HTTP 401', async () => {
      const res = await get('/feed', null);
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.ok(data.error);
    });
  });

  // --- VECTOR 3: Cast Creation & Feed Cross-Filtering ---
  describe('V3: POST /api/casts Channel Tagging & Feed Roundtrip', () => {
    it('P3.1: Composing cast tagged with channel "dev" persists and appears in /feed?channel=dev', async () => {
      const castRes = await post('/casts', {
        text: 'Empirical challenge cast for /dev district!',
        channel: 'dev'
      });
      assert.equal(castRes.status, 201);
      const castData = await castRes.json();
      assert.equal(castData.ok, true);
      assert.equal(castData.cast.channel, 'dev');
      const devCastHash = castData.cast.hash;

      // Verify appearance in /feed?channel=dev
      const devFeedRes = await get('/feed?channel=dev');
      assert.equal(devFeedRes.status, 200);
      const devFeed = await devFeedRes.json();
      assert.ok(devFeed.casts.some((c) => c.hash === devCastHash), 'New dev cast must appear in /dev feed');

      // Verify absence in /feed?channel=memes
      const memesFeedRes = await get('/feed?channel=memes');
      const memesFeed = await memesFeedRes.json();
      assert.ok(!memesFeed.casts.some((c) => c.hash === devCastHash), 'Dev cast must NOT appear in /memes feed');

      // Verify appearance in global feed /feed
      const globalFeedRes = await get('/feed');
      const globalFeed = await globalFeedRes.json();
      assert.ok(globalFeed.casts.some((c) => c.hash === devCastHash), 'Dev cast must appear in global feed');
    });

    it('P3.2: Composing cast with leading slash channel "/memes" normalizes to "memes"', async () => {
      const castRes = await post('/casts', {
        text: 'Meme zone probe with leading slash',
        channel: '/memes'
      });
      assert.equal(castRes.status, 201);
      const castData = await castRes.json();
      assert.equal(castData.cast.channel, 'memes');

      const memesFeed = await (await get('/feed?channel=memes')).json();
      assert.ok(memesFeed.casts.some((c) => c.hash === castData.cast.hash));
    });

    it('P3.3: Composing cast with uppercase channel "BASE" normalizes to "base"', async () => {
      const castRes = await post('/casts', {
        text: 'Base market uppercase test',
        channel: 'BASE'
      });
      assert.equal(castRes.status, 201);
      const castData = await castRes.json();
      assert.equal(castData.cast.channel, 'base');

      const baseFeed = await (await get('/feed?channel=base')).json();
      assert.ok(baseFeed.casts.some((c) => c.hash === castData.cast.hash));
    });

    it('P3.4: Untagged cast (channel: null or omitted) defaults to null and appears in global and /farcaster', async () => {
      const untaggedRes = await post('/casts', {
        text: 'Untagged general plaza broadcast'
      });
      assert.equal(untaggedRes.status, 201);
      const castData = await untaggedRes.json();
      assert.equal(castData.cast.channel, null);
      const untaggedHash = castData.cast.hash;

      // Global feed includes untagged cast
      const globalFeed = await (await get('/feed')).json();
      assert.ok(globalFeed.casts.some((c) => c.hash === untaggedHash));

      // Farcaster district feed (Main Plaza default) includes untagged casts
      const farcasterFeed = await (await get('/feed?channel=farcaster')).json();
      assert.ok(farcasterFeed.casts.some((c) => c.hash === untaggedHash), 'Untagged cast must appear in default /farcaster district feed');

      // Dev feed does NOT include untagged cast
      const devFeed = await (await get('/feed?channel=dev')).json();
      assert.ok(!devFeed.casts.some((c) => c.hash === untaggedHash), 'Untagged cast must not appear in /dev feed');
    });

    it('P3.5: Channel "all" or "global" in cast composer normalizes to null (global)', async () => {
      const allCastRes = await post('/casts', {
        text: 'Cast targeting all channel keyword',
        channel: 'all'
      });
      assert.equal(allCastRes.status, 201);
      const castData = await allCastRes.json();
      assert.equal(castData.cast.channel, null);
    });

    it('P3.6: Malformed channel inputs (non-string types, whitespace, %20) are handled safely', async () => {
      // Whitespace channel normalizes to null
      const wsCast = await (await post('/casts', { text: 'Whitespace chan test', channel: '   ' })).json();
      assert.equal(wsCast.cast.channel, null);

      // Number channel normalizes to null
      const numCast = await (await post('/casts', { text: 'Number chan test', channel: 12345 })).json();
      assert.equal(numCast.cast.channel, null);

      // Object channel normalizes safely to null in API
      const objCast = await (await post('/casts', { text: 'Obj chan test', channel: { id: 'dev' } })).json();
      assert.equal(objCast.cast.channel, null);

      // %20 channel creates cast tagged '%20' safely without crashing
      const pctCast = await (await post('/casts', { text: 'Pct chan test', channel: '%20' })).json();
      assert.equal(pctCast.cast.channel, '%20');
      const pctFeed = await (await get('/feed?channel=%20')).json();
      assert.ok(pctFeed.casts.some((c) => c.hash === pctCast.cast.hash));
    });

    it('P3.7: Querying feed for a channel with 0 casts returns empty array [] with 200 OK', async () => {
      const emptyRes = await get('/feed?channel=empty_district_zero_casts');
      assert.equal(emptyRes.status, 200);
      const data = await emptyRes.json();
      assert.equal(data.channel, 'empty_district_zero_casts');
      assert.deepEqual(data.casts, []);
    });
  });

  // --- VECTOR 4: Stress Harness & Concurrent Requests ---
  describe('V4: High-Concurrency Stress & Throttling Resilience Harness', () => {
    it('P4.1: 15 concurrent GET /api/feed requests with randomized channel queries complete with 200 OK', async () => {
      const queryVariations = [
        'dev',
        '/dev',
        'DEV',
        'memes',
        '/memes',
        'base',
        '/base',
        'farcaster',
        '/farcaster',
        '',
        'all',
        'global',
        '%20',
        '///dev',
        'nonexistent'
      ];

      const promises = [];
      for (let i = 0; i < 15; i++) {
        const q = queryVariations[i % queryVariations.length];
        const url = q ? `/feed?channel=${encodeURIComponent(q)}` : '/feed';
        promises.push(
          get(url).then(async (res) => {
            assert.equal(res.status, 200, `Request ${i} (${url}) must return 200`);
            const data = await res.json();
            assert.ok(Array.isArray(data.casts), `Request ${i} must return casts array`);
            return { index: i, count: data.casts.length, channel: data.channel };
          })
        );
      }

      const results = await Promise.all(promises);
      assert.equal(results.length, 15, 'All 15 concurrent requests must resolve with 200 OK');
    });

    it('P4.2: Rate limiter throttles excessive requests with HTTP 429 without crashing server', async () => {
      // Intentionally exhaust the 60 req/min bucket
      let hit429 = false;
      for (let i = 0; i < 35; i++) {
        const res = await get('/feed?channel=dev');
        if (res.status === 429) {
          hit429 = true;
          const body = await res.json();
          assert.ok(body.error && body.error.includes('Rate limit reached'));
          break;
        }
      }
      assert.ok(hit429, 'Server throttle must activate and return HTTP 429 when 60 req/min exceeded');

      // Server remains alive and healthy for other endpoints
      const healthRes = await fetch(origin + '/api/health');
      assert.equal(healthRes.status, 200);
      const healthData = await healthRes.json();
      assert.equal(healthData.ok, true);
    });
  });
});
