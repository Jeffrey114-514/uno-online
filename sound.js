/* =========================================================
 * sound.js — 合成音效 + 背景音乐（Web Audio，无需外部文件）
 * 出牌 / 摸牌 / 功能牌 / UNO / 胜负 均有对应提示音；
 * BGM 为程序生成的柔和循环（C-G-Am-F 进行），仅在对局进行中播放，
 * 受全局静音与「背景音乐开关」共同控制，完全本地（不影响其他玩家）。
 * ========================================================= */
(function (global) {
  "use strict";
  let ctx = null;
  let muted = false;
  let active = false; // 仅在对局进行中（startGame/onlineStart 后、退出前）才播放
  try { muted = localStorage.getItem("uno_muted") === "1"; } catch (e) {}

  // 背景音乐开关（每台设备独立，默认开启）
  let bgmOn = true;
  try { bgmOn = localStorage.getItem("uno_bgm") !== "0"; } catch (e) {}
  let bgmVol = 0.5; // 0~1，默认一半
  try { bgmVol = Math.max(0, Math.min(1, parseFloat(localStorage.getItem("uno_bgm_vol")) || 0.5)); } catch (e) {}
  let bgmTimer = null;
  let bgmNext = 0;
  let bgmStep = 0;

  // 4 和弦进行：C - G - Am - F（经典、悦耳、循环）
  const BGM_CHORDS = [
    [261.63, 329.63, 392.00], // C  E  G
    [196.00, 246.94, 392.00], // G  B  D
    [220.00, 261.63, 329.63], // A  C  E
    [174.61, 220.00, 261.63], // F  A  C
  ];
  const BGM_BASS = [130.81, 98.00, 110.00, 87.31]; // 各和弦根音低八度
  const BGM_STEP_DUR = 0.42;
  const BGM_VOL = 0.05;

  function ensure() {
    if (!ctx) {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, when, vol) {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + (when || 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.18, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  /* ---------------- 背景音乐 ---------------- */
  function bgmStart() {
    const c = ensure();
    if (!c || bgmTimer) return;
    bgmNext = c.currentTime + 0.08;
    bgmStep = 0;
    bgmScheduler();
    bgmTimer = setInterval(bgmScheduler, 90);
  }
  function bgmStop() {
    if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
  }
  function bgmScheduler() {
    const c = ctx;
    if (!c) return;
    const ahead = c.currentTime + 0.4;
    while (bgmNext < ahead) {
      if (!muted) bgmNote(c, bgmNext, bgmStep);
      bgmNext += BGM_STEP_DUR;
      bgmStep = (bgmStep + 1) % 16;
    }
  }
  function bgmNote(c, t, step) {
    const v = BGM_VOL * bgmVol; // 应用用户音量
    const chord = BGM_CHORDS[Math.floor(step / 4) % 4];
    const idx = step % 4;
    const freq = idx < 3 ? chord[idx] : chord[0] * 2; // 第 4 拍奏高八度，制造流动感
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + BGM_STEP_DUR * 0.95);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(t);
    osc.stop(t + BGM_STEP_DUR);
    // 每个和弦首拍加一记柔和低音
    if (idx === 0) {
      const b = c.createOscillator();
      const bg = c.createGain();
      b.type = "triangle";
      b.frequency.setValueAtTime(BGM_BASS[Math.floor(step / 4) % 4], t);
      bg.gain.setValueAtTime(0.0001, t);
      bg.gain.exponentialRampToValueAtTime(v * 1.1, t + 0.04);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + BGM_STEP_DUR * 1.8);
      b.connect(bg);
      bg.connect(c.destination);
      b.start(t);
      b.stop(t + BGM_STEP_DUR * 2);
    }
  }
  function refreshBgm() {
    if (active && bgmOn && !muted) bgmStart();
    else bgmStop();
  }

  const presets = {
    play:    () => tone(520, 0.14, "triangle", 0, 0.16),
    draw:    () => { tone(300, 0.10, "sawtooth", 0, 0.10); tone(220, 0.10, "sawtooth", 0.06, 0.09); },
    skip:    () => { tone(200, 0.18, "square", 0, 0.14); tone(140, 0.22, "square", 0.08, 0.12); },
    reverse: () => { tone(440, 0.12, "triangle", 0, 0.14); tone(660, 0.12, "triangle", 0.10, 0.14); },
    draw2:   () => { tone(180, 0.20, "square", 0, 0.16); tone(120, 0.24, "square", 0.10, 0.14); },
    draw4:   () => { tone(160, 0.26, "square", 0, 0.18); tone(110, 0.30, "square", 0.12, 0.16); },
    wild:    () => { tone(523, 0.10, "triangle", 0, 0.14); tone(659, 0.10, "triangle", 0.08, 0.14); tone(784, 0.12, "triangle", 0.16, 0.14); },
    uno:     () => { tone(700, 0.10, "square", 0, 0.16); tone(900, 0.10, "square", 0.09, 0.16); tone(1150, 0.16, "square", 0.18, 0.16); },
    win:     () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, "triangle", i * 0.12, 0.18)); },
    lose:    () => { [400, 320, 250].forEach((f, i) => tone(f, 0.30, "sine", i * 0.14, 0.16)); },
    invalid: () => tone(150, 0.10, "square", 0, 0.10),
  };

  const UnoSound = {
    isMuted() { return muted; },
    setMuted(m) {
      muted = !!m;
      try { localStorage.setItem("uno_muted", muted ? "1" : "0"); } catch (e) {}
      refreshBgm(); // 静音也作用于 BGM
    },
    toggle() { this.setMuted(!muted); return muted; },
    setActive(a) { active = !!a; refreshBgm(); },
    isActive() { return active; },
    // 背景音乐开关（每台设备独立）
    isBgmOn() { return bgmOn; },
    setBgm(on) {
      bgmOn = !!on;
      try { localStorage.setItem("uno_bgm", bgmOn ? "1" : "0"); } catch (e) {}
      refreshBgm();
    },
    // 背景音乐音量（0~1，每台设备独立）
    getBgmVolume() { return bgmVol; },
    setBgmVolume(v) {
      bgmVol = Math.max(0, Math.min(1, v));
      try { localStorage.setItem("uno_bgm_vol", String(bgmVol)); } catch (e) {}
      // 音量变化时若正在播放则无需重启，下一拍立即生效；关闭态保持
    },
    play(name) {
      if (muted || !active) return;
      const fn = presets[name];
      if (fn) { try { fn(); } catch (e) {} }
    },
  };

  global.UnoSound = UnoSound;
})(window);
