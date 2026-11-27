# 位置合わせ（reg.json の world2img）の点検用シート（2026-11-27。審査で「写真と図の部屋が合わない」が出たシーン向け）。
#   python scripts/photomap-regcheck.py <シーンの作業 dir> [--reg=reg.json] [--max=24]
#   出力（作業 dir）:
#     regcheck_scan.png  … scan.png を 2 倍にし、ツアーの地点に番号（scan.png の画素で読める目盛りつき）
#     regcheck_plan.png  … 図面（crop）に、今の world2img で地点の番号を置いたもの
#     regcheck_nodes.jpg … 地点ごとの 360° の 4 方向（F/R/B/L）の縮小。何の部屋かを見て、図面の部屋と照合する
#   照合して合わなければ photomap-regpairs.py に scan.png の壁の角 ↔ 図面の角を渡して作り直す。
import sys, os, json, math, urllib.request
import numpy as np, cv2
args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = lambda k, d=None: next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith(f'--{k}=')), d)
D = args[0].rstrip('/\\')
ORIGIN = 'https://locahun3d.com'; UA = {'User-Agent': 'Mozilla/5.0 (photomap-regcheck)'}
def get(u, binary=False):
    b = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60).read()
    return b if binary else json.loads(b)
rn = opt('reg') or ('reg_merged.json' if os.path.exists(f'{D}/reg_merged.json') else 'reg.json')
reg = json.load(open(f'{D}/{rn}', encoding='utf-8')) if os.path.exists(f'{D}/{rn}') else None
td = json.load(open(f'{D}/td.json', encoding='utf-8')); meta = json.load(open(f'{D}/scan.json'))
g = get(f'{ORIGIN}/api/pano/{td["key"]}.graph.json'); gn = {n['id']: n for n in g['nodes']}
ids = [n['id'] for n in td['nodes'] if n['id'] in gn]
MAX = int(opt('max', '24'))
if len(ids) > MAX:   # 散らばるように間引く（最遠点選択）
    P = np.array([[gn[i]['pos']['x'], gn[i]['pos']['z']] for i in ids]); sel = [0]
    d = np.linalg.norm(P - P[0], axis=1)
    while len(sel) < MAX: k = int(d.argmax()); sel.append(k); d = np.minimum(d, np.linalg.norm(P - P[k], axis=1))
    ids = [ids[k] for k in sorted(sel)]
# scan に番号
sc = cv2.imread(f'{D}/scan.png'); sc = cv2.resize(sc, None, fx=2, fy=2, interpolation=cv2.INTER_NEAREST)
for x in range(0, sc.shape[1], 50):
    cv2.line(sc, (x, 0), (x, 6), (0, 0, 255), 1); cv2.putText(sc, str(x // 2), (x + 1, 16), 0, 0.35, (0, 0, 255), 1)
for y in range(0, sc.shape[0], 50):
    cv2.line(sc, (0, y), (6, y), (0, 0, 255), 1); cv2.putText(sc, str(y // 2), (8, y + 4), 0, 0.35, (0, 0, 255), 1)
for i in ids:
    n = gn[i]; sx = (n['pos']['x'] - meta['x0']) * meta['ppm'] * 2; sy = (n['pos']['z'] - meta['z0']) * meta['ppm'] * 2
    cv2.circle(sc, (int(sx), int(sy)), 5, (0, 0, 255), -1); cv2.putText(sc, i, (int(sx) + 6, int(sy) - 4), 0, 0.45, (200, 0, 0), 1)
cv2.imwrite(f'{D}/regcheck_scan.png', sc)
if reg:
    bp = cv2.imdecode(np.fromfile(os.path.normpath(os.path.join(D, reg['blueprint'])), np.uint8), cv2.IMREAD_COLOR)
    M = np.array(reg['world2img'], float); c = reg.get('crop') or [0, 0, bp.shape[1], bp.shape[0]]
    im = bp.copy()
    for i in ids:
        n = gn[i]; u, v = M @ [n['pos']['x'], n['pos']['z'], 1]
        cv2.circle(im, (int(u), int(v)), 4, (0, 0, 255), -1); cv2.putText(im, i, (int(u) + 5, int(v) - 3), 0, 0.4, (200, 0, 0), 1)
    im = im[c[1]:c[3], c[0]:c[2]]; f = max(1, 700 // max(1, im.shape[1]))
    cv2.imwrite(f'{D}/regcheck_plan.png', cv2.resize(im, None, fx=f, fy=f))
tiles = []
for i in ids:
    fs = []
    for k in 'frbl':
        try: fs.append(cv2.resize(cv2.imdecode(np.frombuffer(get(f'{ORIGIN}/api/pano/{td["key"]}-g{g["set"]}-{i}-{k}.s.jpg', True), np.uint8), 1), (150, 150)))
        except Exception: fs.append(np.zeros((150, 150, 3), np.uint8))
    t = np.hstack(fs); cv2.rectangle(t, (0, 0), (70, 22), (0, 0, 0), -1); cv2.putText(t, i, (4, 17), 0, 0.6, (0, 255, 255), 2); tiles.append(t)
cols = 2; rows = [np.hstack(tiles[k:k + cols] + [np.zeros_like(tiles[0])] * (cols - len(tiles[k:k + cols]))) for k in range(0, len(tiles), cols)]
cv2.imwrite(f'{D}/regcheck_nodes.jpg', np.vstack(rows), [cv2.IMWRITE_JPEG_QUALITY, 78])
print('regcheck', D, len(ids), 'nodes')
