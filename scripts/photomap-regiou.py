# 公式図面とスキャンの位置合わせ・形の重なり版（2026-11-26）。photomap-regfit.py（線の距離）が模様・家具の点で外れる図面向け。
#   python scripts/photomap-regiou.py <シーンの作業 dir> <図面の画像> <出力の名前> [--crop=x0,y0,x1,y1] [--scale=px/m] [--close=px] [--deg=a,b]
#   スキャンの建物の形（壁＋床を塗りつぶした影）と、図面の建物の形（壁の線で囲まれた中）の重なり（IoU）が最大になる相似変換を探す。鏡像も試す。
#   出力 <出力>_cand<k>.png（重ね図: 青 = 図面の形、赤 = スキャンの形の縁、マゼンタ = 地点）と .json（world2img, iou, s, deg, mirror）
import sys, json
import numpy as np, cv2
from scipy.optimize import minimize
args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = lambda k, d=None: next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith(f'--{k}=')), d)
D, bpf, out = args
meta = json.load(open(f'{D}/scan.json')); td = json.load(open(f'{D}/td.json', encoding='utf-8'))
scan = cv2.imread(f'{D}/scan.png', 0); bp = cv2.imdecode(np.fromfile(bpf, np.uint8), cv2.IMREAD_COLOR)
H0, W0 = bp.shape[:2]
x0c, y0c, x1c, y1c = [int(v) for v in opt('crop', f'0,0,{W0},{H0}').split(',')]
# --- 図面の形: 濃い線 → 扉・窓の切れ目を閉じる → 外とつながらない所 = 建物の中
g = cv2.cvtColor(bp, cv2.COLOR_BGR2GRAY)
bgv = int(np.median(np.r_[g[0], g[-1], g[:, 0], g[:, -1]]))
line = (np.abs(g.astype(int) - bgv) > 70).astype(np.uint8)
keep = np.zeros_like(line); keep[y0c:y1c, x0c:x1c] = 1; line &= keep
CL = int(opt('close', str(max(9, (x1c - x0c) // 40))))
wall = cv2.morphologyEx(line, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (CL, CL)))
inv = (1 - wall).astype(np.uint8); inv[:y0c] = 1; inv[y1c:] = 1; inv[:, :x0c] = 1; inv[:, x1c:] = 1
ff = cv2.copyMakeBorder(inv, 2, 2, 2, 2, cv2.BORDER_CONSTANT, value=1); msk = np.zeros((H0 + 6, W0 + 6), np.uint8); cv2.floodFill(ff, msk, (0, 0), 2)   # 建物が図の端に接していても外を 1 つにつなぐ
bpm = ((ff[2:-2, 2:-2] != 2) & (keep > 0)).astype(np.uint8)
n, lab, st, _ = cv2.connectedComponentsWithStats(bpm)
if n > 1: bpm = (lab == 1 + np.argmax(st[1:, 4])).astype(np.uint8)
# 縮小して計算
SC = 500 / max(W0, H0); W, H = int(W0 * SC), int(H0 * SC)
B = cv2.resize(bpm, (W, H), interpolation=cv2.INTER_AREA) > 0.5
# --- スキャンの形
sm = (scan < 235).astype(np.uint8)
k = int(meta['ppm'] * 0.6) | 1
sm = cv2.morphologyEx(sm, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
n, lab, st, _ = cv2.connectedComponentsWithStats(sm)
NODES = np.array([[q['x'], q['z']] for q in td['nodes']])
npx = ((NODES - [meta['x0'], meta['z0']]) * meta['ppm']).astype(int)
ids = set(lab[np.clip(npx[:, 1], 0, sm.shape[0] - 1), np.clip(npx[:, 0], 0, sm.shape[1] - 1)]) - {0}
sm = np.isin(lab, list(ids)).astype(np.uint8)
ff = sm.copy(); m2 = np.zeros((sm.shape[0] + 2, sm.shape[1] + 2), np.uint8); cv2.floodFill(ff, m2, (0, 0), 2); sm = (ff != 2).astype(np.uint8)
yy, xx = np.nonzero(sm); rng = np.random.default_rng(0); pick = rng.choice(len(xx), min(6000, len(xx)), replace=False)
Sp = np.stack([meta['x0'] + xx[pick] / meta['ppm'], meta['z0'] + yy[pick] / meta['ppm']], 1)   # 世界 m
sarea = len(xx) / meta['ppm'] ** 2
barea = bpm.sum()
def M_of(s, th, tu, tv, mir):
    c, s_ = np.cos(th), np.sin(th); return np.array([[s * c * mir, -s * s_, tu], [s * s_ * mir, s * c, tv]])
def iou(prm, mir):
    s, th, tu, tv = prm
    if s <= 0: return 1
    M = M_of(s, th, tu, tv, mir) * SC
    q = Sp @ M[:, :2].T + M[:, 2]; u, v = q[:, 0].astype(int), q[:, 1].astype(int)
    ok = (u >= 0) & (v >= 0) & (u < W) & (v < H)
    inside = np.zeros(len(q), bool); inside[ok] = B[v[ok], u[ok]]
    a_s = sarea * s * s; inter = inside.mean() * a_s
    return -(inter / (a_s + barea - inter))
s0 = float(opt('scale')) if opt('scale') else np.sqrt(barea / sarea)
bc = np.array(np.nonzero(bpm)[::-1]).mean(1); wc = Sp.mean(0)
starts = []
dr = [int(v) for v in opt('deg', '0,360').split(',')]
for mir in (1, -1):
    for deg in range(dr[0], dr[1], 10):
        for kk in (0.9, 1.0, 1.1):
            s, th = s0 * kk, np.radians(deg); c, s_ = np.cos(th), np.sin(th)
            w = wc * [mir, 1]; t = bc - s * np.array([c * w[0] - s_ * w[1], s_ * w[0] + c * w[1]])
            starts.append(((s, th, t[0], t[1]), mir))
sc = [iou(p, m) for p, m in starts]
order = np.argsort(sc); res = []
for i in order[:24]:
    p, m = starts[i]
    r = minimize(lambda x: iou(x, m), p, method='Nelder-Mead', options={'xatol': 1e-2, 'fatol': 1e-4, 'maxiter': 600, 'initial_simplex': np.array(p) + np.diag([s0 * .05, .05, 20, 20])[[0, 0, 1, 2, 3]] * [[0], [1], [1], [1], [1]]})
    res.append((r.fun, tuple(r.x), m))
res.sort(key=lambda r: r[0]); outl = []
for f, p, m in res:
    if all(abs(((p[1] - q[1] + np.pi) % (2 * np.pi)) - np.pi) > np.radians(15) or m != mm for _, q, mm in outl): outl.append((f, p, m))
    if len(outl) == 3: break
for k, (f, (s, th, tu, tv), m) in enumerate(outl):
    M = M_of(s, th, tu, tv, m)
    o = bp.copy(); o[bpm > 0] = (o[bpm > 0] * 0.6 + np.array([255, 160, 60]) * 0.4).astype(np.uint8)
    # スキャンの形の縁を図面へ
    cs, _ = cv2.findContours(sm, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for c in cs:
        w = np.stack([meta['x0'] + c[:, 0, 0] / meta['ppm'], meta['z0'] + c[:, 0, 1] / meta['ppm']], 1)
        q = (w @ M[:, :2].T + M[:, 2]).astype(np.int32); cv2.polylines(o, [q], True, (0, 0, 255), max(2, W0 // 400))
    wy, wx = np.nonzero(scan < 60)
    w = np.stack([meta['x0'] + wx / meta['ppm'], meta['z0'] + wy / meta['ppm']], 1); q = (w @ M[:, :2].T + M[:, 2]).astype(int)
    okk = (q[:, 0] >= 0) & (q[:, 1] >= 0) & (q[:, 0] < W0) & (q[:, 1] < H0); o[q[okk, 1], q[okk, 0]] = (0, 0, 200)
    for x, y in (NODES @ M[:, :2].T + M[:, 2]).astype(int): cv2.circle(o, (x, y), max(3, W0 // 250), (255, 0, 255), -1)
    cv2.imwrite(f'{out}_cand{k}.png', o)
    json.dump({'world2img': M.tolist(), 'iou': round(-f, 3), 's': round(s, 2), 'deg': round(np.degrees(th) % 360, 1), 'mirror': m == -1}, open(f'{out}_cand{k}.json', 'w'), indent=1)
    print(k, 'iou', round(-f, 3), 's', round(s, 1), 'deg', round(np.degrees(th) % 360, 1), 'mirror', m == -1)
cv2.imwrite(f'{out}_bpmask.png', bpm * 255)
