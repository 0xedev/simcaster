import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { GAMES, gameReward, type GameId, type Me } from '../../../shared/protocol';
import { api } from '../net';
import { useStore } from '../store';

type Finish = (score: number) => void;

// ---------------------------------------------------------------- Tower Stacker
// Each block must overlap the one below. Only the overlap survives; no overlap ends the run.
function Stacker({ onFinish }: { onFinish: Finish }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef({ stack: [{ x: 110, w: 140 }], x: 0, dir: 1, speed: 190, over: false });
  const [score, setScore] = useState(0);
  useEffect(() => {
    const ctx = canvas.current!.getContext('2d')!;
    let raf = 0;
    let last = performance.now();
    const frame = (t: number) => {
      const g = game.current;
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const top = g.stack[g.stack.length - 1];
      if (!g.over) {
        g.x += g.dir * g.speed * dt;
        if (g.x < 0) { g.x = 0; g.dir = 1; }
        if (g.x + top.w > 360) { g.x = 360 - top.w; g.dir = -1; }
      }
      ctx.clearRect(0, 0, 360, 420);
      const scroll = Math.max(0, g.stack.length - 11) * 30;
      g.stack.forEach((b, i) => {
        ctx.fillStyle = `hsl(${258 + i * 9} 70% ${62 - (i % 2) * 6}%)`;
        ctx.fillRect(b.x, 390 - i * 30 + scroll, b.w, 28);
      });
      if (!g.over) {
        ctx.fillStyle = '#6fe3c1';
        ctx.fillRect(g.x, 390 - g.stack.length * 30 + scroll, top.w, 28);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  const drop = () => {
    const g = game.current;
    if (g.over) return;
    const top = g.stack[g.stack.length - 1];
    const left = Math.max(g.x, top.x), right = Math.min(g.x + top.w, top.x + top.w);
    if (right - left < 4) {
      g.over = true;
      return onFinish(g.stack.length - 1);
    }
    g.stack.push({ x: left, w: right - left });
    g.speed = Math.min(520, g.speed + 16);
    setScore(g.stack.length - 1);
    if (g.stack.length - 1 >= GAMES.stacker.maxScore) {
      g.over = true;
      onFinish(g.stack.length - 1);
    }
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.code === 'Space') { e.preventDefault(); drop(); } };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  return (
    <div className="game">
      <p>Floors: <b>{score}</b> · tap or press Space to drop</p>
      <canvas ref={canvas} width={360} height={420} onPointerDown={drop} />
    </div>
  );
}

// ---------------------------------------------------------------- Hat Catcher
function Catcher({ onFinish }: { onFinish: Finish }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useState({ score: 0, lives: 3 });
  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext('2d')!;
    const g = { x: 180, items: [] as { x: number; y: number; bad: boolean; v: number }[], score: 0, lives: 3, spawn: 0, t: 0, over: false };
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      g.x = Math.max(30, Math.min(330, ((e.clientX - r.left) / r.width) * 360));
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerdown', move);
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      g.t += dt;
      g.spawn -= dt;
      if (g.spawn <= 0) {
        g.spawn = Math.max(0.28, 0.85 - g.t * 0.012);
        g.items.push({ x: 24 + Math.random() * 312, y: -20, bad: Math.random() < 0.24, v: 150 + g.t * 5 + Math.random() * 60 });
      }
      for (const it of g.items) it.y += it.v * dt;
      g.items = g.items.filter((it) => {
        if (it.y > 372 && it.y < 404 && Math.abs(it.x - g.x) < 38) {
          if (it.bad) g.lives--; else g.score++;
          return false;
        }
        if (it.y > 440) {
          if (!it.bad) g.lives--; // a dropped hat costs a life too
          return false;
        }
        return true;
      });
      ctx.clearRect(0, 0, 360, 420);
      ctx.font = '28px serif';
      ctx.textAlign = 'center';
      for (const it of g.items) ctx.fillText(it.bad ? '🧨' : '🎩', it.x, it.y);
      ctx.fillStyle = '#8f6bff';
      ctx.beginPath();
      ctx.roundRect(g.x - 38, 388, 76, 16, 8);
      ctx.fill();
      setHud((h) => (h.score === g.score && h.lives === g.lives ? h : { score: g.score, lives: Math.max(0, g.lives) }));
      if (g.lives <= 0 || g.score >= GAMES.catcher.maxScore) {
        g.over = true;
        return onFinish(g.score);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerdown', move);
    };
  }, []);
  return (
    <div className="game">
      <p>Hats: <b>{hud.score}</b> · Lives: {'♥'.repeat(hud.lives) || '—'}</p>
      <canvas ref={canvas} width={360} height={420} style={{ touchAction: 'none' }} />
    </div>
  );
}

// ---------------------------------------------------------------- Channel Match
const FACES = ['🎩', '🟣', '⚡', '🔵', '🧑‍💻', '😹'];
function Memory({ onFinish }: { onFinish: Finish }) {
  const [deck] = useState(() => [...FACES, ...FACES].map((f, i) => ({ f, i, k: Math.random() })).sort((a, b) => a.k - b.k));
  const [open, setOpen] = useState<number[]>([]);
  const [found, setFound] = useState<string[]>([]);
  const [flips, setFlips] = useState(0);
  const lock = useRef(false);
  function flip(idx: number) {
    if (lock.current || open.includes(idx) || found.includes(deck[idx].f)) return;
    const next = [...open, idx];
    setOpen(next);
    setFlips((n) => n + 1);
    if (next.length < 2) return;
    lock.current = true;
    const match = deck[next[0]].f === deck[next[1]].f;
    setTimeout(() => {
      lock.current = false;
      setOpen([]);
      if (!match) return;
      const all = [...found, deck[next[0]].f];
      setFound(all);
      // 12 flips is perfect; every extra flip costs 5 points.
      if (all.length === FACES.length) onFinish(Math.max(10, 100 - Math.max(0, flips + 1 - 12) * 5));
    }, match ? 260 : 700);
  }
  return (
    <div className="game">
      <p>Flips: <b>{flips}</b> · pairs {found.length}/{FACES.length}</p>
      <div className="cards">
        {deck.map((c, idx) => {
          const up = open.includes(idx) || found.includes(c.f);
          return <button key={c.i} className={up ? 'up' : ''} onClick={() => flip(idx)} aria-label={up ? c.f : 'Hidden card'}>{up ? c.f : ''}</button>;
        })}
      </div>
    </div>
  );
}

const VIEWS: Record<GameId, (p: { onFinish: Finish }) => React.JSX.Element> = { stacker: Stacker, catcher: Catcher, memory: Memory };

export default function Arcade() {
  const set = useStore((s) => s.set);
  const [game, setGame] = useState<GameId | null>(null);
  const [run, setRun] = useState<string | null>(null);
  const [result, setResult] = useState<{ score: number; reward: number; capped: boolean } | null>(null);
  const [board, setBoard] = useState<{ name: string; score: number }[]>([]);
  const [error, setError] = useState('');

  async function start(id: GameId) {
    setError('');
    setResult(null);
    try {
      const r = await api<{ run: string }>('/games/start', { method: 'POST', body: JSON.stringify({ game: id }) });
      setRun(r.run);
      setGame(id);
      api<{ board: { name: string; score: number }[] }>(`/games/board?game=${id}`).then((b) => setBoard(b.board)).catch(() => {});
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function finish(score: number) {
    const id = run;
    setRun(null);
    try {
      const r = await api<{ score: number; reward: number; capped: boolean; me: Me }>('/games/finish', { method: 'POST', body: JSON.stringify({ run: id, score }) });
      set({ me: r.me });
      setResult(r);
      if (game) api<{ board: { name: string; score: number }[] }>(`/games/board?game=${game}`).then((b) => setBoard(b.board)).catch(() => {});
    } catch (e) {
      setError((e as Error).message);
      setResult({ score, reward: 0, capped: false });
    }
  }

  const View = game ? VIEWS[game] : null;
  return (
    <div className="overlay">
      <div className="arcade">
        <header>
          <h2>🕹️ Arcade</h2>
          <button className="close" aria-label="Close arcade" onClick={() => set({ arcade: false })}>✕</button>
        </header>
        {!game && (
          <div className="game-list">
            {(Object.keys(GAMES) as GameId[]).map((id) => (
              <button key={id} onClick={() => start(id)}>
                <b>{GAMES[id].name}</b>
                <span>{GAMES[id].blurb}</span>
                <small>Up to 🎩 {gameReward(id, GAMES[id].maxScore)}</small>
              </button>
            ))}
            <p className="fine">Rewards are worked out on the server from your score and capped at 🎩 300 a day.</p>
          </div>
        )}
        {game && View && (
          <div className="game-stage">
            {run && <View key={run} onFinish={finish} />}
            {result && (
              <div className="result">
                <h3>{result.score > 0 ? 'Nice run' : 'Game over'}</h3>
                <p>Score <b>{result.score}</b> · earned 🎩 <b>{result.reward}</b>{result.capped ? ' (daily cap reached)' : ''}</p>
                <button className="btn primary" onClick={() => start(game)}>Play again</button>
                <button className="btn" onClick={() => { setGame(null); setResult(null); }}>Other games</button>
              </div>
            )}
            <aside>
              <h4>{GAMES[game].name} · best scores</h4>
              {board.length ? board.map((b, i) => <p key={i}><span>#{i + 1} {b.name}</span><b>{b.score}</b></p>) : <p className="fine">No scores yet.</p>}
            </aside>
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
