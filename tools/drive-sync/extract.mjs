// Récupère le contenu d'un fichier du Drive sous une forme lisible par l'analyse :
//  { text } pour les documents textuels, { pdf: Buffer } pour les PDF (lus directement par Claude, y compris scannés),
//  { skip: raison } pour ce qui ne peut pas être analysé (audio sans transcription, images, formats inconnus).
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { parseDocx, unzip } from '../parse-ivrit-docx.mjs';

export const MAX_PDF_BYTES = 30 * 1024 * 1024;
export const sha256 = x => createHash('sha256').update(x).digest('hex');

const unent = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");

export function pptxText(buf) {
  const files = unzip(buf);
  return Object.keys(files).filter(k => /^ppt\/slides\/slide\d+\.xml$/.test(k))
    .sort((a, b) => +a.match(/(\d+)\.xml/)[1] - +b.match(/(\d+)\.xml/)[1])
    .map((k, i) => `— שקופית ${i + 1} —\n` + [...files[k].toString('utf8').matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m => unent(m[1])).join(' '))
    .join('\n\n');
}

export async function extract(drive, file, cls) {
  switch (cls.kind) {
    case 'gdoc': return { text: (await drive.exportAs(file.id, 'text/plain')).toString('utf8') };
    case 'gslides': return { text: (await drive.exportAs(file.id, 'text/plain')).toString('utf8') };
    case 'gsheet': return { text: (await drive.exportAs(file.id, 'text/csv')).toString('utf8') };
    case 'text': return { text: (await drive.download(file.id)).toString('utf8') };
    case 'docx': {
      const r = parseDocx(await drive.download(file.id));
      const text = r.paragraphs.map(p => (p.speaker ? p.speaker + ': ' : '') + p.text).join('\n');
      return { text, transcript: r.source === 'ivrit-mht' };
    }
    case 'pptx': return { text: pptxText(await drive.download(file.id)) };
    case 'pdf': {
      if (+file.size > MAX_PDF_BYTES) return { skip: 'pdf_too_large' };
      const pdf = await drive.download(file.id);
      // Texte de contrôle (pdftotext) : sert à VÉRIFIER les citations ; un PDF scanné n'en a pas → tout part en validation.
      return { pdf, text: pdfText(pdf), pdfOnly: true };
    }
    case 'media': return { skip: 'audio_without_transcript' };
    case 'image': return { skip: 'image' };
    default: return { skip: 'unsupported_format' };
  }
}

// Empreinte du CONTENU (et pas de la date) : un fichier ré-enregistré sans changement n'est pas réanalysé.
export function pdfText(buf) {
  try {
    const r = spawnSync('pdftotext', ['-layout', '-enc', 'UTF-8', '-', '-'], { input: buf, maxBuffer: 64 * 1024 * 1024 });
    return r.status === 0 ? r.stdout.toString('utf8') : '';
  } catch { return ''; }
}

export function contentHash(x) {
  if (x.pdf) return sha256(x.pdf);
  if (x.text != null) return sha256(x.text.replace(/\s+/g, ' ').trim());
  return null;
}
