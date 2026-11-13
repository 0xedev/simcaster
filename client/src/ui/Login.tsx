import { useEffect, useRef, useState } from 'react';
import type { Me } from '../../../shared/protocol';
import { api } from '../net';
import { useStore } from '../store';

export default function Login() {
  const config = useStore((s) => s.config);
  const set = useStore((s) => s.set);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<{ img: string; url: string } | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  async function farcaster() {
    setError('');
    setBusy(true);
    try {
      const [{ createAppClient, viemConnector }, QR] = await Promise.all([import('@farcaster/auth-client'), import('qrcode')]);
      const client = createAppClient({ relay: 'https://relay.farcaster.xyz', ethereum: viemConnector() });
      const { nonce } = await api<{ nonce: string }>('/auth/nonce', { method: 'POST' });
      const channel = await client.createChannel({ siweUri: location.origin + '/login', domain: location.host, nonce });
      if (channel.isError || !channel.data) throw new Error('Could not reach the Farcaster relay');
      setQr({ img: await QR.toDataURL(channel.data.url, { margin: 1, width: 260 }), url: channel.data.url });
      const status = await client.watchStatus({ channelToken: channel.data.channelToken, timeout: 300_000, interval: 1500 });
      if (!alive.current) return;
      const d = status.data;
      if (status.isError || !d || d.state !== 'completed' || !d.message || !d.signature) throw new Error('Sign-in was not completed');
      const r = await api<{ me: Me }>('/auth/siwf', {
        method: 'POST',
        body: JSON.stringify({ message: d.message, signature: d.signature, nonce, username: d.username, displayName: d.displayName, pfpUrl: d.pfpUrl }),
      });
      set({ me: r.me });
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) {
        setBusy(false);
        setQr(null);
      }
    }
  }

  async function demo(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const r = await api<{ me: Me }>('/auth/demo', { method: 'POST', body: JSON.stringify({ name }) });
      set({ me: r.me });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="login">
      <div className="login-card">
        <div className="logo"><span /><span /><i /></div>
        <h1>Simcaster</h1>
        <p className="lead">Farcaster, but you live in it. Walk the town, read casts where they happen, build a home.</p>
        {qr ? (
          <div className="qr">
            <img src={qr.img} alt="Sign in with Farcaster QR code" width={220} height={220} />
            <p>Scan with your phone, or</p>
            <a className="btn" href={qr.url}>Open Farcaster</a>
          </div>
        ) : (
          <button className="btn primary wide" onClick={farcaster} disabled={busy}>
            {busy ? 'Waiting for Farcaster…' : 'Sign in with Farcaster'}
          </button>
        )}
        {config?.demo && !qr && (
          <form onSubmit={demo} className="demo">
            <label htmlFor="demo-name">Or try it without an account</label>
            <div>
              <input id="demo-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" maxLength={24} />
              <button className="btn" disabled={name.trim().length < 2}>Enter</button>
            </div>
          </form>
        )}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
