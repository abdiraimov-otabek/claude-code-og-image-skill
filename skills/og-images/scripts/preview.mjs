#!/usr/bin/env node
// Contact sheet for the QA look: every PNG of an og folder at 600 px wide, then at 300 px wide (how a feed shows it).
//   node preview.mjs launch-assets/og        writes launch-assets/og/_preview-600.png and _preview-300.png (throwaway)
import { readdirSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const dir = resolve(process.argv[2] || '.');
if (!existsSync(dir)) { console.error(`folder not found: ${dir}`); process.exit(2); }
const here = import.meta.url;
let chromium;
for (const base of [here, join(process.cwd(), 'x.js')]) { try { ({ chromium } = createRequire(base)('playwright')); break; } catch {} }
if (!chromium) { console.error('Playwright is not installed (see SKILL.md, Setup)'); process.exit(2); }
const files = [...readdirSync(dir).filter(f => /^(og.*|x-header)\.png$/.test(f)), ...(existsSync(join(dir, 'ph')) ? readdirSync(join(dir, 'ph')).filter(f => f.endsWith('.png')).map(f => `ph/${f}`) : [])];
if (!files.length) { console.error('no PNGs found'); process.exit(2); }
const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
for (const w of [600, 300]) {
  const page = await browser.newPage({ viewport: { width: w * 2 + 30, height: 400 } });
  const sheet = join(tmpdir(), `og-preview-${w}.html`);
  writeFileSync(sheet, `<body style="margin:0;background:#fff;display:flex;flex-wrap:wrap;align-items:flex-start;gap:10px;padding:10px;align-content:flex-start">${files.map(f => `<img src="${pathToFileURL(join(dir, f)).href}" width="${w}" title="${f}">`).join('')}</body>`);
  await page.goto(pathToFileURL(sheet).href);
  await page.evaluate(() => Promise.all([...document.images].map(i => i.decode())));
  await page.screenshot({ path: join(dir, `_preview-${w}.png`), fullPage: true });
  await page.close();
}
await browser.close();
console.log(`${files.length} images. Open ${join(dir, '_preview-600.png')} and ${join(dir, '_preview-300.png')}, then delete them.`);
