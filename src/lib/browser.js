// Lazy Playwright launcher used only by the DOM fallbacks. Never launched on the JSON happy path.
import { ENV } from './env.js';
import { logger } from './log.js';

const log = logger('browser');
let browserPromise = null;

export async function getBrowser() {
  if (ENV.DISABLE_BROWSER_FALLBACK) throw new Error('Browser fallback disabled (DISABLE_BROWSER_FALLBACK=true)');
  if (!browserPromise) {
    browserPromise = (async () => {
      const { chromium } = await import('playwright');
      log.info('launching headless Chromium for DOM fallback');
      return chromium.launch({ headless: true });
    })();
  }
  return browserPromise;
}

export async function withPage(fn) {
  const browser = await getBrowser();
  const ctx = await browser.newContext({ userAgent: ENV.USER_AGENT, locale: 'en-KW', viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(ENV.REQUEST_TIMEOUT_MS);
  // Save bandwidth on the retailer's side: never load images/media/fonts.
  await page.route('**/*', (route) => {
    const t = route.request().resourceType();
    if (['image', 'media', 'font', 'stylesheet'].includes(t)) return route.abort();
    return route.continue();
  });
  try { return await fn(page); } finally { await ctx.close(); }
}

export async function closeBrowser() {
  if (browserPromise) { const b = await browserPromise; await b.close(); browserPromise = null; }
}
