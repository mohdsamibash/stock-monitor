#!/usr/bin/env bash
# Builds the website package and publishes it to mohdbash.com (Cloudflare Pages) from this Mac.
# Requires the MyWebSite project at ~/Desktop/MyWebSite with Wrangler already logged in.
set -euo pipefail
SITE="${SITE_DIR:-$HOME/Desktop/MyWebSite}"
cd "$(dirname "$0")/.."
node scripts/build-site.js
mkdir -p "$SITE/public/iphone18/dashboard" "$SITE/public/dashboard" "$SITE/functions/api"
cp deploy/website/public/iphone18/{index.html,app.js,styles.css} "$SITE/public/iphone18/"
cp deploy/website/public/iphone18/dashboard/index.html "$SITE/public/iphone18/dashboard/"   # redirect to /dashboard
cp deploy/website/public/dashboard/index.html "$SITE/public/dashboard/"
cp deploy/website/functions/api/{stock.js,refresh.js,track.js,stats.js,cftraffic.js} "$SITE/functions/api/"
cd "$SITE"
npm run build --silent
npx wrangler pages deploy out --project-name=mohdbashweb --commit-dirty=true 2>&1 | grep -E "Deployment complete|Success|error" || true
WANT=$(grep -oE 'app.js\?v=[a-f0-9]+' "$SITE/public/iphone18/index.html")
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  LIVE=$(curl -s "https://mohdbash.com/iphone18/?nc=$RANDOM" | grep -oE 'app.js\?v=[a-f0-9]+')
  [ "$LIVE" = "$WANT" ] && { echo "live check: OK ($LIVE)"; exit 0; }; sleep 5
done
echo "live check: still serving $LIVE (expected $WANT) after 60 s"; exit 1
