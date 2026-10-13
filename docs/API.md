# Implemented API / WebSocket contract

All paths below are under /api. Mutating routes require JSON and an exact Origin equal to APP_ORIGIN. Sessions use an HttpOnly, SameSite=Lax cookie named simcaster_session.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /health | no | probe |
| GET | /config | no | capability flags |
| GET | /auth/challenge | no | 5-minute SIWF nonce |
| POST | /auth/verify | no | verified message, signature and nonce; set session |
| POST | /auth/demo | no | development-only local session |
| POST | /auth/logout | yes | session revocation |
| GET | /me | yes | user and avatar |
| PUT | /me/avatar | yes | validated avatar colors/outfits/hair |
| GET | /me/home | yes | owner's furniture |
| PUT | /me/home | yes | replace validated furniture |
| GET | /feed | yes | Neynar trend/following, or labelled sample in demo |
| GET | /leaderboard | yes | Laser Tag wins |
| GET | /world/status | yes | active connections and rooms |
| POST | /blocks | yes | block a player from receiving/sending their chat |
| POST | /casts | yes | 501, not yet authorized for publishing |

WebSocket URL: /socket?room=plaza|arena|home. Login cookie and Origin are required. The room type is server allowlisted. Each home is scoped to its owner's FID.

Client messages: move {dx,dz} (intent only); chat {text} (180 characters, 1.5s cooldown); emote {name: wave|dance|heart}; shoot {} (arena only).

Server messages: welcome {id,room,type,serverTime}; snapshot {at,players,secondsLeft}; chat {id,fid,name,text,time}; notice {text}; emote {id,name}; shot {id,target,hit}; match-end {winner,scores}; error {message}.

The server owns positions, headings, HP, hits, scores, match results and connection IDs. These snapshots are JSON for first-release readability; production will require bandwidth optimization and distributed room ownership.

Room invitations: /?join=plaza:N or /?join=arena:N joins an existing, non-full public room where available. Home invitation parameters are ignored.

POST /api/reports (auth required) accepts {fid, reason:'harassment'|'spam'|'cheating'} and stores a local pending report. No moderation queue UI is implemented yet.

The web client communicates over HTTPS and upgrades to WSS for multiplayer; it does not use mobile SDKs or native application transport.

Simcaster friendships (independent from Farcaster follows): GET /api/friends, POST /api/friends/requests {fid}, POST /api/friends/accept {fid}, DELETE /api/friends/:fid. All require login. Pending requests must be accepted by the recipient; blocking removes existing friendships.

GET /api/homes/:fid returns a home only to its owner or accepted Simcaster friends. For visiting sockets, supply /socket?room=home&owner=<ownerFID>; the owner/friend authorization is enforced during the WebSocket handshake, not merely in the client.
