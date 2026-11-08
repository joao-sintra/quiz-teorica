import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encrypt, decrypt } from '../docs/crypto.js';
import { validate, bundle } from './build.mjs';

const good = {
  cadeira: 'X',
  tema: 'T',
  perguntas: [{ q: 'Q?', opcoes: ['a', 'b'], certa: 1, explicacao: 'porque b', fonte: 'slide 1' }],
};

test('encrypt/decrypt roundtrip, wrong password rejected', async () => {
  const box = await encrypt({ ok: 'olá' }, 'password-certa-123');
  assert.deepEqual(await decrypt(box, 'password-certa-123'), { ok: 'olá' });
  await assert.rejects(decrypt(box, 'password-errada-123'), { name: 'OperationError' });
  assert.ok(!JSON.stringify(box).includes('olá'));
});

test('validate accepts a good topic and catches bad questions', () => {
  assert.deepEqual(validate(good), []);
  const bad = { ...good, perguntas: [{ q: 'Q?', opcoes: ['a', 'a'], certa: 2, explicacao: '', fonte: 'x' }] };
  const errs = validate(bad).join('\n');
  assert.match(errs, /opções repetidas/);
  assert.match(errs, /"certa" fora/);
  assert.match(errs, /explicacao/);
  assert.notDeepEqual(validate({ cadeira: 'X', tema: 'T', perguntas: [] }), []);
});

test('bundle groups topics by subject', () => {
  const b = bundle([good, { ...good, tema: 'A' }, { ...good, cadeira: 'Y' }]);
  assert.deepEqual(b.cadeiras.map((c) => c.nome), ['X', 'Y']);
  assert.deepEqual(b.cadeiras[0].temas.map((t) => t.nome), ['A', 'T']);
});
