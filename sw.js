/* =========================================================
 * sw.js — UNO 渐进式 Web 应用（PWA）Service Worker
 *   · 预缓存应用外壳（离线也能打开菜单 / 开始本地对局）
 *   · 静态资源缓存优先 + 后台更新；导航网络优先、失败回退缓存
 *   · 联机 WebSocket 与服务端动态接口（/ip）不走缓存
 * ========================================================= */
const CACHE = "uno-cache-v6";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./i18n.js",
  "./cards.js",
  "./engine.js",
  "./ai.js",
  "./ui.js",
  "./sound.js",
  "./net.js",
  "./router.js",
  "./menu.js",
  "./main.js",
  "./manifest.json",
  "./icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // 只接管同源请求
  if (url.origin !== self.location.origin) return;
  // 服务端动态接口实时性高，不缓存，直接走网络
  if (["/ip"].includes(url.pathname)) return;

  // 页面导航：网络优先，失败回退缓存（保证断网仍能进菜单）
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // 其它静态资源：网络优先 + 失败回退缓存（保证代码更新即时生效，断网仍可进菜单/本地对局）
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
