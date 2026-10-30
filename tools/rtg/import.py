# ספריית רט״ג — import relançable (GitHub Actions).
#  1. liste le dossier Drive partagé par lien ; télécharge les PDF de la racine ;
#  2. télécharge les 14 ZIP numérotés et n'en garde que les PDF ABSENTS (empreinte SHA-256) ;
#     RTG_10_Guides.zip : téléchargé seulement pour vérifier qu'il est inclus dans le corpus (rien n'est importé) ;
#  3. lit le manifeste / l'inventaire (URL officielles, titres, classifications automatiques à vérifier) ;
#  4. extrait le texte PAGE PAR PAGE (PyMuPDF), corrige l'hébreu inversé, détecte les pages sans texte → OCR hébreu
#     (Tesseract heb+eng), mesure la qualité ;
#  5. écrit content/rtg/inventory.json (métadonnées seulement — dépôt public) et, hors dépôt, rtg-text/<id>.json.gz
#     (texte par page, artefact privé de l'exécution). Les corrections manuelles (content/rtg/corrections.json)
#     ne sont jamais écrasées. Un document déjà traité (même empreinte, même version d'outil) n'est pas refait.
import concurrent.futures as cf, csv, gzip, hashlib, io, json, os, re, subprocess, sys, time, unicodedata, urllib.request, zipfile

ROOT_ID = os.environ.get('RTG_FOLDER', '1HW01dalAwBqkkoBXmVgihraY_Vup6cuM')
TOOL_VERSION = 3   # 3 : texte remis en ordre logique (hébreu visuel)
OUT = 'content/rtg'
WORK = os.environ.get('RTG_WORK', '/tmp/rtg')
TEXT = os.environ.get('RTG_TEXT', 'rtg-text')
OCR_MAX_PAGES = int(os.environ.get('RTG_OCR_MAX', '2500'))
os.makedirs(WORK, exist_ok=True); os.makedirs(TEXT, exist_ok=True); os.makedirs(OUT, exist_ok=True)
sys.path.insert(0, os.path.dirname(__file__))
from list_drive import listing_all  # noqa

def log(*a): print(*a, flush=True)
def dl(fid, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 0: return dest
    url = f'https://drive.usercontent.google.com/download?id={fid}&export=download&confirm=t'
    for k in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 MorehDerechNext'})
            with urllib.request.urlopen(req, timeout=300) as r, open(dest + '.part', 'wb') as f:
                while True:
                    b = r.read(1 << 20)
                    if not b: break
                    f.write(b)
            with open(dest + '.part', 'rb') as f:
                head = f.read(1024)
            if dest.endswith('.pdf') and b'%PDF' not in head: raise IOError('pas un PDF (page HTML ?)')
            if dest.endswith('.zip') and not head.startswith(b'PK'): raise IOError('pas un ZIP (page HTML ?)')
            os.replace(dest + '.part', dest); return dest
        except Exception as e:
            log('  retry', fid, e); time.sleep(3 + 5 * k)
    raise IOError('échec ' + fid)
sha = lambda b: hashlib.sha256(b).hexdigest()

# ---------- 1. listing ----------
L = listing_all(ROOT_ID)
files = [x for x in L if not x['folder']]
root_pdfs = [x for x in files if x['path'] == '' and x['name'].lower().endswith('.pdf')]
zips = sorted([x for x in files if re.match(r'RTG_Partie_\d+_sur_\d+\.zip$', x['name'])], key=lambda x: x['name'])
guides_zip = next((x for x in files if x['name'] == 'RTG_10_Guides.zip'), None)
meta_files = {x['name']: x for x in files if x['path'] == '' and x['name'].lower().endswith(('.json', '.csv', '.xlsx', '.txt'))}
log(f'listing: {len(files)} fichiers, {len(root_pdfs)} PDF racine, {len(zips)} ZIP numérotés')

# ---------- 2. documents ----------
docs = {}       # sha -> doc
events = {'root_downloaded': 0, 'root_failed': [], 'root_dup': 0, 'zip_pdfs': 0, 'zip_added': 0, 'zip_dup': 0, 'zip_failed': [], 'guides_in_corpus': None, 'guides_missing': []}
def add_doc(data, name, source, drive_id=None, path=''):
    h = sha(data)
    if h in docs:
        docs[h]['copies'].append({'name': name, 'source': source, 'path': path}); return False
    fn = os.path.join(WORK, 'pdf', h[:16] + '.pdf'); os.makedirs(os.path.dirname(fn), exist_ok=True)
    if not os.path.exists(fn): open(fn, 'wb').write(data)
    docs[h] = {'sha256': h, 'id': h[:12], 'fileName': name, 'source': source, 'driveId': drive_id, 'zipPath': path, 'copies': [], 'file': fn}
    return True
os.makedirs(os.path.join(WORK, 'dl'), exist_ok=True)
def get_root(x):
    try: return x, open(dl(x['id'], os.path.join(WORK, 'dl', x['id'] + '.pdf')), 'rb').read()
    except Exception as e: return x, e
with cf.ThreadPoolExecutor(8) as ex:
    for x, data in ex.map(get_root, root_pdfs):
        if isinstance(data, Exception): events['root_failed'].append({'name': x['name'], 'error': str(data)}); continue
        events['root_downloaded'] += 1
        if not add_doc(data, x['name'], 'drive', x['id']): events['root_dup'] += 1
for z in zips:
    try:
        p = dl(z['id'], os.path.join(WORK, 'dl', z['name']))
        with zipfile.ZipFile(p) as zf:
            for info in zf.infolist():
                if info.is_dir() or not info.filename.lower().endswith('.pdf'): continue
                data = zf.read(info); events['zip_pdfs'] += 1
                if add_doc(data, os.path.basename(info.filename), 'zip:' + z['name'], None, info.filename): events['zip_added'] += 1
                else: events['zip_dup'] += 1
        os.remove(p)
    except Exception as e:
        events['zip_failed'].append({'name': z['name'], 'error': str(e)})
if guides_zip:
    try:
        p = dl(guides_zip['id'], os.path.join(WORK, 'dl', guides_zip['name'])); n = 0
        with zipfile.ZipFile(p) as zf:
            for info in zf.infolist():
                if info.filename.lower().endswith('.pdf'):
                    n += 1; h = sha(zf.read(info))
                    if h not in docs: events['guides_missing'].append(info.filename)
        events['guides_in_corpus'] = n - len(events['guides_missing']); events['guides_total'] = n
        os.remove(p)
    except Exception as e: events['guides_error'] = str(e)
log('documents uniques:', len(docs), json.dumps({k: v for k, v in events.items() if not isinstance(v, list)}))

# ---------- 3. manifeste / inventaire (métadonnées officielles, classifications AUTOMATIQUES) ----------
manifest, inventory_rows = None, []
for name in ('Moreh_Derech_manifest.json', 'Inventaire.csv'):
    if name in meta_files:
        try: dl(meta_files[name]['id'], os.path.join(WORK, name))
        except Exception as e: log('meta', name, e)
try: manifest = json.load(open(os.path.join(WORK, 'Moreh_Derech_manifest.json'), encoding='utf-8'))
except Exception as e: log('manifest illisible', e)
try:
    with open(os.path.join(WORK, 'Inventaire.csv'), encoding='utf-8-sig') as f: inventory_rows = list(csv.DictReader(f))
except Exception as e: log('inventaire illisible', e)
def manifest_records(m):
    if isinstance(m, list): return m
    if isinstance(m, dict):
        for k in ('documents', 'docs', 'items', 'files', 'records'):
            if isinstance(m.get(k), list): return m[k]
        vals = [v for v in m.values() if isinstance(v, list) and v and isinstance(v[0], dict)]
        if vals: return max(vals, key=len)
    return []
recs = manifest_records(manifest) + inventory_rows
schema = sorted({k for r in recs[:50] for k in r.keys()}) if recs else []
log('schéma manifeste/inventaire:', schema)
def norm(s): return re.sub(r'\s+', ' ', unicodedata.normalize('NFC', str(s or ''))).strip().lower()
by_sha, by_name = {}, {}
for r in recs:
    for k, v in r.items():
        lk = k.lower()
        if isinstance(v, str) and re.fullmatch(r'[0-9a-f]{64}', v.strip().lower()): by_sha.setdefault(v.strip().lower(), []).append(r)
        if isinstance(v, str) and ('file' in lk or 'nom' in lk or 'name' in lk or 'fichier' in lk) and v.lower().endswith('.pdf'):
            by_name.setdefault(norm(os.path.basename(v)), []).append(r)
def pick(rows, *keys):
    for r in rows:
        for k in r:
            if any(x in k.lower() for x in keys) and r[k] not in (None, '', []): return r[k]
    return None
for d in docs.values():
    rows = by_sha.get(d['sha256'], []) + by_name.get(norm(d['fileName']), []) + [r for c in d['copies'] for r in by_name.get(norm(c['name']), [])]
    d['catalog'] = {
        'matched': bool(rows),
        'title': pick(rows, 'title_he', 'titre', 'title', 'כותרת'),
        'site': pick(rows, 'site', 'אתר'),
        'subject': pick(rows, 'subject', 'sujet', 'נושא'),
        'sections': pick(rows, 'sections'),
        'manifestId': pick(rows, 'document_id'),
        'url': pick(rows, 'pdf_url', 'url', 'lien', 'link', 'קישור'),
        'page': pick(rows, 'page_source', 'source_page', 'page source', 'referer', 'עמוד'),
        'regionAuto': pick(rows, 'région', 'region', 'אזור'),
        'periodsAuto': pick(rows, 'period_keywords', 'période', 'periode', 'period', 'תקופ'),
        'typeAuto': pick(rows, 'type', 'catégorie', 'category', 'סוג'),
        'langAuto': pick(rows, 'langue', 'language', 'lang', 'שפה'),
    }

# ---------- 4. texte page par page + OCR ----------
import fitz  # PyMuPDF
HEB = re.compile(r'[֐-׿]'); LAT = re.compile(r'[A-Za-z]'); ARA = re.compile(r'[؀-ۿ]'); CYR = re.compile(r'[Ѐ-ӿ]')
FINALS = set('ךםןףץ')
def fix_reversed(t):
    # hébreu en ordre visuel (lettres finales en début de mot) → on inverse chaque ligne
    words = re.findall(r'[א-ת]{2,}', t)
    if len(words) < 8: return t, False
    start = sum(w[0] in FINALS for w in words); end = sum(w[-1] in FINALS for w in words)
    if start > end * 2 and start >= 3:
        return '\n'.join(l[::-1] for l in t.split('\n')), True
    return t, False
def lang_of(t):
    c = {'he': len(HEB.findall(t)), 'en': len(LAT.findall(t)), 'ar': len(ARA.findall(t)), 'ru': len(CYR.findall(t))}
    tot = sum(c.values())
    if not tot: return None
    best = max(c, key=c.get)
    return best if c[best] / tot > 0.6 else 'mixed'
def quality(t):
    letters = len(HEB.findall(t)) + len(LAT.findall(t)) + len(ARA.findall(t)) + len(CYR.findall(t))
    if not t.strip(): return 0.0
    words = re.findall(r'\S+', t)
    good = sum(1 for w in words if 2 <= len(w) <= 18)
    return round(min(1.0, (letters / max(1, len(t))) * 1.4) * (good / max(1, len(words))), 2)
# Hébreu en ordre VISUEL (mots inversés, ponctuation en tête) — fréquent dans ces PDF → ordre logique, une fois par document.
def to_logical(pages):
    allt = '\n'.join(p['text'] for p in pages)
    toks = re.findall(r'\S+', allt)
    lead = sum(1 for t in toks if re.match(r'^[.,:;!?)\]]+[\u05D0-\u05EA]', t))
    trail = sum(1 for t in toks if re.search(r'[\u05D0-\u05EA][.,:;!?(\[]+$', t))
    vis = lead > trail * 1.5 and lead >= 10
    def fix_line(l):
        cols = [c.strip() for c in re.split(r'\s{3,}', l.strip()) if c.strip()]
        out = []
        for c in reversed(cols):
            tk = c.split()
            if sum(bool(HEB.search(t)) for t in tk) >= max(1, len(tk) // 2):
                tk = [re.sub(r'^([.,:;!?)\]]+)(.*)$', lambda m: m.group(2) + m.group(1).replace(')', '(').replace(']', '['), t) for t in reversed(tk)]
            out.append(' '.join(tk))
        return '   '.join(out)
    for p in pages:
        if p.get('src') == 'ocr': continue   # l'OCR (Tesseract) rend déjà l'ordre logique
        lines = [l for l in p['text'].split('\n') if l.strip()]
        p['text'] = '\n'.join(fix_line(l) if vis else re.sub(r'\s{3,}', '   ', l.strip()) for l in lines)
    return vis
prev = {}
try: prev = {d['sha256']: d for d in json.load(open(os.path.join(OUT, 'inventory.json'), encoding='utf-8'))['documents']}
except Exception: pass
ocr_budget = OCR_MAX_PAGES
def ocr_page(page):
    pix = page.get_pixmap(dpi=200)
    img = os.path.join(WORK, 'ocr.png'); pix.save(img)
    r = subprocess.run(['tesseract', img, '-', '-l', 'heb+eng', '--psm', '3'], capture_output=True, text=True, timeout=180)
    return r.stdout
for i, d in enumerate(sorted(docs.values(), key=lambda x: x['sha256'])):
    p = prev.get(d['sha256'])
    tf = os.path.join(TEXT, d['id'] + '.json.gz')
    if p and p.get('toolVersion') in (2, TOOL_VERSION) and p.get('status') in ('text', 'ocr') and os.path.exists(tf):
        d.update({k: p[k] for k in ('pages', 'lang', 'status', 'textPages', 'ocrPages', 'emptyPages', 'reversedPages', 'quality', 'pdfTitle', 'visualOrder') if k in p})
        J = json.load(gzip.open(tf, 'rt', encoding='utf-8'))
        if not J.get('logical'):
            d['visualOrder'] = to_logical(J['pages']); J['logical'] = True
            with gzip.open(tf, 'wt', encoding='utf-8') as f: json.dump(J, f, ensure_ascii=False)
        d['toolVersion'] = TOOL_VERSION; continue
    try:
        doc = fitz.open(d['file'])
        d['pages'] = doc.page_count; d['pdfTitle'] = (doc.metadata or {}).get('title') or None
        pages, ocrp, empty, rev = [], 0, 0, 0
        for pg in doc:
            t = pg.get_text('text', sort=True)
            t, r = fix_reversed(t); rev += r
            src = 'text'
            if len(t.strip()) < 40:
                if ocr_budget > 0 and (pg.get_images() or len(t.strip()) == 0):
                    try: t = ocr_page(pg); src = 'ocr'; ocrp += 1; ocr_budget -= 1
                    except Exception as e: src = 'ocr_failed'
                else: src = 'empty'
            if not t.strip(): empty += 1
            pages.append({'n': pg.number + 1, 'src': src, 'q': quality(t), 'text': t.strip()})
        alltext = '\n'.join(p['text'] for p in pages)
        d['lang'] = lang_of(alltext); d['textPages'] = sum(p['src'] == 'text' for p in pages); d['ocrPages'] = ocrp
        d['emptyPages'] = empty; d['reversedPages'] = rev
        d['quality'] = round(sum(p['q'] for p in pages) / max(1, len(pages)), 2)
        d['status'] = 'ocr' if ocrp else ('text' if d['textPages'] else 'needs_ocr')
        if d['status'] != 'needs_ocr' and empty > len(pages) / 2: d['status'] = 'partial'
        d['visualOrder'] = to_logical(pages)
        with gzip.open(tf, 'wt', encoding='utf-8') as f: json.dump({'id': d['id'], 'sha256': d['sha256'], 'pages': pages, 'logical': True}, f, ensure_ascii=False)
    except Exception as e:
        d['status'] = 'failed'; d['error'] = str(e)[:200]
    d['toolVersion'] = TOOL_VERSION
    if i % 50 == 0: log(f'  {i}/{len(docs)}')

# ---------- 5. inventaire public (métadonnées) ----------
def doc_type(d):
    t = ' '.join(filter(None, [d['fileName'], str(d['catalog'].get('title') or ''), str(d['catalog'].get('typeAuto') or ''), str(d['catalog'].get('subject') or ''), d.get('pdfTitle') or '']))
    if re.search(r'מדריך\s*[-–]?\s*ל?מדרי[ךכ]|madrich|guide for guides', t, re.I): return 'guide'
    if re.search(r'דפדפת|פלאייר|flyer', t, re.I): return 'brochure'
    if re.search(r'מפה|מפת|map', t, re.I): return 'map'
    if re.search(r'פעילות|דף\s*עבודה|ערכה|חידון|activity|לימוד', t, re.I): return 'activity'
    if re.search(r'גיליון|מאמר|כתב\s*עת|עלון\s*מדעי|article', t, re.I): return 'article'
    if re.search(r'עלון|ברושור|brochure|leaflet|פלאייר', t, re.I): return 'brochure'
    return 'other'
def clean_title(t, fn):
    t = re.sub(r'\s*\n\s*הורדה\s*$', '', str(t)).replace('\n', ' ')
    t = re.sub(r'\s+', ' ', t).strip()
    return t or re.sub(r'_[0-9a-f]{6}\.pdf$|\.pdf$', '', fn)
out = []
for d in sorted(docs.values(), key=lambda x: x['fileName']):
    c = d['catalog']
    out.append({k: v for k, v in {
        'id': d['id'], 'sha256': d['sha256'], 'fileName': d['fileName'], 'source': d['source'], 'driveId': d['driveId'], 'zipPath': d['zipPath'] or None,
        'copies': d['copies'] or None, 'title': clean_title(c.get('title') or d.get('pdfTitle') or d['fileName'], d['fileName']),
        'site': c.get('site'), 'subject': c.get('subject'), 'sections': c.get('sections'), 'manifestId': c.get('manifestId'),
        'officialUrl': c.get('url'), 'sourcePage': c.get('page'), 'regionAuto': c.get('regionAuto'), 'periodsAuto': c.get('periodsAuto'),
        'typeAuto': c.get('typeAuto'), 'type': doc_type(d), 'lang': d.get('lang') or c.get('langAuto'), 'pages': d.get('pages'),
        'status': d.get('status'), 'textPages': d.get('textPages'), 'ocrPages': d.get('ocrPages'), 'emptyPages': d.get('emptyPages'),
        'reversedPages': d.get('reversedPages'), 'visualOrder': d.get('visualOrder'), 'quality': d.get('quality'), 'catalogMatched': c.get('matched'), 'error': d.get('error'), 'toolVersion': d.get('toolVersion')
    }.items() if v is not None})
st = lambda s: sum(1 for d in out if d.get('status') == s)
summary = {
    'date': time.strftime('%Y-%m-%d'), 'listing': {'files': len(files), 'rootPdfs': len(root_pdfs), 'zips': len(zips)},
    'rootDownloaded': events['root_downloaded'], 'rootFailed': len(events['root_failed']), 'rootDuplicates': events['root_dup'],
    'zipPdfs': events['zip_pdfs'], 'zipAdded': events['zip_added'], 'zipDuplicates': events['zip_dup'], 'zipFailed': len(events['zip_failed']),
    'guidesZip': {'total': events.get('guides_total'), 'inCorpus': events.get('guides_in_corpus'), 'missing': events['guides_missing']},
    'unique': len(out), 'withText': st('text'), 'withOcr': st('ocr'), 'partial': st('partial'), 'needsOcr': st('needs_ocr'), 'failed': st('failed'),
    'catalogMatched': sum(1 for d in out if d.get('catalogMatched')), 'withOfficialUrl': sum(1 for d in out if d.get('officialUrl')),
    'types': {t: sum(1 for d in out if d['type'] == t) for t in ('guide', 'brochure', 'map', 'activity', 'article', 'other')},
    'langs': {l: sum(1 for d in out if d.get('lang') == l) for l in sorted({str(d.get('lang')) for d in out})},
    'pages': sum(d.get('pages') or 0 for d in out), 'visualOrderFixed': sum(1 for d in out if d.get('visualOrder')), 'ocrPagesThisRun': OCR_MAX_PAGES - ocr_budget, 'manifestSchema': schema,
    'errors': events['root_failed'][:20] + events['zip_failed']
}
json.dump({'summary': summary, 'documents': out}, open(os.path.join(OUT, 'inventory.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
if not os.path.exists(os.path.join(OUT, 'corrections.json')):
    json.dump({'_': 'Corrections manuelles par id de document (jamais écrasées par l’import) : title, site, regionVerified, periods, themes, type, lang, officialUrl, hide.', 'documents': {}}, open(os.path.join(OUT, 'corrections.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
log(json.dumps(summary, ensure_ascii=False))
