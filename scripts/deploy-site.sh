#!/usr/bin/env bash
# Builds the website package and publishes it to mohdbash.com (Cloudflare Pages) from this Mac.
# Requires the MyWebSite project at ~/Desktop/MyWebSite with Wrangler already logged in.
set -euo pipefail
SITE="${SITE_DIR:-$HOME/Desktop/MyWebSite}"
cd "$(dirname "$0")/.."
node scripts/build-site.js
mkdir -p "$SITE/public/iphone18" "$SITE/functions/api"
cp deploy/website/public/iphone18/{index.html,app.js,styles.css} "$SITE/public/iphone18/"
cp deploy/website/functions/api/{stock.js,refresh.js} "$SITE/functions/api/"
cd "$SITE"
npm run build --silent
npx wrangler pages deploy out --project-name=mohdbashweb --commit-dirty=true 2>&1 | grep -E "Deployment complete|Success|error" || true
echo "live check:"; sleep 3; curl -s "https://mohdbash.com/iphone18/?nc=$RANDOM" | grep -oE 'app.js\?v=[a-f0-9]+'
