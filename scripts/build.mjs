import { readFile, mkdir, copyFile } from 'node:fs/promises';
import { Script } from 'node:vm';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const html = await readFile(`${root}index.html`, 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
if (scripts.length !== 2) throw new Error('Expected the embedded engine and game scripts.');
for (let i = 0; i < scripts.length; i++) new Script(scripts[i][1], { filename: `inline-script-${i + 1}.js` });
// Canonical links describe the public URL and are not runtime dependencies.
const runtimeHtml = html.replace(/<link\b[^>]*\brel=["']canonical["'][^>]*>/gi, '');
if (/<(?:script|link|img|audio|video)\b[^>]*(?:src|href)=["']https?:/i.test(runtimeHtml)) throw new Error('External runtime dependency found.');
if (/THREE_ENGINE|WORLD_CONTENT|GAME_SYSTEMS|INPUT_AND_RENDER/.test(html)) throw new Error('An unfinished source placeholder remains.');
await mkdir(`${root}dist`, { recursive: true });
await copyFile(`${root}index.html`, `${root}dist/index.html`);
console.log(`Built dist/index.html · ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB · two valid embedded scripts · no external runtime assets.`);
