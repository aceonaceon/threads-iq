-- ThreadsIQ D1 Schema v1

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  threads_post_id TEXT NOT NULL UNIQUE,
  text TEXT,
  posted_at TEXT NOT NULL,
  media_type TEXT,
  permalink TEXT,
  embedding TEXT,
  imported_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_posts_user_time ON posts(user_id, posted_at DESC);

CREATE TABLE IF NOT EXISTS post_insights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  threads_post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  replies INTEGER DEFAULT 0,
  reposts INTEGER DEFAULT 0,
  quotes INTEGER DEFAULT 0,
  fetched_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_insights_post ON post_insights(threads_post_id);
CREATE INDEX IF NOT EXISTS idx_insights_user ON post_insights(user_id, fetched_at DESC);

CREATE TABLE IF NOT EXISTS import_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  phase TEXT DEFAULT 'a',
  total_fetched INTEGER DEFAULT 0,
  total_with_embedding INTEGER DEFAULT 0,
  target_posts INTEGER DEFAULT 300,
  rate_limit_paused_until TEXT,
  started_at TEXT DEFAULT (datetime('now')),
  phase_a_completed_at TEXT,
  completed_at TEXT,
  error TEXT,
  cursor TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_user ON import_jobs(user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  post_count INTEGER,
  health_score REAL,
  cluster_count INTEGER,
  analysis_json TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_analyses_user ON analyses(user_id, created_at DESC);
