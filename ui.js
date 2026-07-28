/* =========================================================
 * ui.js — 渲染与界面交互（不含游戏逻辑）
 * ========================================================= */
(function (global) {
  "use strict";
  const C = global.UnoCards;
  const I = global.UnoI18n;

  const COLORMAP = { red: "#e3001b", yellow: "#f9d000", green: "#00a651", blue: "#0077c8" };

  const UI = {
    mode: "ai",
    mySeat: 0,
    onCardClick: null,
    onColor: null,
    onInvalid: null,
    seatEls: [],
    onlyDrawn: null,

    cache() {
      this.el = {
        seats: document.getElementById("seats"),
        drawPile: document.getElementById("draw-pile"),
        discard: document.getElementById("discard-pile"),
        colorInd: document.getElementById("color-indicator"),
        penalty: document.getElementById("penalty-chip"),
        hand: document.getElementById("hand"),
        humanArea: document.querySelector(".human-area"),
        humanName: document.getElementById("human-name"),
        humanCount: document.getElementById("human-count"),
        status: document.getElementById("status"),
        direction: document.getElementById("direction"),
        unoBtn: document.getElementById("uno-btn"),
        colorModal: document.getElementById("color-modal"),
        winOverlay: document.getElementById("win-overlay"),
        winTitle: document.getElementById("win-title"),
        winSub: document.getElementById("win-sub"),
      };
    },

    buildSeats(game) {
      this.seatEls = [];
      this.el.seats.innerHTML = "";
      for (let i = 0; i < game.players.length; i++) {
        const seat = document.createElement("div");
        seat.className = "seat";
        seat.innerHTML = `
          <div class="seat-cards"></div>
          <div class="seat-last"></div>
          <div class="seat-name">${game.players[i].name}</div>
          <div class="seat-count">0</div>`;
        this.el.seats.appendChild(seat);
        this.seatEls.push({
          root: seat,
          name: seat.querySelector(".seat-name"),
          count: seat.querySelector(".seat-count"),
          cards: seat.querySelector(".seat-cards"),
          last: seat.querySelector(".seat-last"),
        });
      }
    },

    bottomPlayerIndex(game) {
      if (this.mode === "online") return this.mySeat;
      return this.mode === "ai" ? 0 : game.current;
    },

    renderAll(game, interactive) {
      this.renderSeats(game);
      this.renderHand(game, { interactive: !!interactive, onlyDrawn: this.onlyDrawn });
      this.renderDiscard(game);
      this.renderDrawCount(game);
      this.setDirection(game);
      this.renderPenalty(game);
    },

    renderPenalty(game) {
      const chip = this.el.penalty;
      if (game && game.stacking && game.pendingDraw > 0) {
        const t = game.stackingMode === "value"
          ? game.pendingDraw
          : (game.stackType === "wild4" ? "4" : "2");
        chip.textContent = I.t("penalty", { n: game.pendingDraw, t: "+" + t });
        chip.classList.add("show");
      } else {
        chip.classList.remove("show");
      }
    },

    renderSeats(game) {
      const bottom = this.bottomPlayerIndex(game);
      // 按“实际出牌顺序”环绕桌面排列对手：当前回合高亮会在所有客户端一致地顺时针/逆时针扫过，
      // 而不是按引擎座位序号跳着走（非房主客户端视角下出牌顺序错乱的根因）。
      const dir = game.direction || 1;
      const n = game.players.length;
      const visible = [];
      let idx = bottom;
      for (let s = 0; s < n - 1; s++) {
        idx = (idx + dir + n) % n;
        visible.push(idx);
      }

      const k = visible.length;
      visible.forEach((idx, slot) => {
        const seat = this.seatEls[idx];
        seat.root.style.display = "flex";
        // 在桌面上方弧形排布
        const theta = Math.PI + ((slot + 1) * Math.PI) / (k + 1); // 180°~360°
        const x = 50 + 38 * Math.cos(theta);
        const y = 46 + 30 * Math.sin(theta);
        seat.root.style.left = x + "%";
        seat.root.style.top = y + "%";

        const p = game.players[idx];
        if (p.eliminated) {
          seat.root.classList.add("eliminated");
          seat.root.classList.remove("active", "uno-said");
          seat.name.textContent = p.name + " ✖";
          seat.count.textContent = I.t("eliminated");
          seat.cards.innerHTML = "";
          seat.last.innerHTML = "";
          return;
        }
        seat.root.classList.remove("eliminated");
        seat.name.textContent = p.name;
        seat.count.textContent = p.hand.length;
        seat.root.classList.toggle("active", idx === game.current);
        seat.root.classList.toggle("uno-said", p.saidUno && p.hand.length === 1);

        // 迷你牌背
        const n = Math.min(p.hand.length, 6);
        seat.cards.innerHTML = "";
        for (let m = 0; m < n; m++) {
          const b = document.createElement("div");
          b.className = "mini-back";
          const off = m * 14;
          b.style.left = off + "px";
          b.style.transform = `rotate(${(m - (n - 1) / 2) * 6}deg)`;
          b.style.zIndex = m;
          seat.cards.appendChild(b);
        }
        seat.cards.style.width = n * 14 + 30 + "px";

        // 该玩家上一张出的牌
        seat.last.innerHTML = "";
        if (p.lastPlayed) {
          seat.last.appendChild(createCardEl(p.lastPlayed, true));
        }
      });

      // 隐藏当前在底部的玩家座位
      if (this.seatEls[bottom]) this.seatEls[bottom].root.style.display = "none";
    },

    renderHand(game, opts) {
      opts = opts || {};
      const bottom = this.bottomPlayerIndex(game);
      const player = game.players[bottom];
      this.el.humanName.textContent = player.name;
      this.el.humanCount.textContent = I.t("countUnit", { n: player.hand.length });
      this.el.hand.innerHTML = "";

      const isBottomCurrent = bottom === game.current;
      this.el.humanArea.classList.toggle("active", isBottomCurrent);

      const hand = player.hand;
      const total = hand.length;
      const mid = (total - 1) / 2;
      // 扇形排布：中心牌最高且居正，两侧渐次旋转并下沉，形成握牌弧线
      const spread = Math.min(5, 22 / Math.max(total, 1));

      hand.forEach((card, i) => {
        const el = createCardEl(card);
        const offset = i - mid;
        const rot = offset * spread;
        // 弧线高度：用 cos 抛物线，中心最高、两端归零（单张不抬升）
        const norm = mid > 0 ? offset / mid : 0;
        const arc = total <= 1 ? 0 : -Math.cos(norm * (Math.PI / 2)) * (8 + Math.min(12, total));
        el.style.setProperty("--rot", rot.toFixed(2) + "deg");
        el.style.setProperty("--ty", arc.toFixed(1) + "px");
        el.style.zIndex = String(100 - Math.abs(Math.round(offset)));

        let playable = game.isPlayable(card);
        if (opts.onlyDrawn != null) {
          playable = card.id === opts.onlyDrawn && playable;
        }
        if (!opts.interactive) {
          el.classList.add("frozen");
        } else if (playable) {
          el.classList.add("playable");
          const id = card.id;
          el.addEventListener("click", () => {
            if (this.onCardClick) this.onCardClick(id);
          });
        } else {
          el.classList.add("unplayable");
          el.addEventListener("click", () => { if (this.onInvalid) this.onInvalid(); });
        }
        if (opts.onlyDrawn === card.id) el.classList.add("drawn-highlight");
        this.el.hand.appendChild(el);
      });

      this.el.hand.classList.toggle("locked", !(opts.interactive && isBottomCurrent));
    },

    renderDiscard(game) {
      this.el.discard.innerHTML = "";
      const el = createCardEl(game.topCard);
      el.classList.remove("dealt");
      this.el.discard.appendChild(el);
      // 颜色指示
      this.el.colorInd.style.display = "block";
      this.el.colorInd.style.backgroundColor = COLORMAP[game.activeColor] || "#fff";
    },

    renderDrawCount(game) {
      document.getElementById("draw-count").textContent = game.drawPile.length;
    },

    setDirection(game) {
      // 玩家视角始终为顺时针（内部 reverse 不影响视觉方向）
      this.el.direction.classList.remove("counter");
    },

    setStatus(text) {
      this.el.status.textContent = text;
    },

    setUno(enabled) {
      this.el.unoBtn.disabled = !enabled;
    },

    setNoMercy(v) {
      showFx = !!v;
    },

    showColorModal(cb) {
      this.onColor = cb;
      this.el.colorModal.classList.add("active");
    },

    hideColorModal() {
      this.el.colorModal.classList.remove("active");
    },

    /** 7 换牌：列出可交换的对手，回调选中的索引 */
    showSevenModal(game, selfIdx, cb) {
      const modal = document.getElementById("seven-modal");
      const wrap = document.getElementById("seven-choices");
      wrap.innerHTML = "";
      game.players.forEach((p, i) => {
        if (i === selfIdx || p.eliminated) return;
        const btn = document.createElement("button");
        btn.className = "seven-choice";
        btn.innerHTML = `<span class="sc-name">${p.name}</span><span class="sc-count">${I.t("countUnit", { n: p.hand.length })}</span>`;
        btn.addEventListener("click", () => {
          modal.classList.remove("active");
          cb(i);
        });
        wrap.appendChild(btn);
      });
      modal.classList.add("active");
    },

    hideSevenModal() {
      const modal = document.getElementById("seven-modal");
      if (modal) modal.classList.remove("active");
    },

    floatMessage(text) {
      const msg = document.createElement("div");
      msg.className = "float-msg";
      msg.textContent = text;
      document.querySelector(".table").appendChild(msg);
      setTimeout(() => msg.remove(), 1200);
    },

    /** 出牌飞行动画：把克隆牌从 fromEl 飞到 toEl */
    flyCard(card, fromEl, toEl, cb) {
      const from = fromEl.getBoundingClientRect();
      const to = toEl.getBoundingClientRect();
      const clone = createCardEl(card);
      clone.classList.remove("dealt");
      clone.style.position = "fixed";
      clone.style.left = from.left + "px";
      clone.style.top = from.top + "px";
      clone.style.width = from.width + "px";
      clone.style.height = from.height + "px";
      clone.style.margin = "0";
      clone.style.zIndex = "300";
      clone.style.transition = "transform .45s cubic-bezier(.4,0,.2,1), opacity .45s";
      clone.style.pointerEvents = "none";
      document.body.appendChild(clone);
      const dx = to.left + to.width / 2 - (from.left + from.width / 2);
      const dy = to.top + to.height / 2 - (from.top + from.height / 2);
      const scale = Math.min(to.width / from.width, 0.95) || 0.9;
      requestAnimationFrame(() => {
        clone.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
      });
      setTimeout(() => {
        clone.remove();
        if (cb) cb();
      }, 480);
    },

    /** 出牌提示横幅 */
    announce(text, type) {
      const banner = document.createElement("div");
      banner.className = "play-banner type-" + (type || "play");
      banner.textContent = text;
      document.querySelector(".table").appendChild(banner);
      setTimeout(() => banner.remove(), 1600);
    },

    showWin(title, sub, breakdown) {
      this.el.winTitle.textContent = title;
      this.el.winSub.textContent = sub;
      const sc = document.getElementById("win-scores");
      sc.innerHTML = "";
      if (breakdown && breakdown.length) {
        breakdown.forEach((row) => {
          const d = document.createElement("div");
          d.className = "score-row" + (row.winner ? " winner" : "");
          const gain = row.gain > 0 ? "+" + row.gain : "—";
          d.innerHTML = `<span class="sn">${row.name}</span>
            <span class="sg">${gain}</span>
            <span class="st">${row.total}</span>`;
          sc.appendChild(d);
        });
      }
      this.el.winOverlay.classList.add("active");
    },

    /** 胜利彩带 */
    confetti() {
      const colors = ["#e3001b", "#f9d000", "#00a651", "#0077c8", "#ffd479"];
      const layer = document.createElement("div");
      layer.className = "confetti-layer";
      document.getElementById("game").appendChild(layer);
      for (let i = 0; i < 80; i++) {
        const p = document.createElement("div");
        p.className = "confetti-piece";
        p.style.left = Math.random() * 100 + "%";
        p.style.background = colors[i % colors.length];
        p.style.animationDelay = (Math.random() * 0.6) + "s";
        p.style.animationDuration = (1.6 + Math.random() * 1.4) + "s";
        p.style.transform = "rotate(" + (Math.random() * 360) + "deg)";
        layer.appendChild(p);
      }
      setTimeout(() => layer.remove(), 3600);
    },

    hideWin() {
      this.el.winOverlay.classList.remove("active");
    },
  };

  // No Mercy 模式下 0(轮转全手)/7(交换手牌) 的小功能图标（参考官方卡）
  const ROTATE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><polyline points="17,3.5 19.5,3.5 19.5,6"/></svg>';
  const SWAP_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="8,8 4,12 8,16"/><polyline points="16,8 20,12 16,16"/><line x1="4" y1="12" x2="20" y2="12"/></svg>';
  let showFx = false; // 由主逻辑按当前模式设置（No Mercy 时为 true）

  // ═════════ 官方 UNO 风格矢量图标 ═════════
  // 每个图标都是独立 SVG 字符串，通过 innerHTML 插入 <span> 内。
  // stroke="currentColor" 让线条跟随 .num(牌色) 或 .act(黑色) 的 color 属性。
  //
  // SKIP_SVG    — 禁止/跳过：粗圆环 + 斜杠（官方 Skip 牌中心图形）
  // REVERSE_SVG — 反转：两条相对直线箭头（上朝右、下朝左，经典双向符号）
  // TRASH_SVG   — 弃牌：垃圾桶轮廓（Discard All / 垃圾桶牌）
  // DRAWN_SVG   — 摸牌：向下箭头（备用，当前 Draw 用 "+N" 文本）

  const SKIP_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="11" stroke-linecap="round"><circle cx="50" cy="50" r="32"/><line x1="27" y1="27" x2="73" y2="73"/></svg>';

  // SKIPALL_SVG — 全体禁用（skipEveryone）：双环斜圈（外圈+内圈斜杠），与普通单圈 Skip 区分
  const SKIPALL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"><circle cx="50" cy="50" r="40"/><circle cx="50" cy="50" r="22"/><line x1="21" y1="21" x2="79" y2="79"/></svg>';

  // REVERSE：经典双向直线箭头（上箭头朝右、下箭头朝左），不绕圈、不悬浮，箭头尖端与杆身相连
  const REVERSE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"><line x1="14" y1="37" x2="74" y2="37"/><polyline points="60 25 76 37 60 49"/><line x1="86" y1="63" x2="26" y2="63"/><polyline points="40 51 24 63 40 75"/></svg>';

  const TRASH_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"><path d="M30 28 H70 M34 28 V22 A6 6 0 0 1 40 16 H60 A6 6 0 0 1 66 22 V28 M28 28 L33 82 A6 6 0 0 0 39 88 H61 A6 6 0 0 0 67 82 L72 28 M40 40 V76 M60 40 V76 M50 40 V76"/></svg>';

  // ═════════ 牌面 glyph 选择器 ═════════
  // 返回值类型：string（数字/"±N"文本）或 string（SVG HTML片段）
  function cardGlyph(card) {
    if (card.type === "number") return String(card.value);
    switch (card.type) {
      case "skip":         return SKIP_SVG;        // 单斜圈
      case "reverse":      return REVERSE_SVG;     // 双向箭头
      case "draw2":        return "+2";            // 文本
      case "draw4":        return "+4";            // 文本（含 No Mercy 彩色版）
      case "discardAll":   return TRASH_SVG;       // 垃圾桶
      case "skipEveryone": return SKIPALL_SVG;     // 双环斜圈，区分于普通 Skip
      default: return "[" + (card.type || "?") + "]";
    }
  }

  /** 创建一张牌的 DOM；mini=true 时缩小（用于座位上的上次出牌） */
  function createCardEl(card, mini) {
    const el = document.createElement("div");
    el.className = "card" + (mini ? " mini" : "");
    el.dataset.id = card.id;

    // 仅图标：牌面不再显示「轮转 / 换牌」等小文字（符号本身已说明牌型）
    if (C.isWild(card)) {
      el.classList.add("wild");
      const labelMap = { wild: "★", wild4: "+4", wildDraw6: "+6", wildDraw10: "+10", wildReverseDraw4: "⇄+4", wildColorRoulette: "🎡" };
      const cornerMap = { wild: "★", wild4: "W4", wildDraw6: "W6", wildDraw10: "W10", wildReverseDraw4: "W⇄", wildColorRoulette: "WR" };
      const label = labelMap[card.type] || "★";
      const corner = cornerMap[card.type] || "W";
      el.innerHTML = `
        <div class="card-corner tl">${corner}</div>
        <div class="card-inner">
          <div class="wild-quad"><span class="q1"></span><span class="q2"></span><span class="q3"></span><span class="q4"></span></div>
          <span class="wild-label">${label}</span>
        </div>
        <div class="card-corner br">${corner}</div>`;
    } else {
      el.classList.add("color-" + card.color);
      const isNum = card.type === "number";
      const cls = isNum ? "num" : "act"; // num=牌色数字 / act=黑色功能符号（官方 UNO 风）
      const glyph = cardGlyph(card);
      let fx = "";
      // 仅 No Mercy 模式下，0(轮转)/7(交换) 加一个参考官方卡的小功能图标
      if (!mini && showFx && isNum && (card.value === 0 || card.value === 7)) {
        fx = `<span class="card-fx">${card.value === 0 ? ROTATE_SVG : SWAP_SVG}</span>`;
      }
      el.innerHTML = `
        <div class="card-corner tl"><span class="${cls}">${glyph}</span></div>
        <div class="card-inner"><span class="${cls}">${glyph}</span></div>
        <div class="card-corner br"><span class="${cls}">${glyph}</span></div>${fx}`;
    }
    return el;
  }

  global.UnoUI = UI;
  global.createCardEl = createCardEl;
})(window);
