-- Two-factor authentication (authenticator-app TOTP + one-use recovery codes).
-- Self-contained: depends only on 0001_init.sql (users).
--
-- The legacy users.totp_secret / users.totp_enabled scaffolding columns are
-- not used; factors live in mfa_factors.

-- One factor per user. secret_ciphertext is AES-256-GCM (key derived from the
-- MFA_ENCRYPTION_KEY Worker secret), bound to the user id. enabled_at NULL
-- means enrollment was started but not yet verified with a code.
CREATE TABLE mfa_factors (
  user_id            TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  secret_ciphertext  TEXT NOT NULL,
  created_at         INTEGER NOT NULL,
  enabled_at         INTEGER
);

-- Recovery codes, stored only as keyed hashes (HMAC-SHA256). One use each.
CREATE TABLE mfa_recovery_codes (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  used_at     INTEGER,
  UNIQUE (user_id, code_hash)
);

-- A pending second step after a correct password. Only the SHA-256 of the
-- cookie token is stored. password_hash pins the credentials that were
-- verified: a reset or lockout in between makes completion fail.
CREATE TABLE mfa_challenges (
  id             TEXT PRIMARY KEY,
  token_hash     TEXT NOT NULL UNIQUE,
  user_id        TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  password_hash  TEXT NOT NULL,
  attempts       INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  expires_at     INTEGER NOT NULL,
  created_at     INTEGER NOT NULL,
  ip             TEXT,
  user_agent     TEXT
);
CREATE INDEX mfa_challenges_user_id ON mfa_challenges (user_id);
CREATE INDEX mfa_challenges_expires_at ON mfa_challenges (expires_at);

-- Single-use ledger. A UNIQUE violation aborts the whole batch, so a challenge,
-- a TOTP time step or a recovery code can be consumed exactly once, even under
-- concurrent requests (a recovery code is single-use through its own used_at).
-- 'op' rows are per-request markers proving a guarded step took effect inside
-- its batch.
CREATE TABLE mfa_spent (
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('challenge', 'totp', 'op')),
  value       TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, kind, value)
);
CREATE INDEX mfa_spent_created_at ON mfa_spent (created_at);

-- A password or login-email change ends anything half-finished that was tied
-- to the old credentials: an enrollment that was started but not verified, and
-- any open sign-in challenge. An ENABLED factor is kept, so a credential reset
-- can never remove the second factor.
CREATE TRIGGER mfa_invalidate_pending_on_credential_change
AFTER UPDATE OF password_hash, email ON users
WHEN OLD.password_hash IS NOT NEW.password_hash OR OLD.email IS NOT NEW.email
BEGIN
  DELETE FROM mfa_factors WHERE user_id = NEW.id AND enabled_at IS NULL;
  DELETE FROM mfa_challenges WHERE user_id = NEW.id;
END;
