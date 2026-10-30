# Sort le texte par page de quelques documents en annotations (gzip+base64, ≤ 10 × 4 000 caractères par tâche),
# pour le travail pédagogique hors de GitHub. Rien n'est commité.
# plan  : python text_out.py plan <ids> → matrice [{id, a, b}] (plages de pages tenant dans une tâche)
# emit  : python text_out.py emit <id> <a> <b>
import base64, gzip, json, os, sys
T = 'rtg-text'
def load(i): return json.load(gzip.open(f'{T}/{i}.json.gz', 'rt', encoding='utf-8'))
def blob(pages): return base64.b64encode(gzip.compress(json.dumps(pages, ensure_ascii=False).encode(), 9)).decode()
if sys.argv[1] == 'plan':
    out = []
    for i in [x.strip() for x in sys.argv[2].split(',') if x.strip()]:
        try: P = load(i)['pages']
        except Exception: continue
        a = 0
        while a < len(P):
            b = a + 1
            while b < len(P) and len(blob(P[a:b + 1])) <= 38000: b += 1
            out.append({'id': i, 'a': a, 'b': b}); a = b
    print(json.dumps({'include': out}))
else:
    i, a, b = sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
    s = blob(load(i)['pages'][a:b])
    for k in range(0, len(s), 3900): print(f'::notice title=rtgtext {i} {a} {b} {k // 3900}::{s[k:k + 3900]}')
