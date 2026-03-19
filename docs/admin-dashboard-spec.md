# ThreadsIQ 管理後台規格

> 建立日期：2026-03-19

## 概述

為 Jason（admin）建立一個管理後台頁面，可以查看所有用戶資料、修改會員等級、查看使用統計。

## Admin 身份驗證

- **Admin LINE User ID**: `Ua98ecd52424d5d82c0091d52bb9afce4`
- 判斷邏輯：JWT token 解碼後 `sub` 欄位 === admin user ID
- 非 admin 用戶訪問 `/admin` → 重導到首頁
- Admin user ID 存為 Cloudflare Pages 環境變數 `ADMIN_USER_ID`

## 前端頁面

### 路由：`/admin`

#### 1. 總覽區（Dashboard Header）
- 總用戶數
- 本週活躍用戶數（weeklyUses > 0）
- 付費用戶數
- 總分析次數（所有用戶 weeklyUses + bonusUses 已消耗量）

#### 2. 用戶列表（Users Table）
顯示所有已註冊用戶，每行包含：

| 欄位 | 來源 |
|------|------|
| 頭像 | pictureUrl |
| 顯示名稱 | displayName |
| LINE User ID | lineUserId（可複製） |
| 會員等級 | plan（free / creator / pro）— **可修改** |
| 推薦碼 | referralCode |
| 推薦人 | referredBy（顯示推薦人的 displayName） |
| 推薦數 | totalReferrals |
| 本週使用次數 | weeklyUses |
| 額外次數 | bonusUses |
| 週重置時間 | weeklyResetAt |
| 註冊時間 | createdAt |
| 最後登入 | lastLoginAt（新增欄位） |

#### 3. 會員等級修改
- 每個用戶旁邊有一個下拉選單：`free` / `creator` / `pro`
- 修改後即時寫入 KV
- 修改完顯示 toast 確認

#### 4. 付費/續費記錄（Phase 2）
- 預留 UI 區塊：「繳費記錄」
- 目前顯示「尚未串接付款系統」placeholder
- 未來串 Stripe/金流後補上

## 後端 API

### `GET /api/admin/users`
- 驗證：檢查 JWT token 的 `sub` === `ADMIN_USER_ID`
- 回傳：所有 `user:*` 的 KV 資料，組成 JSON array
- 流程：用 KV list API 列出所有 `user:` prefix 的 key → 逐一 get → 返回

### `PUT /api/admin/users/:userId`
- 驗證：同上
- Body: `{ "plan": "creator" }` 或其他可修改欄位
- 流程：讀取現有用戶資料 → merge 修改 → 寫回 KV

### `GET /api/admin/stats`
- 驗證：同上
- 回傳：聚合統計（總用戶、活躍用戶、付費用戶、總分析次數）

## 安全性

- 所有 admin API 必須驗證 JWT token
- JWT 的 `sub` 必須 === 環境變數 `ADMIN_USER_ID`
- 前端 Navbar 只有 admin 用戶才看到「管理後台」連結
- 非 admin 用戶直接訪問 /admin → 看到「無權限」然後重導

## UI 設計

- 深色主題（一致 #0a0a0a + #E85D04）
- 用戶列表用 table layout（desktop）/ card layout（mobile）
- 會員等級用顏色區分：
  - free: 灰色 badge
  - creator: 橙色 badge (#E85D04)
  - pro: 金色 badge (#FFD700)
- 搜尋框：可以搜顯示名稱或 LINE User ID

## 環境變數

需要在 Cloudflare Pages 設定：
- `ADMIN_USER_ID` = `Ua98ecd52424d5d82c0091d52bb9afce4`

## 檔案結構

```
src/pages/Admin.tsx          — 管理後台頁面
functions/api/admin/users.ts — GET 所有用戶 / PUT 修改用戶
functions/api/admin/stats.ts — GET 聚合統計
```
