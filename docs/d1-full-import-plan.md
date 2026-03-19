# ThreadsIQ D1 全量匯入實作計畫

> 2026-03-19 | Phase 1 實作規格 + Checklist

---

## 一、架構概覽

```
用戶點「連結 Threads」
    ↓
OAuth 授權完成 → 存 access_token 到 KV
    ↓
自動觸發匯入（分兩階段）
    ↓
┌─────────────────────────────────────────┐
│ 階段 A（前台可見）                        │
│ 抓最近 300 篇 / 6 個月 → 算 embedding    │
│ → 跑分析 → 顯示報告                      │
│ 進度條：使用者看到「正在匯入你的貼文...」    │
└─────────────────────────────────────────┘
    ↓（同時背景繼續）
┌─────────────────────────────────────────┐
│ 階段 B（背景靜默）                        │
│ 繼續抓剩餘的歷史貼文 → 存 D1              │
│ 使用者不知道、前端不顯示                    │
│ 尊重 Rate Limit，分批慢慢抓               │
└─────────────────────────────────────────┘
```

---

## 二、Meta Threads API Rate Limits

根據 Meta 官方文檔：
- **Application-level**: 250 calls / user / hour
- **每頁貼文**: 1 call（最多 50 篇/頁）
- **每篇 insights**: 1 call

**3000 篇的成本估算：**
- 貼文頁數：3000 / 50 = 60 calls
- Insights：3000 calls
- 總計：~3060 calls → **超過 250/hour 限制**

**解法：分批 + 延遲**
- 每批處理 40 篇（40 insight calls + 1 page call = 41 calls）
- 每批之間等 10 秒
- 每小時 ≈ 360 calls × (10s gap) = 大約 200 calls/hour（安全範圍）
- 3000 篇全部完成 ≈ 3-4 小時
- **階段 A（300 篇）** ≈ 20-25 分鐘完成

### Rate Limit 保護機制
```
每次 API call 後檢查 response header:
- X-App-Usage → JSON { call_count, total_cputime, total_time }
- 如果 call_count > 80% → 暫停 5 分鐘
- 如果收到 429 → 暫停 15 分鐘再繼續
- import_job 記錄暫停原因和恢復時間
```

---

## 三、Cloudflare D1 Schema

```sql
-- 貼文主表
CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  threads_post_id TEXT NOT NULL UNIQUE,
  text TEXT,
  posted_at TEXT NOT NULL,
  media_type TEXT,
  permalink TEXT,
  embedding TEXT,                      -- JSON array [1536 floats]
  imported_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_posts_user_time ON posts(user_id, posted_at DESC);

-- Insight 快照（可多次更新追蹤趨勢）
CREATE TABLE post_insights (
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
CREATE INDEX idx_insights_post ON post_insights(threads_post_id);
CREATE INDEX idx_insights_user ON post_insights(user_id, fetched_at DESC);

-- 匯入任務追蹤
CREATE TABLE import_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',       -- pending/phase_a/phase_b/completed/paused/failed
  phase TEXT DEFAULT 'a',              -- a=前台可見 / b=背景靜默
  total_fetched INTEGER DEFAULT 0,
  total_with_embedding INTEGER DEFAULT 0,
  target_posts INTEGER,                -- 階段 A 目標（300 or 6 months）
  rate_limit_paused_until TEXT,        -- Rate limit 暫停到什麼時候
  started_at TEXT DEFAULT (datetime('now')),
  phase_a_completed_at TEXT,
  completed_at TEXT,
  error TEXT,
  cursor TEXT                          -- Threads API pagination cursor（續傳用）
);
CREATE INDEX idx_jobs_user ON import_jobs(user_id, started_at DESC);

-- 分析結果歷史
CREATE TABLE analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  post_count INTEGER,
  health_score REAL,
  cluster_count INTEGER,
  analysis_json TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_analyses_user ON analyses(user_id, created_at DESC);
```

---

## 四、API Endpoints

### 新增
| Endpoint | Method | 功能 |
|----------|--------|------|
| `/api/import/start` | POST | 觸發匯入（OAuth 完成後自動呼叫）|
| `/api/import/status` | GET | 查詢匯入進度（前端 polling）|
| `/api/import/continue` | POST | 背景續傳（由 Cron 或 Durable Object 觸發）|
| `/api/posts/list` | GET | 從 D1 讀取用戶貼文（含 insights）|
| `/api/analysis/run` | POST | 從 D1 讀 embedding → 跑分析（不呼叫 OpenAI）|

### 修改
| Endpoint | 修改內容 |
|----------|---------|
| `/api/auth/threads/callback` | OAuth 完成後自動呼叫 `/api/import/start` |
| `/api/analyze` | 保留免費用戶的手動分析，付費用戶改用 D1 |

---

## 五、匯入流程詳細

### 階段 A：前台匯入（使用者可見）

```
1. POST /api/import/start
   → 建立 import_job (status=phase_a)
   → 開始抓貼文

2. 分頁抓取貼文（每頁 50 篇）
   → 每頁存入 D1 posts 表
   → 抓 insights 存入 post_insights 表
   → 更新 import_job.total_fetched

3. 達到 300 篇 或 6 個月 → 階段 A 完成
   → 批次算 embedding（OpenAI batch API，一次最多 2048 篇）
   → 存入 posts.embedding

4. import_job.phase_a_completed_at = now()
   → 前端收到通知：「匯入完成！可以開始分析」
   → 自動觸發第一次分析

5. import_job.status = 'phase_b'
   → 背景繼續（使用者不知道）
```

### 階段 B：背景靜默匯入

```
1. 從 import_job.cursor 繼續翻頁
2. 每批 40 篇 + 10 秒延遲
3. 檢查 Rate Limit header
4. 如果被限速 → import_job.status = 'paused'
5. Cron 每 15 分鐘檢查 paused 的 job → 恢復繼續
6. 所有頁面都抓完 → import_job.status = 'completed'
7. 批次算 embedding（新抓的貼文）
```

### Cron Job：背景任務管理器
```
每 15 分鐘執行一次：
1. 查詢 status='phase_b' 或 'paused' 的 import_jobs
2. 如果 rate_limit_paused_until < now() → 恢復繼續
3. 每次 Cron 執行最多處理 5 分鐘（避免 Worker timeout）
4. 處理完一批 → 更新 cursor → 等下次 Cron 繼續
```

---

## 六、前端進度顯示

### 匯入進度條（Creator/Pro 用戶看到的）
```
正在匯入你的 Threads 貼文...
[████████░░░░░░░░] 156 / 300 篇

→ 匯入完成！已取得 300 篇貼文
  → [開始分析] 按鈕
```

### Polling 邏輯
```javascript
// 每 3 秒 poll 一次
const { status, total_fetched, target_posts, phase_a_completed } = 
  await fetch('/api/import/status');

if (phase_a_completed) {
  // 顯示「匯入完成」+ 分析按鈕
} else {
  // 更新進度條
}
// 不顯示 phase_b 的任何資訊
```

---

## 七、Embedding 批次處理

```
OpenAI text-embedding-3-small:
- 最大 batch size: 2048 texts
- 300 篇 = 1 次 API call（≈ NT$0.03）
- 3000 篇 = 2 次 API call（≈ NT$0.2）

流程：
1. 從 D1 撈出 embedding IS NULL 的貼文
2. 過濾掉 text 為空的
3. 分批 2048 篇送 OpenAI
4. 回傳的 embedding 寫回 D1 posts.embedding
```

---

## 八、分析模式（按等級）

| 模式 | 觸發 | 資料來源 | 可見 cluster |
|------|------|---------|-------------|
| 免費 | 手動貼 30 篇 | 即時算 embedding | 全部 |
| Creator | 從 D1 讀 | 最近 300 篇 / 6 個月 | Top 7 + 其他 |
| Pro | 從 D1 讀 | 全部 | Top 7 + 其他 + 時間軸 |

---

## 九、Checklist

### 基礎設施
- [ ] 建立 Cloudflare D1 database（`wrangler d1 create threadsiq`）
- [ ] 在 wrangler.toml 加入 D1 binding
- [ ] 執行 schema migration（建表）

### 後端 API
- [ ] `/api/import/start` — 觸發匯入
- [ ] `/api/import/status` — 進度查詢
- [ ] `/api/import/continue` — 背景續傳
- [ ] Rate limit 保護（檢查 X-App-Usage header）
- [ ] Embedding 批次計算 + 寫入 D1
- [ ] `/api/posts/list` — 從 D1 讀貼文
- [ ] `/api/analysis/run` — 從 D1 embedding 跑分析

### 前端
- [ ] 匯入進度條組件
- [ ] Polling 邏輯（3 秒一次）
- [ ] OAuth 完成後自動觸發匯入
- [ ] 分析頁面：付費用戶顯示「從 Threads 匯入」而非手動輸入

### Cron
- [ ] 背景任務管理器（每 15 分鐘檢查 paused jobs）

### 驗證計畫
- [ ] 測試 1：OAuth → 自動匯入 → 進度條正常顯示
- [ ] 測試 2：300 篇匯入完成 → 自動分析 → 報告正常
- [ ] 測試 3：Rate limit 模擬 → 暫停 + 恢復
- [ ] 測試 4：登出再登入 → 不重複匯入（檢查已有 import_job）
- [ ] 測試 5：新貼文增量更新（只抓 D1 裡沒有的）
- [ ] 測試 6：Creator 只看到 300 篇 / 6 個月範圍
- [ ] 測試 7：Pro 看到全部歷史

---

## 十、注意事項

- **使用者不知道全量匯入**：前端只顯示「300 篇 / 6 個月」，背景靜默
- **隱私考量**：D1 資料僅用於分析，不公開展示其他用戶的貼文內容
- **成本安全閥**：如果某用戶貼文超過 10,000 篇，限制 embedding 到最近 5,000 篇
- **Meta Rate Limit**：保守策略，寧可慢不要被封 token
