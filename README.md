# Kuwait iPhone 18 stock monitor

Internal dashboard that tells you, at a glance, whether every iPhone 18 Pro / Pro Max / Duo
variant is **In stock / Out of stock / Not listed** at three Kuwaiti retailers: Gait, Xcite
and Digits. Pre-order availability counts as "in stock" (that is exactly what the
retailer feeds report while pre-orders are open).

* Node.js 20+ backend, no framework. Playwright is installed but only used as a DOM fallback:
  every retailer has a JSON feed, so a pass makes **5 HTTP requests** for the catalogue data,
  plus one small JSON call per Gait child SKU that Magento reports in stock while a Gait
  pre-order window is live (about 25-40 extra, see "Gait pre-order allocation" below).
* Scraper and UI are separate: the scraper writes `data/stock.json`, the dashboard reads it.
* 40 variants x 3 retailers = 120 cells. iPhone Duo is fully wired but the UI shows it as
  "Coming soon" until its pre-order date (`config/variants.js`).

## Setup

```bash
npm install
npx playwright install chromium      # only needed for the DOM fallback
cp .env.example .env                 # then edit if you want Telegram / AI
```

## Run

| Command | What it does |
|---|---|
| `npm run check` | One pass across all retailers, prints a table, writes `data/stock.json` + appends `data/history.jsonl` |
| `npm run watch` | Scheduled loop, profile picked automatically (burst / normal / quiet, launch days forced to burst) |
| `npm run watch -- --profile burst` | Force a profile (`burst`, `normal`, `quiet`) |
| `npm run serve` | Dashboard on http://localhost:3000 (reads `data/stock.json`, Refresh button runs a pass) |
| `npm start` | Dashboard **and** the watch loop in one process (`npm start -- --profile burst` also works) |
| `npm run digest` | Print / send the daily availability digest now |
| `npm test` | Unit tests (normaliser, scheduler, history diff) |

Open the dashboard on your phone by using your Mac's LAN IP, e.g. `http://192.168.1.20:3000`.

### Scheduling

`config/schedule.js` holds the profiles, quiet hours and launch days:

| Profile | Interval | When |
|---|---|---|
| `burst` | every 4 min | 07:00-23:00 Asia/Kuwait on any date in `LAUNCH_DAYS` (2026-09-18, 2026-10-16, 2026-10-23) |
| `normal` | every 15 min (`CHECK_INTERVAL_MINUTES` in `.env`) | daytime |
| `quiet` | every 60 min | 00:00-07:00 Asia/Kuwait |

The profile is re-evaluated before every pass, so launch days switch over by themselves.

### Cron instead of `watch`

If you would rather not keep a process running, a plain cron entry works; `check` is a single
pass and the profile logic is only used for labelling:

```cron
*/15 * * * * cd "/Users/mohdbash/Desktop/Stock Monitor" && /usr/local/bin/node src/check.js >> data/cron.log 2>&1
```

On macOS you may prefer `launchd`; the command is the same.

## Data files (all in `data/`, git-ignored)

* `stock.json` - latest pass (what the dashboard renders).
* `history.jsonl` - one line per pass: timestamp, profile, request count, a compact snapshot
  and the list of status/price changes vs the previous pass. `GET /api/history?hours=24`
  turns it into availability windows.
* `state.json` - last snapshot, per-retailer back-off state, AI cool-downs.
* `request-log.json` - request timestamps per domain for the 200/hour warning.
* `selector-proposals.json` - AI self-healing proposals (never auto-applied).
* `ai-usage.jsonl` - every model call with token counts and estimated cost.

## Politeness

* Descriptive User-Agent (`USER_AGENT` in `.env`), 20 s timeout, 2 retries with exponential
  back-off, max 2 concurrent requests per domain, 2-4 s random gap between requests on the
  same domain, `robots.txt` honoured (per-origin cache).
* Requests per hour are counted per domain and a warning is printed above 200/h.
* 429 / 403 (or 3 consecutive failures) put that retailer into exponential back-off
  (10, 20, 40 ... 320 min) and it is shown as **Error** in the UI. The run never crashes.

## Alerts

Alerts name model, colour, capacity, retailer, KWD price, whether it is the cheapest in-stock
option, and link to the product page. Channels are pluggable (`src/alerts/`):

| Channel | Enable | Notes |
|---|---|---|
| macOS banner + sound | on by default when the watcher runs on a Mac (`ALERT_MACOS=true`) | native notification centre, no accounts |
| ntfy.sh push | install the ntfy app, subscribe to a topic, set `NTFY_TOPIC` | no bot, no token; pick an unguessable topic name (it is the only secret) |
| Telegram | `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | create a bot with @BotFather, message it once, read `chat.id` from `https://api.telegram.org/bot<TOKEN>/getUpdates` |

`ALERT_CHANNELS=auto` (default) uses every configured channel; or list them, e.g. `ntfy,macos`.

* `ALERT_ON=any-in-stock` (default) alerts on every transition **into** In stock, including a
  variant that appears for the first time already in stock. `ALERT_ON=restock` limits it to
  Out of stock -> In stock.
* `ALERT_CONFIRM_PASSES=2` waits for two consecutive in-stock passes before alerting (flap
  protection); `1` alerts immediately.
* `npm run alert:test` sends a test message through every active channel and reports per channel.
* Silent when nothing is configured; a failing channel never breaks a pass.

## AI layer (optional, OFF by default)

Set `AI_ENABLED=true` and `ANTHROPIC_API_KEY` (model `AI_MODEL`, default `claude-sonnet-4-6`).
Everything works without it.

1. **Self-healing adapters** - when a retailer returns ERROR or NOT_LISTED for *every* variant
   (at most once per retailer per 6 h) the stripped page HTML plus the current
   `config/selectors.js` entry is sent to the model, which returns JSON with proposed
   changes and a confidence. The proposal is written to `data/selector-proposals.json`
   and a diff is printed. Nothing is applied automatically.
2. **Natural-language alerts** - one call per run, only when a restock happened; Arabic +
   English message sent via Telegram (falls back to the plain template on any failure).
3. **Daily digest** - once a day (after `AI_DIGEST_HOUR` Asia/Kuwait) summarising which
   variants were available and for how long, from `history.jsonl`.

Every call is appended to `data/ai-usage.jsonl` with input/output tokens and estimated USD.

## Editing the SKU matrix, aliases and launch days

* `config/variants.js` - models, colours (with swatch hex), capacities, pre-order and release
  dates. The iPhone Duo "Coming soon" state is driven by `preorderOpens`.
* `config/aliases.js` - English/Arabic aliases for models, colours and capacities, plus the
  keyword lists that reject accessories and grey-import listings. Colour aliases are only
  applied to colours that the model actually ships in, so `blue -> Glacier` cannot leak into
  the Duo.
* `config/schedule.js` - profiles, quiet hours, launch days.
* `config/selectors.js` - per-retailer endpoints, field names and fallback CSS selectors.

## How each retailer is read (recon done 2026-09-12)

| Retailer | Platform | Primary source (1 request) | Fallback | Fragility |
|---|---|---|---|---|
| Gait | Magento 2 (Hyvä) | Public GraphQL: the configurable parents `iphone-18-pro` (Pro **and** Pro Max are options on one parent) and `iphone-duo` with every child SKU, `stock_status` and final price | Playwright loads the product page and parses the embedded configurable-product JSON (`window.gaitConfigJson[...]`, incl. the `salable` map) — verified to match GraphQL | Low. GraphQL is Magento core. Would break only if they disable anonymous GraphQL or rename `url_key`s |
| Xcite | Next.js + Algolia | Same-origin proxy `POST /api/algolia/proxy` (body `{requests, operation:"search"}`) returning `status_key`, `price`, `color`, storage, slug | Playwright renders `/search?q=...` and scans product cards | Medium. The proxy is an internal route; a redeploy could change its body shape. Colour "Blue" is mapped to Glacier via the alias map |
| Digits | Shopify | `/collections/apple-iphone-18/products.json` (+ one `/products.json?limit=250` scan if a model is missing, e.g. the Duo) with `available` per variant | Playwright renders the collection page and reads sold-out badges | Low. Standard Shopify JSON. Only risk: they move iPhone 18 to a new collection handle (edit `config/selectors.js`) |

### Gait pre-order allocation ("Coming Soon")

Gait sells pre-orders through an allocation system that is separate from Magento stock. A child
SKU can be `IN_STOCK` in GraphQL while the product page shows a disabled **Coming Soon** button
because the pre-order allocation is exhausted. The button is driven by
`GET /g_kw_en/preorder/availability/index/?sku=<sku>` which returns
`{ state: live|upcoming|native, available: n|null, start_epoch, end_epoch }`.

The adapter therefore:

1. asks the endpoint once per parent to learn the window state;
2. `upcoming` (e.g. iPhone Duo before 16 Oct) -> every variant `NOT_LISTED` with the note
   "Pre-orders open 16 Oct" (price kept);
3. `live` -> one request per child Magento reports `IN_STOCK`; `available: 0` -> `OUT_OF_STOCK`
   with the note "Coming soon", otherwise `IN_STOCK` with the note "Pre-order";
4. `native` (window closed, normal retail) -> Magento `stock_status` is the truth, no extra calls.

**robots.txt caveat.** `gait.com.kw/robots.txt` disallows `/*/preorder/` ("Pre-order AJAX and
one-click routes"). This is the same AJAX call the storefront makes for every visitor who opens a
product page, and without it the dashboard reports false positives, so the adapter calls it anyway
and prints one warning per run. It is controlled by `GAIT_ALLOCATION_CHECK` in `.env`
(default `true`); set it to `false` to honour the rule strictly (cheaper, but Gait may show
IN_STOCK for variants whose button says Coming Soon).

## Adding a retailer

1. Create `src/sites/<id>.js`. The easiest path is to extend `CatalogAdapter` from
   `src/sites/base.js` and implement `fetchListings()` returning
   `{ listings: [{ title, colorHint?, capacityHint?, modelHint?, status, price, url }], source }`.
   Use `fetchPolite()` from `src/lib/http.js` for every request so politeness rules apply.
2. Add its endpoints / selectors to `config/selectors.js`.
3. Register it in `src/sites/index.js`. The dashboard, history and alerts pick it up automatically.

The adapter interface is `{ id, name, baseUrl, discover(), checkModel(model) }` where
`checkModel` returns `[{ color, capacity, status, priceKWD, url, checkedAt }]` for every
colour x capacity of the model. Statuses: `IN_STOCK | OUT_OF_STOCK | NOT_LISTED | ERROR`.
Never guess: if a listing cannot be resolved to a variant, leave it `NOT_LISTED`.

## Detection rules

* JSON feeds: retailer's own availability flag (`stock_status`, `status_key`, `available`,
  `avaqt > 0`) decides IN_STOCK vs OUT_OF_STOCK.
* DOM fallbacks: an enabled Add to Cart / Pre-order control means IN_STOCK; "Out of stock",
  "Sold out", "Notify me" or a sold-out badge means OUT_OF_STOCK; anything else is NOT_LISTED.
* Listings mentioning accessories (case, protector, ...) or grey imports (Japanese, American
  version, ...) are ignored, see `EXCLUDE_KEYWORDS` in `config/aliases.js`.

## Running in the cloud (GitHub Actions)

`.github/workflows/monitor.yml` runs one pass (`node src/check.js`) on a schedule and publishes to the
website, so nothing depends on a Mac being awake:

| Cron | When (Asia/Kuwait) |
|---|---|
| every 15 min | 07:00-23:59 |
| hourly | 00:00-06:59 |
| every 5 min | 18 Sep, 16 Oct, 23 Oct (launch days) |

State (history, last snapshot, back-off) is carried between runs with the Actions cache, and if the
cache is missing the last snapshot is seeded from the published bundle, so restock alerts still work.
The Playwright fallback is disabled in the cloud (JSON feeds only).

Repository **secrets** to add (Settings -> Secrets and variables -> Actions): `PUBLISH_URL`,
`PUBLISH_TOKEN`, and optionally `NTFY_TOPIC`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`. Optional
**variables**: `ALERT_ON`, `ALERT_CONFIRM_PASSES`.

The website Refresh button starts this workflow through `repository_dispatch` when the Pages project has
the secrets `GH_DISPATCH_TOKEN` and `GH_REPO` (see `deploy/website/README-DEPLOY.md`).

Minutes budget: about 75 runs a day at ~2 billed minutes each. Private repositories get 2,000 free
Actions minutes per month, which is not enough; make the repository **public** (the code contains no
secrets) or buy extra minutes.
