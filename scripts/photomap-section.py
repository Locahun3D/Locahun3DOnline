# 3DGS の点群を床から 0.4〜1.9m の高さで切って真上から見た「断面」で、白地に黒線の平面図を作る（2026-11-26 本人「簡易図面にして 参考webのような」）。
#   壁・柱・カウンター・ブース・テーブルの位置が建築の平面図のように出る（GPU は使わない）。
#   python scripts/photomap-section.py <tour-topdown の json> <シーンの zip またはキャッシュ .npz> [--floor=<y>] [--lo=.4] [--hi=1.9] [--ppm=50] [--tag=x]
#   出力: <json と同じ所>/<名前>[_tag]_sec.json（図の座標の対応と地点）と _sec_raw.png（図）。photomap-build.mjs に --photo でこの json を渡す
import sys, os, json, subprocess, numpy as np, cv2
args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = lambda k, d: next((a.split('=', 1)[1] for a in sys.argv if a.startswith(f'--{k}=')), d)
tdp, src = args[0], args[1]
td = json.load(open(tdp, encoding='utf-8'))
if src.endswith('.zip'):
    npz = src[:-4] + '_pts.npz'
    if not os.path.exists(npz):
        import zipfile
        rad = [n for n in zipfile.ZipFile(src).namelist() if n.endswith('.rad') and 'env_' not in n][0]
        subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), 'rad-points.py'), src, rad, npz], check=True)
    src = npz
d = np.load(src); P, A, L = d['p'], d['a'], d['leaf']
fy = float(opt('floor', td['floorY'])); lo, hi = float(opt('lo', '.4')), float(opt('hi', '1.9')); ppm = float(opt('ppm', '50'))
nodes = [n for n in td['nodes'] if abs(n.get('floorY', fy) - fy) < 1.2] or td['nodes']
m = L & (A > 0.3) & (P[:, 1] > fy + lo) & (P[:, 1] < fy + hi)
Q = P[m][:, [0, 2]]
# 地点から 6m 以内だけ（遠くの浮遊物を入れない）
N = np.array([[n['x'], n['z']] for n in nodes])
near = np.zeros(len(Q), bool)
for i in range(0, len(Q), 200000):
    q = Q[i:i + 200000]; near[i:i + 200000] = (((q[:, None, :] - N[None]) ** 2).sum(-1).min(1) < 36)
Q = Q[near]
# 壁が図の縦横にそろうように回す（参考の平面図のように）: 点を回して x・z の分布がいちばん鋭くなる角度。--rot=<度> で指定も可
c0 = N.mean(0)
def rotq(q, t):
    c, s = np.cos(t), np.sin(t); d = q - c0
    return np.stack([c0[0] + c * d[:, 0] - s * d[:, 1], c0[1] + s * d[:, 0] + c * d[:, 1]], 1)
if opt('rot', '') != '':
    rot = np.radians(float(opt('rot', '0')))
else:
    sub = Q[np.random.default_rng(0).choice(len(Q), min(len(Q), 200000), replace=False)]
    def score(t):
        r = rotq(sub, t); return sum((np.histogram(r[:, k], bins=np.arange(r[:, k].min(), r[:, k].max() + .05, .05))[0].astype(float) ** 2).sum() for k in (0, 1))
    ts = np.radians(np.arange(-45, 45, 1.0)); t0 = ts[int(np.argmax([score(t) for t in ts]))]
    tf = t0 + np.radians(np.arange(-1, 1.01, .1)); rot = float(tf[int(np.argmax([score(t) for t in tf]))])
    if abs(np.degrees(rot)) < 1.5: rot = 0.0
Q = rotq(Q, rot)
x0, z0 = np.percentile(Q, 0.2, axis=0) - 0.8; x1, z1 = np.percentile(Q, 99.8, axis=0) + 0.8
W, H = int((x1 - x0) * ppm), int((z1 - z0) * ppm)
u = ((Q[:, 0] - x0) * ppm).astype(int); v = ((Q[:, 1] - z0) * ppm).astype(int); ok = (u >= 0) & (u < W) & (v >= 0) & (v < H)
D = np.zeros((H, W), np.float32); np.add.at(D, (v[ok], u[ok]), 1)
D = cv2.GaussianBlur(D, (0, 0), 0.7)
T = np.percentile(D[D > 0], 97)
ink = np.clip(D / (T * 0.45), 0, 1)
# 薄いもや（浮遊物・床の模様）を落とす: 線として残る塊だけ
b = (ink > 0.35).astype(np.uint8)
n, lab, st, _ = cv2.connectedComponentsWithStats(b, connectivity=8)
keepc = np.zeros(n, bool); keepc[1:] = st[1:, cv2.CC_STAT_AREA] >= (0.25 * ppm) ** 2 * 0.5
mask = keepc[lab]
ink = ink * cv2.dilate(mask.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(np.float32)
# くっきりした黒線に（参考の図面のように。灰色のにじみを減らす）
ink = np.clip((ink - 0.3) / 0.3, 0, 1)
ink = cv2.GaussianBlur(ink, (0, 0), 0.6)
img = (255 - np.clip(ink * 255, 0, 255)).astype(np.uint8)
img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
base = tdp[:-5] + (('_' + opt('tag', '')) if opt('tag', '') else '') + '_sec'
cv2.imwrite(base + '_raw.png', img)
# photomap-build.mjs が読む形（中心・1m あたりの画素・正方形の px）に合わせる: 正方形に広げて保存
S = max(W, H); sq = np.full((S, S, 3), 255, np.uint8); oy, ox = (S - H) // 2, (S - W) // 2; sq[oy:oy + H, ox:ox + W] = img
cv2.imwrite(base + '_raw.png', sq)
out = dict(td); out.update({'px': S, 'ppm': ppm, 'center': {'x': float(x0 + (W / 2) / ppm), 'z': float(z0 + (H / 2) / ppm)}, 'floorY': fy, 'nodes': nodes, 'section': {'lo': lo, 'hi': hi}, 'rot': float(rot), 'rotOrigin': {'x': float(c0[0]), 'z': float(c0[1])}})
out['center'] = {'x': float(x0 - ox / ppm + S / 2 / ppm), 'z': float(z0 - oy / ppm + S / 2 / ppm)}
json.dump(out, open(base + '.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('section', base + '.json', f'{W}x{H}', 'points', len(Q), 'rot', round(float(np.degrees(rot)), 1))
