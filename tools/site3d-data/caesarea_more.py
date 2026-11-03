# Césarée — compléments d'après les documents du cours (Drive) : dépliant RTG « גן לאומי קיסריה » (20 points de visite),
# סיור 15 (résumé du cours), guide de Jorge et sa fiche d'examen. Ajoute / met à jour les fiches dans public/sites3d/caesarea/site.json
# (idempotent : on peut le relancer). Positions : nœuds OpenStreetMap de geo.json quand ils existent ; sinon tracé SCHÉMATIQUE signalé.
# Usage : python3 tools/site3d-data/caesarea_more.py
import json, os
P = os.path.join(os.path.dirname(__file__), "..", "..", "public", "sites3d", "caesarea", "site.json")
D = json.load(open(P))

def L(he, fr, en, ru): return {"he": he, "fr": fr, "en": en, "ru": ru}
RTG = {"kind": "drive", "label": "רשות הטבע והגנים — דפדפת גן לאומי קיסריה", "url": "https://drive.google.com/file/d/1tCvFvM5lKnyi8x6Jzeh-q4je-4a56e85/view"}
D15 = {"kind": "drive", "label": "סיור 15 — קיסריה (סיכום הקורס)", "url": "https://drive.google.com/file/d/1nwk2048WZtIiPv1y52lEPk4VtU7pbDQA/view"}
DJ = {"kind": "drive", "label": "קיסריה מריטימה — מדריך (חורחה)", "url": "https://drive.google.com/file/d/10nBEUsWEtqUIRqgI1HEEreXPjFvH4CsE/view"}
DJX = {"kind": "drive", "label": "קיסריה — מחברת בחינה (חורחה)", "url": "https://drive.google.com/file/d/1gFAPO41YN1puCzNwh8gAiCVF7qasPuJb/view"}
def OSM(w): return {"kind": "online", "label": "OpenStreetMap " + w, "url": "https://www.openstreetmap.org/" + w}
APPROX = L("מיקום משוער", "Position approximative", "Approximate position", "Примерное место")

D["osm"].update({"timetrek": {"osm": "node/1113039357"}, "postern": {"osm": "node/4746415246"}, "nymph": {"osm": "way/659568251"},
                 "govpalace": {"osm": "way/659568250"}, "birds": {"osm": "way/318663938"}, "lowaq": {"osm": ["way/956404750", "way/956404751"]},
                 "bosnian": {"osm": "way/1119857280"}, "bathS": {"osm": "way/96065403"}})
PLAT = {"off": "o:harbour", "dx": 70, "dz": 0}   # même point que le temple d'Auguste (במת המקדש)
M = {m["id"]: m for m in D["monuments"]}
def put(m):
  if m["id"] in M: M[m["id"]].clear(); M[m["id"]].update(m)
  else: D["monuments"].append(m); M[m["id"]] = m
def upd(id, **k): M[id].update(k)

# ---------- corrections d'après le dépliant RTG ----------
upd("caesarea_bath", **{"from": 4}, pri=2,
    shape={"type": "bathhouse", "at": "o:bathS", "bearing": 10, "level": "max", "W": 30, "D": 25, "h": 7, "kind": "kurkar", "ruinFrom": 5},
    dims=L("כ-30 × 25 מ׳ (קווי המתאר ב-OpenStreetMap), ובצפון חצר עמודים.", "Env. 30 × 25 m (contour OpenStreetMap), avec une cour à colonnes au nord.", "About 30 × 25 m (OpenStreetMap outline), with a colonnaded court to the north.", "Около 30 × 25 м, к северу двор с колоннами."),
    placementNote=L("מיקום וכיוון לפי קווי המתאר ב-OpenStreetMap. חלוקת החדרים, הגבהים ומספר הבריכות הם שחזור (השערה); הגגות הוסרו כדי לראות פנימה. מתועד: החם במערב והקר במזרח, תנור והיפוקאוסט, שתי מערכות מים (חרס ועופרת), רצפת שיש שהוחזרה למקומה, וחצר עמודים עם פסיפס מצפון. מועד הנטישה אינו במקורות — מהתקופה הערבית הקדומה מוצגים השרידים כפי שהם היום.",
                    "Position et orientation d’après le contour OpenStreetMap. Partition des salles, hauteurs et nombre de bassins : restitution (hypothèse) ; toits retirés pour voir l’intérieur. Documenté : chaud à l’ouest, froid à l’est, four et hypocauste, deux réseaux d’eau (terre cuite et plomb), sol de marbre remis en place, cour à colonnes et mosaïque au nord. La date d’abandon n’est pas dans les sources : à partir de l’époque arabe ancienne, on montre les vestiges tels qu’aujourd’hui.",
                    "Position and orientation from the OpenStreetMap outline. Room layout, heights and number of pools are a reconstruction (hypothesis); roofs removed to show the inside. Documented: hot to the west, cold to the east, furnace and hypocaust, two water systems (clay and lead), the marble floor reset in place, and a colonnaded court with mosaic to the north. The date of abandonment is not in the sources: from the Early Islamic period on, the remains are shown as they are today.",
                    "Положение по OpenStreetMap; планировка — реконструкция; крыши сняты. С раннеисламского периода показаны руины, как сегодня."),
    text=L("בית מרחץ שנבנה במאה ה-5 לספירה מעל מושבי ההיפודרום, אחרי שזה יצא משימוש (רט״ג). שלושה אזורים: חם (קלדריום, חימום מתחת לרצפה מתנור), ביניים (טפידריום) וקר (פריגידריום, צינורות חרס ועופרת). מאות פיסות שיש צבעוני הוחזרו לרצפה; מצפון — חצר עמודים לאימון ולמפגשים.",
           "Thermes bâtis au Ve s. sur les gradins de l’hippodrome, après son abandon (RTG). Trois zones : chaude (caldarium, chauffage sous le sol), tiède (tepidarium) et froide (frigidarium, tuyaux de terre cuite et de plomb). Des centaines de plaques de marbre coloré ont été remises en place ; au nord, une cour à colonnes pour l’exercice et les rencontres.",
           "A bathhouse built in the 5th century CE over the hippodrome seats, after the hippodrome went out of use (Parks Authority). Three zones: hot (caldarium, underfloor heating), warm (tepidarium) and cold (frigidarium, clay and lead pipes). Hundreds of coloured marble pieces were reset in the floor; to the north, a colonnaded court for exercise and meeting.",
           "Баня V в. н. э., построенная на трибунах ипподрома после того, как он вышел из употребления (Управление парков). Три зоны: горячая (кальдарий), тёплая (тепидарий) и холодная (фригидарий). В пол возвращены сотни плиток цветного мрамора; к северу — двор с колоннами."),
    sources=[RTG, D15, DJ, OSM("way/96065403")])
upd("caesarea_hippostadium", **{"to": 8},
    placementNote=L("קווי המתאר לפי OpenStreetMap (״Herodian Hippodrome״). אחרי שיצא משימוש נשארו מושביו, ועליהם נבנה בית המרחץ במאה ה-5 (רט״ג); היום ניתן לראות את הזירה הארוכה ליד ארמון השונית.", "Contour d’après OpenStreetMap. Après son abandon, ses gradins restent et les thermes y sont bâtis au Ve s. (RTG) ; on voit aujourd’hui la longue arène près du palais.", "Outline from OpenStreetMap. After it went out of use its seats remained and the bathhouse was built on them in the 5th century (Parks Authority); the long arena can be seen today next to the palace.", "Контур по OpenStreetMap. После запустения на его трибунах в V в. построили баню; длинную арену видно и сегодня."),
    dims=L("זירה באורך כ-250–300 מ׳ (חורחה; HolyLandPhotos); כ-10,000 מקומות (רט״ג, חורחה); המושבים נבנו רק משלושה צדדים — ממערב הים.", "Arène d’env. 250–300 m (Jorge ; HolyLandPhotos) ; env. 10 000 places (RTG, Jorge) ; gradins sur trois côtés seulement — la mer à l’ouest.", "Arena about 250–300 m long (Jorge; HolyLandPhotos); about 10,000 seats (Parks Authority, Jorge); seats on three sides only — the sea to the west.", "Арена около 250–300 м; около 10 000 мест; трибуны только с трёх сторон — с запада море."),
    sources=M["caesarea_hippostadium"]["sources"] + [RTG, DJX])
th = M["caesarea_theater"]
th["events"] = L(th["events"]["he"] + " במאה ה-3 נוסף קיר סקנה בגובה שלוש קומות; מאוחר יותר הפך השטח שלפני הבמה לבריכה להצגות מים. בתקופה הביזנטית הוקף התיאטרון במצודה, אולי מפני מרד השומרונים (529). היום כ-3,700 מקומות לקונצרטים (רט״ג).",
                 th["events"]["fr"] + " Au IIIe s., mur de scène de trois étages ; plus tard, l’espace devant la scène devient un bassin pour des spectacles d’eau. À l’époque byzantine, le théâtre est entouré d’une forteresse, peut-être contre la révolte samaritaine (529). Aujourd’hui env. 3 700 places pour des concerts (RTG).",
                 th["events"]["en"] + " In the 3rd century a three-storey scaenae frons was added; later the area in front of the stage became a pool for water shows. In Byzantine times the theatre was enclosed in a fortress, perhaps against the Samaritan revolt (529). Today about 3,700 seats for concerts (Parks Authority).",
                 th["events"]["ru"] + " В III в. добавлена трёхъярусная скена; позднее площадка перед сценой стала бассейном для водных представлений. В византийское время театр обнесли крепостью, возможно из-за самаритянского восстания (529).")
th["sources"] = th["sources"] + [RTG]

# ---------- fiches sans tracé : maintenant dessinées ----------
mi = M["caesarea_mithraeum"]
mi.update(text=L("מקדש קטן לאל הפרסי מיתרה במאה ה-3, באחד הקמרונות של במת המקדש — חיילי הצבא הרומי הפיצו את פולחנו (רט״ג). בראש הקמרון פתח: ביום הארוך בשנה חודרת קרן אור אל המזבח. פולחן מיתרה השפיע על הנצרות: יום ראשון (יום השמש), 25 בדצמבר, הילה סביב הראש (סיכום הקורס).",
                   "Petit sanctuaire du dieu perse Mithra au IIIe s., dans une des voûtes de la plate-forme du temple — les soldats romains répandaient son culte (RTG). Une ouverture au sommet de la voûte laisse passer, le jour le plus long, un rayon jusqu’à l’autel. Le culte de Mithra a influencé le christianisme : dimanche (jour du Soleil), 25 décembre, auréole (cours).",
                   "A small 3rd-century shrine of the Persian god Mithras, in one of the vaults of the temple platform — Roman soldiers spread his cult (Parks Authority). An opening at the top of the vault lets a sunbeam reach the altar on the longest day. Mithraism influenced Christianity: Sunday, 25 December, the halo (course notes).",
                   "Небольшое святилище Митры III в. в одном из сводов платформы храма. В своде отверстие: в самый длинный день луч падает на алтарь."),
          placementNote=L("סימון משוער בקמרונות במת המקדש (ליד מרכז המבקרים, OpenStreetMap); הקמרון המדויק אינו בנתוני המפה.", "Repère approximatif dans les voûtes de la plate-forme (près du centre des visiteurs, OpenStreetMap) ; la voûte exacte n’est pas dans les données.", "Approximate marker in the temple-platform vaults (near the visitor centre, OpenStreetMap); the exact vault is not in the data.", "Примерная отметка в сводах платформы храма."),
          shape={"type": "marker", "at": {"off": "o:timetrek", "dx": 15, "dz": 25}, "h": 6}, sources=[RTG, D15, DJ, OSM("node/1113039357")])

cr = M["caesarea_crusader"]
cr.update(certainty="reconstruction", pri=3,
          dims=L("כ-120 דונם; 15 מגדלים; חפיר עמוק; שלושה שערים; החומה הצפונית כ-230 מ׳ (רט״ג).", "Env. 120 dounams ; 15 tours ; fossé profond ; trois portes ; mur nord env. 230 m (RTG).", "About 120 dunams; 15 towers; a deep moat; three gates; the north wall about 230 m (Parks Authority).", "Около 120 дунамов; 15 башен; глубокий ров; трое ворот; северная стена около 230 м."),
          events=L("1251: לואי התשיעי, מלך צרפת (״הקדוש״), ביצר את העיר בחומות ובחפיר. בשער המזרחי — גשר עץ מעל החפיר שהמגינים הסירו בעת מלחמה; בפינה הדרום-מזרחית פתח גיחה (פוטרנה) לקרקעית החפיר. 1265: הסולטאן הממלוכי בייברס כבש את העיר והחריב אותה.",
                   "1251 : Louis IX, roi de France (« Saint Louis »), fortifie la ville de murs et d’un fossé. À la porte est, un pont de bois au-dessus du fossé, retiré en temps de guerre ; à l’angle sud-est, une poterne vers le fond du fossé. 1265 : le sultan mamelouk Baybars prend et détruit la ville.",
                   "1251: King Louis IX of France (“Saint Louis”) fortified the town with walls and a moat. At the east gate, a wooden bridge over the moat, removed in wartime; at the south-east corner, a postern down to the moat floor. 1265: the Mamluk sultan Baybars took and destroyed the town.",
                   "1251: Людовик IX укрепил город стенами и рвом. 1265: мамлюкский султан Бейбарс взял и разрушил город."),
          placementNote=L("המתאר שרטוטי: עוגן בפתח הגיחה שבפינה הדרום-מזרחית (OpenStreetMap), חומה מזרחית מקבילה לחוף וחומות צפונית ודרומית עד הים. האורכים כאן קצרים מהמתועד (120 דונם) — זה רק כיוון כללי.",
                              "Contour schématique : ancré sur la poterne de l’angle sud-est (OpenStreetMap), mur est parallèle à la côte, murs nord et sud jusqu’à la mer. Longueurs plus courtes que la réalité (120 dounams) : indication générale seulement.",
                              "Schematic outline: anchored on the south-east postern (OpenStreetMap), east wall parallel to the shore, north and south walls to the sea. Shorter than documented (120 dunams): a general indication only.",
                              "Схематичный контур от потерны в юго-восточном углу; короче, чем в действительности."),
          shape={"type": "wall", "kind": "kurkar", "h": 10, "thick": 3, "towerEvery": 55, "towerH": 13, "towerW": 8,
                 "lines": [[{"ll": [32.50545, 34.8913]}, {"ll": [32.50545, 34.89322]}, {"ll": [32.502241, 34.893217]}, {"ll": [32.502241, 34.89115]}]]},
          sources=[RTG, D15, DJ, OSM("node/4746415246")])

bo = M["caesarea_bosnian"]
bo.update(**{"to": 8}, keep=True, certainty="reconstruction",
          text=L("פליטים מוסלמים מבוסניה יושבו כאן בידי השלטון העות׳מאני (1884–1948) על חורבות קיסריה, ובנו כפר בסגנון אירופי — כ-80 בתים עם גגות רעפים ומסגד. בשנות ה-50 פוצצו רוב הבתים; המסגד ומבנים בודדים נשארו.",
                 "Des réfugiés musulmans de Bosnie furent installés ici par les Ottomans (1884–1948) sur les ruines, et bâtirent un village à l’européenne — env. 80 maisons à toits de tuiles et une mosquée. Dans les années 1950, la plupart des maisons furent dynamitées ; la mosquée et quelques bâtiments restent.",
                 "Muslim refugees from Bosnia were settled here by the Ottomans (1884–1948) on the ruins and built a European-style village — about 80 tiled-roof houses and a mosque. In the 1950s most houses were blown up; the mosque and a few buildings remain.",
                 "Боснийские беженцы-мусульмане (1884–1948) построили здесь деревню европейского типа — около 80 домов и мечеть; в 1950-е почти все дома взорвали, мечеть осталась."),
          placementNote=L("המבנה ההיסטורי שליד הנמל ב-OpenStreetMap; הזיהוי כמסגד הוא הערכה.", "Bâtiment historique près du port dans OpenStreetMap ; son identification comme la mosquée est une estimation.", "Historic building near the harbour in OpenStreetMap; its identification as the mosque is an estimate.", "Историческое здание у гавани в OpenStreetMap; отождествление с мечетью предположительно."),
          shape={"type": "mosque", "at": "o:bosnian"}, sources=[DJ, RTG, OSM("way/1119857280")])

# ---------- nouvelles fiches ----------
put({"id": "caesarea_praetorium", "from": 3, "to": 3, "certainty": "attested",
     "name": L("בית המשפט והכלא (פרטוריום)", "Le tribunal et la prison (prétoire)", "The court and prison (praetorium)", "Суд и тюрьма (преторий)"),
     "text": L("המפלס העליון של ארמון השונית, סביב חצר פנימית, שימש בתקופה הרומית לבית משפט (פרטוריום). לכאן הובא השליח פאולוס, ששהה במאסר שנתיים לפני שנשלח למשפט ברומא (מעשי השליחים). מאוחר יותר הוצאו להורג בקיסריה מרטירים נוצרים, ולפי התלמוד — גם רבי עקיבא.",
               "Le niveau supérieur du palais du promontoire, autour d’une cour intérieure, servit de tribunal (prétoire) à l’époque romaine. L’apôtre Paul y fut amené et resta deux ans en prison avant d’être envoyé à Rome (Actes). Plus tard, des martyrs chrétiens furent exécutés à Césarée, et selon le Talmud aussi Rabbi Akiva.",
               "The upper level of the Promontory Palace, around an inner court, served as the Roman court (praetorium). The apostle Paul was brought here and held for two years before being sent to trial in Rome (Acts). Later Christian martyrs were executed in Caesarea, and according to the Talmud also Rabbi Akiva.",
               "Верхний уровень дворца на мысу служил римским судом (преторием). Здесь два года держали апостола Павла (Деяния); позже в Кесарии казнили христианских мучеников и, по Талмуду, рабби Акиву."),
     "placementNote": L("סימון משוער ממזרח לבריכה, במפלס העליון.", "Repère approximatif à l’est de la piscine, au niveau supérieur.", "Approximate marker east of the pool, on the upper level.", "Примерная отметка к востоку от бассейна."),
     "shape": {"type": "marker", "at": {"off": "o:palace", "dx": 55, "dz": 0}, "h": 6}, "sources": [RTG, DJ, D15]})
put({"id": "caesarea_nymphaeum", "from": 3, "to": 3, "certainty": "reconstruction",
     "name": L("הנימפאון", "Le nymphée", "The nymphaeum", "Нимфей"),
     "text": L("מזרקה ציבורית מפוארת לנוי ולמי שתייה, בצומת הרחוב הראשי והירידה מן העיר אל הנמל. בחזיתה קיר מונומנטלי ובו פסלי שיש; בבריכה נמצא פסל הִיגִיאָה, אלת הניקיון והבריאות (המקור במוזיאון שדות ים). בתקופה הביזנטית יצאה הבריכה משימוש ולפניה נסלל רחוב.",
               "Une fontaine publique monumentale, ornementale et d’eau potable, au carrefour de la rue principale et de la descente vers le port. Façade à statues de marbre ; dans le bassin, une statue d’Hygie, déesse de la propreté et de la santé (original au musée de Sdot Yam). À l’époque byzantine, le bassin est abandonné et une rue pavée passe devant.",
               "A monumental public fountain, for show and drinking water, at the junction of the main street and the way down to the harbour. A façade with marble statues; in the pool, a statue of Hygieia, goddess of cleanliness and health (original at the Sdot Yam museum). In Byzantine times the pool went out of use and a street was paved in front.",
               "Монументальный общественный фонтан на перекрёстке главной улицы и спуска к гавани; статуя Гигиеи (оригинал в музее Сдот-Ям)."),
     "placementNote": L("מוצב על המזרקה העתיקה שב-OpenStreetMap; הזיהוי כנימפאון הוא הערכה.", "Placé sur la fontaine antique d’OpenStreetMap ; son identification comme le nymphée est une estimation.", "Placed on the ancient fountain in OpenStreetMap; identifying it as the nymphaeum is an estimate.", "Поставлен на античный фонтан из OpenStreetMap; отождествление предположительно."),
     "shape": {"type": "facade", "at": "o:nymph", "W": 16, "h": 9, "apse": True, "kind": "kurkar", "bearing": 270}, "sources": [RTG, OSM("way/659568251")]})
put({"id": "caesarea_gov_palace", "from": 4, "to": 8, "keep": True, "certainty": "reconstruction", "pri": 1,
     "name": L("ארמון המושל הביזנטי (הרובע המנהלי)", "Le palais du gouverneur byzantin (quartier administratif)", "The Byzantine governor’s palace (administrative quarter)", "Дворец византийского наместника"),
     "text": L("קריית הממשל של קיסריה, בירת פלשתינה פרימה: אגף בצורת אולם אפסידלי ששימש בית משפט, משרדי פקידים ולשכת המס, ואולם אפסידלי נוסף — כנראה הארכיון או הספרייה. בקמרונות הסמוכים שרידי ציור של 13 דמויות עם הילה (השליחים) ושל טרקלין. פסיפסים וכתובות מעידים על השימושים.",
               "Le centre gouvernemental de Césarée, capitale de la Palaestina Prima : une aile en salle à abside servant de tribunal, des bureaux et le bureau des impôts, et une autre salle à abside — sans doute les archives ou la bibliothèque. Dans les voûtes voisines, restes d’une peinture de 13 personnages auréolés (les apôtres) et d’un triclinium. Mosaïques et inscriptions renseignent sur les usages.",
               "Caesarea’s government quarter, capital of Palaestina Prima: an apsidal hall used as the law court, offices and the tax bureau, and another apsidal hall — probably the archive or library. In the nearby vaults, remains of a painting of 13 haloed figures (the apostles) and of a triclinium. Mosaics and inscriptions tell how the rooms were used.",
               "Правительственный квартал столицы Палестины Первой: апсидальный зал суда, канцелярии и налоговое ведомство, архив или библиотека."),
     "placementNote": L("קווי המתאר של חורבה ב-OpenStreetMap מדרום לעיר הצלבנית, ליד החוף; הזיהוי עם ארמון המושל הוא הערכה.", "Contour d’une ruine d’OpenStreetMap au sud de la ville croisée, près de la côte ; l’identification avec le palais est une estimation.", "Outline of a ruin in OpenStreetMap south of the Crusader town, near the shore; identifying it as the palace is an estimate.", "Контур руины из OpenStreetMap к югу от города крестоносцев; отождествление предположительно."),
     "shape": {"type": "footprint", "osm": "govpalace", "h": 4, "kind": "kurkar"}, "sources": [RTG, D15, OSM("way/659568250")]})
put({"id": "caesarea_statues", "from": 4, "to": 8, "keep": True, "certainty": "attested",
     "name": L("גן הפסלים — קארדו ביזנטי", "Le jardin des statues — cardo byzantin", "The statues square — Byzantine cardo", "Площадь статуй — византийский кардо"),
     "text": L("ממזרח לחומה הצלבנית שרידי רחוב מרוצף לוחות שיש, תחום בשני קירות — כנראה הרחוב הראשי של קיסריה הביזנטית, מעוטר בפסלים. בולטים שני פסלים ענקיים חסרי ראש וידיים מהתקופה הרומית, שהוצבו על מושבי גרניט. נחשף ב-1951 בעת הכשרת שטח לחקלאות.",
               "À l’est du mur croisé, une rue dallée de marbre bordée de deux murs — sans doute la rue principale de la Césarée byzantine, ornée de statues. Deux statues colossales romaines, sans tête ni bras, posées sur des sièges de granite. Mise au jour en 1951 lors de travaux agricoles.",
               "East of the Crusader wall, a marble-paved street between two walls — probably the main street of Byzantine Caesarea, adorned with statues. Two colossal headless and armless Roman statues stand on granite seats. Exposed in 1951 while preparing land for farming.",
               "К востоку от стены крестоносцев — мощённая мрамором улица, вероятно главная улица византийской Кесарии, со статуями; две колоссальные римские статуи без голов на гранитных сиденьях."),
     "placementNote": L("סימון משוער ממזרח לחומה הצלבנית; התוואי אינו בנתוני המפה.", "Repère approximatif à l’est du mur croisé ; le tracé n’est pas dans les données.", "Approximate marker east of the Crusader wall; the line is not in the data.", "Примерная отметка к востоку от стены."),
     "shape": {"type": "marker", "at": {"ll": [32.5036, 34.8946]}, "h": 7}, "sources": [RTG]})
put({"id": "caesarea_low_aqueduct", "from": 4, "to": 8, "keep": True, "certainty": "attested",
     "name": L("אמת המים הנמוכה", "L’aqueduc bas", "The low-level aqueduct", "Нижний акведук"),
     "text": L("בתקופה הביזנטית נבנתה אמה נוספת שהובילה את מי המעיינות שליד מעגן מיכאל, כ-5 ק״מ מצפון לעיר. המעיינות היו נמוכים מדי לזרימה בכוח הכובד, ולכן נבנה סכר שאגר את המים והעלה את מפלסם.",
               "À l’époque byzantine, un autre aqueduc amena l’eau des sources près de Maagan Michael, à env. 5 km au nord. Les sources étant trop basses pour un écoulement par gravité, un barrage retint l’eau et en éleva le niveau.",
               "In Byzantine times another aqueduct brought water from the springs near Ma’agan Michael, about 5 km north. The springs were too low for gravity flow, so a dam stored the water and raised its level.",
               "В византийское время построен ещё один акведук от источников у Маагана-Михаэля (~5 км к северу); плотина поднимала уровень воды."),
     "placementNote": L("התוואי לפי OpenStreetMap.", "Tracé d’après OpenStreetMap.", "Line from OpenStreetMap.", "Трасса по OpenStreetMap."),
     "shape": {"type": "aqueduct", "osm": "lowaq", "h": 2, "kind": "kurkar"}, "sources": [RTG, OSM("way/956404750")]})
put({"id": "caesarea_bird_mosaic", "from": 4, "to": 8, "keep": True, "certainty": "attested",
     "name": L("פסיפס הציפורים", "La mosaïque des oiseaux", "The Bird Mosaic", "Мозаика с птицами"),
     "text": L("רצפת פסיפס מהתקופה הביזנטית ובה עשרות מדליונים עם ציורי ציפורים, בחצר של אחוזה מפוארת בפאתי העיר.", "Sol de mosaïque byzantin à des dizaines de médaillons d’oiseaux, dans la cour d’une riche demeure à la périphérie de la ville.", "A Byzantine mosaic floor with dozens of medallions showing birds, in the courtyard of a wealthy mansion on the city’s edge.", "Византийский мозаичный пол с десятками медальонов с птицами во дворе богатой усадьбы."),
     "placementNote": L("קווי המתאר לפי OpenStreetMap.", "Contour d’après OpenStreetMap.", "Outline from OpenStreetMap.", "Контур по OpenStreetMap."),
     "shape": {"type": "footprint", "osm": "birds", "h": 0.8, "kind": "kurkar"}, "sources": [OSM("way/318663938"), {"kind": "online", "label": "פסיפס הציפורים (ויקיפדיה)", "url": "https://he.wikipedia.org/wiki/%D7%A4%D7%A1%D7%99%D7%A4%D7%A1_%D7%94%D7%A6%D7%99%D7%A4%D7%95%D7%A8%D7%99%D7%9D_(%D7%A7%D7%99%D7%A1%D7%A8%D7%99%D7%94)"}]})
put({"id": "caesarea_octagon", "from": 4, "to": 4, "certainty": "reconstruction",
     "name": L("הכנסייה המתומנת", "L’église octogonale", "The octagonal church", "Восьмиугольная церковь"),
     "text": L("בסוף המאה ה-5 נבנתה על חורבות מקדש אוגוסטוס כנסייה מתומנת; במת המקדש המשיכה לשמש אתר פולחן כ-1,400 שנה (רט״ג).", "À la fin du Ve s., une église octogonale est bâtie sur les ruines du temple d’Auguste ; la plate-forme reste un lieu de culte pendant env. 1 400 ans (RTG).", "At the end of the 5th century an octagonal church was built over the ruins of the Temple of Augustus; the platform remained a place of worship for about 1,400 years (Parks Authority).", "В конце V в. на руинах храма Августа построена восьмиугольная церковь."),
     "placementNote": L("על במת המקדש; הצורה כללית.", "Sur la plate-forme du temple ; forme générale.", "On the temple platform; general shape.", "На платформе храма; форма общая."),
     "shape": {"type": "hall", "at": PLAT, "W": 34, "D": 34, "h": 9, "domeR": 11, "kind": "kurkar"}, "sources": [RTG, D15]})
put({"id": "caesarea_mosque_abbasid", "from": 5, "to": 5, "certainty": "reconstruction",
     "name": L("המסגד העבאסי", "La mosquée abbasside", "The Abbasid mosque", "Аббасидская мечеть"),
     "text": L("בתקופה העבאסית (המאות 9–10) נבנה מסגד בראש הבמה; לפי גאוגרפים מהמאה ה-10 היה גבוה וחצרו השקיפה על הים (רט״ג). העיר הצטמקה, הנמל נסתם ובמקומו נבנה רובע מגורים.", "À l’époque abbasside (IXe–Xe s.), une mosquée est bâtie sur la plate-forme ; selon les géographes du Xe s., elle était haute et sa cour dominait la mer (RTG). La ville rétrécit, le port s’ensable et un quartier d’habitation le recouvre.", "In the Abbasid period (9th–10th c.) a mosque stood on the platform; 10th-century geographers describe it as tall, its court overlooking the sea (Parks Authority). The town shrank, the harbour silted up and houses were built over it.", "В аббасидское время на платформе построена мечеть; гавань занесло песком."),
     "placementNote": L("על במת המקדש; הצורה כללית.", "Sur la plate-forme ; forme générale.", "On the platform; general shape.", "На платформе; форма общая."),
     "shape": {"type": "mosque", "at": PLAT}, "sources": [RTG, D15]})
put({"id": "caesarea_cathedral", "from": 6, "to": 6, "certainty": "reconstruction",
     "name": L("הכנסייה הצלבנית", "L’église croisée", "The Crusader church", "Церковь крестоносцев"),
     "text": L("אחרי הכיבוש הצלבני (1101) נבנתה בראש הבמה כנסייה; שרידי שלושת האפסיסים שלה נראים גם היום. היא נהרסה בכיבוש הממלוכי במאה ה-13.", "Après la conquête croisée (1101), une église est bâtie sur la plate-forme ; on voit encore les restes de ses trois absides. Détruite lors de la conquête mamelouke au XIIIe s.", "After the Crusader conquest (1101) a church was built on the platform; remains of its three apses are still visible. It was destroyed in the Mamluk conquest in the 13th century.", "После 1101 г. на платформе построена церковь; видны остатки трёх апсид."),
     "placementNote": L("על במת המקדש; הצורה כללית.", "Sur la plate-forme ; forme générale.", "On the platform; general shape.", "На платформе; форма общая."),
     "shape": {"type": "basilica", "at": PLAT, "L": 48, "W": 22, "H": 13, "bearing": 0}, "sources": [RTG, D15]})
put({"id": "caesarea_citadel", "from": 6, "to": 6, "certainty": "reconstruction",
     "name": L("המצודה הצלבנית", "La citadelle croisée", "The Crusader citadel", "Цитадель крестоносцев"),
     "text": L("על בסיס שובר הגלים הדרומי של נמל הורדוס, אולי במקום המגדלור, מבוצרת בפני עצמה ומנותקת מהעיר בתעלה ברוחב כ-20 מ׳ עם גשר עץ. קירות בעובי עד 4 מ׳, שני מגדלים, מרתפים למזון ולתחמושת. ב-1265 החריב אותה בייברס; היום פועלת על שרידיה מסעדה.",
               "Sur la base du môle sud du port d’Hérode, peut-être à l’emplacement du phare, fortifiée à part et séparée de la ville par un fossé d’env. 20 m franchi par un pont de bois. Murs jusqu’à 4 m d’épaisseur, deux tours, caves à vivres et munitions. Détruite par Baybars en 1265 ; un restaurant occupe aujourd’hui ses restes.",
               "On the base of the southern breakwater of Herod’s harbour, perhaps where the lighthouse stood, fortified on its own and cut off from the town by a channel about 20 m wide with a wooden bridge. Walls up to 4 m thick, two towers, cellars for food and ammunition. Destroyed by Baybars in 1265; a restaurant stands on its remains today.",
               "На основании южного мола гавани Ирода, отделена рвом ~20 м; стены до 4 м, две башни; разрушена Бейбарсом в 1265 г."),
     "placementNote": L("סימון משוער בשורש שובר הגלים הדרומי.", "Repère approximatif à la racine du môle sud.", "Approximate marker at the root of the southern breakwater.", "Примерная отметка у основания южного мола."),
     "shape": {"type": "tower", "at": {"off": "o:harbour", "dx": -150, "dz": 140}, "W": 22, "h": 14, "kind": "kurkar"}, "sources": [RTG]})

json.dump(D, open(P, "w"), ensure_ascii=False, indent=1)
print(len(D["monuments"]), "fiches")
