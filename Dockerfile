# =========================================================
# UNO 联机版 — 云主机部署镜像
# 镜像内同时托管「网页静态资源」与「WebSocket 中继」，
# 两者同源同端口，因此浏览器无需手填服务器地址。
# =========================================================
FROM node:20-alpine

# 用 alpine 的轻量基础镜像，镜像体积小、启动快
WORKDIR /app

# 先拷贝依赖清单并安装，利用 Docker 层缓存（仅改源码不会重装依赖）
COPY package.json package-lock.json ./
RUN npm install --omit=dev

# 拷贝全部源码与静态资源（node_modules 已在上面安装）
COPY . .

# 运行时端口（容器内），可用 docker run -e PORT=xxxx 覆盖
ENV PORT=8787

# 暴露端口供宿主机 / 反向代理访问
EXPOSE 8787

# 启动服务。docker stop 会发 SIGTERM，node 默认退出，容器优雅回收。
CMD ["node", "server.js"]
