# ThreadsIQ 貼文資料庫架構設計

> 2026-03-19 | 為 Pro 功能打基礎的資料層設計

## 核心問題

目前的 KV 存儲只能做 key-value 查詢，無法支撐：
- 跨用戶的爆款分析
- 單一用戶的 insight 趨勢追蹤
- 語意衰變偵測（需要比較不同時間點的 embedding）
- 排程發文的歷史模式分析

## 解決方案：Cloudflare D1（邊緣 SQLite）

D1 跟現有的 Pages Functions 完美整合，支援 SQL 查詢，免費額度足夠 MVP。

---

## 資料庫 Schema

### `posts` — 所有用戶的貼文（核心表）
```sql
CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,              -- LINE user ID
  threads_post_id TEXT NOT NULL,      -- Threads 原始 post ID
  text TEXT,                          -- 貼文內容
  posted_at TEXT NOT NULL,            -- Threads 上的發文時間
  media_type TEXT,                    -- TEXT_POST / IMAGE / VIDEO / CAROUSEL
  permalink TEXT,                     -- Threads 原始連結
  embedding TEXT,                     -- JSON array of 1536 floats（存起來不用重算）
  imported_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, threads_post_id)
);
CREATE INDEX idx_posts_user ON posts(user_id);
CREATE INDEX idx_posts_time ON posts(user_id, posted_at DESC);
```

### `post_insights` — insight 快照（可多次更新）
```sql
CREATE TABLE post_insights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id),
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  replies INTEGER DEFAULT 0,
  reposts INTEGER DEFAULT 0,
  quotes INTEGER DEFAULT 0,
  fetched_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_insights_post ON post_insights(post_id);
CREATE INDEX idx_insights_time ON post_insights(fetched_at DESC);
```

### `analyses` — 分析結果歷史
```sql
CREATE TABLE analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  post_count INTEGER,
  health_score REAL,
  cluster_count INTEGER,
  analysis_json TEXT,                 -- 完整分析結果 JSON
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);
CREATE INDEX idx_analyses_user ON analyses(user_id, created_at DESC);
```

### `import_jobs` — 匯入任務追蹤
```sql
CREATE TABLE import_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',      -- pending / running / completed / failed
  total_posts INTEGER DEFAULT 0,
  imported_posts INTEGER DEFAULT 0,
  started_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  error TEXT
);
```

---

## 匯入流程設計

### 進階會員（Creator）首次匯入
```
1. OAuth 授權完成 → 自動觸發全量匯入
2. 建立 import_job（status=running）
3. 分頁抓取所有貼文（Threads API 限制：每次 50 篇）
   - 每頁完成 → 更新 import_job.imported_posts
   - 前端用 polling 顯示進度條
4. 抓完貼文 → 批次取得 insights
5. 批次算 embedding（OpenAI API）
6. 全部寫入 D1
7. import_job.status = completed
```

### 後續增量更新
- 每次登入 / 每天定時：只抓上次匯入之後的新貼文
- `SELECT MAX(posted_at) FROM posts WHERE user_id = ?` → 作為起始時間
- 新貼文追加，不重複

### Pro 會員的定時 Insight 更新
- Cron job（每 6 小時）：對 Pro 用戶的近 30 天貼文重新抓 insights
- 新的 insight 快照插入 `post_insights`，不覆蓋舊的
- 這樣可以追蹤 insight 趨勢（第 1 天 vs 第 7 天 vs 第 30 天）

---

## 各功能如何使用這個資料層

| Pro 功能 | 需要的資料 | SQL 查詢方式 |
|---------|---------|------------|
| 排程發文 | 歷史發文時間 + insight | `SELECT posted_at, views FROM posts JOIN post_insights...` 分析最佳時段 |
| 語意衰變週報 | embedding 時間序列 | 比較最近 7 天 vs 前 7 天的 embedding 中心向量距離 |
| 黃金窗口偵測 | insight 時間序列 | 分析前 60 分鐘互動速率 vs 最終觸及的關係 |
| 爆文 48h 計畫 | 近期 insight 變化 | `WHERE views > threshold AND fetched_at > 48h ago` |
| 主題輪替管家 | embedding + cluster | 分析各 cluster 的 insight 表現，建議輪替順序 |
| AI 回覆建議 | 貼文 + replies | 讀取新留言，生成回覆建議 |

---

## 跨用戶大數據分析

Jason 提到的「大數據庫」概念：

```sql
-- 找出所有用戶中 views > 10000 的爆款
SELECT p.text, p.posted_at, pi.views, pi.likes, pi.replies
FROM posts p
JOIN post_insights pi ON p.id = pi.post_id
WHERE pi.views > 10000
ORDER BY pi.views DESC;

-- 分析爆款的共同特徵（文字長度、發文時間、媒體類型）
SELECT 
  AVG(LENGTH(p.text)) as avg_length,
  strftime('%H', p.posted_at) as hour,
  COUNT(*) as count
FROM posts p
JOIN post_insights pi ON p.id = pi.post_id
WHERE pi.views > 10000
GROUP BY hour
ORDER BY count DESC;
```

這些數據可以：
1. 訓練更精準的「發文前評分」模型
2. 建立「爆款模式庫」供所有用戶參考
3. 發現跨 niche 的通用觸及規律

---

## 實作優先順序

### Phase 1（現在做）
- [x] 建立 D1 database
- [x] 建立 schema（4 張表）
- [x] 改寫 import endpoint → 寫入 D1
- [x] 進度條 API（polling import_job status）
- [x] 全量匯入（不限 100 篇）

### Phase 2（Pro 功能時做）
- [ ] 增量更新（只抓新貼文）
- [ ] 定時 insight 刷新（Cron）
- [ ] 分析結果寫入 D1（取代 KV analyses）

### Phase 3（大數據）
- [ ] 跨用戶爆款查詢 API
- [ ] 爆款模式分析 dashboard
- [ ] 用累積數據改善評分模型

---

## 環境設定

wrangler.toml 新增：
```toml
[[d1_databases]]
binding = "THREADSIQ_DB"
database_name = "threadsiq"
database_id = "<建立後填入>"
```
