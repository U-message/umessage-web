#!/bin/sh
# Usage: deploy/vercel.sh dev   -> builds and ships to dev.u-message.org (Vercel project umessage-web-dev)
#        deploy/vercel.sh prod  -> ships the exact build last sent to dev to web.u-message.org (umessage-web)
set -e
SCOPE=javohirs-projects-b5f70d85
ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT=${TMPDIR:-/tmp}/umessage-web-out
case "$1" in
  dev)  PROJECT=umessage-web-dev ;;
  prod) PROJECT=umessage-web ;;
  *) echo "usage: $0 dev|prod"; exit 1 ;;
esac

if [ "$1" = dev ]; then
  cd "$ROOT" && npm run build:production
  rm -rf "$OUT" && mkdir -p "$OUT"
  rsync -a --exclude '*.map' --exclude build-stats.json "$ROOT/dist/" "$OUT/"
elif [ ! -f "$OUT/index.html" ]; then
  echo "No dev build found. Run '$0 dev' first and check dev.u-message.org."; exit 1
fi

rm -rf "$OUT/.vercel"
cd "$OUT" && npx -y vercel@latest deploy --prod --yes --scope "$SCOPE" --name "$PROJECT"
