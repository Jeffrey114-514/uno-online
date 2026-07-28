/* =========================================================
 * menu.js — 菜单页 / 联机大厅 UI 与事件绑定
 * 从 main.js 抽离；直接使用 main.js 暴露的全局状态与模块
 * （game / playMode / isHost / UI / C / Snd / I / Router …）
 * ========================================================= */
"use strict";
/* ---------------- 菜单 ---------------- */
function buildCountPicker() {
  const wrap = document.getElementById("count-picker");
  wrap.innerHTML = "";
  const opts = playMode === "ai" ? [1, 2, 3] : [2, 3, 4, 5];
  const def = playMode === "ai" ? aiCount : totalPlayers;
  const cur = opts.includes(def) ? def : opts[0];
  if (playMode === "ai") aiCount = cur; else totalPlayers = cur;

  opts.forEach((v) => {
    const b = document.createElement("button");
    b.textContent = String(v);
    b.className = v === cur ? "active" : "";
    b.addEventListener("click", () => {
      wrap.querySelectorAll("button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      if (playMode === "ai") aiCount = v; else totalPlayers = v;
    });
    wrap.appendChild(b);
  });
  document.getElementById("count-label").textContent =
    playMode === "ai" ? I.t("countAI") : I.t("countLocal");
  document.getElementById("difficulty-row").style.display = playMode === "ai" ? "block" : "none";
  buildNameInputs();
}

/* 本地多人：根据总人数渲染昵称输入框（仅 local 模式显示） */
function buildNameInputs() {
  const row = document.getElementById("local-names-row");
  const wrap = document.getElementById("name-inputs");
  if (!row || !wrap) return;
  if (playMode !== "local") { row.style.display = "none"; wrap.innerHTML = ""; return; }
  row.style.display = "flex";
  const n = totalPlayers;
  if (localNames.length !== n) {
    const next = [];
    for (let i = 0; i < n; i++) next.push(localNames[i] || (I.t("pPlayer") + (i + 1)));
    localNames = next;
  }
  wrap.innerHTML = "";
  localNames.forEach((nm, i) => {
    const inp = document.createElement("input");
    inp.type = "text";
    inp.className = "pname-input";
    inp.value = nm;
    inp.maxLength = 8;
    inp.placeholder = I.t("pPlayer") + (i + 1);
    inp.addEventListener("input", () => {
      localNames[i] = inp.value.trim() || (I.t("pPlayer") + (i + 1));
    });
    wrap.appendChild(inp);
  });
}

function updateMenuHint() {
  const key = ruleMode === "classic" ? "menuHintClassic" : ruleMode === "family" ? "menuHintFamily" : "menuHintNoMercy";
  document.getElementById("menu-hint").textContent = I.t(key);
}

/* 切换对战形式时统一刷新菜单 UI（在线模式显示大厅、隐藏其余配置） */
function applyPlayModeUI() {
  const online = playMode === "online";
  document.querySelectorAll(".hide-online").forEach((e) => {
    if (e.id === "family-rules") {
      e.style.display = !online && ruleMode === "family" ? "block" : "none";
    } else {
      e.style.display = online ? "none" : "";
    }
  });
  const lobby = document.getElementById("lobby");
  if (lobby) lobby.style.display = online ? "flex" : "none";
  if (!online) {
    // 退出大厅状态
    isHost = false; netOnline = false; clearTurnTimer();
    buildCountPicker();
  } else {
    setupLobby();
  }
}

function setupMenu() {
  // 三规则模式卡片
  document.querySelectorAll(".mode-card").forEach((card) => {
    card.addEventListener("click", () => {
      document.querySelectorAll(".mode-card").forEach((x) => x.classList.remove("active"));
      card.classList.add("active");
      ruleMode = card.dataset.mode;
      document.getElementById("family-rules").style.display = ruleMode === "family" ? "block" : "none";
      updateMenuHint();
    });
  });

  // 对战形式（单人多 / 本地多人 / 在线联机）
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".mode-btn").forEach((x) => x.classList.remove("active"));
      btn.classList.add("active");
      playMode = btn.dataset.play;
      applyPlayModeUI();
      updateMenuHint();
    });
  });

  document.querySelectorAll(".diff-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".diff-btn").forEach((x) => x.classList.remove("active"));
      btn.classList.add("active");
      difficulty = btn.dataset.diff;
    });
  });

  // 家庭规则微调
  document.querySelectorAll(".house-item input[type=checkbox]").forEach((cb) => {
    cb.checked = true;
    cb.addEventListener("change", () => {
      rules[cb.dataset.rule] = cb.checked;
      const item = cb.closest(".house-item");
      if (item) item.classList.toggle("checked", cb.checked);
    });
  });

  document.getElementById("start-btn").addEventListener("click", onStart);

  // 规则弹窗（按模式注入）
  const rulesModal = document.getElementById("rules-modal");
  document.getElementById("rules-btn").addEventListener("click", () => {
    document.getElementById("rules-body").innerHTML = I.t(
      ruleMode === "classic" ? "rulesClassic" : ruleMode === "family" ? "rulesFamily" : "rulesNoMercy"
    );
    rulesModal.classList.add("active");
  });
  document.getElementById("rules-close").addEventListener("click", () => rulesModal.classList.remove("active"));
  rulesModal.addEventListener("click", (e) => { if (e.target === rulesModal) rulesModal.classList.remove("active"); });

  setupTutorial();

  // 语言切换（菜单页右上角 中/EN 按钮）
  const langBtn = document.getElementById("lang-toggle");
  if (langBtn) {
    langBtn.classList.toggle("en", I.lang === "en");
    langBtn.addEventListener("click", () => {
      try {
        const l = I.toggle();       // 内部已调 applyStatic()，但下方再刷一遍确保动态内容也更新
        langBtn.classList.toggle("en", l === "en");
        buildCountPicker();
        updateMenuHint();
        // 规则弹窗内容也需要跟随语言切换（用户可能已打开过规则弹窗）
        const rulesBody = document.getElementById("rules-body");
        if (rulesBody) rulesBody.innerHTML = I.t(
          ruleMode === "classic" ? "rulesClassic" : ruleMode === "family" ? "rulesFamily" : "rulesNoMercy"
        );
        // 二次 applyStatic：确保 setupMenu 动态写入的文本（如 count-label）也被翻译
        I.applyStatic();
      } catch (e) { console.warn("[menu] lang toggle error:", e); }
    });
  }

  buildCountPicker();
  updateMenuHint();
}

/* ---------------- 新手教程 ---------------- */
let tutTab = "start";
function setupTutorial() {
  const modal = document.getElementById("tutorial-modal");
  if (!modal) return;
  document.getElementById("tutorial-btn").addEventListener("click", () => {
    tutTab = "start";
    syncTutTabs();
    renderTutorial();
    modal.classList.add("active");
  });
  document.getElementById("tutorial-close").addEventListener("click", () => modal.classList.remove("active"));
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("active"); });
  document.querySelectorAll(".tut-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      tutTab = tab.dataset.tut;
      syncTutTabs();
      renderTutorial();
    });
  });
}

function syncTutTabs() {
  document.querySelectorAll(".tut-tab").forEach((t) => t.classList.toggle("active", t.dataset.tut === tutTab));
}

function renderTutorial() {
  const body = document.getElementById("tutorial-body");
  if (!body) return;
  if (tutTab === "start") { body.innerHTML = I.t("tutStart"); return; }
  if (tutTab === "nomercy") { body.innerHTML = I.t("tutNoMercy"); return; }
  // 牌型图鉴：用真实牌样渲染
  body.innerHTML = "";
  const groups = [
    { title: I.t("tutLegendBasic"), cards: [
      C.makeCard("number", "red", 5), C.makeCard("number", "blue", 0) ] },
    { title: I.t("tutLegendAction"), cards: [
      C.makeCard("skip", "red"), C.makeCard("reverse", "blue"), C.makeCard("draw2", "green") ] },
    { title: I.t("tutLegendWild"), cards: [
      C.makeCard("wild"), C.makeCard("wild4") ] },
    { title: I.t("tutLegendNoMercyOnly"), cards: [
      C.makeCard("draw4", "yellow"), C.makeCard("discardAll", "red"), C.makeCard("skipEveryone", "green"),
      C.makeCard("wildDraw6"), C.makeCard("wildDraw10"), C.makeCard("wildReverseDraw4"), C.makeCard("wildColorRoulette") ] },
  ];
  groups.forEach((g) => {
    const h = document.createElement("h3");
    h.className = "tut-legend-title";
    h.textContent = g.title;
    body.appendChild(h);
    const grid = document.createElement("div");
    grid.className = "tut-legend-grid";
    g.cards.forEach((card) => {
      const item = document.createElement("div");
      item.className = "tut-legend-item";
      const cardWrap = document.createElement("div");
      cardWrap.className = "tut-legend-card";
      cardWrap.appendChild(window.createCardEl(card));
      const txt = document.createElement("div");
      txt.className = "tut-legend-text";
      const isZero = card.type === "number" && card.value === 0;
      const name = isZero ? I.t("capRotate") : (I.cardCaption(card.type) || I.t("capNumber"));
      const fx = isZero ? I.t("fxRotate") : I.cardEffect(card.type);
      txt.innerHTML = `<b>${name}</b><span>${fx}</span>`;
      item.appendChild(cardWrap);
      item.appendChild(txt);
      grid.appendChild(item);
    });
    body.appendChild(grid);
  });
}

function buildPlayers() {
  const players = [];
  if (playMode === "ai") {
    players.push({ name: I.t("pYou"), isAI: false });
    for (let i = 0; i < aiCount; i++) players.push({ name: I.t("pCPU") + (i + 1), isAI: true });
  } else {
    for (let i = 0; i < totalPlayers; i++) {
      const nm = (localNames[i] && localNames[i].trim()) || (I.t("pPlayer") + (i + 1));
      players.push({ name: nm, isAI: false });
    }
  }
  return players;
}

/* ====================================================================
 * 在线联机：大厅 + 房主权威中继
 * ================================================================== */
function setupLobby() {
  const nameInput = document.getElementById("net-name");
  if (nameInput && !nameInput.value) nameInput.value = I.t("pPlayer") + "1";
  // 重置大厅视图：显示三按钮、隐藏房间内信息与匹配状态
  const panels = document.getElementById("lobby-panels");
  const room = document.getElementById("lobby-room");
  if (panels) panels.style.display = "";
  if (room) room.style.display = "none";
  const matchStatus = document.getElementById("sub-match");
  if (matchStatus) matchStatus.classList.remove("open");
  document.getElementById("lobby-info").textContent = "";
  document.getElementById("lobby-players").innerHTML = "";
  document.getElementById("lobby-host").style.display = "none";
  document.getElementById("btn-lobby-leave").style.display = "none";
  document.getElementById("lobby-ai").style.display = "none";

  // 关闭所有子面板（重置按钮状态）
  try { closeAllSubPanels(); } catch(e) {} /* 首次调用时 closeAllSubPanels 尚未定义，忽略 */

  // 创建房时的公开/私人开关
  const createPub = document.getElementById("create-public");
  if (createPub) {
    createPub.classList.add("on");
    createPub.setAttribute("aria-checked", "true");
    createPub.onclick = () => {
      const on = createPub.classList.toggle("on");
      createPub.setAttribute("aria-checked", on ? "true" : "false");
    };
  }

  // ---- 子面板展开/收起辅助 ----
  const subIds = ["sub-create", "sub-match", "sub-join"];
  const btnIds = ["btn-create", "btn-match", "btn-join-toggle"];
  function closeAllSubPanels() {
    subIds.forEach((id) => { const el = document.getElementById(id); if (el) el.classList.remove("open"); });
    btnIds.forEach((id) => { const el = document.getElementById(id); if (el) el.classList.remove("active"); });
  }
  function openSubPanel(subId, btnId) {
    closeAllSubPanels();
    const sub = document.getElementById(subId);
    const btn = document.getElementById(btnId);
    if (sub) sub.classList.add("open");
    if (btn) btn.classList.add("active");
  }

  // ① 创建房间（按钮 → 展开子面板 → 确认创建）
  document.getElementById("btn-create").onclick = () => {
    const sub = document.getElementById("sub-create");
    if (sub && sub.classList.contains("open")) { closeAllSubPanels(); } else { openSubPanel("sub-create", "btn-create"); }
  };
  document.getElementById("btn-create-confirm").onclick = () => {
    const name = (nameInput.value || I.t("pPlayer") + "1").trim().slice(0, 8);
    const isPublic = createPub ? createPub.classList.contains("on") : true;
    connectAnd(() => {
      isHost = true;
      UnoNet.send({ t: "create", name, public: isPublic });
    }, (err) => lobbyInfo(I.t("netError", { msg: String(err.message || err) })));
  };

  // ② 随机匹配（直接开始，子面板显示匹配状态）
  document.getElementById("btn-match").onclick = () => {
    const name = (nameInput.value || I.t("pPlayer") + "1").trim().slice(0, 8);
    closeAllSubPanels();
    openSubPanel("sub-match", "btn-match");
    if (matchStatus) { matchStatus.classList.add("open"); document.getElementById("match-status-text").textContent = I.t("netMatching"); }
    connectAnd(() => {
      UnoNet.send({ t: "randomMatch", name });
    }, (err) => {
      // 匹配失败：关闭子面板
      const subMatch = document.getElementById("sub-match");
      if (subMatch) subMatch.classList.remove("open");
      document.getElementById("btn-match").classList.remove("active");
      if (matchStatus) matchStatus.classList.remove("open");
      lobbyInfo(I.t("netError", { msg: String(err.message || err) }));
    });
  };
  document.getElementById("btn-match-cancel").onclick = () => {
    UnoNet.send({ t: "cancelMatch" });
    const subMatch = document.getElementById("sub-match");
    if (subMatch) subMatch.classList.remove("open");
    document.getElementById("btn-match").classList.remove("active");
    if (matchStatus) matchStatus.classList.remove("open");
  };

  // ③ 加入房间（按钮 → 展开子面板 → 输入房间号后加入）
  document.getElementById("btn-join-toggle").onclick = () => {
    const sub = document.getElementById("sub-join");
    if (sub && sub.classList.contains("open")) { closeAllSubPanels(); } else { openSubPanel("sub-join", "btn-join-toggle"); }
  };

  // ③ 加入房间（凭房间号 / 邀请链接）
  document.getElementById("btn-join-go").onclick = () => {
    const code = (document.getElementById("join-code").value || "").trim().toUpperCase();
    const name = (nameInput.value || I.t("pPlayer") + "1").trim().slice(0, 8);
    if (!code) { lobbyInfo(I.t("netError", { msg: "请输入房间号" })); return; }
    connectAnd(() => {
      isHost = false;
      UnoNet.send({ t: "join", code, name });
    }, (err) => lobbyInfo(I.t("netError", { msg: String(err.message || err) })));
  };

  document.getElementById("btn-host-start").onclick = () => {
    if (!isHost) return;
    UnoNet.send({
      t: "start",
      config: {
        ruleMode,
        stacking: ruleMode === "family" ? rules.stacking : undefined,
        sevenZero: ruleMode === "family" ? rules.sevenZero : undefined,
        drawToMatch: ruleMode === "family" ? rules.drawToMatch : undefined,
        lastMustBeNumber: ruleMode === "family" ? rules.lastNumber : undefined,
      },
    });
  };

  document.getElementById("btn-lobby-leave").onclick = leaveLobby;

  // 房主专属：添加 / 移除电脑玩家（真人与 AI 混合）
  const aiWrap = document.getElementById("lobby-ai");
  if (aiWrap) aiWrap.style.display = isHost ? "flex" : "none";
  const addAiBtn = document.getElementById("btn-add-ai");
  const rmAiBtn = document.getElementById("btn-remove-ai");
  if (addAiBtn) addAiBtn.onclick = () => { if (isHost) UnoNet.send({ t: "addAI" }); };
  if (rmAiBtn) rmAiBtn.onclick = () => { if (isHost) UnoNet.send({ t: "removeAI" }); };

  // 复制邀请链接（不再用二维码）
  const copyBtn = document.getElementById("btn-copy-link");
  if (copyBtn) copyBtn.onclick = () => {
    const link = joinURLFor(roomCode);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(() => lobbyInfo(I.t("netCopyLink") + " ✓"), () => lobbyInfo(link));
    } else {
      lobbyInfo(link);
    }
  };

  // 房主：分享面板里的公开/私人开关
  const sharePub = document.getElementById("share-public");
  if (sharePub) sharePub.onclick = () => {
    const on = sharePub.classList.toggle("on");
    sharePub.setAttribute("aria-checked", on ? "true" : "false");
    if (UnoNet.connected) UnoNet.send({ t: "setPublic", public: on });
  };

  // 局域网地址提示：仅在「本站就是局域网服务器」时才有意义（云主机/公网不显示，避免误导）
  const privateHost = location.hostname === "localhost" || location.hostname === "127.0.0.1" ||
    /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(location.hostname);
  const lanEl = document.getElementById("lobby-lan");
  if (lanEl) {
    lanEl.style.display = "none";
    if (privateHost) {
      fetch("/ip").then((r) => r.json()).then((d) => {
        if (d && d.ip && d.ip !== "localhost") {
          lanIp = d.ip;
          lanEl.textContent = I.t("netLanHint", { ip: d.ip });
          lanEl.style.display = "block";
        }
      }).catch(() => {});
    }
  }

  // 带 ?room= 打开页面时的自动加入横幅
  const params = new URLSearchParams(location.search);
  const roomParam = (params.get("room") || "").trim().toUpperCase();
  const autojoin = document.getElementById("lobby-autojoin");
  if (roomParam) {
    const jc = document.getElementById("join-code");
    if (jc) jc.value = roomParam;
    if (autojoin) autojoin.style.display = "block";
    const autoBtn = document.getElementById("btn-autojoin");
    if (autoBtn) autoBtn.onclick = () => {
      const name = (nameInput.value || I.t("pPlayer") + "1").trim().slice(0, 8);
      connectAnd(() => {
        isHost = false;
        UnoNet.send({ t: "join", code: roomParam, name });
      }, (err) => lobbyInfo(I.t("netError", { msg: String(err.message || err) })));
    };
  } else if (autojoin) {
    autojoin.style.display = "none";
  }
}

/* ---------------- 联机断线自动重连 ---------------- */
let reconnecting = false;
let reconnectTries = 0;
const RECONNECT_MAX = 10;

function showReconnectOverlay() {
  const o = document.getElementById("reconnect-overlay");
  if (o) o.hidden = false;
}
function hideReconnectOverlay() {
  const o = document.getElementById("reconnect-overlay");
  if (o) o.hidden = true;
}
function attemptReconnect() {
  if (reconnectTries >= RECONNECT_MAX) {
    hideReconnectOverlay();
    UI.floatMessage(I.t("netReconnectFail"));
    goMenu();
    return;
  }
  reconnectTries++;
  const url = defaultServerURL();
  // 先关旧 socket（清空待发队列），再连新 socket 并复用原座位重连
  try { UnoNet.close(); } catch (e) {}
  UnoNet.connect(url).then(() => {
    const nameInput = document.getElementById("net-name");
    const name = (nameInput && nameInput.value ? nameInput.value : "").toString().trim().slice(0, 8);
    UnoNet.send({ t: "rejoin", code: roomCode, seat: mySeat, name });
  }).catch(() => {
    setTimeout(attemptReconnect, 2000);
  });
}

/* ---------------- 联机分享 / 二维码 / 互联网穿透 ---------------- */
function defaultServerURL() {
  // 同源 ws：本地为 ws://host:8787，穿透后为 wss://公网域名，好友扫码打开即自动连同源，无需手填
  if (location.host) {
    const proto = location.protocol === "https:" ? "wss://" : "ws://";
    return proto + location.host;
  }
  return "ws://localhost:8787";
}
let internetUrl = ""; // 公网穿透地址（已弃用，保留变量避免引用报错）
let lanIp = "";       // 服务器 /ip 返回的局域网地址（同 Wi-Fi 好友用，避免链接拼成 localhost）
let roomPublic = true; // 当前所在房间的公开状态（房主可切换）
function joinURLFor(code) {
  if (lanIp && lanIp !== "localhost") return "http://" + lanIp + ":" + (location.port || "8787") + "/?room=" + code; // 同 Wi-Fi 用局域网 IP
  const origin = (location.origin && location.origin !== "null") ? location.origin : "http://localhost:8787";
  return origin + "/?room=" + code;
}
function showRoomShare(code) {
  const share = document.getElementById("lobby-share");
  const room = document.getElementById("lobby-room");
  if (room) room.style.display = "block";
  if (!share) return;
  share.style.display = "block";
  const badge = document.getElementById("room-code-badge");
  if (badge) badge.textContent = code;
  const pubBadge = document.getElementById("room-public-badge");
  if (pubBadge) { pubBadge.textContent = roomPublic ? I.t("netPublicState") : I.t("netPrivateState"); pubBadge.className = "room-public-badge " + (roomPublic ? "on" : "off"); }
  const sharePubRow = document.getElementById("share-public-row");
  if (sharePubRow) sharePubRow.style.display = isHost ? "flex" : "none";
}
function hideRoomShare() {
  const share = document.getElementById("lobby-share");
  if (share) share.style.display = "none";
  const room = document.getElementById("lobby-room");
  if (room) room.style.display = "none";
  roomPublic = true;
  const iu = document.getElementById("internet-url");
  if (iu) iu.style.display = "none";
  const ih = document.getElementById("internet-hint");
  if (ih) ih.style.display = "none";
}
// 已进入房间后，隐藏“三区块”入口，避免重复占座出现“分身”玩家
function hideRoomEntry() {
  const c = document.getElementById("lobby-panels");
  if (c) c.style.display = "none";
  const room = document.getElementById("lobby-room");
  if (room) room.style.display = "block";
  // 进入房间后仍允许改名：输入框失焦或回车时发送 rename
  const nameInput = document.getElementById("net-name");
  if (nameInput && !nameInput.dataset.renameBound) {
    nameInput.dataset.renameBound = "1";
    nameInput.addEventListener("change", () => {
      if (UnoNet.connected) {
        UnoNet.send({ t: "rename", name: (nameInput.value || "").trim().slice(0, 8) });
      }
    });
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") nameInput.blur();
    });
  }
}

function connectAnd(onOpen, onFail) {
  lobbyInfo(I.t("netConnecting"));
  // 服务器与网页同源托管：直接用当前站点地址连 WebSocket，无需手填服务器地址
  const url = defaultServerURL();
  UnoNet.on(handleNet);
  // 已经连着同一个服务器就直接复用，绝不再开第二个 socket（否则会重复占座、出现“分身”）
  if (UnoNet.connected) { try { onOpen(); } catch (e) { if (onFail) onFail(e); } return; }
  UnoNet.connect(url).then(onOpen).catch(onFail);
}

function lobbyInfo(text) {
  const el = document.getElementById("lobby-info");
  if (el) el.textContent = text;
}

function leaveLobby() {
  try { UnoNet.send({ t: "leave" }); } catch (e) {}
  UnoNet.close();
  netOnline = false; isHost = false; clearTurnTimer(); hostStopTurnClock();
  hideRoomShare();
  applyPlayModeUI();
  document.getElementById("menu").classList.add("active");
}

// 联机“再来一局”：保持连接与房间，所有人回到房间大厅，房主可立即重选模式开下一把
function returnToLobby() {
  Snd.setActive(false); // 离开对局回大厅：关闭音效
  game = null; pending = null; onlineEnded = false; onlineStarted = false;
  needActive = false; busy = false;
  if (unoGraceTimer) { clearTimeout(unoGraceTimer); unoGraceTimer = null; }
  hostStopTurnClock(); clearTurnTimer();
  if (typeof hideSpectateControls === "function") hideSpectateControls();
  document.getElementById("game").classList.remove("active");
  document.getElementById("menu").classList.add("active");
  const lobby = document.getElementById("lobby");
  if (lobby) lobby.style.display = "flex";
  // 已在房间内：隐藏创建/加入，保留改名能力（hideRoomEntry 已绑定一次）
  hideRoomEntry();
  document.getElementById("btn-lobby-leave").style.display = "inline-block";
  if (isHost) showRoomShare(roomCode); else hideRoomShare();
  UI.hideWin();
  // 房主重选模式后点「开始游戏」即可；玩家列表由 lobby 消息刷新
}

function handleNet(msg) {
  if (!msg) return;
  switch (msg.t) {
    case "created":
      mySeat = msg.seat; roomCode = msg.code; roomPublic = !!msg.public;
      netOnline = true;
      // 保存联机会话信息：刷新后可用于检测"是否在对局中"并尝试恢复
      try { sessionStorage.setItem("uno_online_session", JSON.stringify({ roomCode: msg.code, seat: msg.seat, isHost: true, ts: Date.now() })); } catch(e) {}
      document.getElementById("btn-lobby-leave").style.display = "inline-block";
      { const ms = document.getElementById("sub-match"); if (ms) ms.classList.remove("open"); }
      document.getElementById("lobby-panels").style.display = "none";
      hideRoomEntry();
      lobbyInfo(I.t("netRoomCode", { code: msg.code }) + " " + I.t("netYouAreHost"));
      showRoomShare(msg.code);
      if (isHost) { const a = document.getElementById("lobby-ai"); if (a) a.style.display = "flex"; }
      break;
    case "joined":
      mySeat = msg.seat; roomCode = msg.code; roomPublic = !!msg.public;
      netOnline = true;
      // 保存联机会话信息
      try { sessionStorage.setItem("uno_online_session", JSON.stringify({ roomCode: msg.code, seat: msg.seat, isHost: false, ts: Date.now() })); } catch(e) {}
      document.getElementById("btn-lobby-leave").style.display = "inline-block";
      { const ms = document.getElementById("sub-match"); if (ms) ms.classList.remove("open"); }
      document.getElementById("lobby-panels").style.display = "none";
      hideRoomEntry();
      lobbyInfo(I.t("netRoomCode", { code: msg.code }));
      if (!isHost) { const a = document.getElementById("lobby-ai"); if (a) a.style.display = "none"; }
      break;
    case "matchmaking":
      // 进入随机匹配等待队列：显示三按钮 + 匹配状态子面板
      document.getElementById("lobby-panels").style.display = "";
      { const ms = document.getElementById("sub-match"); if (ms) ms.classList.add("open"); }
      document.getElementById("match-status-text").textContent = I.t("netMatching");
      document.getElementById("lobby-room").style.display = "none";
      break;
    case "matchCanceled":
      // 取消匹配：回到三按钮
      { const ms = document.getElementById("sub-match"); if (ms) ms.classList.remove("open"); }
      break;
    case "error":
      lobbyInfo(I.t("netError", { msg: msg.msg }));
      if (reconnecting) { hideReconnectOverlay(); goMenu(); }
      break;
    case "lobby": {
      const names = (msg.players || []).map((p) => p.name);
      const wrap = document.getElementById("lobby-players");
      wrap.innerHTML = "";
      (msg.players || []).forEach((p) => {
        const d = document.createElement("div");
        d.className = "lobby-player" + (p.seat === msg.hostSeat ? " host" : "") + (p.isAI ? " ai" : "");
        d.textContent = p.name + (p.seat === msg.hostSeat ? " 👑" : "") + (p.isAI ? " 🤖" : "");
        wrap.appendChild(d);
      });
      document.getElementById("lobby-host").style.display =
        isHost && names.length >= 2 ? "block" : "none";
      // 电脑玩家控件：仅房主可见（客人看不到，也不能增减）
      const aiWrap = document.getElementById("lobby-ai");
      if (aiWrap) aiWrap.style.display = isHost ? "flex" : "none";
      // 公开/私人徽标 + 房主可切换
      roomPublic = !!msg.public;
      const badge = document.getElementById("room-public-badge");
      if (badge) { badge.textContent = roomPublic ? I.t("netPublicState") : I.t("netPrivateState"); badge.className = "room-public-badge " + (roomPublic ? "on" : "off"); }
      const sharePubRow = document.getElementById("share-public-row");
      if (sharePubRow) sharePubRow.style.display = isHost ? "flex" : "none";
      const sharePub = document.getElementById("share-public");
      if (sharePub) { sharePub.classList.toggle("on", roomPublic); sharePub.setAttribute("aria-checked", roomPublic ? "true" : "false"); }
      break;
    }
    case "reseat": {
      // “再来一局”前服务器重排座位：有人退出时剩余玩家座位前移，据此更新自己的座位/房主身份
      mySeat = msg.seat;
      isHost = !!msg.isHost;
      if (msg.code) roomCode = msg.code;
      UI.mySeat = mySeat;
      break;
    }
    case "rematchAsk": {
      // 非房主请求“再来一局”，房主收到后直接重开（房主权威）
      if (isHost) {
        UI.floatMessage(I.t("netRematchAsk", { name: msg.name || ("P" + msg.from) }));
        doOnlineRematch();
      }
      break;
    }
    case "start":
      onlineStart(msg.names, msg.config, msg.ai);
      break;
    case "state":
      if (msg.state) onState(msg.state);
      break;
    case "need":
      onNeed(msg);
      break;
    case "intent":
      onIntent(msg);
      break;
    case "peerLeft":
      if (isHost) hostRemovePlayer(msg.seat); // 房主从引擎移除该玩家并继续/结束
      else UI.floatMessage(I.t("netPeerLeft", { name: msg.name || ("P" + msg.seat) }));
      break;
    case "closed":
      // 房主已离开 / 房间关闭：所有客户端（含客人）一致回到主菜单，
      // 避免出现“客人卡在房间、房主却已退出”这种两端状态不一致的情况
      UI.floatMessage(I.t("netClosed"));
      hostStopTurnClock(); clearTurnTimer();
      hideReconnectOverlay();
      goMenu();
      break;
    case "rejoined":
      // 重连成功：复用原座位，隐藏重连遮罩，恢复对局
      mySeat = msg.seat;
      isHost = !!msg.isHost;
      if (msg.code) roomCode = msg.code;
      UI.mySeat = mySeat;
      reconnecting = false;
      reconnectTries = 0;
      hideReconnectOverlay();
      break;
    case "resend":
      // 房主被请求重发当前状态（某位玩家重连后）：房主权威重发
      if (typeof hostResync === "function") hostResync();
      break;
    case "backToLobby":
      // 房主在对局结束后点“返回大厅”：所有人（含房主）回到大厅，可重新调整机器人/规则
      if (typeof returnToLobby === "function") returnToLobby();
      break;
    case "disconnected":
      if (onlineStarted && !reconnecting) {
        // 对局中瞬时掉线：不直接踢回主菜单，尝试自动重连复用原座位
        reconnecting = true;
        reconnectTries = 0;
        showReconnectOverlay();
        attemptReconnect();
      } else if (!onlineStarted) {
        lobbyInfo(I.t("netDisconnected"));
      }
      break;
  }
}
