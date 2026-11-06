#!/usr/bin/env bash
set -euo pipefail
# 服务器地址不写死在仓库里，部署时通过环境变量传入
HOST="${HOST:?请指定服务器，例如：HOST=root@1.2.3.4 ./deploy.sh}"
DEST="${DEST:-/var/www/demo-wallet}"

echo "==> 构建"
npm run build
echo "==> 上传"
rsync -az --delete -e "ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null" dist/ "$HOST:$DEST/"
echo "==> 验证"
CODE=$(curl -s -o /dev/null -m 10 -w '%{http_code}' http://149.28.133.245:8091/ 2>/dev/null)
[ "$CODE" = "200" ] && echo "✅ http://149.28.133.245:8091/" || { echo "❌ HTTP $CODE"; exit 1; }
