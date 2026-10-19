import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

/**
 * In-memory SQL driver implementing the PostgreSQL wire contract used by PostgresStoreAdapter.
 * Useful for local multi-replica cluster testing and CI environments without a live Postgres daemon.
 */
export function createMemorySqlDriver() {
  const stateTable = new Map();
  const accountsTable = new Map();
  const queries = [];

  return {
    queries,
    stateTable,
    accountsTable,
    async query(sql, params = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      queries.push({ sql: normalized, params });

      if (normalized.startsWith('CREATE TABLE IF NOT EXISTS')) {
        return { rows: [], rowCount: 0 };
      }

      if (normalized.startsWith('INSERT INTO simcaster_state')) {
        const [id, payloadRaw, updatedAt] = params;
        const payload = typeof payloadRaw === 'string' ? JSON.parse(payloadRaw) : structuredClone(payloadRaw);
        stateTable.set(String(id), { id: String(id), payload, updated_at: Number(updatedAt) });
        return { rows: [], rowCount: 1 };
      }

      if (normalized.startsWith('INSERT INTO simcaster_accounts')) {
        const [fid, dataRaw, updatedAt] = params;
        const data = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : structuredClone(dataRaw);
        accountsTable.set(Number(fid), { fid: Number(fid), data, updated_at: Number(updatedAt) });
        return { rows: [], rowCount: 1 };
      }

      if (normalized.startsWith('SELECT payload, updated_at FROM simcaster_state')) {
        const [id] = params;
        const row = stateTable.get(String(id));
        return { rows: row ? [structuredClone(row)] : [], rowCount: row ? 1 : 0 };
      }

      if (normalized.startsWith('SELECT fid, data, updated_at FROM simcaster_accounts')) {
        const rows = [...accountsTable.values()].map((r) => structuredClone(r));
        return { rows, rowCount: rows.length };
      }

      return { rows: [], rowCount: 0 };
    },
    async end() {}
  };
}

/**
 * Pluggable PostgreSQL persistence adapter for horizontal cloud scaling.
 * Connects to PostgreSQL via `DATABASE_URL` (using `pg`) or an injected SQL client.
 */
export class PostgresStoreAdapter {
  constructor({ connectionString = process.env.DATABASE_URL, client = null } = {}) {
    this.connectionString = connectionString || '';
    this.client = client;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return this;
    if (!this.client) {
      if (!this.connectionString) {
        throw new Error('PostgresStoreAdapter requires DATABASE_URL or an injected SQL client');
      }
      const pgModule = await import('pg');
      const Pool = pgModule.Pool || pgModule.default?.Pool;
      this.client = new Pool({ connectionString: this.connectionString, max: 10 });
    }
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS simcaster_state (
        id TEXT PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at BIGINT NOT NULL
      )
    `);
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS simcaster_accounts (
        fid BIGINT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at BIGINT NOT NULL
      )
    `);
    this.initialized = true;
    return this;
  }

  async loadState() {
    await this.init();
    const stateRes = await this.client.query(
      'SELECT payload, updated_at FROM simcaster_state WHERE id = $1',
      ['global']
    );
    const accountsRes = await this.client.query(
      'SELECT fid, data, updated_at FROM simcaster_accounts'
    );

    const base = stateRes.rows[0]?.payload
      ? typeof stateRes.rows[0].payload === 'string'
        ? JSON.parse(stateRes.rows[0].payload)
        : structuredClone(stateRes.rows[0].payload)
      : null;

    if (!base && accountsRes.rows.length === 0) return null;

    const merged = base || { accounts: {} };
    if (!merged.accounts || typeof merged.accounts !== 'object') merged.accounts = {};
    for (const row of accountsRes.rows) {
      const accountData = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      merged.accounts[String(row.fid)] = accountData;
    }
    return merged;
  }

  async saveState(state) {
    await this.init();
    const now = Date.now();
    const serialized = JSON.stringify(state);
    await this.client.query(
      `INSERT INTO simcaster_state (id, payload, updated_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE
       SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at`,
      ['global', serialized, now]
    );
    const accounts = state?.accounts || {};
    for (const [fidKey, account] of Object.entries(accounts)) {
      const fid = Number(fidKey);
      if (Number.isSafeInteger(fid) && fid > 0) {
        await this.upsertAccount(fid, account, now);
      }
    }
  }

  async upsertAccount(fid, account, now = Date.now()) {
    await this.init();
    await this.client.query(
      `INSERT INTO simcaster_accounts (fid, data, updated_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (fid) DO UPDATE
       SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
      [Number(fid), JSON.stringify(account), now]
    );
  }

  async close() {
    if (this.client && typeof this.client.end === 'function') {
      await this.client.end();
    }
  }
}

/**
 * Shared in-memory Pub/Sub broker that emulates Redis Pub/Sub channels across multiple
 * server instances in tests or single-host cluster workers.
 */
export function createMemoryPubSubBroker() {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(100);
  return {
    publish(channel, message) {
      emitter.emit(channel, message);
    },
    subscribe(channel, listener) {
      emitter.on(channel, listener);
      return () => emitter.off(channel, listener);
    }
  };
}

/**
 * Redis Pub/Sub Cluster Bus for synchronizing WebSocket rooms, player presence,
 * chat/laser events, and Store state across multiple horizontal Simcaster server replicas.
 */
export class ClusterBus {
  constructor({
    redisUrl = process.env.REDIS_URL || '',
    broker = null,
    replicaId = process.env.REPLICA_ID || 'replica-' + crypto.randomUUID().slice(0, 8),
    channel = 'simcaster:cluster'
  } = {}) {
    this.redisUrl = redisUrl;
    this.broker = broker;
    this.replicaId = replicaId;
    this.channel = channel;
    this.handlers = new Map();
    this.pubClient = null;
    this.subClient = null;
    this.unsubscribeBroker = null;
    this.connected = false;
    this.peers = new Map(); // replicaId -> { lastSeen, players }
  }

  async connect() {
    if (this.connected) return this;
    if (this.broker) {
      this.unsubscribeBroker = this.broker.subscribe(this.channel, (raw) => {
        this.#handleRawMessage(raw);
      });
      this.connected = true;
      return this;
    }
    if (this.redisUrl) {
      const redisModule = await import('redis');
      const createClient = redisModule.createClient || redisModule.default?.createClient;
      this.pubClient = createClient({ url: this.redisUrl });
      this.subClient = this.pubClient.duplicate();
      await Promise.all([this.pubClient.connect(), this.subClient.connect()]);
      await this.subClient.subscribe(this.channel, (raw) => {
        this.#handleRawMessage(raw);
      });
      this.connected = true;
    }
    return this;
  }

  #handleRawMessage(raw) {
    let packet;
    try {
      packet = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      return;
    }
    if (!packet || packet.replicaId === this.replicaId || typeof packet.type !== 'string') return;
    this.peers.set(packet.replicaId, {
      lastSeen: packet.at || Date.now(),
      ...(this.peers.get(packet.replicaId) || {})
    });
    const list = this.handlers.get(packet.type);
    if (list) {
      for (const fn of list) {
        try {
          fn(packet.payload, packet);
        } catch {
          // Ignore handler errors so cluster bus stays resilient
        }
      }
    }
  }

  on(type, handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }

  publish(type, payload) {
    const packet = JSON.stringify({
      replicaId: this.replicaId,
      type,
      payload,
      at: Date.now()
    });
    if (this.broker) {
      this.broker.publish(this.channel, packet);
      return true;
    }
    if (this.pubClient && this.connected) {
      this.pubClient.publish(this.channel, packet).catch(() => {});
      return true;
    }
    return false;
  }

  activePeers(now = Date.now()) {
    const active = [];
    for (const [id, info] of this.peers.entries()) {
      if (now - info.lastSeen < 15000) active.push(id);
      else this.peers.delete(id);
    }
    return active;
  }

  get backend() {
    if (this.pubClient) return 'redis';
    if (this.broker) return 'memory-cluster';
    return 'standalone';
  }

  async close() {
    if (this.unsubscribeBroker) {
      this.unsubscribeBroker();
      this.unsubscribeBroker = null;
    }
    if (this.subClient) {
      await this.subClient.quit().catch(() => {});
      this.subClient = null;
    }
    if (this.pubClient) {
      await this.pubClient.quit().catch(() => {});
      this.pubClient = null;
    }
    this.connected = false;
  }
}
