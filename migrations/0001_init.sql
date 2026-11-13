CREATE TABLE users (
  fid INTEGER PRIMARY KEY,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  pfp_url TEXT,
  demo INTEGER NOT NULL DEFAULT 0,
  avatar TEXT NOT NULL DEFAULT '{}',
  degen INTEGER NOT NULL DEFAULT 250,
  xp INTEGER NOT NULL DEFAULT 0,
  energy REAL NOT NULL DEFAULT 85,
  hunger REAL NOT NULL DEFAULT 80,
  fun REAL NOT NULL DEFAULT 70,
  social REAL NOT NULL DEFAULT 60,
  needs_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  fid INTEGER NOT NULL REFERENCES users(fid) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_fid ON sessions(fid);

CREATE TABLE nonces (
  nonce TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

CREATE TABLE homes (
  fid INTEGER PRIMARY KEY REFERENCES users(fid) ON DELETE CASCADE,
  items TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL
);

CREATE TABLE ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fid INTEGER NOT NULL,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX ledger_fid_at ON ledger(fid, at);

CREATE TABLE game_runs (
  id TEXT PRIMARY KEY,
  fid INTEGER NOT NULL,
  game TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  score INTEGER,
  reward INTEGER
);
CREATE INDEX game_runs_board ON game_runs(game, score DESC);
CREATE INDEX game_runs_fid ON game_runs(fid, started_at);
