(() => {
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const STATUS_LABEL = { IN_STOCK: 'In stock', OUT_OF_STOCK: 'Out of stock', NOT_LISTED: 'Not listed', ERROR: 'Error' };
  const state = { stock: null, status: null, history: null, filters: { retailer: '', model: '', color: '', capacity: '', instock: false } };

  // ---------- theme ----------
  const root = document.documentElement;
  const applyTheme = (t) => { root.dataset.theme = t; };
  const saved = (() => { try { return localStorage.getItem('theme'); } catch { return null; } })();
  applyTheme(saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  $('#theme-toggle').addEventListener('click', () => {
    const t = root.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(t); try { localStorage.setItem('theme', t); } catch {}
  });

  // ---------- helpers ----------
  function relative(iso) {
    const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 60) return `${s}s ago`; const m = Math.round(s / 60); if (m < 60) return `${m} min ago`; const h = Math.round(m / 60); if (h < 48) return `${h} h ago`; return `${Math.round(h / 24)} d ago`;
  }
  const kwd = (n) => (n == null ? '' : `KD ${n.toFixed(n % 1 ? 3 : 0)}`);
  const kwdShort = (n) => (n == null ? '' : n.toFixed(3)); // chips: currency is implied (header says KWD)
  function kuwaitToday() {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuwait', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const g = (t) => p.find((x) => x.type === t).value; return `${g('year')}-${g('month')}-${g('day')}`;
  }
  const fmtDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  function toast(msg, ms = 2500) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, ms); }

  // ---------- filters ----------
  function populateFilters(stock) {
    const fill = (sel, opts) => { const s = $(sel); const cur = s.value; s.length = 1; for (const [v, l] of opts) { const o = el('option', null, l); o.value = v; s.appendChild(o); } s.value = cur; };
    fill('#f-retailer', stock.retailers.map((r) => [r.id, r.name]));
    fill('#f-model', stock.models.map((m) => [m.id, m.name]));
    const colors = [...new Set(stock.models.flatMap((m) => m.colors.map((c) => c.name)))];
    fill('#f-color', colors.map((c) => [c, c]));
    const caps = [...new Set(stock.models.flatMap((m) => m.capacities))];
    fill('#f-capacity', caps.map((c) => [c, c]));
  }
  for (const [id, key] of [['#f-retailer', 'retailer'], ['#f-model', 'model'], ['#f-color', 'color'], ['#f-capacity', 'capacity']]) {
    $(id).addEventListener('change', (e) => { state.filters[key] = e.target.value; render(); });
  }
  $('#f-instock').addEventListener('change', (e) => { state.filters.instock = e.target.checked; render(); });
  $('#f-clear').addEventListener('click', () => { state.filters = { retailer: '', model: '', color: '', capacity: '', instock: false }; for (const id of ['#f-retailer', '#f-model', '#f-color', '#f-capacity']) $(id).value = ''; $('#f-instock').checked = false; render(); });

  // ---------- render ----------
  function render() {
    const stock = state.stock; if (!stock) return;
    const f = state.filters;
    $('#f-clear').hidden = !(f.retailer || f.model || f.color || f.capacity || f.instock);
    $('#empty').hidden = true;
    $('#counter-num').textContent = stock.summary.inStock;
    $('#counter-label').textContent = `of ${stock.summary.total} in stock`;
    $('#updated').textContent = `Updated ${relative(stock.generatedAt)} · ${stock.pass.requests} req`;
    $('#updated').title = new Date(stock.generatedAt).toLocaleString();
    const sites = stock.sites.filter((s) => !f.retailer || s.id === f.retailer);
    const today = kuwaitToday();
    const sections = $('#sections'); sections.innerHTML = '';

    for (const m of stock.models) {
      if (f.model && m.id !== f.model) continue;
      const coming = m.preorderOpens && today < m.preorderOpens;
      const sec = el('section', 'model' + (coming ? ' coming' : ''));
      const head = el('div', 'model-head');
      head.appendChild(el('h2', null, m.name));
      if (coming) head.appendChild(el('span', 'soon', `Coming soon — pre-order opens ${fmtDate(m.preorderOpens)}`));
      else head.appendChild(el('span', 'sub', `Release ${fmtDate(m.releaseDate)}`));
      const modelKeys = new Set(m.colors.flatMap((c) => m.capacities.map((cap) => `${m.id}|${c.name}|${cap}`)));
      let inStock = 0, cells = 0;
      for (const s of sites) for (const r of s.results) if (modelKeys.has(r.key)) { cells++; if (r.status === 'IN_STOCK') inStock++; }
      const stat = el('span', 'stat'); stat.innerHTML = `<b>${inStock}</b> of ${cells} in stock`; head.appendChild(stat);
      sec.appendChild(head);
      const grid = el('div', 'grid');
      let cards = 0;
      for (const c of m.colors) {
        if (f.color && c.name !== f.color) continue;
        const card = el('article', 'card');
        const ch = el('div', 'card-head');
        const sw = el('span', 'swatch'); sw.style.background = c.hex; ch.appendChild(sw);
        ch.appendChild(el('h3', null, c.name));
        const n = el('span', 'n'); ch.appendChild(n); card.appendChild(ch);
        let cardIn = 0, cardCells = 0, rows = 0;
        for (const cap of m.capacities) {
          if (f.capacity && cap !== f.capacity) continue;
          const key = `${m.id}|${c.name}|${cap}`;
          const chips = el('div', 'chips');
          let rowIn = 0;
          for (const s of sites) {
            const r = s.results.find((x) => x.key === key) || { status: 'ERROR' };
            cardCells++; if (r.status === 'IN_STOCK') { rowIn++; cardIn++; }
            const chip = el(r.url ? 'a' : 'span', `chip ${r.status}`);
            if (r.url) { chip.href = r.url; chip.target = '_blank'; chip.rel = 'noopener'; }
            const best = stock.summary.cheapest?.[key]; if (best && best.siteId === s.id && r.status === 'IN_STOCK') chip.classList.add('best');
            chip.title = `${s.name}: ${STATUS_LABEL[r.status]}${r.note ? ` (${r.note})` : ''}${r.reason ? `\n${r.reason}` : ''}${r.priceKWD != null ? ` · ${kwd(r.priceKWD)}` : ''}${r.title ? `\n${r.title}` : ''}${r.error ? `\n${r.error}` : ''}${s.checkedAt ? `\nChecked ${relative(s.checkedAt)}` : ''}`;
            const top = el('span', 'top');
            top.appendChild(el('span', 'r', s.name));
            if (r.priceKWD != null && (r.status !== 'NOT_LISTED' || r.note)) top.appendChild(el('span', 'p', kwdShort(r.priceKWD)));
            chip.appendChild(top);
            chip.appendChild(el('span', 's', r.note || STATUS_LABEL[r.status]));
            chips.appendChild(chip);
          }
          if (f.instock && !rowIn) continue;
          const row = el('div', 'row'); row.appendChild(el('span', 'cap', cap)); row.appendChild(chips); card.appendChild(row); rows++;
        }
        if (!rows) continue;
        n.textContent = `${cardIn}/${cardCells} in stock`;
        grid.appendChild(card); cards++;
      }
      if (!cards) continue;
      sec.appendChild(grid); sections.appendChild(sec);
    }
    if (!sections.children.length) { $('#empty').hidden = false; $('#empty').textContent = 'Nothing matches these filters.'; }
    renderChanges();
  }

  function renderRetailers(stock) {
    const wrap = $('#retailers'); wrap.innerHTML = ''; wrap.appendChild(el('h2', null, 'Retailers'));
    const g = el('div', 'rgrid');
    for (const s of stock.sites) {
      const c = stock.summary.byRetailer[s.id] || {};
      const card = el('div', 'rcard');
      const name = el('div', 'name'); name.appendChild(el('span', `dot ${s.status}`)); name.appendChild(el('a', null, s.name)); name.lastChild.href = s.baseUrl; name.lastChild.target = '_blank'; name.lastChild.rel = 'noopener'; card.appendChild(name);
      card.appendChild(el('div', 'l', s.status === 'ok' ? `${s.source} · ${s.listings} listings, ${s.resolved} matched · ${s.requests ?? '?'} req · ${relative(s.checkedAt)}` : s.error || s.status));
      const nums = el('div', 'nums'); nums.appendChild(el('span', 'in', `${c.inStock ?? 0}`)); nums.appendChild(el('span', 'out', `${c.outOfStock ?? 0}`)); nums.appendChild(el('span', 'nl', `${c.notListed ?? 0}`)); nums.appendChild(el('span', 'er', `${c.error ?? 0}`)); card.appendChild(nums);
      const rph = state.status?.requestsPerHour || stock.pass.requestsPerHour || {};
      const host = Object.keys(rph).find((h) => h.includes(s.id) || (s.id === 'eureka' && h.includes('algolia')));
      if (host) card.appendChild(el('div', 'l', `${rph[host]} requests / hour`));
      g.appendChild(card);
    }
    wrap.appendChild(g);
  }

  function renderChanges() {
    const wrap = $('#changes'); wrap.innerHTML = ''; wrap.appendChild(el('h2', null, 'Recent changes (24 h)'));
    const ul = el('ul');
    const changes = (state.history?.changes || []).slice(-40).reverse();
    if (!changes.length) ul.appendChild(el('li', 'none', 'No status flips recorded in the last 24 hours.'));
    const names = Object.fromEntries((state.stock?.retailers || []).map((r) => [r.id, r.name]));
    const models = Object.fromEntries((state.stock?.models || []).map((m) => [m.id, m.name]));
    for (const c of changes) {
      const [modelId, color, cap] = c.key.split('|');
      const li = el('li');
      li.appendChild(el('span', 't', new Date(c.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })));
      li.appendChild(el('span', null, `${names[c.siteId] || c.siteId} · ${models[modelId] || modelId} ${color} ${cap}`));
      li.appendChild(el('span', `st ${c.from}`, STATUS_LABEL[c.from] || c.from)); li.appendChild(el('span', 'arrow', '→')); li.appendChild(el('span', `st ${c.to}`, STATUS_LABEL[c.to] || c.to));
      if (c.priceTo != null && c.priceFrom !== c.priceTo) li.appendChild(el('span', 't', `${kwd(c.priceFrom)} → ${kwd(c.priceTo)}`));
      ul.appendChild(li);
    }
    wrap.appendChild(ul);
  }

  function renderStatus() {
    const st = state.status; if (!st) return;
    const b = $('#profile-badge'); b.className = `badge profile ${st.profile.profile}`; b.textContent = st.profile.profile;
    b.title = `${st.profile.reason} · every ${st.profile.intervalMinutes} min${st.nextRunAt ? ` · next ${relative(st.nextRunAt).replace(' ago', '')}` : st.watch || STATIC ? '' : ' · watch loop not running'}`;
  }

  // ---------- data ----------
  // STATIC mode (public website): one bundle {stock,status,history} from a Pages Function backed by KV.
  const STATIC = Boolean(window.STOCK_STATIC);
  const API = window.STOCK_API || '';
  async function load() {
    try {
      if (STATIC) {
        const res = await fetch(`${API}/api/stock`, { cache: 'no-store' });
        if (!res.ok) { $('#empty').hidden = false; $('#empty').textContent = res.status === 404 ? 'No data published yet.' : `Could not load data (${res.status})`; return; }
        const b = await res.json();
        state.stock = b.stock; state.status = b.status; state.history = b.history; populateFilters(state.stock);
        render(); renderStatus();
        const ageMin = (Date.now() - new Date(state.stock.generatedAt).getTime()) / 60000;
        const expected = (state.status?.profile?.intervalMinutes || 15) * 2 + 5;
        $('#stale').hidden = ageMin <= expected;
        return;
      }
      const [stockRes, statusRes, histRes] = await Promise.all([fetch('/api/stock', { cache: 'no-store' }), fetch('/api/status', { cache: 'no-store' }), fetch('/api/history?hours=24', { cache: 'no-store' })]);
      if (stockRes.ok) { state.stock = await stockRes.json(); populateFilters(state.stock); }
      else { $('#empty').textContent = (await stockRes.json()).error || 'No data yet'; }
      if (statusRes.ok) state.status = await statusRes.json();
      if (histRes.ok) state.history = await histRes.json();
      render(); renderStatus();
    } catch (e) { $('#empty').hidden = false; $('#empty').textContent = STATIC ? `Could not load data (${e.message})` : `Could not reach the server (${e.message}). Start it with: npm start`; }
  }
  async function remoteRefresh(btn) {
    const before = state.stock?.generatedAt;
    const res = await fetch(`${API}/api/refresh`, { method: 'POST' });
    const body = await res.json();
    toast(body.queued ? 'Refresh requested. The monitor picks it up within 30 s and needs about 2 min…' : (body.error || 'A refresh is already queued…'), 5000);
    const started = Date.now();
    while (Date.now() - started < 5 * 60_000) {
      await new Promise((r) => setTimeout(r, 5000));
      btn.textContent = `Refreshing… ${Math.round((Date.now() - started) / 1000)}s`;
      try {
        const b = await (await fetch(`${API}/api/stock`, { cache: 'no-store' })).json();
        if (b.stock?.generatedAt && b.stock.generatedAt !== before) { state.stock = b.stock; state.status = b.status; state.history = b.history; render(); renderStatus(); $('#stale').hidden = true; return true; }
      } catch { /* keep polling */ }
    }
    return false;
  }
  if (STATIC) {
    $('#refresh').addEventListener('click', async (ev) => {
      ev.stopImmediatePropagation();
      const btn = $('#refresh'); btn.disabled = true; btn.textContent = 'Requesting…';
      try {
        const ok = await remoteRefresh(btn);
        toast(ok ? `Done: ${state.stock.summary.inStock} of ${state.stock.summary.total} in stock` : 'No update arrived. Is the monitor running on the Mac (npm start)?', 6000);
      } catch (e) { toast(`Refresh failed: ${e.message}`, 6000); }
      btn.disabled = false; btn.textContent = 'Refresh';
    }, true);
  }

  async function waitForPass(btn) {
    const started = Date.now();
    while (Date.now() - started < 10 * 60_000) {
      await new Promise((r) => setTimeout(r, 4000));
      let st; try { st = await (await fetch('/api/status', { cache: 'no-store' })).json(); } catch { continue; }
      btn.textContent = `Checking… ${Math.round((Date.now() - started) / 1000)}s`;
      if (!st.running) return st;
    }
    return null;
  }
  $('#refresh').addEventListener('click', async () => {
    const btn = $('#refresh'); btn.disabled = true; btn.textContent = 'Checking…';
    try {
      const res = await fetch('/api/refresh', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) toast(body.error || `Refresh failed (${res.status})`);
      else {
        toast(body.started ? 'Checking all retailers, this takes about 1-2 minutes…' : 'A check is already running…', 4000);
        const st = await waitForPass(btn);
        await load();
        if (st?.lastRefreshError) toast(`Refresh failed: ${st.lastRefreshError}`, 6000);
        else if (state.stock) toast(`Done: ${state.stock.summary.inStock} of ${state.stock.summary.total} in stock · ${state.stock.changes.length} change${state.stock.changes.length === 1 ? '' : 's'}`);
      }
    } catch (e) { toast(`Refresh failed: ${e.message}. Is the server running? (npm start)`, 6000); }
    btn.disabled = false; btn.textContent = 'Refresh';
  });

  load();
  setInterval(load, 60_000);
  setInterval(() => { if (state.stock) { $('#updated').textContent = `Updated ${relative(state.stock.generatedAt)} · ${state.stock.pass.requests} req`; renderStatus(); } }, 15_000);
})();
