import { Suspense, lazy, useEffect } from 'react';
import type { Me } from '../../shared/protocol';
import { api, connect, disconnect } from './net';
import { useStore } from './store';
import ActionMenu from './ui/ActionMenu';
import BuildPanel from './ui/BuildPanel';
import Hud from './ui/Hud';
import Login from './ui/Login';
import Phone from './ui/Phone';

const World = lazy(() => import('./three/World'));
const Arcade = lazy(() => import('./ui/Arcade'));

export default function App() {
  const { me, booted, room, arcade, phone, build, toast, set } = useStore();

  useEffect(() => {
    Promise.all([api('/config'), api<{ me: Me | null }>('/me')])
      .then(([config, r]) => set({ config, me: r.me, booted: true }))
      .catch(() => set({ booted: true, config: { demo: false, liveFeed: false } }));
  }, [set]);

  const signedIn = !!me;
  const roomKey = room.kind === 'town' ? 'town' : `home:${room.owner}`;
  useEffect(() => {
    if (!signedIn) return;
    connect(roomKey);
    return () => disconnect();
  }, [signedIn, roomKey]);

  if (!booted) return <div className="splash">Simcaster</div>;
  if (!me) return <Login />;
  return (
    <div className="app">
      <Suspense fallback={<div className="splash">Loading the neighbourhood…</div>}>
        <World />
      </Suspense>
      <Hud />
      <ActionMenu />
      {build && <BuildPanel />}
      {phone && <Phone />}
      {arcade && (
        <Suspense fallback={null}>
          <Arcade />
        </Suspense>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
