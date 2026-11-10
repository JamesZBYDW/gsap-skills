-- ACG Investor Portal — D1 (SQLite) schema.
--
-- Conventions:
--   * ids are random UUIDs (TEXT).
--   * timestamps and calendar dates are INTEGER milliseconds since the Unix
--     epoch (UTC); calendar dates are stored as UTC midnight.
--   * money is INTEGER cents; rates are INTEGER basis points (1800 = 18.00%).
--   * booleans are INTEGER 0/1; enums are TEXT with CHECK constraints.
-- D1 enforces foreign keys.

CREATE TABLE users (
  id                    TEXT PRIMARY KEY,
  role                  TEXT NOT NULL CHECK (role IN ('INVESTOR', 'TEAM')),
  name                  TEXT NOT NULL,
  email                 TEXT NOT NULL UNIQUE,
  password_hash         TEXT NOT NULL,
  phone                 TEXT,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_login_attempts >= 0),
  locked_until          INTEGER,
  totp_secret           TEXT,
  totp_enabled          INTEGER NOT NULL DEFAULT 0 CHECK (totp_enabled IN (0, 1)),
  must_change_password  INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1)),
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);

CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,
  token_hash  TEXT NOT NULL UNIQUE,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  ip          TEXT,
  user_agent  TEXT
);
CREATE INDEX sessions_user_id ON sessions (user_id);
CREATE INDEX sessions_expires_at ON sessions (expires_at);

-- Scaffolding for an emailed password-reset flow (not yet exposed).
CREATE TABLE password_resets (
  id          TEXT PRIMARY KEY,
  token_hash  TEXT NOT NULL UNIQUE,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at  INTEGER NOT NULL,
  used_at     INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE INDEX password_resets_user_id ON password_resets (user_id);

CREATE TABLE investors (
  id          TEXT PRIMARY KEY,
  legal_name  TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('INDIVIDUAL', 'ENTITY')),
  email       TEXT NOT NULL,
  phone       TEXT,
  -- PENDING is reserved (no self-registration); DECLINED is kept for parity.
  state       TEXT NOT NULL CHECK (state IN ('PENDING', 'AWAITING', 'ACTIVE', 'DECLINED')),
  user_id     TEXT UNIQUE REFERENCES users (id) ON DELETE SET NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX investors_state ON investors (state);
CREATE INDEX investors_email ON investors (email);

CREATE TABLE notes (
  id                       TEXT PRIMARY KEY,
  investor_id              TEXT NOT NULL UNIQUE REFERENCES investors (id) ON DELETE CASCADE,
  principal_cents          INTEGER NOT NULL CHECK (principal_cents >= 0),
  rate_bps                 INTEGER NOT NULL CHECK (rate_bps >= 0),
  term_months              INTEGER NOT NULL CHECK (term_months > 0),
  monthly_amount_cents     INTEGER NOT NULL CHECK (monthly_amount_cents >= 0),
  wire_date                INTEGER,
  first_distribution_date  INTEGER,
  maturity_date            INTEGER,
  distribution_day         INTEGER NOT NULL DEFAULT 1,
  status                   TEXT NOT NULL DEFAULT 'AWAITING' CHECK (status IN ('AWAITING', 'ACTIVE', 'MATURED', 'REDEEMED')),
  created_at               INTEGER NOT NULL,
  updated_at               INTEGER NOT NULL
);

CREATE TABLE distributions (
  id            TEXT PRIMARY KEY,
  note_id       TEXT NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
  idx           INTEGER NOT NULL CHECK (idx >= 1),
  due_date      INTEGER NOT NULL,
  amount_cents  INTEGER NOT NULL CHECK (amount_cents >= 0),
  paid_date     INTEGER,
  reference     TEXT,
  UNIQUE (note_id, idx)
);
CREATE INDEX distributions_note_id ON distributions (note_id);

CREATE TABLE banking_details (
  id           TEXT PRIMARY KEY,
  investor_id  TEXT NOT NULL UNIQUE REFERENCES investors (id) ON DELETE CASCADE,
  bank_name    TEXT NOT NULL,
  last4        TEXT NOT NULL CHECK (length(last4) = 4 AND last4 NOT GLOB '*[^0-9]*'),
  method       TEXT NOT NULL DEFAULT 'ACH · monthly',
  updated_at   INTEGER NOT NULL
);

CREATE TABLE notif_prefs (
  id                   TEXT PRIMARY KEY,
  investor_id          TEXT NOT NULL UNIQUE REFERENCES investors (id) ON DELETE CASCADE,
  distribution_posted  INTEGER NOT NULL DEFAULT 1 CHECK (distribution_posted IN (0, 1)),
  maturity_reminder    INTEGER NOT NULL DEFAULT 1 CHECK (maturity_reminder IN (0, 1)),
  updated_at           INTEGER NOT NULL
);

CREATE TABLE documents (
  id           TEXT PRIMARY KEY,
  investor_id  TEXT NOT NULL REFERENCES investors (id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('STATEMENT', 'SUMMARY', 'TAX', 'AGREEMENT')),
  issued_date  INTEGER NOT NULL,
  storage_key  TEXT NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL
);
CREATE INDEX documents_investor_id ON documents (investor_id);

-- Append-only audit trail. actor_user_id is deliberately not a foreign key so
-- no cascade can ever rewrite a record; the triggers below reject UPDATE and
-- DELETE outright.
CREATE TABLE audit_logs (
  id             TEXT PRIMARY KEY,
  actor_user_id  TEXT,
  action         TEXT NOT NULL,
  target_type    TEXT,
  target_id      TEXT,
  metadata       TEXT CHECK (metadata IS NULL OR json_valid(metadata)),
  ip             TEXT,
  created_at     INTEGER NOT NULL
);
CREATE INDEX audit_logs_actor_user_id ON audit_logs (actor_user_id);
CREATE INDEX audit_logs_action ON audit_logs (action);
CREATE INDEX audit_logs_created_at ON audit_logs (created_at);

CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs is append-only');
END;

CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs is append-only');
END;

-- Shared fixed-window counters (login throttling), updated atomically with a
-- single upsert so every Worker isolate sees the same count.
CREATE TABLE rate_limits (
  key           TEXT PRIMARY KEY,
  window_start  INTEGER NOT NULL,
  count         INTEGER NOT NULL
);
CREATE INDEX rate_limits_window_start ON rate_limits (window_start);
