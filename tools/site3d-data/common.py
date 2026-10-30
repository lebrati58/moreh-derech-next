# Outils communs pour écrire les fiches des sites 3D (hébreu d'abord, puis fr/en/ru).
import json, os
def L(he, fr, en, ru): return {"he": he, "fr": fr, "en": en, "ru": ru}
def drive(label, fid): return {"kind": "drive", "label": label, "url": f"https://drive.google.com/file/d/{fid}/view"}
def online(label, url): return {"kind": "online", "label": label, "url": url}
def primary(label, url): return {"kind": "primary", "label": label, "url": url}
def osm(w): return {"kind": "online", "label": "OpenStreetMap " + w, "url": "https://www.openstreetmap.org/" + w}
def P(n, he, fr, en, ru, dhe, dfr, den, dru): return {"n": n, "name": L(he, fr, en, ru), "dates": L(dhe, dfr, den, dru)}
CERT = {"attested": {"color": "#3fbf8a", "name": L("מתועד בשטח", "Attesté", "Attested", "Подтверждено")}, "reconstruction": {"color": "#f0b44c", "name": L("שחזור מבוסס", "Reconstruction argumentée", "Reasoned reconstruction", "Обоснованная реконструкция")}, "hypothesis": {"color": "#e0607e", "name": L("השערה", "Hypothèse", "Hypothesis", "Гипотеза")}}
SITES = {
  "masada": L("מצדה", "Massada", "Masada", "Масада"), "caesarea": L("קיסריה", "Césarée", "Caesarea", "Кесария"), "beitshean": L("בית שאן", "Beit Shean", "Beit She'an", "Бейт-Шеан"),
  "herodium": L("הרודיון", "Hérodion", "Herodium", "Иродион"), "megiddo": L("תל מגידו", "Tel Megiddo", "Tel Megiddo", "Тель Мегиддо"), "tzippori": L("ציפורי", "Tsippori", "Sepphoris", "Ципори"), "gamla": L("גמלא", "Gamla", "Gamla", "Гамла"),
  "arad": L("תל ערד", "Tel Arad", "Tel Arad", "Тель Арад"), "beersheba": L("תל באר שבע", "Tel Beer-Sheva", "Tel Be'er Sheva", "Тель Беэр-Шева"), "qumran": L("קומראן", "Qumrân", "Qumran", "Кумран"),
  "banias": L("בניאס", "Banias", "Banias", "Баниас"), "nimrod": L("מבצר נמרוד", "Forteresse de Nimrod", "Nimrod Fortress", "Крепость Нимрод"),
  "beitguvrin": L("בית גוברין ומרשה", "Beit Guvrin et Marésha", "Beit Guvrin & Maresha", "Бейт-Гуврин и Мареша"), "lachish": L("תל לכיש", "Tel Lakhish", "Tel Lachish", "Тель Лахиш"), "qeiyafa": L("חורבת קייאפה", "Khirbet Qeiyafa", "Khirbet Qeiyafa", "Хирбет-Кейафа"),
  "susya": L("סוסיא", "Soussia", "Susya", "Сусия"), "shiloh": L("תל שילה", "Tel Shiloh", "Tel Shiloh", "Тель Шило"), "beitshearim": L("בית שערים", "Beit Shearim", "Beit She'arim", "Бейт-Шеарим"),
  "apollonia": L("אפולוניה", "Apollonia", "Apollonia", "Аполлония"), "eingedi": L("עין גדי", "Ein Gedi", "Ein Gedi", "Эйн-Геди"), "beitalpha": L("בית אלפא", "Beit Alpha", "Beit Alpha", "Бейт-Альфа"),
  "atlit": L("עתלית", "Atlit", "Atlit", "Атлит"), "baram": L("ברעם", "Baram", "Bar'am", "Барам")}
def write(site, title, periods, M, osmrefs, home, default, stone="ashlar", tint="#ffffff", terrain=None, sea=False):
  out = {"site": site, "title": title, "defaultPeriod": default, "cubitMeters": 0.5, "stone": stone, "tint": tint, "home": home,
         "terrain": terrain or {"lo": "#a39478", "mid": "#cdbf9f", "hi": "#e8dfca"}, "otherSites": SITES, "certainty": CERT, "osm": osmrefs, "periods": periods, "monuments": M}
  if sea: out["sea"] = True
  root = os.path.join(os.path.dirname(__file__), "..", "..", "public", "sites3d", site)
  json.dump(out, open(os.path.join(root, "site.json"), "w"), ensure_ascii=False, indent=1)
  print(site, len(M), "fiches")
