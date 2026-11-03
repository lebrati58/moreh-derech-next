# Beit Shéan — compléments d'après les documents du cours (Drive) : dépliant RTG « גן לאומי בית שאן », סיור 19 (résumé du cours),
# guide « מבית שאן אל סקיטופוליס » (Jorge). Met à jour public/sites3d/beitshean/site.json (idempotent).
# Positions : nœuds OpenStreetMap de geo.json ; les édifices sans nœud sont placés par rapport à eux et signalés « approximatif ».
# Usage : python3 tools/site3d-data/beitshean_more.py
import json, os
P = os.path.join(os.path.dirname(__file__), "..", "..", "public", "sites3d", "beitshean", "site.json")
D = json.load(open(P))

def L(he, fr, en, ru): return {"he": he, "fr": fr, "en": en, "ru": ru}
RTG = {"kind": "drive", "label": "רשות הטבע והגנים — עלון גן לאומי בית שאן", "url": "https://drive.google.com/file/d/1_MUPjPqabSJk9HpkO1OG_ub9-3Pk6Fl6/view"}
D19 = {"kind": "drive", "label": "סיור 19 — בית שאן (סיכום הקורס)", "url": "https://drive.google.com/file/d/1kyiKzCCWHc1_Y7M0xyO6d81k1B15KSz3/view"}
DJ = {"kind": "drive", "label": "מבית שאן אל סקיטופוליס — מדריך סיור", "url": "https://drive.google.com/file/d/1GcS8nx9JzfBMrEpGTCX9OQ9t23sIw8Vn/view"}
def OSM(w): return {"kind": "online", "label": "OpenStreetMap " + w, "url": "https://www.openstreetmap.org/" + w}
GRID = 38   # cap des rues (Palladius → temple, d'après OpenStreetMap)
M = {m["id"]: m for m in D["monuments"]}
def put(m):
  if m["id"] in M: M[m["id"]].clear(); M[m["id"]].update(m)
  else: D["monuments"].append(m); M[m["id"]] = m

# ---------- le bain occidental, détaillé ----------
M["bs_bath"].update(
  name=L("בית המרחץ המערבי", "Les thermes occidentaux", "The western bathhouse", "Западные бани"), pri=2,
  text=L("נבנה בסוף המאה ה-4 על יסודות אולמות קדומים ועבר שינויים בתקופה הביזנטית. מבנה מרכזי של שמונה אולמות שקורו בכיפות ובקמרונות; מתחת לרצפות האולמות החמים מערכת הסקה (היפוקאוסט) — עמודוני חימר — ותנור (פרפורניום) סמוך. הקירות צופו בטיח צבעוני, והרצפות בלוחות שיש ובפסיפסים. משלושה עבריו סטווים הפתוחים לחדרים ולאקסדרות; בקצות הסטווים בריכות ומזרקות נוי. שינויים במימון מושלי הפרובינציה תועדו בכתובות יווניות (רט״ג). הקלדריום היה מקורה בכיפה שהאדים התעבו עליה וזלגו לאורך הקירות (סיכום הקורס).",
         "Bâtis à la fin du IVe s. sur des salles plus anciennes, modifiés à l’époque byzantine. Bâtiment central de huit salles couvertes de coupoles et de voûtes ; sous les salles chaudes, l’hypocauste (pilettes de terre cuite) et un four (praefurnium). Murs à enduit coloré, sols de marbre et de mosaïque. Sur trois côtés, des portiques ouvrant sur des salles et des exèdres ; aux extrémités, bassins et fontaines. Les travaux financés par les gouverneurs sont rappelés par des inscriptions grecques (RTG). Le caldarium avait une coupole où la vapeur se condensait et ruisselait le long des murs (cours).",
         "Built at the end of the 4th century over earlier halls and altered in the Byzantine period. A central building of eight halls roofed with domes and vaults; under the hot halls a hypocaust (clay pillars) and a furnace (praefurnium). Walls coated with coloured plaster, floors of marble slabs and mosaics. Porticoes on three sides opened onto rooms and exedrae; at their ends, pools and ornamental fountains. Works funded by provincial governors are recorded in Greek inscriptions (Parks Authority). The caldarium had a dome where steam condensed and ran down the walls (course notes).",
         "Построены в конце IV в., изменены в византийское время: восемь залов под куполами и сводами, гипокауст, печь; стены в цветной штукатурке, полы из мрамора и мозаики; с трёх сторон портики с комнатами и экседрами, бассейны и фонтаны."),
  dims=L("כ-9 דונם (רט״ג).", "Env. 9 dounams (RTG).", "About 9 dunams (Parks Authority).", "Около 9 дунамов."),
  placementNote=L("בנקודת ״Byzantine Bathhouse״ (OpenStreetMap), בכיוון רשת הרחובות. חלוקת החדרים, המידות ומספר האולמות בדגם הם שחזור (השערה); הגגות הוסרו כדי לראות פנימה. מתועד: שמונה אולמות, היפוקאוסט ותנור, שיש ופסיפס, סטווים משלושה עברים, חדרים ואקסדרות, בריכות ומזרקות בקצות הסטווים. היום מוצגים השרידים.",
                  "Au point « Byzantine Bathhouse » (OpenStreetMap), dans l’axe des rues. Partition, dimensions et nombre de salles : restitution (hypothèse) ; toits retirés. Documenté : huit salles, hypocauste et four, marbre et mosaïque, portiques sur trois côtés, salles et exèdres, bassins et fontaines aux extrémités. Aujourd’hui : les vestiges.",
                  "At the “Byzantine Bathhouse” point (OpenStreetMap), aligned with the street grid. Room layout, sizes and number of halls are a reconstruction (hypothesis); roofs removed. Documented: eight halls, hypocaust and furnace, marble and mosaics, porticoes on three sides, rooms and exedrae, pools and fountains at their ends. Today: the remains.",
                  "По точке OpenStreetMap; планировка — реконструкция; крыши сняты."),
  shape={"type": "grandbath", "at": "o:bath", "bearing": GRID, "W": 48, "D": 38, "level": "max", "h": 8, "kind": "basalt", "ruinFrom": 7},
  sources=[RTG, D19, DJ, OSM("node/3849660569")])

# ---------- le temple : façade à 4 colonnes et fronton (RTG), détruit à l'époque byzantine ----------
M["bs_temple"].update(**{"to": 4}, keep=False,
  dims=L("בחזית ארבעה עמודים וכותרות שנשאו גג גמלוני, עד גובה כ-15 מ׳; הוקם על במה מוגבהת מול רחוב הגיא (רט״ג).", "Façade à quatre colonnes et chapiteaux portant un toit à deux pentes, jusqu’à env. 15 m ; sur une plate-forme surélevée face à la rue de la Vallée (RTG).", "A façade of four columns and capitals carrying a gabled roof, up to about 15 m; on a raised platform facing Valley Street (Parks Authority).", "Фасад из четырёх колонн под двускатной крышей, до ~15 м, на подиуме."),
  events=L("נבנה במאה ה-2; נהרס בתקופה הביזנטית — רק יסודותיו שרדו (רט״ג).", "Bâti au IIe s. ; détruit à l’époque byzantine — seules ses fondations subsistent (RTG).", "Built in the 2nd century; destroyed in the Byzantine period — only its foundations survive (Parks Authority).", "Построен во II в.; разрушен в византийское время — сохранились лишь основания."),
  shape={"type": "temple", "at": "o:temple", "bearing": GRID + 180, "podiumW": 22, "podiumD": 30, "podiumH": 2.5, "L": 22, "W": 13, "H": 13, "cols": 4, "rows": 1, "kind": "basalt"},
  sources=M["bs_temple"]["sources"] + [RTG])

# ---------- nouvelles fiches ----------
put({"id": "bs_latrine", "from": 5, "to": 7, "keep": True, "certainty": "attested",
     "name": L("הלטרינה", "Les latrines", "The latrine", "Латрина"),
     "text": L("מבנה שירותים ציבורי שנבנה ליד בית המרחץ לבאי התיאטרון והמרחץ, ובמרכזו חצר עם עמודים (רט״ג). מרחב משותף: ישיבה בין לוחות אבן מעל מים זורמים שסילקו את היציאות; תעלה קדמית למים נקיים לטבילת מקל עם ספוג (קסילוספונגיום). על הקירות קרום טרוורטין מן המים (סיכום הקורס). ״כסף אינו מסריח״ — אספסיאנוס.",
               "Latrines publiques bâties près des thermes pour le public du théâtre et des bains, avec une cour centrale à colonnes (RTG). Espace partagé : bancs de pierre percés au-dessus d’une eau courante ; une rigole devant pour tremper l’éponge sur un bâton (xylospongium). Dépôts de travertin sur les murs (cours). « L’argent n’a pas d’odeur » — Vespasien.",
               "Public toilets built next to the baths for theatre-goers and bathers, with a central colonnaded court (Parks Authority). A shared space: stone seats over running water; a channel in front for rinsing the sponge on a stick (xylospongium). Travertine crust on the walls (course notes). “Money does not stink” — Vespasian.",
               "Общественная уборная у бань с двором на колоннах; сиденья над проточной водой, желоб для губки на палке."),
     "placementNote": L("מיקום משוער בין בית המרחץ לתיאטרון; צורה ומידות — השערה.", "Position approximative entre les thermes et le théâtre ; forme et dimensions : hypothèse.", "Approximate position between the baths and the theatre; shape and size are a hypothesis.", "Примерное место между банями и театром."),
     "shape": {"type": "latrine", "at": {"off": "o:bath", "dx": 42, "dz": 38}, "bearing": GRID, "level": "max", "kind": "basalt", "ruinFrom": 7},
     "sources": [RTG, D19, DJ]})
put({"id": "bs_sigma", "from": 5, "to": 7, "keep": True, "certainty": "attested", "pri": 1,
     "name": L("הסיגמה ופסיפס טיכה", "La Sigma et la mosaïque de Tyché", "The Sigma and the Tyche mosaic", "Сигма и мозаика Тихе"),
     "text": L("רחבה חצי-עגולה מהתקופה הביזנטית, שכתובת בחזיתה מכנה אותה ״סיגמה״. סביבה חדרים שנפתחו אל הרחבה, בחלקם פסיפסים בדגמים גאומטריים וצמחיים, בדמויות בעלי חיים ובכתובות יווניות; באחד מהם, במדליון, טיכה אלת העיר — כתר דמוי חומה לראשה וקרן שפע בידה. מתחת לסיגמה שרידי אודאון — תיאטרון קטן ומקורה מהתקופה הרומית (רט״ג). לפי סיכום הקורס — חנויות שבהן גם זונות; כאן אפשר לספר את ויכוח רבי יהודה, רשב״י ורבי יוסי.",
               "Place semi-circulaire byzantine, nommée « Sigma » par une inscription de sa façade. Tout autour, des salles ouvertes sur la place, certaines à mosaïques géométriques et végétales, animaux et inscriptions grecques ; dans l’une, en médaillon, Tyché, déesse de la ville, couronnée d’un mur et tenant la corne d’abondance. Sous la sigma, les restes d’un odéon, petit théâtre couvert romain (RTG). Selon le cours, des boutiques — où se trouvaient aussi des prostituées : le lieu pour raconter le débat de R. Yehouda, R. Shimon bar Yohaï et R. Yossi.",
               "A Byzantine semicircular plaza, named “Sigma” by an inscription on its façade. Around it, rooms opening onto the plaza, some with mosaics of geometric and plant designs, animals and Greek inscriptions; in one, in a medallion, Tyche, goddess of the city, crowned with a wall and holding a cornucopia. Under the Sigma, remains of an odeon — a small roofed Roman theatre (Parks Authority). According to the course notes, shops where prostitutes also worked: the place to tell the debate of R. Yehuda, R. Shimon bar Yochai and R. Yossi.",
               "Византийская полукруглая площадь «Сигма» с комнатами и мозаиками (Тихе с короной-стеной и рогом изобилия); под ней остатки римского одеона."),
     "placementNote": L("מיקום משוער לצד רחוב פלאדיוס, ממערב לו; רדיוס ומספר החדרים — השערה.", "Position approximative le long de la rue Palladius, à l’ouest ; rayon et nombre de salles : hypothèse.", "Approximate position along Palladius Street, to its west; radius and number of rooms are a hypothesis.", "Примерное место у улицы Палладия."),
     "shape": {"type": "sigma", "at": {"off": "o:palladius", "dx": -24, "dz": 6}, "bearing": GRID + 270, "R": 20, "W": 54, "D": 54, "level": "max", "kind": "basalt", "ruinFrom": 7},
     "sources": [RTG, D19, DJ]})
put({"id": "bs_east_bath", "from": 4, "to": 7, "keep": True, "certainty": "attested",
     "name": L("בית המרחץ המזרחי", "Les thermes orientaux", "The eastern bathhouse", "Восточные бани"),
     "text": L("נבנה בתקופה הרומית ושופץ בתקופה הביזנטית. בצדו המזרחי נמצאו קלדריום (אולם חם) והיפוקאוסט; במערבו מבנה מרובע עם ארבע גומחות בפינותיו, שעליהן נשענה כיפת אבן, ובו בריכות מים קרים — כנראה הפריג׳ידריום (רט״ג).",
               "Bâtis à l’époque romaine, rénovés à l’époque byzantine. À l’est, caldarium (salle chaude) et hypocauste ; à l’ouest, un bâtiment carré à quatre niches d’angle portant une coupole de pierre, avec des bassins d’eau froide — sans doute le frigidarium (RTG).",
               "Built in the Roman period and renovated in the Byzantine period. To the east, a caldarium (hot hall) and hypocaust; to the west, a square building with four corner niches carrying a stone dome, with cold-water pools — probably the frigidarium (Parks Authority).",
               "Римские бани, перестроенные в византийское время: на востоке кальдарий и гипокауст, на западе квадратный зал с четырьмя нишами и каменным куполом — фригидарий."),
     "placementNote": L("מקומו אינו בנתוני המפה — סימון משוער בלבד, ממזרח לרחוב פלאדיוס.", "Sa position n’est pas dans les données : simple repère approximatif, à l’est de la rue Palladius.", "Its position is not in the map data: an approximate marker only, east of Palladius Street.", "Места нет в данных — лишь примерная отметка."),
     "shape": {"type": "marker", "at": {"off": "o:palladius", "dx": 45, "dz": 25}, "h": 6}, "sources": [RTG]})
put({"id": "bs_agora", "from": 5, "to": 5, "certainty": "attested",
     "name": L("האגורה הביזנטית", "L’agora byzantine", "The Byzantine agora", "Византийская агора"),
     "text": L("רחבה בלב העיר שנבנתה בתקופה הביזנטית — מרכז מסחרי מוקף סטווים; הסטיו המערבי מרוצף פסיפסים ובהם תיאורי חיות (רט״ג).", "Une place au cœur de la ville, bâtie à l’époque byzantine : centre commercial entouré de portiques ; le portique ouest est pavé de mosaïques à animaux (RTG).", "A plaza in the heart of the city built in the Byzantine period: a commercial centre surrounded by porticoes; the western portico is paved with mosaics showing animals (Parks Authority).", "Площадь-рынок в центре города, окружённая портиками; в западном портике мозаики с животными."),
     "placementNote": L("מקומה אינו בנתוני המפה — סימון משוער בלבד, בלב העיר.", "Sa position n’est pas dans les données : simple repère approximatif, au centre.", "Its position is not in the map data: an approximate marker only, in the centre.", "Места нет в данных."),
     "shape": {"type": "marker", "at": {"off": "o:palladius", "dx": 10, "dz": 55}, "h": 6}, "sources": [RTG]})
put({"id": "bs_cult", "from": 4, "to": 4, "certainty": "attested",
     "name": L("מתחם פולחני", "Le complexe cultuel", "The cult compound", "Культовый комплекс"),
     "text": L("מכלול דתי מהמאות ה-1–2 לספירה: מקדש, מזבחות ונימפאון, על פודיום מוגבה מרובע שעלו אליו במדרגות; על המזבחות נחרתו כתובות (רט״ג). ממקדש דיוניסוס עלה מעבר מקורה בן שלוש קשתות אל מקדש זאוס בראש התל (סיכום הקורס).",
               "Complexe religieux des Ier–IIe s. : temple, autels et nymphée sur un podium carré surélevé, desservi par des marches ; inscriptions gravées sur les autels (RTG). Depuis le temple de Dionysos, un passage couvert à trois arcs montait au temple de Zeus au sommet du tell (cours).",
               "A 1st–2nd-century religious complex: a temple, altars and a nymphaeum on a raised square podium reached by steps; inscriptions carved on the altars (Parks Authority). From the temple of Dionysus a covered three-arched passage climbed to the temple of Zeus on top of the mound (course notes).",
               "Культовый комплекс I–II вв. на квадратном подиуме: храм, алтари, нимфей."),
     "placementNote": L("סימון משוער למרגלות התל; מקומו המדויק אינו בנתוני המפה.", "Repère approximatif au pied du tell ; position exacte absente des données.", "Approximate marker at the foot of the mound; exact position not in the data.", "Примерная отметка у подножия холма."),
     "shape": {"type": "marker", "at": {"off": "o:temple", "dx": 30, "dz": -35}, "h": 6}, "sources": [RTG, D19]})

json.dump(D, open(P, "w"), ensure_ascii=False, indent=1)
print(len(D["monuments"]), "fiches")
