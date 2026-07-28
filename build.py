#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把一个多文件的 UNO 网页游戏打包成【单文件 HTML】，便于分发/打包。

用法:
    python3 build.py

产物:
    uno-standalone.html  —— 所有 CSS/JS 已内联，双击即可在浏览器离线运行，
                            可直接发给好友 / 微信 / 邮件，无需任何服务器。

说明:
    源码仍是分散的 index.html + style.css + *.js（便于维护），
    本脚本只是把它们合并成一个自包含文件。改完源码后重跑本脚本即可重新打包。
"""
import pathlib

BASE = pathlib.Path(__file__).resolve().parent

HTML_FILE = BASE / "index.html"
CSS_FILE = BASE / "style.css"
JS_FILES = ["i18n.js", "cards.js", "engine.js", "ai.js", "ui.js", "sound.js", "net.js", "router.js", "menu.js", "main.js"]


def main():
    html = HTML_FILE.read_text(encoding="utf-8")
    css = CSS_FILE.read_text(encoding="utf-8")

    # 1) 内联 CSS
    link_tag = '<link rel="stylesheet" href="style.css" />'
    if link_tag not in html:
        raise SystemExit("找不到样式表引用: " + link_tag)
    html = html.replace(link_tag, "<style>\n" + css + "\n</style>")

    # 2) 逐个内联 JS（保持原顺序，避免依赖错乱）
    for f in JS_FILES:
        js = (BASE / f).read_text(encoding="utf-8")
        tag = '<script src="%s"></script>' % f
        if tag not in html:
            raise SystemExit("找不到脚本引用: " + tag)
        html = html.replace(tag, "<script>\n" + js + "\n</script>")

    out = BASE / "uno-standalone.html"
    out.write_text(html, encoding="utf-8")
    print("✓ 已生成单文件: %s  (%d 字节)" % (out.name, out.stat().st_size))


if __name__ == "__main__":
    main()
