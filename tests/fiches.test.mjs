// Fiches de révision : chaque point publié vient de la banque du jeu (qid existants, chiffres présents dans les faits cités).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { loadBanks, buildFiche } from '../tools/build-fiches.mjs';

const banks = loadBanks();
const files = readdirSync('content/fiches').filter(f => f.endsWith('.json'));

test('toutes les fiches sources sont valides', () => {
  assert.ok(files.length >= 20);
  for (const file of files) {
    const f = JSON.parse(readFileSync('content/fiches/' + file, 'utf8'));
    const { errors } = buildFiche(f, banks[f.id] || {});
    assert.deepEqual(errors, [], f.id);
  }
});

test('l’index publié correspond aux fiches publiées', () => {
  const idx = JSON.parse(readFileSync('public/fiches/index.json', 'utf8'));
  assert.equal(idx.fiches.length, files.length);
  for (const m of idx.fiches) {
    const f = JSON.parse(readFileSync(`public/fiches/${m.id}.json`, 'utf8'));
    assert.equal(f.stops.length, m.stops);
    assert.ok(f.oneLiner && f.mustKnow.length >= 3);
  }
});

test('un chiffre inventé est refusé', () => {
  const bank = { A: { text: 'נבנה בשנת 1187', src: 'x' } };
  const { errors } = buildFiche({ id: 't', title: 't', mustKnow: [1, 2, 3].map(() => ({ t: 'נבנה בשנת 1188', q: ['A'] })), stops: [{ name: 'n', points: [{ t: 'ok', q: ['A'] }] }] }, bank);
  assert.ok(errors.some(e => e.includes('1188')));
});
