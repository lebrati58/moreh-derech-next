# Télécharge chaque fichier, mesure sa durée et découpe en tranches de CHUNK secondes.
# Écrit la matrice GitHub Actions (fichier, début, durée) sur stdout.
import json, subprocess, sys, os
CHUNK = 900
files = json.load(open(sys.argv[1]))
os.makedirs('audio', exist_ok=True)
jobs = []
for i, f in enumerate(files):
    p = f'audio/{i:02d}.m4a'
    subprocess.run(['curl', '-sSL', '--retry', '4', '-o', p,
        f'https://drive.usercontent.google.com/download?id={f["id"]}&export=download&confirm=t'], check=True)
    d = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p],
        capture_output=True, text=True, check=True).stdout.strip())
    print(f'{i:02d} {f["name"]}: {d/60:.1f} min', file=sys.stderr)
    s = 0
    while s < d:
        jobs.append({'i': i, 'start': s, 'len': CHUNK})
        s += CHUNK
print(json.dumps({'include': jobs}))
