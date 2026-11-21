#!/usr/bin/env node
// Renders link previews, Product Hunt gallery slides and an X header from a JSON config, then checks the PNG files.
//
//   node render.mjs path/to/og.json                 render everything
//   node render.mjs path/to/og.json --only link     link | pages | ph | x
//
// Paths inside the config are relative to the config file.
// Exit code: 0 all rendered and clean, 1 a check failed, 2 setup or config problem.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const [configArg, ...rest] = process.argv.slice(2);
if (!configArg) { console.error('usage: node render.mjs <og.json> [--only link|pages|ph|x]'); process.exit(2); }
const die = msg => { console.error(msg); process.exit(2); };
const only = rest.includes('--only') ? rest[rest.indexOf('--only') + 1] : null;
if (rest.includes('--only') && !['link', 'pages', 'ph', 'x'].includes(only)) die(`--only takes link, pages, ph or x, got ${JSON.stringify(only)}`);

const skillDir = join(dirname(fileURLToPath(import.meta.url)), '..');
let chromium;
for (const base of [import.meta.url, join(process.cwd(), 'x.js')]) {
  try { ({ chromium } = createRequire(base)('playwright')); break; } catch {}
}
if (!chromium) die(`Playwright is not installed. Run:\n\n  npm install --prefix "${skillDir}" playwright@1.59.1 && npx --prefix "${skillDir}" playwright install chromium\n`);

const configPath = resolve(configArg), base = dirname(configPath);
let config;
try { config = JSON.parse(readFileSync(configPath, 'utf8')); } catch (e) { die(`cannot read ${configPath}: ${e.message}`); }
const at = p => resolve(base, p);
const outDir = at(config.out || '.');

// What each kind of card is, how big, and the least its title may be (cap height in px at the full size).
const KINDS = {
  link: { w: 1200, h: 630, minCap: 40, minCoverage: 0.3, words: 9 },
  ph:   { w: 1270, h: 760, minCap: 38, minCoverage: 0.4, words: 6 },
  x:    { w: 1500, h: 500, minCap: 36, minCoverage: 0.12, words: 6 },
};

// ---- brand ----
const brandPath = typeof config.brand === 'string' ? at(config.brand) : null;
if (brandPath && !existsSync(brandPath)) die(`brand file not found: ${brandPath}`);
let brand;
try { brand = brandPath ? JSON.parse(readFileSync(brandPath, 'utf8')) : (config.brand || {}); } catch (e) { die(`cannot read ${brandPath}: ${e.message}`); }
if (!brand.appName) die('the brand needs "appName"');
const repoRoot = brandPath ? join(dirname(brandPath), '..') : base;
brand.iconPath ||= brand.icon; // store-screenshots and launch-video write "icon"
if (!brand.iconPath) die('the brand needs "iconPath" (or "icon"): the app icon, relative to the repo root (the folder above launch-assets)');
const iconFile = resolve(repoRoot, brand.iconPath);
if (!existsSync(iconFile)) die(`app icon not found: ${iconFile}`);
if (!brand.colors?.accent) console.log('note: the brand has no colors.accent. The field is neutral grey and no wallpaper is picked.');
if (brand.fonts?.file) {
  const fontPath = resolve(repoRoot, brand.fonts.file);
  if (!existsSync(fontPath)) die(`font file not found: ${fontPath}`);
  const magic = readFileSync(fontPath).subarray(0, 4).toString('latin1');
  if (!['wOFF', 'wOF2', 'OTTO', 'true', 'ttcf', '\x00\x01\x00\x00'].includes(magic)) die(`fonts.file is not a font (woff, woff2, ttf or otf expected): ${fontPath}`);
  brand.fonts = { ...brand.fonts, fileUrl: pathToFileURL(fontPath).href };
}

// ---- colours and wallpaper ----
const toRgb = c => {
  c = String(c || '').trim().toLowerCase();
  let m = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (m) { const n = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1]; return [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16)); }
  m = c.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
  if (m) return m.slice(1, 4).map(Number);
  m = c.match(/^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/);
  if (m) { const h = +m[1], sat = +m[2] / 100, l = +m[3] / 100, f = n => { const k = (n + h / 30) % 12; return Math.round(255 * (l - sat * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }; return [f(0), f(8), f(4)]; }
  return null;
};
for (const k of ['bg', 'ink']) if (brand.colors?.[k] && !toRgb(brand.colors[k])) die(`brand colors.${k} "${brand.colors[k]}" cannot be read: write it as hex (#1d1d1f), rgb() or hsl()`);
const hueOf = c => {
  if (!c) return null;
  const rgb = toRgb(c); if (!rgb) return NaN;
  const [r, g, b] = rgb.map(v => v / 255), max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  if (d < 0.12) return null;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const wallDir = join(skillDir, 'assets', 'wallpapers');
const wallIndex = JSON.parse(readFileSync(join(wallDir, 'index.json'), 'utf8'));
const bundled = Object.keys(wallIndex).filter(k => k !== '_');
let wall = null;
{
  const wc = typeof config.wallpaper === 'string' ? { file: config.wallpaper } : config.wallpaper;
  let f = wc?.file;
  if (f === 'auto') {
    const accent = brand.colors?.accent, hue = hueOf(accent), gap = h => Math.min(Math.abs(h - hue), 360 - Math.abs(h - hue));
    if (hue == null || Number.isNaN(hue)) { console.log(`wallpaper: none. The accent ${accent || '(none)'} is grey or unreadable (use a hex colour), so the brand field is used.`); f = null; }
    else {
      const name = bundled.sort((a, b) => gap(wallIndex[a].hue) - gap(wallIndex[b].hue))[0];
      if (gap(wallIndex[name].hue) > 50) { console.log(`wallpaper: none. Accent ${accent} is hue ${Math.round(hue)}, more than 50 degrees from every bundled picture (nearest: ${name}), so the brand field is used.`); f = null; }
      else { console.log(`wallpaper: ${name}. Accent ${accent} is hue ${Math.round(hue)}, nearest picture is ${name} at ${wallIndex[name].hue} (${wallIndex[name].mood}). Override with "wallpaper": "<name or path>".`); f = name; }
    }
  }
  if (f) {
    const isName = /^[a-z0-9-]+$/.test(f) && bundled.includes(f);
    const file = isName ? join(wallDir, `${f}.jpg`) : at(f);
    if (!existsSync(file)) die(`wallpaper not found: ${f} (bundled: ${bundled.join(', ')})`);
    wall = { url: pathToFileURL(file).href, horizon: wc.horizon ?? wallIndex[f]?.horizon, horizonAt: wc.horizonAt, zoom: wc.zoom, y: wc.y, zoomMax: wc.zoomMax };
  }
}

// ---- cards: every PNG to make, from the config ----
const num = (v, what, lo, hi) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) die(`${what} must be a number from ${lo} to ${hi}, got ${JSON.stringify(v)}`); };
const SHOT_LAYOUT = { notch: 'fit', stack: 'pair' };
const cards = [];   // { kind, id, file, title, subline, alt, captures[], crop(s), clean, radius, width, layout }
const safeId = (id, where) => { if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(String(id))) die(`${where}: the id may hold letters, digits, - and _ only`); return id; };
const caps = (o, where) => {
  if (o.capture && o.captures) die(`${where}: set "capture" or "captures", not both`);
  const list = o.captures || (o.capture ? [o.capture] : []);
  if (!list.length) die(`${where} needs "capture" (one file)`);
  if (list.length > 3) die(`${where}: "captures" takes three files at most`);
  return list.map(c => at(c));
};
const checkCrop = (c, where) => { if (!c) return; for (const k of ['x', 'y']) num(c[k] ?? 0, `${where} crop.${k}`, 0, 1); for (const k of ['w', 'h']) num(c[k] ?? 1, `${where} crop.${k}`, 0.01, 1); if ((c.x ?? 0) + (c.w ?? 1) > 1.0001 || (c.y ?? 0) + (c.h ?? 1) > 1.0001) die(`${where}: the crop runs past the capture`); };
const text = (v, where) => { if (typeof v !== 'string' || !v.trim()) die(`${where} must be a non-empty string`); return v.trim(); };
const mk = (kind, id, where, o, extra = {}) => {
  const c = { kind, id, where, title: text(o.title ?? o.headline, `${where} title`), subline: o.subline == null ? '' : text(o.subline, `${where} subline`),
    captures: caps(o, where), crop: o.crop, crops: o.crops, clean: o.clean, square: o.square, radius: o.radius, width: o.width, shadow: o.shadow, layout: o.layout, zoom: o.zoom, alt: o.alt, minCoverage: o.minCoverage, ...extra };
  if (o.crop && o.crops) die(`${where}: set "crop" or "crops", not both`);
  checkCrop(c.crop, where); (c.crops || []).forEach(k => checkCrop(k, where));
  if (c.width != null) num(c.width, `${where} width`, 0.05, 2);
  if (c.layout && !['side', 'below', 'poster', 'detail', 'window', 'bleed', 'fit', 'pair', 'stack'].includes(c.layout)) die(`${where}: layout "${c.layout}" is not one of poster, detail, window, side, below (link and x), bleed, fit, pair (slides)`);
  if (c.layout === 'detail') {   // the zoom card is the same capture again, cropped to "zoom"
    if (!c.zoom) die(`${where}: layout "detail" needs "zoom": { x, y, w, h } (0 to 1 of the capture), the part the title talks about`);
    c.captures = [c.captures[0], c.captures[0]]; c.crops = [c.crop || null, c.zoom];
  }
  cards.push(c); return c;
};
if (config.link) {
  mk('link', 'og', 'link', config.link, { file: join(outDir, 'og.png'), main: true });
  const seen = new Set();
  for (const [i, p] of (config.pages || []).entries()) {
    const id = safeId(p.id, `pages[${i}]`);
    if (seen.has(id)) die(`pages[${i}]: the id "${id}" is used twice (each page writes og-<id>.png)`);
    seen.add(id);
    // a page that names its own capture(s) or crop(s) replaces the link's, it does not add to them
    const inherit = { ...config.link, alt: undefined, subline: undefined };
    if (p.capture || p.captures) for (const k of ['capture', 'captures', 'crop', 'crops']) delete inherit[k];
    else if (p.crop || p.crops) for (const k of ['crop', 'crops']) delete inherit[k];
    mk('link', id, `pages[${i}] (${id})`, { ...inherit, ...p }, { file: join(outDir, `og-${id}.png`), page: true });
  }
}
if (config.ph) {
  let slides = config.ph.slides || [];
  if (config.ph.fromShots) {   // reuse the store-screenshots set: headlines, sublines, captures, crops
    const sp = at(config.ph.fromShots);
    if (!existsSync(sp)) die(`ph.fromShots not found: ${sp}`);
    const sd = dirname(sp);
    let set;
    try { set = JSON.parse(readFileSync(sp, 'utf8')); } catch (e) { die(`ph.fromShots: cannot read ${sp}: ${e.message}`); }
    const over = new Map(slides.map(s => [s.id, s]));
    slides = (set.shots || []).slice(0, config.ph.limit ?? 6).map(s => {
      const o = over.get(s.id) || {}, own = o.capture || o.captures;
      return {
        id: s.id, title: s.headline, subline: s.subline, captures: own ? undefined : (s.captures || [s.capture]).map(c => resolve(sd, c)), crop: s.crop, crops: s.crops,
        clean: s.clean, square: s.layout === 'notch' ? true : s.square, minCoverage: s.minCoverage, radius: s.radius, width: s.width, layout: SHOT_LAYOUT[s.layout] || s.layout, ...o,
      };
    });
  }
  if (slides.length < 4 || slides.length > 6) die(`ph needs 4 to 6 slides, got ${slides.length}`);
  const phIds = new Set();
  slides.forEach((s, i) => {
    const id = safeId(s.id ?? `slide${i + 1}`, `ph slide ${i + 1}`);
    if (phIds.has(id)) die(`ph slide ${i + 1}: the id "${id}" is used twice`);
    phIds.add(id);
    // captures that came from fromShots are already absolute; resolve() keeps absolute paths
    mk('ph', id, `ph slide ${i + 1} (${id})`, s, { file: join(outDir, 'ph', `${String(i + 1).padStart(2, '0')}-${id}.png`), layout: s.layout });
  });
}
if (config.x) mk('x', 'x', 'x', config.x, { file: join(outDir, 'x-header.png') });
if (!cards.length) die('og.json needs at least one of "link", "ph", "x"');
for (const c of cards) for (const f of c.captures) if (!existsSync(f)) die(`capture not found: ${f}`);

// ---- font rule: the first named family of the stack must be the font that drew the text ----
const SYSTEM = /^(-apple-system|blinkmacsystemfont|system-ui|ui-sans-serif)$/i, GENERIC = /^(sans-serif|serif|monospace|cursive|fantasy|ui-serif|ui-monospace|ui-rounded|emoji|math|fangsong)$/i;
const firstNamed = stack => {
  for (const f of String(stack || '').split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)) {
    if (SYSTEM.test(f)) return { system: true };
    if (!GENERIC.test(f)) return { name: f };
  }
  return { system: true };
};
const BAD_FONT = /^(helvetica|arial|times|courier|lucida|geneva)/i;
const wanted = firstNamed(brand.fonts?.family);

// ---- PNG facts straight from the file ----
const pngFacts = file => { const b = readFileSync(file); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), alpha: b[25] === 4 || b[25] === 6, bytes: b.length }; };

const wcount = s => s.replaceAll('**', '').trim().split(/\s+/).length;
let browser;
try { browser = await chromium.launch({ args: ['--allow-file-access-from-files'] }); } catch (e) {
  die(`Chromium did not start. Run:\n\n  npx --prefix "${skillDir}" playwright install chromium\n\n${e.message.split('\n')[0]}`);
}
const problems = [], done = [];
const pages = {};
for (const c of cards) {
  const K = KINDS[c.kind];
  if (only && only !== (c.kind === 'link' ? (c.main ? 'link' : 'pages') : c.kind)) continue;
  mkdirSync(dirname(c.file), { recursive: true });
  let page = pages[c.kind];
  if (!page) {
    page = pages[c.kind] = await browser.newPage({ viewport: { width: K.w, height: K.h }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(join(skillDir, 'templates', 'og.html')).href);
    page.cdp = await page.context().newCDPSession(page);
    await page.cdp.send('DOM.enable'); await page.cdp.send('CSS.enable');
  }
  let facts;
  try {
    facts = await page.evaluate(d => window.setCard(d), {
      kind: c.kind, brand, wallpaper: wall,
      card: { title: c.title, subline: c.subline, name: brand.appName, iconUrl: pathToFileURL(iconFile).href, minCap: K.minCap,
        captureUrls: c.captures.map(f => pathToFileURL(f).href), crop: c.crop, crops: c.crops, clean: c.clean, square: c.square, radius: c.radius, width: c.width, shadow: c.shadow,
        layout: c.kind === 'x' ? 'side' : c.layout || (c.kind === 'link' ? 'auto' : null) },
    });
  } catch (e) { die(`${c.where}: ${String(e.message).split('\n')[0].replace(/^(page\.evaluate: )?(Error: )?/, '')}`); }
  // measure contrast of each text against the pixels really behind it
  const clipOf = b => b && { x: Math.max(0, Math.floor(b.x)), y: Math.max(0, Math.floor(b.y)), width: Math.min(K.w, Math.ceil(b.width) + 1), height: Math.min(K.h, Math.ceil(b.height) + 1) };
  await page.evaluate(() => document.body.classList.add('measuring'));
  const ratios = [];
  for (const [id, box] of [['title', facts.titleBox], ['sub', facts.subBox], ['name', facts.nameBox]]) {
    if (!box) continue;
    const shot = await page.screenshot({ clip: clipOf(box), type: 'png' });
    ratios.push(await page.evaluate(([d, i]) => window.contrastUnder(d, i), [`data:image/png;base64,${shot.toString('base64')}`, id]));
  }
  await page.evaluate(() => document.body.classList.remove('measuring'));
  const ratio = Math.min(...ratios);
  const { root } = await page.cdp.send('DOM.getDocument');
  const { nodeId } = await page.cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#title' });
  const { fonts } = await page.cdp.send('CSS.getPlatformFontsForNode', { nodeId });
  const font = fonts.map(f => f.familyName).join(', ') || 'unknown';
  await page.screenshot({ path: c.file, type: 'png', omitBackground: false });

  const issues = [];
  const copy = [c.title, c.subline].join(' ');
  if (!facts.fits) issues.push(`the title needs ${facts.lines} lines at the smallest readable size and only ${facts.maxLines} fit: shorten it`);
  if (facts.capHeight + 0.5 < K.minCap) issues.push(`title cap height ${facts.capHeight.toFixed(0)} px is under ${K.minCap} px (it would not read in a 600 px wide preview): shorten the title`);
  if (wcount(c.title) > K.words) issues.push(`title is ${wcount(c.title)} words (${K.words} or fewer)`);
  if (/[—–]| - |--/.test(copy)) issues.push('dash in the copy');
  if (/!/.test(copy)) issues.push('exclamation mark in the copy');
  if (ratio < 4.5) issues.push(`contrast ${ratio.toFixed(1)}:1 is under 4.5:1 (pick a paler wallpaper or a darker ink)`);
  if (facts.offCanvas.length) issues.push(`${facts.offCanvas.join(', ')} runs off the canvas`);
  if (facts.upscale > 1.15) issues.push(`capture enlarged ${facts.upscale.toFixed(2)}x, it will look soft (capture it larger or show less of it)`);
  if (facts.captureVisible < 0.5) issues.push(`only ${Math.round(facts.captureVisible * 100)}% of the capture is on the canvas`);
  const floor = c.minCoverage ?? config.minCoverage ?? K.minCoverage;
  // A capture that spans 80% of the card width is as large as the card allows: a thin island or bar passes.
  if (facts.coverage < floor && facts.span < 0.8) issues.push(`UI covers ${(facts.coverage * 100).toFixed(1)}% of the card, under ${Math.round(floor * 100)}%, and the capture spans only ${Math.round(facts.span * 100)}% of the width (80% passes): show it larger, crop to the part that matters, or pick another capture`);
  if (facts.wall.scale > 1.2) issues.push(`wallpaper enlarged ${facts.wall.scale}x, it will look soft (lower "zoomMax")`);
  issues.push(...facts.safe);
  // fonts
  const drawn = fonts[0]?.familyName || '';
  if (wanted.name) { if (!drawn.toLowerCase().includes(wanted.name.toLowerCase())) issues.push(`the first named font "${wanted.name}" did not draw the text, "${font}" did: ship the font file (fonts.file), set fonts.google, or name a font that is installed`); }
  else if (BAD_FONT.test(drawn)) issues.push(`font fell back to ${font}: the stack names none that is installed (add "-apple-system, system-ui" or ship the font)`);
  // the file
  const png = pngFacts(c.file);
  if (png.w !== K.w || png.h !== K.h) issues.push(`file is ${png.w}x${png.h}, expected ${K.w}x${K.h}`);
  if (png.alpha) issues.push('PNG has an alpha channel');
  if (png.bytes > 5e6) issues.push(`file is ${(png.bytes / 1e6).toFixed(1)} MB: some platforms drop link-preview images over 5 MB`);

  const rel = c.file.replace(outDir + '/', '');
  console.log(`${issues.length ? 'FAIL' : 'ok  '} ${rel}  ${png.w}x${png.h}  ${(png.bytes / 1e3).toFixed(0)} KB  font: ${font}  contrast ${ratio.toFixed(1)}:1  title ${facts.titleSize}px, cap ${facts.capHeight.toFixed(0)} px, ${facts.lines} line${facts.lines === 1 ? '' : 's'}  ui ${Math.round(facts.coverage * 100)}%  capture ${facts.upscale.toFixed(2)}x${facts.wall.zoom ? `  wallpaper ${facts.wall.scale}x` : ''}`);
  for (const m of issues) { console.log(`       ${m}`); problems.push(`${rel}: ${m}`); }
  done.push({ ...c, rel, png });
}
await browser.close();
if (only && !done.length) die(`--only ${only}: the config has no ${only} cards to render`);

// ---- meta.html: the tags to paste, with absolute URLs ----
if (!only && config.link) {
  const site = (brand.siteUrl || config.siteUrl || 'https://YOUR-SITE.example').replace(/\/$/, '');
  const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
  const altOf = c => c.alt || `${brand.appName}: ${c.title}${c.subline ? '. ' + c.subline : ''}`;
  const tags = (c, url) => `<meta property="og:image" content="${url}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(altOf(c))}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${url}">
<meta name="twitter:image:alt" content="${esc(altOf(c))}">`;
  const links = done.filter(c => c.kind === 'link');
  let out = `<!-- Link preview tags. Paste inside <head>. Copy the PNGs to your site and keep the URLs absolute: crawlers ignore relative ones.
     Change ${site}/og/ if you host the images elsewhere. After you deploy, refresh the cached preview in each platform's debugger. -->
${tags(links[0], `${site}/og/og.png`)}
`;
  for (const c of links.slice(1)) out += `\n<!-- ${c.where.replace(/\(.*\)/, '').trim()}: use on the page titled "${esc(c.title)}" instead of the tags above -->\n${tags(c, `${site}/og/og-${c.id}.png`).split('\n').map(l => '<!-- ' + l + ' -->').join('\n')}\n`;
  writeFileSync(join(outDir, 'meta.html'), out);
  console.log(`meta.html written (${links.length} image${links.length === 1 ? '' : 's'}${brand.siteUrl ? '' : ', site URL is a placeholder: set siteUrl in brand.json'})`);
}

console.log(`\n${done.length} PNG${done.length === 1 ? '' : 's'} in ${outDir}`);
if (problems.length) { console.log(`${problems.length} check${problems.length === 1 ? '' : 's'} failed. Fix the config and render again.`); process.exit(1); }
console.log('Checks passed. Now run sips on every file and open every PNG, full size and small.');
