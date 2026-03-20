-- Migration: Add threads_user_id column to posts table
-- This enables supporting multiple Threads accounts per LINE user

ALTER TABLE posts ADD COLUMN threads_user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_posts_user_threads ON posts(user_id, threads_user_id, posted_at DESC);