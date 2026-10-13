#!/usr/bin/env node
// Public-page audit: node tools/audit.mjs <url> --crawl N --out dir --delay ms
// Reads robots.txt, uses an honest user-agent, waits between requests, screenshots each public page at
// mobile + desktop sizes, and writes outline.json per page plus a features.md summary.
// Public pages only: no logins, no form submission, no private APIs.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const UA_TOKEN = 'ReRollAudit';
const USER_AGENT = `${UA_TOKEN}/1.0 (+automated public-page audit; honors robots.txt; contact site owner)`;

function parseArgs(argv) {
  const opts = { url: null, crawl: 5, out: 'audit-out', delay: 1000 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--crawl') opts.crawl = parseInt(argv[++i], 10);
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--delay') opts.delay = parseInt(argv[++i], 10);
    else if (a === '-h' || a === '--help') opts.help = true;
    else if (!a.startsWith('--') && !opts.url) opts.url = a;
    else { console.error(`Unknown argument: ${a}`); process.exit(2); }
  }
  if (opts.help || !opts.url || !(opts.crawl >= 1) || !(opts.delay >= 0)) {
    console.error('Usage: node tools/audit.mjs <url> [--crawl N] [--out dir] [--delay ms]');
    process.exit(opts.help ? 0 : 2);
  }
  return opts;
}

// ---- robots.txt -----------------------------------------------------------------------------
function parseRobots(text) {
  const groups = [];
  let cur = null, lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [], delay: null }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else if (cur && (key === 'allow' || key === 'disallow')) {
      lastWasAgent = false;
      if (val) cur.rules.push({ allow: key === 'allow', pattern: val });
    } else if (cur && key === 'crawl-delay') {
      lastWasAgent = false;
      const d = parseFloat(val); if (!isNaN(d)) cur.delay = d;
    } else lastWasAgent = false;
  }
  // Most specific matching group wins: our UA token, else "*".
  const ours = groups.filter((g) => g.agents.some((a) => a !== '*' && UA_TOKEN.toLowerCase().includes(a)));
  const star = groups.filter((g) => g.agents.includes('*'));
  const chosen = ours.length ? ours : star;
  return { rules: chosen.flatMap((g) => g.rules), delay: chosen.map((g) => g.delay).find((d) => d != null) ?? null };
}

function patternToRegex(p) {
  const anchored = p.endsWith('$');
  const body = (anchored ? p.slice(0, -1) : p).split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp('^' + body + (anchored ? '$' : ''));
}

function isAllowed(robots, pathAndQuery) {
  let best = null;
  for (const r of robots.rules) {
    if (!patternToRegex(r.pattern).test(pathAndQuery)) continue;
    // longest pattern wins; Allow beats Disallow on ties
    if (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow)) best = r;
  }
  return !best || best.allow;
}

// ---- helpers --------------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SKIP_EXT = /\.(pdf|zip|gz|png|jpe?g|gif|webp|svg|ico|mp4|mp3|woff2?|css|js|json|xml|txt)$/i;

function normalizeUrl(href, base) {
  try {
    const u = new URL(href, base);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '');
    return u;
  } catch { return null; }
}

function slugFor(u) {
  const s = (u.pathname + (u.search || '')).replace(/^\/+/, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return (s || 'home').slice(0, 80);
}

// Runs inside the page: gathers a structural outline. Reads only; never clicks or submits.
function extractOutline() {
  const txt = (el) => (el.innerText || el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 140);
  const abs = (h) => { try { return new URL(h, location.href); } catch { return null; } };
  const root = getComputedStyle(document.documentElement);
  const body = getComputedStyle(document.body);
  const cssVars = {};
  try {
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch { continue; }
      for (const rule of rules) {
        if (rule.selectorText === ':root') {
          for (const name of rule.style) if (name.startsWith('--')) cssVars[name] = rule.style.getPropertyValue(name).trim();
        }
      }
    }
  } catch {}
  const links = [...document.querySelectorAll('a[href]')].map((a) => ({ text: txt(a), url: abs(a.getAttribute('href')) })).filter((l) => l.url);
  const sameOrigin = [...new Set(links.filter((l) => l.url.origin === location.origin).map((l) => l.url.href.split('#')[0]))];
  const navLinks = [...document.querySelectorAll('nav a[href], header a[href]')]
    .map((a) => ({ text: txt(a), href: abs(a.getAttribute('href'))?.href })).filter((l) => l.href);
  const labelFor = (el) => {
    if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) return txt(l); }
    const wrap = el.closest('label'); if (wrap) return txt(wrap);
    return el.getAttribute('aria-label') || '';
  };
  return {
    url: location.href,
    title: document.title,
    lang: document.documentElement.lang || null,
    metaDescription: document.querySelector('meta[name="description"]')?.content || null,
    headings: [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => ({ level: Number(h.tagName[1]), text: txt(h) })).filter((h) => h.text),
    navLinks,
    buttons: [...document.querySelectorAll('button, [role=button], input[type=submit], input[type=button], a.btn')].map(txt).filter(Boolean),
    inputs: [...document.querySelectorAll('input, select, textarea')].map((i) => ({
      tag: i.tagName.toLowerCase(), type: i.getAttribute('type') || (i.tagName === 'INPUT' ? 'text' : null),
      name: i.getAttribute('name'), id: i.id || null, placeholder: i.getAttribute('placeholder'), label: labelFor(i), required: i.required,
    })),
    forms: [...document.forms].map((f) => ({ action: f.getAttribute('action'), method: (f.method || 'get').toLowerCase() })),
    themeColors: {
      metaThemeColor: document.querySelector('meta[name="theme-color"]')?.content || null,
      colorScheme: root.colorScheme,
      bodyBackground: body.backgroundColor, bodyColor: body.color, bodyFont: body.fontFamily,
      cssVariables: cssVars,
    },
    sameOriginLinks: sameOrigin,
    externalLinks: [...new Set(links.filter((l) => l.url.origin !== location.origin).map((l) => l.url.href))],
  };
}

// ---- main -----------------------------------------------------------------------------------
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const start = normalizeUrl(opts.url);
  if (!start) { console.error('Invalid URL'); process.exit(2); }
  const origin = start.origin;
  fs.mkdirSync(opts.out, { recursive: true });

  let lastRequestAt = 0;
  let delay = opts.delay;
  const polite = async () => {
    const wait = lastRequestAt + delay - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
  };

  // robots.txt (fetched with the same honest UA, counts as a request)
  let robots = { rules: [], delay: null };
  await polite();
  try {
    const res = await fetch(`${origin}/robots.txt`, { headers: { 'User-Agent': USER_AGENT } });
    if (res.ok && /text|plain/.test(res.headers.get('content-type') || 'text/plain')) {
      robots = parseRobots(await res.text());
      console.log(`robots.txt: ${robots.rules.length} rule(s) apply to us`);
    } else console.log(`robots.txt: HTTP ${res.status}, treating as allow-all`);
  } catch (e) { console.log(`robots.txt: unreachable (${e.message}), treating as allow-all`); }
  if (robots.delay != null) delay = Math.max(delay, robots.delay * 1000);

  const exe = process.env.CHROMIUM_PATH || process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
  const browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}) });
  const sizes = { mobile: { width: 390, height: 844 }, desktop: { width: 1280, height: 800 } };
  const contexts = {};
  for (const [name, viewport] of Object.entries(sizes)) {
    contexts[name] = await browser.newContext({ viewport, userAgent: USER_AGENT, deviceScaleFactor: name === 'mobile' ? 2 : 1, isMobile: name === 'mobile', hasTouch: name === 'mobile' });
  }

  const queue = [start.href];
  const seen = new Set(queue);
  const pages = [], skippedByRobots = [], failed = [];

  while (queue.length && pages.length < opts.crawl) {
    const href = queue.shift();
    const u = new URL(href);
    if (!isAllowed(robots, u.pathname + u.search)) { skippedByRobots.push(u.pathname + u.search); console.log(`skip (robots): ${u.pathname}`); continue; }

    const dir = path.join(opts.out, slugFor(u));
    fs.mkdirSync(dir, { recursive: true });
    try {
      let outline = null, status = null;
      for (const [name, ctx] of Object.entries(contexts)) {
        await polite();
        const page = await ctx.newPage();
        const resp = await page.goto(href, { waitUntil: 'networkidle', timeout: 30000 });
        status = resp?.status() ?? null;
        await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true });
        if (name === 'desktop') outline = await page.evaluate(extractOutline);
        await page.close();
      }
      outline.httpStatus = status;
      fs.writeFileSync(path.join(dir, 'outline.json'), JSON.stringify(outline, null, 2));
      pages.push({ dir: path.basename(dir), ...outline });
      console.log(`[${pages.length}/${opts.crawl}] ${status} ${u.pathname + u.search}  "${outline.title}"`);

      for (const l of outline.sameOriginLinks) {
        const n = normalizeUrl(l);
        if (!n || n.origin !== origin || SKIP_EXT.test(n.pathname) || seen.has(n.href)) continue;
        seen.add(n.href); queue.push(n.href);
      }
    } catch (e) {
      failed.push({ url: href, error: e.message });
      console.error(`failed: ${href}: ${e.message}`);
    }
  }
  await browser.close();

  fs.writeFileSync(path.join(opts.out, 'features.md'), renderFeatures({ origin, opts, delay, pages, skippedByRobots, failed, unvisited: queue }));
  console.log(`\nDone. ${pages.length} page(s) -> ${path.resolve(opts.out)}`);
}

function renderFeatures({ origin, opts, delay, pages, skippedByRobots, failed, unvisited }) {
  const L = [];
  L.push(`# Site audit: ${origin}`, '', `- User-agent: \`${USER_AGENT}\``, `- Pages captured: ${pages.length} (limit ${opts.crawl}), delay between requests: ${delay}ms`,
    `- Viewports: mobile 390x844, desktop 1280x800 (full-page screenshots per page)`, '- Scope: public pages only; no logins, no form submission, no private APIs.', '');
  if (pages[0]) {
    const t = pages[0].themeColors;
    L.push('## Theme', `- Background \`${t.bodyBackground}\`, text \`${t.bodyColor}\`, color-scheme \`${t.colorScheme}\`, theme-color \`${t.metaThemeColor ?? 'none'}\``);
    const vars = Object.entries(t.cssVariables); if (vars.length) L.push(`- CSS variables: ${vars.map(([k, v]) => `\`${k}: ${v}\``).join(', ')}`);
    L.push('');
  }
  const nav = new Map();
  pages.forEach((p) => p.navLinks.forEach((l) => nav.set(l.href, l.text || l.href)));
  if (nav.size) L.push('## Navigation', ...[...nav].map(([h, t]) => `- ${t || '(icon)'} → ${h}`), '');
  const allInputs = pages.flatMap((p) => p.inputs.map((i) => ({ ...i, page: new URL(p.url).pathname })));
  L.push('## Features observed');
  const feats = [];
  if (allInputs.some((i) => i.type === 'search')) feats.push('Search box (type=search) for filtering content');
  if (allInputs.some((i) => i.type === 'tel')) feats.push('Phone-number capture (type=tel), likely for checkout or SMS delivery');
  if (allInputs.some((i) => i.type === 'email')) feats.push('Email capture');
  if (allInputs.some((i) => i.type === 'password')) feats.push('Password field present (login exists; not exercised by this audit)');
  const btns = new Set(pages.flatMap((p) => p.buttons));
  if (btns.size) feats.push(`Calls to action / buttons: ${[...btns].slice(0, 12).map((b) => `"${b}"`).join(', ')}`);
  if (pages.some((p) => p.metaDescription)) feats.push('Meta descriptions set');
  L.push(...(feats.length ? feats.map((f) => `- ${f}`) : ['- (none detected)']), '');
  L.push('## Pages');
  for (const p of pages) {
    const u = new URL(p.url);
    L.push(`### ${u.pathname}${u.search}  (HTTP ${p.httpStatus})`, `- Title: ${p.title}`, `- Screenshots: \`${p.dir}/mobile.png\`, \`${p.dir}/desktop.png\`; outline: \`${p.dir}/outline.json\``);
    const h = p.headings.slice(0, 8); if (h.length) L.push(`- Headings: ${h.map((x) => `h${x.level} ${x.text}`).join(' | ')}`);
    if (p.inputs.length) L.push(`- Inputs: ${p.inputs.map((i) => `${i.type || i.tag}${i.name ? ` "${i.name}"` : ''}${i.label ? ` (${i.label})` : ''}`).join(', ')}`);
    if (p.buttons.length) L.push(`- Buttons: ${[...new Set(p.buttons)].map((b) => `"${b}"`).join(', ')}`);
    L.push(`- Same-origin links: ${p.sameOriginLinks.length}`, '');
  }
  if (skippedByRobots.length) L.push('## Skipped by robots.txt', ...skippedByRobots.map((s) => `- ${s}`), '');
  if (unvisited.length) L.push(`## Found but not visited (crawl limit)`, ...unvisited.slice(0, 30).map((s) => `- ${s}`), '');
  if (failed.length) L.push('## Failures', ...failed.map((f) => `- ${f.url}: ${f.error}`), '');
  return L.join('\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
