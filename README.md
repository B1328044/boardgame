# 財經棋局（個人版／企業版）

同一個專案包含兩種模式，開局時可以切換：

| 模式 | 資料夾 | 內容 |
|---|---|---|
| 個人版 · 人生棋局 | `personal/` | 底層、上班族、公司高管、自由業，各有收入、負債與勝利目標 |
| 企業版 · 經濟棋局 | `enterprise/` | 十種企業，經營、借貸、事件與 AI 聯準會 |

## 開啟方式

- **Windows**：雙擊 `啟動遊戲.bat`。有安裝 Node.js 時會啟動本機伺服器並開啟瀏覽器；沒有時直接開啟首頁。
- **直接開啟**：用瀏覽器開 `index.html`，選擇模式。
- **本機伺服器**（多個頁籤同步同一場對局時建議使用）：在此資料夾執行 `node serve.mjs`，開啟 `http://127.0.0.1:4173/`。

首頁可選擇模式；兩種模式的「設定玩家」畫面上方都有「個人版／企業版」切換。兩種模式各自載入自己的 `data.js`、`engine.js`，對局分開儲存，切換不會清除另一邊的進度。

## 連線版（個人版）

一台電腦當大螢幕（建議接投影），每位玩家用自己的手機掃 QR 加入。**不需要下載、不需要安裝 Node.js、不需要租主機**：整個資料夾放到 GitHub Pages 就能用。

**運作方式**

- 大螢幕的瀏覽器就是「房主」：遊戲規則、拉霸亂數和 Bot 都在這個分頁裡執行。
- 手機用瀏覽器直接連到大螢幕（WebRTC），只送出自己的操作，並只收到「公開資訊＋自己的私人資料」，看不到別人的現金與負債。
- 配對伺服器只負責讓手機找到大螢幕，遊戲資料不經過它。預設使用 PeerJS 的免費公用配對伺服器。

**使用方式**

1. 把整個專案放到 GitHub Pages（例如推到 GitHub repo，在 Settings → Pages 開啟）。
2. 主持人用電腦打開 `https://你的帳號.github.io/專案名稱/online/host.html`，按「建立個人版房間」。
3. 玩家用手機掃 QR（或打開網址輸入 4 碼房號），輸入名字、選角色。手機不用和大螢幕連同一個 Wi-Fi，行動網路也可以。
4. 主持人可以補 Bot、設定季數，按「開始遊戲」。

**注意事項**

- 對局結束前請保持大螢幕的分頁開著；電腦睡眠或關掉分頁，遊戲會暫停。重新整理大螢幕不會遺失對局，手機會自動重新連上。
- 用本機檔案（`file://`）或 `localhost` 開大螢幕時，手機打不開加入網址，畫面會提醒改用網站網址。
- 少數網路（例如防火牆很嚴的校園或公司網路）會擋瀏覽器直連，第一次正式使用前建議先在現場網路試一次；連不上時可以改用手機熱點。
- 測試或自架配對伺服器時，可在網址後加 `?signal=主機:埠號`（例如 `host.html?signal=127.0.0.1:9000`），加入連結會自動帶上同樣設定。

**檔案**

- `online/room.mjs`：房間、座位、動作驗證、Bot、公開／私人資料過濾、存檔還原（有測試 `online/room.test.js`）。
- `online/host.*`：大螢幕；`online/join.*`：手機；`online/common.js`：共用工具與連線設定。
- `online/core.js`：由 `node online/build.mjs` 把個人版引擎、Bot 與 `room.mjs` 合併而成，給大螢幕使用。修改個人版規則後要重新產生（`npm run build` 會一併處理）。
- `online/vendor/`：第三方開源套件，見下方授權。

## 第三方套件與授權

| 套件 | 用途 | 授權 |
|---|---|---|
| [PeerJS](https://peerjs.com) 1.5.2 | 瀏覽器之間直連（WebRTC） | MIT（`online/vendor/LICENSE-peerjs.txt`） |
| [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 1.4.4 | 產生加入房間的 QR code | MIT（`online/vendor/LICENSE-qrcode-generator.txt`） |

## 開發

- 修改某個模式的原始檔後，在根目錄執行 `npm run build`（或 `node personal/build.mjs`、`node enterprise/build.mjs`）重新產生該模式的 `game.js`。
- `npm test`：同時執行兩種模式與連線版的測試。
- `npm run build`：重新產生兩種模式的 `game.js` 與連線版的 `online/core.js`。
- `node personal/simulate.mjs 2000 4`、`node personal/simulate.mjs levels 1500 4`：個人版平衡模擬。
- `node enterprise/simulate.mjs 2000 4`：企業版平衡模擬。
- 各模式的規則細節見 `personal/README.md`、`enterprise/README.md`。

## 介面排版

兩種模式的棋盤頁都改成「棋盤＋目前玩家」為主：目前玩家的完整資訊在右側回合面板下方；所有玩家在棋盤上方縮成一排頭像，頭像外圈與進度條是勝利目標進度，點一下可以展開該玩家的細節。
