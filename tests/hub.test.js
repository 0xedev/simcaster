import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hexToBytes,
  getAppSigner,
  getAppFid,
  hasAppSigner,
  publishCastToHub,
  publishReactionToHub
} from '../server/hub.js';

test('App-level Ed25519 signer (fc-appkey style) initialization and Hub message signing', async () => {
  // Test hexToBytes conversion
  const bytes = hexToBytes('0x1234abcd');
  assert.equal(bytes.length, 4);
  assert.equal(bytes[0], 0x12);
  assert.equal(bytes[3], 0xcd);

  // Without environment variables set, signer is null
  const originalKey = process.env.FARCASTER_SIGNER_PRIVATE_KEY;
  const originalFid = process.env.FARCASTER_APP_FID;
  delete process.env.FARCASTER_SIGNER_PRIVATE_KEY;
  delete process.env.FARCASTER_APP_FID;

  assert.equal(getAppSigner(), null);
  assert.equal(getAppFid(), 0);
  assert.equal(hasAppSigner(), false);

  // Set 32-byte Ed25519 private key (output from fc-appkey)
  const dummySeed = '0x' + '01'.repeat(32);
  process.env.FARCASTER_SIGNER_PRIVATE_KEY = dummySeed;
  process.env.FARCASTER_APP_FID = '9999';

  assert.equal(getAppFid(), 9999);
  assert.ok(getAppSigner());
  assert.equal(hasAppSigner(), true);

  // Mock global fetch to verify hub message submission format
  const originalFetch = globalThis.fetch;
  let submittedBody = null;
  let submittedUrl = null;
  let submittedHeaders = null;

  globalThis.fetch = async (url, opts) => {
    submittedUrl = String(url);
    submittedBody = opts.body;
    submittedHeaders = opts.headers;
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true })
    };
  };

  try {
    // Publish a cast with app-level signer
    const castResult = await publishCastToHub({
      text: 'Simcaster live on Farcaster!',
      parent: null,
      quote: null,
      parentFid: 123
    });

    assert.ok(castResult);
    assert.equal(castResult.hubSynced, true);
    assert.ok(castResult.hash.startsWith('0x'));
    assert.ok(submittedUrl.includes('/v1/submitMessage'));
    assert.equal(submittedHeaders['content-type'], 'application/octet-stream');
    assert.ok(submittedBody && submittedBody.length > 50);

    // Publish a reaction (like)
    const dummyHash = '0x' + 'ab'.repeat(20);
    const reactionResult = await publishReactionToHub({
      type: 'like',
      targetHash: dummyHash,
      targetFid: 1,
      remove: false
    });

    assert.ok(reactionResult);
    assert.equal(reactionResult.hubSynced, true);

    // Publish a reaction removal (unlike)
    const removeReactionResult = await publishReactionToHub({
      type: 'like',
      targetHash: dummyHash,
      targetFid: 1,
      remove: true
    });

    assert.ok(removeReactionResult);
    assert.equal(removeReactionResult.hubSynced, true);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey !== undefined) process.env.FARCASTER_SIGNER_PRIVATE_KEY = originalKey;
    else delete process.env.FARCASTER_SIGNER_PRIVATE_KEY;
    if (originalFid !== undefined) process.env.FARCASTER_APP_FID = originalFid;
    else delete process.env.FARCASTER_APP_FID;
  }
});
