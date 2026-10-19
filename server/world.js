import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'node:crypto';
import {
  WORLD_SIZE,
  ARENA_SIZE,
  SHOT_RANGE,
  SHOT_COOLDOWN_MS,
  DASH_COOLDOWN_MS,
  INTERACT_RANGE,
  PLAZA_HOTSPOTS,
  CITY_NPCS,
  ARENA_BOTS,
  cleanChat,
  clamp,
  movement,
  canHit,
  lineBlockedByArena,
  publicPlayer,
  sanitizeRoom,
  collidesWithPlaza,
  collidesWithArena
} from './rules.js';
import { HOME_TIERS } from './storage.js';

export function attachWorld(server, store, sessionFromRequest, allowedOrigin, clusterBus = store?.clusterBus || null) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  const instances = new Map();
  const remotePresence = new Map(); // `${replicaId}:${roomKey}` -> { replicaId, roomKey, roomType, players, at }
  let nextInstance = 1;

  const findRoom = (type, fid, requested) => {
    if (type !== 'home' && typeof requested === 'string') {
      const existing = instances.get(requested);
      if (
        existing &&
        existing.type === type &&
        existing.players.size < (type === 'arena' ? 8 : 24) &&
        !existing.locked
      ) {
        return existing;
      }
    }
    const key = type === 'home' ? 'home:' + fid : type;
    if (type === 'home') return instances.get(key) || createRoom(key, type);
    for (const room of instances.values()) {
      if (room.type === type && room.players.size < (type === 'arena' ? 8 : 24) && !room.locked) return room;
    }
    return createRoom(key + ':' + nextInstance++, type);
  };

  function createRoom(key, type) {
    const room = {
      key,
      type,
      players: new Map(),
      bots:
        type === 'arena'
          ? ARENA_BOTS.map((b) => ({
              ...b,
              npc: true,
              x: b.cx,
              z: b.cz,
              heading: 0,
              hp: 3,
              score: 0,
              downUntil: 0
            }))
          : [],
      locked: false,
      created: Date.now(),
      started: null,
      cityEvent: null,
      cityEventUntil: 0,
      lastEventRoll: Date.now(),
      powerup: type === 'arena' ? { type: 'shield', x: 0, z: -10.5 } : null,
      nextPowerupAt: Date.now() + 15000
    };
    instances.set(key, room);
    return room;
  }

  function send(ws, event, data) {
    if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 128000) {
      ws.send(JSON.stringify({ event, data }));
    }
  }

  function broadcast(room, event, data, { relay = true } = {}) {
    for (const p of room.players.values()) send(p.ws, event, data);
    if (relay && clusterBus && event !== 'snapshot') {
      clusterBus.publish('room:event', { roomKey: room.key, roomType: room.type, event, data });
    }
  }

  function getRemotePlayersForRoom(room, now = Date.now()) {
    if (!clusterBus) return [];
    const localFids = new Set([...room.players.values()].map((p) => Number(p.fid)));
    const merged = [];
    for (const [key, entry] of remotePresence.entries()) {
      if (now - entry.at > 3000) {
        remotePresence.delete(key);
        continue;
      }
      const sameRoom = room.type === 'home' ? entry.roomKey === room.key : entry.roomType === room.type;
      if (!sameRoom) continue;
      for (const rp of entry.players || []) {
        if (!localFids.has(Number(rp.fid))) {
          merged.push({ ...rp, remoteReplica: entry.replicaId });
        }
      }
    }
    return merged;
  }

  if (clusterBus) {
    clusterBus.on('room:presence', (payload, packet) => {
      if (!payload || !payload.roomKey) return;
      remotePresence.set(`${packet.replicaId}:${payload.roomKey}`, {
        replicaId: packet.replicaId,
        roomKey: payload.roomKey,
        roomType: payload.roomType,
        players: payload.players || [],
        at: Date.now()
      });
    });

    clusterBus.on('room:event', (payload) => {
      if (!payload || !payload.event) return;
      for (const room of instances.values()) {
        const sameRoom = room.type === 'home' ? room.key === payload.roomKey : room.type === payload.roomType;
        if (!sameRoom) continue;
        if (payload.event === 'chat') {
          for (const target of room.players.values()) {
            if (!store.isBlocked(payload.data?.fid, target.fid)) {
              send(target.ws, 'chat', payload.data);
            }
          }
        } else {
          broadcast(room, payload.event, payload.data, { relay: false });
        }
      }
    });
  }

  function syncPlayerAccount(p) {
    const fresh = store.findUser(p.fid);
    if (fresh) {
      p.creds = fresh.creds;
      p.currencies = { ...fresh.currencies };
      p.needs = { ...fresh.needs };
      p.career = fresh.career;
      p.avatar = fresh.avatar;
      p.powerBadge = Boolean(fresh.powerBadge);
    }
  }

  server.on('upgrade', (req, socket, head) => {
    const origin = req.headers.origin;
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      socket.destroy();
      return;
    }
    if (url.pathname !== '/socket') return socket.destroy();
    if (origin !== allowedOrigin) return socket.destroy();
    const user = sessionFromRequest(req);
    if (!user) return socket.destroy();
    const type = sanitizeRoom(url.searchParams.get('room'));
    const owner = type === 'home' ? Number(url.searchParams.get('owner') || user.fid) : user.fid;
    if (type === 'home' && (!Number.isSafeInteger(owner) || owner < 1 || !store.canVisitHome(user.fid, owner))) {
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, user, type, url.searchParams.get('instance'), owner);
    });
  });

  wss.on('connection', (ws, req, user, type, requested, owner) => {
    const room = findRoom(type, owner, requested);
    if (type === 'home' && room.players.size >= 8) {
      ws.close(1008, 'Apartment is full');
      return;
    }
    if ([...room.players.values()].some((p) => p.fid === user.fid)) {
      send(ws, 'error', { message: 'Already connected to this room in another tab' });
      ws.close(1008, 'Duplicate session');
      return;
    }
    const id = crypto.randomUUID();
    const spawn = room.type === 'arena' ? 8 : 4;
    const account = store.findUser(user.fid) || user;
    let spawnX = type === 'plaza' ? (Math.random() - 0.5) * 1.4 : (Math.random() - 0.5) * spawn;
    let spawnZ = type === 'plaza' ? 2.95 + Math.random() * 0.5 : (Math.random() - 0.5) * spawn;
    if (type === 'arena' && room.players.size > 0) {
      for (let attempt = 0; attempt < 20; attempt++) {
        const cx = (Math.random() - 0.5) * spawn;
        const cz = (Math.random() - 0.5) * spawn;
        const farEnough = [...room.players.values()].every((other) => Math.hypot(cx - other.x, cz - other.z) >= 4.2);
        if (farEnough) {
          spawnX = cx;
          spawnZ = cz;
          break;
        }
      }
    }
    const p = {
      id,
      fid: user.fid,
      name: user.displayName,
      avatar: account.avatar || user.avatar,
      creds: account.creds ?? 250,
      needs: account.needs ? { ...account.needs } : { energy: 85, hunger: 80, vibe: 75, clout: 10 },
      career: account.career || 'newcomer',
      powerBadge: Boolean(account.powerBadge),
      x: spawnX,
      z: spawnZ,
      heading: 0,
      hp: 3,
      score: 0,
      ws,
      input: { dx: 0, dz: 0 },
      lastInput: 0,
      lastShot: 0,
      lastDash: 0,
      dashUntil: 0,
      shieldUntil: 0,
      lastInteract: 0,
      lastNeedsTick: Date.now(),
      lastChat: 0,
      lastEmote: 0,
      lastMove: Date.now(),
      downUntil: 0,
      bubble: '',
      bubbleUntil: 0
    };
    room.players.set(id, p);
    send(ws, 'welcome', {
      id,
      room: room.key,
      type: room.type,
      serverTime: Date.now(),
      hotspots: PLAZA_HOTSPOTS,
      city: store.cityStatus()
    });
    broadcast(room, 'notice', {
      text: user.displayName.slice(0, 32) + ' joined the ' + (type === 'arena' ? 'arena' : type === 'home' ? 'apartment' : 'channels')
    });

    let messageWindow = Date.now();
    let messageCount = 0;

    ws.on('message', (raw) => {
      if (Date.now() - messageWindow >= 1000) {
        messageWindow = Date.now();
        messageCount = 0;
      }
      if (++messageCount > 35) {
        ws.close(1008, 'Too many messages');
        return;
      }
      let packet;
      try {
        packet = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!packet || typeof packet.event !== 'string') return;
      const now = Date.now();

      if (packet.event === 'move') {
        if (now - p.lastInput < 30) return;
        p.lastInput = now;
        const value = packet.data || {};
        if (Number.isFinite(value.dx) && Number.isFinite(value.dz)) {
          p.input = { dx: clamp(value.dx, -1, 1), dz: clamp(value.dz, -1, 1) };
          if (Math.hypot(p.input.dx, p.input.dz) > 0.01) p.heading = Math.atan2(p.input.dx, p.input.dz);
        }
      } else if (packet.event === 'warp') {
        if (room.type !== 'plaza') return;
        const ch = String(packet.data?.channel || '').replace(/^\/+/, '').toLowerCase();
        const coords = {
          farcaster: { x: 0, z: 3.1 },
          dev: { x: 6, z: -8.5 },
          memes: { x: -5.5, z: 8.5 },
          base: { x: 6.5, z: 8.5 }
        }[ch];
        if (coords) {
          p.x = coords.x + (Math.random() - 0.5) * 0.6;
          p.z = coords.z + (Math.random() - 0.5) * 0.6;
          p.input = { dx: 0, dz: 0 };
        }
      } else if (packet.event === 'dash') {
        if (now - p.lastDash < DASH_COOLDOWN_MS || p.hp <= 0) return;
        p.lastDash = now;
        p.dashUntil = now + 450;
        broadcast(room, 'dash', { id: p.id });
      } else if (packet.event === 'chat') {
        if (now - p.lastChat < 1500) return;
        const text = cleanChat(packet.data?.text);
        if (!text) return;
        p.lastChat = now;
        p.bubble = text.slice(0, 64);
        p.bubbleUntil = now + 6500;
        const u = store.findUser(p.fid);
        if (u) {
          u.creds += 10;
          u.currencies.creds = u.creds;
          u.needs.vibe = clamp(u.needs.vibe + 3, 0, 100);
          p.creds = u.creds;
          p.needs = { ...u.needs };
          store.saveDebounced();
        }
        const chatPayload = { id: p.id, fid: p.fid, name: p.name, text, time: now };
        for (const target of room.players.values()) {
          if (!store.isBlocked(p.fid, target.fid)) {
            send(target.ws, 'chat', chatPayload);
          }
        }
        if (clusterBus) {
          clusterBus.publish('room:event', { roomKey: room.key, roomType: room.type, event: 'chat', data: chatPayload });
        }
      } else if (packet.event === 'emote') {
        if (!['wave', 'dance', 'heart'].includes(packet.data?.name) || now - p.lastEmote < 900) return;
        const target = room.players.get(packet.data?.targetId);
        if (target && (store.isBlocked(p.fid, target.fid) || Math.hypot(p.x - target.x, p.z - target.z) > 5)) return;
        p.lastEmote = now;
        const u = store.findUser(p.fid);
        if (u) {
          u.creds += 15;
          u.currencies.creds = u.creds;
          u.needs.vibe = clamp(u.needs.vibe + 5, 0, 100);
          p.creds = u.creds;
          p.needs = { ...u.needs };
          store.saveDebounced();
        }
        broadcast(room, 'emote', { id: p.id, name: packet.data.name, targetId: target?.id || null });
      } else if (packet.event === 'interact' && type === 'plaza') {
        if (now - p.lastInteract < 1500) return;
        const hotspotId = String(packet.data?.hotspotId || '');
        const actionId = String(packet.data?.actionId || '');
        const hotspot = PLAZA_HOTSPOTS.find((h) => h.id === hotspotId);
        if (!hotspot) return;
        if (Math.hypot(p.x - hotspot.x, p.z - hotspot.z) > INTERACT_RANGE) {
          send(ws, 'activity', { ok: false, error: `Walk closer to ${hotspot.name} to interact` });
          return;
        }
        try {
          p.lastInteract = now;
          const result = store.performHotspotAction(p.fid, hotspotId, actionId, room.cityEvent === 'blackout');
          syncPlayerAccount(p);
          p.bubble = `${hotspot.icon} ${result.action.split('(')[0].trim()}`;
          p.bubbleUntil = now + 4500;
          if (hotspotId === 'transit-hub' && actionId === 'shuttle') {
            const stops = [
              { x: 6.0, z: -8.8 },
              { x: 6.5, z: 8.8 },
              { x: -5.5, z: 8.8 },
              { x: 9.2, z: 0 }
            ];
            const dest = stops[Math.floor(Math.random() * stops.length)];
            p.x = dest.x;
            p.z = dest.z;
          }
          if (hotspotId === 'power-grid' && room.cityEvent === 'blackout') {
            room.cityEvent = null;
            room.cityEventUntil = 0;
            broadcast(room, 'notice', { text: `⚡ ${p.name} stabilized the Hub Relay Core and earned a +90 DEGEN bonus!` });
          }
          send(ws, 'activity', {
            ok: true,
            hotspotId,
            hotspot: result.hotspot,
            action: result.action,
            deltaCreds: result.deltaCreds,
            promoted: result.promoted,
            creds: p.creds,
            needs: p.needs,
            career: p.career,
            quests: result.user?.quests
          });
        } catch (err) {
          send(ws, 'activity', { ok: false, error: err.message });
        }
      } else if (packet.event === 'use-furniture' && type === 'home') {
        if (now - p.lastInteract < 1500) return;
        const itemType = String(packet.data?.type || '');
        try {
          p.lastInteract = now;
          const result = store.useHomeFurniture(p.fid, itemType);
          syncPlayerAccount(p);
          send(ws, 'activity', {
            ok: true,
            action: result.effect,
            deltaCreds: result.deltaCreds || 25,
            creds: p.creds,
            needs: p.needs,
            career: p.career,
            quests: result.user?.quests
          });
        } catch (err) {
          send(ws, 'activity', { ok: false, error: err.message });
        }
      } else if (packet.event === 'tip') {
        const targetFid = Number(packet.data?.toFid || packet.data?.targetFid);
        const amount = Number(packet.data?.amount);
        const currency = packet.data?.currency || 'degen';
        const castHash = packet.data?.castHash || null;

        if (!Number.isSafeInteger(targetFid) || targetFid === Number(p.fid) || !Number.isSafeInteger(amount) || amount <= 0) {
          send(ws, 'activity', { ok: false, error: 'Invalid tip parameters or self-tipping attempt' });
          return;
        }

        try {
          const result = store.transferTip(p.fid, targetFid, amount, currency, { castHash });
          syncPlayerAccount(p);

          for (const r of instances.values()) {
            for (const targetPlayer of r.players.values()) {
              if (Number(targetPlayer.fid) === targetFid) syncPlayerAccount(targetPlayer);
            }
          }

          const tipPayload = {
            type: 'tip',
            fromFid: p.fid,
            fromName: p.name,
            toFid: result.toFid,
            toName: result.toName,
            amount: result.amount,
            currency: result.currency,
            castHash: result.castHash
          };

          broadcast(room, 'tip', tipPayload);
          broadcast(room, 'notice', {
            text: `🪙 ${p.name} tipped ${result.toName} ${result.amount} ₡${result.currency.toUpperCase()}!`
          });

          send(ws, 'activity', {
            ok: true,
            action: `Tipped ${result.toName} ${result.amount} ${result.currency.toUpperCase()}`,
            creds: p.creds,
            currencies: p.currencies,
            needs: p.needs,
            promoted: null
          });
        } catch (err) {
          send(ws, 'activity', { ok: false, error: err.message });
        }
      } else if (packet.event === 'shoot' && type === 'arena') {
        if (now - p.lastShot < SHOT_COOLDOWN_MS || p.hp <= 0) return;
        const humanTargets = [...room.players.values()].filter((target) => canHit(p, target, now));
        humanTargets.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
        let hit = humanTargets[0] || null;

        if (!hit && Array.isArray(room.bots)) {
          const requestedId = packet.data?.targetId;
          const validBots = room.bots.filter((bot) => {
            if (!bot || bot.hp <= 0) return false;
            const dist = Math.hypot(bot.x - p.x, bot.z - p.z);
            if (dist > SHOT_RANGE || dist < 0.25) return false;
            if (lineBlockedByArena(p.x, p.z, bot.x, bot.z)) return false;
            if (requestedId && bot.id === requestedId) return true;
            const angle = Math.atan2(bot.x - p.x, bot.z - p.z);
            const diff = Math.atan2(Math.sin(angle - p.heading), Math.cos(angle - p.heading));
            return Math.abs(diff) < 0.85;
          });
          validBots.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
          hit = validBots[0] || null;
          if (hit) {
            p.heading = Math.atan2(hit.x - p.x, hit.z - p.z);
          }
        }

        p.lastShot = now; // cooldown consumed even on miss
        if (hit) {
          hit.hp -= 1;
          store.recordQuestProgress(p.fid, 'arena_tags', 1);
          let degenEarned = 15;
          if (hit.hp <= 0) {
            hit.downUntil = now + 2800;
            p.score += 1;
            degenEarned = 60;
          }
          const u = store.findUser(p.fid);
          if (u) {
            u.creds += degenEarned;
            u.currencies.creds = u.creds;
            u.currencies.degen = (u.currencies.degen || 0) + degenEarned;
            u.xp += hit.hp <= 0 ? 15 : 5;
            u.needs.vibe = clamp(u.needs.vibe + 4, 0, 100);
            u.needs.clout = clamp(u.needs.clout + (hit.hp <= 0 ? 5 : 2), 0, 100);
            store.saveDebounced();
            syncPlayerAccount(p);
            send(ws, 'activity', {
              ok: true,
              action: hit.hp <= 0 ? `Tagged ${hit.name}! (+${degenEarned} DEGEN)` : `Laser hit on ${hit.name}! (+${degenEarned} DEGEN)`,
              deltaCreds: degenEarned,
              creds: p.creds,
              needs: p.needs,
              career: p.career
            });
          }
        }
        broadcast(room, 'shot', {
          id: p.id,
          target: hit?.id || null,
          hit: !!hit,
          from: { x: +p.x.toFixed(2), z: +p.z.toFixed(2), heading: +p.heading.toFixed(2) },
          to: hit ? { x: +hit.x.toFixed(2), z: +hit.z.toFixed(2) } : null
        });
      }
    });

    ws.on('close', () => {
      room.players.delete(id);
      broadcast(room, 'notice', { text: user.displayName.slice(0, 32) + ' left' });
      if (!room.players.size) instances.delete(room.key);
    });
    ws.on('error', () => {});
  });

  const ticker = setInterval(() => {
    const now = Date.now();
    const cycle = Math.floor((now / 45000) % 3);
    const timePhase = cycle === 0 ? 'day' : cycle === 1 ? 'sunset' : 'night';

    for (const room of instances.values()) {
      if (room.type === 'home') {
        const owner = Number(room.key.slice('home:'.length));
        for (const guest of room.players.values()) {
          if (!store.canVisitHome(guest.fid, owner)) guest.ws.close(1008, 'Apartment access revoked');
        }
      }

      if (room.type === 'plaza') {
        if (room.cityEvent && now > room.cityEventUntil) {
          room.cityEvent = null;
          broadcast(room, 'notice', { text: '🏙️ Channel conditions have returned to normal.' });
        } else if (!room.cityEvent && now - room.lastEventRoll > 75000 && room.players.size > 0) {
          room.lastEventRoll = now;
          room.cityEvent = Math.random() < 0.5 ? 'blackout' : 'happy_hour';
          room.cityEventUntil = now + 35000;
          broadcast(room, 'notice', {
            text:
              room.cityEvent === 'blackout'
                ? '⚠️ HUB RELAY OUTAGE! Visit the Hub Relay Core to restore power for a +90 DEGEN bonus!'
                : '🎉 HAPPY HOUR! Vibe, Clout & DEGEN rewards are surging across all Channels!'
          });
        }
      }

      const homeOwner = room.type === 'home' ? Number(room.key.slice('home:'.length)) : null;
      const homeTierId = homeOwner ? store.findUser(homeOwner)?.homeTier || 'studio' : 'studio';
      const homeBound = (HOME_TIERS[homeTierId]?.bound || 4) + 1;

      for (const p of room.players.values()) {
        const dt = clamp((now - p.lastMove) / 1000, 0, 0.15);
        p.lastMove = now;

        if (room.type === 'plaza' && now - p.lastNeedsTick > 25000) {
          p.lastNeedsTick = now;
          const updatedNeeds = store.tickPlayerNeeds(p.fid);
          if (updatedNeeds) p.needs = { ...updatedNeeds };
        }

        if (p.hp <= 0 && now >= p.downUntil) {
          p.hp = 3;
          p.x = (Math.random() - 0.5) * 8;
          p.z = (Math.random() - 0.5) * 8;
        }
        if (p.hp > 0) {
          let speedMult = 1.0;
          if (p.dashUntil > now) speedMult = 1.65;
          else if (room.type === 'plaza') {
            if ((p.needs?.energy ?? 80) >= 75 && (p.needs?.vibe ?? 75) >= 75) speedMult = 1.12;
            else if ((p.needs?.energy ?? 80) < 15) speedMult = 0.78;
          }
          const d = movement(p.input, dt, WORLD_SIZE, speedMult);
          const size = room.type === 'arena' ? ARENA_SIZE : room.type === 'home' ? homeBound : WORLD_SIZE;
          const nextX = clamp(p.x + d.dx, -size, size);
          const nextZ = clamp(p.z + d.dz, -size, size);
          const blockedX =
            (room.type === 'plaza' && collidesWithPlaza(nextX, p.z)) ||
            (room.type === 'arena' && collidesWithArena(nextX, p.z));
          const blockedZ =
            (room.type === 'plaza' && collidesWithPlaza(p.x, nextZ)) ||
            (room.type === 'arena' && collidesWithArena(p.x, nextZ));
          if (!blockedX) p.x = nextX;
          if (!blockedZ) p.z = nextZ;

          if (room.type === 'arena' && room.powerup && Math.hypot(p.x - room.powerup.x, p.z - room.powerup.z) < 1.6) {
            const kind = room.powerup.type;
            room.powerup = null;
            room.nextPowerupAt = now + 18000;
            if (kind === 'shield') {
              p.shieldUntil = now + 6000;
              broadcast(room, 'notice', { text: `🛡️ ${p.name} picked up an Arena Energy Shield!` });
            } else {
              p.hp = Math.min(3, p.hp + 1);
              broadcast(room, 'notice', { text: `💚 ${p.name} picked up a Nano Repair Kit (+1 HP)!` });
            }
          }
        }
      }

      if (room.type === 'arena') {
        if (!room.powerup && now >= room.nextPowerupAt) {
          room.powerup = { type: Math.random() < 0.5 ? 'shield' : 'heal', x: 0, z: -10.5 };
        }
        for (const bot of room.bots || []) {
          if (bot.hp <= 0 && now >= bot.downUntil) {
            bot.hp = 3;
          }
          if (bot.hp > 0) {
            const angle = (now / 1000) * bot.speed + bot.phase;
            bot.x = +(bot.cx + Math.cos(angle) * bot.radius).toFixed(2);
            bot.z = +(bot.cz + Math.sin(angle) * bot.radius).toFixed(2);
            bot.heading = +Math.atan2(-Math.sin(angle), Math.cos(angle)).toFixed(2);
          }
        }
        if (room.players.size === 0) {
          room.started = null;
        } else {
          if (!room.started) room.started = now;
          const reachedScore = [...room.players.values()].find((participant) => participant.score >= 7);
          if (reachedScore || now - room.started >= 180000) {
            const ranked = [...room.players.values()].sort((a, b) => b.score - a.score);
            const tied = ranked.length > 1 && ranked[0].score === ranked[1].score;
            const winner = tied ? null : reachedScore || ranked[0];
            if (winner) {
              store.recordWin(winner.fid);
              syncPlayerAccount(winner);
            }
            broadcast(room, 'match-end', {
              winner: winner?.id || null,
              scores: ranked.map((participant) => ({
                id: participant.id,
                name: participant.name,
                score: participant.score
              }))
            });
            room.started = now;
            for (const participant of room.players.values()) participant.score = 0;
          }
        }
      }

      const npcs =
        room.type === 'plaza'
          ? CITY_NPCS.map((npc) => {
              const angle = (now / 1000) * npc.speed + npc.phase;
              const x = +(npc.cx + Math.cos(angle) * npc.radius).toFixed(2);
              const z = +(npc.cz + Math.sin(angle) * npc.radius).toFixed(2);
              const heading = +Math.atan2(-Math.sin(angle), Math.cos(angle)).toFixed(2);
              const lineIdx = Math.floor((now / 8500 + npc.phase) % npc.lines.length);
              const showBubble = (now + Math.floor(npc.phase * 1000)) % 8500 < 5200;
              return {
                id: npc.id,
                fid: npc.fid,
                name: npc.name,
                npc: true,
                x,
                z,
                heading,
                avatar: npc.avatar,
                hp: 3,
                score: 0,
                bubble: showBubble ? npc.lines[lineIdx] : undefined
              };
            })
          : room.type === 'arena'
            ? (room.bots || []).map((bot) => ({
                id: bot.id,
                fid: bot.fid,
                name: bot.name,
                npc: true,
                x: bot.x,
                z: bot.z,
                heading: bot.heading,
                avatar: bot.avatar,
                hp: bot.hp,
                score: bot.score,
                bubble: bot.hp <= 0 ? '⚡ Rebooting…' : undefined
              }))
            : [];

      const localPlayers = [...room.players.values()].map(publicPlayer);
      if (clusterBus && localPlayers.length > 0) {
        clusterBus.publish('room:presence', {
          roomKey: room.key,
          roomType: room.type,
          players: localPlayers
        });
      }
      const remotePlayers = getRemotePlayersForRoom(room, now);

      broadcast(room, 'snapshot', {
        at: now,
        timePhase,
        cityEvent: room.cityEvent || null,
        powerup: room.powerup || null,
        players: remotePlayers.length > 0 ? [...localPlayers, ...remotePlayers] : localPlayers,
        npcs,
        secondsLeft: room.type === 'arena' && room.started ? Math.max(0, Math.ceil((180000 - (now - room.started)) / 1000)) : null
      });
    }
  }, 100);

  ticker.unref?.();

  return {
    notifyHomeUpdated: (owner, home) => {
      const room = instances.get('home:' + owner);
      const data = { items: home.items, tier: home.tier || 'studio', owner };
      if (room) broadcast(room, 'home-updated', data);
      else if (clusterBus) {
        clusterBus.publish('room:event', { roomKey: 'home:' + owner, roomType: 'home', event: 'home-updated', data });
      }
    },
    broadcastTip: (tipData) => {
      const payload = {
        type: 'tip',
        fromFid: Number(tipData.fromFid),
        fromName: tipData.fromName,
        toFid: Number(tipData.toFid),
        toName: tipData.toName,
        amount: Number(tipData.amount),
        currency: tipData.currency,
        castHash: tipData.castHash || null
      };
      for (const room of instances.values()) {
        broadcast(room, 'tip', payload, { relay: false });
      }
      if (clusterBus) {
        clusterBus.publish('room:event', {
          roomKey: 'global',
          roomType: 'plaza',
          event: 'tip',
          data: payload
        });
      }
    },
    syncUser: (fid) => {
      for (const room of instances.values()) {
        for (const p of room.players.values()) {
          if (Number(p.fid) === Number(fid)) syncPlayerAccount(p);
        }
      }
    },
    close: () => {
      clearInterval(ticker);
      wss.close();
    },
    stats: () => ({
      players: [...instances.values()].reduce((n, r) => n + r.players.size, 0),
      rooms: instances.size,
      arcade: [...instances.values()].filter((r) => r.type === 'arena').length,
      city: store.cityStatus(),
      cluster: {
        replicaId: clusterBus?.replicaId || 'standalone',
        pubsubBackend: clusterBus?.backend || 'standalone',
        storageBackend: store.pgAdapter ? 'postgres' : 'json-atomic',
        peers: clusterBus ? clusterBus.activePeers() : []
      }
    })
  };
}

