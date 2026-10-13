CREATE TABLE IF NOT EXISTS password_recovery_answers (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  hint          TEXT NOT NULL,
  answer_hash   TEXT NOT NULL,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
