#!/usr/bin/env node
// Bundles content/<cadeira>/<tema>.json into one encrypted file (docs/data/bundle.enc) plus one encrypted
// file per quiz image (docs/data/img/*.enc). content/settings.js (tools/testes.mjs) maps documents to 1º/2º teste.
// Usage: node tools/build.mjs [content-dir]   (password from QUIZ_PASSWORD or prompt)
import { readdir, readFile, writeFile, mkdir, rm, mkdtemp } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { deriveKey, seal, pack, decrypt, newSalt } from '../docs/crypto.js';
import { loadSettings } from './testes.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const materia = join(root, 'materia');
const outDir = join(root, 'docs/data');
const MIN_PASSWORD = 12;
const IMAGE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
const PDF_PAGE = /^(.+\.pdf)#(\d+)$/i;

const isText = (s) => typeof s === 'string' && s.trim() !== '';

// Returns a list of human-readable problems; empty list means the topic file is valid.
export function validate(topic, file = 'topic') {
  const errors = [];
  if (!isText(topic?.cadeira)) errors.push(`${file}: falta "cadeira"`);
  if (!isText(topic?.tema)) errors.push(`${file}: falta "tema"`);
  if (topic?.documento !== undefined && !isText(topic.documento)) errors.push(`${file}: "documento" tem de ser texto`);
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
    if (p.imagem !== undefined) {
      if (!isText(p.imagem) || !(PDF_PAGE.test(p.imagem) || IMAGE_TYPES[extname(p.imagem).toLowerCase()])) {
        errors.push(`${at}: "imagem" tem de ser "<cadeira>/<doc>.pdf#<página>" ou um .png/.jpg/.webp/.gif`);
      }
      if (!isText(p.imagemAlt)) errors.push(`${at}: imagem sem "imagemAlt" (descrição para leitores de ecrã)`);
    }
  });
  return errors;
}

// settings.js testes: { "<cadeira>": { "1": ["<documento>", ...], "2": [...] } }
export function validateTestes(testes) {
  const errors = [];
  if (testes == null || typeof testes !== 'object' || Array.isArray(testes)) return ['settings.js: "testes" tem de ser um objeto { cadeira: { "1": [...], "2": [...] } }'];
  for (const [cadeira, byTest] of Object.entries(testes)) {
    for (const [n, docs] of Object.entries(byTest ?? {})) {
      if (!/^\d+$/.test(n)) errors.push(`settings.js ${cadeira}: chave "${n}" tem de ser o número do teste`);
      if (!Array.isArray(docs) || !docs.every(isText)) errors.push(`settings.js ${cadeira} teste ${n}: tem de ser uma lista de nomes de documentos`);
    }
  }
  return errors;
}

// Tests (1º, 2º...) a document belongs to; empty when unmapped.
const testsOf = (testes, cadeira, documento) =>
  Object.entries(testes?.[cadeira] ?? {}).filter(([, docs]) => docs.includes(documento)).map(([n]) => Number(n)).sort();

// Groups topic files by subject: { cadeiras: [{ nome, temas: [{ nome, documento, testes, perguntas }] }] }
// Topics keep course order by document name (T01, Aula_2, 4.1 ...), then topic name.
export function bundle(topics, testes = {}) {
  const cadeiras = new Map();
  for (const t of topics) {
    if (!cadeiras.has(t.cadeira)) cadeiras.set(t.cadeira, []);
    cadeiras.get(t.cadeira).push({ nome: t.tema, documento: t.documento ?? '', testes: testsOf(testes, t.cadeira, t.documento), perguntas: t.perguntas });
  }
  const cmp = (a, b) => a.localeCompare(b, 'pt', { numeric: true });
  return {
    cadeiras: [...cadeiras]
      .map(([nome, temas]) => ({ nome, temas: temas.sort((a, b) => cmp(a.documento, b.documento) || cmp(a.nome, b.nome)) }))
      .sort((a, b) => cmp(a.nome, b.nome)),
  };
}

// Raw bytes for an image spec: a PDF page rendered to JPEG, or an image file. Paths are relative to materia/.
function readImage(spec, tmp) {
  const page = spec.match(PDF_PAGE);
  if (!page) return { bytes: readFileSync(join(materia, spec)), type: IMAGE_TYPES[extname(spec).toLowerCase()] };
  // shortcut: renders the whole page; add a crop (pdftoppm -x -y -W -H) if a slide gives the answer away.
  const out = join(tmp, 'page');
  execFileSync('pdftoppm', ['-jpeg', '-jpegopt', 'quality=82', '-scale-to', '1200', '-f', page[2], '-l', page[2], '-singlefile', join(materia, page[1]), out], { stdio: ['ignore', 'ignore', 'pipe'] });
  return { bytes: readFileSync(`${out}.jpg`), type: 'image/jpeg' };
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

// Reuse the current key when the password is unchanged, so unchanged images keep their files (no git churn).
async function keyFor(pass, bundlePath) {
  try {
    const { key, salt } = await decrypt(JSON.parse(await readFile(bundlePath, 'utf8')), pass);
    return { key, salt, reused: true };
  } catch {
    const salt = newSalt();
    return { key: await deriveKey(pass, salt), salt, reused: false };
  }
}

async function main() {
  const src = process.argv[2] ?? join(root, 'content');
  const files = (await readdir(src, { recursive: true })).filter((f) => f.endsWith('.json')).sort();
  if (files.length === 0) throw new Error(`Nenhum .json em ${src}`);

  const topics = [];
  const errors = [];
  const readJson = async (f) => {
    try {
      return JSON.parse(await readFile(join(src, f), 'utf8'));
    } catch (e) {
      errors.push(`${f}: JSON inválido (${e.message})`);
      return null;
    }
  };
  for (const f of files) {
    const topic = await readJson(f);
    if (!topic) continue;
    errors.push(...validate(topic, f));
    topics.push(topic);
  }
  let testes = {};
  try {
    testes = (await loadSettings(src)).testes ?? {};
  } catch (e) {
    errors.push(`settings.js: ${e.message}`);
  }
  errors.push(...validateTestes(testes));
  for (const t of topics) {
    if (testes[t.cadeira] && t.documento && testsOf(testes, t.cadeira, t.documento).length === 0) {
      console.warn(`aviso: "${t.documento}" (${t.cadeira}) não está em nenhum teste (node tools/testes.mjs)`);
    }
  }
  if (errors.length) throw new Error(`Conteúdo inválido, nada foi cifrado:\n  ${errors.join('\n  ')}`);

  const pass = await password();
  if (pass.length < MIN_PASSWORD) throw new Error(`Password curta: usa pelo menos ${MIN_PASSWORD} caracteres.`);

  const bundlePath = join(outDir, 'bundle.enc');
  const { key, salt, reused } = await keyFor(pass, bundlePath);
  const imgDir = join(outDir, 'img');
  await mkdir(imgDir, { recursive: true });

  // Encrypt every referenced image once; file name = hash of the plaintext so unchanged images keep their file.
  const tmp = await mkdtemp(join(tmpdir(), 'quiz-'));
  const written = new Map();
  try {
    for (const t of topics) {
      for (const p of t.perguntas) {
        if (!p.imagem) continue;
        if (!written.has(p.imagem)) {
          let img;
          try {
            img = readImage(p.imagem, tmp);
          } catch (e) {
            throw new Error(`${t.cadeira} / ${t.tema}: imagem "${p.imagem}" não encontrada (${e.stderr?.toString().trim() || e.message})`);
          }
          const name = `${createHash('sha256').update(img.bytes).digest('hex').slice(0, 20)}.enc`;
          if (!reused || !existsSync(join(imgDir, name))) await writeFile(join(imgDir, name), await seal(key, img.bytes));
          written.set(p.imagem, { src: `data/img/${name}`, type: img.type });
        }
        p.imagem = written.get(p.imagem);
      }
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
  const keep = new Set([...written.values()].map((v) => v.src.split('/').pop()));
  for (const f of await readdir(imgDir)) if (!keep.has(f)) await rm(join(imgDir, f));

  const data = bundle(topics, testes);
  await writeFile(bundlePath, JSON.stringify(await pack(key, salt, data)));

  const n = topics.reduce((s, t) => s + t.perguntas.length, 0);
  console.log(`${data.cadeiras.length} cadeira(s), ${topics.length} tema(s), ${n} pergunta(s), ${written.size} imagem(ns) -> ${relative(root, outDir)}`);
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
