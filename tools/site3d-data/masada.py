# Fiches de Massada (Moreh Derech NEXT — sites 3D). Hébreu d'abord, puis fr/en/ru.
# Sources : cours (Drive), Josèphe (Guerre des Juifs 7.252–406), Wikipédia, WiBiLex (Deutsche Bibelgesellschaft).
# Toute position vient d'OpenStreetMap (identifiants cités) ; les dimensions viennent des sources citées.
import json, sys

DRIVE_ROMAN = {"kind": "drive", "label": "התקופה הרומית הראשונה (סיכום הרצאה)", "url": "https://drive.google.com/file/d/16VZd3J6UNXoADV1hFpMrUoOJi0_y4pRA/view"}
DRIVE_LOZ = {"kind": "drive", "label": "מצדה — לו״ז הסיור (יוסף בן מתתיהו, נאום אלעזר בן יאיר; ידין)", "url": "https://drive.google.com/file/d/1uXt-2ymKuXeOYJb2XXHejki_3tJ1I7Ks/view"}
JOS_DESC = {"kind": "primary", "label": "יוסף בן מתתיהו, מלחמת היהודים 7.275–319", "url": "https://lexundria.com/j_bj/7.275-7.319/wst"}
JOS_SIEGE = {"kind": "primary", "label": "יוסף בן מתתיהו, מלחמת היהודים 7.252–388", "url": "https://lexundria.com/j_bj/7.252-7.388/wst"}
WIKI = {"kind": "online", "label": "Masada (Wikipedia)", "url": "https://en.wikipedia.org/wiki/Masada"}
WIBI = {"kind": "online", "label": "Masada — WiBiLex (Deutsche Bibelgesellschaft)", "url": "https://www.die-bibel.de/stichwort/51989"}
OSM = lambda w: {"kind": "online", "label": "OpenStreetMap " + w, "url": "https://www.openstreetmap.org/" + w}

def L(he, fr, en, ru): return {"he": he, "fr": fr, "en": en, "ru": ru}

periods = [
  {"n": 1, "name": L("חשמונאית", "Hasmonéenne", "Hasmonean", "Хасмонейская"), "dates": L("המאה ה-2–1 לפנה״ס", "IIe–Ier s. av. J.-C.", "2nd–1st c. BCE", "II–I вв. до н. э.")},
  {"n": 2, "name": L("הורדוס", "Hérode", "Herod", "Ирод"), "dates": L("37–4 לפנה״ס", "37–4 av. J.-C.", "37–4 BCE", "37–4 гг. до н. э.")},
  {"n": 3, "name": L("המרד הגדול והמצור", "Grande Révolte et siège", "Great Revolt and siege", "Великое восстание и осада"), "dates": L("66–73/74 לסה״נ", "66–73/74 apr. J.-C.", "66–73/74 CE", "66–73/74 гг. н. э.")},
  {"n": 4, "name": L("ביזנטית — נזירים", "Byzantine — moines", "Byzantine — monks", "Византийская — монахи"), "dates": L("המאות ה-5–6 לסה״נ", "Ve–VIe s.", "5th–6th c. CE", "V–VI вв.")},
  {"n": 5, "name": L("מצדה היום", "Massada aujourd’hui", "Masada today", "Масада сегодня"), "dates": L("חפירות ידין 1963–1965 · אונסק״ו 2001", "fouilles Yadin 1963–1965 · UNESCO 2001", "Yadin excavations 1963–65 · UNESCO 2001", "раскопки Ядина 1963–65 · ЮНЕСКО 2001")},
]

M = []
def mon(**k): M.append(k)

mon(id="masada_hasmonean", **{"from": 1, "to": 1}, certainty="hypothesis", pri=1,
    name=L("המבצר החשמונאי", "La forteresse hasmonéenne", "The Hasmonean fortress", "Хасмонейская крепость"),
    text=L("יוסף בן מתתיהו כותב שיונתן הכהן הגדול בנה ראשון מבצר במקום וקרא לו מצדה; יש המייחסים את הביצור לאלכסנדר ינאי. בחפירות לא זוהו שרידי בנייה חשמונאיים.",
           "Josèphe écrit que « Jonathan le grand prêtre » bâtit le premier une forteresse et l’appela Massada ; d’autres l’attribuent à Alexandre Jannée. Les fouilles n’ont identifié aucun bâtiment hasmonéen.",
           "Josephus writes that “Jonathan the high priest” first built a fortress here and called it Masada; others attribute it to Alexander Jannaeus. Excavations identified no Hasmonean buildings.",
           "Иосиф Флавий пишет, что «первосвященник Ионатан» первым построил здесь крепость и назвал её Масадой; другие приписывают её Александру Яннаю. Раскопки не выявили хасмонейских построек."),
    placementNote=L("אין שרידים מזוהים ולכן אין סימון בסצנה.", "Aucun vestige identifié : rien n’est placé dans la scène.", "No identified remains, so nothing is placed in the scene.", "Опознанных остатков нет, поэтому в сцене ничего не показано."),
    debate=L("איזה יונתן? יונתן החשמונאי (אחי יהודה המכבי) או אלכסנדר ינאי (יהונתן) — הדבר שנוי במחלוקת.", "Quel Jonathan ? Le frère de Judas Maccabée ou Alexandre Jannée (Yehonatan) : la question est débattue.", "Which Jonathan? Judas Maccabeus’ brother or Alexander Jannaeus (Yehonatan) — debated.", "Какой Ионатан? Брат Иуды Маккавея или Александр Яннай (Иехонатан) — спорно."),
    sources=[JOS_DESC, WIKI])

mon(id="masada_casemate_wall", **{"from": 2, "to": 5}, certainty="attested", keep=True, pri=2,
    name=L("חומת הסוגרים", "La muraille à casemates", "The casemate wall", "Казематная стена"),
    builder=L("הורדוס", "Hérode", "Herod", "Ирод"),
    text=L("חומה כפולה המקיפה את כל ראש ההר (מלבד הארמון הצפוני), ובין שני הקירות חדרים — ״סוגרים״. בימי המרד גרו המורדים בחדרים אלה.",
           "Double mur entourant tout le sommet (sauf le palais du Nord), avec des pièces entre les deux murs — les « casemates ». Pendant la révolte, les rebelles y habitaient.",
           "A double wall around the whole summit (except the Northern Palace), with rooms between the two walls — the “casemates”. During the revolt the rebels lived in them.",
           "Двойная стена вокруг всей вершины (кроме Северного дворца) с помещениями между стенами — «казематами». Во время восстания в них жили повстанцы."),
    dims=L("יוסף בן מתתיהו: אורך 7 ריס, גובה 12 אמה, רוחב 8 אמה, 38 מגדלים בגובה 50 אמה (תרגום ויסטון). בחפירות: אורך כ-1,300 מ׳; קיר חיצוני 1.4 מ׳, קיר פנימי כ-1 מ׳, גובה 4–5 מ׳, כ-30 מגדלים במרווחים של 35–90 מ׳.",
           "Josèphe : 7 stades de long, 12 coudées de haut, 8 de large, 38 tours de 50 coudées (trad. Whiston). Fouilles : env. 1 300 m ; mur extérieur 1,4 m, intérieur env. 1 m, 4–5 m de haut, env. 30 tours espacées de 35 à 90 m.",
           "Josephus: 7 stadia long, 12 cubits high, 8 wide, 38 towers 50 cubits high (Whiston). Excavations: c. 1,300 m; outer wall 1.4 m, inner c. 1 m, 4–5 m high, c. 30 towers 35–90 m apart.",
           "Иосиф: длина 7 стадий, высота 12 локтей, ширина 8, 38 башен по 50 локтей (пер. Уистона). Раскопки: ок. 1300 м; внешняя стена 1,4 м, внутренняя ок. 1 м, высота 4–5 м, ок. 30 башен через 35–90 м."),
    placementNote=L("התוואי לפי היקף האתר ב-OpenStreetMap; המגדלים מצוירים במרווחים קבועים (מיקומם המדויק אינו בנתונים).", "Tracé : contour du site dans OpenStreetMap ; tours dessinées à intervalle régulier (leurs positions exactes ne sont pas dans les données).", "Line: site outline in OpenStreetMap; towers drawn at regular intervals (exact positions not in the data).", "Линия: контур памятника в OpenStreetMap; башни нарисованы через равные интервалы (точных мест нет в данных)."),
    schematic=True, shape={"type": "casemate", "osm": "site", "kind": "dolomite", "h": 5, "towerEvery": 55, "towerH": 7},
    sources=[JOS_DESC, WIBI, WIKI, OSM("way/32231475")])

mon(id="masada_northern_palace", **{"from": 2, "to": 5}, certainty="attested", keep=True, pri=3,
    name=L("הארמון הצפוני", "Le palais du Nord", "The Northern Palace", "Северный дворец"),
    builder=L("הורדוס", "Hérode", "Herod", "Ирод"),
    text=L("ארמון בשלוש מדרגות התלויות על הצוק הצפוני: למעלה — חדרי המגורים ומרפסת חצי-עגולה; באמצע — מבנה עגול לאירוח; למטה — אולם מוקף עמודים ובית מרחץ קטן. יוסף בן מתתיהו מתאר ארמון ״במעלה המערבי… נוטה לצד צפון״.",
           "Palais à trois niveaux accrochés à la falaise nord : en haut les appartements et une exèdre semi-circulaire ; au milieu un pavillon circulaire de réception ; en bas une salle entourée de colonnes et un petit bain. Josèphe décrit un palais « à la montée occidentale… incliné vers le nord ».",
           "A palace on three levels hanging on the northern cliff: living quarters and a semicircular porch at the top; a circular reception pavilion in the middle; a colonnaded hall and a small bath at the bottom. Josephus describes a palace “at the western ascent… inclining to the north”.",
           "Дворец на трёх уровнях на северном утёсе: наверху жилые покои и полукруглая экседра; посередине круглый павильон для приёмов; внизу зал с колоннадой и небольшая баня. Иосиф описывает дворец «у западного подъёма… склоняющийся к северу»."),
    dims=L("המדרגה התיכונה נמוכה בכמעט 20 מ׳ מהעליונה, והתחתונה נמוכה בעוד 15 מ׳ (WiBiLex).", "Terrasse médiane presque 20 m sous la terrasse supérieure, terrasse inférieure 15 m plus bas encore (WiBiLex).", "Middle terrace almost 20 m below the upper one, lower terrace a further 15 m down (WiBiLex).", "Средняя терраса почти на 20 м ниже верхней, нижняя ещё на 15 м ниже (WiBiLex)."),
    remains=L("קירות, ציורי קיר וריצופי פסיפס שוחזרו; בבית המרחץ התחתון נמצאו שרידי שלושה בני אדם.", "Murs, fresques et mosaïques restaurés ; dans le bain inférieur, les restes de trois personnes.", "Walls, frescoes and mosaics restored; remains of three people were found in the lower bath.", "Стены, фрески и мозаики восстановлены; в нижней бане найдены останки трёх человек."),
    placementNote=L("שלוש המדרגות ממוקמות לפי נקודות OpenStreetMap ״דרגה עליונה / תיכונה / תחתונה״; הבניינים עצמם בצורה פשוטה.", "Les trois terrasses sont placées sur les points OpenStreetMap « terrasse supérieure / médiane / inférieure » ; bâtiments simplifiés.", "The three terraces sit on the OpenStreetMap points “upper / middle / lower terrace”; buildings simplified.", "Три террасы поставлены по точкам OpenStreetMap «верхняя / средняя / нижняя»; здания упрощены."),
    schematic=True, shape={"type": "terraces", "upper": "o:upper", "middle": "o:middle", "lower": "o:lower", "drop1": 20, "drop2": 15},
    sources=[JOS_DESC, WIBI, WIKI, OSM("way/751256375")])

for (mid, key, he, fr, en, ru, h, osmid, txt) in [
  ("masada_western_palace", "western", "הארמון המערבי", "Le palais occidental", "The Western Palace", "Западный дворец", 6, "way/737549501",
   L("הארמון הגדול ביותר במצדה, מרכז השלטון והאירוח; נבנה בכמה שלבים סביב חצר.", "Le plus grand palais de Massada, centre administratif et de réception, bâti en plusieurs phases autour d’une cour.", "Masada’s largest palace, the administrative and reception centre, built in several phases around a courtyard.", "Самый большой дворец Масады, административный и приёмный центр, построенный в несколько этапов вокруг двора.")),
  ("masada_storerooms", "storerooms", "מכלול המחסנים", "Les entrepôts", "The storerooms", "Склады", 4, "way/737549509",
   L("מחסנים ארוכים למזון, יין ושמן. יוסף בן מתתיהו מספר שהמזון נשמר בהם שנים רבות.", "Longs magasins pour la nourriture, le vin et l’huile ; Josèphe raconte que les vivres s’y conservaient longtemps.", "Long storerooms for food, wine and oil; Josephus says the provisions kept there for a long time.", "Длинные склады для еды, вина и масла; по Иосифу, припасы хранились там долго.")),
  ("masada_bathhouse", "bath", "בית המרחץ", "Les thermes", "The bathhouse", "Бани", 5, "way/737549519",
   L("בית מרחץ רומי בסגנונו: חדר הלבשה, חדר קר, חדר פושר וחדר חם מחומם מתחת לרצפה.", "Bain de style romain : vestiaire, salle froide, tiède et chaude chauffée par le sol.", "A Roman-style bathhouse: changing room, cold, warm and hot rooms heated under the floor.", "Баня римского типа: раздевалка, холодный, тёплый и горячий залы с подогревом пола.")),
  ("masada_small_palaces", "smallpal", "הארמונות הקטנים", "Les petits palais", "The small palaces", "Малые дворцы", 4, None,
   L("שלושה מבני מגורים מפוארים בדרום-מערב ההר, כנראה לבני משפחת המלך או לנכבדים.", "Trois résidences au sud-ouest du sommet, probablement pour la famille royale ou des dignitaires.", "Three residences in the south-west of the summit, probably for the royal family or dignitaries.", "Три резиденции на юго-западе вершины, вероятно для царской семьи или сановников.")),
  ("masada_columbarium", "columb", "מגדל הקולומבריום", "La tour-columbarium", "The columbarium tower", "Башня-колумбарий", 7, "way/737549498",
   L("מבנה עגול שקירותיו מלאים גומחות קטנות; כנראה שובך יונים (לבשר ולזבל) או מקום לכדים.", "Bâtiment rond aux murs creusés de petites niches : probablement un pigeonnier (viande et engrais) ou un dépôt de jarres.", "A round building with walls full of small niches — probably a dovecote (meat and fertiliser) or a jar store.", "Круглое здание со стенами в нишах — вероятно, голубятня (мясо и удобрение) или хранилище кувшинов.")),
  ("masada_pool", "swim", "בריכת השחייה", "La piscine", "The swimming pool", "Бассейн", 1.5, "way/737549520",
   L("בריכה גלויה בדרום ההר, מוקפת מדרגות; עדות לשפע המים שנאגרו בבורות.", "Bassin à ciel ouvert au sud du sommet, avec des marches — preuve de l’eau abondante stockée dans les citernes.", "An open pool in the south of the summit with steps — evidence of the water stored in the cisterns.", "Открытый бассейн на юге вершины со ступенями — свидетельство запасов воды в цистернах.")),
]:
    shp = {"type": "footprint", "osm": key, "h": h, "kind": "dolomite"}
    mon(id=mid, **{"from": 2, "to": 5}, certainty="attested", keep=True, name=L(he, fr, en, ru), builder=L("הורדוס", "Hérode", "Herod", "Ирод"), text=txt,
        placementNote=L("קווי היסוד לפי OpenStreetMap; הגובה לצורך המחשה.", "Plan au sol d’après OpenStreetMap ; hauteur indicative.", "Footprint from OpenStreetMap; height indicative.", "План по OpenStreetMap; высота условная."),
        shape=shp, sources=[WIKI, WIBI] + ([OSM(osmid)] if osmid else []))

M[[m["id"] for m in M].index("masada_storerooms")]["dims"] = L("לפי WiBiLex: מחסן ציבורי אחד בצפון (27 × 3.8 מ׳) ו-11 מחסנים בדרום (27 × 4 מ׳ כל אחד).", "Selon WiBiLex : un magasin au nord (27 × 3,8 m) et 11 au sud (27 × 4 m chacun).", "Per WiBiLex: one storeroom in the north (27 × 3.8 m) and 11 in the south (27 × 4 m each).", "По WiBiLex: один склад на севере (27 × 3,8 м) и 11 на юге (по 27 × 4 м).")
M[[m["id"] for m in M].index("masada_western_palace")]["dims"] = L("כ-4,000 מ״ר (WiBiLex).", "Env. 4 000 m² (WiBiLex).", "About 4,000 m² (WiBiLex).", "Около 4000 м² (WiBiLex).")

mon(id="masada_cisterns", **{"from": 2, "to": 5}, certainty="attested", keep=True,
    name=L("בורות המים", "Les citernes", "The cisterns", "Цистерны"), builder=L("הורדוס", "Hérode", "Herod", "Ирод"),
    text=L("הורדוס חצב בסלע בורות מים גדולים (יוסף בן מתתיהו). מי השיטפונות הוזרמו מן הוואדיות בתעלות אל הבורות במדרון הצפון-מערבי, ומשם הועלו המים לראש ההר דרך ״שער המים״.",
           "Hérode fit tailler dans le roc de grandes citernes (Josèphe). Les crues des oueds étaient dérivées par des canaux vers les citernes du versant nord-ouest, puis l’eau était montée au sommet par la « porte de l’eau ».",
           "Herod cut large cisterns in the rock (Josephus). Flash floods from the wadis were channelled to cisterns on the north-west slope; water was then carried up through the “Water Gate”.",
           "Ирод высек в скале большие цистерны (Иосиф). Паводки из вади отводились каналами к цистернам на северо-западном склоне, затем вода поднималась наверх через «Водяные ворота»."),
    dims=L("כ-40,000 מ״ק בסך הכול (ויקיפדיה).", "Environ 40 000 m³ au total (Wikipédia).", "About 40,000 m³ in total (Wikipedia).", "Всего около 40 000 м³ (Википедия)."),
    placementNote=L("הסימון ב״שער המים״ (נקודת OpenStreetMap); הבורות עצמם חצובים במדרון ואינם מצוירים.", "Repère à la « porte de l’eau » (point OpenStreetMap) ; les citernes, taillées dans le versant, ne sont pas dessinées.", "Marker at the “Water Gate” (OpenStreetMap point); the rock-cut cisterns are not drawn.", "Метка у «Водяных ворот» (точка OpenStreetMap); высеченные цистерны не нарисованы."),
    shape={"type": "marker", "at": "o:watergate", "h": 7}, sources=[JOS_DESC, WIKI, OSM("node/913527022")])

mon(id="masada_snake_path", **{"from": 2, "to": 5}, certainty="attested", keep=True,
    name=L("שביל הנחש", "Le sentier du Serpent", "The Snake Path", "Змеиная тропа"),
    text=L("העלייה המזרחית מכיוון ים המלח. יוסף בן מתתיהו: ״נקראת הנחש״ בשל פיתוליה, ואורך ההליכה בה 30 ריס.", "La montée orientale depuis la mer Morte. Josèphe : « on l’appelle le Serpent » à cause de ses lacets ; la marche fait 30 stades.", "The eastern ascent from the Dead Sea. Josephus: “it is called the Serpent” for its windings; the walk is 30 stadia.", "Восточный подъём от Мёртвого моря. Иосиф: «её называют Змеёй» из-за извилин; путь — 30 стадий."),
    dims=L("הפרש גובה של כ-300 מ׳ (ויקיפדיה).", "Dénivelé d’environ 300 m (Wikipédia).", "About 300 m of ascent (Wikipedia).", "Перепад около 300 м (Википедия)."),
    placementNote=L("התוואי של השביל של היום (OpenStreetMap).", "Tracé du sentier actuel (OpenStreetMap).", "Line of today’s trail (OpenStreetMap).", "Линия современной тропы (OpenStreetMap)."),
    shape={"type": "path", "osm": "snake", "w": 2.2, "color": "#f6e7c0"}, sources=[JOS_DESC, WIKI, OSM("way/97602598")])

mon(id="masada_synagogue", **{"from": 3, "to": 5}, certainty="attested", keep=True, pri=2,
    name=L("בית הכנסת", "La synagogue", "The synagogue", "Синагога"),
    text=L("אולם בצד הצפון-מערבי של החומה. בימי המרד הוסיפו בו המורדים ספסלים לאורך הקירות; ידין זיהה אותו כבית כנסת — מן העתיקים בארץ. נמצאו בו קטעי מגילות (דברים, יחזקאל).",
           "Salle contre le mur nord-ouest. Pendant la révolte, les rebelles y ajoutèrent des bancs le long des murs ; Yadin l’identifia comme une synagogue, l’une des plus anciennes du pays. On y trouva des fragments de rouleaux (Deutéronome, Ézéchiel).",
           "A hall by the north-west wall. During the revolt the rebels added benches along the walls; Yadin identified it as a synagogue, one of the oldest in the land. Scroll fragments (Deuteronomy, Ezekiel) were found.",
           "Зал у северо-западной стены. Во время восстания повстанцы добавили скамьи вдоль стен; Ядин определил его как синагогу, одну из древнейших в стране. Найдены фрагменты свитков (Второзаконие, Иезекииль)."),
    otherView=L("המבנה עצמו קדום יותר (ימי הורדוס); תפקידו אז אינו ודאי.", "Le bâtiment lui-même est plus ancien (époque d’Hérode) ; sa fonction d’origine est incertaine.", "The building itself is older (Herod’s time); its original function is uncertain.", "Само здание древнее (времена Ирода); его первоначальное назначение неясно."),
    shape={"type": "footprint", "osm": "synagogue", "h": 4, "kind": "dolomite"}, sources=[WIKI, DRIVE_LOZ, OSM("way/737549503")])

mon(id="masada_mikveh", **{"from": 3, "to": 5}, certainty="attested", keep=True,
    name=L("בריכת הטבילה (מקווה)", "Le bain rituel (mikvé)", "The ritual bath (mikveh)", "Ритуальная купальня (миква)"),
    text=L("בריכת טבילה שבנו המורדים, עדות לשמירת דיני הטהרה על ראש ההר.", "Bassin d’immersion construit par les rebelles, témoin du respect des lois de pureté au sommet.", "An immersion pool built by the rebels, evidence of purity laws kept on the summit.", "Бассейн для омовения, построенный повстанцами, — свидетельство соблюдения законов чистоты."),
    shape={"type": "footprint", "osm": "mikveh", "h": 1.5, "kind": "dolomite"}, sources=[WIKI, OSM("way/737549505")])

mon(id="masada_lots", **{"from": 3, "to": 5}, certainty="reconstruction",
    name=L("מקום מציאת ״הגורלות״", "Le lieu des « sorts »", "Where the “lots” were found", "Место находки «жребиев»"),
    text=L("כאן נמצאו חרסים ועליהם שמות, ובהם ״בן יאיר״. ידין קשר אותם להגרלה שמתאר יוסף בן מתתיהו בלילה האחרון; הפרשנות שנויה במחלוקת.", "On y trouva des tessons portant des noms, dont « ben Yaïr ». Yadin les relia au tirage au sort que décrit Josèphe pour la dernière nuit ; l’interprétation est discutée.", "Inscribed sherds with names, including “ben Yair”, were found here. Yadin linked them to the lot-drawing Josephus describes on the last night; the reading is debated.", "Здесь найдены черепки с именами, в том числе «бен Яир». Ядин связал их с жеребьёвкой последней ночи у Иосифа; толкование спорно."),
    debate=L("האם אלה ״הגורלות״ שבסיפור יוסף בן מתתיהו? ידין סבר שכן; חוקרים אחרים מציעים שימוש אחר (למשל חלוקת מזון).", "Sont-ce les « sorts » du récit de Josèphe ? Yadin le pensait ; d’autres proposent un autre usage (p. ex. le rationnement).", "Are these the “lots” of Josephus’ story? Yadin thought so; others suggest another use (e.g. food rationing).", "Это ли «жребии» из рассказа Иосифа? Ядин так считал; другие предлагают иное назначение (например, раздачу пищи)."),
    shape={"type": "marker", "at": "o:lots", "h": 6}, sources=[JOS_SIEGE, DRIVE_LOZ, OSM("node/6177201789")])

mon(id="masada_roman_camps", **{"from": 3, "to": 5}, certainty="attested", keep=True, pri=2,
    name=L("מחנות הצבא הרומי", "Les camps romains", "The Roman camps", "Римские лагеря"),
    builder=L("הלגיון העשירי בפיקוד פלביוס סילבה", "La Xe légion, sous Flavius Silva", "The Tenth Legion under Flavius Silva", "Десятый легион под командованием Флавия Сильвы"),
    text=L("שמונה מחנות (א׳–ח׳) כיתרו את ההר; המחנה הראשי (ו׳) ממערב. ביניהם עברה חומת מצור (סוללת הקפה) שמנעה בריחה.", "Huit camps (A à H) encerclaient la montagne ; le camp principal (F) à l’ouest. Un mur de circonvallation les reliait pour empêcher toute fuite.", "Eight camps (A–H) surrounded the mountain; the main camp (F) lay to the west. A circumvallation wall joined them to prevent escape.", "Восемь лагерей (A–H) окружали гору; главный (F) — на западе. Их соединяла стена окружения, чтобы никто не сбежал."),
    dims=L("חומת ההקפה: רוחב 1.5 מ׳, אורך 4.6 ק״מ, 13 מגדלי שמירה (WiBiLex).", "Circonvallation : 1,5 m de large, 4,6 km de long, 13 tours de guet (WiBiLex).", "Circumvallation: 1.5 m wide, 4.6 km long, 13 watchtowers (WiBiLex).", "Стена окружения: ширина 1,5 м, длина 4,6 км, 13 сторожевых башен (WiBiLex)."),
    placementNote=L("קווי המחנות לפי OpenStreetMap; חומת ההקפה אינה בנתונים ולכן אינה מצוירת.", "Contours des camps d’après OpenStreetMap ; le mur de circonvallation n’est pas dans les données et n’est pas dessiné.", "Camp outlines from OpenStreetMap; the circumvallation wall is not in the data and is not drawn.", "Контуры лагерей по OpenStreetMap; стены окружения нет в данных, она не нарисована."),
    shape={"type": "wall", "osm": "camps", "h": 2.2, "thick": 1.6, "kind": "dolomite"}, sources=[JOS_SIEGE, WIBI, WIKI, OSM("way/87684153")])

mon(id="masada_ramp", **{"from": 3, "to": 5}, certainty="attested", keep=True, pri=3,
    name=L("סוללת המצור", "La rampe de siège", "The siege ramp", "Осадная насыпь"),
    builder=L("הצבא הרומי (פלביוס סילבה)", "L’armée romaine (Flavius Silva)", "The Roman army (Flavius Silva)", "Римская армия (Флавий Сильва)"),
    text=L("סוללה שנבנתה על שלוחה טבעית במערב (״הלבן״) עד החומה. עליה הועלה איל ניגוח שפרץ את החומה; המגינים בנו מאחוריה חומת עץ ועפר, והרומאים הציתו אותה.",
           "Rampe élevée sur un éperon naturel à l’ouest (le « Blanc ») jusqu’au mur. Un bélier y fut monté et ouvrit une brèche ; les défenseurs bâtirent derrière un mur de bois et de terre, que les Romains incendièrent.",
           "A ramp built on a natural spur to the west (the “White”) up to the wall. A battering ram was hauled up and breached the wall; the defenders built a wood-and-earth wall behind it, which the Romans set on fire.",
           "Насыпь на естественном отроге на западе («Белый») до стены. По ней подняли таран и пробили стену; защитники построили за ней стену из дерева и земли, которую римляне подожгли."),
    dims=L("יוסף בן מתתיהו: סוללה בגובה 200 אמה ועליה במה של 50 אמה ומגדל של 60 אמה. ויקיפדיה: גובה 114 מ׳, רובה שלוחת סלע טבעית.", "Josèphe : remblai de 200 coudées, plate-forme de 50, tour de 60 coudées. Wikipédia : 114 m de haut, surtout un éperon rocheux naturel.", "Josephus: a 200-cubit bank, a 50-cubit platform and a 60-cubit tower. Wikipedia: 114 m high, mostly a natural rock spur.", "Иосиф: насыпь 200 локтей, платформа 50, башня 60 локтей. Википедия: 114 м, в основном природный скальный отрог."),
    events=L("73 (או 74) לסה״נ: פריצת החומה; לפי יוסף בן מתתיהו, 960 המגינים בחרו למות בלילה האחרון (נאום אלעזר בן יאיר).", "73 (ou 74) apr. J.-C. : brèche ; selon Josèphe, les 960 défenseurs choisirent la mort la dernière nuit (discours d’Éléazar ben Yaïr).", "73 (or 74) CE: the breach; according to Josephus the 960 defenders chose death on the last night (Eleazar ben Yair’s speech).", "73 (или 74) г. н. э.: пролом; по Иосифу, 960 защитников выбрали смерть в последнюю ночь (речь Элеазара бен Яира)."),
    placementNote=L("מתחילת ״שביל הסוללה״ (OpenStreetMap) אל ״נקודת הפריצה״.", "Du début du « sentier de la rampe » (OpenStreetMap) au « point de la brèche ».", "From the start of the “Ramp path” (OpenStreetMap) to the “Breaching Point”.", "От начала «тропы насыпи» (OpenStreetMap) до «места пролома»."),
    shape={"type": "ramp", "from": "o:rampfoot", "to": "o:breach", "w": 14, "topInward": 20}, sources=[JOS_SIEGE, JOS_DESC, WIKI, DRIVE_ROMAN, OSM("node/1392658074")])

mon(id="masada_byzantine_church", **{"from": 4, "to": 5}, certainty="attested", keep=True, pri=2,
    name=L("הכנסייה הביזנטית", "L’église byzantine", "The Byzantine church", "Византийская церковь"),
    builder=L("נזירים (מנזר מרדה)", "Des moines (laure de Marda)", "Monks (the Marda laura)", "Монахи (лавра Марда)"),
    text=L("כנסייה קטנה מהמאות ה-5–6, במרכז ההר, עם רצפת פסיפס. הנזירים שישבו במקום קראו לו מרדה ונכנסו דרך ״השער הביזנטי״ שבמערב.", "Petite église des Ve–VIe s., au centre du sommet, avec une mosaïque. Les moines appelaient le lieu Marda et entraient par la « porte byzantine » à l’ouest.", "A small 5th–6th-century church in the centre of the summit, with a mosaic floor. The monks called the place Marda and entered by the “Byzantine gate” in the west.", "Небольшая церковь V–VI вв. в центре вершины с мозаичным полом. Монахи называли место Марда и входили через «византийские ворота» на западе."),
    shape={"type": "footprint", "osm": "church", "h": 7, "kind": "dolomite"}, sources=[WIKI, OSM("way/737549502")])

out = {
  "site": "masada", "title": L("מצדה", "Massada", "Masada", "Масада"), "defaultPeriod": 3, "cubitMeters": 0.5, "stone": "dolomite", "tint": "#ecd3a2",
  "home": {"at": "o:site", "dist": 1100, "from": 135, "elev": 32},
  "terrain": {"lo": "#9f8a6a", "mid": "#c8b48e", "hi": "#e2d3b2"},
  "otherSites": {"masada": L("מצדה", "Massada", "Masada", "Масада"), "caesarea": L("קיסריה", "Césarée", "Caesarea", "Кесария"), "beitshean": L("בית שאן", "Beit Shean", "Beit She'an", "Бейт-Шеан")},
  "certainty": {"attested": {"color": "#3fbf8a", "name": L("מתועד בשטח", "Attesté", "Attested", "Подтверждено")}, "reconstruction": {"color": "#f0b44c", "name": L("שחזור מבוסס", "Reconstruction argumentée", "Reasoned reconstruction", "Обоснованная реконструкция")}, "hypothesis": {"color": "#e0607e", "name": L("השערה", "Hypothèse", "Hypothesis", "Гипотеза")}},
  "osm": {
    "site": {"osm": "way/32231475"}, "upper": {"osm": "node/907899983"}, "middle": {"osm": "node/7023811683"}, "lower": {"osm": "node/7023814710"},
    "western": {"osm": "way/737549501"}, "storerooms": {"osm": "way/737549509"}, "bath": {"osm": "way/737549519"}, "smallpal": {"osm": ["way/737549499", "way/737549506", "way/737549507"]},
    "columb": {"osm": "way/737549498"}, "swim": {"osm": "way/737549520"}, "watergate": {"osm": "node/913527022"}, "snake": {"osm": "way/97602598"},
    "synagogue": {"osm": "way/737549503"}, "mikveh": {"osm": "way/737549505"}, "lots": {"osm": "node/6177201789"}, "church": {"osm": "way/737549502"},
    "camps": {"tag": "historic=archaeological_site&archaeological_site=fortification", "name": "Camp|מחנה"}, "breach": {"osm": "node/1392658074"}, "rampfoot": {"osm": "way/72016893", "end": "west"}
  },
  "periods": periods, "monuments": M
}
json.dump(out, open(sys.argv[1], "w"), ensure_ascii=False, indent=1)
print(len(M), "fiches")
