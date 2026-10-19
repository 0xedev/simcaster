import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { careerForXp, clamp, DAILY_QUESTS, PLAZA_HOTSPOTS } from './rules.js';

const defaultState = () => ({
  accounts: {},
  sessions: {},
  scores: {},
  blocked: {},
  homes: {},
  reports: [],
  friends: {},
  signers: {},
  casts: [],
  reactions: {},
  election: {
    candidates: {},
    votes: {},
    activePolicy: 'creator_stimulus'
  }
});

const palettes = ['violet', 'citrus', 'coral', 'mint', 'sky'];
const outfits = ['street', 'casual', 'sport', 'formal'];
const hairStyles = ['short', 'curls', 'buzz', 'long'];
const skinTones = ['warm', 'light', 'tan', 'deep', 'dark'];
const hairColors = ['espresso', 'chestnut', 'auburn', 'blonde', 'silver'];
const accessories = ['none', 'glasses', 'cap', 'headphones', 'earrings'];
const builds = ['regular', 'slim', 'broad'];

export const FURNITURE_CATALOG = [
  { type: 'sofa', label: 'Lounge Sofa', emoji: '🛋️', price: 0, effect: 'Rest (+25 DEGEN, +20 Energy, +12 Vibe)' },
  { type: 'table', label: 'Oak Table', emoji: '🪵', price: 0, effect: 'Host hangout (+20 DEGEN, +10 Vibe)' },
  { type: 'plant', label: 'Monstera Plant', emoji: '🪴', price: 0, effect: 'Fresh air (+20 DEGEN, +12 Vibe)' },
  { type: 'lamp', label: 'Warm Floor Lamp', emoji: '💡', price: 0, effect: 'Cozy mood (+20 DEGEN, +10 Vibe)' },
  { type: 'rug', label: 'Woven Rug', emoji: '🧶', price: 0, effect: 'Chill session (+20 DEGEN, +10 Vibe)' },
  { type: 'chair', label: 'Accent Chair', emoji: '🪑', price: 0, effect: 'Quick break (+25 DEGEN, +15 Energy)' },
  { type: 'bed', label: 'Cloud Bed', emoji: '🛏️', price: 60, effect: 'Power nap (+40 DEGEN, +45 Energy)' },
  { type: 'espresso_bar', label: 'Artisan Espresso Bar', emoji: '☕', price: 85, effect: 'Refuel (+50 DEGEN, +35 Energy, +35 Hunger)' },
  { type: 'dj_booth', label: 'Synthwave DJ Decks', emoji: '🎧', price: 150, effect: 'House party (+70 DEGEN, +40 Vibe, +12 Clout)' },
  { type: 'arcade_cabinet', label: 'Retro Arcade Rig', emoji: '🕹️', price: 180, effect: 'High score run (+75 DEGEN, +35 Vibe, +10 Clout)' },
  { type: 'work_desk', label: 'Creator Studio Desk', emoji: '🖥️', price: 110, effect: 'Remote build (+80 DEGEN, +20 XP)' },
  { type: 'neon_sign', label: 'Farcaster Neon Sign', emoji: '✨', price: 75, effect: 'Channel flex (+45 DEGEN, +20 Vibe, +14 Clout)' }
];

export const HOME_TIERS = {
  studio: { id: 'studio', name: 'Starter Studio', price: 0, maxItems: 15, bound: 4, size: 12, description: 'Cozy 12×12 starter pad (15 items max)' },
  loft: { id: 'loft', name: 'Midtown Loft', price: 450, maxItems: 28, bound: 6, size: 16, description: 'Spacious 16×16 creative loft (28 items max)' },
  penthouse: { id: 'penthouse', name: 'Skyline Penthouse', price: 1200, maxItems: 45, bound: 8, size: 22, description: 'Luxury 22×22 skyline penthouse (45 items max)' }
};

export const CITY_POLICIES = {
  creator_stimulus: { id: 'creator_stimulus', label: 'Creator Stimulus', description: '+25% DEGEN on all Channel activities & creator gigs' },
  zero_cafe_tax: { id: 'zero_cafe_tax', label: 'Zero Café Tax', description: '50% off VIP & venue fees + bonus Energy' },
  arcade_fever: { id: 'arcade_fever', label: 'Arcade Fever', description: '2x DEGEN & Clout for all Arcade games' }
};

export const SUPPORTED_CURRENCIES = ['degen', 'moxie', 'warps', 'creds'];

export const DEFAULT_CURRENCIES = {
  degen: 1000,
  moxie: 500,
  warps: 100,
  creds: 250
};

export function normalizeCurrency(raw) {
  if (typeof raw !== 'string') return 'degen';
  const clean = raw.trim().replace(/^[\$₡]/, '').toLowerCase();
  if (clean === 'cred') return 'creds';
  return SUPPORTED_CURRENCIES.includes(clean) ? clean : null;
}

const furniture = FURNITURE_CATALOG.map((f) => f.type);

export function validateAvatar(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid avatar');
  const { color, outfit, hair, skin = 'warm', hairColor = 'espresso', accessory = 'none', build = 'regular' } = input;
  if (
    !palettes.includes(color) ||
    !outfits.includes(outfit) ||
    !hairStyles.includes(hair) ||
    !skinTones.includes(skin) ||
    !hairColors.includes(hairColor) ||
    !accessories.includes(accessory) ||
    !builds.includes(build)
  ) {
    throw new Error('Unsupported avatar option');
  }
  return { color, outfit, hair, skin, hairColor, accessory, build };
}

export function validateHome(input, tierId = 'studio') {
  const tier = HOME_TIERS[tierId] || HOME_TIERS.studio;
  if (!input || !Array.isArray(input.items) || input.items.length > tier.maxItems) {
    throw new Error('Invalid home layout');
  }
  return {
    tier: tier.id,
    items: input.items.map((item) => {
      if (
        !item ||
        !furniture.includes(item.type) ||
        !Number.isInteger(item.x) ||
        !Number.isInteger(item.z) ||
        item.x < -tier.bound ||
        item.x > tier.bound ||
        item.z < -tier.bound ||
        item.z > tier.bound
      ) {
        throw new Error('Invalid furniture placement');
      }
      const rot = item.rot !== undefined ? Number(item.rot) : 0;
      if (![0, 90, 180, 270].includes(rot)) throw new Error('Invalid furniture rotation');
      return rot ? { type: item.type, x: item.x, z: item.z, rot } : { type: item.type, x: item.x, z: item.z };
    })
  };
}

export function sampleFeed(channel = null) {
  const allSampleCasts = [
    // /farcaster (Main Plaza)
    {
      hash: 'demo-farcaster-1',
      channel: 'farcaster',
      author: { fid: 1, display_name: 'Dan Romero', username: 'dwr.eth', pfp_url: '' },
      text: 'Welcome to Simcaster Metropolis Plaza! Explore the districts, hang out by the fountain, and meet fellow casters. ✦',
      timestamp: new Date(Date.now() - 15 * 60000).toISOString(),
      reactions: { likes_count: 88, recasts_count: 24 },
      replies: { count: 12 }
    },
    {
      hash: 'demo-farcaster-2',
      channel: 'farcaster',
      author: { fid: 2, display_name: 'Maya Chen', username: 'maya.world', pfp_url: '' },
      text: 'Grabbed an iced matcha at Warp Bean Café ☕ The plaza vibes today are immaculate. Come say hi in the central square!',
      timestamp: new Date(Date.now() - 45 * 60000).toISOString(),
      reactions: { likes_count: 45, recasts_count: 8 },
      replies: { count: 5 }
    },
    // /dev (Builders Foundry)
    {
      hash: 'demo-dev-1',
      channel: 'dev',
      author: { fid: 3, display_name: 'Varun Srinivasan', username: 'v', pfp_url: '' },
      text: 'Shipping mini-apps and Frames v2 directly inside the Builders Foundry. Latency <50ms across the plaza grid. 💻⚡',
      timestamp: new Date(Date.now() - 30 * 60000).toISOString(),
      reactions: { likes_count: 142, recasts_count: 38 },
      replies: { count: 19 }
    },
    {
      hash: 'demo-dev-2',
      channel: 'dev',
      author: { fid: 4, display_name: 'Elena Rostova', username: 'elena_dev', pfp_url: '' },
      text: 'Just optimized our R3F instanced meshes for Simcaster avatars. 60fps on mobile! Building in public at The Foundry Studio.',
      timestamp: new Date(Date.now() - 90 * 60000).toISOString(),
      reactions: { likes_count: 56, recasts_count: 14 },
      replies: { count: 7 }
    },
    // /memes (Arcade Lounge)
    {
      hash: 'demo-memes-1',
      channel: 'memes',
      author: { fid: 5, display_name: 'Theo Rivers', username: 'theor', pfp_url: '' },
      text: 'The Laser Tag Arcade is popping off! Who thinks they can beat my high score in the arena today? 🕹️🔥',
      timestamp: new Date(Date.now() - 120 * 60000).toISOString(),
      reactions: { likes_count: 95, recasts_count: 29 },
      replies: { count: 15 }
    },
    {
      hash: 'demo-memes-2',
      channel: 'memes',
      author: { fid: 6, display_name: 'Degen Pepe', username: 'degenpepe', pfp_url: '' },
      text: 'Me pretending to work barista shifts while secretly tipping everyone 100 $DEGEN at the Purple Lounge 🐸☕',
      timestamp: new Date(Date.now() - 180 * 60000).toISOString(),
      reactions: { likes_count: 210, recasts_count: 64 },
      replies: { count: 28 }
    },
    // /base (Onchain Market)
    {
      hash: 'demo-base-1',
      channel: 'base',
      author: { fid: 7, display_name: 'Jesse Pollak', username: 'jesse.base.eth', pfp_url: '' },
      text: 'Base is for everyone. Onchain pop-up market is officially live with zero-gas drops! Based and plaza-pilled 🔵✨',
      timestamp: new Date(Date.now() - 60 * 60000).toISOString(),
      reactions: { likes_count: 340, recasts_count: 112 },
      replies: { count: 44 }
    },
    {
      hash: 'demo-base-2',
      channel: 'base',
      author: { fid: 8, display_name: 'Ari Okafor', username: 'ari', pfp_url: '' },
      text: 'Flipped a limited creator merch drop at the Pop-Up Market for ₡200 creds! Economy onchain is thriving 🛍️',
      timestamp: new Date(Date.now() - 240 * 60000).toISOString(),
      reactions: { likes_count: 67, recasts_count: 18 },
      replies: { count: 9 }
    }
  ];

  if (!channel || typeof channel !== 'string') {
    return allSampleCasts;
  }
  const clean = channel.trim().replace(/^\/+/, '').toLowerCase();
  if (!clean || clean === 'all' || clean === 'global') {
    return allSampleCasts;
  }
  return allSampleCasts.filter((c) => c.channel === clean);
}

export class Store {
  constructor(filename, options = {}) {
    this.filename = filename;
    this.pgAdapter = options.pgAdapter || null;
    this.clusterBus = options.clusterBus || null;
    this.onRemoteSync = options.onRemoteSync || null;
    this.lastPgSync = Promise.resolve();
    this.state = defaultState();
    if (filename && fs.existsSync(filename)) {
      const parsed = JSON.parse(fs.readFileSync(filename, 'utf8'));
      this.state = { ...this.state, ...parsed };
      this.state.election = { ...defaultState().election, ...(parsed.election || {}) };
    }
    this.flushTimer = null;
    if (this.clusterBus) {
      this.clusterBus.on('store:sync', (remoteState) => {
        this.mergeClusterState(remoteState);
      });
    }
  }

  async hydrateFromPostgres() {
    if (!this.pgAdapter) return this.state;
    const loaded = await this.pgAdapter.loadState();
    if (loaded) {
      this.mergeClusterState(loaded);
    } else {
      await this.pgAdapter.saveState(this.state);
    }
    return this.state;
  }

  mergeClusterState(remote) {
    if (!remote || typeof remote !== 'object') return;
    for (const key of ['accounts', 'sessions', 'scores', 'blocked', 'homes', 'friends', 'signers', 'reactions']) {
      if (remote[key] && typeof remote[key] === 'object') {
        this.state[key] = { ...this.state[key], ...remote[key] };
      }
    }
    if (Array.isArray(remote.casts)) {
      const existing = new Map((this.state.casts || []).map((c) => [c.hash, c]));
      for (const c of remote.casts) {
        if (c && c.hash) existing.set(c.hash, c);
      }
      this.state.casts = [...existing.values()].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    }
    if (remote.election && typeof remote.election === 'object') {
      this.state.election = { ...this.state.election, ...remote.election };
    }
    if (typeof this.onRemoteSync === 'function') {
      this.onRemoteSync(remote);
    }
  }

  #syncExternal() {
    if (this.pgAdapter) {
      const snapshot = structuredClone(this.state);
      this.lastPgSync = this.lastPgSync
        .then(() => this.pgAdapter.saveState(snapshot))
        .catch(() => {});
    }
    if (this.clusterBus) {
      this.clusterBus.publish('store:sync', this.state);
    }
  }

  async flush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
      this.save();
    }
    await this.lastPgSync;
  }

  save() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.filename) {
      // Serial synchronous atomic rename is safe for one Node process.
      const directory = path.dirname(this.filename);
      fs.mkdirSync(directory, { recursive: true });
      const temporary = this.filename + '.' + process.pid + '.tmp';
      fs.writeFileSync(temporary, JSON.stringify(this.state));
      fs.renameSync(temporary, this.filename);
    }
    this.#syncExternal();
  }

  saveDebounced() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(async () => {
      this.flushTimer = null;
      try {
        if (this.filename) {
          const directory = path.dirname(this.filename);
          await fs.promises.mkdir(directory, { recursive: true });
          const temporary = this.filename + '.' + process.pid + '.async.tmp';
          await fs.promises.writeFile(temporary, JSON.stringify(this.state));
          await fs.promises.rename(temporary, this.filename);
        }
      } catch {
        // Fallback if concurrent sync write occurred
      }
      this.#syncExternal();
    }, 400);
    this.flushTimer.unref?.();
  }

  ensureLifeState(a) {
    if (typeof a.creds !== 'number' || !Number.isFinite(a.creds)) a.creds = 250;
    if (!a.currencies || typeof a.currencies !== 'object') {
      a.currencies = {
        degen: 1000,
        moxie: 500,
        warps: 100,
        creds: a.creds
      };
    } else {
      if (typeof a.currencies.degen !== 'number' || !Number.isFinite(a.currencies.degen)) a.currencies.degen = 1000;
      if (typeof a.currencies.moxie !== 'number' || !Number.isFinite(a.currencies.moxie)) a.currencies.moxie = 500;
      if (typeof a.currencies.warps !== 'number' || !Number.isFinite(a.currencies.warps)) a.currencies.warps = 100;
      if (typeof a.currencies.creds !== 'number' || !Number.isFinite(a.currencies.creds)) {
        a.currencies.creds = a.creds;
      }
      if (a.creds !== a.currencies.creds) {
        a.currencies.creds = a.creds;
      }
    }
    a.creds = a.currencies.creds;
    if (typeof a.xp !== 'number' || !Number.isFinite(a.xp)) a.xp = 0;
    a.career = careerForXp(a.xp).id;
    if (!a.needs || typeof a.needs !== 'object') {
      a.needs = { energy: 85, hunger: 80, vibe: 75, clout: 10 };
    } else {
      a.needs.energy = clamp(Math.round(a.needs.energy ?? 85), 0, 100);
      a.needs.hunger = clamp(Math.round(a.needs.hunger ?? 80), 0, 100);
      a.needs.vibe = clamp(Math.round(a.needs.vibe ?? 75), 0, 100);
      a.needs.clout = clamp(Math.round(a.needs.clout ?? 10), 0, 100);
    }
    if (!HOME_TIERS[a.homeTier]) a.homeTier = 'studio';
    if (typeof a.powerBadge !== 'boolean') {
      a.powerBadge = Boolean(a.powerBadge);
    }
    if (!Array.isArray(a.ownedFurniture)) {
      a.ownedFurniture = ['sofa', 'table', 'plant', 'lamp', 'rug', 'chair'];
    }
    if (!a.quests || typeof a.quests !== 'object') {
      a.quests = {};
    }
    for (const q of DAILY_QUESTS) {
      if (!a.quests[q.id] || typeof a.quests[q.id] !== 'object') {
        a.quests[q.id] = { progress: 0, claimed: false };
      }
    }
    return a;
  }

  recordQuestProgress(fid, questId, amount = 1) {
    const user = this.findUser(fid);
    if (!user) return null;
    const quest = DAILY_QUESTS.find((q) => q.id === questId);
    if (!quest) return null;
    const entry = user.quests[questId] || { progress: 0, claimed: false };
    entry.progress = Math.min(quest.target, (entry.progress || 0) + amount);
    user.quests[questId] = entry;
    this.saveDebounced();
    return entry;
  }

  claimQuest(fid, questId) {
    const user = this.findUser(fid);
    if (!user) throw new Error('User not found');
    const quest = DAILY_QUESTS.find((q) => q.id === questId);
    if (!quest) throw new Error('Unknown daily quest');
    const state = user.quests?.[questId];
    if (!state || state.progress < quest.target) {
      throw new Error(`Complete "${quest.title}" (${state?.progress || 0}/${quest.target}) before claiming`);
    }
    if (state.claimed) {
      throw new Error('Quest reward already claimed today');
    }
    state.claimed = true;
    user.creds += quest.rewardCreds;
    user.currencies.creds = user.creds;
    user.xp += quest.rewardXp;
    const nextTier = careerForXp(user.xp);
    const promoted = nextTier.id !== user.career ? nextTier.title : null;
    user.career = nextTier.id;
    user.needs.clout = clamp(user.needs.clout + 12, 0, 100);
    user.needs.vibe = clamp(user.needs.vibe + 10, 0, 100);
    this.save();
    return {
      user,
      quest,
      rewardCreds: quest.rewardCreds,
      rewardXp: quest.rewardXp,
      promoted
    };
  }

  userFor(fid, profile = {}) {
    const key = String(fid);
    const now = Date.now();
    if (!this.state.accounts[key]) {
      this.state.accounts[key] = {
        fid: Number(fid),
        username: 'fid-' + fid,
        displayName: 'Farcaster #' + fid,
        avatarUrl: '',
        avatar: { color: 'violet', outfit: 'street', hair: 'short' },
        creds: 250,
        currencies: {
          degen: 1000,
          moxie: 500,
          warps: 100,
          creds: 250
        },
        xp: 0,
        career: 'newcomer',
        needs: { energy: 85, hunger: 80, vibe: 75, clout: 10 },
        homeTier: 'studio',
        ownedFurniture: ['sofa', 'table', 'plant', 'lamp', 'rug', 'chair'],
        quests: {},
        createdAt: now
      };
    }
    const a = this.ensureLifeState(this.state.accounts[key]);
    if (typeof profile.username === 'string' && profile.username) a.username = profile.username.slice(0, 32);
    if (typeof profile.displayName === 'string' && profile.displayName) a.displayName = profile.displayName.slice(0, 64);
    if (typeof profile.avatarUrl === 'string' && profile.avatarUrl.startsWith('https://')) a.avatarUrl = profile.avatarUrl.slice(0, 500);
    if (typeof profile.power_badge === 'boolean') a.powerBadge = profile.power_badge;
    else if (typeof profile.powerBadge === 'boolean') a.powerBadge = profile.powerBadge;
    this.save();
    return a;
  }

  transferTip(fromFid, toFid, amount, currency = 'degen', options = {}) {
    const senderFid = Number(fromFid);
    const recipientFid = Number(toFid);

    if (!Number.isSafeInteger(senderFid) || senderFid < 1) {
      throw new Error('Invalid sender FID');
    }
    if (!Number.isSafeInteger(recipientFid) || recipientFid < 1) {
      throw new Error('Invalid recipient FID (toFid is required)');
    }
    if (senderFid === recipientFid) {
      throw new Error('Cannot tip yourself');
    }

    const curr = normalizeCurrency(currency);
    if (!curr) {
      throw new Error(`Unsupported currency: ${currency}. Supported: ${SUPPORTED_CURRENCIES.join(', ')}`);
    }

    const tipAmount = Number(amount);
    if (!Number.isSafeInteger(tipAmount) || tipAmount <= 0) {
      throw new Error('Tip amount must be a positive integer');
    }

    if (this.isBlocked(senderFid, recipientFid)) {
      throw new Error('Cannot tip a blocked player');
    }

    const sender = this.findUser(senderFid);
    if (!sender) {
      throw new Error('Sender account not found');
    }

    const castHash = typeof options === 'string' ? options : options?.castHash || null;

    let recipient = this.findUser(recipientFid);
    if (!recipient && castHash) {
      const cast = (this.state.casts || []).find((c) => c.hash === castHash) ||
        sampleFeed().find((c) => c.hash === castHash);
      if (cast && Number(cast.author?.fid) === recipientFid) {
        recipient = this.userFor(recipientFid, {
          displayName: cast.author.display_name,
          username: cast.author.username,
          avatarUrl: cast.author.pfp_url
        });
      }
    }

    if (!recipient && (recipientFid === 12345 || (recipientFid >= 1 && recipientFid <= 10))) {
      recipient = this.userFor(recipientFid, {
        displayName: recipientFid === 12345 ? 'Bob' : 'Caster #' + recipientFid,
        username: recipientFid === 12345 ? 'bob' : 'caster' + recipientFid
      });
    }

    if (!recipient) {
      const err = new Error('Recipient account not found');
      err.code = 'RECIPIENT_NOT_FOUND';
      throw err;
    }

    const senderBalance = sender.currencies?.[curr] ?? 0;
    if (senderBalance < tipAmount) {
      const err = new Error(`Insufficient ${curr.toUpperCase()} balance (have ${senderBalance}, need ${tipAmount})`);
      err.code = 'INSUFFICIENT_BALANCE';
      throw err;
    }

    // Execute transfer
    sender.currencies[curr] -= tipAmount;
    recipient.currencies[curr] = (recipient.currencies[curr] || 0) + tipAmount;

    if (curr === 'creds') {
      sender.creds = sender.currencies.creds;
      recipient.creds = recipient.currencies.creds;
    }

    // Award +5 Clout and +5 Vibe to both accounts (clamped 0-100)
    sender.needs.clout = clamp(sender.needs.clout + 5, 0, 100);
    sender.needs.vibe = clamp(sender.needs.vibe + 5, 0, 100);
    recipient.needs.clout = clamp(recipient.needs.clout + 5, 0, 100);
    recipient.needs.vibe = clamp(recipient.needs.vibe + 5, 0, 100);

    this.recordQuestProgress(senderFid, 'civic_life', 1);

    this.save();

    return {
      fromFid: senderFid,
      fromName: sender.displayName,
      toFid: recipientFid,
      toName: recipient.displayName,
      amount: tipAmount,
      currency: curr,
      castHash: castHash ? String(castHash) : null,
      fromBalance: sender.currencies[curr],
      toBalance: recipient.currencies[curr],
      cloutAwarded: 5,
      vibeAwarded: 5
    };
  }

  findUser(fid) {
    const u = this.state.accounts[String(fid)];
    return u ? this.ensureLifeState(u) : null;
  }

  updateAvatar(fid, input) {
    const user = this.findUser(fid);
    if (!user) throw new Error('User not found');
    user.avatar = validateAvatar(input);
    this.save();
    return user.avatar;
  }

  homeFor(fid) {
    const key = String(fid);
    const user = this.findUser(fid);
    const tier = user?.homeTier || 'studio';
    if (!this.state.homes[key]) {
      this.state.homes[key] = { tier, items: [{ type: 'sofa', x: 0, z: 1 }, { type: 'plant', x: -3, z: -2 }] };
      this.save();
    }
    this.state.homes[key].tier = tier;
    return this.state.homes[key];
  }

  updateHome(fid, input) {
    const user = this.findUser(fid);
    const tier = user?.homeTier || 'studio';
    const owned = new Set(user?.ownedFurniture || ['sofa', 'table', 'plant', 'lamp', 'rug', 'chair']);
    const home = validateHome(input, tier);
    for (const item of home.items) {
      if (!owned.has(item.type)) {
        throw new Error(`Unlock ${item.type} in the Shop before placing it`);
      }
    }
    this.state.homes[String(fid)] = home;
    this.save();
    return home;
  }

  buyFurniture(fid, itemType) {
    const user = this.findUser(fid);
    if (!user) throw new Error('User not found');
    const entry = FURNITURE_CATALOG.find((f) => f.type === itemType);
    if (!entry) throw new Error('Unknown furniture item');
    if (user.ownedFurniture.includes(itemType)) throw new Error('You already own this item');
    if (user.creds < entry.price) throw new Error(`Not enough DEGEN (need ${entry.price} DEGEN)`);
    user.creds -= entry.price;
    user.currencies.creds = user.creds;
    user.ownedFurniture.push(itemType);
    user.needs.vibe = clamp(user.needs.vibe + 6, 0, 100);
    this.save();
    return { creds: user.creds, ownedFurniture: user.ownedFurniture, item: entry };
  }

  upgradeHomeTier(fid, targetTier) {
    const user = this.findUser(fid);
    if (!user) throw new Error('User not found');
    const tier = HOME_TIERS[targetTier];
    if (!tier) throw new Error('Invalid apartment tier');
    const order = ['studio', 'loft', 'penthouse'];
    if (order.indexOf(targetTier) <= order.indexOf(user.homeTier)) {
      throw new Error('You already own this tier or higher');
    }
    if (user.creds < tier.price) throw new Error(`Need ${tier.price} DEGEN to upgrade to ${tier.name}`);
    user.creds -= tier.price;
    user.currencies.creds = user.creds;
    user.homeTier = targetTier;
    user.needs.clout = clamp(user.needs.clout + 20, 0, 100);
    user.needs.vibe = clamp(user.needs.vibe + 15, 0, 100);
    const home = this.homeFor(fid);
    home.tier = targetTier;
    this.save();
    return { creds: user.creds, homeTier: user.homeTier, home, needs: user.needs };
  }

  performHotspotAction(fid, hotspotId, actionId, blackoutActive = false) {
    const user = this.findUser(fid);
    if (!user) throw new Error('User not found');
    const hotspot = PLAZA_HOTSPOTS.find((h) => h.id === hotspotId);
    if (!hotspot) throw new Error('Unknown city venue');
    const action = hotspot.actions.find((a) => a.id === actionId) || hotspot.actions[0];
    if (!action) throw new Error('Unknown venue activity');

    const policy = this.cityStatus().activePolicy;
    let cost = action.cost || 0;
    if (user.powerBadge && hotspotId === 'neon-lounge' && actionId === 'party') {
      cost = 0; // VIP Rooftop Session fee bypass for Power Badge holders
    } else if (policy === 'zero_cafe_tax' && cost > 0) {
      cost = Math.max(1, Math.floor(cost * 0.5));
    }
    if (user.creds < cost) {
      throw new Error(`You need ${cost} DEGEN for ${action.label}`);
    }

    const tier = careerForXp(user.xp);
    let pay = Math.round((action.pay || 0) * tier.mult);
    if (policy === 'creator_stimulus' && pay > 0) {
      pay = Math.round(pay * 1.25);
    }
    if (hotspotId === 'power-grid' && blackoutActive) {
      pay += 90; // Hero bonus for restoring the Farcaster Hub Relay Core during an outage
    }

    const delta = pay - cost;
    user.creds = Math.max(0, user.creds + delta);
    user.currencies.creds = user.creds;
    user.xp += action.xp || 0;
    const nextTier = careerForXp(user.xp);
    const promoted = nextTier.id !== user.career;
    user.career = nextTier.id;

    const bonusEnergy = policy === 'zero_cafe_tax' && action.energy > 0 ? 8 : 0;
    user.needs.energy = clamp(user.needs.energy + (action.energy || 0) + bonusEnergy, 10, 100);
    user.needs.hunger = clamp(user.needs.hunger + (action.hunger || 0), 10, 100);
    user.needs.vibe = clamp(user.needs.vibe + (action.vibe || 0), 10, 100);
    user.needs.clout = clamp(user.needs.clout + (action.clout || 0), 0, 100);

    this.recordQuestProgress(fid, 'hustle_shifts', 1);
    this.saveDebounced();
    return {
      user,
      hotspot: hotspot.name,
      action: action.label,
      deltaCreds: delta,
      promoted: promoted ? nextTier.title : null
    };
  }

  useHomeFurniture(fid, itemType) {
    const user = this.findUser(fid);
    if (!user) throw new Error('User not found');
    const entry = FURNITURE_CATALOG.find((f) => f.type === itemType);
    if (!entry) throw new Error('Unknown furniture');
    let earnedDegen = 25;
    if (itemType === 'bed' || itemType === 'sofa' || itemType === 'chair') {
      earnedDegen = itemType === 'bed' ? 40 : 25;
      user.needs.energy = clamp(user.needs.energy + (itemType === 'bed' ? 45 : 20), 0, 100);
      user.needs.vibe = clamp(user.needs.vibe + 12, 0, 100);
    } else if (itemType === 'espresso_bar') {
      earnedDegen = 50;
      user.needs.energy = clamp(user.needs.energy + 35, 0, 100);
      user.needs.hunger = clamp(user.needs.hunger + 35, 0, 100);
    } else if (itemType === 'dj_booth' || itemType === 'neon_sign' || itemType === 'arcade_cabinet') {
      earnedDegen = itemType === 'arcade_cabinet' ? 75 : itemType === 'dj_booth' ? 70 : 45;
      user.needs.vibe = clamp(user.needs.vibe + 35, 0, 100);
      user.needs.clout = clamp(user.needs.clout + 12, 0, 100);
    } else if (itemType === 'work_desk') {
      earnedDegen = 80;
      user.needs.energy = clamp(user.needs.energy - 8, 10, 100);
    } else {
      earnedDegen = 20;
      user.needs.vibe = clamp(user.needs.vibe + 10, 0, 100);
    }
    user.creds += earnedDegen;
    user.currencies.creds = user.creds;
    user.currencies.degen = (user.currencies.degen || 0) + earnedDegen;
    user.xp += 12;
    user.career = careerForXp(user.xp).id;
    this.recordQuestProgress(fid, 'civic_life', 1);
    this.saveDebounced();
    return { user, effect: entry.effect, deltaCreds: earnedDegen };
  }

  tickPlayerNeeds(fid) {
    const user = this.findUser(fid);
    if (!user) return null;
    user.needs.energy = clamp(user.needs.energy - 1, 5, 100);
    user.needs.hunger = clamp(user.needs.hunger - 1, 5, 100);
    user.needs.vibe = clamp(user.needs.vibe - 1, 10, 100);
    this.saveDebounced();
    return user.needs;
  }

  nominateMayor(fid, slogan = '', policy = 'creator_stimulus') {
    const user = this.findUser(fid);
    if (!user) throw new Error('User not found');
    if (!CITY_POLICIES[policy]) throw new Error('Invalid city policy');
    const cleanSlogan = String(slogan || 'Building a better Simcaster!').trim().replace(/[<>]/g, '').slice(0, 90);
    if (!cleanSlogan) throw new Error('Enter a campaign slogan');
    this.state.election.candidates[String(fid)] = {
      fid: Number(fid),
      displayName: user.displayName,
      slogan: cleanSlogan,
      policy,
      updatedAt: Date.now()
    };
    this.state.election.votes[String(fid)] = Number(fid);
    this.recomputeMayorPolicy();
    this.recordQuestProgress(fid, 'civic_life', 1);
    this.save();
    return this.cityStatus();
  }

  voteMayor(voterFid, candidateFid) {
    const voter = this.findUser(voterFid);
    if (!voter) throw new Error('User not found');
    const candidate = this.state.election.candidates[String(candidateFid)];
    if (!candidate) throw new Error('Candidate not found on the ballot');
    this.state.election.votes[String(voterFid)] = Number(candidateFid);
    this.recomputeMayorPolicy();
    this.recordQuestProgress(voterFid, 'civic_life', 1);
    this.save();
    return this.cityStatus();
  }

  recomputeMayorPolicy() {
    const tally = {};
    for (const targetFid of Object.values(this.state.election.votes || {})) {
      const key = String(targetFid);
      if (this.state.election.candidates[key]) {
        tally[key] = (tally[key] || 0) + 1;
      }
    }
    let topCandidate = null;
    let topVotes = -1;
    for (const c of Object.values(this.state.election.candidates || {})) {
      const v = tally[String(c.fid)] || 0;
      if (v > topVotes) {
        topVotes = v;
        topCandidate = c;
      }
    }
    if (topCandidate && CITY_POLICIES[topCandidate.policy]) {
      this.state.election.activePolicy = topCandidate.policy;
    }
  }

  cityStatus() {
    const tally = {};
    for (const targetFid of Object.values(this.state.election.votes || {})) {
      const key = String(targetFid);
      if (this.state.election.candidates[key]) {
        tally[key] = (tally[key] || 0) + 1;
      }
    }
    const candidates = Object.values(this.state.election.candidates || {})
      .map((c) => ({ ...c, votes: tally[String(c.fid)] || 0 }))
      .sort((a, b) => b.votes - a.votes);
    const mayor = candidates[0] || null;
    const activePolicy = mayor?.policy || this.state.election.activePolicy || 'creator_stimulus';
    return {
      mayor,
      activePolicy,
      policyDetails: CITY_POLICIES[activePolicy] || CITY_POLICIES.creator_stimulus,
      candidates
    };
  }

  signerFor(fid) {
    return this.state.signers[String(fid)] || null;
  }

  setSigner(fid, signerUuid) {
    if (signerUuid === null) delete this.state.signers[String(fid)];
    else this.state.signers[String(fid)] = signerUuid;
    this.save();
  }

  createCast(fid, { text, channel = null, parent = null, quote = null, externalHash = null } = {}) {
    const content = typeof text === 'string' ? text.trim() : '';
    if (!content || content.length > 320) {
      throw new Error('Cast text must be 1–320 characters');
    }
    let normalizedChannel = null;
    if (typeof channel === 'string') {
      const clean = channel.trim().replace(/^\/+/, '').toLowerCase();
      if (clean.length > 0) {
        normalizedChannel = clean.slice(0, 32);
      }
    } else if (channel && typeof channel === 'object') {
      const raw = channel.id || channel.channel_id || channel.channel || '';
      if (typeof raw === 'string') {
        const clean = raw.trim().replace(/^\/+/, '').toLowerCase();
        if (clean.length > 0) {
          normalizedChannel = clean.slice(0, 32);
        }
      }
    }
    const user = this.findUser(fid);
    const hash =
      typeof externalHash === 'string' && /^0x[0-9a-fA-F]{40}$/.test(externalHash)
        ? externalHash
        : '0x' + crypto.randomBytes(20).toString('hex');
    const quoteCast =
      quote && typeof quote === 'object' && typeof quote.hash === 'string'
        ? {
            hash: String(quote.hash).slice(0, 66),
            fid: Number(quote.fid || quote.author?.fid || 0),
            displayName: String(quote.displayName || quote.author?.display_name || 'Caster').slice(0, 64),
            username: String(quote.username || quote.author?.username || 'farcaster').slice(0, 64),
            text: String(quote.text || '').slice(0, 320)
          }
        : null;
    const cast = {
      hash,
      parent_hash: parent ? String(parent) : null,
      channel: normalizedChannel,
      author: {
        fid: Number(fid),
        display_name: user?.displayName || 'Simcaster User',
        username: user?.username || `fid-${fid}`,
        pfp_url: user?.avatarUrl || ''
      },
      text: content,
      timestamp: new Date().toISOString(),
      embeds: quoteCast
        ? [
            {
              cast_id: { fid: quoteCast.fid, hash: quoteCast.hash },
              cast: {
                hash: quoteCast.hash,
                author: {
                  fid: quoteCast.fid,
                  display_name: quoteCast.displayName,
                  username: quoteCast.username
                },
                text: quoteCast.text
              }
            }
          ]
        : [],
      quote_cast: quoteCast,
      reactions: { likes_count: 0, recasts_count: 0 },
      replies: { count: 0 }
    };
    this.state.casts ||= [];
    this.state.casts = [cast, ...this.state.casts.filter((c) => c.hash !== hash)].slice(0, 250);
    if (user) {
      this.ensureLifeState(user);
      user.needs.clout = clamp(user.needs.clout + 2, 0, 100);
      user.needs.vibe = clamp(user.needs.vibe + 3, 0, 100);
    }
    this.save();
    return this.decorateCast(cast, fid);
  }

  toggleReaction(fid, hash, type, remove = false) {
    if (!hash || typeof hash !== 'string' || !['like', 'recast'].includes(type)) {
      throw new Error('Invalid reaction');
    }
    this.state.reactions ||= {};
    const bucket = this.state.reactions[hash] || { likes: [], recasts: [] };
    const key = type === 'like' ? 'likes' : 'recasts';
    const set = new Set((bucket[key] || []).map(Number));
    if (remove) set.delete(Number(fid));
    else set.add(Number(fid));
    bucket[key] = [...set];
    this.state.reactions[hash] = bucket;
    const user = this.findUser(fid);
    if (user && !remove) {
      this.ensureLifeState(user);
      user.needs.vibe = clamp(user.needs.vibe + 1, 0, 100);
    }
    this.save();
    return {
      ok: true,
      hash,
      type,
      removed: !!remove,
      likesCount: bucket.likes.length,
      recastsCount: bucket.recasts.length
    };
  }

  decorateCast(cast, viewerFid = null) {
    if (!cast || typeof cast !== 'object') return cast;
    const bucket = (this.state.reactions || {})[cast.hash] || { likes: [], recasts: [] };
    const localLikes = Array.isArray(bucket.likes) ? bucket.likes : [];
    const localRecasts = Array.isArray(bucket.recasts) ? bucket.recasts : [];
    const localReplies = (this.state.casts || []).filter((c) => c.parent_hash === cast.hash);
    const viewer = Number(viewerFid);
    const upstreamLiked = !!cast.viewer_context?.liked;
    const upstreamRecasted = !!cast.viewer_context?.recasted;
    const localLiked = Number.isFinite(viewer) && localLikes.includes(viewer);
    const localRecasted = Number.isFinite(viewer) && localRecasts.includes(viewer);
    let quoteCast = cast.quote_cast || null;
    if (!quoteCast && Array.isArray(cast.embeds)) {
      const embedWithCast = cast.embeds.find((e) => e?.cast || e?.cast_id);
      if (embedWithCast?.cast) {
        quoteCast = {
          hash: embedWithCast.cast.hash || embedWithCast.cast_id?.hash || '',
          fid: embedWithCast.cast.author?.fid || embedWithCast.cast_id?.fid || 0,
          displayName: embedWithCast.cast.author?.display_name || embedWithCast.cast.author?.username || 'Caster',
          username: embedWithCast.cast.author?.username || 'farcaster',
          text: embedWithCast.cast.text || ''
        };
      }
    }
    return {
      ...cast,
      quote_cast: quoteCast,
      reactions: {
        likes_count: (cast.reactions?.likes_count || 0) + localLikes.length,
        recasts_count: (cast.reactions?.recasts_count || 0) + localRecasts.length
      },
      replies: {
        count: (cast.replies?.count || 0) + localReplies.length
      },
      viewer_context: {
        ...(cast.viewer_context || {}),
        liked: upstreamLiked || localLiked,
        recasted: upstreamRecasted || localRecasted
      }
    };
  }

  decorateCasts(upstreamCasts = [], viewerFid = null, channelFilter = null) {
    let target = null;
    if (typeof channelFilter === 'string') {
      target = channelFilter.trim().replace(/^\/+/, '').toLowerCase();
    } else if (channelFilter && typeof channelFilter === 'object' && typeof channelFilter.channel === 'string') {
      target = channelFilter.channel.trim().replace(/^\/+/, '').toLowerCase();
    }
    if (target === 'all' || target === 'global') target = null;

    let topLevelLocal = (this.state.casts || []).filter((c) => !c.parent_hash);
    if (target) {
      topLevelLocal = topLevelLocal.filter((c) => {
        if (!c.channel) {
          return target === 'farcaster';
        }
        const cChan = typeof c.channel === 'string' ? c.channel : c.channel?.id;
        return cChan && cChan.toLowerCase() === target;
      });
    }

    const seen = new Set();
    const combined = [];
    const upstreamFiltered = Array.isArray(upstreamCasts)
      ? (target
          ? upstreamCasts.filter((c) => {
              const cChan = c.channel?.id || c.channel_id || (typeof c.channel === 'string' ? c.channel : null);
              if (!cChan) return target === 'farcaster';
              return cChan.toLowerCase() === target;
            })
          : upstreamCasts)
      : [];

    for (const c of [...topLevelLocal, ...upstreamFiltered]) {
      if (!c || !c.hash || seen.has(c.hash)) continue;
      seen.add(c.hash);
      combined.push(this.decorateCast(c, viewerFid));
    }
    return combined;
  }

  conversationFor(hash, upstreamConversation = null, viewerFid = null) {
    const rootCast =
      upstreamConversation?.cast ||
      (this.state.casts || []).find((c) => c.hash === hash) || {
        hash,
        text: '',
        author: { fid: 0, display_name: 'Farcaster Thread', username: 'farcaster' },
        direct_replies: []
      };
    const upstreamReplies = Array.isArray(upstreamConversation?.cast?.direct_replies)
      ? upstreamConversation.cast.direct_replies
      : Array.isArray(upstreamConversation?.direct_replies)
        ? upstreamConversation.direct_replies
        : [];
    const localReplies = (this.state.casts || []).filter((c) => c.parent_hash === hash);
    const seen = new Set();
    const mergedReplies = [];
    for (const r of [...upstreamReplies, ...localReplies]) {
      if (!r || !r.hash || seen.has(r.hash)) continue;
      seen.add(r.hash);
      mergedReplies.push(this.decorateCast(r, viewerFid));
    }
    mergedReplies.sort((a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime());
    return {
      cast: {
        ...this.decorateCast(rootCast, viewerFid),
        direct_replies: mergedReplies
      },
      direct_replies: mergedReplies
    };
  }

  startSession(fid) {
    const token = crypto.randomBytes(32).toString('base64url');
    const digest = crypto.createHash('sha256').update(token).digest('hex');
    this.state.sessions[digest] = { fid, expires: Date.now() + 7 * 864e5 };
    this.save();
    return token;
  }

  verifySession(token) {
    if (!token || typeof token !== 'string') return null;
    const digest = crypto.createHash('sha256').update(token).digest('hex');
    const session = this.state.sessions[digest];
    if (!session || session.expires < Date.now()) return null;
    return this.findUser(session.fid);
  }

  revokeSession(token) {
    if (!token) return;
    const digest = crypto.createHash('sha256').update(token).digest('hex');
    delete this.state.sessions[digest];
    this.save();
  }

  recordWin(fid) {
    const key = String(fid);
    this.state.scores[key] = (this.state.scores[key] || 0) + 1;
    const user = this.findUser(fid);
    if (user) {
      const mult = this.cityStatus().activePolicy === 'arcade_fever' ? 2 : 1;
      const prize = 150 * mult;
      user.creds += prize;
      user.currencies.creds = user.creds;
      user.currencies.degen = (user.currencies.degen || 0) + prize;
      user.xp += 35 * mult;
      user.career = careerForXp(user.xp).id;
      user.needs.clout = clamp(user.needs.clout + 15 * mult, 0, 100);
      user.needs.vibe = clamp(user.needs.vibe + 25, 0, 100);
    }
    this.save();
  }

  recordArcadeReward(fid, game = 'arcade', rawReward = 50) {
    const user = this.findUser(fid);
    if (!user) throw new Error('User not found');
    const mult = this.cityStatus().activePolicy === 'arcade_fever' ? 2 : 1;
    const base = clamp(Math.round(Number(rawReward) || 50), 15, 260);
    const reward = Math.round(base * mult);
    user.creds += reward;
    user.currencies.creds = user.creds;
    user.currencies.degen = (user.currencies.degen || 0) + reward;
    user.xp += 20;
    const nextTier = careerForXp(user.xp);
    const promoted = nextTier.id !== user.career ? nextTier.title : null;
    user.career = nextTier.id;
    user.needs.vibe = clamp(user.needs.vibe + 18, 0, 100);
    user.needs.clout = clamp(user.needs.clout + 10, 0, 100);
    if (base >= 50) {
      const key = String(fid);
      this.state.scores[key] = (this.state.scores[key] || 0) + 1;
    }
    this.recordQuestProgress(fid, 'arena_tags', 1);
    this.save();
    return {
      user,
      game: String(game || 'arcade').slice(0, 32),
      reward,
      promoted
    };
  }

  leaderboard() {
    return Object.entries(this.state.scores)
      .map(([fid, wins]) => ({
        fid: Number(fid),
        wins,
        displayName: this.findUser(fid)?.displayName || 'Player',
        clout: this.findUser(fid)?.needs?.clout || 10,
        career: this.findUser(fid)?.career || 'newcomer'
      }))
      .sort((a, b) => b.wins - a.wins)
      .slice(0, 10);
  }

  friendshipKey(a, b) {
    return [Number(a), Number(b)].sort((x, y) => x - y).join(':');
  }

  requestFriend(from, to) {
    const a = Number(from);
    const b = Number(to);
    if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || a < 1 || b < 1 || a === b) {
      throw new Error('Invalid friend request');
    }
    if (!this.findUser(b)) throw new Error('This player has not joined Simcaster');
    if (this.isBlocked(a, b)) throw new Error('This player is blocked');
    const key = this.friendshipKey(a, b);
    const previous = this.state.friends[key];
    if (previous?.status === 'accepted') throw new Error('Already friends');
    if (previous?.status === 'pending') {
      throw new Error(previous.from === a ? 'Request already sent' : 'You have an incoming request — accept it on Friends');
    }
    this.state.friends[key] = { a: Math.min(a, b), b: Math.max(a, b), from: a, status: 'pending', createdAt: Date.now() };
    this.save();
  }

  acceptFriend(recipient, from) {
    const a = Number(recipient);
    const b = Number(from);
    const key = this.friendshipKey(a, b);
    const entry = this.state.friends[key];
    if (!entry || entry.status !== 'pending' || entry.from !== b) throw new Error('Incoming friend request not found');
    if (this.isBlocked(a, b)) throw new Error('This player is blocked');
    entry.status = 'accepted';
    entry.acceptedAt = Date.now();
    this.save();
  }

  areFriends(a, b) {
    const friendship = this.state.friends[this.friendshipKey(a, b)];
    return !!friendship && friendship.status === 'accepted' && !this.isBlocked(a, b);
  }

  canVisitHome(guest, owner) {
    return Number(guest) === Number(owner) || this.areFriends(guest, owner);
  }

  removeFriend(a, b) {
    const key = this.friendshipKey(a, b);
    if (this.state.friends[key]) {
      delete this.state.friends[key];
      this.save();
    }
  }

  friendsFor(fid) {
    const id = Number(fid);
    return Object.values(this.state.friends)
      .filter((x) => x.a === id || x.b === id)
      .map((x) => {
        const other = x.a === id ? x.b : x.a;
        const account = this.findUser(other);
        return {
          fid: other,
          displayName: account?.displayName || 'Player',
          username: account?.username || '',
          avatar: account?.avatar || null,
          homeTier: account?.homeTier || 'studio',
          status: x.status === 'accepted' ? 'friends' : x.from === id ? 'sent' : 'incoming',
          since: x.createdAt
        };
      });
  }

  block(fid, other) {
    if (Number(fid) === Number(other)) throw new Error('Cannot block yourself');
    const key = String(fid);
    const list = new Set(this.state.blocked[key] || []);
    list.add(Number(other));
    this.state.blocked[key] = [...list];
    delete this.state.friends[this.friendshipKey(fid, other)];
    this.save();
  }

  report(reporter, subject, reason) {
    const valid = ['harassment', 'spam', 'cheating'];
    if (!Number.isSafeInteger(subject) || subject < 1 || subject === Number(reporter) || !valid.includes(reason)) {
      throw new Error('Invalid report');
    }
    this.state.reports ||= [];
    const now = Date.now();
    if (this.state.reports.some((r) => r.reporter === Number(reporter) && r.subject === subject && now - r.createdAt < 60000)) {
      throw new Error('You recently reported this player');
    }
    this.state.reports.push({ id: crypto.randomUUID(), reporter: Number(reporter), subject, reason, createdAt: now, status: 'pending' });
    this.save();
  }

  isBlocked(a, b) {
    return (this.state.blocked[String(a)] || []).includes(Number(b)) || (this.state.blocked[String(b)] || []).includes(Number(a));
  }
}

