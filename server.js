/* =========================================================
 * server.js — UNO 在线联机服务器（一条命令同时托管网页 + 中转）
 *   · 静态文件服务：托管 index.html / style.css / *.js
 *   · WebSocket 中继：按房间号转发消息（房主权威模型）
 * 运行：  npm install && npm start   （或 node server.js）
 * 端口：  默认 8787，可用 PORT 环境变量覆盖
 * ========================================================= */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync, spawn } = require("child_process");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 8787;

/* 断线宽限期：玩家（含房主）瞬时掉线（手机锁屏/弱网/Wi-Fi 闪断/标签页暂离）时，
 * 服务器为其保留座位一段时间，期间重连可无缝续局；宽限期满才真正移除该玩家。
 * 房主权威引擎运行在房主浏览器内存中——只要房主标签页未关闭，重连即可恢复对局。 */
const RECONNECT_GRACE = 60000;

/** 取得本机在局域网中的 IPv4（用于同 Wi-Fi 好友加入） */
function lanIP() {
  const ifaces = os.networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name] || []) {
      if (ni.family !== "IPv4" || ni.internal) continue;
      candidates.push({ name, addr: ni.address });
    }
  }
  if (candidates.length === 0) return "localhost";
  // 优先常见私网段（家用/办公 Wi-Fi），跳过 Docker / 虚拟机等虚拟网卡
  const priv = candidates.find(
    (c) => /^192\.168\./.test(c.addr) || /^10\./.test(c.addr) || /^172\.(1[6-9]|2\d|3[01])\./.test(c.addr)
  );
  if (priv) return priv.addr;
  // 退而求其次：跳过虚拟接口名称，取第一个真实网卡
  const real = candidates.find((c) => !/^(docker|veth|vmnet|br-|tun|utun|lo|ppp)/i.test(c.name));
  return (real || candidates[0]).addr;
}
const ROOT = __dirname;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

/* 云主机部署时，网页与 WebSocket 同源托管，房间分享仅靠「复制链接」
 * (http(s)://域名/?room=CODE)，不再需要二维码 / 内网穿透。 */

/* ---------------- 静态文件服务 ---------------- */
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/ip") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ip: lanIP() }));
    return;
  }
  if (urlPath === "/") urlPath = "/index.html";
  // 防目录穿越
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const headers = { "Content-Type": MIME[ext] || "application/octet-stream" };
    if (ext === ".html") headers["Cache-Control"] = "no-store, no-cache, must-revalidate";
    res.writeHead(200, headers);
    res.end(data);
  });
});

/* ---------------- WebSocket 中继 ---------------- */
const wss = new WebSocketServer({ server, path: "/" });

/** rooms: code -> { clients: Map<seat, ws>, host: 0, started: bool, names: [], ai: [], public: bool } */
const rooms = new Map();
/** 单房间人数上限（真人 + 电脑合计） */
const ROOM_CAP = 5;
/** 随机匹配等待队列：{ ws, name }[]（尚未进入任何房间，等待被分入公开房） */
const matchQueue = [];

function genCode() {
  let c;
  do {
    c = Math.random().toString(36).slice(2, 6).toUpperCase();
  } while (rooms.has(c));
  return c;
}

/* 把一个已连接但还未入房的客户端放进指定房间，分配第一个空闲真人座位。
 * join / 随机匹配直接入房 / 等待队列补位 三处共用，避免出现「重复占座 / 座位错位」。 */
function placeInRoom(room, ws, name) {
  let seat = -1;
  for (let i = 0; i < room.names.length; i++) {
    if (!room.ai[i] && room.names[i] == null) { seat = i; break; }
  }
  if (seat === -1) seat = room.names.length;
  ws.code = room.code;
  ws.seat = seat;
  ws.isHost = false;
  room.clients.set(seat, ws);
  room.ai[seat] = false;
  room.names[seat] = (name || "玩家" + (seat + 1)).slice(0, 8);
  return seat;
}

/* 随机匹配：挑一个「公开、未开始、有空位」的房间，优先人少者以最快凑齐对局 */
function eligiblePublicRoom() {
  let best = null;
  rooms.forEach((room) => {
    if (!room.public || room.started) return;
    if (room.clients.size >= ROOM_CAP) return;
    if (!best || room.clients.size < best.clients.size) best = room;
  });
  return best;
}

/* 公开房出现空位（创建 / 返回大厅 / 移除电脑 / 有人离开）时，从等待队列拉人补齐 */
function fillFromQueue() {
  for (let i = matchQueue.length - 1; i >= 0; i--) {
    const q = matchQueue[i];
    const room = eligiblePublicRoom();
    if (!room) break; // 没有可进的公开房，停止补位（剩余玩家继续等待）
    matchQueue.splice(i, 1);
    placeInRoom(room, q.ws, q.name);
    send(q.ws, { t: "joined", code: room.code, seat: q.ws.seat, public: room.public });
    broadcastLobby(room);
  }
}

/* 客户端断开 / 取消匹配时，从等待队列里移除它 */
function removeFromQueue(ws) {
  for (let i = matchQueue.length - 1; i >= 0; i--) {
    if (matchQueue[i].ws === ws) matchQueue.splice(i, 1);
  }
}
function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}
function broadcast(room, obj, exceptSeat) {
  room.clients.forEach((c, seat) => {
    if (seat !== exceptSeat) send(c, obj);
  });
}
function broadcastLobby(room) {
  const players = room.names
    .map((name, seat) => (name != null ? { seat, name, isAI: !!(room.ai && room.ai[seat]) } : null))
    .filter(Boolean);
  broadcast(room, { t: "lobby", players, code: room.code, hostSeat: room.host, public: !!room.public, metaConfig: room.metaConfig || null });
}

/* 把房间内「真人客户端」的座位重排成与引擎一致的连续座位（0..n-1）。
 * 有人中途离开后，room.names 会出现空洞（例如座位 1 空缺），服务器在 start / 再来一局时
 * 会把这些真人压缩成连续索引交给房主权威引擎；但房间中继用的 room.clients Map 仍以
 * 「原始加入座位」为键，若不重排：房主广播 state/need 时按引擎索引去 Map 里查，会落到错误
 * （甚至不存在）的客户端 —— 该客户端永远收不到状态、回合/手牌全部错乱。
 * 这里同步重排 Map 键、ws.seat、ws.isHost，并逐个通知客户端其新座位。 */
function renumberClients(room, oldSeats) {
  const clients = [];
  room.clients.forEach((ws) => clients.push(ws));
  room.clients = new Map();
  clients.forEach((ws) => {
    const newSeat = oldSeats.indexOf(ws.seat);
    if (newSeat < 0) return; // 理论上不会发生：离场者已从 Map 移除
    ws.seat = newSeat;
    ws.isHost = newSeat === 0;
    room.clients.set(newSeat, ws);
    send(ws, { t: "reseat", seat: newSeat, isHost: newSeat === 0, code: room.code });
  });
}

wss.on("connection", (ws) => {
  ws.seat = null;
  ws.code = null;
  ws.isHost = false;

  ws.on("message", (raw) => {
    let m;
    try {
      m = JSON.parse(raw);
    } catch (e) {
      return;
    }
    const room = ws.code ? rooms.get(ws.code) : null;

    switch (m.t) {
      case "create": {
        if (ws.seat !== null && ws.seat !== undefined) return send(ws, { t: "error", msg: "你已在一个房间内，请先离开" });
        const code = genCode();
        // public 默认 true：公开房可被随机匹配分入；房主可随时改为私人（仅房间号/链接可进）
        const room = { code, clients: new Map(), host: 0, started: false, names: [], ai: [], public: m.public !== false, metaConfig: m.metaConfig || null };
        rooms.set(code, room);
        ws.code = code;
        ws.seat = 0;
        ws.isHost = true;
        room.clients.set(0, ws);
        room.names[0] = (m.name || "玩家1").slice(0, 8);
        send(ws, { t: "created", code, seat: 0, public: room.public });
        broadcastLobby(room);
        if (room.public) fillFromQueue(); // 房主一公开建房就拉等待匹配的玩家
        break;
      }
      case "join": {
        if (ws.seat !== null && ws.seat !== undefined) return send(ws, { t: "error", msg: "你已在该房间内，无需重复加入" });
        const code = (m.code || "").toUpperCase();
        const room = rooms.get(code);
        if (!room) return send(ws, { t: "error", msg: "房间不存在" });
        if (room.started) return send(ws, { t: "error", msg: "房间已开始，无法加入" });
        if (room.clients.size >= ROOM_CAP) return send(ws, { t: "error", msg: "房间已满（最多 " + ROOM_CAP + " 人）" });
        const seat = placeInRoom(room, ws, m.name);
        send(ws, { t: "joined", code, seat, public: room.public });
        broadcastLobby(room);
        break;
      }
      case "randomMatch": {
        // 随机匹配：优先进入有空位的公开房；没有则进入全局等待队列，等公开房出现时自动补位
        if (ws.seat !== null && ws.seat !== undefined) return send(ws, { t: "error", msg: "你已在一个房间内，请先离开" });
        const name = (m.name || "玩家").slice(0, 8);
        const room = eligiblePublicRoom();
        if (room) {
          const seat = placeInRoom(room, ws, name);
          send(ws, { t: "joined", code: room.code, seat, public: room.public });
          broadcastLobby(room);
        } else {
          matchQueue.push({ ws, name });
          send(ws, { t: "matchmaking" });
        }
        break;
      }
      case "cancelMatch": {
        // 取消随机匹配：退出等待队列
        removeFromQueue(ws);
        send(ws, { t: "matchCanceled" });
        break;
      }
      case "setPublic": {
        // 房主切换房间公开/私人（私人房只能凭房间号 / 邀请链接进入，不会被随机匹配拉入）
        if (!room || !ws.isHost) break;
        room.public = !!m.public;
        broadcastLobby(room);
        if (room.public) fillFromQueue(); // 改回公开后尝试拉取等待匹配的玩家
        break;
      }
      case "start": {
        if (!room || !ws.isHost) break;
        // 整理玩家名单：剔除已离开者（null），真人 + 电脑(AI)一并打包给房主权威引擎。
        // oldSeats 记录每位幸存者对应的「原始加入座位」，用于把真人客户端重排成与引擎一致的连续座位。
        const names = [];
        const ai = [];
        const oldSeats = [];
        room.names.forEach((nm, i) => {
          if (nm != null) { names.push(nm); ai.push(!!room.ai[i]); oldSeats.push(i); }
        });
        renumberClients(room, oldSeats); // 关键：重排 room.clients 键，否则存在空洞时状态路由错乱
        room.names = names;
        room.ai = ai;
        room.started = true;
        room.config = m.config || {}; // 记住本局配置，供“再来一局”直接复用
        broadcast(room, { t: "start", names, ai, config: room.config });
        break;
      }
      case "rename": {
        if (!room || ws.seat === null || ws.seat === undefined) break;
        const name = (m.name || "玩家").toString().trim().slice(0, 8);
        if (room.names[ws.seat] !== name) { room.names[ws.seat] = name; broadcastLobby(room); }
        break;
      }
      case "addAI": {
        // 房主可在大厅随时加入电脑玩家，实现「真人与 AI 混合」对局。
        // 电脑玩家是房主权威引擎里的虚拟座位，没有真实 WebSocket 客户端。
        if (!room || !ws.isHost) break;
        if (room.started) break; // 游戏中不可增减电脑
        // 上限按实际占用座位计（排除 removeAI 留下的尾部空洞），避免空洞累积误触上限
        const occupied = room.names.filter((nm) => nm != null).length;
        if (occupied >= 8) break;
        const n = room.ai.filter(Boolean).length + 1;
        // 优先填第一个空位（与 join 一致），保持座位连续；无空位才追加到末尾
        let seat = -1;
        for (let i = 0; i < room.names.length; i++) {
          if (room.names[i] == null) { seat = i; break; }
        }
        if (seat === -1) seat = room.names.length;
        room.names[seat] = "电脑" + n;
        room.ai[seat] = true;
        broadcastLobby(room);
        break;
      }
      case "removeAI": {
        // 房主移除最后加入的电脑玩家（LIFO），保持座位连续，避免真人座位错位
        if (!room || !ws.isHost) break;
        if (room.started) break;
        let last = -1;
        room.names.forEach((nm, i) => { if (nm != null && room.ai[i]) last = i; });
        if (last >= 0) {
          room.names[last] = null;
          room.ai[last] = false;
          // 收缩尾部空洞：pop 掉末尾连续的 null，使 names.length 反映真实占用数，
          // 防止反复增删累积空洞后 addAI 误触 >=8 上限（"移除后无法添加"根因）
          while (room.names.length > 0 && room.names[room.names.length - 1] == null) {
            room.names.pop();
            if (room.ai.length > 0) room.ai.pop();
          }
          broadcastLobby(room);
          if (room.public) fillFromQueue(); // 移除电脑腾出空位，尝试拉等待匹配的玩家
        }
        break;
      }
      case "rematch": {
        // 房主发起“再来一局”：所有人不退出房间，直接用上一局的配置重开。
        // 若有人中途离开，此时 room.clients 已少一人 → 把剩余玩家重排成连续座位（房主永远 0 号），
        // 逐个通知新座位(reseat)后广播 start，达成“人数自动-1 + 一键真·再战”。
        if (!room || !ws.isHost) break;
        rematchRoom(room);
        break;
      }
      case "rematchRequest": {
        // 非房主也能发起“再来一局”：转交给房主执行（房主权威，引擎只在房主端跑）。
        // 重复请求由房主端去重，这里只负责转发。
        if (!room || ws.seat == null) break;
        const host = room.clients.get(room.host);
        send(host, { t: "rematchAsk", from: ws.seat, name: room.names[ws.seat] || ("P" + ws.seat) });
        break;
      }
      case "intent": {
        // 仅转发给房主（必须透传 cardId/color/target 等字段，否则出牌/选色/换牌全部失效）
        if (!room) break;
        const host = room.clients.get(room.host);
        send(host, Object.assign({ t: "intent", from: ws.seat }, m));
        break;
      }
      case "state": {
        // 房主广播整局状态；若带 to 则定向发给某座位（一般不用）
        if (!room) break;
        if (m.to != null) send(room.clients.get(m.to), m);
        else broadcast(room, m);
        break;
      }
      case "need": {
        // 房主请求某座位做选择（选色/换牌）
        if (!room) break;
        const tgt = room.clients.get(m.to);
        send(tgt, { t: "need", kind: m.kind, ctx: m.ctx, targets: m.targets });
        break;
      }
      case "leave": {
        cleanup(ws, true); // 主动离开：立即移除
        break;
      }
      case "rejoin": {
        // 瞬时掉线后重连：复用原座位（座位在宽限期内被服务器保留）。
        // 复用成功则无缝续局；座位已被回收/房间不存在则关闭。
        const code = (m.code || "").toUpperCase();
        const room = rooms.get(code);
        if (!room) { send(ws, { t: "closed" }); break; }
        const seat = m.seat;
        const old = room.clients.get(seat);
        if (!old || !old.dead) { send(ws, { t: "error", msg: "无法重连该座位" }); break; }
        if (old.removeTimer) { clearTimeout(old.removeTimer); old.removeTimer = null; }
        old.dead = false; // 取消移除计时
        ws.seat = seat;
        ws.code = code;
        ws.isHost = seat === room.host;
        room.clients.set(seat, ws); // 新 socket 接管该保留座位
        send(ws, { t: "rejoined", seat, isHost: ws.isHost, code });
        if (room.started) {
          const host = room.clients.get(room.host);
          if (host) send(host, { t: "resend" }); // 请求房主重发当前状态
        } else {
          broadcastLobby(room);
        }
        break;
      }
      case "backToLobby": {
        // 房主在对局结束后“返回大厅”：复位 started，使 addAI/removeAI 解锁，可调整机器人后再开
        if (!room || !ws.isHost) break;
        if (!room.started) break;
        room.started = false;
        broadcastLobby(room);
        if (room.public) fillFromQueue(); // 返回大厅腾出整局空位，尝试拉等待匹配的玩家
        broadcast(room, { t: "backToLobby" }); // 通知所有人（含房主）回到大厅
        break;
      }
    }
  });

  ws.on("close", () => { removeFromQueue(ws); cleanup(ws, false); });
  ws.on("error", () => { removeFromQueue(ws); cleanup(ws, false); });
});

function rematchRoom(room) {
  // 把仍在房间内的玩家（真人客户端 + 电脑 AI）按原座位顺序重排成连续座位（房主固定 0 号）。
  // 电脑玩家无 WebSocket 客户端，靠房主依 start 名单重建；真人则通过 renumberClients 重排并重键 room.clients。
  const survivors = [];
  room.names.forEach((name, seat) => {
    if (name == null) return;
    const isAI = !!(room.ai && room.ai[seat]);
    const wsClient = room.clients.get(seat);
    if (!isAI && !wsClient) return; // 真人已退出（理论上离开时已置 null，双保险）
    survivors.push({ name, isAI, ws: wsClient, oldSeat: seat });
  });
  if (survivors.length < 2) {
    // 人数不足以再开一局：提示房主，房间保持大厅状态
    const host = room.clients.get(room.host);
    send(host, { t: "error", msg: "人数不足，至少 2 人才能再来一局" });
    return;
  }
  const newNames = survivors.map((s) => s.name);
  const newAi = survivors.map((s) => s.isAI);
  const oldSeats = survivors.map((s) => s.oldSeat);
  renumberClients(room, oldSeats); // 关键：同步重排 room.clients 键，否则存在空洞时状态路由错乱
  room.names = newNames;
  room.ai = newAi;
  room.host = 0;
  room.started = true;
  // 广播 start：所有人（含房主）据此重新进入对局，直接开打（电脑 AI 一并带入）
  broadcast(room, { t: "start", names: newNames, ai: newAi, config: room.config || {} });
}

function cleanup(ws, permanent) {
  const code = ws.code;
  if (!code) return;
  const room = rooms.get(code);
  if (!room) return;
  const seat = ws.seat;
  if (seat == null) return;
  // 幂等：close 与 error 可能先后触发，已标记 dead（已保留或已移除）则不再处理，
  // 否则二次触发会绕过宽限期立即移除玩家，导致瞬时掉线被直接踢出对局。
  if (ws.dead) return;
  if (permanent || !room.started) {
    // 主动离开，或大厅阶段（对局未开始）掉线：立即释放座位（旧行为）
    performRemoval(room, code, seat, ws);
  } else {
    // 对局中瞬时掉线：保留座位一段宽限期，等待客户端重连（避免瞬时掉线直接踢出对局）
    ws.dead = true;
    ws.deadAt = Date.now();
    scheduleRemoval(room, code, seat, ws);
  }
}

function scheduleRemoval(room, code, seat, ws) {
  if (ws.removeTimer) clearTimeout(ws.removeTimer);
  ws.removeTimer = setTimeout(() => {
    if (ws.dead) performRemoval(room, code, seat, ws);
  }, RECONNECT_GRACE);
}

function performRemoval(room, code, seat, ws) {
  if (ws.removeTimer) { clearTimeout(ws.removeTimer); ws.removeTimer = null; }
  if (room.clients.get(seat) !== ws) return; // 已重连（座位被新 socket 接管），取消移除
  room.clients.delete(seat);
  if (ws.isHost) {
    // 房主彻底离开：权威引擎仅存在于房主浏览器内存，他人无法接管 → 关闭房间
    broadcast(room, { t: "closed" });
    rooms.delete(code);
  } else {
    if (room.clients.size === 0) {
      rooms.delete(code);
    } else {
      const leftName = room.names[seat] || ("P" + seat);
      room.names[seat] = null;
      if (room.started) {
        // 游戏中途退出：通知房主把该玩家移出引擎（标记出局并继续/结束）
        const host = room.clients.get(room.host);
        if (host) send(host, { t: "peerLeft", seat, name: leftName });
      } else {
        broadcastLobby(room);
        if (room.public) fillFromQueue(); // 大厅阶段有人离开腾出空位，尝试拉等待匹配的玩家
      }
    }
  }
}

server.listen(PORT, () => {
  console.log("UNO 服务器已启动：");
  console.log("  网页 + 联机中转: http://localhost:" + PORT);
  console.log("  本机联机地址（同 Wi-Fi 好友用）: http://" + lanIP() + ":" + PORT);
  console.log("  房间号由房主创建时生成。按 Ctrl+C 停止。");
  console.log("  分享房间：大厅点「复制链接」即可（公网部署时自动用本站域名）。");
});
