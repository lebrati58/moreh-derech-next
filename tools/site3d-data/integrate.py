# Inscrit les sites 3D publiés dans la carte (panneaux « 3D ») et l'accueil (rangée de raccourcis).
# Usage : python3 integrate.py   (la liste LIVE ci-dessous = sites publiés, dans l'ordre d'affichage)
import json, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
from common import SITES
ROOT = os.path.join(os.path.dirname(__file__), "..", "..", "public")
LIVE = ["masada", "caesarea", "beitshean", "herodium", "megiddo", "tzippori", "gamla", "arad", "beersheba", "qumran", "banias", "nimrod", "beitguvrin", "lachish", "qeiyafa", "beitshearim", "apollonia", "eingedi", "beitalpha", "baram"]
ANCHOR = {"masada": "masada", "caesarea": "caesarea", "beitshean": "tel", "beersheba": "tel"}

def anchor(s):
  if s in ANCHOR: return ANCHOR[s]
  g = json.load(open(os.path.join(ROOT, "sites3d", s, "geo.json"))); return next(iter(g["anchors"]))

# carte
p = os.path.join(ROOT, "map.html"); t = open(p).read()
items = ["{geo:'jerusalem3d/geo.json',anchor:'temple_mount',href:'jerusalem3d.html?period=5',name:'ירושלים העתיקה'}"] + [
  "{geo:'sites3d/%s/geo.json',anchor:'%s',href:'site3d.html?site=%s',name:'%s'}" % (s, anchor(s), s, SITES[s]["he"]) for s in LIVE]
t = re.sub(r"var SITES_3D=\[.*?\];", "var SITES_3D=[" + ",".join(items) + "];", t, count=1, flags=re.S)
open(p, "w").write(t)

# accueil : liste générée (noms en 4 langues), une rangée qui défile
p = os.path.join(ROOT, "index.html"); t = open(p).read()
arr = "var S3D=[" + ",".join("{h:'site3d.html?site=%s',n:%s}" % (s, json.dumps(SITES[s], ensure_ascii=False)) for s in LIVE) + "];"
if "var S3D=[" in t: t = re.sub(r"var S3D=\[.*?\];", lambda m: arr, t, count=1, flags=re.S)
else: raise SystemExit("index.html : S3D introuvable")
open(p, "w").write(t)
print("intégrés :", len(LIVE), "sites")

# liens « autres sites » dans chaque site publié = la liste LIVE (aucun lien vers un site non publié)
for s in LIVE:
  f = os.path.join(ROOT, "sites3d", s, "site.json"); d = json.load(open(f))
  d["otherSites"] = {k: SITES[k] for k in LIVE}
  json.dump(d, open(f, "w"), ensure_ascii=False, indent=1)
