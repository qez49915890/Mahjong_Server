// 台灣麻將伺服器：牌局在伺服器上跑，玩家離線時由電腦託管，回來自動接手
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { createRoom } = require('./public/engine.js');

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  if (p === '/healthz') { res.writeHead(200); return res.end('ok'); }
  const f = path.normalize(path.join(PUB, p));
  if (!f.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(d);
  });
});

const wss = new WebSocketServer({ server, maxPayload: 4096 });
const rooms = new Map();   // code -> { room, clients: Map(pid -> ws) }

const safeSend = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };

function makeEntry(code) {
  const room = createRoom(code);
  const entry = { room, clients: new Map() };
  room.onChange = () => {
    for (const [pid, ws] of entry.clients) safeSend(ws, { type: 'st', data: room.stateFor(pid) });
  };
  rooms.set(code, entry);
  return entry;
}

wss.on('connection', (ws) => {
  let ctx = null; // { code, pid }
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (m.type === 'ping') return safeSend(ws, { type: 'pong' });

    if (m.type === 'join' || m.type === 'create') {
      const code = String(m.room || '').toUpperCase().slice(0, 5);
      const pid = String(m.pid || '').slice(0, 40);
      if (code.length !== 5 || pid.length < 8) return safeSend(ws, { type: 'err', code: 'bad', msg: '資料格式錯誤。' });
      let entry = rooms.get(code);
      if (m.type === 'create' && entry && entry.room.seatOf(pid) < 0) return safeSend(ws, { type: 'err', code: 'exists', msg: '房間代碼衝突，請再按一次建立房間。' });
      if (!entry) {
        if (m.type !== 'create') return safeSend(ws, { type: 'err', code: 'none', msg: '找不到此邀請碼的房間（可能已關閉）。' });
        entry = makeEntry(code);
      }
      const seat = entry.room.join(pid, m.n);
      if (seat < 0) return safeSend(ws, { type: 'err', code: 'full', msg: '房間已滿或遊戲已經開始，無法加入。' });
      const old = entry.clients.get(pid);
      if (old && old !== ws) { old.ctx = null; try { old.close(); } catch {} }
      entry.clients.set(pid, ws);
      ctx = { code, pid }; ws.ctx = ctx;
      entry.room.setConnected(pid, true);
      safeSend(ws, { type: 'st', data: entry.room.stateFor(pid) });
      return;
    }

    if (m.type === 'act' && ctx) {
      const entry = rooms.get(ctx.code);
      if (entry && m.data && typeof m.data.a === 'string') entry.room.act(ctx.pid, m.data);
    }
  });

  ws.on('close', () => {
    const c = ws.ctx; if (!c) return;
    const entry = rooms.get(c.code);
    if (!entry || entry.clients.get(c.pid) !== ws) return;
    entry.clients.delete(c.pid);
    entry.room.setConnected(c.pid, false);
  });
});

// 心跳：清掉死連線
setInterval(() => {
  wss.clients.forEach((ws) => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; try { ws.ping(); } catch {} });
}, 30000);

// 清掉沒有真人在線超過 30 分鐘的房間
setInterval(() => {
  const now = Date.now();
  for (const [code, e] of rooms) {
    if (e.clients.size === 0 && now - e.room.lastActive > 30 * 60 * 1000) { e.room.destroy(); rooms.delete(code); }
  }
}, 60000);

server.listen(PORT, () => console.log('麻將伺服器啟動於 port ' + PORT));
