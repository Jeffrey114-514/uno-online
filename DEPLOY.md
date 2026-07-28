# UNO 联机版 — 云主机部署指南

本指南说明如何把「UNO 联机版」服务器部署到任意云主机（阿里云 / 腾讯云 / AWS / 任意 VPS），
让异地的朋友通过**同一个网址**直接联机，无需安装、无需手填服务器地址、无需二维码。

---

## 一、架构说明（为什么这样部署）

```
玩家浏览器 ──HTTPS──> Nginx(终结TLS) ──HTTP──> Node(server.js :8787)
        │                                            │
        └──── wss://你的域名  (WebSocket 同源) ───────┘
```

- **一个端口，两种流量**：`server.js` 同时托管「网页静态文件」和「WebSocket 中继」，二者**同源同端口**。
- **浏览器零配置**：网页加载后，WebSocket 地址自动取 `wss://当前域名`（HTTPS 页面）或 `ws://当前域名`（HTTP 页面），玩家无需输入任何服务器地址。
- **房主权威模型**：游戏引擎只在房主浏览器内存里跑，服务器只是消息中转 + 静态托管。所以服务器本身**无状态、不吃 CPU**，一台 1 核 512M 的小机器就能带很多房间。
- **邀请方式**：房主点「复制链接」得到 `https://你的域名/?room=XXXX`，朋友打开即自动填好房间号并入房。房间可设为「公开」（进入随机匹配池）或「私人」（仅链接/房间号可进）。

> 部署后，**二维码与 cloudflared 穿透功能已移除**——它们只用于「房主本机当服务器」的本地场景，云主机场景用不到。

---

## 二、前置要求

- 一台云主机（Linux，推荐 Ubuntu 22.04 / 24.04）
- 已备案域名（国内云需要；海外云可仅用 IP，但建议配域名以便上 HTTPS）
- 开放入站端口 **80、443**（用于 HTTPS）；若只用 Docker 裸跑测试也可临时开 **8787**
- 以下二选一运行环境：
  - **方式 A**：直接装 Node.js ≥ 18（推荐 20/22）
  - **方式 B**：装 Docker + Docker Compose

---

## 三、方式 A：裸跑 Node（最快验证）

```bash
# 1) 上传源码到服务器（或用 git clone 把本目录拉上去）
#    需要的文件：server.js, index.html, style.css, *.js, sw.js,
#                manifest.json, icon.svg, package.json, package-lock.json

# 2) 安装依赖（只需要 ws）
npm install --omit=dev

# 3) 启动（前台，先确认能跑起来）
PORT=8787 node server.js
# 看到 "listening on :8787" 即成功

# 4) 用进程管理器常驻（推荐 pm2，或 systemd）
npm i -g pm2
pm2 start server.js --name uno -- -p 8787     # pm2 传参方式见下注
# 注：pm2 传环境变量更稳妥的写法：
# PORT=8787 pm2 start server.js --name uno
pm2 save
pm2 startup        # 按提示把开机自启命令加进系统
```

> 裸跑时直接访问 `http://你的域名:8787` 或 `http://服务器IP:8787` 即可。生产环境建议再套一层 Nginx + HTTPS（见第五节）。

---

## 四、方式 B：Docker 部署（推荐生产）

仓库已提供 `Dockerfile` 与 `docker-compose.yml`。

```bash
# 1) 把整个项目目录传到服务器
# 2) 构建并后台启动
docker compose up -d --build

# 查看日志
docker compose logs -f

# 停止 / 更新
docker compose down
# 改了代码后重新构建：
docker compose up -d --build
```

默认容器只把 8787 绑在 `127.0.0.1`，需要本机再跑 Nginx 反代（见下）。
若想先用 HTTP 裸跑测试，把 `docker-compose.yml` 的 `ports` 改成 `"8787:8787"` 即可。

自定义端口：
```bash
PORT=9000 docker compose up -d --build
# 同时把 docker-compose.yml 的 ports 与 nginx 的 proxy_pass 端口同步改掉
```

---

## 五、Nginx + HTTPS（生产必做）

浏览器在 **HTTPS 页面里只能用 `wss://`**（不能用 `ws://`），所以要上 HTTPS，否则跨设备联机会被浏览器拦截。

1. 安装 Nginx：
   ```bash
   sudo apt update && sudo apt install -y nginx
   ```
2. 把仓库里的 `nginx.conf.example` 复制为站点配置并改域名：
   ```bash
   sudo cp nginx.conf.example /etc/nginx/sites-available/uno
   sudo ln -s /etc/nginx/sites-available/uno /etc/nginx/sites-enabled/uno
   sudo sed -i 's/your.domain.com/你的真实域名/g' /etc/nginx/sites-available/uno
   sudo nginx -t && sudo systemctl reload nginx
   ```
3. 申请免费证书（certbot）：
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d 你的真实域名
   # 按提示选「重定向 HTTP→HTTPS」，证书会自动续期
   sudo nginx -t && sudo systemctl reload nginx
   ```
4. 访问 `https://你的域名` ——网页与联机都走 HTTPS，朋友打开就能玩。

> 关键配置点：Nginx 的 `location /` 里必须带
> `proxy_set_header Upgrade $http_upgrade;` 和 `proxy_set_header Connection "upgrade";`
> 这两个头是把 HTTP 升级成 WebSocket 的开关，缺了联机连不上。仓库 `nginx.conf.example` 已写好。

---

## 六、防火墙 / 安全组

- 只对外暴露 **80、443**；**8787 不要**直接对公网开放（交给 Nginx 反代即可，Docker 方式已默认只绑 127.0.0.1）。
- 云厂商控制台里，把安全组入站规则设为允许 `TCP 80`、`TCP 443` 来自 `0.0.0.0/0`。
- 如需更强的防护，可在 Nginx 加 `limit_req` 限流、或仅允许特定国家/IP。

---

## 七、游戏内联机逻辑（部署后行为）

| 功能 | 行为 |
|------|------|
| **① 创建房间** | 房主填昵称 → 点「创建房间」→ 得到 4 位房间号；可切「公开/私人」。 |
| **② 随机匹配** | 玩家点「开始匹配」→ 进入全局等待队列 → 被自动塞进一个有空位的**公开**房间；房主建房/返回大厅/移除电脑腾出空位时都会自动拉人。可随时「取消」。 |
| **③ 加入房间** | 输入 4 位房间号，或打开「复制链接」得到的 `?room=XXXX` 链接自动填入。私人房间只能这样进。 |
| **公开 / 私人** | 房主在大厅「公开房间」开关切换；公开房会出现在匹配池，私人房仅链接/房间号可进。 |
| **机器人** | 房主仍可自由「添加/移除电脑」，与单机一致。 |
| **再来一局** | 游戏结束后房主点「再来一局」，全员留房、按实际出牌顺序重排座位后重开，逻辑不变。 |
| **断线重连** | 瞬时掉线保留座位 60 秒，重连无缝续局（房主标签页未关即可）。 |

---

## 八、运维

- **看日志**：`pm2 logs uno` 或 `docker compose logs -f`
- **重启**：`pm2 restart uno` / `docker compose restart`
- **更新代码**：拉最新文件 → `npm install`（依赖变了才需要）→ 重启服务 → **强制刷新一次浏览器**（Service Worker 已升到 `uno-cache-v3`，硬刷后自动拿新资源）
- **改端口**：用 `PORT` 环境变量，并同步 Nginx `proxy_pass` 与 `docker-compose.yml` 的 `ports`
- **备份**：本项目**无数据库、无状态**，服务器目录直接打包即可；玩家数据都在各自浏览器。

---

## 九、常见问题

**Q：朋友打开链接能进大厅但联机连不上 / 一直转圈？**
A：基本都是 Nginx 没转发 WebSocket 升级头。确认 `nginx.conf.example` 里的 `Upgrade` / `Connection` 两行已配置并 `nginx -t && reload`。另外确认页面是 **HTTPS**（HTTPS 页面只能用 `wss://`）。

**Q：浏览器报混合内容 / WebSocket 被拦截？**
A：页面是 `https` 但 WS 是 `ws://` 会被拦。本项目已自动按页面协议选 `wss/ws`，只要 Nginx 上了 HTTPS 就不会出现。

**Q：服务器 IP 能直接访问吗？**
A：能，但生产建议上域名 + HTTPS。Docker 方式默认 8787 仅绑本地，需 Nginx 反代；裸跑方式可直接 `http://IP:8787`。

**Q：最多能几人一局？**
A：当前 `ROOM_CAP = 5`（含房主）。可在 `server.js` 顶部调大，但注意房主浏览器要承载全部人的引擎运算。

**Q：部署后还需要本机的 start.command 吗？**
A：不需要。那是「房主本机当服务器」的本地玩法。云主机部署后，所有人只需浏览器打开域名。
