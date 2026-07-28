# 🎴 UNO 联机版（网页版）

纯前端 UNO 网页游戏：经典 / 家庭 / 无情（No Mercy）三种规则，支持**单机对战电脑**、**同屏多人**，以及**在线联机**（房主权威 + WebSocket 中继，朋友跨设备同场玩）。

无需后端数据库，一个 Node 静态服务器 + WebSocket 中继即可运行；可部署到任意支持 Docker 的云服务器，配合免费 HTTPS 跨公网联机。

---

## ✨ 特性

- **三种规则模式**：经典（标准）、家庭（可选叠加/7-0 换牌/摸到必须出/末张须数字牌）、无情（168 张残酷版：叠加、25 张淘汰、7-0 换牌）。
- **三种对战形式**：单人（vs 电脑，可选难度）、本地多人（同屏）、在线联机。
- **在线联机**：创建房间（4 位房间号）、随机匹配、凭房间号 / 邀请链接加入；房主可加 / 减电脑玩家（真人与 AI 混合，最多 8 人）。
- **断线保留 / 重连**：联机中断线保留座位，可重新加入；大厅期断线立即释放。
- **观战 / 快速结束**：被淘汰后继续观战，剩余全 AI 时可一键快进到自然结束。
- **外观自定义**：内置卡牌皮肤（经典 / 霓虹 / 柔彩 / 极简）与桌面主题（绿 / 蓝 / 紫 / 酒红），🎨 一键切换；背景音乐开关 + 音量。
- **PWA**：可安装到桌面 / 手机主屏，离线也能进菜单、开本地对局。

---

## 🚀 快速开始（本地运行）

> 要求：Node.js ≥ 16（Mac 也可直接双击 `start.command`）。

```bash
npm install        # 安装唯一依赖 ws
npm start          # 启动服务器（默认 http://localhost:8787）
```

浏览器打开 `http://localhost:8787` 即可。

**macOS 一键启动**：双击 `start.command`（首次若被拦截，右键 → 打开，或终端执行一次 `chmod +x start.command`）。

---

## 🌐 在线联机玩法

- **房主**（运行服务器的人）：进游戏选「在线联机」→ 点「创建房间」→ 大厅显示 4 位房间号 + 复制邀请链接 → 点「开始游戏」，所有人自动同步进入对局。
- **朋友加入**：
  - 同一台电脑：打开 `http://localhost:8787` → 在线联机 → 加入房间。
  - 同一 Wi-Fi：打开 `http://<房主电脑IP>:8787`（大厅会提示同 Wi-Fi 地址）。
  - 跨网络：房主点「复制邀请」把链接发朋友（朋友打开即自动带房间号）；或在房主本机装 `cloudflared`（`brew install cloudflared`）后点「启用公网隧道」得���公网地址。

详见 [`DEPLOY.md`](./DEPLOY.md) 的生产部署与跨网方案。

---

## 🐳 部署到云服务器（推荐 Docker + Nginx + 免费 HTTPS）

完整步骤见 [`DEPLOY.md`](./DEPLOY.md)。核心：

```bash
docker compose up -d --build   # 服务起在 8787，默认只绑本地
```

再装 Nginx + certbot 上 HTTPS（复制 [`nginx.conf.example`](./nginx.conf.example) 改域名即可）。**必须上 HTTPS**——浏览器在 HTTPS 页面只能用 `wss://`，否则跨设备联机会被拦。

---

## 🎨 自定义界面（给想改样式的你）

所有视觉样式集中在 **`style.css`**，结构与文案分别在 **`index.html`** / **`i18n.js`**。配色由 `:root` 的 CSS 变量统一控制，改一处即可全局生效：

```css
:root {
  --red: #e3001b;  --yellow: #f9d000; --green: #00a651; --blue: #0077c8;
  --felt-1: #1f7a4d; --felt-2: #0c3d28;   /* 牌桌渐变 */
  --gold: #ffd479;                        /* 强调色（按钮高亮 / 激活态） */
  --ink: #0d1b14;   --panel: rgba(8,26,18,.55);
  --shadow: 0 10px 30px rgba(0,0,0,.45);
}
```

**改完怎么看效果**：本地 `npm start` 后浏览器打开 `http://localhost:8787`，改 CSS 直接刷新即可（若没生效，硬刷新 `Cmd/Ctrl+Shift+R` 清 Service Worker 缓存）。

> ⚠️ **千万别动元素的 `id`**：`menu.js` / `main.js` 是靠 `getElementById` 找按钮和容器的，改了 `id` 又不同步 JS，界面会"点了没反应"。只改样式、不动结构最安全。

---

## 📁 目录结构

```
index.html / style.css        网页结构与样式
i18n.js cards.js engine.js     多语言 / 牌模型 / 规则引擎
ai.js ui.js sound.js net.js    电脑对手 / 界面渲染 / 音效 / 联机客户端
main.js                       控制器（串联一切 + 房主权威）
router.js                      hash 路由 + 屏幕过渡
server.js                     联机服务器（托管网页 + WebSocket 中继）
sw.js / manifest.json / icon.svg   PWA（离线 + 可安装）
build.py                      生成单文件 uno-standalone.html
start.command                  macOS 一键启动
DEPLOY.md / Dockerfile / docker-compose.yml / nginx.conf.example / .dockerignore   部署
```

---

## 📜 许可

可自由使用、修改、分发；转载请保留出处。
