#!/bin/zsh
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  print '需要先安装 Node.js 20 或更新版本。https://nodejs.org/'
  read '?按回车关闭'
  exit 1
fi
node server/desktop.mjs --demo
read '?服务已停止，按回车关闭'
