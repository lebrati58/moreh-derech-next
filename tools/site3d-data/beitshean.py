# Fiches de Beit Shean — Scythopolis (Moreh Derech NEXT — sites 3D). Hébreu d'abord, puis fr/en/ru.
# Sources : cours (Drive, סיור 19), Madain Project, Following Hadrian, HolyLandSite ; positions OpenStreetMap.
import json, sys

D19 = {"kind": "drive", "label": "סיור 19 — בית שאן (סיכום הקורס)", "url": "https://drive.google.com/file/d/1kyiKzCCWHc1_Y7M0xyO6d81k1B15KSz3/view"}
DBS = {"kind": "drive", "label": "מבית שאן אל סקיטופוליס — מדריך סיור", "url": "https://drive.google.com/file/d/1GcS8nx9JzfBMrEpGTCX9OQ9t23sIw8Vn/view"}
MAD = {"kind": "online", "label": "Beit She'an (Madain Project)", "url": "https://madainproject.com/beit_shean"}
FH = {"kind": "online", "label": "Scythopolis/Nysa (Following Hadrian)", "url": "https://followinghadrianphotography.com/2016/06/06/scythopolisnysa-beit-shean/"}
HLS = {"kind": "online", "label": "Beth-Shean amphitheater (HolyLandSite)", "url": "https://www.holylandsite.com/beth-shean-hippodrome"}
OSM = lambda w: {"kind": "online", "label": "OpenStreetMap " + w, "url": "https://www.openstreetmap.org/" + w}
def L(he, fr, en, ru): return {"he": he, "fr": fr, "en": en, "ru": ru}

periods = [
  {"n": 1, "name": L("כנענית — שלטון מצרי", "Cananéenne — domination égyptienne", "Canaanite — Egyptian rule", "Ханаанская — египетское владычество"), "dates": L("ברונזה מאוחרת, המאות ה-15–12 לפנה״ס", "Bronze récent, XVe–XIIe s. av. J.-C.", "Late Bronze, 15th–12th c. BCE", "Поздняя бронза, XV–XII вв. до н. э.")},
  {"n": 2, "name": L("ימי המקרא (ברזל)", "Époque biblique (fer)", "Biblical (Iron Age)", "Библейская (железный век)"), "dates": L("המאות ה-11–8 לפנה״ס", "XIe–VIIIe s. av. J.-C.", "11th–8th c. BCE", "XI–VIII вв. до н. э.")},
  {"n": 3, "name": L("הלניסטית — ניסה-סקיתופוליס", "Hellénistique — Nysa-Scythopolis", "Hellenistic — Nysa-Scythopolis", "Эллинистическая — Ниса-Скифополь"), "dates": L("המאות ה-3–1 לפנה״ס", "IIIe–Ier s. av. J.-C.", "3rd–1st c. BCE", "III–I вв. до н. э.")},
  {"n": 4, "name": L("רומית — עיר הדקאפוליס", "Romaine — ville de la Décapole", "Roman — a Decapolis city", "Римская — город Декаполиса"), "dates": L("63 לפנה״ס – 324 לסה״נ", "63 av. – 324 apr. J.-C.", "63 BCE – 324 CE", "63 до н. э. – 324 н. э.")},
  {"n": 5, "name": L("ביזנטית — בירת פלשתינה סקונדה", "Byzantine — capitale de la Palestina Secunda", "Byzantine — capital of Palaestina Secunda", "Византийская — столица Палестины Второй"), "dates": L("324–636", "324–636", "324–636", "324–636")},
  {"n": 6, "name": L("ערבית קדומה — עד רעש 749", "Arabe ancienne — jusqu’au séisme de 749", "Early Islamic — until the 749 quake", "Раннеисламская — до землетрясения 749 г."), "dates": L("636–749", "636–749", "636–749", "636–749")},
  {"n": 7, "name": L("בית שאן היום", "Beit Shean aujourd’hui", "Beit She'an today", "Бейт-Шеан сегодня"), "dates": L("גן לאומי", "parc national", "national park", "национальный парк")},
]
M = []
def mon(**k): M.append(k)

mon(id="bs_tel", **{"from": 1, "to": 7}, certainty="attested", keep=True, pri=2,
    name=L("תל בית שאן", "Tel Beit Shean", "Tel Beit She'an", "Тель Бейт-Шеан"),
    text=L("כ-20 שכבות יישוב, מהתקופה הכלקוליתית ועד הפרסית. בשנים 1921–1933 חפרה כאן משלחת אוניברסיטת פנסילבניה, שהסירה כ-5 מ׳ מראש התל כדי להגיע לשכבות המקראיות.", "Une vingtaine de niveaux d’occupation, du Chalcolithique à l’époque perse. De 1921 à 1933, la mission de l’université de Pennsylvanie y fouilla et enleva environ 5 m du sommet pour atteindre les couches bibliques.", "About 20 occupation layers, from the Chalcolithic to the Persian period. In 1921–1933 the University of Pennsylvania expedition dug here and removed about 5 m from the top to reach the biblical layers.", "Около 20 слоёв поселения, от халколита до персидского времени. В 1921–1933 гг. экспедиция Пенсильванского университета сняла около 5 м с вершины, чтобы дойти до библейских слоёв."),
    placementNote=L("גבעת התל נראית בתבליט (SRTM); הסימון בנקודת ״Tel Beit Shean״ של OpenStreetMap.", "Le tell est visible dans le relief (SRTM) ; repère au point « Tel Beit Shean » d’OpenStreetMap.", "The mound is visible in the relief (SRTM); marker at OpenStreetMap’s “Tel Beit Shean” point.", "Холм виден в рельефе (SRTM); метка у точки «Tel Beit Shean» в OpenStreetMap."),
    shape={"type": "marker", "at": "o:tel", "h": 10}, sources=[DBS, D19, OSM("node/278473693")])

mon(id="bs_egypt", **{"from": 1, "to": 1}, certainty="reconstruction",
    name=L("בית המושל המצרי", "La résidence du gouverneur égyptien", "The Egyptian governor’s residence", "Резиденция египетского наместника"),
    builder=L("השלטון המצרי", "L’administration égyptienne", "The Egyptian administration", "Египетская администрация"),
    text=L("בתקופת השלטון המצרי ישב בעיר מושל; נמצאו בית מושל ומצבות, בהן מימי סתי הראשון (המאה ה-13 לפנה״ס).", "Sous la domination égyptienne, un gouverneur siégeait ici : on a trouvé sa résidence et des stèles, dont celles de Séthi Ier (XIIIe s. av. J.-C.).", "Under Egyptian rule a governor sat here: his residence and stelae were found, including those of Seti I (13th c. BCE).", "При египетском владычестве здесь сидел наместник: найдены его дом и стелы, в том числе Сети I (XIII в. до н. э.)."),
    dims=L("מבנה לבנים של 23 × 22 מ׳ (Madain Project).", "Bâtiment de briques de 23 × 22 m (Madain Project).", "A brick building of 23 × 22 m (Madain Project).", "Кирпичное здание 23 × 22 м (Madain Project)."),
    placementNote=L("המיקום על ראש התל משוער (אין קו מתאר בנתוני המפה).", "Position sur le tell estimée (pas de contour dans les données).", "Position on the mound estimated (no outline in the data).", "Положение на холме оценочное (нет контура в данных)."),
    schematic=True, shape={"type": "hall", "at": "o:tel", "W": 23, "D": 22, "h": 5, "court": True, "kind": "dolomite", "tint": "#c9a77c"}, sources=[D19, MAD])

mon(id="bs_saul", **{"from": 2, "to": 2}, certainty="reconstruction",
    name=L("חומת בית שאן ומות שאול", "La muraille de Beth-Shéan et la mort de Saül", "Beth Shean’s wall and Saul’s death", "Стена Бет-Шеана и смерть Саула"),
    text=L("אחרי המפלה בגלבוע תלו הפלשתים את גוויות שאול ובניו על חומת בית שאן, ואת כליו הניחו בבית עשתרות; אנשי יבש גלעד הורידו אותן בלילה וקברו אותן (שמ״א ל״א).", "Après la défaite de Gelboé, les Philistins pendirent les corps de Saül et de ses fils sur la muraille de Beth-Shéan et déposèrent ses armes dans le temple d’Astarté ; les gens de Yabesh-Galaad les décrochèrent de nuit et les enterrèrent (1 S 31).", "After the defeat on Gilboa the Philistines hung the bodies of Saul and his sons on the wall of Beth Shean and put his armour in the temple of Ashtoreth; the men of Jabesh-Gilead took them down by night and buried them (1 Sam 31).", "После поражения на Гилбоа филистимляне повесили тела Саула и его сыновей на стене Бет-Шеана, а доспехи положили в храм Астарты; жители Явеш-Гилада ночью сняли их и похоронили (1 Цар 31)."),
    placementNote=L("הסימון על התל בלבד: מקום החומה המדויק אינו ידוע.", "Repère sur le tell seulement : l’emplacement exact du mur est inconnu.", "Marker on the mound only: the wall’s exact place is unknown.", "Метка только на холме: точное место стены неизвестно."),
    shape={"type": "marker", "at": {"off": "o:tel", "dx": 25, "dz": 20}, "h": 7}, sources=[DBS])

mon(id="bs_tel_temple", **{"from": 3, "to": 5}, certainty="hypothesis",
    name=L("המקדש על ראש התל", "Le temple au sommet du tell", "The temple on top of the mound", "Храм на вершине холма"),
    text=L("במאה ה-3 לפנה״ס נבנה על התל מקדש גדול (Madain Project); סיכום הקורס מזהה אותו כמקדש זאוס, שאליו עלה מעבר מקורה בעל שלוש קשתות ממקדש דיוניסוס שלמטה.", "Au IIIe s. av. J.-C., un grand temple fut bâti sur le tell (Madain Project) ; le cours l’identifie comme le temple de Zeus, auquel on montait par un passage couvert à trois arches depuis le temple de Dionysos en contrebas.", "In the 3rd c. BCE a large temple was built on the mound (Madain Project); the course identifies it as the temple of Zeus, reached by a covered three-arched passage from the temple of Dionysus below.", "В III в. до н. э. на холме построили большой храм (Madain Project); курс считает его храмом Зевса, к которому вёл крытый проход с тремя арками от храма Диониса внизу."),
    placementNote=L("מקום ומידות משוערים; המקדש מצויר בצורה כללית.", "Position et dimensions estimées ; temple dessiné de façon générale.", "Position and size estimated; temple drawn in general form.", "Положение и размеры оценочные; храм нарисован в общих чертах."),
    schematic=True, shape={"type": "temple", "at": {"off": "o:tel", "dx": -20, "dz": 15}, "bearing": 200, "podiumW": 34, "podiumD": 40, "podiumH": 2, "L": 26, "W": 15, "H": 11, "kind": "limestone"}, sources=[D19, MAD])

mon(id="bs_iztabba", **{"from": 3, "to": 3}, certainty="attested",
    name=L("תל אצטבא — העיר ההלניסטית", "Tel Iztabba — la ville hellénistique", "Tel Iztabba — the Hellenistic city", "Тель Иштабба — эллинистический город"),
    text=L("העיר ההלניסטית ״סקיתופוליס״ התרכזה מצפון לנחל חרוד, בתל אצטבא. מקור השם — כנראה שכירי חרב סקיתים.", "La ville hellénistique « Scythopolis » se trouvait au nord du Harod, à Tel Iztabba. Le nom vient probablement de mercenaires scythes.", "Hellenistic “Scythopolis” lay north of the Harod stream, at Tel Iztabba. The name probably comes from Scythian mercenaries.", "Эллинистический «Скифополь» находился к северу от Харода, на Тель Иштабба. Название, вероятно, от скифских наёмников."),
    shape={"type": "marker", "at": "o:iztabba", "h": 8}, sources=[DBS, D19, OSM("node/278475631")])

mon(id="bs_theater", **{"from": 4, "to": 7}, certainty="attested", keep=True, pri=3,
    name=L("התיאטרון הרומי", "Le théâtre romain", "The Roman theatre", "Римский театр"),
    text=L("התיאטרון השמור ביותר בארץ. בין המעברים (וומיטוריה) גומחות לכדי תהודה כפי שמתאר ויטרוביוס. הסקנה לא שוחזרה כדי להשאיר את נוף העיר פתוח.", "Le théâtre le mieux conservé du pays. Entre les vomitoires, des niches pour vases de résonance, comme le décrit Vitruve. Le mur de scène n’a pas été reconstruit, pour garder la vue sur la ville.", "The best-preserved theatre in the country. Between the vomitoria, niches for resonance vessels as Vitruvius describes. The scaena was not rebuilt, to keep the view over the city.", "Лучше всего сохранившийся театр страны. Между вомиториями — ниши для резонансных сосудов, как у Витрувия. Скену не восстановили, чтобы сохранить вид на город."),
    dims=L("כ-7,000 מקומות (סיכום הקורס; 7,500 במדריך השני). קיר סקנה בגובה 21 מ׳ בשתי קומות עמודים (Following Hadrian).", "Env. 7 000 places (cours ; 7 500 dans l’autre guide). Mur de scène de 21 m sur deux ordres de colonnes (Following Hadrian).", "About 7,000 seats (course; 7,500 in the other guide). A 21-m stage wall with two storeys of columns (Following Hadrian).", "Около 7000 мест (курс; 7500 в другом путеводителе). Стена сцены 21 м, два яруса колонн (Following Hadrian)."),
    otherView=L("Madain Project: כ-6,000 מקומות.", "Madain Project : env. 6 000 places.", "Madain Project: about 6,000 seats.", "Madain Project: около 6000 мест."),
    events=L("נבנה בימי השושלת הסוורית על שרידי תיאטרון מהמאה ה-1 (Following Hadrian).", "Bâti sous les Sévères sur les restes d’un théâtre du Ier s. (Following Hadrian).", "Built under the Severans on the remains of a 1st-century theatre (Following Hadrian).", "Построен при Северах на остатках театра I в. (Following Hadrian)."),
    placementNote=L("מיקום, רדיוס וכיוון לפי קו המתאר ב-OpenStreetMap.", "Position, rayon et orientation d’après le contour OpenStreetMap.", "Position, radius and orientation from the OpenStreetMap outline.", "Положение, радиус и ориентация по контуру OpenStreetMap."),
    schematic=True, shape={"type": "theater", "fit": "theater", "kind": "basalt", "seatKind": "basalt", "rows": 28, "scaenaH": 21},
    sources=[D19, DBS, FH, MAD, OSM("way/435999524")])

mon(id="bs_palladius", **{"from": 4, "to": 7}, certainty="attested", keep=True, pri=2,
    name=L("רחוב פלדיוס", "La rue Palladius", "Palladius Street", "Улица Палладия"),
    builder=L("רומאים; שופץ בידי המושל פלדיוס (ביזנטית)", "Romains ; restaurée par le gouverneur Palladius (byzantin)", "Romans; restored by governor Palladius (Byzantine)", "Римляне; обновлена наместником Палладием (Византия)"),
    text=L("רחוב העמודים (הקרדו) מן התיאטרון אל התל, מרוצף בבזלת, עם סטווים וחנויות. כתובת מספרת שפלדיוס שיפץ אותו מכספו.", "La rue à colonnes (cardo) du théâtre vers le tell, pavée de basalte, avec portiques et boutiques. Une inscription dit que Palladius la restaura à ses frais.", "The colonnaded street (cardo) from the theatre to the mound, paved with basalt, with porticoes and shops. An inscription says Palladius restored it at his own expense.", "Колоннадная улица (кардо) от театра к холму, мощёная базальтом, с портиками и лавками. Надпись гласит, что Палладий обновил её на свои средства."),
    dims=L("כ-150 מ׳ אורך, 24 מ׳ רוחב כולל המדרכות (Madain Project).", "Env. 150 m de long, 24 m de large avec les trottoirs (Madain Project).", "About 150 m long, 24 m wide with the sidewalks (Madain Project).", "Около 150 м в длину, 24 м в ширину с тротуарами (Madain Project)."),
    placementNote=L("התוואי עובר בין צפון התיאטרון, נקודת ״Palladius Street״ וצומת המרכז (נקודות OpenStreetMap); החתך (20 מ׳) לפי מודל הקרדו.", "Tracé entre le nord du théâtre, le point « Palladius Street » et le carrefour central (points OpenStreetMap) ; coupe (20 m) selon le modèle du cardo.", "Line between the north of the theatre, the “Palladius Street” point and the central junction (OpenStreetMap points); section (20 m) from the cardo model.", "Трасса между северной частью театра, точкой «Palladius Street» и центральным перекрёстком (OpenStreetMap); сечение 20 м по модели кардо."),
    schematic=True, shape={"type": "street", "lines": [[{"off": "o:theater", "dx": 8, "dz": -45}, "o:palladius", "o:temple"]]}, sources=[D19, DBS, MAD, OSM("node/3849660570")])

mon(id="bs_silvanus", **{"from": 5, "to": 7}, certainty="attested", keep=True,
    name=L("רחוב סילבנוס", "La rue Silvanus", "Silvanus Street", "Улица Сильвана"), builder=L("סילבנוס (תורם, כנראה שומרוני)", "Silvanus (donateur, sans doute samaritain)", "Silvanus (a donor, probably Samaritan)", "Сильван (жертвователь, вероятно самаритянин)"),
    text=L("רחוב על שם תורם ששיפץ אותו; כתובת פסיפס מציינת שהיה מלומד, ופרוקופיוס מקיסריה קושר אותו לשומרונים. העמודים נפלו פנימה אל הרחוב ברעש 749; בצדו הדרומי הייתה בריכת השתקפות.", "Rue nommée d’après le donateur qui la restaura ; une inscription en mosaïque le dit savant, et Procope de Césarée le rattache aux Samaritains. Les colonnes tombèrent vers la rue lors du séisme de 749 ; au sud, un bassin-miroir.", "A street named after the donor who restored it; a mosaic inscription calls him learned, and Procopius of Caesarea links him to the Samaritans. The columns fell into the street in the 749 quake; on its south side lay a reflecting pool.", "Улица названа по жертвователю, обновившему её; мозаичная надпись называет его учёным, Прокопий Кесарийский связывает его с самаритянами. Колонны упали на улицу при землетрясении 749 г.; с юга был отражающий бассейн."),
    placementNote=L("קטע בין צומת המרכז לנקודת ״Silvanus Street״ (OpenStreetMap).", "Tronçon entre le carrefour central et le point « Silvanus Street » (OpenStreetMap).", "Segment between the central junction and the “Silvanus Street” point (OpenStreetMap).", "Участок между центральным перекрёстком и точкой «Silvanus Street» (OpenStreetMap)."),
    schematic=True, shape={"type": "street", "lines": [["o:temple", "o:silvanus"]]}, sources=[D19, OSM("node/3849660573")])

mon(id="bs_temple", **{"from": 4, "to": 7}, certainty="attested", keep=True, pri=2,
    name=L("המקדש הרומי (דיוניסוס?)", "Le temple romain (Dionysos ?)", "The Roman temple (Dionysus?)", "Римский храм (Диониса?)"),
    text=L("מקדש בצומת הרחובות, למרגלות התל. דיוניסוס היה אל העיר; לפי המסורת המקומית קברה כאן מינקתו ניסה אותו או גידלה אותו — ומכאן השם ניסה-סקיתופוליס.", "Temple au carrefour, au pied du tell. Dionysos était le dieu de la ville ; selon la tradition locale, sa nourrice Nysa l’y enterra ou l’y éleva — d’où le nom de Nysa-Scythopolis.", "A temple at the junction, at the foot of the mound. Dionysus was the city’s god; local tradition says his nurse Nysa buried or raised him here — hence the name Nysa-Scythopolis.", "Храм на перекрёстке у подножия холма. Дионис был богом города; по местной традиции, здесь его похоронила или вырастила кормилица Ниса — отсюда имя Ниса-Скифополь."),
    otherView=L("Following Hadrian: מקדש עגול, אולי לדיוניסוס או לניסה.", "Following Hadrian : temple rond, peut-être pour Dionysos ou Nysa.", "Following Hadrian: a round temple, perhaps for Dionysus or Nysa.", "Following Hadrian: круглый храм, возможно, Диониса или Нисы."),
    placementNote=L("בנקודת ״Roman Temple״ (OpenStreetMap); צורה כללית.", "Au point « Roman Temple » (OpenStreetMap) ; forme générale.", "At the “Roman Temple” point (OpenStreetMap); general form.", "В точке «Roman Temple» (OpenStreetMap); общая форма."),
    schematic=True, shape={"type": "tholos", "at": "o:temple", "R": 6, "h": 9, "kind": "basalt"}, sources=[DBS, D19, FH, OSM("node/3849660571")])

mon(id="bs_nymphaeum", **{"from": 4, "to": 7}, certainty="attested", keep=True,
    name=L("הנימפאון", "Le nymphée", "The nymphaeum", "Нимфей"),
    text=L("מבנה מזרקה ציבורי מעוטר עמודים; על קירותיו משקעי טרוורטין מן המים. במערכת המים של העיר היו שתי רשתות נפרדות — מים נקיים וביוב.", "Fontaine monumentale à colonnes ; dépôts de travertin laissés par l’eau. Le réseau de la ville avait deux systèmes séparés : eau propre et égouts.", "A monumental public fountain with columns; travertine deposits left by the water. The city had two separate networks: clean water and sewage.", "Монументальный фонтан с колоннами; отложения травертина от воды. В городе были две отдельные сети: чистая вода и канализация."),
    dims=L("נבנה במאה ה-2 לסה״נ (Following Hadrian).", "Bâti au IIe s. (Following Hadrian).", "Built in the 2nd c. CE (Following Hadrian).", "Построен во II в. н. э. (Following Hadrian)."),
    placementNote=L("בנקודת ״Nymphaeum״ (OpenStreetMap); החזית משוחזרת והכיוון משוער.", "Au point « Nymphaeum » (OpenStreetMap) ; façade restituée, orientation estimée.", "At the “Nymphaeum” point (OpenStreetMap); facade reconstructed, orientation estimated.", "В точке «Nymphaeum» (OpenStreetMap); фасад восстановлен, ориентация оценочная."),
    schematic=True, shape={"type": "facade", "at": "o:nymphaeum", "bearing": 200, "W": 20, "h": 12, "kind": "basalt"}, sources=[D19, DBS, FH, OSM("node/3849660572")])

mon(id="bs_amphitheater", **{"from": 4, "to": 7}, certainty="attested", keep=True, pri=2,
    name=L("האמפיתיאטרון", "L’amphithéâtre", "The amphitheatre", "Амфитеатр"),
    text=L("נבנה במאה ה-2 כהיפודרום למרוצי סוסים ומרכבות, והוסב לאמפיתיאטרון לקרבות גלדיאטורים; יצא משימוש במחצית השנייה של המאה ה-4. המסורת קושרת את ריש לקיש, שהיה ״לודר״ (גלדיאטור), לסקיתופוליס.", "Bâti au IIe s. comme hippodrome, puis transformé en amphithéâtre pour les gladiateurs ; abandonné dans la seconde moitié du IVe s. La tradition rattache Resh Lakish, ancien « loudar » (gladiateur), à Scythopolis.", "Built in the 2nd century as a hippodrome, later converted into an amphitheatre for gladiators; out of use in the second half of the 4th century. Tradition links Resh Lakish, a former “ludar” (gladiator), to Scythopolis.", "Построен во II в. как ипподром, затем переделан в амфитеатр для гладиаторов; заброшен во второй половине IV в. Традиция связывает Реш Лакиша, бывшего «лудара» (гладиатора), со Скифополем."),
    dims=L("10–12 שורות, 5,000–7,000 מקומות (Following Hadrian).", "10 à 12 rangs, 5 000 à 7 000 places (Following Hadrian).", "10–12 rows, 5,000–7,000 seats (Following Hadrian).", "10–12 рядов, 5000–7000 мест (Following Hadrian)."),
    otherView=L("HolyLandSite: 10,000–20,000 מקומות.", "HolyLandSite : 10 000 à 20 000 places.", "HolyLandSite: 10,000–20,000 seats.", "HolyLandSite: 10 000–20 000 мест."),
    placementNote=L("מיקום, צירים וכיוון לפי קו המתאר ב-OpenStreetMap.", "Position, axes et orientation d’après le contour OpenStreetMap.", "Position, axes and orientation from the OpenStreetMap outline.", "Положение, оси и ориентация по контуру OpenStreetMap."),
    shape={"type": "amphi", "fit": "amphi", "rows": 12, "kind": "basalt"}, sources=[D19, FH, HLS, OSM("way/366825103")])

mon(id="bs_bridge", **{"from": 4, "to": 7}, certainty="attested", keep=True,
    name=L("הגשר על נחל חרוד", "Le pont sur le Harod", "The bridge over the Harod", "Мост через Харод"),
    text=L("רחוב פלדיוס ממשיך צפונה לצד התל עד שער ולגשר — שנשאר ממנו רק חלק — מעל נחל חרוד.", "La rue Palladius continue au nord le long du tell jusqu’à une porte et un pont, aujourd’hui tronqué, sur le Harod.", "Palladius Street continues north beside the mound to a gate and a bridge — now truncated — over the Harod.", "Улица Палладия продолжается на север вдоль холма до ворот и моста — ныне обрубленного — через Харод."),
    shape={"type": "marker", "at": "o:bridge", "h": 6}, sources=[D19, OSM("node/6877402185")])

mon(id="bs_harod", **{"from": 1, "to": 7}, certainty="attested", keep=True,
    name=L("נחל חרוד", "Le Harod", "Nahal Harod", "Нахаль Харод"),
    text=L("״אם גן עדן בארץ ישראל — בית שאן פתחו״ (ריש לקיש). העמק רווי מעיינות; העיר הרומית קיבלה את מימיה מנחל אסי, והביוב זרם אל נחל חרוד.", "« Si le paradis est en terre d’Israël, Beit Shean en est la porte » (Resh Lakish). La vallée regorge de sources ; la ville romaine tirait son eau du Assi et rejetait ses eaux usées dans le Harod.", "“If the Garden of Eden is in the Land of Israel, Beit She'an is its gate” (Resh Lakish). The valley is full of springs; the Roman city drew water from the Assi and drained sewage into the Harod.", "«Если рай в Земле Израиля, то Бейт-Шеан — его врата» (Реш Лакиш). Долина полна источников; римский город брал воду из Аси и сбрасывал стоки в Харод."),
    placementNote=L("התוואי של היום (OpenStreetMap).", "Tracé actuel (OpenStreetMap).", "Today’s course (OpenStreetMap).", "Современное русло (OpenStreetMap)."),
    shape={"type": "path", "osm": "harod", "w": 7, "color": "#3c9be6"}, sources=[DBS, D19, OSM("way/682286386")])

mon(id="bs_bath", **{"from": 5, "to": 7}, certainty="attested", keep=True,
    name=L("בית המרחץ", "Les thermes", "The baths", "Бани"),
    text=L("בית מרחץ גדול: פלאיסטרה, חדר קר, פושר וחם, עמודי היפוקאוסט מחומר וחדר תנורים; לידו לטרינה ציבורית ומים זורמים מתחת למושבים.", "Grands thermes : palestre, salles froide, tiède et chaude, pilettes d’hypocauste en terre cuite, chaufferie ; à côté, des latrines publiques avec eau courante sous les sièges.", "Large baths: palaestra, cold, warm and hot rooms, clay hypocaust pillars and a furnace room; next to them public latrines with running water under the seats.", "Большие бани: палестра, холодный, тёплый и горячий залы, глиняные столбики гипокауста и топочная; рядом общественная уборная с проточной водой под сиденьями."),
    dims=L("הבית המערבי נבנה במאה ה-4 (Following Hadrian).", "Les thermes ouest datent du IVe s. (Following Hadrian).", "The western baths date from the 4th century (Following Hadrian).", "Западные бани — IV в. (Following Hadrian)."),
    placementNote=L("בנקודת ״Byzantine Bathhouse״ (OpenStreetMap); המבנה מצויר בצורה כללית — אין קו מתאר בנתונים.", "Au point « Byzantine Bathhouse » (OpenStreetMap) ; bâtiment dessiné de façon générale — pas de contour dans les données.", "At the “Byzantine Bathhouse” point (OpenStreetMap); building drawn in general form — no outline in the data.", "В точке «Byzantine Bathhouse» (OpenStreetMap); здание в общих чертах — контура нет."),
    schematic=True, shape={"type": "hall", "at": "o:bath", "W": 40, "D": 34, "h": 7, "court": True, "domeR": 6, "kind": "basalt"}, sources=[D19, DBS, FH, OSM("node/3849660569")])

mon(id="bs_wall", **{"from": 5, "to": 5}, certainty="attested",
    name=L("החומה הביזנטית ושערי העיר", "La muraille byzantine et les portes", "The Byzantine wall and gates", "Византийская стена и ворота"),
    text=L("בתקופה הביזנטית הוקפה העיר בחומה עם שערים. כתובת רחוב (בית הכנסת ברחוב, 29 שורות) מונה שערים כמו פילי דה קמפון (שער המחנה) ופילי דזבליה.", "À l’époque byzantine la ville reçut un mur avec des portes. L’inscription de Rehov (synagogue, 29 lignes) cite des portes comme Pili de-Kampon (porte du camp) et Pili de-Zivlia.", "In Byzantine times the city was walled, with gates. The Rehov inscription (synagogue, 29 lines) names gates such as Pili de-Kampon (camp gate) and Pili de-Zivlia.", "В византийское время город обнесли стеной с воротами. Надпись из Рехова (синагога, 29 строк) называет ворота, например Пили де-Кампон (лагерные) и Пили де-Зивлия."),
    placementNote=L("תוואי החומה אינו בנתוני המפה ולכן אינו מצויר.", "Le tracé n’est pas dans les données et n’est pas dessiné.", "The line is not in the data and is not drawn.", "Трассы нет в данных, она не нарисована."), sources=[D19, DBS])

mon(id="bs_quake", **{"from": 6, "to": 7}, certainty="attested", keep=True, pri=3,
    name=L("רעש 749", "Le séisme de 749", "The earthquake of 749", "Землетрясение 749 года"),
    text=L("ביום שישי, כ״ג בשבט (18 בינואר 749), החריבה רעידת אדמה (״רעש שביעית״) את העיר: העמודים קרסו אל הרחובות, מערכות המים התפוצצו ושכבת סחף של כ-2 מ׳ כיסתה הכול — וכך נשמרה העיר.", "Le vendredi 23 Shevat (18 janvier 749), un séisme (« le séisme de la septième ») détruisit la ville : colonnes effondrées dans les rues, réseau d’eau rompu, couche de limon d’environ 2 m — qui conserva la ville.", "On Friday 23 Shevat (18 January 749) an earthquake (“the quake of the seventh”) destroyed the city: columns collapsed into the streets, the water system burst and about 2 m of silt covered everything — preserving the city.", "В пятницу 23 швата (18 января 749 г.) землетрясение («седьмое») разрушило город: колонны рухнули на улицы, водопровод прорвало, слой ила около 2 м всё покрыл — и сохранил город."),
    events=L("התאריך ידוע מפיוטי קינה שנמצאו בגניזה הקהירית; העיר ננטשה ולא שוקמה.", "La date est connue par des poèmes de lamentation de la Guéniza du Caire ; la ville fut abandonnée.", "The date is known from lament poems in the Cairo Genizah; the city was abandoned.", "Дата известна по плачам из Каирской генизы; город был покинут."),
    placementNote=L("הסימון ברחוב סילבנוס, שבו נראים העמודים שנפלו.", "Repère rue Silvanus, où l’on voit les colonnes tombées.", "Marker on Silvanus Street, where the fallen columns lie.", "Метка на улице Сильвана, где лежат упавшие колонны."),
    shape={"type": "marker", "at": {"off": "o:silvanus", "dx": -15, "dz": 6}, "h": 7}, sources=[D19, DBS])

out = {
  "site": "beitshean", "title": L("בית שאן — סקיתופוליס", "Beit Shean — Scythopolis", "Beit She'an — Scythopolis", "Бейт-Шеан — Скифополь"), "defaultPeriod": 5, "cubitMeters": 0.5, "stone": "basalt", "tint": "#ffffff",
  "home": {"at": "o:temple", "dist": 700, "from": 200, "elev": 35},
  "terrain": {"lo": "#8f8a62", "mid": "#b4a77c", "hi": "#d2c49c"},
  "otherSites": {"masada": L("מצדה", "Massada", "Masada", "Масада"), "caesarea": L("קיסריה", "Césarée", "Caesarea", "Кесария"), "beitshean": L("בית שאן", "Beit Shean", "Beit She'an", "Бейт-Шеан")},
  "certainty": {"attested": {"color": "#3fbf8a", "name": L("מתועד בשטח", "Attesté", "Attested", "Подтверждено")}, "reconstruction": {"color": "#f0b44c", "name": L("שחזור מבוסס", "Reconstruction argumentée", "Reasoned reconstruction", "Обоснованная реконструкция")}, "hypothesis": {"color": "#e0607e", "name": L("השערה", "Hypothèse", "Hypothesis", "Гипотеза")}},
  "osm": {"tel": {"osm": "node/278473693"}, "iztabba": {"osm": "node/278475631"}, "theater": {"osm": "way/435999524"}, "palladius": {"osm": "node/3849660570"}, "temple": {"osm": "node/3849660571"},
          "nymphaeum": {"osm": "node/3849660572"}, "silvanus": {"osm": "node/3849660573"}, "bath": {"osm": "node/3849660569"}, "amphi": {"osm": "way/366825103"}, "bridge": {"osm": "node/6877402185"},
          "harod": {"osm": ["way/682286386", "way/1245196499", "way/1245196500"]}},
  "periods": periods, "monuments": M
}
json.dump(out, open(sys.argv[1], "w"), ensure_ascii=False, indent=1)
print(len(M), "fiches")
