import { useEffect, useMemo, useState } from 'react';
import { CATALOG, CATALOG_LIST, MAX_HOME_ITEMS, SELL_BACK, placementError } from '../../../shared/catalog';
import type { Me } from '../../../shared/protocol';
import type { HomeItem } from '../../../shared/world';
import { api } from '../net';
import { useStore } from '../store';

const CATEGORIES = ['Seating', 'Beds', 'Tables', 'Kitchen', 'Storage', 'Decor', 'Rugs'] as const;

/** Same pricing rule as the server: new pieces are bought, removed pieces sell back at half. */
function draftCost(saved: HomeItem[], draft: HomeItem[]): number {
  const prev = new Map(saved.map((i) => [i.id, i]));
  let cost = 0;
  for (const item of draft) {
    const old = prev.get(item.id);
    if (old && old.model === item.model) prev.delete(item.id);
    else cost += CATALOG[item.model].price;
  }
  for (const gone of prev.values()) cost -= Math.round((CATALOG[gone.model]?.price || 0) * SELL_BACK);
  return cost;
}

export default function BuildPanel() {
  const build = useStore((s) => s.build)!;
  const home = useStore((s) => s.home);
  const me = useStore((s) => s.me)!;
  const set = useStore((s) => s.set);
  const notify = useStore((s) => s.notify);
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>('Seating');
  const [saving, setSaving] = useState(false);
  const saved = home?.items || [];
  const cost = useMemo(() => draftCost(saved, build.draft), [saved, build.draft]);
  const selected = build.draft.find((i) => i.id === build.selected) || null;

  const rotate = () => {
    const b = useStore.getState().build;
    if (!b) return;
    if (b.placing) return set({ build: { ...b, placing: { ...b.placing, rot: ((b.placing.rot + 1) & 3) as HomeItem['rot'] } } });
    const item = b.draft.find((i) => i.id === b.selected);
    if (!item) return;
    const turned = { ...item, rot: ((item.rot + 1) & 3) as HomeItem['rot'] };
    const err = placementError(turned, b.draft);
    if (err) return notify(err);
    set({ build: { ...b, draft: b.draft.map((i) => (i.id === item.id ? turned : i)) } });
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'r' || e.key === 'R') rotate();
      if (e.key === 'Escape') {
        const b = useStore.getState().build;
        if (b?.placing) set({ build: { ...b, placing: null } });
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  function pick(model: string) {
    if (build.draft.length >= MAX_HOME_ITEMS) return notify(`A home holds at most ${MAX_HOME_ITEMS} items`);
    const id = 'i' + Math.random().toString(36).slice(2, 9);
    set({ build: { ...build, selected: null, placing: { id, model, x: 0, z: 0, rot: 0 } } });
  }

  async function save() {
    setSaving(true);
    try {
      const r = await api<{ items: HomeItem[]; me: Me }>('/home', { method: 'PUT', body: JSON.stringify({ items: build.draft }) });
      set({ me: r.me, build: null, home: home ? { ...home, items: r.items } : home });
      notify('Home saved');
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="build">
      <div className="build-bar">
        <b>Build mode</b>
        <span className={cost > me.degen ? 'bad' : ''}>
          {cost === 0 ? 'No charge' : cost > 0 ? `Cost 🎩 ${cost}` : `Refund 🎩 ${-cost}`} · you have 🎩 {me.degen}
        </span>
        <span className="grow" />
        {(selected || build.placing) && <button className="btn" onClick={rotate}>⟳ Rotate (R)</button>}
        {selected && <button className="btn" onClick={() => set({ build: { ...build, placing: selected, selected: null } })}>✥ Move</button>}
        {selected && (
          <button className="btn" onClick={() => set({ build: { ...build, draft: build.draft.filter((i) => i.id !== selected.id), selected: null } })}>
            Sell (+{Math.round(CATALOG[selected.model].price * SELL_BACK)})
          </button>
        )}
        <button className="btn ghost" onClick={() => set({ build: null })}>Cancel</button>
        <button className="btn primary" disabled={saving || cost > me.degen} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
      <div className="chips">
        {CATEGORIES.map((c) => <button key={c} className={'chip' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>{c}</button>)}
        <small>{build.placing ? 'Click the floor to place. Esc to drop it.' : 'Pick an item, or click furniture to move, rotate or sell it.'}</small>
      </div>
      <div className="catalog">
        {CATALOG_LIST.filter((e) => e.category === cat).map((e) => (
          <button key={e.key} className={build.placing?.model === e.key ? 'on' : ''} onClick={() => pick(e.key)}>
            <b>{e.name}</b>
            <small>🎩 {e.price}{e.actions ? ' · usable' : ''}{e.wall ? ' · wall' : ''}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
