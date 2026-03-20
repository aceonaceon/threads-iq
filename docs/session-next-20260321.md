# Next Session 準備指南

> 這個檔案是為了讓下一個 session 可以快速接手 ThreadsIQ 開發。
> 請先讀取以下檔案再開始工作。

---

## 📋 這個 Session (2026-03-20) 完成的事

### 1. Engagement Stats Bug 修復
- **問題**：API 有回傳 engagement data，但前端沒顯示
- **根因**：儲存時沒傳 `engagementStats` 欄位
- **修復檔案**：
  - `src/pages/Analyze.tsx` - 加入 `engagementStats: serverResult.engagementStats`
  - `src/lib/api.ts` - 新增 `EngagementStats` interface
  - `src/components/AnalysisReport.tsx` - 顯示 engagement 區塊
  - `src/components/HealthScore.tsx` - 分數解讀指南

### 2. GPT Prompt 更新
- 強調只給 Threads 平台適用的建議
- Threads 不支援問答/直播/投票等功能

### 3. 演算法變更報告
- 寫在 `docs/session-20260320-algo-changes.md`
- 結論：Health Score 目前**沒有**包含 Engagement

---

## ⏳ 未完成（繼續開發）

### 高優先

| 功能 | 說明 | 待確認 |
|------|------|--------|
| **Health Score 加入 Engagement？** | Jason 還沒決定要不要把 engagement 加入公式 | 需 Jason 確認方向 |
| Pro 功能開發 | 排程發文、AI 回覆建議、黃金窗口偵測、主題輪替、語意衰變週報 | 排程中 |

### 中優先

| 功能 | 說明 | 狀態 |
|------|------|------|
| Posts dashboard + 增量 refresh | Sub-agent 在跑 | 進行中 |
| Semantic Neighbor 功能 | Spec 已有 (`docs/d1-full-import-plan.md`) | 待開發 |

### 低優先

| 功能 | 說明 |
|------|------|
| Stripe 支付串接 | 尚未開始 |

---

## 🔗 需先讀取的檔案

請依序讀取：

1. **`projects/threads-iq/docs/session-20260320-algo-changes.md`**
   - 演算法變更詳細報告
   - Health Score 現狀說明

2. **`projects/threads-iq/docs/threadsiq-paid-features-spec.md`**
   - Pro 功能完整清單
   - 開發批次規劃

3. **`memory/2026-03-20.md`**
   - 當日工作紀錄
   - Engagement bug fix 詳細紀錄

4. **`docs/threadsiq-mvp-plan.md`**
   - MVP 總體規劃

---

## 📊 現況速查

### 最新 Deploy URL
```
https://8d90e348.threads-iq.pages.dev
```

### Health Score 現狀
- **公式**：Concentration(30%) + Coverage(30%) + Coherence(25%) + Focus(15%)
- **Engagement**：有傳給 GPT 生成建議，但沒有加入分數公式

### Database
- D1: `threadsiq`
- KV: `THREADSIQ_STORE`
- Jason 的 posts: 300 篇
- engagementRate: 3.93%
- totalViews: 93,253

---

## 💡 對話重點（Jason 說的）

> 「Engagement 的參數有沒有在演算法裡面實現？」
> → 沒有，是分開的

> 「GPT 建議要是 Threads 限定，Threads 做不到的就不要建議」
> → 已加入 prompt

---

## 🚀 下一個 Session 建議順序

1. 讀取以上 4 個檔案
2. 問 Jason：Health Score 要不要加入 Engagement？
3. 如果要 → 改 `src/lib/analysis.ts`
4. 如果不要 → 繼續 Pro 功能開發
5. 確認 Engagement Stats 顯示是否正常

---

*最後更新：2026-03-20 10:50 GMT+8*
