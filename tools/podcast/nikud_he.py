# Ajoute le nikoud (standard, sans les signes spéciaux de Phonikud) à chaque réplique.
import re
from phonikud_onnx import Phonikud
from phonikud import lexicon
ph = Phonikud('m/phonikud.onnx')
out = []
for line in open('tools/podcast/mamilla_he.txt', encoding='utf-8'):
    line = line.rstrip('\n')
    if '|' not in line: continue
    who, txt = line.split('|', 1)
    v = re.sub(fr"[{lexicon.NON_STANDARD_DIAC}]", '', ph.add_diacritics(txt))
    out.append(f'{who}|{v}')
open('tools/podcast/out/mamilla_he_nikud.txt', 'w', encoding='utf-8').write('\n'.join(out) + '\n')
