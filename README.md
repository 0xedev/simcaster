# Simcaster ✳
## Platform requirement: web browser only

Simcaster is a **browser game and Farcaster web client**. The supported targets are Chromium, Firefox and Safari on desktop and laptop; smaller browser viewports are responsive. **No iOS/Android native application, React Native/Expo project, app-store packaging, installation requirement, or mobile SDK is in scope.**

The application is delivered via HTTPS in the browser, with WebGL2 rendering and WebSocket multiplayer. WASD/arrow keys move characters; drag the scene to orbit the camera; use the scroll wheel to zoom; Space fires in Laser Tag. The backend requires a long-lived Node host that supports WebSockets. A static host or serverless-only environment is insufficient for the full stack.


**The internet, but you live in it.** A Farcaster-connected social client with an explorable procedural 3D city, real-time player avatars, private apartments and a mini-game arcade.

**This is an early playable vertical slice**, not a production-ready client or a complete Sims-style life simulator.

## Local quick start (Node 22+)

    cp .env.example .env
    npm install
    npm run dev

Open http://localhost:5173. The Vite development server proxies HTTP and WebSocket connections to port 3001. Enable SIMCASTER_DEMO_MODE=true only for development. Open a second incognito window and use a different demo name to test multiplayer.

- World: WASD/arrow keys, drag to orbit, scroll wheel to zoom, multiplayer chat and player interaction emotes.
- Arcade: Laser Tag, 2–8 players per room; face your opponent, Space/FIRE to shoot; first to 7 scores wins.
- Apartment: add furniture and inspect your private home.
- Feed: actual Neynar following/trending casts only with NEYNAR_API_KEY. Fictional examples are clearly marked in demo mode.

    npm test
    npm run build
    npm start

For production-mode local serving, set APP_ORIGIN=http://localhost:3001 and PORT=3001. Set APP_ORIGIN to your precise HTTPS origin in deployment; the server enforces it during mutating HTTP requests and WebSocket upgrades.

## Farcaster

The Sign in with Farcaster flow uses an API-issued, one-time, 5-minute nonce, backend signature verification via @farcaster/auth-client and an httpOnly session cookie. Configure NEYNAR_API_KEY for profile lookup and live social feed, and OPTIMISM_RPC_URL with a reliable RPC. No API keys are embedded in the browser.

Casting/reactions/replies currently open the external Farcaster client. **SIWF login does not grant writing permission**, and a per-user approved signer flow is not implemented in this vertical slice. POST /api/casts intentionally returns 501.

When NODE_ENV=production, SIMCASTER_DEMO_MODE=true is explicitly rejected.

## Layout

- src/main.jsx: React app, sign-in, feed, dashboard, profile/home editors and arcade screens.
- src/WorldView.jsx: Three.js React Three Fiber scene and world/arena/home UI.
- src/styles.css: responsive visual system.
- server/index.js: Express API, SIWF auth, Neynar API proxy.
- server/world.js: WebSocket world authority, matchmaking per room, movement, chat and Laser Tag.
- server/storage.js: atomic single-process file-backed state.
- server/rules.js: input validation and authoritative game rules.
- tests/: node:test suite.
- docs/: API contracts, scope and release gates.

## Important production caveats

The current persistence is .data/simcaster.json (atomic file replacement). It is **single-process**, not suitable for horizontally scaled production use. Session revocation, game scores and home data need PostgreSQL plus backed-up migrations; room matchmaking needs a distributed coordinator such as Colyseus/Redis, and more advanced moderation. Incoming room chat has basic length/rate controls but no operational moderation dashboard. Homes support visits by accepted Simcaster friends (8 occupants per room). Shooter hit detection has no obstacle occlusion and is prototype quality. There is no installation flow or native application.

Read docs/MVP_SCOPE.md and docs/API.md before publicly deploying.

No copyrighted The Sims, Lagos Life or Claude-of-Duty game assets have been copied into this repository.

Multiplayer public rooms can be shared using the Invite button in the world UI. Player lists include Block and Report actions; reports are stored locally and require an operational moderation workflow before production.

## In-world friendships

Click another player avatar and choose **Add friend**. The recipient can accept or decline from the **Friends & requests** sidebar page. Friendships are stored only in Simcaster; they do not follow/unfollow Farcaster accounts. Blocking a player also removes any existing Simcaster friendship.

### Visiting apartments

Accepted friends can click **Visit home** on the Friends page. They join the homeowner's private WebSocket room, see the saved furniture layout, and interact with other visitors. The owner retains exclusive decoration permission. Requests from non-friends are rejected by the API and by the WebSocket handshake.

## Browser deployment

See [Deployment](docs/DEPLOYMENT.md) and the root Dockerfile for running the browser website and WebSocket backend on one long-lived Node host. A static-only Vercel deployment cannot provide real-time rooms or authentication. The temporary sandbox preview is not permanent hosting.
