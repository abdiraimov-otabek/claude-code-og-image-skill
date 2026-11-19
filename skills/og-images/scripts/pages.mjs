#!/usr/bin/env node
// Lists the pages of a site folder with their <title> and <h1>, to pick which pages get their own link-preview image.
//   node pages.mjs site            (a folder of built HTML, e.g. site/, out/, dist/, public/)
// Prints one line per page: path, title, h1. Skips 404 pages, noindex pages and node_modules.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

const root = resolve(process.argv[2] || '.');
if (!existsSync(root)) { console.error(`folder not found: ${root}`); process.exit(2); }
const dec = s => s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const walk = d => readdirSync(d).flatMap(n => {
  if (n === 'node_modules' || n.startsWith('.') || n === '_next') return [];
  const p = join(d, n);
  return statSync(p).isDirectory() ? walk(p) : n.endsWith('.html') && !/^404/.test(n) ? [p] : [];
});
for (const f of walk(root)) {
  const html = readFileSync(f, 'utf8');
  if (/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(html)) continue;
  const title = dec(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ''), h1 = dec(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '');
  if (title || h1) console.log(`${relative(root, f)}\n  title: ${title}\n  h1:    ${h1}`);
}
