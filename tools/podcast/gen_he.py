# Génère le podcast Mamilla en hébreu (Phonikud + Piper). Lancé par .github/workflows/podcast-he.yml.
import sys, os, soundfile as sf
from phonikud_tts import Phonikud, phonemize, Piper
ph = Phonikud('m/phonikud.onnx')
voices = {'D': Piper('m/shaul.onnx', 'm/model.config.json'), 'C': Piper('m/model.onnx', 'm/model.config.json')}
os.makedirs('parts', exist_ok=True)
for i, line in enumerate(l.rstrip('\n') for l in open('tools/podcast/mamilla_he.txt', encoding='utf-8')):
    if '|' not in line: continue
    who, txt = line.split('|', 1)
    p = phonemize(ph.add_diacritics(txt))
    a, sr = voices[who].create(p, is_phonemes=True)
    sf.write(f'parts/{i:03d}_{who}.wav', a, sr)
    print(i, who, round(len(a) / sr, 1), flush=True)
