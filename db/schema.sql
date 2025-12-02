-- D1 schema for session-based chat with dice
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  password TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_updated INTEGER NOT NULL,
  mode TEXT NOT NULL DEFAULT 'system', -- system|quantum
  game_time_elapsed INTEGER NOT NULL DEFAULT 0,
  last_resumed_at INTEGER,
  FOREIGN KEY(owner_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS session_tokens (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  password TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  speaker_name TEXT NOT NULL DEFAULT '名無しさん',
  raw_text TEXT NOT NULL,
  rendered_text TEXT NOT NULL,
  result_json TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS quantum_numbers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  value INTEGER NOT NULL,
  consumed INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(session_id) REFERENCES sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_session_tokens_session ON session_tokens(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_session ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_quantum_session_consumed ON quantum_numbers(session_id, consumed);

-- Demo seed data
INSERT OR IGNORE INTO users (id, email, name, created_at)
VALUES ('system', 'system@localhost', 'System', strftime('%s', 'now'));

INSERT OR IGNORE INTO sessions (id, owner_id, password, created_at, last_updated, mode, game_time_elapsed, last_resumed_at)
VALUES ('0000', 'system', 'demo', strftime('%s', 'now'), strftime('%s', 'now'), 'system', 0, NULL);
