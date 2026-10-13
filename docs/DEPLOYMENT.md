# Deploying Simcaster — browser web game

Simcaster runs as a website. Its interactive world requires the persistent Node HTTP and WebSocket process to be hosted on the same origin as the bundled browser assets.

## Quick start on a WebSocket-capable container host

Build the supplied Dockerfile using a platform supporting long-lived HTTP Upgrade / WebSocket connections. Set APP_ORIGIN to the exact public HTTPS URL. The container uses PORT 3001 and serves the built Vite frontend and /api and /socket endpoints together.

Production settings: NODE_ENV=production, SIMCASTER_DEMO_MODE=false, APP_ORIGIN=https://your-real-host.example, PORT=3001, OPTIMISM_RPC_URL to a reliable Optimism RPC, and NEYNAR_API_KEY for Farcaster feeds.

Do not expose the real-time service on static-only Vercel functions. The Vercel Git integration confirms the frontend builds but it does not provide the long-lived Node WebSocket process.

## Data persistence and access

DATA_FILE defaults to /data/simcaster.json for this Docker image. Mount a persistent volume at /data to retain prototype sessions, homes, friendships and wins on restart, and run one replica only. The current JSON store is a single-process prototype, not suitable for a publicly launched service. Migrate runtime storage to PostgreSQL, using the proposed infra/postgres/001_init.sql as a starting point, before scale or public rollout.

Browser OAuth/sign-in: the production Farcaster domain must match APP_ORIGIN. Sign In with Farcaster backend validation needs an Optimism RPC. Publishing remains an external composer action until per-user signer authorization is implemented.

## Launch checks

1. In a real browser verify HTTPS loading and /api/health (200).
2. Verify secure Farcaster sign in from the configured origin, without demo mode.
3. From two browser profiles validate WSS multiplayer movement, chat, emotes, and the arcade.
4. Confirm pending friendship cannot grant home access; accepted friendship permits a visit; blocking revokes access.
5. Check frame rate, error monitoring, WebSocket restarts and content moderation processes.

The temporary Vercel Sandbox preview is an expiring private-demo environment and should not be treated as production. The app remains in a draft GitHub PR until the deployment and operational security requirements are met.
