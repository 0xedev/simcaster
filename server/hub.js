import {
  NobleEd25519Signer,
  makeCastAdd,
  makeReactionAdd,
  makeReactionRemove,
  ReactionType,
  FarcasterNetwork,
  Message
} from '@farcaster/core';

let cachedSigner = null;
let cachedKeyRaw = null;

export function hexToBytes(hex) {
  if (typeof hex !== 'string') return new Uint8Array(0);
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  return new Uint8Array(Buffer.from(clean, 'hex'));
}

export function getAppSigner() {
  const rawKey = (process.env.FARCASTER_SIGNER_PRIVATE_KEY || process.env.FARCASTER_APP_KEY || '').trim();
  if (!rawKey) return null;
  if (cachedSigner && cachedKeyRaw === rawKey) return cachedSigner;

  try {
    const clean = rawKey.startsWith('0x') ? rawKey.slice(2) : rawKey;
    let bytes = Buffer.from(clean, 'hex');
    // An Ed25519 seed is 32 bytes. If a full 64-byte keypair was provided, take the first 32 bytes (the seed).
    if (bytes.length >= 64) bytes = bytes.subarray(0, 32);
    if (bytes.length !== 32) {
      console.warn('[hub] FARCASTER_SIGNER_PRIVATE_KEY must be a 32-byte hex string (got ' + bytes.length + ' bytes)');
      return null;
    }
    cachedSigner = new NobleEd25519Signer(new Uint8Array(bytes));
    cachedKeyRaw = rawKey;
    return cachedSigner;
  } catch (err) {
    console.error('[hub] Failed to initialize Ed25519 signer:', err.message);
    return null;
  }
}

export function getAppFid() {
  const fidStr = process.env.FARCASTER_APP_FID || process.env.FARCASTER_FID || '';
  const num = Number(fidStr);
  return Number.isSafeInteger(num) && num > 0 ? num : 0;
}

export function getHubUrl() {
  if (process.env.FARCASTER_HUB_URL) return process.env.FARCASTER_HUB_URL.replace(/\/+$/, '');
  if (process.env.NEYNAR_API_KEY) return 'https://hub-api.neynar.com';
  return 'https://hub.farcaster.standardcrypto.vc:2281';
}

export function hasAppSigner() {
  const hasPrivate = !!(getAppSigner() && getAppFid());
  const hasUuid = !!(process.env.FARCASTER_SIGNER_UUID || process.env.NEYNAR_SIGNER_UUID);
  return hasPrivate || hasUuid;
}

export async function publishCastToHub({ text, parent, quote, parentFid }) {
  const signer = getAppSigner();
  const appFid = getAppFid();
  if (!signer || !appFid) return null;

  const embeds = [];
  if (quote && typeof quote.hash === 'string' && /^0x[0-9a-fA-F]{40}$/.test(quote.hash)) {
    embeds.push({
      castId: {
        fid: Number(quote.fid || quote.author?.fid || 1),
        hash: hexToBytes(quote.hash)
      }
    });
  }

  let parentCastId = undefined;
  if (parent && typeof parent === 'string' && /^0x[0-9a-fA-F]{40}$/.test(parent)) {
    parentCastId = {
      fid: Number(parentFid || 1),
      hash: hexToBytes(parent)
    };
  }

  const castAddResult = await makeCastAdd(
    {
      text,
      embeds,
      embedsDeprecated: [],
      mentions: [],
      mentionsPositions: [],
      ...(parentCastId ? { parentCastId } : {})
    },
    { fid: appFid, network: FarcasterNetwork.MAINNET },
    signer
  );

  if (castAddResult.isErr()) {
    throw new Error(`Failed to sign cast: ${castAddResult.error.message}`);
  }

  const msg = castAddResult.value;
  const encoded = Message.encode(msg).finish();
  const hubUrl = getHubUrl();
  const headers = { 'content-type': 'application/octet-stream' };
  if (process.env.NEYNAR_API_KEY && hubUrl.includes('neynar.com')) {
    headers['x-api-key'] = process.env.NEYNAR_API_KEY;
  }

  const hubRes = await fetch(`${hubUrl}/v1/submitMessage`, {
    method: 'POST',
    headers,
    body: encoded,
    signal: AbortSignal.timeout(8000)
  });

  const hash = '0x' + Buffer.from(msg.hash).toString('hex');
  return {
    hash,
    hubSynced: hubRes.ok,
    status: hubRes.status
  };
}

export async function publishReactionToHub({ type, targetHash, targetFid = 1, remove = false }) {
  const signer = getAppSigner();
  const appFid = getAppFid();
  if (!signer || !appFid) return null;
  if (typeof targetHash !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(targetHash)) return null;

  const reactionType = type === 'recast' ? ReactionType.RECAST : ReactionType.LIKE;
  const targetCastId = {
    fid: Number(targetFid || 1),
    hash: hexToBytes(targetHash)
  };

  const reactionResult = remove
    ? await makeReactionRemove({ type: reactionType, targetCastId }, { fid: appFid, network: FarcasterNetwork.MAINNET }, signer)
    : await makeReactionAdd({ type: reactionType, targetCastId }, { fid: appFid, network: FarcasterNetwork.MAINNET }, signer);

  if (reactionResult.isErr()) {
    throw new Error(`Failed to sign reaction: ${reactionResult.error.message}`);
  }

  const msg = reactionResult.value;
  const encoded = Message.encode(msg).finish();
  const hubUrl = getHubUrl();
  const headers = { 'content-type': 'application/octet-stream' };
  if (process.env.NEYNAR_API_KEY && hubUrl.includes('neynar.com')) {
    headers['x-api-key'] = process.env.NEYNAR_API_KEY;
  }

  const hubRes = await fetch(`${hubUrl}/v1/submitMessage`, {
    method: 'POST',
    headers,
    body: encoded,
    signal: AbortSignal.timeout(8000)
  });

  return {
    hubSynced: hubRes.ok,
    status: hubRes.status
  };
}
