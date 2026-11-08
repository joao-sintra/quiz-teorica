#!/usr/bin/env node
// Interactive picker: which documents of each cadeira come up in the 1º and 2º teste.
// Lists the PDFs in materia/<cadeira>/ and saves the choice to content/settings.js (read by tools/build.mjs).
// Usage: node tools/testes.mjs [cadeira]
import { readdir, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const materia = join(root, 'materia');
const TESTS = ['1', '2'];

// "1-3, 5" -> [1, 2, 3, 5]; null when malformed or out of 1..max.
export function parseSelection(input, max) {
  const picked = new Set();
  for (const part of input.split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) return null;
    const a = Number(m[1]);
    const b = Number(m[2] ?? m[1]);
    if (a < 1 || b > max || a > b) return null;
    for (let i = a; i <= b; i++) picked.add(i);
  }
  return [...picked].sort((x, y) => x - y);
}

export async function loadSettings(dir) {
  const path = join(dir, 'settings.js');
  if (!existsSync(path)) return {};
  return (await import(`${pathToFileURL(path)}?t=${Date.now()}`)).default ?? {};
}

export const settingsSource = (settings) =>
  `// Documentos que saem em cada teste, por cadeira. Gerado por \`node tools/testes.mjs\`; podes editar à mão.\n` +
  `export default ${JSON.stringify(settings, null, 2)};\n`;

async function main() {
  const contentDir = join(root, 'content');
  const settings = await loadSettings(contentDir);
  settings.testes ??= {};

  const only = process.argv[2];
  const cadeiras = (await readdir(materia, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && (!only || d.name === only))
    .map((d) => d.name)
    .sort();
  if (cadeiras.length === 0) throw new Error(only ? `Cadeira "${only}" não existe em materia/` : 'materia/ não tem cadeiras');

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  // Line iterator instead of rl.question: question() drops lines that arrive before it is called (piped input).
  const lines = rl[Symbol.asyncIterator]();
  const ask = async (prompt) => {
    process.stdout.write(prompt);
    const { value, done } = await lines.next();
    if (done) throw new Error('\nInput terminou antes do fim; nada foi guardado.');
    return value;
  };
  console.log('Para cada teste escreve os números (ex.: 1-3,5). Enter mantém, "-" limpa.\n');
  for (const cadeira of cadeiras) {
    const docs = (await readdir(join(materia, cadeira)))
      .filter((f) => f.toLowerCase().endsWith('.pdf'))
      .map((f) => f.slice(0, -4))
      .sort((a, b) => a.localeCompare(b, 'pt', { numeric: true }));
    if (docs.length === 0) continue;
    const current = settings.testes[cadeira] ?? {};
    console.log(`== ${cadeira}`);
    docs.forEach((d, i) => {
      const tags = TESTS.filter((n) => current[n]?.includes(d)).map((n) => `${n}º`).join(' ');
      console.log(`  ${String(i + 1).padStart(2)}. ${d}${tags ? `  [${tags}]` : ''}`);
    });
    const next = {};
    for (const n of TESTS) {
      const now = (current[n] ?? []).filter((d) => docs.includes(d));
      for (;;) {
        const nums = now.map((d) => docs.indexOf(d) + 1).join(',');
        const answer = (await ask(`  ${n}º teste [${nums || 'nenhum'}]: `)).trim();
        if (answer === '') { next[n] = now; break; }
        if (answer === '-') { next[n] = []; break; }
        const picked = parseSelection(answer, docs.length);
        if (picked) { next[n] = picked.map((i) => docs[i - 1]); break; }
        console.log(`  Não percebi. Usa números de 1 a ${docs.length}, ex.: 1-3,5`);
      }
    }
    settings.testes[cadeira] = next;
    console.log();
  }
  rl.close();

  await mkdir(contentDir, { recursive: true });
  await writeFile(join(contentDir, 'settings.js'), settingsSource(settings));
  console.log('Guardado em content/settings.js. Corre `node tools/build.mjs` para publicar.');
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
