import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const defaultState = () => ({ accounts: {}, sessions: {}, scores: {}, blocked: {}, homes: {}, reports: [] });
const palettes = ['violet', 'citrus', 'coral', 'mint', 'sky'];
const outfits = ['street', 'casual', 'sport', 'formal'];
const hairStyles = ['short', 'curls', 'buzz', 'long'];
const furniture = ['sofa', 'table', 'plant', 'lamp', 'rug', 'chair'];

export function validateAvatar(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid avatar');
  const { color, outfit, hair } = input;
  if (!palettes.includes(color) || !outfits.includes(outfit) || !hairStyles.includes(hair)) throw new Error('Unsupported avatar option');
  return { color, outfit, hair };
}

export function validateHome(input) {
  if (!input || !Array.isArray(input.items) || input.items.length > 15) throw new Error('Invalid home layout');
  return { items: input.items.map((item) => {
    if (!item || !furniture.includes(item.type) || !Number.isInteger(item.x) || !Number.isInteger(item.z) ||
        item.x < -4 || item.x > 4 || item.z < -4 || item.z > 4) throw new Error('Invalid furniture placement');
    return { type: item.type, x: item.x, z: item.z };
  }) };
}

export class Store {
  constructor(filename) {
    this.filename = filename;
    this.state = defaultState();
    if (fs.existsSync(filename)) {
      const parsed = JSON.parse(fs.readFileSync(filename, 'utf8'));
      this.state = { ...this.state, ...parsed };
    }
    this.flushTimer = null;
  }
  save() {
    // Serial synchronous atomic rename is safe for one Node process, NOT multiple replicas.
    const directory = path.dirname(this.filename);
    fs.mkdirSync(directory, { recursive: true });
    const temporary = this.filename + '.' + process.pid + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(this.state));
    fs.renameSync(temporary, this.filename);
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
        createdAt: now
      };
    }
    const a = this.state.accounts[key];
    if (typeof profile.username === 'string' && profile.username) a.username = profile.username.slice(0, 32);
    if (typeof profile.displayName === 'string' && profile.displayName) a.displayName = profile.displayName.slice(0, 64);
    if (typeof profile.avatarUrl === 'string' && profile.avatarUrl.startsWith('https://')) a.avatarUrl = profile.avatarUrl.slice(0, 500);
    this.save();
    return a;
  }
  findUser(fid) { return this.state.accounts[String(fid)] || null; }
  updateAvatar(fid, input) {
    const user = this.findUser(fid);
    if (!user) throw new Error('User not found');
    user.avatar = validateAvatar(input);
    this.save();
    return user.avatar;
  }
  homeFor(fid) {
    const key = String(fid);
    if (!this.state.homes[key]) {
      this.state.homes[key] = { items: [{ type: 'sofa', x: 0, z: 1 }, { type: 'plant', x: -3, z: -2 }] };
      this.save();
    }
    return this.state.homes[key];
  }
  updateHome(fid, input) {
    const home = validateHome(input);
    this.state.homes[String(fid)] = home;
    this.save();
    return home;
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
    this.save();
  }
  leaderboard() {
    return Object.entries(this.state.scores).map(([fid, wins]) => ({
      fid: Number(fid), wins, displayName: this.findUser(fid)?.displayName || 'Player'
    })).sort((a, b) => b.wins - a.wins).slice(0,10);
  }
  block(fid, other) {
    if (Number(fid) === Number(other)) throw new Error('Cannot block yourself');
    const key = String(fid);
    const list = new Set(this.state.blocked[key] || []);
    list.add(Number(other));
    this.state.blocked[key] = [...list];
    this.save();
  }
  report(reporter, subject, reason) {
    const valid=['harassment','spam','cheating'];
    if (!Number.isSafeInteger(subject) || subject<1 || subject===Number(reporter) || !valid.includes(reason)) throw new Error('Invalid report');
    this.state.reports ||= [];
    const now=Date.now();
    if(this.state.reports.some(r=>r.reporter===Number(reporter)&&r.subject===subject&&now-r.createdAt<60000)) throw new Error('You recently reported this player');
    this.state.reports.push({id:crypto.randomUUID(),reporter:Number(reporter),subject,reason,createdAt:now,status:'pending'});
    this.save();
  }
  isBlocked(a,b) {
    return (this.state.blocked[String(a)] || []).includes(Number(b)) ||
           (this.state.blocked[String(b)] || []).includes(Number(a));
  }
}
