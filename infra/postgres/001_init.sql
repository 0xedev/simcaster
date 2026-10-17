-- Simcaster proposed production Postgres migration (not yet wired to runtime).
-- Do not switch to multi-instance traffic until the store implementation uses this schema.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farcaster_fid bigint NOT NULL UNIQUE CHECK (farcaster_fid > 0),
  username text,
  display_name text NOT NULL,
  avatar_url text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE avatars (
  account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  color text NOT NULL CHECK(color IN ('violet','citrus','coral','mint','sky')),
  outfit text NOT NULL CHECK(outfit IN ('street','casual','sport','formal')),
  hair text NOT NULL CHECK(hair IN ('short','curls','buzz','long')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token_sha256 char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessions_user ON sessions(account_id,expires_at);
CREATE TABLE auth_challenges (
  nonce_sha256 char(64) PRIMARY KEY,
  domain text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE homes (
  account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','friends','public')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE home_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_owner_id uuid NOT NULL REFERENCES homes(account_id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('sofa','table','plant','lamp','rug','chair')),
  x smallint NOT NULL CHECK (x BETWEEN -4 AND 4),
  z smallint NOT NULL CHECK (z BETWEEN -4 AND 4),
  position smallint NOT NULL CHECK (position BETWEEN 0 AND 14),
  UNIQUE (home_owner_id,position)
);
CREATE TABLE player_blocks (
  blocker_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(blocker_id,blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE TABLE game_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_slug text NOT NULL,
  room_id text NOT NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  winner_id uuid REFERENCES accounts(id),
  status text NOT NULL CHECK (status IN ('running','completed','abandoned'))
);
CREATE TABLE match_players (
  match_id uuid NOT NULL REFERENCES game_matches(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id),
  score integer NOT NULL DEFAULT 0 CHECK(score>=0),
  PRIMARY KEY (match_id,account_id)
);
CREATE TABLE player_game_stats (
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  game_slug text NOT NULL,
  wins integer NOT NULL DEFAULT 0 CHECK(wins>=0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(account_id,game_slug)
);
CREATE TABLE abuse_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES accounts(id),
  subject_id uuid NOT NULL REFERENCES accounts(id),
  reason text NOT NULL CHECK (reason IN ('harassment','spam','cheating')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewing','resolved','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  CHECK(reporter_id<>subject_id)
);
CREATE INDEX idx_reports_queue ON abuse_reports(status,created_at);
CREATE TABLE signer_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_signer_ref_ciphertext bytea NOT NULL,
  status text NOT NULL CHECK(status IN ('pending','approved','revoked','expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
COMMIT;
