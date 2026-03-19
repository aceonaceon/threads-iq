# 貼文管理儀表板 + 增量更新 Spec

## 需求摘要

### 問題
用戶第一次匯入 300 篇後，過幾天又發了新文章，目前沒有方法更新。

### 解決方案
1. **增量更新**：「🔄 更新最新貼文」按鈕，只抓比 DB 最新那篇更新的貼文
2. **貼文儀表板**：表格顯示所有匯入的貼文 + insight 數據
3. **重新分析**：更新完後一鍵重新跑語意分析

---

## 一、增量更新邏輯

### API：`POST /api/import/refresh`

**流程：**
1. 查 D1 該用戶最新一篇貼文的 `posted_at`
2. 從 Threads API 抓 `since` 該時間之後的新貼文
3. 插入新貼文 + 抓 insights + 算 embedding
4. 更新 import_job 紀錄

**注意：**
- Threads API 沒有 `since` 參數，只能從最新往回翻頁
- 所以邏輯是：持續翻頁直到碰到已存在的 `threads_post_id`（ON CONFLICT DO NOTHING），就停止
- 同時更新已有貼文的 insights（因為舊文的數據會變）

**回傳：**
```json
{
  "new_posts": 12,
  "updated_insights": 300,
  "total_posts": 312,
  "new_embeddings": 12
}
```

### 前端觸發
- 「更新最新貼文」按鈕在貼文儀表板頂部
- 點擊後顯示 spinner + 「正在同步最新貼文...」
- 完成後顯示「新增 X 篇貼文，已更新 Y 筆成效數據」
- 自動刷新表格

---

## 二、貼文儀表板頁面

### 路由：`/posts`（新頁面）

### 頂部區塊
```
┌─────────────────────────────────────────┐
│  📊 你的 Threads 貼文  [🔄 更新最新貼文]  │
│  共 312 篇 ・最新：3/19 ・最早：9/15     │
└─────────────────────────────────────────┘
```

### 表格欄位
| 欄位 | 排序 | 說明 |
|------|------|------|
| 內容 | ✗ | 前 80 字預覽 + 展開/收合 |
| 發布時間 | ✓（預設↓） | YYYY/MM/DD HH:mm |
| 觀看數 | ✓ | views |
| 愛心 | ✓ | likes |
| 回覆 | ✓ | replies |
| 轉發 | ✓ | reposts |
| 互動率 | ✓ | (likes + replies + reposts) / views × 100% |
| 連結 | ✗ | 🔗 icon → permalink |

### 排序
- 預設：發布時間（最新在前）
- 點欄位標題切換升降序
- 當前排序欄位顯示 ▲ 或 ▼

### 方案限制
| Plan | 顯示筆數 | 排序 | 更新 |
|------|---------|------|------|
| Free | 30 篇 | ✓ | ✗（CTA 升級） |
| Creator | 300 篇 | ✓ | ✓ |
| Pro | 全部 | ✓ | ✓ |

### Free 用戶 CTA
表格底部（30 篇之後）：
```
┌──────────────────────────────────────┐
│  🔒 升級 Creator 方案解鎖 300 篇完整  │
│  貼文數據 + 成效排序 + 定期更新        │
│        [ 立即升級 →]                  │
└──────────────────────────────────────┘
```

### 重新分析 CTA
更新完成後，表格上方出現：
```
┌──────────────────────────────────────┐
│  ✨ 你有 12 篇新貼文！               │
│  [ 重新分析語意主題 →]               │
└──────────────────────────────────────┘
```
點擊後跳轉到 `/analyze`，自動觸發 `handleAnalyzeFromImport()`

---

## 三、導航

### Navbar 新增
在現有 nav items 中加入「我的貼文」連結（/posts），排在「分析」和「歷史」之間。

### 條件顯示
- 未登入 → 不顯示
- 登入但未連結 Threads → 不顯示
- 已連結 Threads → 顯示

---

## 四、API 詳細設計

### `GET /api/posts/list`（已有，需擴充）
現有 endpoint，已經回傳 posts + insights。加入：
- `sortBy` 參數：`posted_at`（預設）、`views`、`likes`、`replies`、`reposts`、`engagement`
- `sortOrder` 參數：`desc`（預設）、`asc`
- `page` + `pageSize` 分頁（前端表格用）

### `POST /api/import/refresh`（新建）
增量更新邏輯（見上方）

---

## 五、實作優先級

### Phase 1（跟 Admin Monitor 一起做）
- [ ] `POST /api/import/refresh` 增量更新 API
- [ ] `/posts` 貼文儀表板頁面（表格 + 排序）
- [ ] Navbar 加入「我的貼文」

### Phase 2（後續）
- [ ] 互動率計算 + 排序
- [ ] 分頁（大量貼文時）
- [ ] insights 歷史趨勢（同一篇文的 views 隨時間變化）

---

## 六、注意事項

- Insights 更新也要考慮 API rate limit（一次更新 300 篇的 insights = 300 次 API call）
- 可以只更新最近 7 天的舊文 insights（更久的數據變動很小）
- `import/refresh` 也需要 25 秒 timeout safety，未完成的交給 `/api/import/continue`
