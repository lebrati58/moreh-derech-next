# Ajoute au texte vocalisé les marques de lecture Phonikud : U+05AB = accent tonique (mots accentués sur
# l'avant-dernière syllabe), U+05BD = shva prononcé. Entrée/sortie : fichiers passés en argument.
import re, sys
SRC, DST = sys.argv[1], sys.argv[2]
STRESS, NA, SHVA, DAG, SHURUK_V = '֫', 'ֽ', 'ְ', 'ּ', 'וּ'
LET = re.compile(r'[א-ת]')
GUTT = set('אהחע'); NA_FIRST = set('ילמנר')
KEEP_SILENT = {'בְּרוּכִים', 'בְּרֵכָה', 'בְּרֵכַת', 'בְּלִי', 'בְּנוֹ', 'בְּנוֹת', 'כְּבָר', 'כְּרוֹנִיקָן', 'כְּנִרְאֶה', 'הַשְּׁחוֹרִים'}
MILEL = {'מים': 0, 'מהמים': 2, 'ירושלים': 4, 'בירושלים': 5, 'לירושלים': 5, 'אלף': 0, 'באלף': 1, 'ובאלף': 2,
 'מטר': 0, 'הטבח': 1, 'בארך': 1, 'צמת': 0, 'החדר': 1, 'חדר': 0, 'אבן': 0, 'האבן': 1, 'חלק': 0,
 'החלק': 1, 'הנשק': 1, 'והרבע': 2, 'רגע': 0, 'כעשר': 1, 'ושבע': 1, 'ושתים': 2, 'ושנים': 2, 'בשנים': 2,
 'אלפים': 2, 'הכעס': 1, 'צרעת': 1, 'בדצמבר': 2, 'פרופסור': 3, 'לפודקאסט': 2, 'שער': 0, 'בשער': 1, 'לשער': 1,
 'השער': 1, 'מעליה': 2, 'ותושביה': 4, 'אלה': 0, 'זהו': 0, 'מתחת': 1, 'אנחנו': 1, 'קדם': 0, 'ביזנטי': 2,
 'הרברט': 0, 'טילת': 1, 'הקפלה': 2, 'קפלה': 1, 'באפסיס': 1, 'שבוע': 2, 'יודע': 2, 'מפתיע': 2, 'פוגע': 2,
 'שומע': 2, 'מגיע': 1, 'הגיע': 1, 'לארץ': 1, 'הופכת': 2, 'תופסת': 2, 'משפחת': 2, 'שמתחת': 2, 'בפעם': 1, 'בעל': 0, 'קובעת': 2, 'מסיימת': 3, 'קררה': 1, 'קולנוע': 4}
VOC_MILEL = {'בַּיִת': 0, 'הַבַּיִת': 1, 'וְהַבַּיִת': 2, 'תֵּשַׁע': 0, 'הָרֶכֶב': 1}
def groups(tok):
    g = []
    for c in tok:
        if LET.match(c): g.append([c, ''])
        elif g: g[-1][1] += c
    return g
def fix(tok):
    if '־' in tok or not LET.search(tok): return tok
    pre = re.match(r'^[^א-ת]*', tok).group(); post = re.search(r'[^א-ת֑-ׇ]*$', tok).group()
    core = tok[len(pre):len(tok) - len(post)] if post else tok[len(pre):]
    g = groups(core); L = [x[0] for x in g]; skel = ''.join(L)
    def na(i):
        if SHVA in g[i][1] and NA not in g[i][1]: g[i][1] += NA
    if len(g) > 1 and SHVA in g[0][1] and core not in KEEP_SILENT:
        if L[0] in NA_FIRST or L[1] in GUTT or L[0] in 'בכ': na(0)
    if core in KEEP_SILENT: pass
    elif len(g) > 2 and L[0] in 'הומשבכל' and DAG in g[1][1] and SHVA in g[1][1] and (L[1] in NA_FIRST or L[2] in GUTT): na(1)
    if len(g) > 2 and core.startswith(SHURUK_V) and SHVA in g[1][1] and (L[1] in NA_FIRST or L[2] in GUTT): na(1)
    if skel in ('הרצל','והרצל','להרצל','אסטרטגיוס','במסדרון'): g_skip = True
    else: g_skip = False
    for i in ([] if g_skip else range(1, len(g) - 1)):  # deuxième de deux shva, ou deux lettres identiques
        if SHVA in g[i][1] and (SHVA in g[i - 1][1] or L[i] == L[i + 1]) and i != 1: na(i)
    idx = VOC_MILEL.get(core, MILEL.get(skel))
    if idx is not None and idx < len(g) and STRESS not in g[idx][1]: g[idx][1] += STRESS
    return pre + ''.join(a + b for a, b in g) + post
out = '\n'.join(' '.join(fix(t) for t in line.split(' ')) for line in open(SRC, encoding='utf-8').read().split('\n'))
open(DST, 'w', encoding='utf-8').write(out)
print('stress', out.count(STRESS), 'shva-na', out.count(NA))
