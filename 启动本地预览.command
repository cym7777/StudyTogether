#!/bin/zsh
cd "${0:A:h}" || exit 1
study_node="$(command -v node)"
if [[ -z "$study_node" ]]; then
  study_node="/Users/a1/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi
if [[ ! -x "$study_node" ]]; then
  print '没有找到 Node.js。请安装免费 Node.js 24 或更新版本后重试。'
  read 'study_reply?按回车退出：'
  exit 1
fi
print '启动成功后会自动打开浏览器；也可访问 http://127.0.0.1:8787'
print '这是本地预览，不是三人共用的公网网址。关闭终端会停止服务，数据库仍会保留。'
export STUDY_OPEN_BROWSER=1
exec "$study_node" server/local.mjs
