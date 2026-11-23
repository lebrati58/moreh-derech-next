# Podcast Mamilla en hébreu, narrateur (voix Shaul), texte vocalisé à la main.
# Version A : nikoud du texte tel quel. Version B : nikoud automatique Phonikud (avec accent tonique).
import os, re, sys, subprocess
import soundfile as sf
from phonikud_tts import Phonikud, phonemize, Piper
mode = sys.argv[1]
ph = Phonikud('m/phonikud.onnx')
voice = Piper('m/shaul.onnx', 'm/model.config.json')
NIKUD = re.compile(r'[֑-ׇ]')
paras = [p.strip() for p in open('tools/podcast/mamilla_he_nikud_m.txt', encoding='utf-8').read().split('\n\n') if p.strip()]
os.makedirs(f'parts_{mode}', exist_ok=True)
for i, p in enumerate(paras):
    p = p.replace('—', ',').replace('…', ',')
    text = p if mode == 'A' else ph.add_diacritics(NIKUD.sub('', p))
    a, sr = voice.create(phonemize(text), is_phonemes=True)
    sf.write(f'parts_{mode}/{i:03d}.wav', a, sr)
    print(mode, i, round(len(a) / sr, 1), flush=True)
