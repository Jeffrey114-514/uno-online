/* =========================================================
 * ai.js — AI 出牌策略
 * 返回 { action: "play", cardId, color? } 或 { action: "draw" }
 * （draw 在被罚态下表示“吸收累计罚牌”）
 * ========================================================= */
(function (global) {
  "use strict";
  const C = global.UnoCards;

  function colorCountsOf(player) {
    const counts = { red: 0, yellow: 0, green: 0, blue: 0 };
    player.hand.forEach((c) => {
      if (c.color) counts[c.color]++;
    });
    return counts;
  }

  function scoreCard(card, counts, player, difficulty) {
    let s = 0;
    switch (card.type) {
      case "number": s = 10 + card.value; break;
      case "draw2": s = 30; break;
      case "draw4": s = 35; break;
      case "skip": s = 28; break;
      case "reverse": s = 26; break;
      case "discardAll": {
        const same = counts[card.color] || 0; // 同色越多越值得一次性弃光
        s = 25 + (same >= 3 ? 25 : 0) + same * 3;
        break;
      }
      case "skipEveryone": s = 40; break; // 跳过全员，强
      case "wildDraw6": s = 33; break;
      case "wildDraw10": s = 34; break;
      case "wildReverseDraw4": s = 33; break;
      case "wildColorRoulette": s = 20; break;
      case "wild": s = 4; break; // 尽量留基础万能
      case "wild4": s = 7; break;
    }
    if (card.color) s += counts[card.color] * 2; // 优先打自己多的颜色
    if (difficulty === "easy") s = Math.random() * 100; // 轻松：随机
    return s;
  }

  function chooseColor(player) {
    const counts = colorCountsOf(player);
    let best = C.COLORS[0];
    C.COLORS.forEach((c) => {
      if (counts[c] > counts[best]) best = c;
    });
    return best;
  }

  function chooseMove(game, idx) {
    const player = game.players[idx];

    // 被罚态（叠加进行中）：只能续接 stack 牌，否则吸收
    if (game.pendingDraw > 0) {
      const stack = game.playableCards(idx);
      if (stack.length) {
        // 优先用最小值的续接牌，保留大牌防御
        let best = stack[0];
        for (const c of stack) if (C.drawValue(c) < C.drawValue(best)) best = c;
        const color = C.isWild(best) ? chooseColor(player) : null;
        return { action: "play", cardId: best.id, color };
      }
      return { action: "draw" }; // 吸收
    }

    const playable = game.playableCards(idx);
    if (playable.length === 0) return { action: "draw" };

    const counts = colorCountsOf(player);
    let best = playable[0];
    let bestScore = -Infinity;
    for (const card of playable) {
      const sc = scoreCard(card, counts, player, game.difficulty);
      if (sc > bestScore) {
        bestScore = sc;
        best = card;
      }
    }
    const color = C.isWild(best) ? chooseColor(player) : null;
    return { action: "play", cardId: best.id, color };
  }

  global.UnoAI = { chooseMove };
})(typeof window !== "undefined" ? window : globalThis);
