# Podcast Mamilla en hébreu, narrateur lent (voix Shaul).
# Nikoud : Phonikud lit la phrase (accent tonique et shva compris) ; les mots listés dans
# tools/podcast/forcer.txt (forme sans nikoud -> forme vocalisée à imposer) remplacent sa lecture.
import os, re, json
import soundfile as sf, numpy as np
from phonikud_tts import Phonikud, phonemize, Piper
from phonikud import lexicon
ph = Phonikud('m/phonikud.onnx'); voice = Piper('m/shaul.onnx', 'm/model.config.json')
NIK = re.compile(r'[֑-ׇ]')
force = {}
if os.path.exists('tools/podcast/forcer.txt'):
    for l in open('tools/podcast/forcer.txt', encoding='utf-8'):
        if '=' in l: k, v = l.rstrip('\n').split('=', 1); force[k.strip()] = v.strip()
def strip_p(w): return re.sub(r'[^א-ת׳\']', '', NIK.sub('', w))
paras = [p.strip() for p in open('tools/podcast/mamilla_he_tts.txt', encoding='utf-8').read().split('\n\n') if p.strip()]
log, chunks, sr0 = [], [], 22050
for pi, p in enumerate(paras):
    p = p.replace('—', ',').replace('…', ',')
    for s in [x for x in re.split(r'(?<=[.?!:])\s+', p) if x.strip()]:
        text = s  # texte vocalisé à la main + marques de lecture (tools/podcast/marks.py)
        phon = phonemize(text)
        a, sr = voice.create(phon, is_phonemes=True, length_scale=1.25)
        sr0 = sr; chunks += [a, np.zeros(int(sr * 0.45), dtype=a.dtype)]
        log.append({'p': pi, 'mine': s, 'auto': text, 'ipa': phon, 'ipa_mine': ''})
    chunks.append(np.zeros(int(sr0 * 0.6), dtype=chunks[0].dtype))
sf.write('narrateur_lent.wav', np.concatenate(chunks), sr0)
os.makedirs('tools/podcast/out', exist_ok=True)
json.dump({'special': list(lexicon.NON_STANDARD_DIAC), 'log': log}, open('tools/podcast/out/phonemes_lent.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('ok', len(log))
