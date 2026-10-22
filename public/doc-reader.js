// Lecture d'un document dans le NAVIGATEUR (rien n'est envoyé) : Word (.docx), PDF, texte.
//  * .docx = une archive ZIP ; on ouvre word/document.xml avec le décompresseur natif du navigateur
//    (DecompressionStream) : aucune bibliothèque.
//  * PDF : pdf.js (Mozilla, Apache-2.0) embarqué dans vendor/pdfjs, chargé seulement si besoin.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MDL_DOC = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const MAX = 15 * 1024 * 1024;

  async function unzipEntry(buf, name) {
    const dv = new DataView(buf), dec = new TextDecoder();
    let e = buf.byteLength - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('bad_file');
    const n = dv.getUint16(e + 10, true);
    let p = dv.getUint32(e + 16, true);
    for (let i = 0; i < n; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const lho = dv.getUint32(p + 42, true);
      if (dec.decode(new Uint8Array(buf, p + 46, nlen)) === name) {
        const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
        const data = new Uint8Array(buf, start, csize);
        if (method === 0) return data;
        if (method !== 8) throw new Error('bad_file');
        const out = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
        return new Uint8Array(out);
      }
      p += 46 + nlen + xlen + clen;
    }
    throw new Error('bad_file');
  }
  const unxml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, '&');
  // un paragraphe Word = une ligne ; tabulations et sauts de ligne gardés comme espaces / retours
  function docxText(xml) {
    return xml.split(/<\/w:p>/).map(par => par.replace(/<w:tab\/>/g, ' ').replace(/<w:br[^>]*\/>/g, '\n')
      .replace(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<[^>]+>/g, (m, t) => t != null ? unxml(t) : ''))
      .map(l => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n');
  }
  async function readDocx(buf) { return docxText(new TextDecoder().decode(await unzipEntry(buf, 'word/document.xml'))); }

  function loadScript(src) {
    return new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ko(new Error('pdf_lib')); document.head.appendChild(s); });
  }
  async function readPdf(buf, base) {
    if (!self.pdfjsLib) await loadScript(base + 'vendor/pdfjs/pdf.min.js');
    self.pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'vendor/pdfjs/pdf.worker.min.js';
    const doc = await self.pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    const out = [];
    for (let i = 1; i <= Math.min(doc.numPages, 80); i++) {
      const tc = await (await doc.getPage(i)).getTextContent();
      out.push(tc.items.map(it => it.str + (it.hasEOL ? '\n' : ' ')).join(''));
    }
    return out.join('\n').replace(/[ \t]+/g, ' ').trim();
  }

  // file : un File du navigateur. Renvoie le texte brut.
  async function readFile(file, base) {
    if (!file) throw new Error('no_file');
    if (file.size > MAX) throw new Error('too_big');
    const ext = (/\.([a-z0-9]+)$/i.exec(file.name || '') || [])[1] || '';
    const buf = await file.arrayBuffer();
    let text;
    if (/^docx$/i.test(ext)) text = await readDocx(buf);
    else if (/^pdf$/i.test(ext)) text = await readPdf(buf, base || '');
    else if (/^(txt|md)$/i.test(ext)) text = new TextDecoder().decode(buf);
    else if (/^doc$/i.test(ext)) throw new Error('old_doc');
    else throw new Error('bad_type');
    text = String(text || '').trim();
    if (text.length < 40) throw new Error('empty');
    return text;
  }
  return { readFile, readDocx, docxText, unzipEntry };
});
