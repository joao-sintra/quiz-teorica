#!/usr/bin/env node
// Bundles content/<cadeira>/<tema>.json into one encrypted file: docs/data/bundle.enc
// Usage: node tools/build.mjs [content-dir]   (password from QUIZ_PASSWORD or prompt)
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { encrypt } from '../docs/crypto.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIN_PASSWORD = 12;

const isText = (s) => typeof s === 'string' && s.trim() !== '';

// Returns a list of human-readable problems; empty list means the topic file is valid.
export function validate(topic, file = 'topic') {
  const errors = [];
  if (!isText(topic?.cadeira)) errors.push(`${file}: falta "cadeira"`);
  if (!isText(topic?.tema)) errors.push(`${file}: falta "tema"`);
  if (!Array.isArray(topic?.perguntas) || topic.perguntas.length === 0) {
    errors.push(`${file}: "perguntas" tem de ser uma lista não vazia`);
    return errors;
  }
  const seen = new Set();
  topic.perguntas.forEach((p, i) => {
    const at = `${file} pergunta ${i + 1}`;
    if (!isText(p.q)) errors.push(`${at}: falta "q"`);
    else if (seen.has(p.q)) errors.push(`${at}: pergunta repetida`);
    else seen.add(p.q);
    if (!Array.isArray(p.opcoes) || p.opcoes.length < 2 || !p.opcoes.every(isText)) errors.push(`${at}: "opcoes" precisa de 2+ textos`);
    else if (new Set(p.opcoes).size !== p.opcoes.length) errors.push(`${at}: opções repetidas`);
    if (!Number.isInteger(p.certa) || p.certa < 0 || p.certa >= (p.opcoes?.length ?? 0)) errors.push(`${at}: "certa" fora do intervalo`);
    if (!isText(p.explicacao)) errors.push(`${at}: falta "explicacao"`);
    if (!isText(p.fonte)) errors.push(`${at}: falta "fonte"`);
  });
  return errors;
}

// Groups topic files by subject: { cadeiras: [{ nome, temas: [{ nome, perguntas }] }] }
export function bundle(topics) {
  const cadeiras = new Map();
  for (const t of topics) {
    if (!cadeiras.has(t.cadeira)) cadeiras.set(t.cadeira, []);
    cadeiras.get(t.cadeira).push({ nome: t.tema, perguntas: t.perguntas });
  }
  const byName = (a, b) => a.nome.localeCompare(b.nome, 'pt');
  return { cadeiras: [...cadeiras].map(([nome, temas]) => ({ nome, temas: temas.sort(byName) })).sort(byName) };
}

async function password() {
  if (process.env.QUIZ_PASSWORD) return process.env.QUIZ_PASSWORD;
  // shortcut: input is echoed to the terminal, use QUIZ_PASSWORD if someone is watching the screen.
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const a = await rl.question('Password: ');
  const b = await rl.question('Repete a password: ');
  rl.close();
  if (a !== b) throw new Error('As passwords não coincidem.');
  return a;
}

async function main() {
  const src = process.argv[2] ?? join(root, 'content');
  const files = (await readdir(src, { recursive: true })).filter((f) => f.endsWith('.json')).sort();
  if (files.length === 0) throw new Error(`Nenhum .json em ${src}`);

  const topics = [];
  const errors = [];
  for (const f of files) {
    const path = join(src, f);
    let topic;
    try {
      topic = JSON.parse(await readFile(path, 'utf8'));
    } catch (e) {
      errors.push(`${f}: JSON inválido (${e.message})`);
      continue;
    }
    errors.push(...validate(topic, f));
    topics.push(topic);
  }
  if (errors.length) throw new Error(`Conteúdo inválido, nada foi cifrado:\n  ${errors.join('\n  ')}`);

  const pass = await password();
  if (pass.length < MIN_PASSWORD) throw new Error(`Password curta: usa pelo menos ${MIN_PASSWORD} caracteres.`);

  const data = bundle(topics);
  const out = join(root, 'docs/data/bundle.enc');
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(await encrypt(data, pass)));

  const n = topics.reduce((s, t) => s + t.perguntas.length, 0);
  console.log(`${data.cadeiras.length} cadeira(s), ${topics.length} tema(s), ${n} pergunta(s) -> ${relative(root, out)}`);
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
