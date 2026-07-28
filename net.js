/* =========================================================
 * net.js — 浏览器端 WebSocket 极简封装（在线联机用）
 *   UnoNet.connect(url) -> Promise（连接前发送的消息会排队）
 *   UnoNet.send(obj)        发送 JSON
 *   UnoNet.on(handler)      注册消息回调 handler(msg)
 *   UnoNet.close()          关闭
 * ========================================================= */
(function (global) {
  "use strict";

  let ws = null;
  let handler = null;
  let queue = [];
  let connected = false;

  function connect(url) {
    return new Promise((resolve, reject) => {
      let sock;
      try {
        sock = new WebSocket(url);
      } catch (e) {
        reject(e);
        return;
      }
      ws = sock;
      sock.onopen = () => {
        connected = true;
        queue.forEach((m) => ws.send(JSON.stringify(m)));
        queue = [];
        resolve();
      };
      sock.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch (e) {
          return;
        }
        if (handler) handler(msg);
      };
      sock.onclose = () => {
        connected = false;
        if (handler) handler({ t: "disconnected" });
      };
      sock.onerror = () => {
        if (!connected) reject(new Error("连接失败：" + url));
      };
    });
  }

  function send(obj) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
    else queue.push(obj);
  }

  function on(fn) {
    handler = fn;
  }

  function close() {
    if (ws) ws.close();
    ws = null;
    connected = false;
    queue = [];
  }

  global.UnoNet = {
    connect,
    send,
    on,
    close,
    get connected() {
      return connected;
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
