-- Each business event is queued in the same transaction as its source record.
-- Receipt of a provider message ID records acceptance, not inbox delivery.
CREATE TABLE email_outbox (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL CHECK (kind IN ('invite', 'reset', 'payment', 'maturity')),
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient       TEXT NOT NULL,
  source_id       TEXT NOT NULL,
  maturity_date   INTEGER,
  state           TEXT NOT NULL DEFAULT 'pending'
                  CHECK (state IN ('pending','sending','accepted','skipped','failed','uncertain')),
  created_at      INTEGER NOT NULL,
  available_at    INTEGER NOT NULL,
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_attempt_at INTEGER,
  completed_at    INTEGER,
  claim_id        TEXT,
  provider_id     TEXT,
  result_code     TEXT
);
CREATE INDEX email_outbox_ready ON email_outbox(state, available_at, created_at);
CREATE INDEX email_outbox_inflight ON email_outbox(state, last_attempt_at);
CREATE INDEX notes_maturity_emails ON notes(status, maturity_date);
