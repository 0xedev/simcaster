# Simcaster Test Infrastructure (`TEST_INFRA.md`)

## 1. Overview & Testing Philosophy

Simcaster is an isometric 3D virtual social world connecting Farcaster accounts and guest players. The testing infrastructure is designed around a **4-tier systematic, requirement-driven, opaque-box E2E architecture** implemented natively using the Node.js test runner (`node:test`, `node:assert/strict`).

### Core Testing Invariants:
1. **Opaque-Box Verification**: The test suite exercises the system solely through client-facing interfaces: HTTP REST endpoints (`fetch`), real-time WebSockets (`ws`), and public domain rules contracts.
2. **Deterministic & Isolated State**: Each test run provisions an isolated ephemeral storage state on an unshared local port with zero cross-test state leakage.
3. **Dual-Track Progressive Testability**: All test requirements across all project milestones (M1–M4) are authored upfront. Tests for upcoming milestones automatically stage and activate as feature implementations land in the codebase without requiring test modifications.
4. **Zero Flakiness**: Asynchronous operations utilize explicit event polling (`waitForServer`, `waitPacket`) with fail-fast timeouts.

---

## 2. Test Runner & Toolchain Configuration

- **Framework**: Native Node.js Test Runner (`node:test`, `node:assert/strict`).
- **Engine Requirement**: Node.js `>= 22.0.0` (ESM native).
- **Execution Script**:
  - Full project test suite: `npm test` (`node --test tests/*.test.js`)
  - Dedicated E2E suite: `node --test tests/e2e_suite.test.js`
- **Zero Heavy Dependencies**: Runs directly on Node.js without requiring third-party testing frameworks (Jest, Mocha, Cypress), keeping CI builds instant and lightweight.

---

## 3. Ephemeral Server Lifecycle Management

The E2E test harness (`tests/e2e_suite.test.js`) manages an isolated, full-stack server process:
1. **Setup (`before` hook)**:
   - Creates a unique temporary directory via `fs.mkdtempSync(path.join(os.tmpdir(), 'simcaster-e2e-'))`.
   - Allocates an ephemeral random port in the range `37000–51000`.
   - Spawns `server/index.js` as a background child process with:
     ```javascript
     {
       PORT: String(port),
       APP_ORIGIN: 'http://localhost:' + port,
       SIMCASTER_DEMO_MODE: 'true',
       NODE_ENV: 'test',
       DATA_FILE: path.join(tmpDir, 'e2e-store.json')
     }
     ```
   - Awaits healthy readiness probe at `GET /api/health` within a 7.2s timeout window.
   - Executes dynamic feature probes to detect implemented milestone capabilities.
2. **Teardown (`after` hook)**:
   - Signals and terminates the server child process (`serverProcess.kill()`).
   - Recursively deletes the temporary store directory.

---

## 4. 4-Tier Test Suite Hierarchy

The suite comprises **55 distinct test cases** organized across four tiers:

### Tier 1: Feature Coverage (>=5 Tests Per Feature, 22 Tests)
Validates primary happy-path behavior in complete isolation:
- **Districts (F1.1–F1.5)**:
  - `T1.1`: Center radius $(0, 0)$ maps to `/farcaster` Main Plaza.
  - `T1.2`: Northeast quadrant $(8, -8)$ maps to `/dev` Builders Foundry.
  - `T1.3`: Southwest quadrant $(-8, 8)$ maps to `/memes` Arcade Lounge.
  - `T1.4`: Southeast quadrant $(8, 8)$ maps to `/base` Onchain Market.
  - `T1.5`: `GET /api/feed?channel=dev` filters casts for `/dev` district.
  - `T1.6`: `POST /api/casts` tags new casts with active district channel.
- **Street Tipping (F2.1–F2.6)**:
  - `T1.7`: `POST /api/tips` executes preset 10 ₡DEGEN tip and updates balances.
  - `T1.8`: `POST /api/tips` executes preset 50 ₡DEGEN tip between players.
  - `T1.9`: `POST /api/tips` executes preset 100 ₡DEGEN tip.
  - `T1.10`: `POST /api/tips` associates tip with `castHash` when tipping a cast.
  - `T1.11`: Tipping awards Clout and Vibe to participants.
  - `T1.12`: Executing tip broadcasts real-time `tip` event over WebSocket.
- **Power Badges (F3.1–F3.6)**:
  - `T1.13`: Account state includes `powerBadge` in profile serialization.
  - `T1.14`: `publicPlayer` serializes `powerBadge: true` for connected players.
  - `T1.15`: WebSocket `snapshot` broadcasts `powerBadge` status of players.
  - `T1.16`: Power Badge holders bypass VIP entry fee (`cost = 0`) at Purple Rooftop Lounge.
  - `T1.17`: Power Badge holders have elevated daily tipping allowance of 1,000 creds.
- **Seamless Guest / Connected Experience (F4.1–F4.2)**:
  - `T1.18`: 1-Click guest access creates immediate authenticated session without redirects.
  - `T1.19`: Guest account provisioned with synthetic FID $\ge 900,000,000$ and starting creds.
  - `T1.20`: Guest player connects to real-time WebSocket plaza and joins simulation.
  - `T1.21`: Guest player has full feature parity to perform venue interactions.
  - `T1.22`: Guest can log out cleanly, revoking session cookie.

### Tier 2: Boundary & Corner Cases (>=5 Tests Per Feature, 22 Tests)
Stress-tests mathematical boundaries, invalid payloads, CSRF, and security controls:
- **Districts Boundary Conditions**:
  - `T2.1`: Radius boundary inside ($r = 3.99$) classifies as `/farcaster`.
  - `T2.2`: Radius boundary exact ($r = 4.0$) classifies as `/farcaster`.
  - `T2.3`: Radius boundary outside ($r = 4.01$) in Northeast classifies as `/dev`.
  - `T2.4`: Axis coordinates ($x \ge 0, z < 0$) correctly resolve to `/dev`.
  - `T2.5`: Extreme world extents $(18.9, -18.9)$ resolve without errors.
  - `T2.6`: Non-finite / `NaN` coordinates gracefully fall back to `/farcaster`.
- **Street Tipping Boundaries & Rejection Invariants**:
  - `T2.7`: Self-tipping rejection (`toFid === fromFid`) returns HTTP 400.
  - `T2.8`: Zero and negative tips (`amount <= 0`) return HTTP 400.
  - `T2.9`: Non-numeric / float amounts return HTTP 400.
  - `T2.10`: Insufficient balance returns HTTP 402.
  - `T2.11`: Non-existent recipient FID returns HTTP 404.
  - `T2.12`: Standard user tipping above daily limit (250 creds) rejected with HTTP 400.
- **Power Badges Boundaries & Privileges**:
  - `T2.13`: Standard user with 0 creds rejected from VIP Rooftop Lounge.
  - `T2.14`: Standard user with $\ge 25$ creds pays exactly ₡25 fee.
  - `T2.15`: Power Badge holder with 0 creds is admitted free (`cost = 0`).
  - `T2.16`: Power Badge daily tipping allowance capped at exactly 1,000 creds.
  - `T2.17`: Account with `powerBadge: false` or `undefined` strictly treated as standard tier.
- **Guest & Security Edge Cases**:
  - `T2.18`: Guest name with HTML tags is sanitized cleanly.
  - `T2.19`: Empty or whitespace-only name defaults to `Guest <id>`.
  - `T2.20`: Cross-origin request with unauthorized origin header returns HTTP 403.
  - `T2.21`: Calling protected API endpoints without cookie returns HTTP 401.
  - `T2.22`: Calling protected API with revoked session token returns HTTP 401.

### Tier 3: Cross-Feature Combinations (6 Tests)
Validates multi-feature pairwise interactions:
- `T3.1`: **Districts + Tipping**: Player in `/dev` district tips another player; both retain correct district coordinates in snapshot.
- `T3.2`: **Districts + Power Badges**: Power Badge holder enters VIP Purple Lounge in `/memes` district.
- `T3.3`: **Tipping + Power Badges**: Standard user is capped at 250 while Power Badge holder tips up to 1,000 in the same session.
- `T3.4`: **Guest + Districts**: Guest player traverses all 4 districts and fetches channel feeds.
- `T3.5`: **Guest + Tipping**: Guest tips a connected Farcaster user bidirectionally.
- `T3.6`: **Guest + Power Badges**: Guest without badge pays fee; Power Badge holder enters free.

### Tier 4: Real-World Application Scenarios (5 Tests)
Simulates complete end-to-end player journeys:
- `T4.1`: **Journey 1: New Guest Player Onboarding & Plaza Exploration**:
  1-Click login $\to$ verify session $\to$ spawn at Plaza $\to$ navigate $\to$ check feed $\to$ logout.
- `T4.2`: **Journey 2: Social Creator Tipping & Clout Economy**:
  Creator posts in `/dev` $\to$ Fan discovers in `/dev` feed $\to$ Fan tips 50 ₡DEGEN with `castHash` $\to$ balance and stats update.
- `T4.3`: **Journey 3: Power Badge VIP Night Out**:
  VIP with 0 creds enters Rooftop Lounge free $\to$ spins DJ set (+60 creds) $\to$ tips fan 50 creds.
- `T4.4`: **Journey 4: Multi-User Plaza Tipping & Real-Time Sync**:
  Two players connect to WebSocket plaza $\to$ Player A tips Player B 10 creds $\to$ Player B receives `tip` event $\to$ snapshot syncs.
- `T4.5`: **Journey 5: Daily Limit Progression & Reset Enforcement**:
  Standard user tips increments up to 250 creds, then is blocked $\to$ Power Badge user continues up to 1,000 creds.

---

## 5. Authoritative Oracles & Output Specifications

All assertions in the test suite are derived directly from the canonical interface contracts in `PROJECT.md`:
1. **Districts & Coordinates Contract** (`PROJECT.md § 1`):
   - Center radius $\le 4.0 \implies$ `DISTRICTS.farcaster` (`#8a63d2`)
   - $X \ge 0, Z < 0 \implies$ `DISTRICTS.dev` (`#38bdf8`)
   - $X < 0, Z \ge 0 \implies$ `DISTRICTS.memes` (`#f43f5e`)
   - $X \ge 0, Z \ge 0 \implies$ `DISTRICTS.base` (`#0052ff`)
   - $X < 0, Z < 0 \implies$ `DISTRICTS.farcaster` (extension)
2. **Tipping & Currency API Contract** (`PROJECT.md § 2`):
   - `POST /api/tips` returns `{ ok: true, tip: { fromFid, toFid, amount, currency, castHash?, fromBalance, toBalance, cloutAwarded, vibeAwarded } }`
   - WebSocket broadcast: `{ type: 'tip', fromFid, fromName, toFid, toName, amount, currency }`
   - Error status codes: 400 (bad params / self-tip / limit exceeded), 402 (insufficient balance), 404 (user not found).
3. **Power Badges Contract** (`PROJECT.md § 3`):
   - `user.powerBadge` boolean in profile and `publicPlayer(p)`
   - Hotspot `neon-lounge`, action `party`: `cost = 0` for Power Badge holders
   - Daily tipping limit: standard = 250 creds/day, Power Badge = 1,000 creds/day.

---

## 6. Progressive Milestone Verification Guide

For implementing sub-orchestrators and workers:
1. When working on Milestone 1 (Districts):
   - Export `DISTRICTS` and `getPlazaDistrict(x, z)` from `server/rules.js`.
   - Run `node --test tests/e2e_suite.test.js` to observe tests `T1.1–T1.4`, `T2.1–T2.6`, and `T3.2` transition from skipped to passing.
2. When working on Milestone 2 (Street Tipping):
   - Implement `transferTip` in `server/storage.js` and `POST /api/tips` in `server/index.js`.
   - Run `node --test tests/e2e_suite.test.js` to observe tests `T1.7–T1.12`, `T2.7–T2.12`, and `T4.2, T4.4` transition to passing.
3. When working on Milestone 3 (Power Badges & VIP Privileges):
   - Add `powerBadge` to `publicPlayer` and entry fee bypass in `performHotspotAction`.
   - Run `node --test tests/e2e_suite.test.js` to observe all remaining tests transition to passing.
4. When Milestone 4 is reached:
   - 100% of the 55 tests execute active and pass cleanly.
