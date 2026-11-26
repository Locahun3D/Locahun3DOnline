# 公式図面とスキャンの位置合わせ（2026-11-26。「位置から見る」を公式図面に載せるため）。
#   python scripts/photomap-regfit.py <シーンの作業 dir（scan.png / scan.json / td.json）> <図面の画像> <出力の名前> [--scale=px/m] [--thick=px] [--init=s,deg,tu,tv] [--crop=x0,y0,x1,y1] [--mask=x0,y0,x1,y1;...]
#   スキャンの壁（scan.png の黒）を図面の線（濃い画素）へ重ねる相似変換（倍率・回転・移動）を、線までの距離が最小になるよう探す。
#   --init が無ければ全方向（5° おき）× 倍率を総当たりして上位 3 案を出す。<出力>_cand<k>.png が重ね図（赤 = スキャンの壁、マゼンタ = ツアーの地点）。
#   --crop は図面の中で建物が描いてある範囲（表題・凡例を外す）、--mask は無視する所（文字の欄など）。
#   出力 <出力>_cand<k>.json: { world2img: 2x3, score, s, deg }（s = 図面の 1m あたりの画素）
import sys, json
import numpy as np, cv2
from scipy.optimize import minimize

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = lambda k, d=None: next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith(f'--{k}=')), d)
D, bpf, out = args
meta = json.load(open(f'{D}/scan.json')); td = json.load(open(f'{D}/td.json', encoding='utf-8'))
scan = cv2.imread(f'{D}/scan.png'); bp = cv2.imdecode(np.fromfile(bpf, np.uint8), cv2.IMREAD_COLOR)
H, W = bp.shape[:2]
g = cv2.cvtColor(bp, cv2.COLOR_BGR2GRAY)
# 図面の線: 周りより暗い画素（背景が白でも黒でも）。--thick=N なら N px より太い線（壁）だけ使う（模様・寸法線を外す）
bgv = np.median(g[[0, -1], :]) if True else 255
line = (np.abs(g.astype(int) - int(bgv)) > 60).astype(np.uint8)
cx0, cy0, cx1, cy1 = [int(v) for v in opt('crop', f'0,0,{W},{H}').split(',')]
keep = np.zeros_like(line); keep[cy0:cy1, cx0:cx1] = 1
for m in (opt('mask', '') or '').split(';'):
    if m: a, b, c, d = [int(v) for v in m.split(',')]; keep[b:d, a:c] = 0
line &= keep
if opt('thick'):
    k_ = int(opt('thick')); line = cv2.dilate(cv2.erode(line, np.ones((k_, k_), np.uint8)), np.ones((k_, k_), np.uint8))
DT = cv2.distanceTransform(1 - line, cv2.DIST_L2, 5)
# スキャンの壁の点（世界 m）
wy, wx = np.nonzero(scan[..., 0] < 60)
Wp = np.stack([meta['x0'] + wx / meta['ppm'], meta['z0'] + wy / meta['ppm']], 1)
rng = np.random.default_rng(0); Wp = Wp[rng.choice(len(Wp), min(4000, len(Wp)), replace=False)]
NODES = np.array([[n['x'], n['z']] for n in td['nodes']])
CAP = 25.0
MIR = [1]
def tf(q, s, th, tu, tv):
    q = q * [MIR[0], 1]
    c, s_ = np.cos(th), np.sin(th); return np.stack([s * (c * q[:, 0] - s_ * q[:, 1]) + tu, s * (s_ * q[:, 0] + c * q[:, 1]) + tv], 1)
def cost(prm):
    s, th, tu, tv = prm; q = tf(Wp, s, th, tu, tv)
    u, v = q[:, 0].astype(int), q[:, 1].astype(int); ok = (u >= 0) & (v >= 0) & (u < W) & (v < H)
    d = np.full(len(q), CAP); d[ok] = np.minimum(DT[v[ok], u[ok]], CAP)
    # 地点が図面の外（線の範囲の外）に出るのも減点
    n = tf(NODES, s, th, tu, tv); outside = ((n[:, 0] < cx0) | (n[:, 0] > cx1) | (n[:, 1] < cy0) | (n[:, 1] > cy1)).mean()
    return d.mean() + 40 * outside + (1e3 * (SB[0] - s) if s < SB[0] else 0) + (1e3 * (s - SB[1]) if s > SB[1] else 0)
ly, lx = np.nonzero(line); bc = np.array([lx.mean(), ly.mean()]); bsz = np.sqrt(line.sum())
wc = Wp.mean(0)
cands = []
SB = [1e-6, 1e9]
if opt('init'):
    s, deg, tu, tv = [float(v) for v in opt('init').split(',')]; starts = [(s, np.radians(deg), tu, tv)]
else:
    # 倍率の見当: 図面の線の広がり / スキャンの壁の広がり
    s0 = np.sqrt(((np.stack([lx, ly], 1) - bc) ** 2).sum(1).mean()) / np.sqrt(((Wp - wc) ** 2).sum(1).mean())
    if opt('scale'): s0 = float(opt('scale'))   # 図面の寸法から読んだ 1m あたりの画素（模様の多い図面で自動の見当が外れる）
    SB[:] = [s0 * 0.75, s0 * 1.33] if opt('scale') else [s0 * 0.4, s0 * 2.5]
    KS = np.geomspace(0.85, 1.15, 5) if opt('scale') else np.geomspace(0.6, 1.6, 9)
    starts = []
    for k in KS:
        for deg in range(0, 360, 5):
            s, th = s0 * k, np.radians(deg); c_, s_ = np.cos(th), np.sin(th)
            t = bc - s * np.array([c_ * wc[0] - s_ * wc[1], s_ * wc[0] + c_ * wc[1]])
            starts.append((s, th, t[0], t[1]))
    sc = np.array([min(cost(p), (MIR.__setitem__(0, -1), cost(p), MIR.__setitem__(0, 1))[1]) for p in starts]); order = np.argsort(sc)
    pick = []
    for i in order:   # 違う向きの案を 3 つ
        if all(abs(((starts[i][1] - starts[j][1] + np.pi) % (2 * np.pi)) - np.pi) > np.radians(20) for j in pick): pick.append(i)
        if len(pick) == 8: break
    starts = [starts[i] for i in pick]
for p0 in starts:
  for mir in (1, -1):   # スキャンの向きは鏡像のこともある（図の z 軸の取り方）
    MIR[0] = mir; best = None
    if mir == -1 and not opt('init'):
        s_, th_ = p0[0], p0[1]; wm = wc * [-1, 1]; c_, sn = np.cos(th_), np.sin(th_)
        t_ = bc - s_ * np.array([c_ * wm[0] - sn * wm[1], sn * wm[0] + c_ * wm[1]]); p0 = (s_, th_, t_[0], t_[1])
    for it in range(3):
        r = minimize(cost, p0 if best is None else best.x, method='Nelder-Mead', options={'xatol': 1e-3, 'fatol': 1e-3, 'maxiter': 2000})
        best = r if best is None or r.fun < best.fun else best
    cands.append((best.fun, best.x, mir))
cands.sort(key=lambda c: c[0])
for k, (f, (s, th, tu, tv), mir) in enumerate(cands[:3]):
    MIR[0] = mir; c, s_ = np.cos(th), np.sin(th)
    M = [[s * c * mir, -s * s_, tu], [s * s_ * mir, s * c, tv]]
    o = bp.copy(); q = tf(Wp, s, th, tu, tv)
    for x, y in q.astype(int): cv2.circle(o, (x, y), 1, (0, 0, 255), -1)
    for x, y in tf(NODES, s, th, tu, tv).astype(int): cv2.circle(o, (x, y), max(3, W // 300), (255, 0, 255), -1)
    cv2.imwrite(f'{out}_cand{k}.png', o)
    json.dump({'world2img': M, 'score': round(float(f), 2), 's': round(float(s), 2), 'deg': round(float(np.degrees(th)) % 360, 1), 'mirror': mir == -1}, open(f'{out}_cand{k}.json', 'w'), indent=1)
    print(k, 'score', round(float(f), 2), 's', round(float(s), 1), 'deg', round(float(np.degrees(th)) % 360, 1), 'mirror', mir == -1)
