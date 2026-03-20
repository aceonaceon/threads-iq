-- Migration 0003: Deduplicate post_insights and add unique constraint
-- This migration removes duplicate insights, keeping only the latest one per (user_id, threads_post_id)

-- Step 1: Remove duplicates, keeping the row with the highest id for each (user_id, threads_post_id)
DELETE FROM post_insights
WHERE id NOT IN (
  SELECT MAX(id)
  FROM post_insights
  GROUP BY user_id, threads_post_id
);

-- Step 2: Create unique index to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_insights_unique ON post_insights(user_id, threads_post_id);

-- Step 3: Drop the old non-unique index if it exists (it was created on threads_post_id only)
DROP INDEX IF EXISTS idx_insights_post;
