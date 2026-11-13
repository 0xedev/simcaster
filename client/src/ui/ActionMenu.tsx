import { useEffect } from 'react';
import { useStore } from '../store';

/** Sims-style action list that opens where you clicked. */
export default function ActionMenu() {
  const menu = useStore((s) => s.menu);
  const set = useStore((s) => s.set);
  useEffect(() => {
    if (!menu) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && set({ menu: null });
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [menu, set]);
  if (!menu) return null;
  const x = Math.min(window.innerWidth - 270, Math.max(10, menu.x - 20));
  const y = Math.min(window.innerHeight - 70 - menu.options.length * 54, Math.max(10, menu.y - 10));
  return (
    <>
      <div className="menu-scrim" onPointerDown={() => set({ menu: null })} />
      <div className="menu" style={{ left: x, top: y }} role="menu">
        <header>
          <b>{menu.title}</b>
          {menu.subtitle && <small>{menu.subtitle}</small>}
        </header>
        {menu.options.map((o) => (
          <button key={o.label} role="menuitem" disabled={o.disabled}
            onClick={() => { set({ menu: null }); o.run(); }}>
            <span>{o.label}</span>
            {o.hint && <small>{o.hint}</small>}
          </button>
        ))}
      </div>
    </>
  );
}
