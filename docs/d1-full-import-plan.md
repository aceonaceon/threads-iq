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

## 延伸功能：語義鄰居（Semantic Neighbor）

### 功能描述
- 使用者可以輸入另一個帳號的貼文（手動複製貼上，就像分析自己的貼文一樣）
- 系統比對「你的語義輪廓」vs「對方的貼文內容」
- 輸出「語義相似度分數」+ 建議互動策略

### 業務邏輯
- **資料來源**：自己 = D1 裡的 embedding（按 plan 限制），對方 = 使用者手動輸入的 30 篇貼文
- **比對基準**：永遠用 D1 裡最新的 embedding，不是綁定某次「分析」
- **顯示位置**：Creator 方案的功能頁面

### 評分演算法
```
分數 = 
  40% × Centroid Cosine Similarity（你們的平均內容多像）
  40% × 平均最近鄰居相似度（對方多少篇跟你像）
  20% × 主題重疊權重（對方有多少篇落在你的主要 cluster）
```

門檻：
- 80+：高度語義鄰居 → 建議深度互動
- 60-80：中等 → 可以嘗試
- 40-60：普通 → 效果一般
- <40：不同領域

### D1 Schema 擴充
```sql
CREATE TABLE semantic_neighbors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  target_handle TEXT,
  score REAL,
  overlap_clusters TEXT,
  target_posts_count INTEGER,
  checked_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_neighbors_user ON semantic_neighbors(user_id, checked_at DESC);
```

### API Endpoints
| Endpoint | Method | 功能 |
|----------|--------|------|
| `/api/neighbors/analyze` | POST | 輸入對方的貼文 → 比對 → 存結果 |
| `/api/neighbors/list` | GET | 列出已儲存的鄰居比對結果 |

### UI Flow
1. 使用者點「語義鄰居分析」
2. 輸入對方的 @username（用於備註）
3. 貼上對方的 30 篇貼文
4. 系統比對 → 顯示分數 + 建議
5. 結果存進 D1，供後續參照

### 重要限制（2026-03-19 Jason 確認）
- **Meta API 無法抓取他人的公開貼文**
- 必須讓使用者手動複製貼上對方的貼文（跟分析自己時的手動輸入一樣）

---

## 延伸功能：管理後台匯入監控（規劃中，暫不實作）

### 需求
Jason 需要在 Admin Dashboard 看到每個用戶的資料匯入狀況，包含：
- Phase A（前台 300 篇）進度
- Phase B（背景全量）進度
- 總匯入篇數 / 預估總篇數

### Meta API 限制
- Threads API **沒有**直接取得用戶總貼文數的端點
- 只能持續翻頁直到沒有更多資料（`paging.next` 為空）
- 所以「預估總篇數」在 Phase B 完成前是未知的

### Admin Dashboard 設計

#### 匯入狀態列表（新增到 /admin 頁面）
```
| 用戶 | Phase | 狀態 | 已匯入 | 有 Embedding | 最早貼文 | 最新貼文 | 上次更新 |
|------|-------|------|--------|-------------|---------|---------|---------|
| 留學顧問Jason | B | 進行中 | 1,247 | 300 | 2024-01-15 | 2026-03-19 | 2 分鐘前 |
| 夏ʕ •ᴥ•ʔ | A | 完成 | 156 | 156 | 2025-08-03 | 2026-03-18 | 1 小時前 |
| 某用戶 | B | 暫停(限速) | 892 | 300 | 2024-06-01 | 2026-03-17 | 15 分鐘前 |
```

#### 需要的 API
| Endpoint | 功能 |
|----------|------|
| `GET /api/admin/imports` | 列出所有用戶的匯入狀態（join import_jobs + posts count） |

#### SQL 查詢
```sql
SELECT 
  ij.user_id,
  ij.status,
  ij.phase,
  ij.total_fetched,
  ij.phase_a_completed_at,
  ij.completed_at,
  ij.rate_limit_paused_until,
  ij.started_at,
  (SELECT COUNT(*) FROM posts p WHERE p.user_id = ij.user_id) as total_posts,
  (SELECT COUNT(*) FROM posts p WHERE p.user_id = ij.user_id AND p.embedding IS NOT NULL) as posts_with_embedding,
  (SELECT MIN(posted_at) FROM posts p WHERE p.user_id = ij.user_id) as oldest_post,
  (SELECT MAX(posted_at) FROM posts p WHERE p.user_id = ij.user_id) as newest_post
FROM import_jobs ij
WHERE ij.id IN (
  SELECT MAX(id) FROM import_jobs GROUP BY user_id
)
ORDER BY ij.started_at DESC;
```

#### 進度顯示邏輯
- Phase A：顯示 `已匯入 / 300` + 進度條
- Phase B：顯示 `已匯入 X 篇（持續中...）`（無法顯示百分比，因為不知道總數）
- Phase B 完成：顯示 `全部匯入完成：X 篇`
- 暫停中：顯示 `暫停（限速），預計 HH:MM 恢復`

---

## 十、注意事項

- **使用者不知道全量匯入**：前端只顯示「300 篇 / 6 個月」，背景靜默
- **隱私考量**：D1 資料僅用於分析，不公開展示其他用戶的貼文內容
- **成本安全閥**：如果某用戶貼文超過 10,000 篇，限制 embedding 到最近 5,000 篇
- **Meta Rate Limit**：保守策略，寧可慢不要被封 token
