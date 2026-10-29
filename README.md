# 白馬滑雪團 2027

12 人日本滑雪行程網站（2027/2/17–2/22）。

- 網頁：`public/index.html`
- 同步 API：`functions/api/[[route]].js`（Cloudflare Pages Functions）
- 部署：Cloudflare Pages，輸出資料夾 `public`，不需建置指令
- 網址參數：`?lang=zh-TW|ja|en`、`?day=1`–`6`

## 全團同步需要的 Cloudflare 設定

| 設定 | 名稱 | 說明 |
|---|---|---|
| D1 資料庫綁定 | `DB` | 存每個人的出門清單、賓果、投票，以及交通任務進度 |
| Secret | `ADMIN_PIN` | 交通負責人打勾用的密碼 |

沒有設定 `DB` 時，網站會自動退回「只存在自己手機」的模式。
