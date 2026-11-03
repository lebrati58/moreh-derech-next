// Correction par Claude : logique du serveur (worker/grader.mjs) sans réseau — prompt construit à partir du cours,
// garde-fous d'entrée, nettoyage de la sortie. L'appel réel à l'API n'est pas testé ici (secret côté serveur).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPrompt, sanitize, validateRequest, SCHEMA, MODEL } from '../worker/grader.mjs';
const D = JSON.parse(readFileSync(new URL('../public/exam/golan-south.json', import.meta.url)));
const M = JSON.parse(readFileSync(new URL('../public/exam/models.json', import.meta.url))).models.school5;

test('prompt : règles du cours (180/20/400), faits du site avec sources, texte de l’élève', () => {
  const site = D.sites.find(s => s.id === 'ein_keshatot');
  const p = buildPrompt({ unit: { kind: 'short', text: 'אנחנו בעין קשתות. '.repeat(10), place: 'ברחבה', minutes: 10, method: 'תמונות' }, site, model: M, mission: D.missions[0], slot: D.missions[0].slots[1] });
  assert.ok(/עד 180 מילים/.test(p.system) && /עד 20 מילים/.test(p.system) && /עד 400 מילים/.test(p.system), 'limites remplacées');
  assert.ok(!/\{\w+\}/.test(p.system), 'aucun espace réservé oublié');
  assert.ok(/749/.test(p.user) && /\[מקור: ek\]/.test(p.user), 'faits sourcés du site');
  assert.ok(/אל תמציא/.test(p.system) && /facts_to_verify/.test(p.system), 'interdiction d’inventer, inconnu → à vérifier');
  assert.ok(/מתוך 8/.test(p.user), 'courte : sur 8');
  assert.ok(buildPrompt({ unit: { kind: 'long', text: 'x' }, site: null, model: M }).user.includes('מתוך 15'), 'développée : sur 15');
});

test('garde-fous : trop court, trop long, mauvais type', () => {
  assert.equal(validateRequest(null), 'bad_request');
  assert.equal(validateRequest({ unit: { kind: 'x', text: 'a '.repeat(30) } }), 'bad_kind');
  assert.equal(validateRequest({ unit: { kind: 'short', text: 'קצר' } }), 'too_short');
  assert.equal(validateRequest({ unit: { kind: 'long', text: 'מילה '.repeat(1000) } }), 'too_long');
  assert.equal(validateRequest({ unit: { kind: 'short', text: 'מילה '.repeat(100) } }), null);
});

test('sortie : bornée, catégories connues, longueur recomptée, toujours « indicatif »', () => {
  const r = sanitize({ score: 99, summary: 'x'.repeat(2000), strengths: ['a'], issues: [{ cat: 'nope', he: 'b', fix: 'c' }, { cat: 'facts', he: 'd', fix: 'e' }], facts_to_verify: ['f'], corrected_text: 'א ב ג ד', corrected_words: 1 }, true);
  assert.equal(r.score, 15); assert.equal(r.max, 15); assert.equal(r.summary.length, 600);
  assert.deepEqual(r.issues.map(i => i.cat), ['structure', 'facts']);
  assert.equal(r.corrected_words, 4); assert.ok(r.indicative); assert.equal(r.model, MODEL);
  assert.throws(() => sanitize(null));
  assert.ok(SCHEMA.required.includes('corrected_text') && SCHEMA.additionalProperties === false);
});
