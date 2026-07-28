// === Router: 屏幕路由 + 过渡动画 ===
// 用 hash 路由（#menu / #lobby / #game / #result）管理页面切换。
// 替代原来手动 toggle .active 的方式，支持：
//   • CSS 过渡动画（fade / slide）
//   • URL 反映当前状态
//   • 浏览器前进/后退按钮
//   • 刷新不丢状态（hash 恢复）

var Router = (() => {
  const screens = {};    // { name: { el, onEnter, onLeave } }
  let current = null;
  let transitioning = false;
  let pendingNav = null;  // 过渡进行中又来新导航：缓存最后一个，过渡结束后补执行（避免被静默丢弃）
  const animDuration = 320; // ms，与 CSS 匹配

  // 注册一个屏幕
  function register(name, el, opts) {
    screens[name] = {
      el: typeof el === 'string' ? document.getElementById(el) : el,
      onEnter: opts?.onEnter || null,
      onLeave: opts?.onLeave || null,
      defaultHash: opts?.defaultHash || '#' + name
    };
  }

  // 导航到指定屏幕
  function navigate(name, pushState = true) {
    if (!screens[name] || current === name) return;
    // 过渡动画进行中：不丢导航，缓存最后一个，等当前过渡收尾后再补执行
    if (transitioning) { pendingNav = { name, pushState }; return; }
    doNavigate(name, pushState);
  }

  function doNavigate(name, pushState) {
    const target = screens[name];
    if (!target.el) return;

    transitioning = true;
    const prev = current ? screens[current] : null;

    // 离开动画
    if (prev && prev.el) {
      prev.el.classList.add('screen-exit');
      if (prev.onLeave) prev.onLeave();
    }

    // 进入动画
    target.el.classList.remove('screen-hidden', 'screen-exit');
    target.el.classList.add('screen-enter', 'screen-active');  // 立即激活（测试兼容）

    // 强制重排以触发动画
    void target.el.offsetWidth;

    // 动画帧：移除 enter 类（视觉过渡完成）
    requestAnimationFrame(() => {
      target.el.classList.remove('screen-enter');
      if (prev && prev.el) {
        // 延迟隐藏旧屏幕（等退出动画结束）
        setTimeout(() => {
          prev.el.classList.remove('screen-exit', 'screen-active');
          prev.el.classList.add('screen-hidden');
        }, animDuration);
      }

      try {
        if (target.onEnter) target.onEnter();
      } catch (e) {
        // onEnter 抛错绝不能让 transitioning 永久卡死（否则后续所有跳转都被缓存且不执行）
        console.error('[Router] onEnter error for', name, e);
      }

      // 更新 URL hash
      if (pushState) {
        try {
          history.pushState({ screen: name }, '', target.defaultHash);
        } catch(e) {}
      }

      current = name;
      setTimeout(() => {
        transitioning = false;
        // 过渡期间若又请求了别的屏幕，补执行最后一个（不丢导航）
        if (pendingNav) {
          const p = pendingNav; pendingNav = null;
          navigate(p.name, p.pushState);
        }
      }, animDuration);
    });
  }

  // 返回上一屏幕（用 popstate 或手动记录栈）
  function back() {
    // 浏览器后退会自动触发 popstate；这里只做 fallback
    if (history.length > 1) {
      history.back();
    } else {
      navigate('menu'); // 没有 history 就回菜单
    }
  }

  // 处理浏览器前进/后退
  function handlePopState(e) {
    const hash = location.hash || '#menu';
    const name = hash.replace('#', '') || 'menu';
    if (screens[name]) {
      navigate(name, false); // 不再 pushState
    }
  }

  // 初始化：注册所有屏幕并监听 hash 变化
  function init(screenDefs) {
    for (const [name, def] of Object.entries(screenDefs)) {
      register(name, def.el, def);
    }

    window.addEventListener('popstate', handlePopState);

    // 首次加载：用当前 hash 或默认 menu
    const initialHash = location.hash.replace('#', '') || 'menu';
    if (screens[initialHash]) {
      current = null; // 让 navigate 正常执行
      // 先把所有屏幕设为 hidden
      for (const s of Object.values(screens)) {
        if (s.el) s.el.classList.add('screen-hidden');
      }
      navigate(initialHash, false);
    }
  }

  return { register, navigate, back, init, get current() { return current; }, get screens() { return screens; } };
})();
