/* =========================================================
 * i18n.js — 中英双语层
 *   I18n.t(key, params)  取译文，支持 {name}/{n}/{t}/{color} 占位
 *   I18n.setLang(lang)   切换语言并持久化
 *   I18n.applyStatic()   刷新所有 [data-i18n] / [data-i18n-attr] 元素
 * ========================================================= */
(function (global) {
  "use strict";

  const DICT = {
    zh: {
      /* 菜单 */
      tagline: "经典卡牌 · 单机人机 / 本地多人 / 在线联机",
      modeClassic: "经典版",
      modeClassicDesc: "官方标准规则，干净利落。",
      modeFamily: "家庭版",
      modeFamilyDesc: "叠加、7-0 换牌等趣味规则，可微调。",
      modeNoMercy: "无情版",
      modeNoMercyDesc: "168 张牌 · 残酷叠加 · 25 张淘汰。",
      playMode: "对战形式",
      modeAI: "单人模式",
      modeLocal: "多人模式",
      countAI: "AI 对手数量",
      countLocal: "玩家总人数",
      diffLabel: "AI 难度",
      diffEasy: "轻松",
      diffNormal: "普通",
      houseTitle: "家庭规则（可微调）",
      houseSub: "自由勾选，开局即按所选规则进行",
      ruleStackName: "叠加 +2 / +4",
      ruleStackHint: "被 +2/+4 时可续压同型牌，罚摸累计传递",
      ruleSevenName: "7-0 换牌",
      ruleSevenHint: "出 7 与任意玩家交换手牌 · 出 0 全体传递手牌",
      ruleDrawName: "摸到能出必须出",
      ruleDrawHint: "摸牌后若可出，则必须打出，不能选择「过」",
      ruleLastName: "最后一张必须是数字牌",
      ruleLastHint: "不能用功能牌（跳过/反转/+2/万能等）收尾，必须留一张数字牌作最后一张",
      startBtn: "开始游戏",
      menuHintClassic: "提示：标准规则，与电脑对战可选难度。",
      menuHintFamily: "提示：家庭趣味规则已开启，可在上方微调。",
      menuHintNoMercy: "提示：无情版规则残酷，含叠加与 25 张淘汰，谨慎！",
      rulesBtn: "查看规则 ↗",
      tutorialBtn: "📖 新手教程",
      langName: "中文",

      /* 新手教程 */
      tutorialTitle: "📖 新手教程",
      tutTabStart: "快速上手",
      tutTabLegend: "牌型图鉴",
      tutTabNoMercy: "无情版机制",
      tutStart:
        "<h3>🎯 目标</h3><p>谁先把手里的牌<b>全部出完</b>，谁就赢！</p>" +
        "<h3>🕹 怎么出牌</h3>" +
        "<p>轮到你时，打出一张与桌面顶牌<b>颜色相同</b>、<b>数字相同</b>或<b>符号相同</b>的牌。</p>" +
        "<p>例如顶牌是 <b>红 5</b>：你可以出任意<b>红色</b>牌、任意颜色的 <b>5</b>、或万能牌。</p>" +
        "<h3>🃏 万能牌</h3><p>黑色万能牌任何时候都能出，出后由你<b>指定一个颜色</b>。</p>" +
        "<h3>✋ 出不了怎么办</h3>" +
        "<p>没有能出的牌就点<b>牌堆摸一张</b>。无情版同样只摸 1 张，可出则自选出或过。</p>" +
        "<h3>📣 别忘了喊 UNO</h3>" +
        "<p>当你只剩 <b>1 张</b>牌时，要在出倒数第二张牌时点 <b>UNO!</b> 按钮，否则罚摸 2 张。</p>" +
        "<h3>💡 小提示</h3><p>能出的牌会<b>高亮</b>并可点击；灰暗的牌代表当前不能出。牌面底部的<b>小字标注</b>会告诉你这张功能牌的效果。</p>",
      tutLegendBasic: "基础牌",
      tutLegendAction: "功能牌（需匹配颜色或符号）",
      tutLegendWild: "万能牌（任意出 · 需选色）",
      tutLegendNoMercyOnly: "无情版专属牌",
      tutNoMercy:
        "<h3>💥 无情版是什么</h3><p>168 张牌的残酷版本，功能牌更多、罚摸更狠，还会淘汰玩家。</p>" +
        "<h3>➕ 叠加罚摸（核心）</h3>" +
        "<p>被 +2 / +4 / +6 / +10 攻击时，你可以打出<b>数值 ≥ 当前累计</b>的 Draw 牌<b>续接</b>，罚摸张数会<b>不断累加</b>。</p>" +
        "<p>举例：A 出 +2 → B 出 +4（累计 6）→ C 无法续接 → C 一次摸走 <b>6 张</b>。+10 最大，无法再被压。</p>" +
        "<p>轮到你被叠加时，出可叠的牌续接，或<b>点牌堆吸收</b>全部罚牌。</p>" +
        "<h3>☠️ 25 张淘汰</h3><p>任何人手牌达到 <b>25 张</b>立即<b>出局</b>；最后存活的人获胜。</p>" +
        "<h3>🔁 摸牌</h3><p>没有能出的牌时摸 <b>1 张</b>；若摸到的牌可出，可自行选择打出或「过」。即使手上有能出的牌，也可以先摸 1 张代替出牌。</p>" +
        "<h3>🔄 7 换牌 / 0 传牌</h3><p>出 <b>7</b>：和你选中的一位玩家<b>交换整手牌</b>；出 <b>0</b>：全体按方向<b>传递整手牌</b>。</p>" +
        "<h3>🎡 颜色轮盘</h3><p>出颜色轮盘后，下家选一个颜色，然后不停翻牌进自己手里，<b>直到翻出该颜色</b>为止，并失去这一回合。</p>" +
        "<p class='tut-tip'>提示：手牌突然变多都会有浮动文字提示原因（强制摸牌 / 吸收罚牌 / 轮盘 / 换牌），留意屏幕中间的提示条。</p>",

      /* 规则弹窗（按模式注入） */
      rulesTitle: "UNO 玩法规则",
      rulesClassic:
        "<p><b>目标</b>：最先出完手牌者获胜。</p>" +
        "<p>每人发 <b>7</b> 张，翻一张作弃牌堆。轮到你出与顶牌<b>颜色 / 数字 / 符号</b>相同的牌；万能牌可随时出并指定颜色。</p>" +
        "<p><b>跳过 ⊘</b>：下家被跳过。<b>反转 ⇄</b>：方向反转（2 人时等同跳过）。</p>" +
        "<p><b>+2</b>：下家摸 2 张并被跳过。<b>万能+4</b>：指定颜色，下家摸 4 张并被跳过。</p>" +
        "<p>无牌可出时摸 1 张；若可出可自行选择出或过。剩 1 张须按 <b>UNO</b>，忘喊罚 2 张。</p>",
      rulesFamily:
        "<p>在经典规则基础上，可选开启以下趣味规则：</p>" +
        "<p><b>叠加 +2/+4</b>：被 +2/+4 攻击时，可打出同型牌续压，罚摸累计传递给下家。</p>" +
        "<p><b>7-0 换牌</b>：出 <b>7</b> 与任意玩家交换整手牌；出 <b>0</b> 全体按方向传递整手牌。</p>" +
        "<p><b>摸到能出必须出</b>：摸到的牌若可出，必须打出，不能「过」。</p>" +
        "<p><b>最后一张必须是数字牌</b>：不能用功能牌（跳过/反转/+2/万能等）作为最后一张收尾，必须留一张数字牌打出获胜。</p>",
      rulesNoMercy:
        "<p><b>无情版（Show 'Em No Mercy）</b>：168 张牌，规则残酷。</p>" +
        "<p><b>叠加</b>：被 +2/+4/+6/+10 攻击时，可打出<b>等价值或更高</b>的 Draw 牌续接；罚摸张数<b>累加</b>（如 +2 接 +4 = 6），直到有人无法续接而摸走全部累计张数。+10 为最大。</p>" +
        "<p><b>淘汰</b>：手牌达到 <b>25 张</b>立即出局；最后存活者获胜。</p>" +
        "<p><b>7 换牌 / 0 传牌</b>：出 7 与自选玩家换整手牌；出 0 全体按方向传递整手牌。</p>" +
        "<p><b>摸牌</b>：无牌可出时摸 1 张；若可出可自行选择出或过（不行则回合结束）。即使手上有能出的牌，也可选择先摸 1 张代替出牌。</p>" +
        "<p><b>新动作牌</b>：弃光同色(Discard All)、跳过全员(Skip Everyone)、万能+6/+10、反转+摸4、颜色轮盘(Color Roulette)等。</p>",

      /* 顶栏 / 游戏内 */
      quit: "← 退出",
      scoreTitle: "查看比分",
      muteTitle: "音效开关",
      bgmTitle: "背景音乐",
      bgmVol: "音量",
      appearanceTitle: "外观设置",
      appearanceSub: "以下设置仅保存在你自己的设备上，不会影响其他玩家。",
      appearanceCardSkin: "卡牌皮肤",
      appearanceTable: "桌面款式",
      skinClassic: "经典",
      skinNeon: "霓虹",
      skinPastel: "柔彩",
      skinMono: "极简",
      tableGreen: "绿绒",
      tableBlue: "蓝绒",
      tablePurple: "紫绒",
      tableCrimson: "酒红",
      cwDir: "顺时针",
      ccwDir: "逆时针",
      dirHint: "（玩家视角永远顺时针）",
      seatOrder: "座位顺序",
      prepare: "准备开始…",
      pass: "过 (Pass)",
      colorTitle: "选择颜色",
      sevenTitle: "选择交换手牌的对象",
      sevenSub: "你出了 7，选一位玩家交换全部手牌",

      /* 胜负 / 比分 */
      winTitle: "胜利！",
      winAgain: "再来一局",
      winWaitHost: "等待房主开始下一局…",
      winRematchAsked: "已请求，等待开始…",
      winMenu: "返回菜单",
      matchTitle: "🏅 本场比分",
      scoreHint: "点「再来一局」可累计比分；返回菜单则开始新比赛。",
      scoreTotalPrefix: "总分 ",

      /* 游戏内静态文字 */
      drawPile: "摸牌",
      humanName: "你",
      cardSuffix: " 张",
      eliminated: "出局",

      /* 设置弹窗 */
      settingsTitle: "设置",
      sfxTitle: "音效",

      /* 热座遮挡 */
      splashTurn: "轮到 {name}",
      splashPass: "请将设备交给该玩家",
      splashGo: "查看我的手牌",

      /* 动态状态 */
      thinking: "{name} 思考中…",
      yourTurn: "轮到你出牌",
      stackRespond: "罚摸累计 {n} 张：打出可叠的牌续接，或点牌堆吸收",
      drawnPlayable: "摸到的牌可出，或选择「过」",
      mustPlayDrawn: "摸到的牌可出，必须打出",
      noPlay: "无可出，回合结束",
      forceDrawHint: "无牌可出，正在摸牌直到可出…",

      /* 浮动 / 播报 */
      fDraw: "{name} 摸牌",
      fAutoPlay: "{name} 超时，已自动出牌",
      fPeerLeft: "{name} 离开了，已退出本局",
      fAbsorb: "摸 {n} 张（吸收罚牌）",
      fAbsorbYou: "摸 {n} 张（吸收罚牌）",
      fAbsorbName: "{name} 吸收罚牌 · 摸 {n} 张",
      fForceDrew: "{name} 无牌可出 · 强制摸了 {n} 张",
      fRoulette: "🎡 {name} 翻牌入手 · 摸了 {n} 张",
      fUnoForgot: "{name} 忘喊UNO +{n}",
      fUno: "UNO!",
      aPlay: "{name} 出 {sym}",
      aSkip: "{name} 出「跳过」⊘ · 下家被跳过",
      aReverse: "⇄ 方向反转！",
      aDraw2: "{name} 出「+2」· 下家摸 2 张",
      aWild4: "★ +4 · 选 {color}",
      aWild: "★ 万能牌 · 选 {color}",
      aStack: "{name} 出「{t}」· 罚摸累计 {n} 张！",
      aSeven: "{name} 出 7 · 与 {name2} 交换手牌",
      aZero: "0 · 全体按方向传递手牌",
      aDiscardAll: "{name} 弃光同色手牌！",
      aSkipEveryone: "{name} 跳过全员，再来一轮！",
      aWildDraw6: "★ +6 · 选 {color}",
      aWildDraw10: "★ +10 · 选 {color}",
      aWildReverseDraw4: "⇄★ +4 · 反转并选 {color}",
      aRoulette: "🎡 颜色轮盘 · {name} 选 {color}，翻牌入其手",
      penalty: "⚠ 罚摸 {n} 张 · 可叠 {t}",
      countUnit: "{n} 张",

      /* Merc y 淘汰 */
      mercyOut: "💥 {name} 手牌达 25 张，被淘汰出局！",
      mercyWin: "🏆 全场淘汰，{name} 笑到最后！",
      /* 观战（人类被淘汰后继续观看剩余对局） */
      youOutSpectate: "你已出局，观战中…",
      spectating: "观战：{name} 出牌中",
      fastEnd: "快速结束",

      /* 牌面简短标注（显示在牌上，让玩家一眼看懂效果） */
      capNumber: "数字牌",
      capSkip: "跳过",
      capReverse: "反转",
      capDraw2: "罚摸2",
      capDraw4: "罚摸4",
      capDiscardAll: "弃同色",
      capSkipEveryone: "全员跳",
      capWild: "变色",
      capWild4: "变色摸4",
      capWildDraw6: "变色摸6",
      capWildDraw10: "变色摸10",
      capWildReverseDraw4: "反转摸4",
      capWildColorRoulette: "颜色轮盘",
      capRotate: "轮转",
      capSeven: "换牌",

      /* 牌型效果说明（图鉴用） */
      fxNumber: "数字牌：按颜色或数字接牌",
      fxSkip: "跳过下一位玩家",
      fxReverse: "改变出牌方向（2 人时等于跳过）",
      fxDraw2: "下家摸 2 张并被跳过",
      fxDraw4: "彩色 +4：下家摸 4 张（需同色续接）",
      fxDiscardAll: "弃掉你手里所有当前颜色的牌",
      fxSkipEveryone: "跳过所有人，你再出一次",
      fxWild: "任意出，指定下一个颜色",
      fxWild4: "指定颜色，下家摸 4 张",
      fxWildDraw6: "指定颜色，下家摸 6 张",
      fxWildDraw10: "指定颜色，下家摸 10 张（最大）",
      fxWildReverseDraw4: "反转方向 + 指定颜色 + 下家摸 4",
      fxWildColorRoulette: "下家翻牌直到翻出所选颜色",
      fxRotate: "出 0：所有玩家按当前方向把手牌传给下家，全员轮转一次。",

      /* 新牌名（规则/提示用） */
      cardDraw4: "彩色 +4",
      cardDiscardAll: "弃光同色",
      cardSkipEveryone: "跳过全员",
      cardWildDraw6: "万能 +6",
      cardWildDraw10: "万能 +10",
      cardWildReverseDraw4: "反转万能 +4",
      cardWildColorRoulette: "颜色轮盘",

      /* 颜色名 */
      cRed: "红", cYellow: "黄", cGreen: "绿", cBlue: "蓝",

      /* 玩家名 */
      pYou: "你", pCPU: "电脑", pPlayer: "玩家", pYouP1: "你 (玩家1)",
      pNames: "玩家昵称",

      /* 在线联机大厅 */
      modeOnline: "在线联机",
      lobbyTitle: "在线联机大厅",
      netName: "你的昵称",
      netNameHint: "进入房间后仍可修改，按回车确认",
      netServer: "服务器地址",
      netCreate: "创建房间",
      netJoin: "加入房间",
      netJoinCode: "房间号",
      netHostStart: "开始游戏",
      netRoomCode: "房间号：{code}",
      netYouAreHost: "（你是房主）",
      netWaiting: "等待好友加入…",
      netPlayers: "玩家（{n}）",
      netStartHint: "至少 2 人即可开始",
      netConnecting: "连接中…",
      netConnected: "已连接",
      netCopy: "复制房间号",
      netLeave: "离开房间",
      netDisconnected: "与服务器断开",
      netPeerLeft: "{name} 离开了房间",
      netRematchAsk: "{name} 请求再来一局",
      netClosed: "房主已离开，房间关闭",
      netReconnecting: "连接断开，正在重连…",
      netReconnectHint: "请保持网络畅通，我们会自动恢复对局",
      netReconnectFail: "重连失败，已退出对局",
      winLobby: "返回大厅",
      netError: "{msg}",
      netNeed2: "在线联机至少需要 2 名玩家",
      netBadCode: "房间号无效或已满",
      netSteps: "联机三步走",
      netStep1: "1 · 起昵称",
      netStep1d: "随便起个名字，或直接用默认",
      netStep2: "2 · 创建 / 加入",
      netStep2d: "房主点「创建房间」拿到房间号；其他人点「加入房间」并填房间号",
      netStep3: "3 · 房主开始",
      netStep3d: "房主点「开始游戏」，所有人自动同步进入对局",
      netLanHint: "同 Wi-Fi 的好友请在浏览器打开：http://{ip}:8787",
      netServerHint: "同 Wi-Fi 好友直接打开 http://房主IP:8787 即可（网页自动连接），无需手填；只有从其它地址打开页面时才需填房主电脑的 IP。",
      netShareTitle: "把房间分享给好友",
      netRoomCodeLabel: "房间号",
      netCopyLink: "复制链接",
      netQRTip: "好友扫码即自动加入（同 Wi-Fi 直接扫；异地请先点「创建互联网链接」）",
      netInternetLink: "创建互联网链接（异地可连）",
      netInternetStarting: "正在打通互联网隧道，请稍候…",
      netInternetOK: "已生成互联网链接，把上面的二维码或链接发给异地好友即可加入：",
      netInternetFail: "未检测到 cloudflared，无法一键穿透。替代方案：① 安装 cloudflared 后再试；② 用 ngrok（ngrok http {port}）；③ 在路由器做端口转发把 {port} 暴露到公网。",
      netInternetStop: "关闭互联网链接",
      netAutoJoinTip: "检测到邀请链接，点击下方按钮加入房间",
      netAutoJoin: "加入房间",
      netAItitle: "电脑玩家（真人与 AI 混合）",
      netAddAI: "➕ 添加电脑",
      netRemoveAI: "➖ 移除电脑",
      netAIhint: "房主可随时加入电脑玩家，真人与 AI 一起玩（最多 8 人）。",
      netCreateRoom: "① 创建房间",
      netRandomMatch: "② 随机匹配",
      netJoinRoom: "③ 加入房间",
      netPublic: "公开房间",
      netPrivate: "私人房间",
      netRoomPublicDesc: "公开：其他玩家可随机匹配进来 · 私人：仅凭房间号 / 邀请链接进入",
      netMatchDesc: "系统把你分到有空位的公开房；没有公开房就排队，有人建房时自动进入。",
      netMatchStart: "开始匹配",
      netCreateConfirm: "确认创建",
      netJoinDesc: "输入好友分享的 4 位房间号，或通过邀请链接自动填入",
      netMatching: "匹配中…",
      netMatchCancel: "取消",
      netMatchCanceled: "已取消，可重新匹配",
      netMatchFound: "已匹配到房间，正在进入…",
      netPublicState: "公开",
      netPrivateState: "私人",
      netSharePublicTip: "切换公开 / 私人",
      netInviteHint: "复制下面的邀请链接，发给好友即可加入",
      waitTurn: "等待 {name} 出牌…",
      connecting: "连接中…",
      gameOver: "游戏结束",
      onlineTagline: "经典卡牌 · 单机人机 / 本地多人 / 在线联机",
    },

    en: {
      tagline: "Classic card game · vs AI / local / online",
      modeClassic: "Classic",
      modeClassicDesc: "Official standard rules. Clean and simple.",
      modeFamily: "Family",
      modeFamilyDesc: "Fun house rules like stacking & 7-0 swap, tweakable.",
      modeNoMercy: "No Mercy",
      modeNoMercyDesc: "168 cards · brutal stacking · out at 25 cards.",
      playMode: "Play Mode",
      modeAI: "Single Player",
      modeLocal: "Local Multiplayer",
      countAI: "AI Opponents",
      countLocal: "Total Players",
      diffLabel: "AI Difficulty",
      diffEasy: "Easy",
      diffNormal: "Normal",
      houseTitle: "House Rules (tweakable)",
      houseSub: "Tick any you like — applied from the first deal",
      ruleStackName: "Stacking +2 / +4",
      ruleStackHint: "Counter a +2/+4 with the same type; penalty accumulates",
      ruleSevenName: "Seven-O Swap",
      ruleSevenHint: "Play 7 to swap hands with a player · Play 0 rotates all hands",
      ruleDrawName: "Draw & Play",
      ruleDrawHint: "If the drawn card is playable, you must play it (no pass)",
      ruleLastName: "Last card must be a number",
      ruleLastHint: "You can't go out on an action card (skip/reverse/+2/wild…); keep a number card for the final play",
      startBtn: "Start Game",
      menuHintClassic: "Tip: standard rules, pick AI difficulty.",
      menuHintFamily: "Tip: family fun rules on — tweak them above.",
      menuHintNoMercy: "Tip: No Mercy is brutal — stacking & out at 25. Careful!",
      rulesBtn: "How to Play ↗",
      tutorialBtn: "📖 Tutorial",
      langName: "EN",

      tutorialTitle: "📖 Beginner Tutorial",
      tutTabStart: "Quick Start",
      tutTabLegend: "Card Guide",
      tutTabNoMercy: "No Mercy",
      tutStart:
        "<h3>🎯 Goal</h3><p>Be the <b>first to empty your hand</b> — that's the win!</p>" +
        "<h3>🕹 How to play a card</h3>" +
        "<p>On your turn, play a card that matches the top card by <b>color</b>, <b>number</b>, or <b>symbol</b>.</p>" +
        "<p>E.g. top card is <b>Red 5</b>: you may play any <b>red</b> card, any <b>5</b>, or a wild.</p>" +
        "<h3>🃏 Wild cards</h3><p>Black wilds can be played anytime; you then <b>choose a color</b>.</p>" +
        "<h3>✋ Can't play?</h3><p>Tap the <b>draw pile</b> to draw one. (No Mercy also draws just 1 — play it or pass.)</p>" +
        "<h3>📣 Call UNO</h3><p>When you're down to <b>1 card</b>, press <b>UNO!</b> as you play your second-to-last card, or draw 2 as penalty.</p>" +
        "<h3>💡 Tips</h3><p>Playable cards are <b>highlighted</b> and clickable; dimmed cards can't be played now. The <b>small label</b> at the bottom of each card tells you its effect.</p>",
      tutLegendBasic: "Basic cards",
      tutLegendAction: "Action cards (match color or symbol)",
      tutLegendWild: "Wild cards (play anytime · pick color)",
      tutLegendNoMercyOnly: "No Mercy exclusive cards",
      tutNoMercy:
        "<h3>💥 What is No Mercy</h3><p>A ruthless 168-card version with more action cards, harsher draws, and player elimination.</p>" +
        "<h3>➕ Stacking draws (core)</h3>" +
        "<p>When hit by +2 / +4 / +6 / +10, you may play a Draw card of <b>value ≥ current total</b> to <b>stack</b>; the penalty <b>keeps adding up</b>.</p>" +
        "<p>Example: A plays +2 → B plays +4 (total 6) → C can't counter → C draws <b>6 cards</b> at once. +10 is max and can't be stacked on.</p>" +
        "<p>On your turn under a stack, play a stackable card or <b>tap the pile to absorb</b> the whole penalty.</p>" +
        "<h3>☠️ Out at 25</h3><p>Anyone who reaches <b>25 cards</b> is <b>eliminated</b>; last player standing wins.</p>" +
        "<h3>🔁 Drawing</h3><p>With no playable card, draw <b>1</b>; if it's playable you may play it or pass. Even with playable cards you may draw 1 instead of playing.</p>" +
        "<h3>🔄 7 swap / 0 rotate</h3><p>Play <b>7</b> to swap your <b>whole hand</b> with a chosen player; play <b>0</b> to rotate all hands.</p>" +
        "<h3>🎡 Color Roulette</h3><p>Next player picks a color, then keeps revealing cards into their hand <b>until that color appears</b>, and loses the turn.</p>" +
        "<p class='tut-tip'>Tip: any sudden hand increase now shows a floating message explaining why (absorb / roulette / swap). Watch the center banner.</p>",

      rulesTitle: "How to Play UNO",
      rulesClassic:
        "<p><b>Goal</b>: be first to empty your hand.</p>" +
        "<p>Deal <b>7</b> cards each; flip one to start the discard. On your turn play a card matching the top by <b>color / number / symbol</b>; wilds set the color.</p>" +
        "<p><b>Skip ⊘</b>: next is skipped. <b>Reverse ⇄</b>: flips direction (acts as skip with 2).</p>" +
        "<p><b>+2</b>: next draws 2 and is skipped. <b>Wild +4</b>: choose color, next draws 4 and is skipped.</p>" +
        "<p>If you can't play, draw 1; may play or pass. At 1 card press <b>UNO</b> or pay 2.</p>",
      rulesFamily:
        "<p>Classic rules plus optional fun house rules:</p>" +
        "<p><b>Stacking +2/+4</b>: when hit by a +2/+4, play the same type to stack; penalty passes on.</p>" +
        "<p><b>7-0 Swap</b>: play <b>7</b> to swap hands with any player; play <b>0</b> to rotate all hands.</p>" +
        "<p><b>Draw & Play</b>: if the drawn card is playable you must play it (no pass).</p>" +
        "<p><b>Last card must be a number</b>: you can't go out on an action card (skip/reverse/+2/wild…); keep a number card for the winning play.</p>",
      rulesNoMercy:
        "<p><b>No Mercy (Show 'Em No Mercy)</b>: 168 cards, ruthless.</p>" +
        "<p><b>Stacking</b>: when hit by +2/+4/+6/+10, counter with an equal-or-higher Draw card; penalties <b>add up</b> (e.g. +2 then +4 = 6) until someone can't counter and draws the whole total. +10 is the max.</p>" +
        "<p><b>Mercy</b>: reach <b>25 cards</b> and you're out; last player standing wins.</p>" +
        "<p><b>7/0</b>: 7 swaps hands with a chosen player; 0 rotates all hands.</p>" +
        "<p><b>Drawing</b>: if you can't play, draw 1; if it's playable you may play or pass (otherwise your turn ends). Even if you have a playable card, you may choose to draw 1 instead of playing.</p>" +
        "<p><b>New cards</b>: Discard All, Skip Everyone, Wild +6/+10, Reverse +4, Color Roulette.</p>",

      quit: "← Quit",
      scoreTitle: "Scores",
      muteTitle: "Sound",
      bgmTitle: "Music",
      bgmVol: "Volume",
      appearanceTitle: "Appearance",
      appearanceSub: "These settings are stored only on your device and do not affect other players.",
      appearanceCardSkin: "Card Skin",
      appearanceTable: "Table Style",
      skinClassic: "Classic",
      skinNeon: "Neon",
      skinPastel: "Pastel",
      skinMono: "Minimal",
      tableGreen: "Green",
      tableBlue: "Blue",
      tablePurple: "Purple",
      tableCrimson: "Crimson",
      cwDir: "Clockwise",
      ccwDir: "Counter-CW",
      dirHint: " (player view always clockwise)",
      seatOrder: "Seat Order",
      prepare: "Getting ready…",
      pass: "Pass",
      colorTitle: "Choose a Color",
      sevenTitle: "Choose a player to swap hands",
      sevenSub: "You played a 7 — pick a player to swap all cards with",

      winAgain: "Play Again",
      winTitle: "Victory!",
      winWaitHost: "Waiting for host to start next round…",
      winRematchAsked: "Requested, waiting to start…",
      winMenu: "Menu",
      matchTitle: "🏅 Match Scores",
      scoreHint: "Play Again keeps scoring; Menu starts a fresh match.",
      scoreTotalPrefix: "Total ",

      drawPile: "Draw",
      humanName: "You",
      cardSuffix: " cards",
      eliminated: "Out",

      settingsTitle: "Settings",
      sfxTitle: "Sound FX",

      splashTurn: "{name}'s turn",
      splashPass: "Pass the device to this player",
      splashGo: "View my hand",

      thinking: "{name} is thinking…",
      yourTurn: "Your turn",
      stackRespond: "Penalty {n}: stack a matching Draw card, or tap the pile to absorb",
      drawnPlayable: "Drawn card is playable — play it or pass",
      mustPlayDrawn: "Drawn card is playable — you must play it",
      noPlay: "Nothing to play, turn ends",
      forceDrawHint: "No play — drawing until playable…",

      fDraw: "{name} draws",
      fAutoPlay: "{name} timed out · auto-played",
      fPeerLeft: "{name} left · removed from game",
      fAbsorb: "Draw {n} (absorb penalty)",
      fAbsorbYou: "Draw {n} (absorb penalty)",
      fAbsorbName: "{name} absorbs penalty · draws {n}",
      fForceDrew: "{name} can't play · force-drew {n}",
      fRoulette: "🎡 {name} reveals into hand · drew {n}",
      fUnoForgot: "{name} forgot UNO +{n}",
      fUno: "UNO!",
      aPlay: "{name} plays {sym}",
      aSkip: "{name} plays Skip ⊘ · next is skipped",
      aReverse: "⇄ Direction reversed!",
      aDraw2: "{name} plays +2 · next draws 2",
      aWild4: "★ +4 · color {color}",
      aWild: "★ Wild · color {color}",
      aStack: "{name} plays {t} · penalty now {n}!",
      aSeven: "{name} plays 7 · swaps hands with {name2}",
      aZero: "0 · everyone passes hands along",
      aDiscardAll: "{name} discards all same-color cards!",
      aSkipEveryone: "{name} skips everyone — goes again!",
      aWildDraw6: "★ +6 · color {color}",
      aWildDraw10: "★ +10 · color {color}",
      aWildReverseDraw4: "⇄★ +4 · reverse & color {color}",
      aRoulette: "🎡 Color Roulette · {name} picks {color}, cards revealed into hand",
      penalty: "⚠ Draw {n} · stack {t}",
      countUnit: "{n} cards",

      mercyOut: "💥 {name} hit 25 cards — eliminated!",
      mercyWin: "🏆 Last one standing — {name} wins!",
      youOutSpectate: "You're out — spectating…",
      spectating: "Spectating: {name}'s turn",
      fastEnd: "Fast End",

      capNumber: "Number",
      capSkip: "Skip",
      capReverse: "Reverse",
      capDraw2: "Draw 2",
      capDraw4: "Draw 4",
      capDiscardAll: "Discard",
      capSkipEveryone: "Skip All",
      capWild: "Wild",
      capWild4: "Wild +4",
      capWildDraw6: "Draw 6",
      capWildDraw10: "Draw 10",
      capWildReverseDraw4: "Rev +4",
      capWildColorRoulette: "Roulette",
      capRotate: "Rotate",
      capSeven: "Swap",

      fxNumber: "Number card: match color or number",
      fxSkip: "Skip the next player",
      fxReverse: "Reverse direction (acts as skip with 2 players)",
      fxDraw2: "Next player draws 2 and is skipped",
      fxDraw4: "Colored +4: next draws 4 (must match color)",
      fxDiscardAll: "Discard all cards of the current color",
      fxSkipEveryone: "Skip everyone — you go again",
      fxWild: "Play anytime, choose the next color",
      fxWild4: "Choose color, next draws 4",
      fxWildDraw6: "Choose color, next draws 6",
      fxWildDraw10: "Choose color, next draws 10 (max)",
      fxWildReverseDraw4: "Reverse + choose color + next draws 4",
      fxWildColorRoulette: "Next reveals cards until the chosen color",
      fxRotate: "Play 0: every player passes their whole hand to the next in turn order — all hands rotate once.",

      cardDraw4: "Colored +4",
      cardDiscardAll: "Discard All",
      cardSkipEveryone: "Skip Everyone",
      cardWildDraw6: "Wild +6",
      cardWildDraw10: "Wild +10",
      cardWildReverseDraw4: "Reverse Wild +4",
      cardWildColorRoulette: "Color Roulette",

      cRed: "Red", cYellow: "Yellow", cGreen: "Green", cBlue: "Blue",

      pYou: "You", pCPU: "CPU", pPlayer: "Player", pYouP1: "You (P1)",
      pNames: "Player Names",

      /* Online lobby */
      modeOnline: "Online",
      lobbyTitle: "Online Lobby",
      netName: "Your nickname",
      netNameHint: "You can still change it after joining — press Enter to confirm",
      netServer: "Server address",
      netCreate: "Create Room",
      netJoin: "Join Room",
      netJoinCode: "Room code",
      netHostStart: "Start Game",
      netRoomCode: "Room: {code}",
      netYouAreHost: "(you are host)",
      netWaiting: "Waiting for players…",
      netPlayers: "Players ({n})",
      netStartHint: "Need at least 2 players",
      netConnecting: "Connecting…",
      netConnected: "Connected",
      netCopy: "Copy code",
      netLeave: "Leave",
      netDisconnected: "Disconnected from server",
      netPeerLeft: "{name} left the room",
      netRematchAsk: "{name} wants a rematch",
      netClosed: "Host left, room closed",
      netReconnecting: "Disconnected, reconnecting…",
      netReconnectHint: "Stay online — we'll restore the game automatically",
      netReconnectFail: "Reconnect failed, left the game",
      winLobby: "Back to Lobby",
      netError: "{msg}",
      netNeed2: "Online needs at least 2 players",
      netBadCode: "Invalid or full room code",
      netSteps: "3 steps to play online",
      netStep1: "1 · Pick a nickname",
      netStep1d: "Type a name or just keep the default",
      netStep2: "2 · Create / Join",
      netStep2d: "Host taps 'Create Room' to get a code; others tap 'Join Room' and enter it",
      netStep3: "3 · Host starts",
      netStep3d: "Host taps 'Start Game' — everyone syncs in automatically",
      netLanHint: "Friends on the same Wi-Fi: open http://{ip}:8787 in their browser",
      netServerHint: "Same-Wi-Fi friends just open http://<host-IP>:8787 (auto-connect) — no manual entry needed. Only fill this if you opened the page from another address.",
      netShareTitle: "Share this room with friends",
      netRoomCodeLabel: "Room code",
      netCopyLink: "Copy link",
      netQRTip: "Friends scan to join automatically (same Wi-Fi: scan directly; remote: tap 'Create Internet Link' first)",
      netInternetLink: "Create Internet Link (for remote play)",
      netInternetStarting: "Opening internet tunnel, please wait…",
      netInternetOK: "Internet link ready — send the QR code or link below to remote friends:",
      netInternetFail: "cloudflared not found, can't auto-tunnel. Alternatives: ① install cloudflared and retry; ② use ngrok (ngrok http {port}); ③ port-forward {port} on your router.",
      netInternetStop: "Close internet link",
      netAutoJoinTip: "Invite link detected — tap below to join the room",
      netAutoJoin: "Join room",
      netAItitle: "AI Players (mix with humans)",
      netAddAI: "➕ Add AI",
      netRemoveAI: "➖ Remove AI",
      netAIhint: "Host can add AI players anytime — humans and AI play together (max 8).",
      netCreateRoom: "① Create Room",
      netRandomMatch: "② Random Match",
      netJoinRoom: "③ Join Room",
      netPublic: "Public room",
      netPrivate: "Private room",
      netRoomPublicDesc: "Public: others can match in · Private: only room code / invite link",
      netMatchDesc: "We'll drop you into an open public room; if none, you wait in queue until one opens.",
      netMatchStart: "Start Matchmaking",
      netCreateConfirm: "Confirm",
      netJoinDesc: "Enter the 4-digit room code from your friend, or use an invite link to auto-fill",
      netMatching: "Matching…",
      netMatchCancel: "Cancel",
      netMatchCanceled: "Canceled — you can match again",
      netMatchFound: "Matched! Entering room…",
      netPublicState: "Public",
      netPrivateState: "Private",
      netSharePublicTip: "Toggle public / private",
      netInviteHint: "Copy the invite link below and send it to friends",
      waitTurn: "Waiting for {name}…",
      connecting: "Connecting…",
      gameOver: "Game Over",
      onlineTagline: "Classic card game · vs AI / local / online",
    },
  };

  let lang = "zh";
  try {
    const saved = localStorage.getItem("uno_lang");
    if (saved === "zh" || saved === "en") lang = saved;
  } catch (e) {}

  function interpolate(str, params) {
    if (!params) return str;
    return str.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? params[k] : m));
  }

  const I18n = {
    get lang() { return lang; },

    t(key, params) {
      const table = DICT[lang] || DICT.zh;
      const s = table[key] != null ? table[key] : (DICT.zh[key] != null ? DICT.zh[key] : key);
      return interpolate(s, params);
    },

    colorName(c) {
      return this.t({ red: "cRed", yellow: "cYellow", green: "cGreen", blue: "cBlue" }[c] || "cRed");
    },

    /** 牌面简短标注：数字牌返回空串，功能/万能牌返回简短说明 */
    cardCaption(type) {
      const map = {
        skip: "capSkip", reverse: "capReverse", draw2: "capDraw2", draw4: "capDraw4",
        discardAll: "capDiscardAll", skipEveryone: "capSkipEveryone",
        wild: "capWild", wild4: "capWild4", wildDraw6: "capWildDraw6",
        wildDraw10: "capWildDraw10", wildReverseDraw4: "capWildReverseDraw4",
        wildColorRoulette: "capWildColorRoulette",
        seven: "capSeven",
      };
      return map[type] ? this.t(map[type]) : "";
    },

    /** 牌型效果详细说明（新手教程图鉴用） */
    cardEffect(type) {
      const map = {
        number: "fxNumber", skip: "fxSkip", reverse: "fxReverse", draw2: "fxDraw2",
        draw4: "fxDraw4", discardAll: "fxDiscardAll", skipEveryone: "fxSkipEveryone",
        wild: "fxWild", wild4: "fxWild4", wildDraw6: "fxWildDraw6",
        wildDraw10: "fxWildDraw10", wildReverseDraw4: "fxWildReverseDraw4",
        wildColorRoulette: "fxWildColorRoulette",
      };
      return map[type] ? this.t(map[type]) : "";
    },

    setLang(l) {
      if (l !== "zh" && l !== "en") return;
      lang = l;
      try { localStorage.setItem("uno_lang", l); } catch (e) {}
      document.documentElement.lang = l === "zh" ? "zh-CN" : "en";
      this.applyStatic();
    },

    toggle() {
      this.setLang(lang === "zh" ? "en" : "zh");
      return lang;
    },

    /** 刷新所有带 data-i18n 的静态节点 */
    applyStatic() {
      document.querySelectorAll("[data-i18n]").forEach((el) => {
        const key = el.getAttribute("data-i18n");
        const html = el.getAttribute("data-i18n-html") != null;
        const val = this.t(key);
        if (html) el.innerHTML = val; else el.textContent = val;
      });
      document.querySelectorAll("[data-i18n-attr]").forEach((el) => {
        el.getAttribute("data-i18n-attr").split(";").forEach((pair) => {
          const [attr, key] = pair.split(":").map((s) => s.trim());
          if (attr && key) el.setAttribute(attr, this.t(key));
        });
      });
    },
  };

  global.UnoI18n = I18n;
})(typeof window !== "undefined" ? window : globalThis);
