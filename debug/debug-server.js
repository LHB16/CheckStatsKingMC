/**
 * debug/debug-server.js
 * @description Server-Sent Events (SSE) debug server.
 * Nhận debug events từ mc-bot.js và push xuống browser theo thời gian thực.
 * Không cần cài thêm package nào ngoài built-in Node.js http + path.
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

// Singleton emitter để mc-bot.js gọi emit
const debugEmitter = new EventEmitter();
debugEmitter.setMaxListeners(50);

// Danh sách các SSE client đang kết nối
const sseClients = new Set();

// ─── State lưu trữ snapshot mới nhất của từng khu vực ──────────────────────
const state = {
  status:    { connected: false, host: '', username: '', role: 'standalone', timestamp: null },
  chat:      [],   // Mảng { ts, text }  — giữ tối đa 200 dòng
  position:  { x: null, y: null, z: null, yaw: null, pitch: null, world: null, ping: null, ts: null },
  inventory: [],   // Mảng { slot, name, displayName, count, lore }
  gui:       { title: '', action: '', slots: [], ts: null },
  items:     [],   // Debug item raw: mảng { slot, name, displayName, count, lore, nbt }
  serverInfo: { serverUsed: '', isReady: false, isBusy: false, currentAction: null, ts: null },
};

/**
 * Broadcast một sự kiện SSE tới tất cả client đang kết nối.
 * @param {string} event  - tên event (chat, position, inventory, gui, item, status, serverInfo)
 * @param {*}      data   - object hoặc giá trị bất kỳ (sẽ được JSON.stringify)
 */
function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch (_) {
      sseClients.delete(res);
    }
  }
}

// ─── Xử lý các debug event từ mc-bot.js ────────────────────────────────────

debugEmitter.on('status', (data) => {
  Object.assign(state.status, data, { timestamp: new Date().toISOString() });
  broadcast('status', state.status);
});

debugEmitter.on('chat', (data) => {
  const entry = { ts: new Date().toISOString(), ...data };
  state.chat.push(entry);
  if (state.chat.length > 200) state.chat.shift();
  broadcast('chat', entry);
});

debugEmitter.on('position', (data) => {
  Object.assign(state.position, data, { ts: new Date().toISOString() });
  broadcast('position', state.position);
});

debugEmitter.on('inventory', (data) => {
  state.inventory = data.slots || [];
  broadcast('inventory', { slots: state.inventory, ts: new Date().toISOString() });
});

debugEmitter.on('gui', (data) => {
  Object.assign(state.gui, data, { ts: new Date().toISOString() });
  broadcast('gui', state.gui);
});

debugEmitter.on('item', (data) => {
  // Thêm item vào danh sách items debug (rolling buffer 50)
  const entry = { ts: new Date().toISOString(), ...data };
  state.items.unshift(entry);
  if (state.items.length > 50) state.items.pop();
  broadcast('item', entry);
});

debugEmitter.on('serverInfo', (data) => {
  Object.assign(state.serverInfo, data, { ts: new Date().toISOString() });
  broadcast('serverInfo', state.serverInfo);
});

// ─── HTTP Server phục vụ HTML panel và SSE endpoint ────────────────────────

const DEBUG_PORT = parseInt(process.env.DEBUG_PORT) || 4000;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // ── Phục vụ file HTML debug panel ──
  if (url.pathname === '/' || url.pathname === '/debug' || url.pathname === '/index.html') {
    const htmlPath = path.join(__dirname, 'debug-panel.html');
    fs.readFile(htmlPath, (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Không tìm thấy file debug-panel.html');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  // ── SSE endpoint: /events ──
  if (url.pathname === '/events') {
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(':ok\n\n');

    // Gửi toàn bộ state hiện tại ngay khi kết nối
    res.write(`event: init\ndata: ${JSON.stringify(state)}\n\n`);

    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // ── API: lấy full state snapshot ──
  if (url.pathname === '/api/state') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(state, null, 2));
    return;
  }

  // ── API: thực hiện tương tác in-game ──
  if (url.pathname === '/api/action' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const actionData = JSON.parse(body);
        debugEmitter.emit('client_action', actionData);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

function startDebugServer() {
  server.listen(DEBUG_PORT, () => {
    console.log(`[Debug-Server] 🖥️  Debug Panel đang chạy tại: http://localhost:${DEBUG_PORT}`);
  });
}

module.exports = { debugEmitter, startDebugServer };
