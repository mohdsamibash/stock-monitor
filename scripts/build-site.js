// Builds deploy/website/ — everything the mohdbash.com project needs for /iphone18:
//   public/iphone18/{index.html,styles.css,app.js}  static page (Next.js copies public/ into out/)
//   functions/api/stock.js                           Cloudflare Pages Function (GET reads KV, PUT writes KV)
//   README-DEPLOY.md                                  hand-off instructions
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, PUBLIC_DIR } from '../src/lib/paths.js';
import { ENV } from '../src/lib/env.js';

const OUT = path.join(ROOT, 'deploy', 'website');
const PAGE = path.join(OUT, 'public', 'iphone18');
const FN = path.join(OUT, 'functions', 'api');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(PAGE, { recursive: true }); fs.mkdirSync(FN, { recursive: true });

let html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
html = html
  .replace('<link rel="stylesheet" href="styles.css">', '<link rel="stylesheet" href="/iphone18/styles.css">\n  <script>window.STOCK_STATIC = true; window.STOCK_API = "";</script>')
  .replace('<script src="app.js"></script>', '<script src="/iphone18/app.js"></script>')
  .replace('<title>iPhone 18 · Kuwait Stock</title>', '<title>iPhone 18 · Kuwait Stock — mohdbash.com</title>\n  <meta name="description" content="Live iPhone 18 Pro, Pro Max and Duo availability at Gait, Xcite, Digits and Eureka in Kuwait, refreshed every few minutes.">\n  <meta name="robots" content="noindex">');
fs.writeFileSync(path.join(PAGE, 'index.html'), html);
fs.copyFileSync(path.join(PUBLIC_DIR, 'styles.css'), path.join(PAGE, 'styles.css'));
fs.copyFileSync(path.join(PUBLIC_DIR, 'app.js'), path.join(PAGE, 'app.js'));

fs.writeFileSync(path.join(FN, 'stock.js'), `// Cloudflare Pages Function: /api/stock
// GET  -> latest bundle published by the Kuwait iPhone 18 stock monitor (stored in KV)
// PUT  -> store a new bundle; requires "Authorization: Bearer <PUBLISH_TOKEN>"
// Bindings needed on the Pages project: KV namespace "STOCK_KV", secret "PUBLISH_TOKEN".
const KEY = 'iphone18:latest';
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, PUT, OPTIONS', 'access-control-allow-headers': 'authorization, content-type' };

export async function onRequestOptions() { return new Response(null, { status: 204, headers: cors }); }

export async function onRequestGet({ env }) {
  if (!env.STOCK_KV) return new Response(JSON.stringify({ error: 'STOCK_KV binding missing' }), { status: 500, headers: { 'content-type': 'application/json', ...cors } });
  const body = await env.STOCK_KV.get(KEY);
  if (!body) return new Response(JSON.stringify({ error: 'No data published yet' }), { status: 404, headers: { 'content-type': 'application/json', ...cors } });
  return new Response(body, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=30', ...cors } });
}

export async function onRequestPut({ request, env }) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!env.PUBLISH_TOKEN || token !== env.PUBLISH_TOKEN) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json', ...cors } });
  const text = await request.text();
  if (text.length > 2_000_000) return new Response(JSON.stringify({ error: 'too large' }), { status: 413, headers: cors });
  let parsed; try { parsed = JSON.parse(text); } catch { return new Response(JSON.stringify({ error: 'invalid JSON' }), { status: 400, headers: cors }); }
  if (!parsed?.stock?.sites) return new Response(JSON.stringify({ error: 'unexpected payload' }), { status: 400, headers: cors });
  await env.STOCK_KV.put(KEY, text);
  return new Response(JSON.stringify({ ok: true, storedAt: new Date().toISOString(), bytes: text.length }), { status: 200, headers: { 'content-type': 'application/json', ...cors } });
}
`);

fs.writeFileSync(path.join(FN, 'refresh.js'), `// Cloudflare Pages Function: /api/refresh — lets the public page ask the Mac for an early pass.
// POST   -> queue a refresh request (public, at most one per 3 minutes)
// GET    -> { pending, requestedAt }
// DELETE -> clear the request (requires "Authorization: Bearer <PUBLISH_TOKEN>"; the monitor calls this after publishing)
const KEY = 'iphone18:refresh';
const MIN_GAP_MS = 3 * 60_000;
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS', 'access-control-allow-headers': 'authorization, content-type' };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors } });

export async function onRequestOptions() { return new Response(null, { status: 204, headers: cors }); }

export async function onRequestGet({ env }) {
  const v = await env.STOCK_KV.get(KEY);
  return json({ pending: Boolean(v), requestedAt: v || null });
}

export async function onRequestPost({ env }) {
  const existing = await env.STOCK_KV.get(KEY);
  if (existing && Date.now() - new Date(existing).getTime() < MIN_GAP_MS) return json({ queued: false, pending: true, requestedAt: existing, error: 'A refresh is already queued' }, 200);
  const now = new Date().toISOString();
  await env.STOCK_KV.put(KEY, now, { expirationTtl: 600 });
  // Cloud mode: start the GitHub Actions workflow (secrets GH_DISPATCH_TOKEN + GH_REPO on the Pages project).
  // Uses the workflow_dispatch endpoint: a fine-grained token with "Actions: Read and write" is enough.
  let dispatched = false, dispatchStatus = null;
  if (env.GH_DISPATCH_TOKEN && env.GH_REPO) {
    const headers = { authorization: \`Bearer \${env.GH_DISPATCH_TOKEN}\`, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'user-agent': 'mohdbash-iphone18-refresh', 'x-github-api-version': '2022-11-28' };
    try {
      const r = await fetch(\`https://api.github.com/repos/\${env.GH_REPO}/actions/workflows/\${env.GH_WORKFLOW || 'monitor.yml'}/dispatches\`, { method: 'POST', headers, body: JSON.stringify({ ref: env.GH_BRANCH || 'main' }) });
      dispatchStatus = r.status; dispatched = r.status === 204;
      if (!dispatched) { // fallback for tokens that have Contents: write instead
        const r2 = await fetch(\`https://api.github.com/repos/\${env.GH_REPO}/dispatches\`, { method: 'POST', headers, body: JSON.stringify({ event_type: 'refresh' }) });
        if (r2.status === 204) { dispatched = true; dispatchStatus = 204; }
      }
    } catch (e) { dispatchStatus = String(e); }
  }
  return json({ queued: true, pending: true, requestedAt: now, dispatched, dispatchStatus });
}

export async function onRequestDelete({ request, env }) {
  const auth = request.headers.get('authorization') || '';
  if (!env.PUBLISH_TOKEN || auth !== 'Bearer ' + env.PUBLISH_TOKEN) return json({ error: 'unauthorized' }, 401);
  await env.STOCK_KV.delete(KEY);
  return json({ ok: true });
}
`);

fs.writeFileSync(path.join(OUT, 'README-DEPLOY.md'), `# Deploy /iphone18 to mohdbash.com (Cloudflare Pages)

This folder is generated by \`npm run build:site\` in the Stock Monitor project. It contains a
static dashboard page plus one Pages Function. The scraper itself keeps running on my Mac and
PUTs a JSON bundle to the function after every pass; the page reads it back.

## Files to copy into the MyWebSite project (Next.js static export, deployed with \`wrangler pages deploy out\`)

| From this folder | To | Why |
|---|---|---|
| \`public/iphone18/index.html\` | \`<site>/public/iphone18/index.html\` | Next.js copies \`public/\` into \`out/\`, so the page is served at \`/iphone18/\` |
| \`public/iphone18/styles.css\` | \`<site>/public/iphone18/styles.css\` | page styles (absolute paths, no build step) |
| \`public/iphone18/app.js\` | \`<site>/public/iphone18/app.js\` | page logic; fetches \`/api/stock\` |
| \`functions/api/stock.js\` | \`<site>/functions/api/stock.js\` | Pages Function. \`wrangler pages deploy out\` picks up \`functions/\` from the project root automatically |

Do not change the file names or the \`/iphone18/\` paths inside index.html.

## One-time Cloudflare setup

1. Create a KV namespace and bind it to the Pages project as **STOCK_KV**:
   \`\`\`bash
   npx wrangler kv namespace create STOCK_KV
   \`\`\`
   Then in the Cloudflare dashboard: Pages project **mohdbashweb** -> Settings -> Bindings -> KV namespace:
   variable name \`STOCK_KV\`, select the namespace (add it for Production and Preview).
   (Or add to wrangler.toml if the project uses one: \`[[kv_namespaces]] binding = "STOCK_KV" id = "<id>"\`.)
2. Add the secret **PUBLISH_TOKEN** to the Pages project (Settings -> Environment variables -> add as Secret, Production and Preview):
   \`\`\`text
   ${ENV.PUBLISH_TOKEN}
   \`\`\`
   The same value is already in the Stock Monitor's .env as PUBLISH_TOKEN.
3. Deploy as usual:
   \`\`\`bash
   npm run build && npx wrangler pages deploy out --project-name=mohdbashweb
   \`\`\`

## Verify

\`\`\`bash
# should return 404 {"error":"No data published yet"} until the first publish, then the JSON bundle
curl -s https://mohdbash.com/api/stock | head -c 300
# a wrong token must be rejected
curl -s -X PUT https://mohdbash.com/api/stock -H "Authorization: Bearer wrong" -d '{}'
\`\`\`

Then on the Mac, from the Stock Monitor folder: \`npm run publish\` pushes the latest pass, and
\`npm start\` publishes automatically after every pass. Open https://mohdbash.com/iphone18/ .

## Notes

* The page is a plain static HTML/CSS/JS page (no React). It polls \`/api/stock\` every 60 s.
* The Refresh button calls \`POST /api/refresh\` (max one per 3 min). With the Pages secrets **GH_DISPATCH_TOKEN**
  (fine-grained GitHub token limited to the monitor repo with **Actions: Read and write**) and **GH_REPO** (e.g. \`mohdbash/stock-monitor\`)
  it starts the GitHub Actions workflow, which runs a pass and publishes within ~2 min. It also sets a KV flag
  that a monitor running on a Mac (\`npm start\`) picks up. A yellow banner appears
  if the monitor has not published for more than about two intervals.
* \`<meta name="robots" content="noindex">\` is set; remove it if the page should be indexed.
* GET /api/stock is cached for 30 s at the edge and allows cross-origin reads.
`);

console.log('built', OUT);
for (const f of ['public/iphone18/index.html', 'public/iphone18/styles.css', 'public/iphone18/app.js', 'functions/api/stock.js', 'functions/api/refresh.js', 'README-DEPLOY.md']) console.log('  ', f, fs.statSync(path.join(OUT, f)).size, 'B');
