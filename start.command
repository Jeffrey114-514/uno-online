#!/bin/bash
cd "$(dirname "$0")"

# 定位 node（优先 PATH，否则回退常见安装位置）
if ! command -v node >/dev/null 2>&1; then
  for p in /usr/local/bin/node /opt/homebrew/bin/node "$HOME/.workbuddy/binaries/node/versions/22.12.0/bin/node" "$HOME/.nvm/versions/node"/*/bin/node; do
    if [ -x "$p" ]; then export PATH="$(dirname "$p"):$PATH"; break; fi
  done
fi

if ! command -v node >/dev/null 2>&1; then
  echo "未找到 Node.js。请先安装：https://nodejs.org （或 brew install node）"
  echo "按任意键退出…"
  read -n 1
  exit 1
fi

echo "=== UNO 联机服务器启动中… ==="
if lsof -ti tcp:8787 >/dev/null 2>&1; then
  echo "检测到 8787 端口已有服务在运行，直接打开游戏。"
  open http://localhost:8787
  echo "(如需停止旧服务，在终端执行: lsof -ti tcp:8787 | xargs kill )"
  exit 0
fi

# 后台稍等再自动打开浏览器，服务器起来后才打得开
(sleep 1.5 && open http://localhost:8787) &
node server.js
