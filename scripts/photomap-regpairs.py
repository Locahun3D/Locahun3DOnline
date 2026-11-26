# 公式図面とスキャンの位置合わせ・対応点版（2026-11-26）。自動（photomap-regiou.py / regfit.py）が外れたとき、目で選んだ対応点から決める。
#   python scripts/photomap-regpairs.py <シーンの作業 dir> <図面の画像> <出力の名前> "--pairs=sx,sy:u,v;sx,sy:u,v;..." [--affine]
#   sx,sy = scan.png の画素（壁の角など）、u,v = 図面の画素（同じ角）。2 組以上で相似（鏡像も自動で試す）、3 組以上 + --affine で一次変換。
#   出力 <出力>.png（重ね図: 赤 = スキャンの壁、マゼンタ = 地点、緑 = 対応点の誤差）と <出力>.json（world2img, rms_px, s, mirror）
import sys, json
import numpy as np, cv2
args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = lambda k, d=None: next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith(f'--{k}=')), d)
D, bpf, out = args
meta = json.load(open(f'{D}/scan.json')); td = json.load(open(f'{D}/td.json', encoding='utf-8'))
scan = cv2.imread(f'{D}/scan.png', 0); bp = cv2.imdecode(np.fromfile(bpf, np.uint8), cv2.IMREAD_COLOR)
pr = [p.split(':') for p in opt('pairs').split(';') if p.strip()]
S = np.array([[float(v) for v in a.split(',')] for a, _ in pr]); U = np.array([[float(v) for v in b.split(',')] for _, b in pr])
Wd = np.stack([meta['x0'] + S[:, 0] / meta['ppm'], meta['z0'] + S[:, 1] / meta['ppm']], 1)
def fit_sim(A, B, mir):
    A2 = A * [mir, 1]; ca, cb = A2.mean(0), B.mean(0); a, b = A2 - ca, B - cb
    za, zb = a[:, 0] + 1j * a[:, 1], b[:, 0] + 1j * b[:, 1]; r = (np.conj(za) @ zb) / (np.conj(za) @ za)
    s, th = abs(r), np.angle(r); c, s_ = np.cos(th), np.sin(th)
    R = np.array([[s * c, -s * s_], [s * s_, s * c]]) @ np.diag([mir, 1]); t = cb - R @ (ca * [mir, 1]) * 1 if False else cb - R @ A.mean(0)
    return np.c_[R, t]
if opt('affine') is not None or '--affine' in sys.argv:
    X = np.c_[Wd, np.ones(len(Wd))]; M = np.linalg.lstsq(X, U, rcond=None)[0].T; mir = np.linalg.det(M[:, :2]) < 0
else:
    cs = [(fit_sim(Wd, U, m), m) for m in (1, -1)]
    err = [np.sqrt((((Wd @ M[:, :2].T + M[:, 2]) - U) ** 2).sum(1).mean()) for M, _ in cs]
    M, m = cs[int(np.argmin(err))]; mir = m == -1
P = Wd @ M[:, :2].T + M[:, 2]; rms = float(np.sqrt(((P - U) ** 2).sum(1).mean()))
o = bp.copy(); H0, W0 = o.shape[:2]
wy, wx = np.nonzero(scan < 60); w = np.stack([meta['x0'] + wx / meta['ppm'], meta['z0'] + wy / meta['ppm']], 1)
q = (w @ M[:, :2].T + M[:, 2]).astype(int); ok = (q[:, 0] >= 0) & (q[:, 1] >= 0) & (q[:, 0] < W0) & (q[:, 1] < H0); o[q[ok, 1], q[ok, 0]] = (0, 0, 220)
NODES = np.array([[n['x'], n['z']] for n in td['nodes']])
for x, y in (NODES @ M[:, :2].T + M[:, 2]).astype(int): cv2.circle(o, (x, y), max(3, W0 // 250), (255, 0, 255), -1)
for a, b in zip(P.astype(int), U.astype(int)): cv2.line(o, tuple(a), tuple(b), (0, 200, 0), 2); cv2.circle(o, tuple(b), 6, (0, 200, 0), 2)
cv2.imwrite(f'{out}.png', o)
s = float(np.sqrt(abs(np.linalg.det(M[:, :2]))))
json.dump({'world2img': M.tolist(), 'rms_px': round(rms, 1), 's': round(s, 2), 'mirror': bool(mir)}, open(f'{out}.json', 'w'), indent=1)
print('rms_px', round(rms, 1), 's(px/m)', round(s, 1), 'mirror', bool(mir))
