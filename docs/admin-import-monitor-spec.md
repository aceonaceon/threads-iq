# Admin Import Monitor + Data Reset Spec

## 目標
1. 管理後台新增「匯入監控」區塊，顯示每個用戶的完整匯入狀態
2. 新增「清除用戶資料」API，讓 admin 可以重置特定用戶的 D1 資料
3. 確保 Phase A（前端 300 篇）和 Phase B（背景全量）互不干擾

---

## 一、新增 API

### 1. `GET /api/admin/imports` — 列出所有用戶匯入狀態

**鑒權**：同 admin/stats.ts，驗證 JWT + ADMIN_USER_ID

**回傳**：
```json
{
  "imports": [
    {
      "user_id": "Ua98ecd...",
      "display_name": "留學顧問Jason",
      "status": "phase_b",
      "phase": "b",
      "total_fetched": 998,
      "target_posts": 300,
      "total_posts_in_db": 998,
      "total_with_embedding": 298,
      "earliest_post": "2024-01-15T...",
      "latest_post": "2026-03-19T...",
      "phase_a_completed_at": "2026-03-19T07:31:17",
      "completed_at": null,
      "started_at": "2026-03-19T07:20:00",
      "rate_limit_paused_until": null
    }
  ]
}
```

**SQL**：
```sql
SELECT 
  ij.user_id,
  ij.status,
  ij.phase,
  ij.total_fetched,
  ij.target_posts,
  ij.phase_a_completed_at,
  ij.completed_at,
  ij.started_at,
  ij.rate_limit_paused_until,
  (SELECT COUNT(*) FROM posts p WHERE p.user_id = ij.user_id) as total_posts_in_db,
  (SELECT COUNT(*) FROM posts p WHERE p.user_id = ij.user_id AND p.embedding IS NOT NULL) as total_with_embedding,
  (SELECT MIN(posted_at) FROM posts p WHERE p.user_id = ij.user_id) as earliest_post,
  (SELECT MAX(posted_at) FROM posts p WHERE p.user_id = ij.user_id) as latest_post
FROM import_jobs ij
WHERE ij.id IN (
  SELECT MAX(id) FROM import_jobs GROUP BY user_id
)
ORDER BY ij.started_at DESC;
```

需要從 KV 讀 display_name：遍歷 imports 結果，用 `user_id` 去 KV 取 `user:{user_id}` 的 `displayName`。

### 2. `DELETE /api/admin/imports/[id]` — 清除特定用戶的匯入資料

**鑒權**：同上

**參數**：`id` = LINE user ID

**動作**：
```sql
DELETE FROM post_insights WHERE user_id = ?;
DELETE FROM posts WHERE user_id = ?;
DELETE FROM import_jobs WHERE user_id = ?;
```

**回傳**：
```json
{
  "success": true,
  "deleted": {
    "posts": 998,
    "insights": 998,
    "import_jobs": 1
  }
}
```

---

## 二、Admin Dashboard UI 修改

在 `Admin.tsx` 現有的用戶列表**下方**，新增「匯入監控」區塊：

### 表格欄位
| 欄位 | 說明 |
|------|------|
| 用戶 | display_name（從 KV） |
| 狀態 | Phase A / Phase B / 完成 / 暫停 / 失敗 |
| 已匯入 | total_posts_in_db 篇 |
| Embedding | total_with_embedding / total_posts_in_db |
| 日期範圍 | earliest ~ latest |
| 開始時間 | started_at |
| 操作 | [清除資料] 按鈕 |

### 狀態 Badge 顏色
- `phase_a`：藍色（匯入中）
- `phase_b`：紫色（背景匯入）
- `completed`：綠色
- `paused`：黃色
- `failed`：紅色

### 清除資料按鈕
- 點擊後彈出確認對話框：「確定要清除 {display_name} 的所有匯入資料嗎？此操作不可逆。」
- 確認後呼叫 `DELETE /api/admin/imports/{userId}`
- 成功後刷新列表

---

## 三、實作細節

### 檔案清單
| 檔案 | 動作 |
|------|------|
| `functions/api/admin/imports.ts` | 新建 — GET 列出所有匯入狀態 |
| `functions/api/admin/imports/[id].ts` | 新建 — DELETE 清除用戶資料 |
| `src/pages/Admin.tsx` | 修改 — 新增匯入監控區塊 |

### 鑒權模式
複製 `admin/stats.ts` 的鑒權邏輯（`base64Decode` + `verifyToken` + `ADMIN_USER_ID` 比對）。

### Env bindings 需要
- `THREADSIQ_STORE`（KV）
- `THREADSIQ_DB`（D1）
- `LINE_CHANNEL_SECRET`
- `ADMIN_USER_ID`

### 注意
- admin endpoints 需要在 Env interface 加入 `THREADSIQ_DB: D1Database`
- D1 binding 名稱必須與 `wrangler.toml` 一致
- 所有 admin API 回傳都要加 CORS headers

---

## 三-B、Workers Paid 升級後的改進

升級到 Workers Paid ($5/月) 後可以做的改進：
- Subrequest 1,000：匯入時可以同時抓 insights（不用跳過）
- Cron Trigger：每 5 分鐘驅動 Phase B + embedding 計算
- 未來：排程發文、自動更新、insights 刷新

---

## 四、測試計畫

### Pre-test: 清除 Jason 的資料
1. 用 admin API 或直接 D1 清除 Jason (Ua98ecd52424d5d82c0091d52bb9afce4) 的資料
2. 確認 D1 中該用戶的 posts / post_insights / import_jobs 全部清空

### Test 1: 重新匯入 + Admin 監控
1. Jason 在前台點「開始匯入」
2. 同時在 /admin 頁面觀察匯入進度
3. 確認 Phase A 顯示 X/300，不會超過 300
4. 確認 Phase A 完成後自動進入 embedding 計算
5. 確認 embedding 計算完成後顯示「匯入完成：N 篇」
6. 確認 Admin 頁面能看到用戶的匯入狀態即時更新

### Test 2: 換頁恢復
1. 匯入進行中時跳到其他頁面
2. 回到 /analyze 頁面
3. 確認進度條恢復正確狀態，不顯示「連接 Threads」按鈕

### Test 3: Admin 清除資料
1. 在 /admin 點擊某用戶的「清除資料」
2. 確認彈出確認框
3. 確認刪除後列表刷新
4. 確認該用戶回到 /analyze 看到初始匯入狀態

### Test 4: Phase A vs Phase B 互不干擾
1. Phase A 完成 + embedding 完成後，用戶可以正常分析
2. Phase B 在背景繼續抓更多貼文
3. 前台不受 Phase B 影響
