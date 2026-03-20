# 2026-03-20 Algorithm Changes Report

## Jason 問：Health Score 是否包含 Engagement？

**結論：沒有。** Health Score 純粹從 embedding 計算，與 engagement 無關。

### 現有 Health Score 公式 (`src/lib/analysis.ts`)

```
Health Score = Concentration(30%) + Coverage(30%) + Coherence(25%) + Focus(15%)
```

| 項目 | 權重 | 計算方式 |
|------|------|---------|
| Concentration | 30% | 最大叢集佔比 |
| Coverage | 30% | 有叢集的非雜訊貼文比例 |
| Coherence | 25% | 叢集內平均 cosine similarity |
| Focus | 15% | 叢集數量 penalty（太多小叢集會被罰） |

### Engagement Data 去哪了？

Engagement 資料（totalViews, engagementRate, likes, replies 等）有正確傳給 GPT 作為**建議生成**的上下文，但**沒有**加入 Health Score 數學公式。

---

## 今日討論的演算法修正清單

### ✅ 已實現

| 項目 | 說明 | 檔案 |
|------|------|------|
| 1. Engagement Stats 傳給 GPT | 讓 GPT 生成建議時有真實數據 | `functions/api/analyze-import.ts` |
| 2. Engagement Stats 儲存 | 前端儲存 analysis 時一併存 engagementStats | `src/pages/Analyze.tsx` |
| 3. Engagement Stats 顯示 | Report 頁面顯示 engagement 區塊 | `src/components/AnalysisReport.tsx` |
| 4. Health Score 解讀指南 | 分數區間說明 + 提升方向 | `src/components/HealthScore.tsx` |
| 5. GPT Prompt Threads 限定 | 提醒 GPT 只給 Threads 可用的建議 | `functions/api/analyze-import.ts` |

### ❌ 未實現

| 項目 | 說明 | 狀態 |
|------|------|------|
| Health Score 包含 Engagement | 把 engagementRate 加入 health score 公式 | **未做** |
| 排程發文 | Pro 功能，需新 table | 未開始 |
| AI 回覆建議 | Pro 功能 | 未開始 |
| 黃金窗口偵測 | Pro 功能 | 未開始 |

---

## 下一步

如果要修改 Health Score 公式加入 Engagement，需要：
1. 決定權重（例如：embedding 70% + engagement 30%）
2. 決定用哪個 engagement 指標（overall engagementRate？byCluster？byFormat？）
3. 實作到 `src/lib/analysis.ts` 的 `calculateHealthScore` 函數

請 Jason 確認是否要現在做這個修改。
