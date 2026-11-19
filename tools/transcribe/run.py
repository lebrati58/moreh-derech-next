# Transcrit une tranche d'un fichier audio (hébreu, modèle ivrit.ai). Sortie : "[hh:mm:ss] texte" par segment.
import sys
from faster_whisper import WhisperModel
src, offset, out = sys.argv[1], float(sys.argv[2]), sys.argv[3]
m = WhisperModel('ivrit-ai/whisper-large-v3-turbo-ct2', device='cpu', compute_type='int8', cpu_threads=4)
segs, _ = m.transcribe(src, language='he', beam_size=5, vad_filter=True, condition_on_previous_text=False)
with open(out, 'w', encoding='utf-8') as fh:
    for s in segs:
        t = int(s.start + offset)
        fh.write(f'[{t//3600:02d}:{t%3600//60:02d}:{t%60:02d}] {s.text.strip()}\n')
