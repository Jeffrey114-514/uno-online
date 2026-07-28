/* =========================================================
 * main.js — 控制器：三模式菜单、回合调度、交互、Merc y、双语
 * ========================================================= */
  "use strict";
  const UI = window.UnoUI;
  const C = window.UnoCards;
  const Snd = window.UnoSound;
  const I = window.UnoI18n;

  let game = null;
  let busy = false;
  let passTimer = null;     // 本地摸牌后“自动过牌”计时器（摸牌即视为过）
  let unoGraceTimer = null; // 本地 UNO 宽限窗口计时器
  const UNO_GRACE_MS = 3000; // 仅剩 1 张且未喊 UNO 时，给玩家补喊的宽限时长
  const AI_FORGET_UNO_PROB = 0.2; // AI 偶尔“忘了喊 UNO”的概率（10%-30% 区间，取 20%）
  let lastPlayers = null;
  let difficulty = "normal";
  let aiAuto = false;      // AI 托管：开启后人类玩家回合由 AI 自动出牌
  let aiAutoTimer = null;  // AI 托管触发去抖定时器
  let rules = { stacking: true, sevenZero: true, drawToMatch: true, lastNumber: true }; // 家庭规则（默认全开）
  let matchScores = {};
  let matchRound = 0;
  let mercyAnnounced = new Set();

  // 菜单状态
  let ruleMode = "classic"; // 'classic' | 'family' | 'noMercy'
  let playMode = "ai";      // 'ai' | 'local' | 'online'
  let aiCount = 1;
  let totalPlayers = 2;
  let localNames = [];      // 本地多人：各玩家昵称

  // 在线联机状态
  let isHost = false;
  let mySeat = 0;
  let roomCode = "";
  let pending = null;       // {type:'color'|'swap'|'roulette', from, cardId?, res?}
  let needActive = false;   // 客户端：onNeed 弹了模态且未回复时为 true，防止 onlineRender 误关
  let onlineStarted = false;
  let onlineEnded = false;
  let rematchPending = false; // 已发起“再来一局”，等待服务器 start 广播，避免重复触发
  let netOnline = false;    // 是否已连接服务器
  let lastShownSeq = -1;    // 联机播报去重：已展示的事件序号
  let turnStartedAt = 0;    // 房主权威回合开始时间戳（ms）
  let hostTurnInterval = null; // 房主端回合超时检测定时器
  let hostAITimer = null;       // 房主权威：联机中电脑玩家(AI 座位)的自动出牌定时器


  /* 关闭/刷新页面：不再主动发 leave（避免刷新被踢出）。
     依赖 server.js 的 RECONNECT_GRACE=60s 宽限：
     - 关标签页：WS 断开 → 60s 内无重连 → 自动移除（体验可接受）
     - 刷新页面：WS 断开 → 页面快速重载 → WS 在 60s 内重连 → rejoin 成功 */

  /* 所有客户端（含房主）进入游戏页 */
  function onlineStart(names, config, aiArr) {
    resetGameUI();  // ← 联机开局也先彻底重置
    UI.mode = "online";
    UI.mySeat = mySeat;
    UI.hideWin();              // 再来一局：关闭上一局的胜利结算层
    hideSpectateControls();
    rematchPending = false;    // 新一局已开，复位再战守卫
    if (unoGraceTimer) { clearTimeout(unoGraceTimer); unoGraceTimer = null; }
    if (hostAITimer) { clearTimeout(hostAITimer); hostAITimer = null; }
    hostStopTurnClock(); // 清掉上一局可能残留的房主回合时钟
    const players = (names || []).map((n, i) => ({ name: n, isAI: !!(aiArr && aiArr[i]) }));
    game = new window.UnoGame({
      players,
      difficulty: "normal",
      mode: config.ruleMode || ruleMode,
      stacking: config.ruleMode === "family" ? config.stacking : undefined,
      sevenZero: config.ruleMode === "family" ? config.sevenZero : undefined,
      drawToMatch: config.ruleMode === "family" ? config.drawToMatch : undefined,
      lastMustBeNumber: config.ruleMode === "family" ? config.lastMustBeNumber : undefined,
    });
    UI.setNoMercy(game.sevenZero);
    if (typeof Router !== 'undefined') Router.navigate("game");
    else { document.getElementById("menu").classList.add("screen-hidden"); document.getElementById("game").classList.add("screen-active"); }
    UI.buildSeats(game);
    onlineStarted = true;
    onlineEnded = false;
    pending = null;
    Snd.setActive(true); // 进入联机对局：开启音效

    if (isHost) {
      game.start();
      hostStartTurnClock();
      lastShownSeq = -1;
      turnStartedAt = Date.now();
      hostBroadcast();
      hostBeginTurn();
    } else {
      UI.setStatus(I.t("connecting"));
    }
  }

  /* ---------- 房主：权威回合编排 ---------- */
  function hostBroadcast() {
    if (!game) return;
    game.turnDeadline = turnStartedAt + TURN_SECONDS * 1000; // 房主墙钟截止（房主自己用）
    game.turnSeconds = Math.max(0, Math.ceil((game.turnDeadline - Date.now()) / 1000)); // 剩余秒数（与墙钟无关，客户端据此本地倒数）
    game.pendingNeed = pending ? { type: pending.type, from: pending.from } : null; // 告知客户端当前有待处理动作
    game.players.forEach((p, seat) => {
      if (isHost && seat === 0) return; // 房主本地已渲染
      const s = game.serialize();
      s.players = s.players.map((pl) =>
        pl.seat === seat ? pl : Object.assign({}, pl, { hand: new Array(pl.hand.length).fill(null) })
      );
      UnoNet.send({ t: "state", to: seat, state: s });
    });
  }

  function renderAnnounce() {
    if (!game) return;
    if (game.eventSeq !== lastShownSeq) {
      lastShownSeq = game.eventSeq;
      if (game.lastEvent) UI.announce(game.lastEvent.text, game.lastEvent.type);
    }
  }

  function hostRender() {
    const myTurn = !game.over && game.current === 0;
    const meEliminated = game.players[0] && game.players[0].eliminated;
    UI.renderAll(game, myTurn);
    refreshUno();
    if (game.over) { if (!onlineEnded) { onlineEnded = true; endGame(); } return; }
    onlineEnded = false;
    if (meEliminated) {
      UI.setStatus(I.t("spectating", { name: game.players[game.current].name }));
    } else if (myTurn) {
      if (game.pendingDraw > 0) UI.setStatus(I.t("stackRespond", { n: game.pendingDraw }));
      else UI.setStatus(I.t("yourTurn"));
      maybeAiAuto(); // AI 托管（联机）：轮到自己时自动出牌
    } else {
      UI.setStatus(I.t("waitTurn", { name: game.players[game.current].name }));
    }
    busy = !myTurn;
    // 所有客户端统一展示“当前回合玩家”的剩余时间（房主权威驱动）
    startTurnTimer(game.current, true);
    renderAnnounce();
  }

  function hostBeginTurn() {
    checkMercyAnnounce();
    if (game.checkEnd()) { hostEnd(); return; }
    if (game.isDeadlocked()) {
      let fewest = game.players.find((p) => !p.eliminated) || game.players[0];
      game.players.forEach((p) => { if (!p.eliminated && p.hand.length < fewest.hand.length) fewest = p; });
      game.winner = fewest; game.over = true; hostEnd(); return;
    }
    // 房主本人被淘汰：显示观战控件（剩余全是 AI 时给「快速结束」按钮），不再立即结束
    if (game.players[0] && game.players[0].eliminated) {
      showSpectateControls();
    } else {
      hideSpectateControls();
    }
    turnStartedAt = Date.now(); // 新回合：重置房主权威倒计时
    const cur = game.current;
    if (game.forceDraw && game.pendingDraw === 0 && game.playableCards(cur).length === 0) {
      game.drawToPlayable(cur);
      if (game.checkEnd()) { hostEnd(); return; }
    }
    hostBroadcast();
    hostRender();

    // 联机中的电脑玩家(AI 座位)：轮到它时由房主权威直接代打（AI 无真实客户端，不会发来 intent）
    if (!game.over && !pending && game.players[cur] && game.players[cur].isAI) {
      if (hostAITimer) clearTimeout(hostAITimer);
      hostAITimer = setTimeout(() => hostAITurn(cur), 800);
    }
  }

  /* 房主权威：替联机里的电脑玩家(AI 座位)走一步 */
  function hostAITurn(idx) {
    if (!isHost || !game || game.over) return;
    if (game.current !== idx) return;
    if (pending && pending.from != null && pending.from !== idx) return; // 当前有待他人处理的动作则让位
    const move = window.UnoAI.chooseMove(game, idx);
    if (!move) { hostAutoActFor(idx); return; }
    // AI 提前喊 UNO，避免打到剩 1 张被误判罚摸
    if (game.players[idx].hand.length === 2) game.players[idx].saidUno = true;
    if (move.action === "draw") hostDraw(idx);
    else hostPlay(idx, move.cardId, move.color || null);
  }

  function hostProceed(effect) {
    game.advanceTurn(effect);
    hostBeginTurn();
  }

  function hostPlay(from, cardId, color) {
    const card = game.players[from].hand.find((c) => c.id === cardId);
    if (!card || !game.isPlayable(card)) return;

    // 颜色轮盘：下家选色，本家不自选
    if (card.type === "wildColorRoulette") {
      const res = game.playCard(from, cardId, null);
      if (!res) return;
      hostAfterPlay(from, res);
      return;
    }
    // 普通万能牌：已带颜色则直接出（修复联机点万能牌时颜色弹窗无限循环），否则请求选色
    if (C.isWild(card)) {
      if (color) {
        const res = game.playCard(from, cardId, color);
        if (res) hostAfterPlay(from, res);
      } else {
        pending = { type: "color", from, cardId };
        UnoNet.send({ t: "need", to: from, kind: "color" });
        turnStartedAt = Date.now(); // 模态开始：房主权威时钟给足完整时间
        hostRender();
      }
      return;
    }
    // 其余牌正常打出（7/0 的换牌/传牌由 hostAfterPlay → hostSpecial 统一处理，
    // 因为 7 牌的 type 是 "number"，不能用 card.type === "seven" 判断）
    const res = game.playCard(from, cardId, color);
    if (!res) return;
    hostAfterPlay(from, res);
  }

  function hostAfterPlay(from, res) {
    UI.renderAll(game, false);
    announcePlay(game.players[from], res);
    playEffectSound(res);
    if (game.checkEnd()) { hostEnd(); return; }
    // UNO 宽限窗口：仅剩 1 张且未喊 UNO 时给一次补喊机会（disardAll 等一次出多张也能覆盖）
    if (game.players[from].hand.length === 1 && !game.players[from].saidUno && !game.players[from].isAI) {
      game.unoGrace = { seat: from, deadline: Date.now() + UNO_GRACE_MS };
    }
    // 电脑玩家(AI)：打到剩 1 张通常自动喊 UNO，但偶尔也会“忘喊”（与人类一致，按概率进入宽限被罚）
    if (game.players[from].isAI && game.players[from].hand.length === 1) {
      if (Math.random() < AI_FORGET_UNO_PROB) {
        game.unoGrace = { seat: from, deadline: Date.now() + UNO_GRACE_MS };
      } else {
        game.players[from].saidUno = true;
      }
    }
    if (res.effect === "colorRoulette") { hostRoulette(res.nextIdx); return; }
    // 7-0 换牌 / 传牌（联机：房主权威编排）
    if (res.special === "seven" || res.special === "zero") { hostSpecial(from, res); return; }
    hostProceed(res.effect);
  }

  /* 联机 7-0 编排（房主权威）：7 换牌 / 0 传牌 */
  function hostSpecial(from, res) {
    game.unoGrace = null; // 换牌/传牌会改变手牌，宽限窗口作废
    if (res.special === "zero") {
      game.zeroRotate();
      UI.renderAll(game, false);
      UI.announce(I.t("aZero"), "reverse");
      Snd.play("reverse");
      if (game._checkMercy) game._checkMercy();
      hostBroadcast();
      if (game.checkEnd()) { hostEnd(); return; }
      hostProceed(res.effect);
      return;
    }
    // seven 换牌
    const targets = game.players.map((_, i) => i).filter((i) => i !== from && !game.players[i].eliminated);
    if (targets.length === 0) { hostProceed(res.effect); return; }
    if (from === 0) {
      // 房主（座位 0）：人类弹窗选择，AI 自动选；仅 1 个目标自动换
      if (game.players[0].isAI || targets.length === 1) {
        applyHostSwap(0, targets.length === 1 ? targets[0] : aiPickSwap(0), res);
      } else {
        UI.showSevenModal(game, 0, (tgt) => applyHostSwap(0, tgt, res));
      }
    } else if (game.players[from].isAI) {
      // 电脑玩家出 7：自动挑手牌最少的对手换牌（不向空 socket 发 need）
      applyHostSwap(from, aiPickSwap(from), res);
    } else {
      pending = { type: "swap", from, res };
      UnoNet.send({ t: "need", to: from, kind: "swap", targets });
      turnStartedAt = Date.now();
      hostBroadcast();
    }
  }

  function applyHostSwap(from, tgt, res) {
    if (tgt == null || tgt < 0 || tgt === from) { hostProceed(res.effect); return; }
    game.sevenSwap(from, tgt);
    if (game._checkMercy) game._checkMercy();
    UI.renderAll(game, false);
    UI.announce(I.t("aSeven", { name: game.players[from].name, name2: game.players[tgt].name }), "reverse");
    Snd.play("reverse");
    hostBroadcast();
    if (game.checkEnd()) { hostEnd(); return; }
    hostProceed(res.effect);
  }

  function hostRoulette(idx) {
    const target = game.players[idx];
    const done = (chosen) => {
      game.resolveRoulette(idx, chosen);
      UI.renderAll(game, false);
      UI.announce(I.t("aRoulette", { name: target.name, color: I.colorName(chosen) }), "draw");
      Snd.play("draw");
      pending = null;
      hostBroadcast();
      if (game.checkEnd()) { hostEnd(); return; }
      hostBeginTurn();
    };
    if (idx === 0) {
      // 房主作为轮盘受害者（下家）：弹出选色，由房主自主决定，不再电脑代选
      pending = { type: "roulette", from: 0 };
      needActive = true;
      UI.showColorModal((chosen) => {
        UI.onColor = null;
        UI.hideColorModal();
        if (!needActive) return; // 房主权威已超时自动解决（超时代打）
        needActive = false;
        clearTurnTimer();
        if (game.over) return;
        done(chosen);
      });
      startTurnTimer(0, false); // 模态也计 15s，超时自动选色
      hostRender();
    } else if (game.players[idx].isAI) {
      // 电脑玩家作为轮盘受害者（下家）：房主权威直接代选，不向空 socket 发 need
      done(bestColor(target));
    } else {
      pending = { type: "roulette", from: idx };
      UnoNet.send({ t: "need", to: idx, kind: "color" });
      turnStartedAt = Date.now();
      hostRender();
    }
  }

  function hostDraw(from) {
    if (game.pendingDraw > 0) {
      const pd = game.absorbPenalty(from);
      UI.renderAll(game, false);
      UI.floatMessage(I.t("fAbsorb", { n: pd }));
      Snd.play("draw");
      hostBroadcast();
      if (game.checkEnd()) { hostEnd(); return; }
      hostProceed("absorb");
      return;
    }
    if (game.forceDraw) {
      game.drawToPlayable(from);
      hostBroadcast();
      if (game.checkEnd()) { hostEnd(); return; }
      hostBeginTurn();
      return;
    }
    const drawn = game.drawOne(from);
    if (!drawn) { hostProceed("normal"); return; }
    Snd.play("draw");
    UI.renderAll(game, false);
    UI.floatMessage(I.t("fDraw", { name: game.players[from].name }));
    hostBroadcast();
    // 摸到 25 张触发 Mercy 淘汰：手牌已转移，直接推进回合，避免出“已不在手里的牌”导致回合卡死
    if (game.players[from].eliminated) {
      checkMercyAnnounce();
      hostProceed("normal");
      return;
    }
    if (game.isPlayable(drawn)) {
      if (game.drawToMatch) {
        // 电脑玩家摸到万能牌：自动选最多色的颜色，避免向空 socket 发选色请求
        const col = (C.isWild(drawn) && game.players[from].isAI) ? bestColor(game.players[from]) : null;
        hostPlay(from, drawn.id, col);
      } else hostProceed("normal");
    } else {
      hostProceed("normal");
    }
  }

  function hostEnd() {
    hostStopTurnClock();
    if (hostAITimer) { clearTimeout(hostAITimer); hostAITimer = null; }
    hostBroadcast();
    hostRender(); // 先绘制最终座位（含出局者），game.over 时进入 endGame
  }

  // 房主处理某座位中途退出：标记出局，若轮到他则推进回合，存活≤1 结束
  function hostRemovePlayer(seat) {
    if (!game || seat == null || !game.players[seat] || game.players[seat].eliminated) return;
    const name = game.players[seat].name;
    game.players[seat].eliminated = true;
    game.players[seat].hand = game.players[seat].hand || [];
    if (game.over) {
      // 游戏已结束（胜利结算中）：仅刷新座位展示，让房主立即看到该玩家已离开，与客人状态保持一致
      UI.announce(I.t("fPeerLeft", { name }), "leave");
      UI.renderSeats(game);
      return;
    }
    // 若正好轮到离开者，把回合推进到下一位存活者
    let next = game.current;
    if (game.current === seat) {
      let guard = 0;
      do { next = game.stepIdx(next, 1); guard++; } while (game.players[next].eliminated && guard < 16);
      game.current = next;
    }
    setLastEvent(seat, "leave", I.t("fPeerLeft", { name }));
    UI.announce(I.t("fPeerLeft", { name }), "leave");
    hostBroadcast();
    if (game.checkEnd()) { hostEnd(); return; }
    hostBeginTurn();
  }

  /* ---------- 联机“再来一局”：房主端触发直接重开 ---------- */
  function doOnlineRematch() {
    if (rematchPending) return;   // 去重：已发起则忽略后续点击/请求
    rematchPending = true;
    UI.hideWin();
    UnoNet.send({ t: "rematch" }); // 服务器重排座位并广播 start，所有人直接重开
  }

  /* ---------- 客户端：接收状态并渲染 ---------- */
  function onState(state) {
    if (!game) return;
    game.applyState(state);
    onlineRender();
  }

  function onlineRender() {
    const myTurn = !game.over && game.current === mySeat;
    const meEliminated = game.players[mySeat] && game.players[mySeat].eliminated;
    UI.setNoMercy(game.sevenZero); // 同步 No Mercy 图标显示
    if (passTimer) { clearTimeout(passTimer); passTimer = null; }
    UI.renderAll(game, myTurn);
    refreshUno();
    // 如果 needActive=true 但状态显示已无待处理动作（pendingNeed=null），
    // 说明房主已自动解决（超时代打）或已处理完毕，强制关闭弹窗
    if (needActive && !game.pendingNeed) { needActive = false; }
    if (!needActive) { UI.hideColorModal(); UI.hideSevenModal(); }
    if (game.over) { needActive = false; if (!onlineEnded) { onlineEnded = true; endGame(); } return; }
    onlineEnded = false;
    if (meEliminated) {
      UI.setStatus(I.t("spectating", { name: game.players[game.current].name }));
    } else if (myTurn) {
      if (game.pendingDraw > 0) UI.setStatus(I.t("stackRespond", { n: game.pendingDraw }));
      else UI.setStatus(I.t("yourTurn"));
      maybeAiAuto(); // AI 托管（联机）：轮到自己时自动出牌
    } else {
      UI.setStatus(I.t("waitTurn", { name: game.players[game.current].name }));
    }
    busy = !myTurn;
    // 非自己回合：禁用摸牌堆（视觉 + 交互双重防护）
    const dp = document.getElementById("draw-pile");
    if (dp) dp.classList.toggle("locked", !myTurn || meEliminated);
    // 倒计时只读展示：所有客户端显示当前回合玩家的剩余时间（由房主权威 turnDeadline 驱动）
    startTurnTimer(game.current, false);
    renderAnnounce();
  }

  function onNeed(msg) {
    needActive = true;
    // AI 托管：自动回应选色 / 换牌，无需弹窗，避免卡在 need 等待
    if (aiAuto) {
      if (msg.kind === "color") {
        const color = bestColor(game.players[mySeat]);
        needActive = false; clearTurnTimer();
        UnoNet.send({ t: "intent", action: "color", color });
        return;
      } else if (msg.kind === "swap") {
        const targets = msg.targets || [];
        const tgt = targets.length ? targets[0] : null;
        needActive = false; clearTurnTimer();
        UnoNet.send({ t: "intent", action: "swap", target: tgt });
        return;
      }
    }
    if (msg.kind === "color") {
      UI.showColorModal((color) => {
        UI.onColor = null; // 防止回调重复触发
        UI.hideColorModal();
        if (!needActive) return; // 房主已自动解决（超时代打），丢弃本次选择
        needActive = false;
        clearTurnTimer();
        UnoNet.send({ t: "intent", action: "color", color });
      });
      startTurnTimer(mySeat, false); // 模态也计 15s，超时自动选色
    } else if (msg.kind === "swap") {
      const targets = msg.targets || [];
      UI.showSevenModal(game, mySeat, (target) => {
        UI.hideSevenModal();
        if (!needActive) return;
        needActive = false;
        clearTurnTimer();
        UnoNet.send({ t: "intent", action: "swap", target });
      });
      startTurnTimer(mySeat, false); // 模态也计 15s，超时自动选换牌对象
    }
  }

  function onlineCardClick(cardId) {
    // 有待处理动作（万能牌选色 / 轮盘下家选色 / 7 换牌）时禁止再出牌：
    // 否则房主打出万能牌后 pending 已设但回合未推进，game.current 仍是自己，
    // 可再次点牌打出第二张（"开局第一位出两张牌""下家选色时我可继续出牌"同一根因）。
    if (pending) return;
    clearTurnTimer();
    if (game.over || game.current !== mySeat) return;
    const card = game.players[mySeat].hand.find((c) => c.id === cardId);
    if (!card || !game.isPlayable(card)) { if (UI.onInvalid) UI.onInvalid(); return; }
    if (isHost) {
      if (card.type !== "wildColorRoulette" && C.isWild(card)) {
        pending = { type: "color", from: 0, cardId };
        UI.showColorModal((color) => { UI.hideColorModal(); pending = null; hostPlay(0, cardId, color); });
        turnStartedAt = Date.now(); // 模态开始计时（房主权威时钟给足完整时间）
      } else {
        // 普通牌/功能牌：hostPlay → hostAfterPlay → hostProceed 同步推进回合，
        // game.current 立即变更，后续点牌会被 game.current!==mySeat 拦截，无需 busy。
        hostPlay(0, cardId, null);
      }
    } else {
      UnoNet.send({ t: "intent", action: "play", cardId });
      busy = true; UI.renderAll(game, false);
    }
  }

  function onlineDraw() {
    if (pending) return; // 有待处理动作时禁止摸牌（同 onlineCardClick）
    if (game.over || game.current !== mySeat) return; // 非自己回合禁止摸牌
    clearTurnTimer();
    if (isHost) { hostDraw(0); return; }
    UnoNet.send({ t: "intent", action: "draw" });
    busy = true; UI.renderAll(game, false);
  }

  function onlineUno() {
    if (isHost) {
      // 房主：当前回合且剩 2 张（提前喊），或正处于 UNO 宽限窗口（剩 1 张忘喊），都算有效喊 UNO
      if ((game.current === 0 && game.players[0].hand.length <= 2) || (game.unoGrace && game.unoGrace.seat === 0)) {
        game.players[0].saidUno = true;
        game.unoGrace = null;
        UI.renderSeats(game); refreshUno(); UI.floatMessage(I.t("fUno")); Snd.play("uno");
        hostBroadcast(); hostRender();
      }
      return;
    }
    UnoNet.send({ t: "intent", action: "uno" });
  }

  /* ---------- 联机回合倒计时（房主权威 + 客户端只读展示） ---------- */
  const TURN_SECONDS = 15;
  let turnTimer = null; // { seat, handle }

  function hideTurnTimer() {
    const el = document.getElementById("turn-timer");
    if (el) el.hidden = true;
  }

  function updateTimerUI(sec) {
    const el = document.getElementById("turn-timer");
    if (!el) return;
    const num = el.querySelector(".timer-num");
    const ring = el.querySelector(".timer-ring-fg");
    const C = 2 * Math.PI * 20; // r=20
    // 联机对局中始终显示当前回合倒计时：回合切换瞬间也保持可见（仅显示 0），避免“时有时无”
    el.hidden = false;
    if (ring) { ring.style.strokeDasharray = C.toFixed(2); }
    if (!sec || sec <= 0) {
      if (num) num.textContent = "0";
      if (ring) ring.style.strokeDashoffset = C.toFixed(2);
      el.classList.add("low");
      return;
    }
    if (num) num.textContent = sec;
    if (ring) {
      const frac = Math.max(0, Math.min(1, sec / TURN_SECONDS));
      ring.style.strokeDashoffset = (C * (1 - frac)).toFixed(2);
    }
    el.dataset.sec = sec;
    if (sec <= 5) el.classList.add("low"); else el.classList.remove("low");
  }

  function clearTurnTimer() {
    if (turnTimer && turnTimer.handle) clearInterval(turnTimer.handle);
    turnTimer = null;
    hideTurnTimer();
  }

  // 客户端倒计时只做“展示”：房主广播剩余秒数(turnSeconds)，客户端按收到时刻换算本地截止时间后本地倒数，
  // 不再跨机比较墙钟，时钟偏差也不会让倒计时消失。房主自己用 turnDeadline（本机墙钟）。
  function startTurnTimer(seat, hostSide) {
    if (!netOnline || !game) return;
    if (turnTimer && turnTimer.seat === game.current) return; // 同一当前回合不重置
    clearTurnTimer();
    const endLocal = hostSide
      ? (game.turnDeadline || 0)
      : (Date.now() + (game.turnSeconds || 0) * 1000);
    turnTimer = { seat: game.current, endLocal, handle: null };
    tickTimer(); // 立即刷新一次显示
    turnTimer.handle = setInterval(tickTimer, 250);
  }

  function tickTimer() {
    if (!turnTimer || !game || game.over) { clearTurnTimer(); return; }
    if (!turnTimer.endLocal) { clearTurnTimer(); return; }
    const remaining = Math.max(0, Math.ceil((turnTimer.endLocal - Date.now()) / 1000));
    updateTimerUI(remaining); // 仅展示；归零也由房主代打，不在此强制
  }

  /* ---- 房主权威回合时钟：超时由房主代为出牌/摸牌/自动选色换牌 ---- */
  function hostStartTurnClock() {
    if (hostTurnInterval) return;
    hostTurnInterval = setInterval(hostTickTurn, 500);
  }
  function hostStopTurnClock() {
    if (hostTurnInterval) { clearInterval(hostTurnInterval); hostTurnInterval = null; }
  }
  function hostTickTurn() {
    if (!isHost || !game || game.over || !netOnline) return;
    // UNO 宽限到期：仅剩 1 张且未喊 → 罚摸 2
    if (game.unoGrace) {
      const g = game.unoGrace;
      if (Date.now() >= g.deadline) {
        game.unoGrace = null;
        const p = game.players[g.seat];
        if (p && !p.eliminated && !p.saidUno && p.hand.length === 1) {
          const penalty = game.enforceUno(g.seat);
          if (penalty) UI.floatMessage(I.t("fUnoForgot", { name: p.name, n: penalty }));
          hostBroadcast();
          hostRender();
        }
        return; // 本 tick 不再处理回合超时，避免叠加动作
      }
    }
    if (Date.now() - turnStartedAt < TURN_SECONDS * 1000) return;
    turnStartedAt = Date.now(); // 防重入，直到本回合被推进后由 hostBeginTurn 重置
    // 优先处理待处理动作的玩家（轮盘/选色/换牌），否则当前回合玩家
    const targetSeat = (pending && pending.from != null) ? pending.from : game.current;
    hostAutoActFor(targetSeat);
  }

  // 房主自动出牌：复用既有编排；万能牌直接带色出（绕开 hostPlay 自问自答的弹窗）
  function hostAutoPlay(seat, card) {
    if (card.type === "seven") { hostPlay(seat, card.id, null); return; }
    if (card.type === "wildColorRoulette") { hostPlay(seat, card.id, null); return; }
    if (C.isWild(card)) { hostPlay(seat, card.id, bestColor(game.players[seat])); return; }
    hostPlay(seat, card.id, null);
  }

  // 房主权威代打（超时 / 远端挂机）：对当前座位执行一次合法动作
  function hostAutoActFor(seat) {
    if (!game || game.over) return;
    // 允许当前回合玩家，或有待处理动作的玩家（轮盘受害者可能不是 current）
    if (game.current !== seat && !(pending && pending.from === seat)) return;
    // 1) 选色 / 万能：本家或远端
    if (pending && pending.type === "color" && pending.from === seat) {
      const cid = pending.cardId; pending = null;
      UI.hideColorModal();
      const res = game.playCard(seat, cid, bestColor(game.players[seat]));
      if (res) hostAfterPlay(seat, res);
      return;
    }
    // 2) 颜色轮盘（远端 / 房主超时自动选色）
    if (pending && pending.type === "roulette" && pending.from === seat) {
      const idx = seat; pending = null;
      needActive = false; UI.hideColorModal(); // 复位房主模态状态（房主为受害者且超时）
      const col = bestColor(game.players[idx]);
      game.resolveRoulette(idx, col);
      UI.renderAll(game, false);
      UI.announce(I.t("aRoulette", { name: game.players[idx].name, color: I.colorName(col) }), "draw");
      Snd.play("draw");
      hostBroadcast();
      if (game.checkEnd()) { hostEnd(); return; }
      hostBeginTurn();
      return;
    }
    // 3) 7 换牌（远端超时代打）
    if (pending && pending.type === "swap" && pending.from === seat) {
      const res = pending.res; const tgt = aiPickSwap(seat); pending = null;
      applyHostSwap(seat, tgt, res);
      return;
    }
    // 4) 普通回合：出第一张可出的牌（优先非万能），否则摸牌
    const hand = game.players[seat].hand;
    const playable = hand.filter((c) => game.isPlayable(c));
    const pick = playable.find((c) => !C.isWild(c)) || playable[0];
    if (pick) {
      UI.floatMessage(I.t("fAutoPlay", { name: game.players[seat].name }));
      hostAutoPlay(seat, pick);
    } else {
      UI.floatMessage(I.t("fAutoPlay", { name: game.players[seat].name }));
      hostDraw(seat);
    }
  }

  /* 房主收到远程意图 */
  function onIntent(msg) {
    if (!isHost || !game || game.over) return;
    // 喊 UNO 不受“是否当前回合”限制：打完牌后可能已轮到别人，但仍在宽限窗口内
    if (msg.action === "uno") {
      const p = game.players[msg.from];
      if (p && !p.eliminated) {
        p.saidUno = true;
        game.unoGrace = null;
      }
      hostBroadcast();
      hostRender();
      return;
    }
    // 允许当前回合玩家的意图，或有待处理动作(轮盘选色/万能选色/换牌)的玩家
    if (game.current !== msg.from && !(pending && pending.from === msg.from)) return;
    switch (msg.action) {
      case "play":
        if (pending) return;
        hostPlay(msg.from, msg.cardId);
        break;
      case "draw":
        if (pending) return;
        hostDraw(msg.from);
        break;
      case "color":
        if (pending && pending.type === "color" && msg.from === pending.from) {
          const cid = pending.cardId; pending = null;
          hostPlay(msg.from, cid, msg.color);
        } else if (pending && pending.type === "roulette" && msg.from === pending.from) {
          const idx = pending.from; pending = null;
          game.resolveRoulette(idx, msg.color);
          UI.renderAll(game, false);
          UI.announce(I.t("aRoulette", { name: game.players[idx].name, color: I.colorName(msg.color) }), "draw");
          Snd.play("draw");
          hostBroadcast();
          if (game.checkEnd()) { hostEnd(); return; }
          hostBeginTurn();
        }
        break;
      case "swap":
        if (pending && pending.type === "swap" && msg.from === pending.from) {
          const res = pending.res; pending = null;
          applyHostSwap(msg.from, msg.target, res);
        }
        break;
    }
  }

  function onStart() {
    const players = buildPlayers();
    lastPlayers = players;
    matchScores = {};
    players.forEach((p) => { matchScores[p.name] = 0; });
    matchRound = 0;
    mercyAnnounced = new Set();
    startGame(players);
  }

  /* ---------------- 游戏流程 ---------------- */
  /* ── 屏幕级状态重置（每次进入游戏界面时调用，防止残留 bug）──
   * 清除所有上局残留的 DOM 状态、计时器、标志位，
   * 确保「重新进入」=「干净开始」，不依赖上一局的清理顺序。
   */
  function resetGameUI() {
    // 隐藏所有遮罩/弹窗
    UI.hideWin();
    hideSpectateControls();
    hideReconnectOverlay();
    if (UI.hideColorModal) UI.hideColorModal();
    if (UI.hideSevenModal) UI.hideSevenModal();
    const ap = document.getElementById("settings-modal");
    if (ap) ap.classList.remove("active");
    // 清除回合闪现
    const sp = document.getElementById("turn-splash");
    if (sp) sp.classList.remove("active");
    // 复位 UI 层标志
    UI.onlyDrawn = null;
    busy = false;
    // 清除 UI 层计时器。注意：玩法计时器 hostAITimer / hostTurnInterval 不能在此清除——
    // game.onEnter 的 resetGameUI 由 Router 过渡结束后“延迟”执行，会误杀 onlineStart 刚设好的
    // AI 自动出牌计时器与房主 15s 回合时钟，导致联机 AI 座位永不行动、超时自动出牌失效。
    // 这两个计时器由 onlineStart(开局清过期) / goMenu / hostEnd(退出) 显式管理。
    if (passTimer) { clearTimeout(passTimer); passTimer = null; }
    if (unoGraceTimer) { clearTimeout(unoGraceTimer); unoGraceTimer = null; }
    clearTurnTimer();
  }

  function startGame(players) {
    resetGameUI();  // ← 每局开局先彻底重置，不依赖上次离开时的清理
    UI.mode = playMode;
    Snd.setActive(true); // 进入对局：开启音效
    hideSpectateControls();
    if (unoGraceTimer) { clearTimeout(unoGraceTimer); unoGraceTimer = null; }
    game = new window.UnoGame({
      players, difficulty,
      mode: ruleMode,
      stacking: ruleMode === "family" ? rules.stacking : undefined,
      sevenZero: ruleMode === "family" ? rules.sevenZero : undefined,
      drawToMatch: ruleMode === "family" ? rules.drawToMatch : undefined,
      lastMustBeNumber: ruleMode === "family" ? rules.lastNumber : undefined,
    });
    UI.setNoMercy(game.sevenZero);
    game.start();
    UI.onlyDrawn = null;
    busy = false;
    UI.buildSeats(game);
    beginTurn();
    if (typeof Router !== 'undefined') Router.navigate("game");
    else { document.getElementById("menu").classList.add("screen-hidden"); document.getElementById("game").classList.add("screen-active"); }
  }

  function proceed(effect) {
    game.advanceTurn(effect);
    if (game.checkEnd()) { endGame(); return; }
    beginTurn();
  }

  function beginTurn() {
    checkMercyAnnounce();
    // 人类玩家已被淘汰（No Mercy 累计 25 张 / 7-0 离场）→ 不再立即结束比赛，
    // 而是继续观战剩余对局：让 AI 把剩余回合打完，直到 game.checkEnd() 自然成立。
    // 仅当"剩余全是人机"时提供「快速结束」按钮，避免长时间观看 AI 互打；
    // 若仍有真人队友（联机），则纯观战、不提供提前再来一局（用户明确诉求）。
    if (!game.over && game.players[mySeat] && game.players[mySeat].eliminated) {
      showSpectateControls();
    }
    if (game.checkEnd()) { endGame(); return; }

    // 防冻结：极端死局按最少手牌者获胜收场
    if (game.isDeadlocked()) {
      let fewest = game.players.find((p) => !p.eliminated) || game.players[0];
      game.players.forEach((p) => { if (!p.eliminated && p.hand.length < fewest.hand.length) fewest = p; });
      game.winner = fewest;
      game.over = true;
      endGame();
      return;
    }

    const cp = game.currentPlayer;
    if (passTimer) { clearTimeout(passTimer); passTimer = null; }
    UI.onlyDrawn = null;
    UI.renderAll(game, false);
    refreshUno();

    if (game.pendingDraw > 0) {
      UI.setStatus(I.t("stackRespond", { n: game.pendingDraw }));
    }

    const meEliminated = game.players[mySeat] && game.players[mySeat].eliminated;

    if (cp.isAI) {
      busy = true;
      UI.setStatus(meEliminated ? I.t("spectating", { name: cp.name }) : I.t("thinking", { name: cp.name }));
      setTimeout(aiTurn, 700);
    } else if (playMode === "local") {
      if (meEliminated && cp !== game.players[mySeat]) {
        // 本地模式：观战中，其他真人回合也只展示状态，不再切屏交接
        busy = true;
        UI.setStatus(I.t("spectating", { name: cp.name }));
      } else {
        showSplash(cp.name, startHumanTurn);
      }
    } else {
      if (meEliminated) {
        busy = true;
        UI.setStatus(I.t("spectating", { name: cp.name }));
      } else {
        startHumanTurn();
      }
    }
  }

  // 人类离场后的快速结算：已出局者排末位，其余按剩余手牌升序（少者更接近获胜）
  /* 快速结束（观战时点「快速结束」）：以极快速度让剩余电脑自动出牌，
   * 直到自然分出胜负（有人出完所有牌），再用正式记分（赢家收走所有剩牌分）。
   * 不再按「当前手牌数」排名给分——那不符合规则，也不合理。 */
  function finishHumanOut() {
    fastSimulateToEnd();
  }

  /** 纯引擎级快速对局：同步驱动所有活着的玩家（AI）自动出牌/摸牌，
   *  直到 game.checkEnd() 自然成立；不依赖 UI 动画与延迟。 */
  function fastSimulateToEnd() {
    if (!game || game.over) { finalizeFastEnd(); return; }
    const AI = window.UnoAI;
    let guard = 0;
    const MAX = 20000;
    while (!game.checkEnd() && guard < MAX) {
      guard++;
      const idx = game.current;
      const p = game.players[idx];
      if (p.eliminated) { game.advanceTurn("normal"); continue; }
      const move = AI.chooseMove(game, idx);
      if (move.action === "draw") {
        if (game.pendingDraw > 0) {
          game.absorbPenalty(idx);
          game.advanceTurn("absorb");
        } else if (game.forceDraw) {
          game.drawToPlayable(idx);
          if (game.playableCards(idx).length === 0) game.advanceTurn("normal");
        } else {
          const c = game.drawOne(idx);
          if (!(c && game.isPlayable(c))) game.advanceTurn("normal");
        }
      } else {
        const card = game.players[idx].hand.find((x) => x.id === move.cardId);
        let color = move.color;
        if (card && C.isWild(card) && !color) color = bestColor(game.players[idx]);
        const res = game.playCard(idx, move.cardId, color);
        if (!res) { game.advanceTurn("normal"); continue; }
        if (res.special === "seven") {
          const tgt = aiPickSwap(idx);
          if (tgt >= 0) game.sevenSwap(idx, tgt);
          game.advanceTurn(res.effect);
        } else if (res.special === "zero") {
          game.zeroRotate();
          game.advanceTurn(res.effect);
        } else if (res.effect === "colorRoulette") {
          game.resolveRoulette(res.nextIdx, bestColor(game.players[res.nextIdx]));
        } else {
          game.advanceTurn(res.effect);
        }
      }
    }
    finalizeFastEnd();
  }

  /** 快速结束收尾：兜底死局，并触发真正的结算/广播 */
  function finalizeFastEnd() {
    if (!game) return;
    if (!game.over) {
      // 死局保护：按最少手牌的活者结束，避免极端卡死
      game.over = true;
      const live = game.players.filter((p) => !p.eliminated);
      if (live.length) {
        let fewest = live[0];
        live.forEach((p) => { if (p.hand.length < fewest.hand.length) fewest = p; });
        game.winner = fewest;
      }
    }
    hideSpectateControls();
    if (playMode === "online" && isHost) hostEnd();
    else endGame();
  }

  /* 观战控件：人类被淘汰后显示「快速结束」按钮（仅当剩余全是人机时）。
   * 联机模式下若仍有真人队友存活，则纯观战、不提供提前再来一局。 */
  function showSpectateControls() {
    const row = document.querySelector(".action-row");
    if (!row) return;
    row.innerHTML = "";
    const me = game.players[mySeat];
    if (!me || !me.eliminated) return;
    // 仅自己（本地）已出局时显示观战提示；联机中房主若出局也走此路径
    const remaining = game.players.filter((p) => !p.eliminated);
    const allBots = remaining.length > 0 && remaining.every((p) => p.isAI);
    if (allBots) {
      const btn = document.createElement("button");
      btn.className = "pass-btn";
      btn.id = "fast-end-btn";
      btn.textContent = I.t("fastEnd");
      btn.addEventListener("click", () => { if (!game.over) fastSimulateToEnd(); });
      row.appendChild(btn);
    }
  }
  function hideSpectateControls() {
    const row = document.querySelector(".action-row");
    if (row) row.innerHTML = "";
  }

  /* ---------------- AI 托管（人类玩家） ---------------- */
  function updateAiAutoBtn() {
    const btn = document.getElementById("ai-auto-btn");
    if (btn) btn.classList.toggle("on", aiAuto);
  }
  // 当前是否轮到“人类玩家”（本地：当前座位非 AI 且未淘汰；联机：轮到自己）
  function isHumanTurnNow() {
    if (!game || game.over) return false;
    if (playMode === "online") return game.current === mySeat && !(game.players[mySeat] && game.players[mySeat].eliminated);
    const cp = game.currentPlayer;
    return cp && !cp.isAI && !cp.eliminated;
  }
  // 满足托管条件时，延迟触发一次自动出牌（去抖，避免重复触发）
  function maybeAiAuto() {
    if (!aiAuto || !isHumanTurnNow()) return;
    if (aiAutoTimer) clearTimeout(aiAutoTimer);
    aiAutoTimer = setTimeout(autoHumanTurn, 600);
  }
  // 用 AI 策略替人类玩家出一手牌（与真人入口一致，万能牌直接带色，避免弹窗）
  function autoHumanTurn() {
    aiAutoTimer = null;
    if (!aiAuto || !game || busy || game.over || !isHumanTurnNow()) return;
    const isOnline = playMode === "online";
    const idx = isOnline ? mySeat : game.current;
    const move = window.UnoAI.chooseMove(game, idx);
    if (move.action === "draw") {
      if (isOnline) onlineDraw(); else onDraw();
      return;
    }
    const card = game.players[idx].hand.find((c) => c.id === move.cardId);
    if (!card || !game.isPlayable(card)) { if (isOnline) onlineDraw(); else onDraw(); return; }
    let color = move.color;
    if (C.isWild(card) && !color) color = bestColor(game.players[idx]);
    if (isOnline) {
      // 联机：直接发意图（万能牌带色），不弹窗
      if (C.isWild(card)) UnoNet.send({ t: "intent", action: "play", cardId: move.cardId, color });
      else UnoNet.send({ t: "intent", action: "play", cardId: move.cardId });
      busy = true; UI.renderAll(game, false);
    } else {
      if (C.isWild(card)) { UI.onlyDrawn = null; doPlay(idx, move.cardId, color); }
      else onCardClick(move.cardId);
    }
  }

  function startHumanTurn() {
    busy = false;
    UI.onlyDrawn = null;
    UI.renderAll(game, true);
    if (game.pendingDraw > 0) {
      UI.setStatus(I.t("stackRespond", { n: game.pendingDraw }));
    } else if (game.forceDraw && game.playableCards(game.current).length === 0) {
      noMercyAutoDraw();
      return;
    } else {
      UI.setStatus(I.t("yourTurn"));
    }
    refreshUno();
    maybeAiAuto(); // AI 托管：轮到人类时自动出牌
  }

  function noMercyAutoDraw() {
    busy = true;
    UI.setStatus(I.t("forceDrawHint"));
    const me = game.current;
    const drawn = game.drawToPlayable(me);
    UI.renderAll(game, true);
    if (drawn.length) UI.floatMessage(I.t("fForceDrew", { name: game.players[me].name, n: drawn.length }));
    checkMercyAnnounce();
    if (game.checkEnd()) { endGame(); return; }
    // 被淘汰或仍无牌可出：推进回合，避免卡死
    if (game.players[me].eliminated || game.playableCards(me).length === 0) {
      setTimeout(() => finishTurn("normal"), 600);
      return;
    }
    UI.setStatus(I.t("yourTurn"));
    refreshUno();
    busy = false;
  }

  function aiTurn() {
    const idx = game.current;
    const move = window.UnoAI.chooseMove(game, idx);

    if (move.action === "draw") {
      // 被罚态：吸收累计罚牌
      if (game.pendingDraw > 0) {
        const pd = game.absorbPenalty(idx);
        UI.renderAll(game, false);
        UI.floatMessage(I.t("fAbsorbName", { name: game.players[idx].name, n: pd }));
        Snd.play("draw");
        checkMercyAnnounce();
        setTimeout(() => {
          if (game.checkEnd()) { endGame(); return; }
          proceed("absorb");
        }, 650);
        return;
      }
      // No Mercy 强制摸牌到可出
      if (game.forceDraw) {
        const drawn = game.drawToPlayable(idx);
        UI.renderAll(game, false);
        if (drawn.length) UI.floatMessage(I.t("fForceDrew", { name: game.players[idx].name, n: drawn.length }));
        checkMercyAnnounce();
        if (game.checkEnd()) { endGame(); return; }
        // 关键修复：若本回合内被淘汰或仍无牌可出，则推进回合，避免无限自递归卡死
        if (game.players[idx].eliminated || game.playableCards(idx).length === 0) {
          finishTurn("normal");
          return;
        }
        setTimeout(() => aiTurn(), 500);
        return;
      }
      // 经典/家庭：摸 1 张
      const drawn = game.drawOne(idx);
      if (!drawn) { finishTurn("normal"); return; }
      // 摸到 25 张触发 Mercy 淘汰：直接推进回合，避免尝试出已转移的牌而卡死
      if (game.players[idx].eliminated) {
        checkMercyAnnounce();
        setTimeout(() => finishTurn("normal"), 600);
        return;
      }
      Snd.play("draw");
      UI.renderAll(game, false);
      UI.floatMessage(I.t("fDraw", { name: game.players[idx].name }));
      setTimeout(() => {
        if (game.isPlayable(drawn)) {
          let color = null;
          if (C.isWild(drawn)) color = bestColor(game.players[idx]);
          doPlay(idx, drawn.id, color);
        } else {
          finishTurn("normal");
        }
      }, 600);
    } else {
      setTimeout(() => doPlay(idx, move.cardId, move.color), 450);
    }
  }

  function doPlay(idx, cardId, color) {
    busy = true;
    const player = game.players[idx];
    const card = player.hand.find((c) => c.id === cardId);
    let srcEl = null;
    if (player.isAI) {
      srcEl = UI.seatEls[idx] ? UI.seatEls[idx].root : null;
    } else {
      srcEl = document.querySelector('#hand .card[data-id="' + cardId + '"]');
    }
    const targetEl = UI.el.discard;
    if (srcEl && !player.isAI) srcEl.style.visibility = "hidden";

    const finish = () => {
      const res = game.playCard(idx, cardId, color);
      if (!res) { busy = false; return; }
      // 仅剩 1 张且未喊 UNO：开“判定宽限”，【宽限结束前不推进回合】，
      // 防止对手先出牌、玩家趁机出完蒙混过关。宽限期内玩家仍可点 UNO 自救；到期未喊才罚摸并推进。
      // AI 也按概率偶尔忘喊，与人类一致进入宽限被罚。
      if (player.hand.length === 1 && !player.saidUno) {
        if (player.isAI) {
          if (Math.random() < AI_FORGET_UNO_PROB) {
            UI.renderAll(game, false);
            announcePlay(player, res);
            playEffectSound(res);
            startLocalUnoGrace(idx, () => afterLocalPlay(idx, player, res));
            return;
          }
          player.saidUno = true; // AI 正常喊 UNO
        } else {
          UI.renderAll(game, false);
          announcePlay(player, res);
          playEffectSound(res);
          startLocalUnoGrace(idx, () => afterLocalPlay(idx, player, res));
          return;
        }
      }
      afterLocalPlay(idx, player, res);
    };

    if (srcEl && targetEl && card) {
      UI.flyCard(card, srcEl, targetEl, finish);
    } else {
      finish();
    }
  }

  /* 颜色轮盘：让下家(被翻牌者)选色 */
  function handleRoulette(idx, byPlayer) {
    const target = game.players[idx];
    const done = (chosen) => {
      const rev = game.resolveRoulette(idx, chosen);
      UI.renderAll(game, false);
      UI.announce(I.t("aRoulette", { name: target.name, color: I.colorName(chosen) }), "draw");
      if (rev) UI.floatMessage(I.t("fRoulette", { name: target.name, n: rev }));
      Snd.play("draw");
      checkMercyAnnounce();
      if (game.checkEnd()) { endGame(); return; }
      beginTurn(); // resolveRoulette 内部已 advanceTurn
    };
    if (target.isAI) {
      busy = true;
      setTimeout(() => done(bestColor(target)), 600);
    } else if (playMode === "local") {
      showSplash(target.name, () => UI.showColorModal(done));
    } else {
      UI.showColorModal(done);
    }
  }

  /* 7-0 编排 */
  function handleSpecial(idx, res, player) {
    game.unoGrace = null;
    if (unoGraceTimer) { clearTimeout(unoGraceTimer); unoGraceTimer = null; }
    const done = () => {
      if (game._checkMercy && game._checkMercy()) checkMercyAnnounce();
      setTimeout(() => proceed(res.effect), 700);
    };

    if (res.special === "zero") {
      game.zeroRotate();
      UI.renderAll(game, false);
      UI.announce(I.t("aZero"), "reverse");
      Snd.play("reverse");
      done();
      return;
    }

    const others = game.players.map((_, i) => i).filter((i) => i !== idx && !game.players[i].eliminated);
    const applySwap = (target) => {
      game.sevenSwap(idx, target);
      if (game._checkMercy) game._checkMercy();
      UI.renderAll(game, false);
      UI.announce(I.t("aSeven", { name: player.name, name2: game.players[target].name }), "reverse");
      Snd.play("reverse");
      done();
    };

    if (others.length === 0) { done(); return; } // 其余全淘汰，无法换牌，直接收尾
    if (others.length === 1) { applySwap(others[0]); return; }
    if (player.isAI) { applySwap(aiPickSwap(idx)); return; }
    UI.showSevenModal(game, idx, applySwap);
  }

  function aiPickSwap(idx) {
    let best = -1, min = Infinity;
    game.players.forEach((p, i) => {
      if (i !== idx && !p.eliminated && p.hand.length < min) { min = p.hand.length; best = i; }
    });
    return best;
  }

  function checkMercyAnnounce() {
    game.players.forEach((p) => {
      if (p.eliminated && !mercyAnnounced.has(p.name)) {
        mercyAnnounced.add(p.name);
        UI.floatMessage(I.t("mercyOut", { name: p.name }));
        UI.announce(I.t("mercyOut", { name: p.name }), "draw");
        Snd.play("lose");
      }
    });
  }

  function setLastEvent(seat, type, text) {
    game.eventSeq = (game.eventSeq || 0) + 1;
    game.lastEvent = { seat, type, text, name: game.players[seat] ? game.players[seat].name : "" };
  }

  function announcePlay(player, res) {
    if (res.effect === "colorRoulette") return; // 由 handleRoulette 处理
    if (res.special === "seven" || res.special === "zero") return;

    const sym = C.symbolOf(res.card);
    let text, type = "play";

    // Draw 牌（含叠加 / 起始叠加）：统一播报累计罚摸
    if (res.effect === "draw" || res.effect === "stack") {
      text = I.t("aStack", { name: player.name, t: sym, n: game.pendingDraw });
      type = "draw";
    } else {
      switch (res.effect) {
        case "skip": text = I.t("aSkip", { name: player.name }); type = "skip"; break;
        case "reverse": text = I.t("aReverse"); type = "reverse"; break;
        case "drawImmediate": text = I.t("aDraw2", { name: player.name }); type = "draw"; break;
        case "discardAll": text = I.t("aDiscardAll", { name: player.name }); type = "draw"; break;
        case "skipEveryone": text = I.t("aSkipEveryone", { name: player.name }); type = "skip"; break;
        default:
          if (res.card.type === "wild") text = I.t("aWild", { color: I.colorName(res.activeColor) });
          else if (res.card.type === "wild4") text = I.t("aWild4", { color: I.colorName(res.activeColor) });
          else if (res.card.type === "draw4") text = I.t("aWild4", { color: I.colorName(res.activeColor) });
          else text = I.t("aPlay", { name: player.name, sym: sym });
      }
    }
    if (netOnline) {
      game.lastEvent = { seat: player.seat, type, text, name: player.name };
      game.eventSeq = (game.eventSeq || 0) + 1;
    } else {
      UI.announce(text, type);
    }
  }

  function playEffectSound(res) {
    // 叠加 / 起始叠加（No Mercy 的 +2/+4/+6/+10 都走这里）
    if (res.effect === "draw" || res.effect === "stack") {
      Snd.play(C.drawValue(res.card) >= 4 ? "draw4" : "draw2");
      return;
    }
    switch (res.effect) {
      case "skip": Snd.play("skip"); break;
      case "reverse": Snd.play("reverse"); break;
      case "drawImmediate": Snd.play("draw2"); break;
      case "discardAll": case "skipEveryone": Snd.play("play"); break;
      case "colorRoulette": Snd.play("draw"); break;
      default:
        if (res.card.type === "wild" || res.card.type === "wild4") Snd.play("wild");
        else Snd.play("play");
    }
  }

  function finishTurn(effect) {
    busy = true;
    if (passTimer) { clearTimeout(passTimer); passTimer = null; }
    UI.onlyDrawn = null;
    proceed(effect);
  }

  function bestColor(player) {
    const counts = { red: 0, yellow: 0, green: 0, blue: 0 };
    player.hand.forEach((c) => { if (c.color) counts[c.color]++; });
    let best = "red";
    C.COLORS.forEach((c) => { if (counts[c] > counts[best]) best = c; });
    return best;
  }

  /* ---------------- 人类交互 ---------------- */
  function onCardClick(cardId) {
    if (playMode === "online") { onlineCardClick(cardId); return; }
    if (busy || game.currentPlayer.isAI) return;
    if (passTimer) { clearTimeout(passTimer); passTimer = null; } // 打出刚摸的牌，取消自动过牌
    const me = game.current;
    const card = game.currentPlayer.hand.find((c) => c.id === cardId);
    if (!card) return;
    if (UI.onlyDrawn != null && cardId !== UI.onlyDrawn) return;
    if (!game.isPlayable(card)) return;

    if (card.type === "wildColorRoulette") {
      // 颜色轮盘：出牌者不选颜色，规则由【下家】选择（handleRoulette 只问下家一次）。
      // 若在此向出牌者索要颜色，该颜色会被引擎忽略，且造成“被多问一次”的错觉。
      UI.onlyDrawn = null;
      doPlay(me, cardId, null);
    } else if (card.type === "wild" || card.type === "wild4" || card.type === "wildDraw6" ||
        card.type === "wildDraw10" || card.type === "wildReverseDraw4") {
      UI.showColorModal((color) => {
        UI.hideColorModal();
        UI.onlyDrawn = null;
        doPlay(me, cardId, color);
      });
    } else {
      UI.onlyDrawn = null;
      doPlay(me, cardId, null);
    }
  }

  function onDraw() {
    if (playMode === "online") { onlineDraw(); return; }
    if (busy || game.currentPlayer.isAI) return;
    if (UI.onlyDrawn != null) return;
    const me = game.current;

    // 被罚态：点牌堆 = 吸收累计罚牌
    if (game.pendingDraw > 0) {
      busy = true; // 吸收罚牌期间锁定输入，避免 750ms 延迟内误出普通牌（pendingDraw 已清零，isPlayable 会放行普通牌）
      const pd = game.absorbPenalty(me);
      UI.onlyDrawn = null;
      UI.renderAll(game, true);
      UI.floatMessage(I.t("fAbsorbName", { name: game.players[me].name, n: pd }));
      Snd.play("draw");
      checkMercyAnnounce();
      setTimeout(() => {
        if (game.checkEnd()) { endGame(); return; }
        proceed("absorb");
      }, 750);
      return;
    }

    if (game.forceDraw) {
      // No Mercy：无牌可出时自动摸到可出
      const drawn = game.drawToPlayable(me);
      UI.onlyDrawn = null;
      UI.renderAll(game, true);
      if (drawn.length) UI.floatMessage(I.t("fForceDrew", { name: game.players[me].name, n: drawn.length }));
      checkMercyAnnounce();
      if (game.checkEnd()) { endGame(); return; }
      // 被淘汰或仍无牌可出：推进回合
      if (game.players[me].eliminated || game.playableCards(me).length === 0) {
        finishTurn("normal");
        return;
      }
      UI.setStatus(I.t("yourTurn"));
      refreshUno();
      maybeAiAuto(); // AI 托管：No Mercy 强制摸牌后自动出
      return;
    }

    const drawn = game.drawOne(me);
    if (!drawn) { finishTurn("normal"); return; }
    // 摸到 25 张触发 Mercy 淘汰：直接结束本回合，避免尝试出已转移的牌而卡死
    if (game.players[me].eliminated) {
      checkMercyAnnounce();
      UI.renderAll(game, true);
      setTimeout(() => finishTurn("normal"), 600);
      return;
    }
    Snd.play("draw");
    UI.onlyDrawn = drawn.id;
    UI.renderAll(game, true);
    refreshUno();
    if (game.isPlayable(drawn)) {
      if (game.drawToMatch) {
        UI.setStatus(I.t("mustPlayDrawn"));
      } else {
        UI.setStatus(I.t("drawnPlayable"));
        // 摸牌即视为过：给 2 秒窗口打出刚摸到的牌，否则自动过牌（与联机一致）
        if (passTimer) clearTimeout(passTimer);
        passTimer = setTimeout(() => { passTimer = null; UI.onlyDrawn = null; finishTurn("normal"); }, 2000);
      }
      maybeAiAuto(); // AI 托管：摸到可出的牌时，自动打出
    } else {
      UI.floatMessage(I.t("noPlay"));
      setTimeout(() => { UI.onlyDrawn = null; finishTurn("normal"); }, 850);
    }
  }

  /* UNO 按钮可见性（本地 + 联机统一）：
   *  - 自己回合且手牌 ≤ 2 张（提前喊）
   *  - 或正处于「仅剩 1 张未喊」的宽限窗口（含 discardAll 等一次出多张的情形） */
  function unoButtonVisible() {
    if (!game) return false;
    if (playMode === "online") {
      const me = game.players[mySeat];
      const graceMine = game.unoGrace && game.unoGrace.seat === mySeat;
      return (game.current === mySeat && me && me.hand.length <= 2) || graceMine;
    }
    const cur = game.currentPlayer;
    const humanGrace = game.unoGrace && !game.players[game.unoGrace.seat].isAI;
    return (cur && !cur.isAI && cur.hand.length <= 2) || !!humanGrace;
  }
  function refreshUno() {
    const vis = unoButtonVisible();
    UI.setUno(vis);
    const btn = UI.el.unoBtn;
    if (btn) btn.classList.toggle("grace", !!(game && game.unoGrace));
  }

  /* 本地（人机 / 热座）：仅剩 1 张且未喊 UNO → 开启宽限窗口，可补喊；超时未喊罚摸 2。
   * cont：宽限结束（被抓或自救）后要执行的回合推进/结算回调（解决“对手先出牌”的蒙混问题） */
  let unoGraceContinuation = null;
  function startLocalUnoGrace(seat, cont) {
    if (!game) return;
    game.unoGrace = { seat, deadline: Date.now() + UNO_GRACE_MS };
    unoGraceContinuation = (typeof cont === "function") ? cont : null;
    refreshUno();
    if (unoGraceTimer) clearTimeout(unoGraceTimer);
    unoGraceTimer = setTimeout(() => {
      unoGraceTimer = null;
      const g = game && game.unoGrace;
      if (g && g.seat === seat && !game.players[seat].saidUno && !game.players[seat].eliminated && game.players[seat].hand.length === 1) {
        const penalty = game.enforceUno(seat);
        if (penalty) UI.floatMessage(I.t("fUnoForgot", { name: game.players[seat].name, n: penalty }));
      }
      if (game) game.unoGrace = null;
      refreshUno();
      UI.renderAll(game, false);
      const c = unoGraceContinuation; unoGraceContinuation = null;
      if (c) c();
    }, UNO_GRACE_MS);
  }

  /* 本地出牌后的统一收尾：播报、特殊牌处理、推进回合 */
  function afterLocalPlay(idx, player, res) {
    UI.onlyDrawn = null;
    UI.renderAll(game, false);
    announcePlay(player, res);
    playEffectSound(res);
    if (game.checkEnd()) { endGame(); return; }
    if (res.effect === "colorRoulette") { handleRoulette(res.nextIdx, player); return; }
    if (res.special === "seven" || res.special === "zero") { handleSpecial(idx, res, player); return; }
    setTimeout(() => proceed(res.effect), 780);
  }

  function onUno() {
    if (playMode === "online") { onlineUno(); return; }
    if (busy && !game.unoGrace) return; // 宽限窗口内允许喊（即使此时 busy）
    // 宽限窗口：某玩家刚打到仅剩 1 张，趁窗口补喊
    if (game.unoGrace) {
      const seat = game.unoGrace.seat;
      if (game.players[seat].isAI) return; // AI 的宽限不能由人类代喊（避免作弊救 AI）
      game.players[seat].saidUno = true;
      game.unoGrace = null;
      if (unoGraceTimer) { clearTimeout(unoGraceTimer); unoGraceTimer = null; }
      const c = unoGraceContinuation; unoGraceContinuation = null;
      refreshUno();
      UI.renderSeats(game);
      UI.floatMessage(I.t("fUno"));
      Snd.play("uno");
      if (c) c(); // 玩家及时喊了 → 立即推进回合
      return;
    }
    const p = game.currentPlayer;
    if (p.hand.length === 2) {
      p.saidUno = true;
      UI.renderSeats(game);
      refreshUno();
      UI.floatMessage(I.t("fUno"));
      Snd.play("uno");
    }
  }

  /* ---------------- 胜负与计分 ---------------- */
  function cardPoints(card) {
    if (card.type === "number") return card.value;
    if (card.type === "wild" || card.type === "wild4" ||
        card.type === "wildDraw6" || card.type === "wildDraw10" ||
        card.type === "wildReverseDraw4" || card.type === "wildColorRoulette") return 50;
    return 20; // skip / reverse / draw2 / draw4 / discardAll / skipEveryone
  }

  function endGame() {
    busy = true;
    clearTurnTimer(); // 对局结束：停止并隐藏回合倒计时
    hideSpectateControls();
    UI.setUno(false);
    if (game) game.unoGrace = null;
    if (unoGraceTimer) { clearTimeout(unoGraceTimer); unoGraceTimer = null; }
    const w = game.winner;
    matchRound++;

    let pot = 0;
    game.players.forEach((p) => p.hand.forEach((c) => (pot += cardPoints(c))));
    if (w) matchScores[w.name] = (matchScores[w.name] || 0) + pot;

    const breakdown = game.players.map((p) => ({
      name: p.name,
      gain: w && p.name === w.name ? pot : 0,
      total: matchScores[p.name] || 0,
      winner: w && p.name === w.name,
    }));

    let title, sub, emoji;
    if (!w) {
      title = I.t("loseTitle", { name: "—" }); sub = I.t("loseSub"); emoji = "😟";
    } else if (playMode === "ai") {
      if (!w.isAI) { title = I.t("winYou"); sub = I.t("winYouSub", { n: pot }); emoji = "🏆"; }
      else { title = I.t("loseTitle", { name: w.name }); sub = I.t("loseSub"); emoji = "😟"; }
    } else {
      title = I.t("winLocal", { name: w.name });
      sub = I.t("winLocalSub", { n: pot });
      emoji = "🏆";
    }

    const emojiEl = document.getElementById("win-emoji");
    if (emojiEl) emojiEl.textContent = emoji;
    if (w && !w.isAI) UI.confetti();
    Snd.play(w && !w.isAI ? "win" : "lose");
    // 联机：所有玩家都可点“再来一局”。房主点击直接重开；非房主点击则请求房主重开。
    // 所有人保持在房间内，无需退出即可连续再战。
    const againBtn = document.getElementById("win-again");
    if (againBtn) {
      againBtn.disabled = false;
      againBtn.textContent = I.t("winAgain");
    }
    UI.showWin(title, sub, breakdown);
  }

  /* ---------------- 回合遮挡（本地多人防偷看） ---------------- */
  function showSplash(name, cb) {
    let splash = document.getElementById("turn-splash");
    if (!splash) {
      splash = document.createElement("div");
      splash.id = "turn-splash";
      splash.className = "overlay";
      splash.innerHTML = `
        <div class="win-card">
          <div class="win-emoji">🎴</div>
          <h2 id="splash-name"></h2>
          <p id="splash-pass"></p>
          <div class="win-actions">
            <button id="splash-go" class="start-btn"></button>
          </div>
        </div>`;
      document.getElementById("game").appendChild(splash);
      splash.querySelector("#splash-go").addEventListener("click", () => {
        splash.classList.remove("active");
        cb();
      });
    }
    splash.querySelector("#splash-name").textContent = I.t("splashTurn", { name: name });
    splash.querySelector("#splash-pass").textContent = I.t("splashPass");
    splash.querySelector("#splash-go").textContent = I.t("splashGo");
    splash.classList.add("active");
  }

  /* ---------------- 外观设置（卡牌皮肤 / 桌面款式 / BGM，仅本地，互不影响） ---------------- */
  const SKIN_OPTS = [
    { id: "classic", key: "skinClassic", cls: "skin-classic" },
    { id: "neon", key: "skinNeon", cls: "skin-neon" },
    { id: "pastel", key: "skinPastel", cls: "skin-pastel" },
    { id: "mono", key: "skinMono", cls: "skin-mono" },
  ];
  const TABLE_OPTS = [
    { id: "green", key: "tableGreen", cls: "table-green" },
    { id: "blue", key: "tableBlue", cls: "table-blue" },
    { id: "purple", key: "tablePurple", cls: "table-purple" },
    { id: "crimson", key: "tableCrimson", cls: "table-crimson" },
  ];
  function applySkin(skin) {
    SKIN_OPTS.forEach((s) => document.body.classList.toggle(s.cls, s.id === skin));
    try { localStorage.setItem("uno_skin", skin); } catch (e) {}
  }
  function applyTable(table) {
    TABLE_OPTS.forEach((t) => document.body.classList.toggle(t.cls, t.id === table));
    try { localStorage.setItem("uno_table", table); } catch (e) {}
  }
  function initAppearance() {
    let skin = "classic", table = "green";
    try { skin = localStorage.getItem("uno_skin") || "classic"; table = localStorage.getItem("uno_table") || "green"; } catch (e) {}
    applySkin(skin); applyTable(table);

    const skinGrid = document.getElementById("skin-grid");
    const tableGrid = document.getElementById("table-grid");
    if (skinGrid) {
      SKIN_OPTS.forEach((s) => {
        const b = document.createElement("button");
        b.className = "swatch skin-swatch " + s.cls + (s.id === skin ? " active" : "");
        b.dataset.skin = s.id;
        // 预览块自带该皮肤类 s.cls，才能套用 .skin-x .card 规则显示真实质感；
        // 用真实 createCardEl 渲染一张红 7 + 一张万能牌，直观看出差异
        const prev = document.createElement("div");
        prev.className = "swatch-preview " + s.cls;
        try {
          prev.appendChild(window.createCardEl(C.makeCard("number", "red", 7), true));
          prev.appendChild(window.createCardEl(C.makeCard("wild"), true));
        } catch (e) {
          prev.innerHTML = `<div class="card color-red"><div class="card-inner"><span class="num">7</span></div></div><div class="card wild"><div class="card-inner">★</div></div></div>`;
        }
        b.appendChild(prev);
        const name = document.createElement("span");
        name.className = "swatch-name";
        name.textContent = I.t(s.key);
        b.appendChild(name);
        b.addEventListener("click", () => {
          applySkin(s.id);
          skinGrid.querySelectorAll(".swatch").forEach((x) => x.classList.remove("active"));
          b.classList.add("active");
        });
        skinGrid.appendChild(b);
      });
    }
    if (tableGrid) {
      TABLE_OPTS.forEach((t) => {
        const b = document.createElement("button");
        b.className = "swatch table-swatch " + t.cls + (t.id === table ? " active" : "");
        b.dataset.table = t.id;
        b.innerHTML = `<span class="swatch-name">${I.t(t.key)}</span>`;
        b.addEventListener("click", () => {
          applyTable(t.id);
          tableGrid.querySelectorAll(".swatch").forEach((x) => x.classList.remove("active"));
          b.classList.add("active");
        });
        tableGrid.appendChild(b);
      });
    }

    const bgmSwitch = document.getElementById("bgm-switch");
    const syncBgmSwitch = () => { if (bgmSwitch) bgmSwitch.setAttribute("aria-checked", Snd.isBgmOn() ? "true" : "false"); };
    syncBgmSwitch();
    if (bgmSwitch) bgmSwitch.addEventListener("click", () => { Snd.setBgm(!Snd.isBgmOn()); syncBgmSwitch(); });

    // 音效开关（SFX toggle，原 mute-btn）
    const sfxSwitch = document.getElementById("sfx-switch");
    const syncSfxSwitch = () => { if (sfxSwitch) sfxSwitch.setAttribute("aria-checked", !Snd.isMuted() ? "true" : "false"); };
    syncSfxSwitch();
    if (sfxSwitch) sfxSwitch.addEventListener("click", () => { Snd.toggle(); syncSfxSwitch(); });

    // 背景音乐音量滑块（0~100 → 0~1）
    const bgmVolEl = document.getElementById("bgm-vol");
    const syncBgmVol = () => { if (bgmVolEl) bgmVolEl.value = String(Math.round(Snd.getBgmVolume() * 100)); };
    syncBgmVol();
    if (bgmVolEl) bgmVolEl.addEventListener("input", () => {
      Snd.setBgmVolume((parseInt(bgmVolEl.value, 10) || 0) / 100);
    });

    // 语言切换（设置弹窗内）
    const langInlineBtn = document.getElementById("lang-toggle-inline");
    const syncLangInline = () => {
      if (langInlineBtn) {
        langInlineBtn.textContent = I.lang === "zh" ? "中 / EN" : "EN / 中";
        langInlineBtn.classList.toggle("en", I.lang === "en");
      }
    };
    syncLangInline();
    if (langInlineBtn) langInlineBtn.addEventListener("click", () => {
      I.toggle();
      syncLangInline();
      I.applyStatic();
    });

    // 设置弹窗：打开/关闭
    const openSettings = () => {
      skinGrid.querySelectorAll(".swatch").forEach((x) => x.classList.toggle("active", x.dataset.skin === (localStorage.getItem("uno_skin") || "classic")));
      tableGrid.querySelectorAll(".swatch").forEach((x) => x.classList.toggle("active", x.dataset.table === (localStorage.getItem("uno_table") || "green")));
      syncBgmSwitch();
      syncSfxSwitch();
      syncBgmVol();
      syncLangInline();
      const m = document.getElementById("settings-modal");
      if (m) m.classList.add("active");
    };
    const setBtn = document.getElementById("settings-btn");
    const menuApBtn = document.getElementById("menu-appearance-btn");
    if (setBtn) setBtn.addEventListener("click", openSettings);
    if (menuApBtn) menuApBtn.addEventListener("click", openSettings);

    // AI 托管开关（人类玩家）：开启后自动替当前人类出牌
    try { aiAuto = localStorage.getItem("uno_ai_auto") === "1"; } catch (e) {}
    updateAiAutoBtn();
    const aiAutoBtn = document.getElementById("ai-auto-btn");
    if (aiAutoBtn) aiAutoBtn.addEventListener("click", () => {
      aiAuto = !aiAuto;
      try { localStorage.setItem("uno_ai_auto", aiAuto ? "1" : "0"); } catch (e) {}
      updateAiAutoBtn();
      maybeAiAuto(); // 开启时立即尝试替当前回合出牌
    });
    const setClose = document.getElementById("settings-close");
    if (setClose) setClose.addEventListener("click", () => { const m = document.getElementById("settings-modal"); if (m) m.classList.remove("active"); });
    const setModal = document.getElementById("settings-modal");
    if (setModal) setModal.addEventListener("click", (e) => { if (e.target === setModal) setModal.classList.remove("active"); });
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    I.applyStatic();
    document.documentElement.lang = I.lang === "zh" ? "zh-CN" : "en";
    UI.cache();
    initAppearance();
    setupMenu();

    document.getElementById("draw-pile").addEventListener("click", onDraw);
    document.getElementById("uno-btn").addEventListener("click", onUno);
    UI.onCardClick = onCardClick;

    document.querySelectorAll(".color-choice").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.getElementById("color-modal").classList.remove("active");
        if (UI.onColor) UI.onColor(btn.dataset.color);
      });
    });

    document.getElementById("quit-btn").addEventListener("click", goMenu);
    document.getElementById("win-menu").addEventListener("click", goMenu);
    document.getElementById("win-lobby").addEventListener("click", () => {
      if (playMode === "online") {
        // 房主请求“返回大厅”：服务器复位 started 并广播，所有人回到大厅可调整机器人/规则
        if (isHost) { try { UnoNet.send({ t: "backToLobby" }); } catch (e) {} }
        return; // 等待服务器 broadcast backToLobby 让所有人（含房主）调用 returnToLobby
      }
      if (typeof returnToLobby === "function") returnToLobby();
    });
    document.getElementById("win-again").addEventListener("click", () => {
      if (playMode === "online") {
        // 所有人留在房间内，一键即真·再战：房主直接重开，非房主请求房主重开
        if (isHost) {
          doOnlineRematch();
        } else {
          if (rematchPending) return;
          rematchPending = true;
          UnoNet.send({ t: "rematchRequest" });
          const btn = document.getElementById("win-again");
          if (btn) { btn.disabled = true; btn.textContent = I.t("winRematchAsked"); }
        }
        return; // 等待服务器 start 广播后自动进入新一局
      }
      UI.hideWin();
      if (lastPlayers) startGame(lastPlayers);
    });

    UI.onInvalid = () => Snd.play("invalid");

    const scoreModal = document.getElementById("score-modal");
    document.getElementById("score-btn").addEventListener("click", () => {
      renderScoreboard();
      scoreModal.classList.add("active");
    });
    document.getElementById("score-close").addEventListener("click", () => scoreModal.classList.remove("active"));
    scoreModal.addEventListener("click", (e) => { if (e.target === scoreModal) scoreModal.classList.remove("active"); });

    // 初始化路由系统（屏幕切换 + 过渡动画）
    Router.init({
      menu:   {
        el: "menu",
        onEnter: () => {
          // 进入菜单：确保对局残留全部清理（防止从 game 直接跳回 menu 时遗漏状态）
          if (typeof resetGameUI === "function") resetGameUI();
          Snd.setActive(false);
          setupMenu();
        }
      },
      game:   {
        el: "game",
        onEnter: () => {
          // 每次进入游戏界面（含再来一局 / 从结果页返回）：重置 UI 残留
          if (typeof resetGameUI === "function") resetGameUI();
          Snd.setActive(true);
        }
      },
      result: { el: "game", defaultHash: "#result" },
    });
  }

  function renderScoreboard() {
    const board = document.getElementById("score-board");
    board.innerHTML = "";
    let rows;
    if (game) rows = game.players.map((p) => ({ name: p.name, total: matchScores[p.name] || 0 }));
    else rows = Object.keys(matchScores).map((n) => ({ name: n, total: matchScores[n] }));
    rows.sort((a, b) => b.total - a.total);
    rows.forEach((r) => {
      const d = document.createElement("div");
      d.className = "score-row";
      d.innerHTML = `<span class="sn">${r.name}</span><span class="st">${r.total}</span>`;
      board.appendChild(d);
    });
  }

  // 房主被请求重发状态（有玩家重连后）：房主权威把当前对局状态重新广播给所有人
  function hostResync() {
    if (isHost && game && !game.over) { hostBroadcast(); hostRender(); }
  }

  function goMenu() {
    UI.hideWin();
    hideSpectateControls();
    hideReconnectOverlay();
    UI.setNoMercy(false);
    Snd.setActive(false); // 退出对局：立即关闭音效，避免退出后仍听到出牌声
    if (unoGraceTimer) { clearTimeout(unoGraceTimer); unoGraceTimer = null; }
    if (aiAutoTimer) { clearTimeout(aiAutoTimer); aiAutoTimer = null; }
    const sp = document.getElementById("turn-splash");
    if (sp) sp.classList.remove("active");
    try { sessionStorage.removeItem("uno_online_session"); } catch(e) {}
    if (playMode === "online") {
      try { UnoNet.send({ t: "leave" }); } catch (e) {}
      // 先把联机状态复位，再关闭 socket：close 可能同步触发 onclose → disconnected → goMenu 重入，造成无限递归
      netOnline = false; isHost = false; onlineStarted = false; onlineEnded = false;
      clearTurnTimer(); hostStopTurnClock();
      if (hostAITimer) { clearTimeout(hostAITimer); hostAITimer = null; }
      pending = null;
      try { UnoNet.close(); } catch (e) {}
    }
    // 用路由切换（带动画）
    if (typeof Router !== 'undefined') {
      Router.navigate("menu");
    } else {
      // fallback: 直接操作 DOM（测试环境等）
      document.getElementById("game").classList.remove("screen-active");
      document.getElementById("game").classList.add("screen-hidden");
      document.getElementById("menu").classList.remove("screen-hidden", "screen-exit");
      document.getElementById("menu").classList.add("screen-active");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  /* ===== 刷新安全网：防止落在无数据的游戏界面上卡死 =====
   * 刷新后 JS 状态全丢失（game=null, onlineStarted=false, netOnline=false），
   * 但 URL hash 可能仍是 #game，Router 会显示空壳游戏界面（一张牌、计时器归零、"准备开始…"）。
   * 检测此情况并自动回退到菜单。
   * 联机模式额外处理：若 sessionStorage 存有房间信息，可尝试重连或提示用户。
   */
  const _staleGuard = setTimeout(() => {
    if (typeof Router !== 'undefined' && Router.current === "game" && !game && !onlineStarted && !netOnline) {
      console.log("[init] Stale game screen after refresh — returning to menu");
      // 尝试从 sessionStorage 恢复联机房间信息（给用户一个选择而非直接丢弃）
      try {
        const sess = JSON.parse(sessionStorage.getItem("uno_online_session") || "null");
        if (sess && sess.roomCode && location.hash === "#game") {
          // 保留房间信息供后续可能的重连功能使用；当前先回菜单
          sessionStorage.removeItem("uno_online_session");
        }
      } catch(e) {}
      Router.navigate("menu");
    }
  }, 200);

  // 调试 / 测试句柄（仅暴露读取与少量入口，不影响游戏逻辑）
  if (typeof window !== "undefined") {
    window.__uno = {
      get game() { return game; },
      get playMode() { return playMode; },
      get busy() { return busy; },
      beginTurn,
      doPlay,
    };
  }

  // PWA：注册 Service Worker（仅 http/https 下；file:// 与 jsdom 测试环境自动跳过）
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator &&
      typeof location !== "undefined" && location.protocol.indexOf("http") === 0) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
