# Podcast Mamilla en hébreu, narrateur lent. Voyelles = texte vocalisé à la main ;
# Phonikud n'ajoute que ses marques de lecture (accent tonique, shva prononcé). Mots avec qamats qatan : forme Phonikud.
import os, re, json
import soundfile as sf, numpy as np
from phonikud_tts import Phonikud, phonemize, Piper
from phonikud import lexicon
ph = Phonikud('m/phonikud.onnx'); voice = Piper('m/shaul.onnx', 'm/model.config.json')
SPECIAL = set(lexicon.NON_STANDARD_DIAC)
NIK = re.compile(r'[֑-ׇ]'); LET = re.compile(r'[א-ת]')
def split_letters(w):
    out = []  # [(letter, marks)]
    for c in w:
        if LET.match(c): out.append([c, ''])
        elif out: out[-1][1] += c
        else: out.append(['', c])
    return out
def merge(mine, auto):
    if 'ׇ' in mine: return auto
    a, b = split_letters(mine), split_letters(auto)
    if [x[0] for x in a] != [x[0] for x in b]: return mine
    return ''.join(l + m + ''.join(c for c in m2 if c in SPECIAL and c not in m) for (l, m), (_, m2) in zip(a, b))
paras = [p.strip() for p in open('tools/podcast/mamilla_he_nikud_m.txt', encoding='utf-8').read().split('\n\n') if p.strip()]
log, sr0, chunks = [], None, []
for pi, p in enumerate(paras):
    p = p.replace('—', ',').replace('…', ',')
    sents = [s for s in re.split(r'(?<=[.?!:])\s+', p) if s.strip()]
    for s in sents:
        auto = ph.add_diacritics(NIK.sub('', s)).split(' ')
        mine = s.split(' ')
        text = ' '.join(merge(m, a) for m, a in zip(mine, auto)) if len(auto) == len(mine) else s
        phon = phonemize(text)
        a, sr = voice.create(phon, is_phonemes=True, length_scale=1.25)
        sr0 = sr; chunks += [a, np.zeros(int(sr * 0.45), dtype=a.dtype)]
        log.append({'p': pi, 'text': text, 'ipa': phon, 'aligned': len(auto) == len(mine)})
    chunks.append(np.zeros(int(sr0 * 0.6), dtype=chunks[0].dtype))
sf.write('narrateur_lent.wav', np.concatenate(chunks), sr0)
os.makedirs('tools/podcast/out', exist_ok=True)
json.dump(log, open('tools/podcast/out/phonemes_lent.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('ok', len(log))
