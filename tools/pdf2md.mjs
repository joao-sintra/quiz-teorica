#!/usr/bin/env node
// Converts every PDF under materia/ into a compact Markdown file next to it (one "## p. N" section per page),
// so question generation reads text instead of PDFs. Needs poppler-utils (pdftotext, pdfimages).
// Pages with real figures get a marker so they can be rendered as quiz images (see CLAUDE.md).
// Usage: node tools/pdf2md.mjs [materia-dir]
import { readdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Lines on more than this share of pages are headers/footers (course name, author, slide counter).
const REPEAT_SHARE = 0.4;
const MIN_FIGURE_PX = 150;

export function pagesToMarkdown(title, pages, figurePages = new Set()) {
  const clean = pages.map((p) => p.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean));
  const seen = new Map();
  for (const lines of clean) for (const l of new Set(lines)) seen.set(l, (seen.get(l) ?? 0) + 1);
  const isBoiler = (l) => /^(\d{1,3}|[•▪◦●○■□➢✓\-–—]+)$/.test(l) || (clean.length >= 5 && seen.get(l) / clean.length > REPEAT_SHARE);

  const out = [`# ${title}`];
  clean.forEach((lines, i) => {
    const body = lines.filter((l) => !isBoiler(l));
    const fig = figurePages.has(i + 1) ? '_[figura]_' : '';
    if (body.length === 0 && !fig) return;
    out.push('', `## p. ${i + 1}`, ...body, ...(fig ? [fig] : []));
  });
  return out.join('\n') + '\n';
}

// Pages holding an image that is big enough and not repeated across slides (repeated = logo/template).
export function figurePagesFrom(listing) {
  const rows = listing.split('\n').slice(2).map((l) => l.trim().split(/\s+/)).filter((r) => r.length > 10 && r[2] === 'image');
  const pagesPerObject = new Map();
  for (const r of rows) pagesPerObject.set(r[10], (pagesPerObject.get(r[10]) ?? 0) + 1);
  return new Set(rows
    .filter((r) => pagesPerObject.get(r[10]) === 1 && Number(r[3]) >= MIN_FIGURE_PX && Number(r[4]) >= MIN_FIGURE_PX)
    .map((r) => Number(r[0])));
}

async function main() {
  const dir = process.argv[2] ?? join(root, 'materia');
  const pdfs = (await readdir(dir, { recursive: true })).filter((f) => f.toLowerCase().endsWith('.pdf')).sort();
  if (pdfs.length === 0) throw new Error(`Nenhum PDF em ${dir}`);
  for (const f of pdfs) {
    const path = join(dir, f);
    const text = execFileSync('pdftotext', ['-enc', 'UTF-8', path, '-'], { encoding: 'utf8', maxBuffer: 1 << 28 });
    const figures = figurePagesFrom(execFileSync('pdfimages', ['-list', path], { encoding: 'utf8', maxBuffer: 1 << 26 }));
    const pages = text.split('\f');
    if (pages.at(-1).trim() === '') pages.pop();
    const md = pagesToMarkdown(f.replace(/\.pdf$/i, '').split('/').pop(), pages, figures);
    await writeFile(path.replace(/\.pdf$/i, '.md'), md);
    console.log(`${f}: ${pages.length} páginas, ${figures.size} com figura, ${md.length} chars`);
  }
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
