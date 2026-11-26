# 「位置から見る」の各地点で、最初に見せる向き（いちばん見栄えのする向き）を決める（2026-11-26 本人「クリックしたら一番見栄えのいいところで表示されるように」）。
#   python scripts/photomap-bestview.py <tour-topdown の json> <シーンの点 .npz> <出力 views.json> [--debug=<dir>]
#   出力: { "<地点 id>": 正面(f)から時計回りの度 }。photomap-build.mjs の reg json に views=<file> で渡すと、矢印の向きと最初の眺めがこの向きになる。
#   点数 = 見通し（スキャンの点で、視野の中で壁までの距離。近い壁を正面にしない）＋ 画の情報量（6 方向の画像から描いた眺めの細かさと色）。
import sys, os, json, io, urllib.request
import numpy as np, cv2
UA = {'User-Agent': 'Mozilla/5.0 (photomap-bestview)'}
openurl = lambda u: urllib.request.urlopen(urllib.request.Request(u, headers=UA))

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = lambda k, d=None: next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith(f'--{k}=')), d)
tdp, npz, outp = args
dbg = opt('debug')
td = json.load(open(tdp, encoding='utf-8'))
ORIGIN = 'https://locahun3d.com'
g = json.load(openurl(f"{ORIGIN}/api/pano/{td['key']}.graph.json"))
base = f"{ORIGIN}/api/pano/{td['key']}-g{g['set']}-"

d = np.load(npz); P, A, L = d['p'], d['a'], d['leaf']
fy = float(td['floorY'])
m = L & (A > 0.3) & (P[:, 1] > fy + 0.4) & (P[:, 1] < fy + 1.9)
Q = P[m][:, [0, 2]]
RES = 0.1
x0, z0 = Q.min(0) - 1
W, H = (np.ceil((Q.max(0) + 1 - [x0, z0]) / RES)).astype(int)
occ = np.zeros((H, W), np.uint16)
ix = ((Q[:, 0] - x0) / RES).astype(int); iz = ((Q[:, 1] - z0) / RES).astype(int)
np.add.at(occ, (iz, ix), 1)
OCC = occ >= 3   # 3 点以上で物がある

def ray(x, z, ang_dir, cap=20.0):
    dx, dz = ang_dir
    for t in np.arange(0.3, cap, RES):
        u, v = int((x + dx * t - x0) / RES), int((z + dz * t - z0) / RES)
        if u < 0 or v < 0 or u >= W or v >= H: return t
        if OCC[v, u]: return t
    return cap

# 6 方向の画像から眺めを描く（PanoView と同じ式。yaw は正面からの時計回り、HFOV 96°、4:3）
FACES = ['f', 'r', 'b', 'l', 'u', 'd']
def render(faces, yaw_deg, w=320, h=240, hfov=96):
    fp = w / 2 / np.tan(np.radians(hfov) / 2)
    xs, ys = np.meshgrid(np.arange(w) + .5 - w / 2, (h / 2) - (np.arange(h) + .5))
    dx, dy, dz = xs / fp, ys / fp, np.ones_like(xs)
    c, s = np.cos(np.radians(yaw_deg)), np.sin(np.radians(yaw_deg))
    dx, dz = dx * c + dz * s, -dx * s + dz * c
    out = np.zeros((h, w, 3), np.uint8)
    ax, ay, az = np.abs(dx), np.abs(dy), np.abs(dz)
    sel = {
        'r': (ax >= ay) & (ax >= az) & (dx > 0), 'l': (ax >= ay) & (ax >= az) & (dx <= 0),
        'u': ~((ax >= ay) & (ax >= az)) & (ay >= az) & (dy > 0), 'd': ~((ax >= ay) & (ax >= az)) & (ay >= az) & (dy <= 0),
    }
    rest = ~((ax >= ay) & (ax >= az)) & ~(ay >= az)
    sel['f'] = rest & (dz > 0); sel['b'] = rest & (dz <= 0)
    for f, mk in sel.items():
        if not mk.any() or faces.get(f) is None: continue
        im = faces[f]; S = im.shape[0]
        if f == 'r': u, v = -dz / ax, dy / ax
        elif f == 'l': u, v = dz / ax, dy / ax
        elif f == 'u': u, v = dx / ay, -dz / ay
        elif f == 'd': u, v = dx / ay, dz / ay
        elif f == 'f': u, v = dx / az, dy / az
        else: u, v = -dx / az, dy / az
        px = np.clip(((u + 1) / 2 * S).astype(int), 0, S - 1); py = np.clip(((1 - (v + 1) / 2)) * S, 0, S - 1).astype(int)
        out[mk] = im[py[mk], px[mk]]
    return out

def get(url):
    try: return cv2.imdecode(np.frombuffer(openurl(url).read(), np.uint8), cv2.IMREAD_COLOR)
    except Exception: return None

def detail(img):
    gry = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    e = cv2.Canny(gry, 60, 150).mean() / 255
    b, g_, r = [img[..., k].astype(float) for k in range(3)]
    rg, yb = r - g_, (r + g_) / 2 - b
    col = (np.sqrt(rg.std() ** 2 + yb.std() ** 2) + 0.3 * np.sqrt(rg.mean() ** 2 + yb.mean() ** 2)) / 100
    dark = (gry < 25).mean()
    return e, col, dark

CANDS = list(range(-180, 180, 15))
res = {}
if dbg: os.makedirs(dbg, exist_ok=True)
for n in g['nodes']:
    x, z, y0 = n['pos']['x'], n['pos']['z'], n.get('yaw', 0)
    f = np.array([np.sin(y0), np.cos(y0)]); rgt = np.array([-f[1], f[0]])   # 右 = 図の上で時計回り 90°
    faces = {k: get(f"{base}{n['id']}-{k}.s.jpg") for k in FACES}
    if faces['f'] is None: continue
    rows = []
    for o in CANDS:
        rays = []
        for a in range(-40, 41, 5):
            t = np.radians(o + a); dvec = np.cos(t) * f + np.sin(t) * rgt
            rays.append(ray(x, z, dvec))
        rays = np.array(rays)
        center = rays[6:11].min()
        open_ = np.log(np.median(rays) + 0.5) - (1.5 if center < 1.6 else 0) - (0.6 if center < 2.5 else 0)
        e, col, dark = detail(render(faces, o))
        rows.append((o, open_, e, col, dark))
    R = np.array(rows, float)
    zs = lambda v: (v - v.mean()) / (v.std() + 1e-6)
    sc = 1.0 * zs(R[:, 1]) + 0.6 * zs(R[:, 2]) + 0.4 * zs(R[:, 3]) - 2.0 * R[:, 4]
    sc = (np.roll(sc, 1) + 2 * sc + np.roll(sc, -1)) / 4   # 隣の向きと均す（一瞬だけ良い向きを選ばない）
    best = int(R[int(np.argmax(sc)), 0])
    res[n['id']] = best
    if dbg:
        cv2.imwrite(os.path.join(dbg, f"{n['id']}_best.jpg"), np.hstack([render(faces, 0, 240, 180), render(faces, best, 240, 180)]))
    print(n['id'], 'best', best)
json.dump(res, open(outp, 'w'), indent=1)
print('wrote', outp, len(res))
