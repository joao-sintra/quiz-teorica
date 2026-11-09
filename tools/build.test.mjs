import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveKey, seal, open, pack, decrypt, newSalt } from '../docs/crypto.js';
import { validate, validateTestes, bundle, slideSpec } from './build.mjs';
import { pagesToMarkdown, figurePagesFrom } from './pdf2md.mjs';
import { parseSelection, settingsSource } from './testes.mjs';

const good = {
  cadeira: 'X',
  tema: 'T',
  perguntas: [{ q: 'Q?', opcoes: ['a', 'b'], certa: 1, explicacao: 'porque b', fonte: 'slide 1' }],
};

test('bundle + image roundtrip with one key, wrong password rejected', async () => {
  const salt = newSalt();
  const key = await deriveKey('password-certa-123', salt);
  const box = await pack(key, salt, { ok: 'olá' });
  const img = await seal(key, new Uint8Array([1, 2, 3]));

  const back = await decrypt(box, 'password-certa-123');
  assert.deepEqual(back.value, { ok: 'olá' });
  assert.deepEqual([...await open(back.key, img)], [1, 2, 3]);
  await assert.rejects(decrypt(box, 'password-errada-123'), { name: 'OperationError' });
  assert.ok(!JSON.stringify(box).includes('olá'));
});

test('validate accepts a good topic and catches bad questions', () => {
  assert.deepEqual(validate(good), []);
  const bad = { ...good, perguntas: [{ q: 'Q?', opcoes: ['a', 'a'], certa: 2, explicacao: '', fonte: 'x', imagem: 'x.bmp' }] };
  const errs = validate(bad).join('\n');
  assert.match(errs, /opções repetidas/);
  assert.match(errs, /"certa" fora/);
  assert.match(errs, /explicacao/);
  assert.match(errs, /"imagem" tem de ser/);
  assert.match(errs, /imagemAlt/);
  const withImg = { ...good, perguntas: [{ ...good.perguntas[0], imagem: 'X/Doc 1.pdf#3', imagemAlt: 'diagrama' }] };
  assert.deepEqual(validate(withImg), []);
  assert.notDeepEqual(validate({ cadeira: 'X', tema: 'T', perguntas: [] }), []);
});

test('settings testes validation and mapping into the bundle', () => {
  assert.deepEqual(validateTestes({ X: { 1: ['D1'], 2: ['D2', 'D1'] } }), []);
  assert.notDeepEqual(validateTestes({ X: { um: 'D1' } }), []);
  assert.notDeepEqual(validateTestes([]), []);

  const b = bundle(
    [{ ...good, tema: 'Z', documento: 'D10' }, { ...good, tema: 'A', documento: 'D2' }, { ...good, tema: 'B', documento: 'D1' }, { ...good, cadeira: 'W' }],
    { X: { 1: ['D1', 'D2'], 2: ['D2', 'D10'] } },
  );
  assert.deepEqual(b.cadeiras.map((c) => c.nome), ['W', 'X']);
  const x = b.cadeiras[1].temas;
  assert.deepEqual(x.map((t) => t.nome), ['B', 'A', 'Z']); // course order by document, numeric-aware
  assert.deepEqual(x.map((t) => t.testes), [[1], [1, 2], [2]]);
  assert.deepEqual(b.cadeiras[0].temas[0].testes, []);
});

test('pdf2md drops repeated headers and marks figure pages', () => {
  const pages = Array.from({ length: 6 }, (_, i) => `Curso XPTO\nSlide texto ${i}\n•\n${i + 1}`);
  const md = pagesToMarkdown('Doc', pages, new Set([2]));
  assert.ok(!md.includes('Curso XPTO'));
  assert.ok(!/^•$/m.test(md));
  assert.match(md, /## p\. 2\nSlide texto 1\n_\[figura\]_/);

  const listing = 'page num type width height color comp bpc enc interp object ID x-ppi y-ppi size ratio\n----\n'
    + '1 0 image 166 127 rgb 3 8 image no 15 0 199 199 2K 4%\n2 1 image 166 127 rgb 3 8 image no 15 0 199 199 2K 4%\n'
    + '3 2 image 800 600 rgb 3 8 image no 40 0 199 199 90K 4%\n4 3 image 40 40 rgb 3 8 image no 41 0 199 199 1K 4%';
  assert.deepEqual([...figurePagesFrom(listing)], [3]);
});

test('test picker parses selections and writes importable settings', async () => {
  assert.deepEqual(parseSelection('1-3, 5', 6), [1, 2, 3, 5]);
  assert.deepEqual(parseSelection('2,2', 3), [2]);
  assert.equal(parseSelection('0-2', 3), null);
  assert.equal(parseSelection('4', 3), null);
  assert.equal(parseSelection('a', 3), null);
  const src = settingsSource({ testes: { SAD: { 1: ['1. Introdução'], 2: [] } } });
  const mod = await import(`data:text/javascript,${encodeURIComponent(src)}`);
  assert.deepEqual(mod.default.testes.SAD['1'], ['1. Introdução']);
});

test('certa accepts a single index or 2+ distinct indexes', () => {
  const q = (certa) => ({ ...good, perguntas: [{ ...good.perguntas[0], opcoes: ['a', 'b', 'c'], certa }] });
  assert.deepEqual(validate(q(2)), []);
  assert.deepEqual(validate(q([0, 2])), []);
  for (const bad of [3, [0], [1, 1], [0, 3], 'a']) assert.match(validate(q(bad)).join(), /"certa"/);
});

test('slideSpec derives the cited page from fonte', () => {
  const t = { cadeira: 'SAD', documento: 'Doc 1' };
  assert.equal(slideSpec(t, { fonte: 'Doc 1, p. 12' }), 'SAD/Doc 1.pdf#12');
  assert.equal(slideSpec(t, { fonte: 'Doc 1, p. 25-26' }), 'SAD/Doc 1.pdf#25');
  assert.equal(slideSpec(t, { fonte: 'RFC 9110, secção 3' }), null);
  assert.equal(slideSpec({ cadeira: 'SAD' }, { fonte: 'x, p. 3' }), null);
});
