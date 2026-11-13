// Wire types shared by the Worker, the Room Durable Object and the client.
import type { AvatarLook } from './catalog';
import type { ActionId, HomeItem, NeedKey, Vec2 } from './world';

export interface Me {
  fid: number;
  username: string;
  displayName: string;
  pfpUrl: string | null;
  demo: boolean;
  look: AvatarLook;
  degen: number;
  xp: number;
  needs: Record<NeedKey, number>;
}

export interface PlayerState {
  id: string;
  fid: number;
  name: string;
  pfp: string | null;
  look: AvatarLook;
  path: Vec2[]; // current or last walked path; a single point when standing
  t0: number; // server ms when the path started
  act: { target: string; action: ActionId; until: number; face: number; at: Vec2 } | null;
}

export type ClientMsg =
  | { t: 'move'; path: Vec2[] }
  | { t: 'chat'; text: string }
  | { t: 'emote'; name: EmoteName }
  | { t: 'whisper'; to: string; text: string }
  | { t: 'act'; target: string; action: ActionId }
  | { t: 'done' }
  | { t: 'ping'; c: number };

export type ServerMsg =
  | { t: 'hello'; you: string; now: number; room: string; players: PlayerState[]; home?: { owner: number; ownerName: string; items: HomeItem[]; canEdit: boolean } }
  | { t: 'join'; p: PlayerState }
  | { t: 'leave'; id: string }
  | { t: 'move'; id: string; path: Vec2[]; t0: number }
  | { t: 'snap'; id: string; x: number; z: number; t0: number }
  | { t: 'chat'; id: string; name: string; text: string }
  | { t: 'emote'; id: string; name: EmoteName }
  | { t: 'whisper'; from: string; to: string; fromName: string; toName: string; text: string }
  | { t: 'act'; id: string; act: PlayerState['act'] }
  | { t: 'me'; me: Me; note?: string }
  | { t: 'home'; items: HomeItem[] }
  | { t: 'pong'; c: number; now: number }
  | { t: 'err'; msg: string };

export const EMOTES = ['wave', 'cheer', 'dance'] as const;
export type EmoteName = (typeof EMOTES)[number];

export interface Cast {
  hash: string;
  text: string;
  timestamp: string;
  author: { fid: number; username: string; displayName: string; pfpUrl: string | null };
  likes: number;
  recasts: number;
  replies: number;
  channel: string | null;
  image: string | null;
}

export const GAMES = {
  stacker: { name: 'Tower Stacker', blurb: 'Drop each block on the one below. Miss and it is over.', maxScore: 30, minMsPerPoint: 450, degenPerPoint: 4 },
  catcher: { name: 'Hat Catcher', blurb: 'Catch hats, dodge rugs. Three lives.', maxScore: 80, minMsPerPoint: 250, degenPerPoint: 1.5 },
  memory: { name: 'Channel Match', blurb: 'Find every pair in as few flips as you can.', maxScore: 100, minMsPerPoint: 80, degenPerPoint: 1 },
} as const;
export type GameId = keyof typeof GAMES;
export const GAME_DAILY_CAP = 300;

export function gameReward(game: GameId, score: number): number {
  const g = GAMES[game];
  return Math.max(0, Math.round(Math.min(score, g.maxScore) * g.degenPerPoint));
}

// Channels are places in town. Per the Farcaster docs a cast belongs to a channel when its
// parentUrl is the channel's FIP-2 URL.
export const channelUrl = (id: string) => `https://farcaster.xyz/~/channel/${id}`;
export interface ChannelBoard { id: string; label: string; color: string; x: number; z: number; rot: number }
export const CHANNEL_BOARDS: ChannelBoard[] = [
  { id: 'farcaster', label: '/farcaster', color: '#8465cb', x: -9.5, z: -9.5, rot: Math.PI / 4 },
  { id: 'dev', label: '/dev', color: '#3b9eff', x: 9.5, z: -9.5, rot: -Math.PI / 4 },
  { id: 'memes', label: '/memes', color: '#ff6b9a', x: -9.5, z: 9.5, rot: (3 * Math.PI) / 4 },
  { id: 'base', label: '/base', color: '#2f6bff', x: 9.5, z: 9.5, rot: (-3 * Math.PI) / 4 },
];
