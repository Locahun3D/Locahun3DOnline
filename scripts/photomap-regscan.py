# 同じ空間を撮った 2 つのシーンの位置合わせ（2026-11-27）。片方の reg.json が正しいとき、もう片方を「スキャンどうし」で合わせて図面に載せる。
#   python scripts/photomap-regscan.py <基準の作業 dir（reg 正）> <合わせる作業 dir> <出力の名前> [--reg=reg_merged.json] [--step=2]
#   スキャンの壁（scan.png の黒）どうしの距離が最小になる剛体変換（回転・移動。倍率 1、鏡像も試す）を総当たり＋Nelder-Mead で探し、
#   基準の world2img と合成して <合わせる dir>/<出力>.json（world2img, cost, deg, mirror）と重ね図 <出力>.png（図面上: 赤 = 合わせたスキャン、青 = 基準）を出す。
import sys, os, json, math
import numpy as np, cv2
from scipy.optimize import minimize
args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = lambda k, d=None: next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith(f'--{k}=')), d)
A, B, out = [a.rstrip('/\\') for a in args]
rn = opt('reg') or ('reg_merged.json' if os.path.exists(f'{A}/reg_merged.json') else 'reg.json')
regA = json.load(open(f'{A}/{rn}', encoding='utf-8')); MA = np.array(regA['world2img'], float)
ma = json.load(open(f'{A}/scan.json')); mb = json.load(open(f'{B}/scan.json'))
sa = cv2.imread(f'{A}/scan.png', 0); sb = cv2.imread(f'{B}/scan.png', 0)
wa = (sa < 60).astype(np.uint8); DT = cv2.distanceTransform(1 - wa, cv2.DIST_L2, 5) / ma['ppm']   # m
y, x = np.nonzero(sb < 60); P = np.stack([mb['x0'] + x / mb['ppm'], mb['z0'] + y / mb['ppm']], 1)
P = P[np.random.default_rng(0).choice(len(P), min(5000, len(P)), replace=False)]
CAP = 1.5
def tf(q, th, tx, tz, mir):
    q = q * [mir, 1]; c, s = math.cos(th), math.sin(th)
    return np.stack([c * q[:, 0] - s * q[:, 1] + tx, s * q[:, 0] + c * q[:, 1] + tz], 1)
def cost(p, mir):
    q = tf(P, p[0], p[1], p[2], mir); u = ((q[:, 0] - ma['x0']) * ma['ppm']).astype(int); v = ((q[:, 1] - ma['z0']) * ma['ppm']).astype(int)
    ok = (u >= 0) & (v >= 0) & (u < wa.shape[1]) & (v < wa.shape[0]); d = np.full(len(q), CAP); d[ok] = np.minimum(DT[v[ok], u[ok]], CAP)
    return d.mean()
ya, xa = np.nonzero(wa); ca = np.array([ma['x0'] + xa.mean() / ma['ppm'], ma['z0'] + ya.mean() / ma['ppm']]); cb = P.mean(0)
res = []
for mir in (1, -1):
    for deg in range(0, 360, int(opt('step', '3'))):
        th = math.radians(deg); c, s = math.cos(th), math.sin(th); q = cb * [mir, 1]
        t = ca - np.array([c * q[0] - s * q[1], s * q[0] + c * q[1]])
        res.append((cost((th, t[0], t[1]), mir), (th, t[0], t[1]), mir))
res.sort(key=lambda r: r[0]); best = []
for c0, p0, mir in res[:24]:
    r = minimize(lambda p: cost(p, mir), p0, method='Nelder-Mead', options={'xatol': 1e-4, 'fatol': 1e-5, 'maxiter': 3000})
    best.append((r.fun, r.x, mir))
best.sort(key=lambda r: r[0])
for k, (f, p, mir) in enumerate(best[:3]):
    print(k, 'cost(m)', round(f, 3), 'deg', round(math.degrees(p[0]) % 360, 1), 'mirror', mir == -1)
f, p, mir = best[0]
c, s = math.cos(p[0]), math.sin(p[0]); T = np.array([[c * mir, -s, p[1]], [s * mir, c, p[2]], [0, 0, 1]])
MB = MA @ T
json.dump({'world2img': MB[:2].tolist(), 'cost': round(f, 4), 'deg': round(math.degrees(p[0]) % 360, 2), 'mirror': mir == -1, 'from': A}, open(f'{B}/{out}.json', 'w'), indent=1)
bp = cv2.imdecode(np.fromfile(os.path.normpath(os.path.join(A, regA['blueprint'])), np.uint8), cv2.IMREAD_COLOR)
def draw(img, sc, meta, M, col):
    yy, xx = np.nonzero(sc < 60); W = np.stack([meta['x0'] + xx / meta['ppm'], meta['z0'] + yy / meta['ppm'], np.ones(len(xx))], 1)
    uv = (M @ W.T).T.astype(int); ok = (uv[:, 0] >= 0) & (uv[:, 1] >= 0) & (uv[:, 0] < img.shape[1]) & (uv[:, 1] < img.shape[0])
    img[uv[ok, 1], uv[ok, 0]] = col
im = bp.copy(); draw(im, sa, ma, MA, (255, 120, 0)); draw(im, sb, mb, MB[:2], (0, 0, 255))
c_ = regA.get('crop') or [0, 0, bp.shape[1], bp.shape[0]]; im = im[c_[1]:c_[3], c_[0]:c_[2]]
cv2.imwrite(f'{B}/{out}.png', cv2.resize(im, None, fx=max(1, 700 // im.shape[1]), fy=max(1, 700 // im.shape[1])))
