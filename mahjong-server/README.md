# 台灣麻將（伺服器版）

牌局在伺服器上執行。玩家離開畫面或斷線後，座位會保留、由電腦代打，回來會自動接手。

## 本機測試
```
npm install
npm start
```
開 http://localhost:3000 ，用兩個瀏覽器分頁（一個一般、一個無痕）就能模擬兩位玩家。

## 免費部署到 Render
1. 把整個 mahjong-server 資料夾上傳到一個 GitHub repo（node_modules 不用傳）。
2. 到 render.com 註冊，New → Web Service，選那個 repo。
3. 設定：Runtime 選 Node，Build Command 填 `npm install`，Start Command 填 `npm start`，Instance Type 選 Free。
4. 部署完成後會得到 https://xxx.onrender.com ，直接開這個網址玩，邀請連結傳給朋友即可。

## 免費版的限制
- 15 分鐘沒有任何連線或訊息，服務會休眠，下次開啟要等約 1 分鐘喚醒。
- 休眠或重新部署時，進行中的牌局會消失（資料存在記憶體，不存硬碟）。
- 有人在牌桌上時，前端每 20 秒會送一次心跳，服務不會在牌局中休眠。

## 檔案
- server.js：WebSocket 伺服器、房間管理
- public/engine.js：牌局引擎（伺服器與單機試玩共用）
- public/index.html：前端
- 前端若想放 GitHub Pages，把 public/index.html 裡的 `SERVER_URL` 改成 `wss://你的服務.onrender.com`，並一併上傳 engine.js
