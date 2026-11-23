# 真上の図に「自動の点（青）」と「本人の点（橙）」を重ねて見比べる（2026-11-23 --dense の確かめ用）
#   python scripts/tour-compare-dense.py <name> <graph-probe.json か graph.json> [<本人の marks.json>]
import sys, json
from PIL import Image, ImageDraw
D = 'F:/Codex/viewerfix/artifacts/topdown/'
name, gp = sys.argv[1], sys.argv[2]
info = json.load(open(D + name + '.json', encoding='utf-8'))
img = Image.open(D + name + '_mark.png').convert('RGB'); W = img.width
ppm = info['ppm'] * W / info['px']; cx, cz = info['center']['x'], info['center']['z']
uv = lambda x, z: (W / 2 + (x - cx) * ppm, W / 2 + (z - cz) * ppm)
d = ImageDraw.Draw(img)
if len(sys.argv) > 3:
    for m in json.load(open(sys.argv[3], encoding='utf-8'))['points']:
        u, v = uv(m['x'], m['z']); d.ellipse([u - 11, v - 11, u + 11, v + 11], outline=(255, 120, 0), width=4)
g = json.load(open(gp, encoding='utf-8'))
for n in g['nodes']:
    u, v = uv(n['pos']['x'], n['pos']['z']); mk = str(n.get('manual', ''))[:1]
    d.ellipse([u - 6, v - 6, u + 6, v + 6], fill={'s': (255, 60, 200), 'v': (60, 230, 120)}.get(mk, (60, 160, 255)), outline=(255, 255, 255), width=1)
out = D + name + '_dense_vs_owner.png'; img.save(out); print(out, len(g['nodes']))
