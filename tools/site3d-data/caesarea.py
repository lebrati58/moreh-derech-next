# Fiches de Césarée (Moreh Derech NEXT — sites 3D). Hébreu d'abord, puis fr/en/ru.
# Sources : cours (Drive, סיור 15), Josèphe, Wikipédia, World History Encyclopedia, J. Patrich (HUJI), HolyLandPhotos.
import json, sys

D15 = {"kind": "drive", "label": "סיור 15 — קיסריה (סיכום הקורס)", "url": "https://drive.google.com/file/d/1nwk2048WZtIiPv1y52lEPk4VtU7pbDQA/view"}
DJ = {"kind": "drive", "label": "קיסריה מריטימה — מדריך (חורחה)", "url": "https://drive.google.com/file/d/10nBEUsWEtqUIRqgI1HEEreXPjFvH4CsE/view"}
DR = {"kind": "drive", "label": "התקופה הרומית הראשונה (סיכום הרצאה)", "url": "https://drive.google.com/file/d/16VZd3J6UNXoADV1hFpMrUoOJi0_y4pRA/view"}
WIKI = {"kind": "online", "label": "Caesarea Maritima (Wikipedia)", "url": "https://en.wikipedia.org/wiki/Caesarea_Maritima"}
WHE = {"kind": "online", "label": "The Infrastructure of Caesarea Maritima (World History Encyclopedia)", "url": "https://www.worldhistory.org/article/2313/the-infrastructure-of-caesarea-maritima/"}
PAT = {"kind": "online", "label": "J. Patrich — The Herodian hippo-stadium (HUJI)", "url": "https://pluto.huji.ac.il/~patrichj/my_web_site/hippo-stadium.html"}
HLP = {"kind": "online", "label": "Caesarea seaside circus (HolyLandPhotos)", "url": "https://holylandphotos.org/browse/caesarea-seaside-circushippodrome"}
OSM = lambda w: {"kind": "online", "label": "OpenStreetMap " + w, "url": "https://www.openstreetmap.org/" + w}
def L(he, fr, en, ru): return {"he": he, "fr": fr, "en": en, "ru": ru}
HEROD = L("הורדוס", "Hérode", "Herod", "Ирод")

periods = [
  {"n": 1, "name": L("מגדל סטרטון (הלניסטית)", "Tour de Straton (hellénistique)", "Straton’s Tower (Hellenistic)", "Стратонова башня (эллинизм)"), "dates": L("המאות ה-4–1 לפנה״ס", "IVe–Ier s. av. J.-C.", "4th–1st c. BCE", "IV–I вв. до н. э.")},
  {"n": 2, "name": L("הורדוס", "Hérode", "Herod", "Ирод"), "dates": L("22–4 לפנה״ס", "22–4 av. J.-C.", "22–4 BCE", "22–4 гг. до н. э.")},
  {"n": 3, "name": L("רומית — בירת הפרובינציה", "Romaine — capitale provinciale", "Roman — provincial capital", "Римская — столица провинции"), "dates": L("6–324 לסה״נ", "6–324 apr. J.-C.", "6–324 CE", "6–324 гг. н. э.")},
  {"n": 4, "name": L("ביזנטית", "Byzantine", "Byzantine", "Византийская"), "dates": L("324–640", "324–640", "324–640", "324–640")},
  {"n": 5, "name": L("ערבית קדומה", "Arabe ancienne", "Early Islamic", "Раннеисламская"), "dates": L("640–1101", "640–1101", "640–1101", "640–1101")},
  {"n": 6, "name": L("צלבנית", "Croisée", "Crusader", "Крестоносцы"), "dates": L("1101–1265", "1101–1265", "1101–1265", "1101–1265")},
  {"n": 7, "name": L("הכפר הבוסני", "Le village bosniaque", "The Bosnian village", "Боснийская деревня"), "dates": L("1884–1948", "1884–1948", "1884–1948", "1884–1948")},
  {"n": 8, "name": L("קיסריה היום", "Césarée aujourd’hui", "Caesarea today", "Кесария сегодня"), "dates": L("גן לאומי", "parc national", "national park", "национальный парк")},
]
M = []
def mon(**k): M.append(k)

mon(id="caesarea_straton", **{"from": 1, "to": 1}, certainty="attested",
    name=L("מגדל סטרטון", "La tour de Straton", "Straton’s Tower", "Стратонова башня"),
    text=L("היישוב ההלניסטי שעל חורבותיו ייסד הורדוס את קיסריה.", "La bourgade hellénistique sur les ruines de laquelle Hérode fonda Césarée.", "The Hellenistic settlement on whose ruins Herod founded Caesarea.", "Эллинистическое поселение, на руинах которого Ирод основал Кесарию."),
    placementNote=L("מקומו המדויק אינו בנתוני המפה.", "Sa position exacte n’est pas dans les données cartographiques.", "Its exact position is not in the map data.", "Точного места нет в картографических данных."),
    sources=[DJ, WIKI])

mon(id="caesarea_harbour", **{"from": 2, "to": 4}, certainty="reconstruction", pri=3,
    name=L("נמל סבסטוס", "Le port Sébastos", "Sebastos harbour", "Гавань Себастос"), builder=HEROD,
    text=L("הנמל המלאכותי של הורדוס, על שם אוגוסטוס (״סבסטוס״). שוברי הגלים נבנו בבטון הידראולי מאפר געשי (פוצולנה) שהובא מאיטליה והוטבע בתיבות עץ בים. משקל האבנים הטביע את הנמל, וחלקו הפנימי התמלא בחול.",
           "Le port artificiel d’Hérode, nommé d’après Auguste (« Sébastos »). Les môles furent coulés en béton hydraulique de cendre volcanique (pouzzolane) importée d’Italie, dans des caissons de bois. Le poids les fit s’enfoncer ; le bassin intérieur s’est ensablé.",
           "Herod’s artificial harbour, named after Augustus (“Sebastos”). The breakwaters were poured in hydraulic concrete made with volcanic ash (pozzolana) from Italy, in wooden forms at sea. Their weight made them sink; the inner basin silted up.",
           "Искусственная гавань Ирода, названная в честь Августа («Себастос»). Молы отлиты из гидравлического бетона на вулканическом пепле (пуццолане) из Италии в деревянных опалубках. Под тяжестью они осели; внутренний бассейн занесло песком."),
    dims=L("שובר הגלים הדרומי כ-500 מ׳, הצפוני כ-275 מ׳; שטח המים כ-100,000 מ״ר (ויקיפדיה). היום בעומק של כ-5–6 מ׳.", "Môle sud env. 500 m, nord env. 275 m ; env. 100 000 m² d’eau (Wikipédia). Aujourd’hui à 5–6 m de fond.", "Southern breakwater c. 500 m, northern c. 275 m; c. 100,000 m² of water (Wikipedia). Now 5–6 m under water.", "Южный мол ок. 500 м, северный ок. 275 м; ок. 100 000 м² воды (Википедия). Сейчас на глубине 5–6 м."),
    placementNote=L("צורת שוברי הגלים שרטוטית: אורכם לפי המקורות, המסלול מוערך מקו החוף (OpenStreetMap) ומסימון ״נמל קיסריה״. אינה מבוססת על מפת סקר תת-ימי.", "Tracé des môles schématique : longueurs d’après les sources, parcours estimé depuis le trait de côte (OpenStreetMap) et le point « port de Césarée ». Pas d’après un relevé sous-marin.", "Breakwater layout schematic: lengths from the sources, course estimated from the coastline (OpenStreetMap) and the “Caesarea Harbour” point. Not from an underwater survey.", "Схема молов: длины по источникам, ход оценён по береговой линии (OpenStreetMap) и точке «гавань Кесарии». Не по подводной съёмке."),
    schematic=True, shape={"type": "breakwater", "lines": [[{"off": "o:harbour", "dx": -160, "dz": 150}, {"off": "o:harbour", "dx": -470, "dz": 140}, {"off": "o:harbour", "dx": -540, "dz": -40}], [{"off": "o:harbour", "dx": -235, "dz": -165}, {"off": "o:harbour", "dx": -490, "dz": -130}]], "w": 30, "kind": "kurkar"},
    sources=[D15, DJ, WIKI, OSM("node/4260769638")])

mon(id="caesarea_temple", **{"from": 2, "to": 3}, certainty="hypothesis", pri=2,
    name=L("מקדש אוגוסטוס ורומא", "Le temple d’Auguste et de Rome", "Temple of Augustus and Roma", "Храм Августа и Ромы"), builder=HEROD,
    text=L("מקדש על במה מוגבהת שהשקיף על הנמל. בתקופה הביזנטית נבנתה במקומו כנסייה; המוסלמים הפכו אותה למסגד, והצלבנים חזרו והפכו אותה לכנסייה.", "Temple sur une plate-forme dominant le port. À l’époque byzantine une église le remplaça ; les musulmans en firent une mosquée, les croisés de nouveau une église.", "A temple on a raised platform overlooking the harbour. In Byzantine times a church replaced it; the Muslims turned it into a mosque, the Crusaders back into a church.", "Храм на платформе над гаванью. В византийское время его заменила церковь; мусульмане сделали её мечетью, крестоносцы — снова церковью."),
    dims=L("במה של כ-100 × 90 מ׳ (World History Encyclopedia).", "Plate-forme d’env. 100 × 90 m (World History Encyclopedia).", "Platform about 100 × 90 m (World History Encyclopedia).", "Платформа около 100 × 90 м (World History Encyclopedia)."),
    placementNote=L("המיקום משוער (ממזרח לנמל הפנימי); אין לבמה קו מתאר בנתוני המפה. המקדש עצמו משוחזר בצורה כללית.", "Position estimée (à l’est du bassin intérieur) : la plate-forme n’a pas de contour dans les données. Temple restitué de façon générale.", "Position estimated (east of the inner basin): the platform has no outline in the data. Temple reconstructed in general form.", "Положение оценочное (к востоку от внутреннего бассейна): у платформы нет контура в данных. Храм восстановлен в общих чертах."),
    schematic=True, shape={"type": "temple", "at": {"off": "o:harbour", "dx": 70, "dz": 0}, "bearing": 270, "podiumW": 100, "podiumD": 90, "kind": "kurkar"},
    sources=[D15, WHE, WIKI])

mon(id="caesarea_theater", **{"from": 2, "to": 8}, certainty="attested", keep=True, pri=3,
    name=L("התיאטרון", "Le théâtre", "The theatre", "Театр"), builder=HEROD,
    text=L("התיאטרון הרומי הקדום ביותר שנחשף בארץ, בדרום העיר, פונה אל הים. במה, קיר סקנה, אורקסטרה וקוויאה; ההצגות נערכו בצהריים תחת יריעות צל (ולאריום). בתקופה הביזנטית הופרד מן העיר בחומה.",
           "Le plus ancien théâtre romain mis au jour dans le pays, au sud de la ville, face à la mer : scène, mur de scène, orchestre, cavea ; spectacles à midi sous un velum. À l’époque byzantine, un mur le sépara de la ville.",
           "The oldest Roman theatre excavated in the country, south of the city, facing the sea: stage, scaena, orchestra, cavea; shows at midday under an awning (velarium). In Byzantine times a wall separated it from the city.",
           "Древнейший раскопанный в стране римский театр, на юге города, лицом к морю: сцена, скена, орхестра, кавея; представления в полдень под тентом (веларием). В византийское время его отделила от города стена."),
    dims=L("כ-7,000 מקומות; גדול בשליש ממה שנראה היום (סיכום הקורס).", "Env. 7 000 places ; un tiers plus grand que ce qu’on voit aujourd’hui (cours).", "About 7,000 seats; a third larger than what is seen today (course notes).", "Около 7000 мест; на треть больше видимого сегодня (материалы курса)."),
    otherView=L("World History Encyclopedia: כ-4,000 צופים (התיאטרון המשוחזר).", "World History Encyclopedia : env. 4 000 spectateurs (théâtre restauré).", "World History Encyclopedia: about 4,000 spectators (restored theatre).", "World History Encyclopedia: около 4000 зрителей (восстановленный театр)."),
    events=L("1961: במהלך חפירות משלחת איטלקית נמצאה כאן ״אבן פילטוס״ — הכתובת היחידה מזמנו הנזכרת בשמו ובתוארו של פונטיוס פילטוס.", "1961 : une mission italienne y trouve la « pierre de Pilate », seule inscription contemporaine portant le nom et le titre de Ponce Pilate.", "1961: an Italian expedition found the “Pilate stone” here — the only contemporary inscription with Pontius Pilate’s name and title.", "1961: итальянская экспедиция нашла здесь «камень Пилата» — единственную современную ему надпись с именем и титулом Понтия Пилата."),
    placementNote=L("מיקום, רדיוס וכיוון לפי קו המתאר ב-OpenStreetMap; קיר הסקנה משוחזר.", "Position, rayon et orientation d’après le contour OpenStreetMap ; mur de scène restitué.", "Position, radius and orientation from the OpenStreetMap outline; scaena reconstructed.", "Положение, радиус и ориентация по контуру OpenStreetMap; скена восстановлена."),
    schematic=True, shape={"type": "theater", "fit": "theater", "kind": "kurkar", "seatKind": "limestone", "rows": 26, "scaenaH": 16},
    sources=[D15, DJ, WHE, OSM("way/24578362")])

mon(id="caesarea_palace", **{"from": 2, "to": 8}, certainty="attested", keep=True, pri=2,
    name=L("ארמון השונית", "Le palais du promontoire", "The Promontory Palace", "Дворец на мысу"), builder=HEROD,
    text=L("ארמון הורדוס על שונית בים, בשני מפלסים: התחתון סביב בריכה חצובה בסלע, העליון סביב גינה עם מסדרונות מקורים. אחרי מות הורדוס — מושב הנציבים (פרטוריום); לפי ספר מעשי השליחים נכלא בו פאולוס שנתיים.",
           "Le palais d’Hérode sur un récif, sur deux niveaux : en bas autour d’une piscine taillée dans le roc, en haut autour d’un jardin à portiques. Après Hérode, siège des préfets (prétoire) ; selon les Actes, Paul y fut détenu deux ans.",
           "Herod’s palace on a reef, on two levels: the lower around a rock-cut pool, the upper around a garden with porticoes. After Herod, the governors’ seat (praetorium); according to Acts, Paul was held here for two years.",
           "Дворец Ирода на рифе, в два уровня: нижний вокруг высеченного в скале бассейна, верхний вокруг сада с портиками. После Ирода — резиденция наместников (преторий); по Деяниям, здесь два года содержался Павел."),
    dims=L("בריכה של 35 × 18 מ׳ (סיכום הקורס).", "Piscine de 35 × 18 m (cours).", "Pool 35 × 18 m (course notes).", "Бассейн 35 × 18 м (материалы курса)."),
    placementNote=L("הבריכה ממוקמת במרכז קו המתאר של הארמון (OpenStreetMap); כיוון הבריכה לפי ציר קו המתאר.", "Piscine au centre du contour du palais (OpenStreetMap), orientée selon son axe.", "Pool at the centre of the palace outline (OpenStreetMap), aligned on its axis.", "Бассейн в центре контура дворца (OpenStreetMap), по его оси."),
    schematic=True, shape={"type": "pool", "fit": "palace", "W": 35, "D": 18, "peristyle": 5, "kind": "kurkar"},
    sources=[D15, DJ, WHE, OSM("way/96066573")])

mon(id="caesarea_hippostadium", **{"from": 2, "to": 3}, certainty="attested", pri=2,
    name=L("ההיפוסטדיון של הורדוס", "L’hippo-stade d’Hérode", "Herod’s hippo-stadium", "Гиппостадион Ирода"), builder=HEROD,
    text=L("מבנה רב-תכליתי ליד ארמון השונית: מרוצי סוסים, קרבות גלדיאטורים ותחרויות אתלטיקה. לפי יוסף בן מתתיהו כינס כאן פילטוס את היהודים שהפגינו נגד הצבת סמלי הקיסר בירושלים.",
           "Édifice polyvalent près du palais : courses de chevaux, gladiateurs, athlétisme. Selon Josèphe, Pilate y réunit les Juifs qui protestaient contre les enseignes impériales à Jérusalem.",
           "A multi-purpose venue next to the palace: horse races, gladiators, athletics. According to Josephus, Pilate gathered here the Jews protesting against the imperial standards in Jerusalem.",
           "Многоцелевая арена у дворца: скачки, гладиаторы, атлетика. По Иосифу, здесь Пилат собрал иудеев, протестовавших против имперских знамён в Иерусалиме."),
    dims=L("זירה באורך כ-300 מ׳ וברוחב כ-50 מ׳ (HolyLandPhotos); ללא ספינה; שערי זינוק מקבילים.", "Arène d’env. 300 × 50 m (HolyLandPhotos) ; sans spina ; stalles de départ parallèles.", "Arena about 300 × 50 m (HolyLandPhotos); no spina; parallel starting gates.", "Арена около 300 × 50 м (HolyLandPhotos); без спины; параллельные стартовые ворота."),
    otherView=L("קיבולת: כ-13,000 (פטריך) לעומת כ-5,000 (HolyLandPhotos).", "Capacité : env. 13 000 (Patrich) contre env. 5 000 (HolyLandPhotos).", "Capacity: about 13,000 (Patrich) vs about 5,000 (HolyLandPhotos).", "Вместимость: около 13 000 (Патрих) против около 5000 (HolyLandPhotos)."),
    shape={"type": "circus", "fit": "hippo", "curved": 180, "kind": "kurkar", "rows": 12},
    sources=[D15, DJ, PAT, HLP, OSM("way/318664239")])

mon(id="caesarea_aqueduct", **{"from": 2, "to": 8}, certainty="attested", keep=True, pri=2,
    name=L("אמת המים הגבוהה", "L’aqueduc haut", "The high-level aqueduct", "Верхний акведук"), builder=L("הורדוס; הורחבה בידי לגיונות רומיים", "Hérode ; agrandi par des légions romaines", "Herod; extended by Roman legions", "Ирод; расширен римскими легионами"),
    text=L("בקיסריה אין מעיינות, ולכן הובאו מים ממעיינות שוני וצברין בקשתות לאורך החוף. על האמה כתובות הקדשה של לגיונות (השישי, העשירי, ה-22 — שמו נמחק לאחר מרד בר כוכבא).",
           "Pas de sources à Césarée : l’eau venait des sources de Shuni et Sabarin, sur des arches le long de la côte. Inscriptions de légions (VIe, Xe, XXIIe — nom effacé après la révolte de Bar Kokhba).",
           "Caesarea has no springs, so water was brought from the Shuni and Sabarin springs on arches along the coast. Legion dedications are carved on it (VI, X, XXII — erased after the Bar Kokhba revolt).",
           "В Кесарии нет источников: воду вели от источников Шуни и Сабарин по аркам вдоль берега. На акведуке надписи легионов (VI, X, XXII — имя стёрто после восстания Бар-Кохбы)."),
    dims=L("כ-10 ק״מ (World History Encyclopedia).", "Env. 10 km (World History Encyclopedia).", "About 10 km (World History Encyclopedia).", "Около 10 км (World History Encyclopedia)."),
    placementNote=L("התוואי לפי OpenStreetMap; גובה הקשתות לצורך המחשה.", "Tracé d’après OpenStreetMap ; hauteur des arches indicative.", "Line from OpenStreetMap; arch height indicative.", "Трасса по OpenStreetMap; высота арок условная."),
    schematic=True, shape={"type": "aqueduct", "osm": "aqueduct", "h": 6, "kind": "kurkar"},
    sources=[D15, DJ, WHE, OSM("way/97344367")])

mon(id="caesarea_pilate", **{"from": 3, "to": 3}, certainty="attested",
    name=L("אבן פילטוס", "La pierre de Pilate", "The Pilate stone", "Камень Пилата"),
    text=L("כתובת לטינית שבה מקדיש ״פונטיוס פילטוס, נציב יהודה״ מבנה בשם טיבריאום לכבוד הקיסר טיבריוס. נמצאה בשימוש משני כמדרגה בתיאטרון (1961).", "Inscription latine où « Ponce Pilate, préfet de Judée » dédie un Tiberieum à l’empereur Tibère. Retrouvée en remploi comme marche du théâtre (1961).", "A Latin inscription in which “Pontius Pilate, prefect of Judaea” dedicates a Tiberieum to the emperor Tiberius. Found reused as a step in the theatre (1961).", "Латинская надпись, где «Понтий Пилат, префект Иудеи» посвящает Тиберий императору Тиберию. Найдена как ступень театра (1961)."),
    placementNote=L("הסימון בתיאטרון, מקום מציאתה; המקור במוזיאון ישראל.", "Repère au théâtre, lieu de la découverte ; l’original est au musée d’Israël.", "Marker at the theatre, where it was found; the original is in the Israel Museum.", "Метка у театра, где камень найден; оригинал в Музее Израиля."),
    shape={"type": "marker", "at": {"off": "o:theater", "dx": 0, "dz": -30}, "h": 6}, sources=[DJ, D15])

mon(id="caesarea_synagogue", **{"from": 3, "to": 4}, certainty="attested",
    name=L("בית הכנסת העתיק", "L’ancienne synagogue", "The ancient synagogue", "Древняя синагога"),
    text=L("ברובע היהודי שבקצה הצפוני של העיר, רחוק מהתיאטרון, ההיפודרום והמקדש (סיכום הקורס).", "Dans le quartier juif, à l’extrémité nord de la ville, loin du théâtre, de l’hippodrome et du temple (cours).", "In the Jewish quarter at the northern end of the city, far from the theatre, hippodrome and temple (course notes).", "В еврейском квартале на северном краю города, вдали от театра, ипподрома и храма (материалы курса)."),
    shape={"type": "marker", "at": "o:synagogue", "h": 6}, sources=[D15, OSM("node/4796874989")])

mon(id="caesarea_bath", **{"from": 3, "to": 8}, certainty="attested", keep=True,
    name=L("בית המרחץ", "Les thermes", "The bathhouse", "Бани"),
    text=L("בית מרחץ רומי בשלושה אזורים: חם (קלדריום, חימום מתחת לרצפה מתנור), ביניים (טפידריום) וקר (פריגידריום, צינורות חרס ועופרת). לידו חצר עמודים עם פסיפס.", "Bain romain en trois zones : chaude (caldarium, chauffage par le sol depuis un four), tiède (tepidarium), froide (frigidarium, tuyaux de terre cuite et de plomb). À côté, une cour à colonnes avec mosaïque.", "A Roman bath in three zones: hot (caldarium, underfloor heating from a furnace), warm (tepidarium) and cold (frigidarium, clay and lead pipes). Next to it, a colonnaded court with mosaic.", "Римская баня в трёх зонах: горячая (кальдарий, подогрев пола от печи), тёплая (тепидарий) и холодная (фригидарий, глиняные и свинцовые трубы). Рядом двор с колоннами и мозаикой."),
    placementNote=L("קווי המתאר לפי OpenStreetMap (״Bathhouse״).", "Contours d’après OpenStreetMap (« Bathhouse »).", "Outlines from OpenStreetMap (“Bathhouse”).", "Контуры по OpenStreetMap («Bathhouse»)."),
    shape={"type": "footprint", "osm": "bath", "h": 3.5, "kind": "kurkar"}, sources=[D15, DJ, OSM("way/96065403")])

mon(id="caesarea_mithraeum", **{"from": 3, "to": 3}, certainty="attested",
    name=L("המיתראום", "Le mithraeum", "The Mithraeum", "Митреум"),
    text=L("מקום פולחן לאל מיתרה במרתף מקומר שמתחת לבמה המשקיפה על הנמל; בקיץ חודרת קרן אור דרך פתח בתקרה אל המזבח.", "Sanctuaire de Mithra dans une voûte sous la plate-forme dominant le port ; en été, un rayon de soleil passe par une ouverture du plafond jusqu’à l’autel.", "A shrine of Mithras in a vault under the platform above the harbour; in summer a sunbeam enters through an opening in the ceiling onto the altar.", "Святилище Митры в своде под платформой над гаванью; летом луч солнца через отверстие в потолке падает на алтарь."),
    placementNote=L("מקומו המדויק אינו בנתוני המפה.", "Sa position exacte n’est pas dans les données cartographiques.", "Its exact position is not in the map data.", "Точного места нет в данных."),
    sources=[D15, DJ])

mon(id="caesarea_east_hippodrome", **{"from": 4, "to": 8}, certainty="attested", keep=True, pri=2,
    name=L("ההיפודרום המזרחי", "L’hippodrome oriental", "The eastern hippodrome", "Восточный ипподром"),
    text=L("היפודרום ייעודי למרוצי סוסים ומרכבות, ממזרח לעיר (סיכום הקורס מונה אותו בבנייה הביזנטית). בזירה שרידי אובליסק.", "Hippodrome réservé aux courses de chevaux et de chars, à l’est de la ville (le cours le range dans la construction byzantine). Restes d’un obélisque dans l’arène.", "A hippodrome for horse and chariot races east of the city (the course lists it among the Byzantine works). Remains of an obelisk in the arena.", "Ипподром для скачек и колесниц к востоку от города (курс относит его к византийскому строительству). В арене остатки обелиска."),
    dims=L("World History Encyclopedia: 457 × 76 מ׳, כ-38,000 מקומות.", "World History Encyclopedia : 457 × 76 m, env. 38 000 places.", "World History Encyclopedia: 457 × 76 m, about 38,000 seats.", "World History Encyclopedia: 457 × 76 м, около 38 000 мест."),
    otherView=L("יש המתארכים את בנייתו לתקופה הרומית (המאה ה-2) ואת השימוש בו גם לתקופה הביזנטית.", "Certains datent sa construction de l’époque romaine (IIe s.) et son usage jusqu’à l’époque byzantine.", "Some date its construction to the Roman period (2nd c.) with use into Byzantine times.", "Некоторые датируют постройку римским временем (II в.), а использование — византийским."),
    shape={"type": "circus", "fit": "easthippo", "curved": 180, "kind": "kurkar", "rows": 14, "spina": True},
    sources=[D15, WHE, OSM("way/318664216")])

mon(id="caesarea_byz_wall", **{"from": 4, "to": 4}, certainty="attested",
    name=L("החומה הביזנטית", "La muraille byzantine", "The Byzantine wall", "Византийская стена"),
    text=L("בתקופה הביזנטית, כשהעיר הגיעה לשיא גודלה, הוקפה בחומה חדשה ומורחבת; בימי הורדוס לא הייתה לעיר חומה.", "À l’époque byzantine, au sommet de son extension, la ville reçut une nouvelle muraille élargie ; sous Hérode, elle n’en avait pas.", "In Byzantine times, at its largest, the city received a new, wider wall; under Herod it had none.", "В византийское время, в пору наибольшего размера, город получил новую расширенную стену; при Ироде стены не было."),
    placementNote=L("התוואי אינו בנתוני המפה ולכן אינו מצויר.", "Le tracé n’est pas dans les données et n’est pas dessiné.", "The line is not in the data and is not drawn.", "Трассы нет в данных, она не нарисована."), sources=[D15, DJ])

mon(id="caesarea_crusader", **{"from": 6, "to": 6}, certainty="attested",
    name=L("העיר הצלבנית", "La ville croisée", "The Crusader town", "Город крестоносцев"),
    text=L("הצלבנים כבשו את העיר ב-1101; העיר הצלבנית קטנה בהרבה מן הביזנטית. ב-1251 ביצר אותה לואי התשיעי בחומות גבוהות ובחפיר עמוק. העיר נחרבה בידי הממלוכים.", "Les croisés prirent la ville en 1101 ; la ville croisée est bien plus petite que la byzantine. En 1251, Louis IX la fortifia de hauts murs et d’un fossé profond. Elle fut détruite par les Mamelouks.", "The Crusaders took the city in 1101; the Crusader town was much smaller than the Byzantine one. In 1251 Louis IX fortified it with high walls and a deep moat. The Mamluks destroyed it.", "Крестоносцы взяли город в 1101 г.; их город намного меньше византийского. В 1251 г. Людовик IX укрепил его высокими стенами и глубоким рвом. Мамлюки его разрушили."),
    placementNote=L("החומות הצלבניות אינן בנתוני המפה ולכן אינן מצוירות.", "Les murs croisés ne sont pas dans les données et ne sont pas dessinés.", "The Crusader walls are not in the data and are not drawn.", "Стен крестоносцев нет в данных, они не нарисованы."), sources=[DJ, WIKI])

mon(id="caesarea_bosnian", **{"from": 7, "to": 7}, certainty="attested",
    name=L("הכפר הבוסני", "Le village bosniaque", "The Bosnian village", "Боснийская деревня"),
    text=L("פליטים מוסלמים מבוסניה יושבו כאן בידי השלטון העות׳מאני (1884–1948) ובנו כפר בסגנון אירופי עם מסגד. בשנות ה-50 פוצצו רוב הבתים, מלבד המסגד ומבנים בודדים.", "Des réfugiés musulmans de Bosnie furent installés ici par les Ottomans (1884–1948) et bâtirent un village à l’européenne avec une mosquée. Dans les années 1950, la plupart des maisons furent dynamitées, sauf la mosquée et quelques bâtiments.", "Muslim refugees from Bosnia were settled here by the Ottomans (1884–1948) and built a European-style village with a mosque. In the 1950s most houses were blown up, except the mosque and a few buildings.", "Мусульманские беженцы из Боснии были поселены здесь османами (1884–1948) и построили деревню европейского типа с мечетью. В 1950-е большинство домов взорвали, кроме мечети и немногих зданий."),
    placementNote=L("המסגד אינו בנתוני המפה שנאספו ולכן אינו מצויר.", "La mosquée n’est pas dans les données recueillies et n’est pas dessinée.", "The mosque is not in the collected data and is not drawn.", "Мечети нет в собранных данных, она не нарисована."), sources=[DJ, WIKI])

out = {
  "site": "caesarea", "title": L("קיסריה", "Césarée", "Caesarea", "Кесария"), "defaultPeriod": 2, "cubitMeters": 0.5, "stone": "kurkar", "tint": "#f2dcb4", "sea": True,
  "home": {"at": {"off": "o:hippo", "dx": 0, "dz": -150}, "dist": 1300, "from": 120, "elev": 30},
  "terrain": {"lo": "#c9b48a", "mid": "#dcc9a0", "hi": "#e9dcbd"},
  "otherSites": {"masada": L("מצדה", "Massada", "Masada", "Масада"), "caesarea": L("קיסריה", "Césarée", "Caesarea", "Кесария"), "beitshean": L("בית שאן", "Beit Shean", "Beit She'an", "Бейт-Шеан")},
  "certainty": {"attested": {"color": "#3fbf8a", "name": L("מתועד בשטח", "Attesté", "Attested", "Подтверждено")}, "reconstruction": {"color": "#f0b44c", "name": L("שחזור מבוסס", "Reconstruction argumentée", "Reasoned reconstruction", "Обоснованная реконструкция")}, "hypothesis": {"color": "#e0607e", "name": L("השערה", "Hypothèse", "Hypothesis", "Гипотеза")}},
  "osm": {"harbour": {"osm": "node/4260769638"}, "theater": {"osm": "way/24578362"}, "palace": {"osm": "way/96066573"}, "hippo": {"osm": "way/318664239"}, "easthippo": {"osm": "way/318664216"},
          "aqueduct": {"osm": ["way/97344367", "way/924516308", "way/924516309"]}, "synagogue": {"osm": "node/4796874989"}, "bath": {"osm": ["way/96065403", "way/96066637"]}},
  "periods": periods, "monuments": M
}
json.dump(out, open(sys.argv[1], "w"), ensure_ascii=False, indent=1)
print(len(M), "fiches")
