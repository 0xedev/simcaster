import { create } from 'zustand';
import type { Cast, Me, PlayerState } from '../../shared/protocol';
import type { ActionId, HomeItem, Vec2 } from '../../shared/world';

export interface ChatLine { id: number; kind: 'chat' | 'whisper' | 'note'; name?: string; text: string; mine?: boolean }
export interface MenuOption { label: string; hint?: string; disabled?: boolean; run: () => void }
export interface Menu { x: number; y: number; title: string; subtitle?: string; options: MenuOption[] }
export interface HomeInfo { owner: number; ownerName: string; items: HomeItem[]; canEdit: boolean }
export interface Pending { target: string; action: ActionId; at: Vec2 }
export type PhoneTab = 'feed' | 'people' | 'wallet' | 'look';

interface State {
  config: { demo: boolean; liveFeed: boolean } | null;
  me: Me | null;
  booted: boolean;
  room: { kind: 'town' } | { kind: 'home'; owner: number };
  conn: 'connecting' | 'open' | 'closed';
  connNote: string;
  selfId: string;
  players: Record<string, PlayerState>;
  home: HomeInfo | null;
  chat: ChatLine[];
  bubbles: Record<string, { text: string; until: number }>;
  emotes: Record<string, { name: string; until: number }>;
  menu: Menu | null;
  toast: string;
  phone: PhoneTab | null;
  feedChannel: string | null; // channel tab to open in the phone
  focusCast: Cast | null;
  arcade: boolean;
  build: { draft: HomeItem[]; placing: HomeItem | null; selected: string | null } | null;
  whisperTo: string | null;
  set: (patch: Partial<State>) => void;
  say: (line: Omit<ChatLine, 'id'>) => void;
  notify: (text: string) => void;
}

let lineId = 1;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<State>((set) => ({
  config: null,
  me: null,
  booted: false,
  room: { kind: 'town' },
  conn: 'connecting',
  connNote: '',
  selfId: '',
  players: {},
  home: null,
  chat: [],
  bubbles: {},
  emotes: {},
  menu: null,
  toast: '',
  phone: null,
  feedChannel: null,
  focusCast: null,
  arcade: false,
  build: null,
  whisperTo: null,
  set: (patch) => set(patch),
  say: (line) => set((s) => ({ chat: [...s.chat.slice(-60), { ...line, id: lineId++ }] })),
  notify: (text) => {
    clearTimeout(toastTimer);
    set({ toast: text });
    toastTimer = setTimeout(() => set({ toast: '' }), 3200);
  },
}));

export const store = useStore;
