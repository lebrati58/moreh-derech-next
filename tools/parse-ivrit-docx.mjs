// Lit une transcription ivrit.ai exportée en .docx (fichiers « 1.docx », « סטף 1.docx »… à côté des MP3 dans les dossiers הקלטות).
// Ces fichiers ne contiennent PAS de texte Word normal : le texte est dans word/afchunk.mht (HTML « altChunk »,
// quoted-printable), d'où le fait que l'aperçu Drive les montre vides. Lit aussi un .docx ordinaire (word/document.xml).
// Usage : node tools/parse-ivrit-docx.mjs fichier.docx [--json]
// Aucune dépendance : lecture ZIP + zlib de Node.
import { inflateRawSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';

export function unzip(buf) {
  const files = {};
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory');
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const off = buf.readUInt32LE(p + 42), name = buf.slice(p + 46, p + 46 + nlen).toString('utf8');
    const lnlen = buf.readUInt16LE(off + 26), lxlen = buf.readUInt16LE(off + 28);
    const data = buf.slice(off + 30 + lnlen + lxlen, off + 30 + lnlen + lxlen + csize);
    files[name] = method === 0 ? data : method === 8 ? inflateRawSync(data) : null;
    p += 46 + nlen + xlen + clen;
  }
  return files;
}

function decodeQP(s) {
  const bytes = [];
  const t = s.replace(/=\r?\n/g, '');
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '=' && /^[0-9A-F]{2}$/i.test(t.slice(i + 1, i + 3))) { bytes.push(parseInt(t.slice(i + 1, i + 3), 16)); i += 2; }
    else bytes.push(t.charCodeAt(i) & 0xff); // chaîne lue en latin1 : un caractère = un octet
  }
  return Buffer.from(bytes).toString('utf8');
}
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const unent = s => s.replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e] ?? m));
const text = s => unent(s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ').trim();

// Renvoie { source: 'ivrit-mht' | 'word', paragraphs: [{ speaker, text }], note }
export function parseDocx(buf) {
  const files = unzip(buf);
  const mht = Object.keys(files).find(k => /afchunk\.mht$/i.test(k));
  if (mht) {
    const raw = files[mht].toString('latin1');
    const part = raw.split(/------=[^\n]*\n/).find(x => /Content-Type:\s*text\/html/i.test(x)) || raw;
    const body = part.split(/\r?\n\r?\n/).slice(1).join('\n\n');
    const html = /quoted-printable/i.test(part) ? decodeQP(body) : Buffer.from(body, 'latin1').toString('utf8');
    const paragraphs = [];
    let note = null;
    for (const m of html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
      const inner = m[1];
      const sp = /<span[^>]*>([^<]*?):\s*<\/span>/i.exec(inner);
      const t = text(sp ? inner.replace(sp[0], '') : inner);
      if (!t) continue;
      if (/ivrit\.ai/i.test(t)) { note = t; continue; }
      paragraphs.push({ speaker: sp ? text(sp[1]) : null, text: t });
    }
    return { source: 'ivrit-mht', paragraphs, note };
  }
  const doc = files['word/document.xml'];
  if (!doc) throw new Error('no word/document.xml');
  const xml = doc.toString('utf8');
  const paragraphs = [];
  for (const m of xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)) {
    const t = unent([...m[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(x => x[1]).join('')).trim();
    if (t) paragraphs.push({ speaker: null, text: t });
  }
  return { source: 'word', paragraphs, note: null };
}

// Le locuteur qui parle le plus est, en pratique, le guide (le prof).
export function mainSpeaker(paragraphs) {
  const n = {};
  paragraphs.forEach(p => { if (p.speaker) n[p.speaker] = (n[p.speaker] || 0) + p.text.length; });
  return Object.entries(n).sort((a, b) => b[1] - a[1]).map(x => x[0])[0] || null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node tools/parse-ivrit-docx.mjs fichier.docx [--json]'); process.exit(2); }
  const r = parseDocx(await readFile(file));
  if (process.argv.includes('--json')) console.log(JSON.stringify(Object.assign(r, { mainSpeaker: mainSpeaker(r.paragraphs) }), null, 1));
  else console.log(r.paragraphs.map(p => (p.speaker ? p.speaker + ': ' : '') + p.text).join('\n\n'));
}
