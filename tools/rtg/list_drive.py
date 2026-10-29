# Liste un dossier Drive PUBLIC (partagé par lien) sans clé d'API, via la vue intégrée.
# Usage : python tools/rtg/list_drive.py <folderId> > listing.json
import json, re, sys, html, urllib.request
def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 MorehDerechNext'})
    return urllib.request.urlopen(req, timeout=60).read().decode('utf-8', 'replace')
def listing(fid, path=''):
    page = fetch(f'https://drive.google.com/embeddedfolderview?id={fid}#list')
    out = []
    for m in re.finditer(r'<div class="flip-entry" id="entry-([\w-]+)".*?<div class="flip-entry-title">(.*?)</div>', page, re.S):
        eid, title = m.group(1), html.unescape(m.group(2)).strip()
        block = m.group(0)
        is_folder = '/drive/folders/' in block
        out.append({'id': eid, 'name': title, 'path': path, 'folder': is_folder})
    return out
root = sys.argv[1]
res, todo = [], [(root, '')]
while todo:
    fid, path = todo.pop()
    for e in listing(fid, path):
        res.append(e)
        if e['folder']: todo.append((e['id'], (path + '/' if path else '') + e['name']))
json.dump(res, sys.stdout, ensure_ascii=False, indent=0)
