# Simcaster

A Farcaster client you live in. Sims-style town: click to walk, click people and places for actions,
read casts where they happen, keep an apartment, earn and spend in-game DEGEN.

This is the ground-up rebuild (`rebuild/v2`). Nothing from the old Express/React build is reused.

## Stack

| Part | What |
| --- | --- |
| Client | Vite, React 19, three.js via @react-three/fiber, zustand |
| Server | Cloudflare Worker (`worker/index.ts`) |
| Realtime | One Durable Object per room (`worker/room.ts`), WebSocket hibernation, no tick loop |
| Data | D1 (`migrations/`) |
| Shared rules | `shared/` is imported by both sides: map, pathfinding, movement, catalog, protocol |
| Art | CC0 KayKit model kits, packed by `scripts/build-assets.mjs` (see `CREDITS.md`) |

## Run it

    npm install
    printf 'DEMO_MODE=true\n' > .dev.vars      # name-only sign-in for local play
    npm run db:local
    npm run preview                            # builds, then serves everything on http://localhost:8787

`npm run dev` runs Vite (5173, hot reload) next to the Worker (8787). `npm test` runs the rule tests,
`npm run typecheck` checks all three codebases.

## Deploy

    npx wrangler d1 create simcaster           # paste the id into wrangler.jsonc
    npm run db:remote
    npx wrangler secret put NEYNAR_API_KEY     # optional: live feeds and profiles
    npm run deploy

Leave `DEMO_MODE` as `"false"` in production. Sign in with Farcaster verifies against the request
host, so serve it from the domain users will see.

## How it works

- **Movement.** A click runs A* on the shared nav grid and the sim starts walking at once. The path
  goes to the room object, which validates it (start near the server's position, every segment
  walkable, bounded length) and relays it. Every client replays the same path from the same server
  timestamp, so there is no per-frame position traffic and nothing to rubber-band.
- **Authority.** DEGEN, XP and needs change only in `settle()` on the server. Activities are paid on
  completion, checked against the server clock and the sim's server-side position. Needs decay lazily
  from a timestamp.
- **Rendering.** All static scenery is merged into one mesh per material (the whole town is a single
  atlas material). Sims use a blob shadow; the shadow map is baked only when the scene changes.
  Transforms never pass through React state.
- **Farcaster.** Channels are places: each board in the plaza shows a channel (casts whose
  `parentUrl` is `https://farcaster.xyz/~/channel/<id>`), and recent authors stand beside it.
  Feeds come from Neynar through the Worker; without a key the feed is sample data and says so.

## Not built yet

- In-app posting, likes and recasts (needs a per-user signer). Casting opens Farcaster's composer.
- Farcaster direct messages. They are not part of the protocol; whispers are in-room only.
- Laser tag, friends lists, tipping between players, moderation tools, room sharding (one town, 48 sims).
- Characters are KayKit adventurers because that is the CC0 rig available; they share one skeleton,
  so swapping in modern outfits is an asset change, not a code change.
