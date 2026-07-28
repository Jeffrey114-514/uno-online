/* =========================================================
 * cards.js — UNO 牌库与牌面工具（支持经典 / 家庭 / No Mercy）
 * 牌对象: { id, type, color, value }
 *   color: red | yellow | green | blue | null(万能牌)
 *   value: 0-9 (仅 number)
 *
 * 牌型 type:
 *   经典/家庭: number, skip, reverse, draw2(彩色+2), wild, wild4(万能+4)
 *   No Mercy 额外: draw4(彩色+4), discardAll(彩色,弃同色),
 *                  skipEveryone(彩色), wildDraw6, wildDraw10,
 *                  wildReverseDraw4, wildColorRoulette(均为万能)
 * ========================================================= */
(function (root) {
  "use strict";

  const COLORS = ["red", "yellow", "green", "blue"];

  // 显示符号
  const SYMBOL = {
    skip: "⊘",
    reverse: "⇄",
    draw2: "+2",
    draw4: "+4",
    discardAll: "🗑️",
    skipEveryone: "⊘⊘⊘",
    wild: "★",
    wild4: "+4",
    wildDraw6: "+6",
    wildDraw10: "+10",
    wildReverseDraw4: "⇄+4",
    wildColorRoulette: "🎡",
  };

  // 每种牌型的元数据：wild=万能牌(任意出/需选色)；stack=可参与叠加的 Draw 牌；draw=罚摸值
  const META = {
    number: { wild: false, stack: false, draw: 0 },
    skip: { wild: false, stack: false, draw: 0 },
    reverse: { wild: false, stack: false, draw: 0 },
    draw2: { wild: false, stack: true, draw: 2 },
    draw4: { wild: false, stack: true, draw: 4 }, // No Mercy 彩色 +4（需匹配颜色）
    discardAll: { wild: false, stack: false, draw: 0 },
    skipEveryone: { wild: false, stack: false, draw: 0 },
    wild: { wild: true, stack: false, draw: 0 },
    wild4: { wild: true, stack: true, draw: 4 }, // 经典万能 +4（家庭版用）
    wildDraw6: { wild: true, stack: true, draw: 6 },
    wildDraw10: { wild: true, stack: true, draw: 10 }, // 可作为续接牌，但自身为终结（值10无法再被叠）
    wildReverseDraw4: { wild: true, stack: true, draw: 4 },
    wildColorRoulette: { wild: true, stack: false, draw: 0 },
  };

  function metaOf(card) {
    return META[card.type] || { wild: false, stack: false, draw: 0 };
  }
  function isWild(card) {
    return !!metaOf(card).wild;
  }
  function isStackable(card) {
    return !!metaOf(card).stack;
  }
  function drawValue(card) {
    return metaOf(card).draw;
  }
  /* 叠加家族标签（用于序列化记录栈起始类型，No Mercy 出牌校验不使用此函数；
     No Mercy 官方规则是纯 drawValue 数值比较，不分家族，彩色与万能可互相叠）。 */
  function stackFamily(card) {
    const t = card && card.type;
    if (t === "draw2") return "draw2";
    if (t === "draw4") return "draw4";
    if (t === "wild4" || t === "wildDraw6" || t === "wildDraw10" || t === "wildReverseDraw4") return "wildDraw";
    return null;
  }
  // 彩色动作牌（需匹配颜色，非万能）
  function isColorAction(card) {
    return ["skip", "reverse", "draw2", "draw4", "discardAll", "skipEveryone"].includes(card.type);
  }

  let _uid = 0;
  function makeCard(type, color, value) {
    return {
      id: "c" + _uid++,
      type,
      color: color || null,
      value: value == null ? null : value,
    };
  }

  /** 经典 / 家庭：标准 108 张（含万能 +4 的 wild4） */
  function createClassicDeck() {
    const deck = [];
    COLORS.forEach((color) => {
      deck.push(makeCard("number", color, 0));
      for (let v = 1; v <= 9; v++) {
        deck.push(makeCard("number", color, v));
        deck.push(makeCard("number", color, v));
      }
      for (let i = 0; i < 2; i++) {
        deck.push(makeCard("skip", color));
        deck.push(makeCard("reverse", color));
        deck.push(makeCard("draw2", color));
      }
    });
    for (let i = 0; i < 4; i++) {
      deck.push(makeCard("wild"));
      deck.push(makeCard("wild4"));
    }
    return deck;
  }

  /** No Mercy：168 张官方牌组
   *  数字 0-9 每色(19) ×4 = 76
   *  彩色动作 skip/reverse/draw2/draw4/discardAll/skipEveryone 每色 3 张 ×4 = 72
   *  万能 wild/wildDraw6/wildDraw10/wildReverseDraw4/wildColorRoulette 各 4 张 = 20
   *  合计 168（牌型齐全，数量按官方近似分布）
   */
  function createNoMercyDeck() {
    const deck = [];
    COLORS.forEach((color) => {
      deck.push(makeCard("number", color, 0));
      for (let v = 1; v <= 9; v++) {
        deck.push(makeCard("number", color, v));
        deck.push(makeCard("number", color, v));
      }
      // 每色各 3 张彩色动作牌
      const acts = ["skip", "reverse", "draw2", "draw4", "discardAll", "skipEveryone"];
      acts.forEach((t) => {
        deck.push(makeCard(t, color));
        deck.push(makeCard(t, color));
        deck.push(makeCard(t, color));
      });
    });
    const wilds = ["wild", "wildDraw6", "wildDraw10", "wildReverseDraw4", "wildColorRoulette"];
    wilds.forEach((t) => {
      for (let i = 0; i < 4; i++) deck.push(makeCard(t));
    });
    return deck;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * 判断 card 能否压在 (topCard, activeColor) 上（不含叠加态，叠加由引擎单独处理）
   * activeColor: 当前生效颜色（万能牌指定的颜色）
   */
  function canPlay(card, topCard, activeColor) {
    if (isWild(card)) return true; // 万能牌任意出
    if (card.color === activeColor) return true; // 同色
    if (card.type === "number" && topCard.type === "number") {
      return card.value === topCard.value;
    }
    // 彩色动作牌：颜色不同则按符号(类型)匹配
    if (isColorAction(card)) {
      return card.type === topCard.type;
    }
    return false;
  }

  /** 显示符号 */
  function symbolOf(card) {
    if (card.type === "number") return String(card.value);
    return SYMBOL[card.type] || "";
  }

  root.UnoCards = {
    COLORS,
    SYMBOL,
    META,
    metaOf,
    isWild,
    isStackable,
    drawValue,
    stackFamily,
    isColorAction,
    makeCard,
    createClassicDeck,
    createNoMercyDeck,
    shuffle,
    canPlay,
    symbolOf,
  };
})(typeof window !== "undefined" ? window : globalThis);
