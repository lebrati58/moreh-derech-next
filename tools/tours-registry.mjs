// Registre des סיורים : détecte les nouveaux dossiers du Drive et affiche l'état de chaque parcours.
// Entrée : la liste des sous-dossiers de « 2. סיורים » telle que renvoyée par la recherche Drive
// (JSON { files: [{ id, title, mimeType }] } ou tableau), enregistrée dans un fichier.
// Usage : node tools/tours-registry.mjs                       → tableau des statuts
//         node tools/tours-registry.mjs drive-folders.json    → ajoute les nouveaux dossiers au statut « a_importer »
// Ce script ne fait JAMAIS passer un parcours à « pret » : seul un humain le fait, dans le fichier source.
import { readFile, writeFile } from 'node:fs/promises';
const ROOT = new URL('..', import.meta.url);
const path = new URL('content/tours/registry.json', ROOT);
const reg = JSON.parse(await readFile(path, 'utf8'));

export function mergeFolders(registry, files, today) {
  const known = new Set(registry.tours.map(t => (t.folder || '').split('/').pop()));
  const added = [];
  for (const f of files) {
    if (f.mimeType && f.mimeType !== 'application/vnd.google-apps.folder') continue;
    if (known.has(f.id)) continue;
    const m = /סיור\s*(\d{1,2})\s*[-–—]?\s*(.*)$/.exec(f.title || '');
    const id = m ? String(+m[1]).padStart(2, '0') : null;
    if (!id || registry.tours.some(t => t.id === id)) { added.push({ id: null, title: f.title, skipped: 'numéro absent ou déjà utilisé' }); continue; }
    const t = { id, title: (m[2] || '').trim() || f.title, folder: 'https://drive.google.com/drive/folders/' + f.id, status: 'a_importer',
      statusNote: `Nouveau dossier détecté le ${today}. À inventorier (enregistrements, transcriptions, documents).`, recordings: null, transcripts: [], source: null };
    registry.tours.push(t); added.push(t);
  }
  registry.tours.sort((a, b) => (a.id === 'road67' ? -1 : b.id === 'road67' ? 1 : a.id.localeCompare(b.id)));
  return added;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = process.argv[2];
  if (input) {
    const raw = JSON.parse(await readFile(input, 'utf8'));
    const added = mergeFolders(reg, Array.isArray(raw) ? raw : raw.files || [], new Date().toISOString().slice(0, 10));
    added.forEach(a => console.log(a.id ? `➕ ${a.id} ${a.title} → a_importer` : `⏭️ ignoré : ${a.title} (${a.skipped})`));
    if (added.some(a => a.id)) { reg.asOf = new Date().toISOString().slice(0, 10); await writeFile(path, JSON.stringify(reg, null, 1) + '\n'); }
  }
  const L = { a_importer: '📥 à importer', en_analyse: '🔎 en cours d’analyse', a_verifier: '🧪 à vérifier', pret: '✅ prêt' };
  for (const t of reg.tours) {
    const kinds = {}; (t.transcripts || []).forEach(x => { kinds[x.kind] = (kinds[x.kind] || 0) + 1; });
    console.log(`${t.id.padEnd(6)} ${L[t.status].padEnd(22)} ${String(t.recordings ? t.recordings.audioFiles : '-').padStart(3)} audio  ${Object.entries(kinds).map(([k, n]) => n + '×' + k).join(', ').padEnd(40)} ${t.title}`);
  }
}
