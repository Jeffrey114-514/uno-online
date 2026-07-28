/* =========================================================
 * engine.js — UNO 规则引擎（与界面无关）
 * 支持：经典 classic / 家庭 family / 无情 noMercy
 * ========================================================= */
(function (root) {
  "use strict";
  const C = root.UnoCards;

  class UnoGame {
    constructor(config) {
      this.players = config.players.map((p) => ({
        name: p.name,
        isAI: !!p.isAI,
        hand: [],
        saidUno: false,
        lastPlayed: null,
        eliminated: false,
      }));
      this.difficulty = config.difficulty || "normal";
      this.mode = config.mode || "classic";
      const fam = this.mode === "family";
      const nm = this.mode === "noMercy";

      // 规则派生：No Mercy 全部开启；家庭版按勾选；经典版全关
      this.stacking = nm ? true : fam ? !!config.stacking : false;
      this.sevenZero = nm ? true : fam ? !!config.sevenZero : false;
      // 注：No Mercy 与标准 UNO 一致——“有牌不必出”，回合内即使有能出的牌
      // 也可选择摸一张代替出牌；摸到的牌能出可立刻打出，不行就回合结束。
      // 故 No Mercy 不开启 drawToMatch / forceDraw（均为“家庭版”可选开关）。
      this.drawToMatch = fam ? !!config.drawToMatch : false;
      this.mercy = nm; // 25 张淘汰
      this.stackingMode = nm ? "value" : "sameType"; // 家庭同型 / No Mercy 数值
      this.forceDraw = false; // 标准 UNO：无牌可出时摸 1 张（可选打出），不强制摸到可出

      // 家庭规则：最后一张必须是数字牌（禁止用功能/万能牌收尾）
      this.lastMustBeNumber = !!config.lastMustBeNumber;

      this.setAside = []; // 被淘汰者手牌暂存（重洗时加回）
      this.drawPile = [];
      this.discard = [];
      this.activeColor = null;
      this.direction = 1; // 1=顺时针, -1=逆时针
      this.current = 0;
      this.winner = null;
      this.over = false;
      this.pendingDraw = 0; // 叠加累计罚摸值（>0 表示叠加进行中）
      this.stackTopValue = 0; // value 模式栈顶值
      this.stackType = null; // sameType 模式栈顶类型
      this.immediateDraw = 0; // 非叠加时单张 Draw 牌的罚摸值
      this.eventSeq = 0; // 联机播报事件序号（用于去重，避免重复横幅）
      this.lastEvent = null; // 最近一次事件 {text, type, seat, name}
      this.turnDeadline = 0; // 房主权威回合截止时间戳（ms）
      this.turnSeconds = 0;  // 房主广播时的剩余秒数（与墙钟无关，客户端据此本地倒数，避免跨机时钟偏差）
      this.unoGrace = null; // UNO 宽限窗口：{ seat, deadline }；仅剩 1 张且未喊 UNO 时给一次补喊机会
    }

    get topCard() {
      return this.discard[this.discard.length - 1];
    }
    get currentPlayer() {
      return this.players[this.current];
    }

    /** 初始化：洗牌、发牌、确定起始牌 */
    start() {
      this.drawPile = C.shuffle(
        this.mode === "noMercy" ? C.createNoMercyDeck() : C.createClassicDeck()
      );

      // 起始牌：翻到彩色数字牌为止（避免开局触发功能/万能效果；No Mercy 规则也要求动作为牌时忽略重翻）
      let start = this.drawPile.pop();
      let guard = 0;
      while (start.type !== "number") {
        this.drawPile.unshift(start);
        start = this.drawPile.pop();
        // 防御：正常牌库必含数字牌，极端情况下避免死循环
        if (++guard > 200) break;
      }
      C.shuffle(this.drawPile);

      for (let r = 0; r < 7; r++) {
        for (const p of this.players) p.hand.push(this.drawPile.pop());
      }
      this.discard = [start];
      this.activeColor = start.color;
      this.current = 0;
      this.over = false;
      this.winner = null;
      this.pendingDraw = 0;
      this.stackTopValue = 0;
      this.stackType = null;
      this.immediateDraw = 0;
    }

    aliveCount() {
      return this.players.filter((p) => !p.eliminated).length;
    }

    /** 沿当前方向走 k 个“活跃”玩家 */
    stepIdx(idx, k) {
      const n = this.players.length;
      let cur = idx;
      let moved = 0;
      while (moved < k) {
        cur = (cur + this.direction + n) % n;
        if (!this.players[cur].eliminated) moved++;
      }
      return cur;
    }

    isPlayable(card, idx) {
      // 家庭规则：最后一张不能是功能牌（必须用数字牌收尾）
      // 当该牌是玩家手里的唯一一张、且为功能牌时，禁止作为收尾打出。
      if (this.lastMustBeNumber && card && card.type !== "number") {
        if (idx == null) {
          // 调用方未传座位时，按牌归属推导（UI 渲染各座位手牌用）
          for (let k = 0; k < this.players.length; k++) {
            if (this.players[k].hand.indexOf(card) !== -1) { idx = k; break; }
          }
        }
        const len = idx != null ? this.players[idx].hand.length : 1;
        if (len === 1) return false;
      }
      if (this.stacking && this.pendingDraw > 0) {
        if (this.stackingMode === "sameType") return card.type === this.stackType;
        // No Mercy 官方叠加规则（纯数值比较，不分家族）：
        //   任何 Draw 牌只要 drawValue ≥ 栈顶牌的 stackTopValue 即可续接。
        //   +$+2(2) → 只能被 +$+2 续接（2≥2，无更低值）
        //   +$+4(4) → 可被 +$+4(4)、+$+6(6)、+$+$10(10) 续接
        //   +$+$6(6) → 可被 +$+6(6)、+$+$10(10) 续接
        //   +$+$10(10)→ 只能被另一张 +$+$10(10) 续接（最高值）
        //   彩色与万能牌可互相叠加（例：+$+2 后可叠万能 +$+6）
        if (C.drawValue(card) < this.stackTopValue) return false;
        return true;
      }
      return C.canPlay(card, this.topCard, this.activeColor);
    }

    playableCards(idx) {
      return this.players[idx].hand.filter((c) => this.isPlayable(c, idx));
    }

    /** 出牌；返回 {effect, card, activeColor, special, nextIdx, penalty} 或 null */
    playCard(idx, cardId, chosenColor) {
      const player = this.players[idx];
      if (player.eliminated) return null; // 已出局者不能再出牌（防御：避免摸到 25 张淘汰后仍被尝试出牌）
      const i = player.hand.findIndex((c) => c.id === cardId);
      if (i === -1) return null;
      const card = player.hand[i];
      if (!this.isPlayable(card, idx)) return null;
      // 家庭规则：禁止用功能牌作为最后一张收尾
      if (this.lastMustBeNumber && card.type !== "number" && player.hand.length === 1) return null;

      player.hand.splice(i, 1);
      this.discard.push(card);
      player.lastPlayed = card;

      let effect = "normal";
      let special = null;
      let nextIdx = null;
      this.immediateDraw = 0;

      // 生效颜色
      if (card.type === "wildColorRoulette") {
        this.activeColor = null; // 待下家选色
        effect = "colorRoulette";
      } else if (C.isWild(card)) {
        this.activeColor = chosenColor || C.COLORS[Math.floor(Math.random() * 4)];
      } else {
        this.activeColor = card.color;
      }

      // 反转（wildReverseDraw4 先反转方向）
      if (card.type === "wildReverseDraw4") this.direction *= -1;

      // 叠加牌处理
      if (C.isStackable(card)) {
        const dv = C.drawValue(card);
        if (this.stacking) {
          if (this.pendingDraw > 0) {
            // 续接：家族/值已在 isPlayable 校验；累计罚摸值，并记录「上一张」的值（等于/大于判断用）
            this.pendingDraw += dv;
            if (this.stackingMode === "value") this.stackTopValue = dv;
            effect = "stack";
          } else {
            this.pendingDraw = dv;
            if (this.stackingMode === "value") {
              this.stackType = C.stackFamily(card); // 记录家族（draw2/draw4/wildDraw）
              this.stackTopValue = dv;
            } else {
              this.stackType = card.type;
            }
            effect = "draw";
          }
        } else {
          effect = "drawImmediate";
          this.immediateDraw = dv;
        }
      } else if (card.type === "skip") {
        effect = "skip";
      } else if (card.type === "reverse") {
        effect = "reverse";
      } else if (card.type === "discardAll") {
        effect = "discardAll";
        const col = this.activeColor;
        const keep = [];
        const extras = [];
        for (const c of player.hand) {
          if (c.color === col) extras.push(c);
          else keep.push(c);
        }
        player.hand = keep;
        // 官方规则：弃掉的同色牌要放在 Discard All「下方」，Discard All 保持为弃牌堆顶牌。
        // 因此先弹出 line145 已压入的 Discard All 本身，把同色牌压在它下面，再把它压回最顶。
        this.discard.pop();
        for (const c of extras) this.discard.push(c);
        this.discard.push(card);
      } else if (card.type === "skipEveryone") {
        effect = "skipEveryone";
      }

      // 7/0 换牌 / 传牌（家庭 & No Mercy 通用）
      if (this.sevenZero && card.type === "number") {
        if (card.value === 7) special = "seven";
        else if (card.value === 0) special = "zero";
      }

      if (effect === "colorRoulette") nextIdx = this.stepIdx(this.current, 1);

      if (player.isAI && player.hand.length === 1) player.saidUno = true;

      return { effect, card, activeColor: this.activeColor, special, nextIdx, penalty: this.immediateDraw };
    }

    /** 家庭/No Mercy：7 换牌——交换两名玩家整手牌 */
    sevenSwap(a, b) {
      if (a === b) return;
      // 已淘汰（输了）的玩家不能再参与换牌：既不能作为发起方，也不能作为目标方
      if (this.players[a].eliminated || this.players[b].eliminated) return;
      const tmp = this.players[a].hand;
      this.players[a].hand = this.players[b].hand;
      this.players[b].hand = tmp;
      this.players[a].saidUno = false;
      this.players[b].saidUno = false;
    }

    /** 0 传递——仅在所有【未淘汰】玩家之间按当前方向传递整手牌，
     *  已淘汰玩家的手牌保持不动（否则会把活人手牌丢给已出局者）。 */
    zeroRotate() {
      const dir = this.direction;
      const live = [];
      for (let i = 0; i < this.players.length; i++) {
        if (!this.players[i].eliminated) live.push(i);
      }
      const m = live.length;
      if (m <= 1) return; // 没有可交换的活人，不动
      const hands = live.map((i) => this.players[i].hand);
      const rotated = new Array(m);
      for (let k = 0; k < m; k++) {
        const from = ((k - dir) % m + m) % m;
        rotated[k] = hands[from];
      }
      live.forEach((seat, k) => {
        this.players[seat].hand = rotated[k];
        this.players[seat].saidUno = false;
      });
    }

    /** 吸收当前叠加罚牌：摸走累计张数并清空叠加，返回摸到的张数 */
    absorbPenalty(idx) {
      const n = this.pendingDraw;
      if (n > 0) this._drawFor(idx, n);
      if (this.mercy) this._checkMercy();
      this.pendingDraw = 0;
      this.stackTopValue = 0;
      this.stackType = null;
      return n;
    }

    /** 抽一张牌（自动重洗），返回抽到的牌；无牌可抽返回 null */
    drawOne(idx) {
      if (this.drawPile.length === 0) this._reshuffle();
      if (this.drawPile.length === 0) return null;
      const card = this.drawPile.pop();
      const p = this.players[idx];
      p.hand.push(card);
      if (p.hand.length > 1) p.saidUno = false;
      // No Mercy：任何摸牌（含单次摸 1 张的常规路径）后都要检查 25 张淘汰，
      // 否则玩家可凭连续单次摸牌越过 25 张而不出局，违背 Mercy 规则。
      // _checkMercy 对已被淘汰者幂等，重复调用安全。
      if (this.mercy) this._checkMercy();
      return card;
    }

    /** No Mercy：无牌可出时持续摸牌直到摸到可出（含 Mercy 检查），返回摸到的牌数组 */
    drawToPlayable(idx) {
      const drawn = [];
      if (this.players[idx].eliminated) return drawn; // 已出局者不再摸牌
      let guard = 0;
      while (this.playableCards(idx).length === 0 && guard < 400) {
        const c = this.drawOne(idx);
        if (!c) break;
        drawn.push(c);
        if (this.mercy && this._checkMercy()) break; // 摸到 25 立即淘汰
        if (this.players[idx].eliminated) break;      // 安全：本回合内已出局立即停止
        guard++;
      }
      return drawn;
    }

    _drawFor(idx, count) {
      for (let k = 0; k < count; k++) {
        if (this.players[idx].eliminated) break; // 已出局者不再摸牌
        const c = this.drawOne(idx);
        if (this.mercy && this._checkMercy()) break;
        if (!c) break;
      }
    }

    _reshuffle() {
      if (this.discard.length <= 1) return;
      const top = this.discard.pop();
      let pile = this.discard;
      if (this.setAside.length) {
        pile = pile.concat(this.setAside);
        this.setAside = [];
      }
      this.drawPile = C.shuffle(pile);
      this.discard = [top];
    }

    /** 解决 colorRoulette：下家(idx)选色后翻牌入其手，并推进回合 */
    resolveRoulette(idx, color) {
      this.activeColor = color;
      let revealed = 0;
      let guard = 0;
      while (guard < 400 && !this.players[idx].eliminated) {
        if (this.drawPile.length === 0) this._reshuffle();
        if (this.drawPile.length === 0) break;
        const c = this.drawPile.pop();
        this.players[idx].hand.push(c);
        revealed++;
        if (this.mercy && this._checkMercy()) break;
        if (!C.isWild(c) && c.color === color) break;
        guard++;
      }
      // 翻牌者（下家）失去回合，轮到其下家
      this.current = this.stepIdx(idx, 1);
      return revealed;
    }

    /** 出牌后推进回合，处理方向/跳过/罚摸 */
    advanceTurn(effect) {
      const cur = this.current;
      let next;
      if (effect === "reverse") {
        this.direction *= -1;
        next = this.aliveCount() === 2 ? cur : this.stepIdx(cur, 1);
      } else if (effect === "skip") {
        next = this.stepIdx(cur, 2);
      } else if (effect === "stack" || effect === "draw") {
        next = this.stepIdx(cur, 1); // 轮到下家应对叠加
      } else if (effect === "absorb") {
        this.pendingDraw = 0;
        this.stackTopValue = 0;
        this.stackType = null;
        next = this.stepIdx(cur, 1);
      } else if (effect === "drawImmediate") {
        const n = this.immediateDraw || 0;
        this.immediateDraw = 0;
        this._drawFor(this.stepIdx(cur, 1), n);
        next = this.stepIdx(cur, 2);
      } else if (effect === "skipEveryone") {
        next = cur; // 出牌者再来一轮
      } else if (effect === "colorRoulette") {
        next = cur; // 不推进，等 resolveRoulette
      } else {
        next = this.stepIdx(cur, 1);
      }
      this.current = next;
    }

    /** 出牌后检查 UNO 未喊罚摸；返回罚摸张数 */
    enforceUno(idx) {
      const p = this.players[idx];
      if (p.hand.length === 1 && !p.saidUno) {
        this._drawFor(idx, 2);
        if (this.mercy) this._checkMercy();
        return 2;
      }
      return 0;
    }

    /** Mercy 淘汰：手牌 ≥25 者立即出局，手牌暂存 */
    _checkMercy() {
      if (!this.mercy) return null;
      let eliminated = null;
      for (const p of this.players) {
        if (!p.eliminated && p.hand.length >= 25) {
          p.eliminated = true;
          this.setAside.push(...p.hand);
          p.hand = [];
          eliminated = p;
        }
      }
      return eliminated;
    }

    /** 检查胜负：有人出完 → 胜；活跃 ≤1 → 最后存活者胜 */
    checkEnd() {
      if (this.over) return this.winner;
      const out = this.players.find((p) => !p.eliminated && p.hand.length === 0);
      if (out) {
        this.winner = out;
        this.over = true;
        return out;
      }
      if (this.aliveCount() <= 1) {
        this.winner = this.players.find((p) => !p.eliminated) || null;
        this.over = true;
        return this.winner;
      }
      return null;
    }

    /** 死局检测：抽牌堆空且无法重洗且活跃者都无能出牌 */
    isDeadlocked() {
      if (this.over) return false;
      if (this.drawPile.length > 0) return false;
      if (this.discard.length > 1) return false;
      return this.players
        .filter((p) => !p.eliminated)
        .every((p, j) => {
          const idx = this.players.indexOf(p);
          return this.playableCards(idx).length === 0;
        });
    }

    /** 序列化全部可变状态（用于在线联机的房主权威广播） */
    serialize() {
      return {
        v: 1,
        mode: this.mode,
        difficulty: this.difficulty,
        stacking: this.stacking,
        stackingMode: this.stackingMode,
        sevenZero: this.sevenZero,
        drawToMatch: this.drawToMatch,
        mercy: this.mercy,
        forceDraw: this.forceDraw,
        lastMustBeNumber: this.lastMustBeNumber,
        setAside: this.setAside,
        drawPile: this.drawPile,
        discard: this.discard,
        activeColor: this.activeColor,
        direction: this.direction,
        current: this.current,
        winner: this.winner || null,
        over: this.over,
        pendingDraw: this.pendingDraw || 0,
        stackTopValue: this.stackTopValue || 0,
        stackType: this.stackType || null,
        immediateDraw: this.immediateDraw || 0,
        eventSeq: this.eventSeq || 0,
        lastEvent: this.lastEvent || null,
        turnDeadline: this.turnDeadline || 0,
        turnSeconds: this.turnSeconds || 0,
        unoGrace: this.unoGrace || null,
        pendingNeed: this.pendingNeed || null,
        players: this.players.map((p, i) => ({
          seat: i,
          name: p.name,
          isAI: p.isAI,
          hand: p.hand,
          saidUno: p.saidUno,
          lastPlayed: p.lastPlayed,
          eliminated: p.eliminated,
        })),
      };
    }

    /** 还原状态（客户端收到房主广播后调用） */
    applyState(s) {
      if (!s) return this;
      this.mode = s.mode;
      this.difficulty = s.difficulty;
      this.stacking = s.stacking;
      this.stackingMode = s.stackingMode;
      this.sevenZero = s.sevenZero;
      this.drawToMatch = s.drawToMatch;
      this.mercy = s.mercy;
      this.forceDraw = s.forceDraw;
      this.lastMustBeNumber = !!s.lastMustBeNumber;
      this.setAside = s.setAside || [];
      this.drawPile = s.drawPile || [];
      this.discard = s.discard || [];
      this.activeColor = s.activeColor;
      this.direction = s.direction;
      this.current = s.current;
      this.winner = s.winner || null;
      this.over = s.over;
      this.pendingDraw = s.pendingDraw || 0;
      this.stackTopValue = s.stackTopValue || 0;
      this.stackType = s.stackType || null;
      this.immediateDraw = s.immediateDraw || 0;
      this.eventSeq = s.eventSeq || 0;
      this.lastEvent = s.lastEvent || null;
      this.turnDeadline = s.turnDeadline || 0;
      this.turnSeconds = s.turnSeconds || 0;
      this.unoGrace = s.unoGrace || null;
      this.pendingNeed = s.pendingNeed || null;
      this.players = (s.players || []).map((p) => ({
        seat: p.seat,
        name: p.name,
        isAI: p.isAI,
        hand: p.hand || [],
        saidUno: p.saidUno,
        lastPlayed: p.lastPlayed,
        eliminated: p.eliminated,
      }));
      return this;
    }
  }

  root.UnoGame = UnoGame;
})(typeof window !== "undefined" ? window : globalThis);
