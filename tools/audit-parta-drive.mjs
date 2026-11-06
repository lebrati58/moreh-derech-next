// Verify source excerpts against a freshly fetched, private Drive corpus.
// Corpus files: <key>.txt, keys/Drive IDs in content/parta/review/drive-sources-20261106.json.
// Never publish full course documents or silently substitute web references.
// Usage: node tools/audit-parta-drive.mjs /absolute/path/to/source-texts
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const root = new URL('../', import.meta.url);
const bank = JSON.parse(await readFile(new URL('public/parta/bank.json', root), 'utf8'));
const meta = JSON.parse(await readFile(new URL('content/parta/review/drive-sources-20261106.json', root), 'utf8'));
if (!process.argv[2]) throw new Error('Provide the directory of freshly fetched Drive source texts.');
const normalize = s => s.replace(/\s+/g, ' ').trim();
const corpus = new Map();
for (const [key, item] of Object.entries(meta)) {
  const text = normalize(await readFile(resolve(process.argv[2], key + '.txt'), 'utf8'));
  corpus.set(item.id, { text, digest: createHash('sha256').update(text).digest('hex') });
}
const errors = [];
for (const q of bank.questions) {
  const s = q.source, doc = corpus.get(s.driveFileId);
  if (!doc) { errors.push(`${q.id}: missing Drive source`); continue; }
  if (doc.digest !== s.sourceDigest) errors.push(`${q.id}: source changed; reread before reapproving`);
  if (!doc.text.includes(s.quote) || !s.quote.includes(s.anchor)) errors.push(`${q.id}: excerpt not found verbatim`);
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`${bank.questions.length} exact excerpts verified against ${new Set(bank.questions.map(q => q.source.driveFileId)).size} Drive documents. This verifies provenance; human review is still required for meaning and distractors.`);
