# 図面の無い物件で、作った平面図に部屋の名前を付けるための材料（2026-11-26 本人「場所など書いていないのでよくわからない」）。
#   python scripts/photomap-labelkit.py <作業 dir（td.json / rooms.json / views.json）> [--out=label_kit.jpg]
#   部屋ごとに、選んだ地点から 4 方向（最初の向き・右・後ろ・左）の眺めを並べた 1 枚を作る。見出しに 部屋番号・地点 id・世界座標 (x, z)・広さ。
#   これを見て <作業 dir>/td_labels.json に [{x, z, text, textEn, kind:"room"}] を書く（x, z は rooms.json の center か地点の座標）。
import sys, json, urllib.request
import numpy as np, cv2
UA = {'User-Agent': 'Mozilla/5.0 (photomap-labelkit)'}
args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = lambda k, d=None: next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith(f'--{k}=')), d)
D = args[0]; out = opt('out', f'{D}/label_kit.jpg')
td = json.load(open(f'{D}/td.json', encoding='utf-8')); rooms = json.load(open(f'{D}/rooms.json')); views = json.load(open(f'{D}/views.json'))
ORIGIN = 'https://locahun3d.com'
g = json.load(urllib.request.urlopen(urllib.request.Request(f"{ORIGIN}/api/pano/{td['key']}.graph.json", headers=UA)))
base = f"{ORIGIN}/api/pano/{td['key']}-g{g['set']}-"; byid = {n['id']: n for n in g['nodes']}
def get(u):
    try: return cv2.imdecode(np.frombuffer(urllib.request.urlopen(urllib.request.Request(u, headers=UA)).read(), np.uint8), cv2.IMREAD_COLOR)
    except Exception: return None
def render(faces, yaw_deg, w=320, h=240, hfov=96):
    fp = w / 2 / np.tan(np.radians(hfov) / 2)
    xs, ys = np.meshgrid(np.arange(w) + .5 - w / 2, (h / 2) - (np.arange(h) + .5))
    dx, dy, dz = xs / fp, ys / fp, np.ones_like(xs); c, s = np.cos(np.radians(yaw_deg)), np.sin(np.radians(yaw_deg))
    dx, dz = dx * c + dz * s, -dx * s + dz * c
    o = np.zeros((h, w, 3), np.uint8); ax, ay, az = np.abs(dx), np.abs(dy), np.abs(dz)
    side = (ax >= ay) & (ax >= az); vert = ~side & (ay >= az); rest = ~side & ~vert
    sel = {'r': side & (dx > 0), 'l': side & (dx <= 0), 'u': vert & (dy > 0), 'd': vert & (dy <= 0), 'f': rest & (dz > 0), 'b': rest & (dz <= 0)}
    for f, mk in sel.items():
        if not mk.any() or faces.get(f) is None: continue
        im = faces[f]; S = im.shape[0]
        u, v = {'r': (-dz / ax, dy / ax), 'l': (dz / ax, dy / ax), 'u': (dx / ay, -dz / ay), 'd': (dx / ay, dz / ay), 'f': (dx / az, dy / az), 'b': (-dx / az, dy / az)}[f]
        px = np.clip(((u + 1) / 2 * S).astype(int), 0, S - 1); py = np.clip(((1 - (v + 1) / 2)) * S, 0, S - 1).astype(int); o[mk] = im[py[mk], px[mk]]
    return o
rows = []
for ri, r in enumerate(rooms['rooms']):
    for nid in r['ids']:
        n = byid.get(nid)
        if not n: continue
        faces = {k: get(f"{base}{nid}-{k}.s.jpg") for k in 'frblud'}
        if faces['f'] is None: continue
        o0 = views.get(nid, 0)
        tiles = [render(faces, o0 + a) for a in (0, 90, 180, 270)]
        head = np.full((34, 320 * 4, 3), 255, np.uint8)
        cv2.putText(head, f"room {ri}  node {nid}  x={n['pos']['x']:.2f} z={n['pos']['z']:.2f}  area {r['area']}m2  room-center x={r['center'][0]} z={r['center'][1]}   [best | right | back | left]", (6, 23), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 1, cv2.LINE_AA)
        rows.append(np.vstack([head, np.hstack(tiles)]))
if rows:
    cv2.imwrite(out, np.vstack(rows), [cv2.IMWRITE_JPEG_QUALITY, 82]); print('wrote', out, len(rows), 'rows')
else: print('no rows')
