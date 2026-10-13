# Simcaster MVP scope and release gates

## In this branch
- Server-verified SIWF and short-lived nonce; httpOnly cookie sessions; local demo mode
- Neynar trending/following feed proxy, external composer and cast opening
- Three.js Plaza, bounded authoritative movement, multiplayer chat and emotes
- Editable private apartment with persisted furniture
- Laser Tag match rooms with server authoritative health and score, local leaderboard
- Responsive desktop/mobile layout and tests

## Blocking issues before an open production beta
1. Data: migrate JSON persistence to PostgreSQL using transactions, audit logs and proper session lifecycle; add backups.
2. Farcaster: implement individual Neynar signer approval/revoke lifecycle, encrypted signer secrets, idempotent cast writes, reactions, follows and replies.
3. Safety: reports, moderation queue, sanctions, abuse/rate limits, room chat reporting, content safety and player privacy.
4. Multiplayer: reconnection/recovery, reliable match finalization, obstacle-aware hits, anti-cheat validation, server-side blocks across rooms and invitation permissions.
5. Scale: split web API/rooms, Colyseus or equivalent distributed room discovery/Redis, regional hosting, performance and load testing.
6. Art/product: proper avatar animation, actual inventory and homes, friend requests and invites, mobile graphics adaptive quality.
7. Operations: monitoring, alerts, production CSP, database migrations, automated deployments, mobile browser QA and accessibility.

The platform is not currently capable of 5,000 concurrent users, rich economic gameplay or full Farcaster writing.

## Acceptance tests
- Reject falsified FIDs and reused challenges.
- Revoke sessions on sign-out; reject unauthenticated sockets and incorrect origins.
- Two real sockets see each other's positions; movement is bounded by the server.
- Client cannot supply an authoritative score, health or target result.
- Home changes persist across process restarts.
- Mobile UI, touch controls and feed error states work.
