# 公式図面を部屋に分け、部屋ごとの「真ん中」（壁から一番遠い所）を出す（2026-11-27）
#   本人「出来るだけ部屋の中央でとること」「写真がない部屋はないようにすること」
#
#   python scripts/photomap-planrooms.py <作業 dir> [--reg=reg_merged.json] [--big=45] [--scanwalls]
#     入力: reg（blueprint・crop・world2img・inside）、pts.npz（無ければ親 dir）、td.json（地点・床の高さ）
#     出力: <dir>/planrooms.json と planrooms.png（確認図: 部屋の色分け・真ん中の印・既存の地点）
#
#   手順:
#     1. 壁 = 図面の黒っぽい線（色の付いた寸法線・家具の色線は除く。文字・番号の丸など小さい塊は捨てる）
#            ＋ スキャンの「目の高さの帯（床 +1.3〜1.9m）」に点が詰まっている所（色で塗った壁の図面でも壁が取れる）
#     2. 家具の線で囲まれた小さな島（4㎡ 未満・太い壁に囲まれていない）は部屋にしない（その線も壁から外す）
#     3. 壁から 0.47m 以上離れた所を「部屋の芯」にする（扉 0.9m 幅はここで切れる）→ 芯から床を塗り広げて部屋に分ける
#     4. 図の端に触れる区画（建物の外）・1.5㎡ 未満・inside の外を捨てる
#     5. 部屋ごとに、スキャンの床がどれだけ写っているか → 半分以上なら「スキャン済み」、それ以外は「未スキャン」（写真は作らない）
#     6. 真ん中 = 部屋の区画の中で縁から一番遠い点。45㎡ を超える部屋は長い向きに等分して、分けた区画ごとの真ん中（3m 以上離す）
#     7. 既存の写真ツアーの地点が真ん中から max(0.6m, 短辺の 12%) 以内・同じ部屋にあれば、その地点を使う（新しく撮らない）
import sys, os, json, math
import numpy as np, cv2
from scipy import ndimage as ndi
from skimage.segmentation import watershed

d = sys.argv[1].rstrip('/\\')
opt = lambda k, dv=None: next((a.split('=', 1)[1] for a in sys.argv[2:] if a.startswith(f'--{k}=')), dv)
regname = opt('reg') or ('reg_merged.json' if os.path.exists(f'{d}/reg_merged.json') else 'reg.json')
BIG = float(opt('big', '45'))
reg = json.load(open(f'{d}/{regname}', encoding='utf-8'))
# スキャンの壁は、壁を色で塗った図面（線が取れない）のときだけ足す（reg の scanWalls: true か --scanwalls）。普段は足すと部屋がまだらに割れる
SCANWALLS = '--scanwalls' in sys.argv or bool(reg.get('scanWalls'))
bpf = os.path.normpath(os.path.join(d, reg['blueprint']))
bp = cv2.imdecode(np.fromfile(bpf, np.uint8), cv2.IMREAD_COLOR)
H0, W0 = bp.shape[:2]
M = np.array(reg['world2img'], float)
A = np.vstack([M, [0, 0, 1]]); Ai = np.linalg.inv(A)
ppm = math.hypot(M[0, 0], M[0, 1])
x0, y0, x1, y1 = [int(v) for v in (reg.get('crop') or [0, 0, W0, H0])]
x0, y0, x1, y1 = max(0, x0), max(0, y0), min(W0, x1), min(H0, y1)
img = bp[y0:y1, x0:x1]
h, w = img.shape[:2]
m2 = lambda v: v * ppm            # m → px
px2m2 = 1.0 / (ppm * ppm)         # px² → m²

def shifted(x, z):
    for sh in reg.get('shifts') or []:
        if (sh.get('zmax') is None or z < sh['zmax']) and (sh.get('zmin') is None or z >= sh['zmin']) and (sh.get('xmin') is None or x >= sh['xmin']) and (sh.get('xmax') is None or x < sh['xmax']):
            x += sh.get('dx', 0); z += sh.get('dz', 0)
    return x, z
def w2c(x, z):   # 世界 → crop の画素
    x, z = shifted(x, z); u = M[0, 0] * x + M[0, 1] * z + M[0, 2]; v = M[1, 0] * x + M[1, 1] * z + M[1, 2]; return u - x0, v - y0
def c2w(u, v):   # crop の画素 → 世界（shifts は無視。shifts のある reg は稀）
    q = Ai @ np.array([u + x0, v + y0, 1.0]); return float(q[0]), float(q[1])

# ── 地点・床 ──
td = json.load(open(f'{d}/td.json', encoding='utf-8'))
nodes = td.get('nodes', [])
fl = [n.get('floorY') for n in nodes if n.get('floorY') is not None]
floor0 = float(np.median(fl)) if fl else float(td.get('floorY', 0))
npz = f'{d}/pts.npz' if os.path.exists(f'{d}/pts.npz') else f'{os.path.dirname(d)}/pts.npz'
P = np.load(npz)['p']
rel = P[:, 1] - floor0
u_ = M[0, 0] * P[:, 0] + M[0, 1] * P[:, 2] + M[0, 2] - x0
v_ = M[1, 0] * P[:, 0] + M[1, 1] * P[:, 2] + M[1, 2] - y0
inb = (u_ >= 0) & (u_ < w) & (v_ >= 0) & (v_ < h)
def density(sel):
    D = np.zeros((h, w), np.float32)
    s = sel & inb
    np.add.at(D, (v_[s].astype(int), u_[s].astype(int)), 1)
    return D
cover = density((rel > -0.25) & (rel < 0.25))     # この階の床の点（窓越しに見えただけの部屋は床がほとんど写らない）
band = density((rel > 1.3) & (rel < 1.9))         # 目の高さの帯 = 壁・背の高い物
# v2（本人「全ての部屋で」）: スキャンの範囲 = この階の高さの点がある所を 0.6m で閉じて穴を埋め、1m 広げる。
# 部屋の真ん中がこの中なら撮ってみる（写るかどうかは 1 点ずつの AI が決める）。床の点の多さでは決めない
def ell(mm): k = max(3, int(round(m2(mm))) | 1); return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
foot = density((rel > -0.6) & (rel < 2.6)) > 0
foot = cv2.morphologyEx(foot.astype(np.uint8), cv2.MORPH_CLOSE, ell(0.6))
foot = ndi.binary_fill_holes(foot).astype(np.uint8)
foot = cv2.dilate(foot, ell(2.0)).astype(bool)

# ── 1. 壁 ──
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.int16)
sat = img.max(2).astype(np.int16) - img.min(2).astype(np.int16)
dark = ((gray < 150) & (sat < 70)) | (gray < 70)
n, lab, st, _ = cv2.connectedComponentsWithStats(dark.astype(np.uint8), 8)
big_side = m2(0.9)
keep = np.zeros(n, bool)
for i in range(1, n):
    bw, bh, ar = st[i, 2], st[i, 3], st[i, 4]
    if max(bw, bh) >= big_side: keep[i] = True
walls = keep[lab]
if SCANWALLS:
    k = max(1, int(round(m2(0.12))))
    bd = cv2.GaussianBlur(band, (0, 0), max(1.0, m2(0.05)))
    thr = max(2.0, np.percentile(bd[bd > 0], 70) if (bd > 0).any() else 2.0)
    sw = (bd >= thr).astype(np.uint8)
    sw = cv2.morphologyEx(sw, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    n2, l2, s2, _ = cv2.connectedComponentsWithStats(sw, 8)
    ok2 = np.zeros(n2, bool)
    for i in range(1, n2):
        if max(s2[i, 2], s2[i, 3]) >= m2(0.6): ok2[i] = True
    walls = walls | cv2.dilate(ok2[l2].astype(np.uint8), np.ones((k, k), np.uint8)).astype(bool)
# inside（多角形 / hull / crop）
ins = reg.get('inside', 'crop')
inside = np.ones((h, w), bool)
if isinstance(ins, list) and len(ins) >= 3:
    inside = np.zeros((h, w), np.uint8); cv2.fillPoly(inside, [np.array([[p[0] - x0, p[1] - y0] for p in ins], np.int32)], 1); inside = inside.astype(bool)
elif ins == 'hull':
    ys, xs = np.nonzero(walls)
    if len(xs):
        hull = cv2.convexHull(np.stack([xs, ys], 1).astype(np.int32)); inside = np.zeros((h, w), np.uint8); cv2.fillPoly(inside, [hull], 1); inside = inside.astype(bool)
# 図の外枠は壁扱い（端に触れる区画 = 外 を見分けるため、外枠そのものは壁にしない）
free = ~walls

# ── 2. 家具の線で囲まれた小さな島 ──
thick_k = max(3, int(round(m2(0.08))) | 1)
thick = cv2.morphologyEx(walls.astype(np.uint8), cv2.MORPH_OPEN, np.ones((thick_k, thick_k), np.uint8)).astype(bool)
nf, lf, sf, _ = cv2.connectedComponentsWithStats(free.astype(np.uint8), 4)
furn = np.zeros((h, w), bool)
for i in range(1, nf):
    a = sf[i, 4] * px2m2
    if a >= 4.0: continue
    xb, yb, bw, bh = sf[i, :4]
    if xb == 0 or yb == 0 or xb + bw >= w or yb + bh >= h: continue
    if max(bw, bh) > m2(1.8) and sf[i, 4] / math.hypot(bw, bh) < m2(0.15): continue   # 1.8m を超え平均幅 0.15m 未満の細い帯（ガラス壁と外枠の間・サンルームの帯）は家具ではない。外すと部屋が外へ漏れる
    comp = lf == i
    ring = cv2.dilate(comp.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool) & ~comp
    ringw = ring & walls
    if ringw.sum() == 0: continue
    if (ringw & cv2.dilate(thick.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)).sum() / ringw.sum() < 0.3:
        furn |= cv2.dilate(comp.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
walls_r = walls & ~furn          # 部屋分けの壁（家具の線を外す）
# 太い壁の図面（壁を太線・塗りで描く）では、太い壁に触れていない細い線（テーブル・アイランド・ベッドの輪郭）も壁から外す。
# 窓・扉の細線は太い壁につながっているので残る（外す と外へ漏れる）
# 部屋番号の丸・柱など、太いが小さい塊（0.9m 未満）は部屋を割るので外す
nk, lk, sk, _ = cv2.connectedComponentsWithStats(thick.astype(np.uint8), 8)
smallk = np.zeros(nk, bool)
for i in range(1, nk):
    if max(sk[i, 2], sk[i, 3]) < m2(0.9): smallk[i] = True
# 部屋番号の丸（塗りつぶしの丸・中に白い数字）: 丸に近い小さな塊。部屋の目印として使う（同じ区画に 2 つあれば、その 2 部屋に分ける）
markers = []
for i in range(1, n):
    bw, bh = st[i, 2], st[i, 3]
    if bw == 0 or bh == 0 or not (0.8 <= bw / bh <= 1.25 and m2(0.25) <= max(bw, bh) <= m2(0.8)): continue
    comp = (lab[st[i, 1]:st[i, 1] + bh, st[i, 0]:st[i, 0] + bw] == i)
    filled = ndi.binary_fill_holes(comp)
    fr, solid = filled.sum() / (bw * bh), comp.sum() / max(1, filled.sum())
    if 0.65 <= fr <= 0.9 and solid >= 0.5: markers.append((int(st[i, 0] + bw / 2), int(st[i, 1] + bh / 2)))
# 線に重なった番号の丸（トイレの扉の線に触れている 9 など）は塊として取れないので、円の検出でも拾う（中が黒く、白い数字が少しある丸）
_circ = cv2.HoughCircles(cv2.GaussianBlur(gray.astype(np.uint8), (5, 5), 1.2), cv2.HOUGH_GRADIENT, 1.2, max(8, int(m2(0.4))), param1=120, param2=18,
                         minRadius=max(4, int(m2(0.12))), maxRadius=max(6, int(m2(0.4))))
if _circ is not None:
    for cx_, cy_, cr_ in _circ[0]:
        cx_, cy_, cr_ = int(cx_), int(cy_), int(cr_)
        if any(math.hypot(cx_ - mx, cy_ - my) < 2 * cr_ for mx, my in markers): continue
        mm = np.zeros((h, w), np.uint8); cv2.circle(mm, (cx_, cy_), max(2, int(cr_ * 0.85)), 1, -1); mm = mm.astype(bool)
        if mm.sum() < 20: continue
        dk = (gray[mm] < 90).mean(); wt = (gray[mm] > 170).mean()
        ring_ = np.zeros((h, w), np.uint8); cv2.circle(ring_, (cx_, cy_), int(cr_ * 1.5), 1, max(1, int(cr_ * 0.3))); ring_ = ring_.astype(bool)
        if 0.55 <= dk <= 0.93 and 0.05 <= wt and (gray[ring_] > 150).mean() > 0.5: markers.append((cx_, cy_)); smallk_extra = True
blob = cv2.dilate(smallk[lk].astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
walls_r = walls_r & ~blob
thick = thick & ~smallk[lk]
if walls.sum() and thick.sum() / walls.sum() >= 0.3:
    thin = walls_r & ~thick
    nt, lt = cv2.connectedComponents(thin.astype(np.uint8), connectivity=8)
    near = cv2.dilate(thick.astype(np.uint8), np.ones((max(5, int(m2(0.15)) | 1),) * 2, np.uint8)).astype(bool)
    touch = np.zeros(nt, bool); touch[np.unique(lt[near & thin])] = True; touch[0] = True
    walls_r = walls_r & touch[lt]
free_r = ~walls_r

if '--debug' in sys.argv:
    dbg = np.dstack([walls_r * 255, thick * 255, walls * 120]).astype(np.uint8); cv2.imwrite(f'{d}/{opt("out", "planrooms")}_walls.png', dbg)
    print('thick/walls', round(float(thick.sum() / max(1, walls.sum())), 2), 'ppm', round(ppm, 1), 'thick_k', thick_k)
# ── 3. 部屋の芯 → 部屋 ──
dist = cv2.distanceTransform(free_r.astype(np.uint8), cv2.DIST_L2, 5)
cores = (dist > m2(0.47)) & inside
nc, lc = cv2.connectedComponents(cores.astype(np.uint8), connectivity=8)
# 部屋番号の丸が芯の無い所（トイレなど幅 0.9m 未満の小部屋）にあれば、そこも芯にする
for (mx, my) in markers:
    if 0 <= my < h and 0 <= mx < w and inside[my, mx] and lc[my, mx] == 0:
        nc += 1; tmp = np.zeros((h, w), np.uint8); cv2.circle(tmp, (mx, my), max(2, int(m2(0.12))), 1, -1); lc[(tmp > 0) & free_r & (lc == 0)] = nc - 1 if False else lc.max() + 1
regions = watershed(-dist, lc, mask=free_r & inside)
# くびれで割る: 0.47m で 1 つの区画でも、もっと広い開口（1.4〜2.8m）でつながった部屋は、壁からの距離の芯が
# しきい値を上げると 2 つ以上に分かれる。分かれた芯がそれぞれ 0.3㎡ 以上なら、その芯から塗り直して分ける（四角い部屋は割れない）
def split_all(regions):
    nxt = regions.max() + 1
    stack = list(range(1, regions.max() + 1))
    while stack:
        r = stack.pop(); R = regions == r
        if R.sum() * px2m2 < 6: continue
        for t in (0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.4, 1.7):
            C = (dist > m2(t)) & R
            n_, l_, s_, _ = cv2.connectedComponentsWithStats(C.astype(np.uint8), 8)
            big = [i for i in range(1, n_) if s_[i, 4] * px2m2 >= 0.15]
            if len(big) >= 2:
                mk = np.zeros_like(regions)
                for j, i in enumerate(big): mk[l_ == i] = j + 1
                sub = watershed(-dist, mk, mask=R)
                for j in range(1, len(big) + 1):
                    if j == 1: regions[sub == 1] = r; stack.append(r)
                    else: regions[sub == j] = nxt; stack.append(nxt); nxt += 1
                break
    return regions
regions = split_all(regions)
# 芯が取れない狭い部屋（幅 0.9m 未満の個室が並ぶトイレなど）: どの区画にも入らなかった床のうち、図の端に触れない 1.2㎡ 以上のまとまりも部屋にする
_left = (regions == 0) & free_r & inside
_n, _l, _s, _ = cv2.connectedComponentsWithStats(cv2.morphologyEx(_left.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)), 4)
for _i in range(1, _n):
    _x, _y, _bw, _bh, _a = _s[_i]
    if _a * px2m2 < 1.2 or _x <= 1 or _y <= 1 or _x + _bw >= w - 1 or _y + _bh >= h - 1: continue
    if min(_bw, _bh) < m2(0.5): continue
    regions[_l == _i] = regions.max() + 1
# 目印（部屋番号の丸）で割る: 1 つの区画に目印が 2 つ以上 → 目印から塗り直す（扉の無い続き間・ゾーン分けの部屋）
if markers:
    nxt = regions.max() + 1
    for r in range(1, regions.max() + 1):
        R = regions == r
        mk_in = [(x, y) for x, y in markers if 0 <= y < h and 0 <= x < w and R[y, x]]
        if len(mk_in) < 2: continue
        mk = np.zeros_like(regions)
        for j, (x, y) in enumerate(mk_in): cv2.circle(mk, (x, y), max(2, int(m2(0.15))), int(j + 1), -1)
        mk[~R] = 0
        sub = watershed(-dist, mk, mask=R)
        for j in range(2, len(mk_in) + 1): regions[sub == j] = nxt; nxt += 1

# 色で割る（v2）: 床を色で塗り分けた図面（eight-cafe のように壁で閉じていない続き間）は、広い区画の中の床の色の塊ごとに部屋に分ける。
# 細かい模様（木目・タイル）はぼかして消し、4㎡ 以上の色の塊が 2 つ以上ある区画だけ割る（色の差 ΔE 14 以上）
lab_img = cv2.cvtColor(cv2.medianBlur(cv2.GaussianBlur(img, (0, 0), max(1.0, m2(0.06))), 7), cv2.COLOR_BGR2LAB).astype(np.float32)
nxt = regions.max() + 1
for r in (range(1, regions.max() + 1) if '--nocolor' not in sys.argv and not reg.get('noColorSplit') else []):
    R = regions == r
    if R.sum() * px2m2 < 12: continue
    Rf = R & ~cv2.dilate(walls.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
    X = lab_img[Rf]
    if len(X) < 500: continue
    Xs = X[np.random.default_rng(0).choice(len(X), min(6000, len(X)), replace=False)]
    best = None
    for k in (2, 3, 4):
        _, lbl, cen = cv2.kmeans(Xs, k, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5), 3, cv2.KMEANS_PP_CENTERS)
        wv = np.array([0.3, 1.0, 1.0], np.float32)   # 明るさだけの差（紙の濃淡・網掛け）では割らない。色味（a,b）の差で割る
        dmin = min(np.linalg.norm((cen[i] - cen[j]) * wv) for i in range(k) for j in range(i + 1, k))
        if dmin >= 10: best = cen
    if best is None: continue
    lab_all = np.argmin(((lab_img[R][:, None, :] - best[None]) ** 2).sum(2), 1)
    Lm = np.full((h, w), -1, np.int32); Lm[R] = lab_all
    comps = []
    for i in range(len(best)):
        Ci = cv2.morphologyEx((Lm == i).astype(np.uint8), cv2.MORPH_OPEN, ell(0.3))
        n_, l_, s_, _ = cv2.connectedComponentsWithStats(Ci, 8)
        comps += [(l_ == j) for j in range(1, n_) if s_[j, 4] * px2m2 >= 2.5]
    if len(comps) < 2: continue
    mk = np.zeros_like(regions)
    for j, C in enumerate(comps): mk[C] = j + 1
    sub = watershed(-dist, mk, mask=R)
    for j in range(2, len(comps) + 1): regions[sub == j] = nxt; nxt += 1

# 図面の線（家具・階段の線も含む）からの距離。番号の丸・文字は除く
obs_d = cv2.distanceTransform((~(walls & ~blob)).astype(np.uint8), cv2.DIST_L2, 5)
# 建物の絵の範囲（図面の線の凸包）。壁で閉じていない広い所はこの中だけ
hull_mask = np.zeros((h, w), np.uint8)
_ys, _xs = np.nonzero(walls)
if len(_xs): cv2.fillPoly(hull_mask, [cv2.convexHull(np.stack([_xs, _ys], 1).astype(np.int32))], 1)
hull_mask = hull_mask.astype(bool)
walked = np.zeros((h, w), np.uint8)
for n in nodes:
    if n.get('floorY') is not None and abs(n['floorY'] - floor0) > 1.0: continue
    u, v = w2c(n['x'], n['z'])
    if 0 <= u < w and 0 <= v < h: cv2.circle(walked, (int(u), int(v)), int(m2(1.5)), 1, -1)
walked = walked.astype(bool)
# ── 4〜7. 部屋ごと ──
def tnode(n):
    u, v = w2c(n['x'], n['z']); return u, v
npx = [(n['id'],) + tnode(n) for n in nodes]
rooms = []
border = np.zeros((h, w), bool); border[:2, :] = border[-2:, :] = True; border[:, :2] = border[:, -2:] = True
# 吹き抜け（図面で部屋に × の対角線）: 床が無いので部屋に数えない
line0 = (((gray < 215) & (sat < 60))).astype(np.uint8) * 255
def is_void(cnt):
    # 部屋の範囲で長い直線（破線もつなぐ）を探し、右上がり・右下がりの 2 本が部屋の対角線ほどの長さで真ん中付近で交われば吹き抜け
    x, y, bw, bh = cv2.boundingRect(cnt)
    if min(bw, bh) < m2(1.2): return False
    mask = np.zeros((h, w), np.uint8); cv2.drawContours(mask, [cnt], -1, 255, -1)
    if (line0[mask > 0] > 0).mean() > 0.3: return False   # 部屋の中が暗い（黒地の図面・濃い塗り）なら対角線は見分けられない
    mask = cv2.dilate(mask, np.ones((max(5, int(m2(0.4)) | 1),) * 2, np.uint8))
    L = cv2.bitwise_and(line0, mask)[max(0, y - int(m2(0.4))):y + bh + int(m2(0.4)), max(0, x - int(m2(0.4))):x + bw + int(m2(0.4))]
    diag = math.hypot(bw, bh)
    ls = cv2.HoughLinesP(L, 1, np.pi / 180, threshold=max(20, int(diag * 0.25)), minLineLength=int(diag * 0.45), maxLineGap=max(4, int(m2(0.35))))
    if ls is None: return False
    pos = neg = False
    for x1_, y1_, x2_, y2_ in ls[:, 0]:
        dx, dy = x2_ - x1_, y2_ - y1_
        if abs(dx) < 0.25 * abs(dy) or abs(dy) < 0.25 * abs(dx): continue   # 縦・横の線（壁・寸法）は対角線ではない
        ox_, oy_ = max(0, x - int(m2(0.4))), max(0, y - int(m2(0.4)))
        px_, py_ = x + bw / 2 - ox_ - x1_, y + bh / 2 - oy_ - y1_
        if abs(dx * py_ - dy * px_) / math.hypot(dx, dy) > 0.08 * diag: continue   # 線（の延長）が部屋の真ん中を通る
        if abs(math.atan2(abs(dy), abs(dx)) - math.atan2(bh, bw)) > math.radians(12): continue   # 部屋の対角線の向き
        if dx * dy > 0: pos = True
        else: neg = True
    return pos and neg
def do_room(R, r, force=False):
    pass
    a = R.sum() * px2m2
    has_mk = any(0 <= y < h and 0 <= x < w and R[y, x] for x, y in markers)
    if a < (0.9 if has_mk else 1.5): return
    if not force and not isinstance(ins, list) and (R & border).sum() > m2(0.5):   # inside に多角形があれば、その多角形が建物の範囲（端の判定はしない）
        # 図の端につながる区画は建物の外。ただし図面で塗ってある所（テラス・デッキの灰色など）は図に描かれた空間なので残す
        tint = ((gray[R] < 245) | (sat[R] > 20)).mean()
        n_in = sum(1 for _, nu, nv in npx if 0 <= int(nv) < h and 0 <= int(nu) < w and R[int(nv), int(nu)])
        if n_in >= 3 and (R & hull_mask).sum() >= 0.6 * R.sum():   # 写真ツアーの地点が 3 つ以上ある区画は建物の中（図の端へ扉・開口で抜けているだけ）。図の線の凸包で切る
            R = R & hull_mask
        elif tint < 0.6: return
    Re = cv2.erode(R.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
    cv_ = cv2.dilate((cover > 0).astype(np.uint8), np.ones((max(3, int(m2(0.3))),) * 2, np.uint8)).astype(bool)
    frac = float((Re & cv_).sum() / max(1, Re.sum()))
    # 壁で閉じていない広い所（中庭・柱だけのピロティ・図の外とつながった区画）: スキャンの床が写っている部分だけを 1 つの空間にする
    if not force and frac < 0.5 and a > 100:
        R2 = R & hull_mask & walked                     # 写真ツアーの地点が歩いた所（地点から 1.5m）だけ。床の点は屋外の地面にも広がるので使わない
        # v2: 歩いた所は 3m 以内ならつなげ、まとまりごとに凸包で 1 つの空間にする（屋上・中庭が地点の丸の寄せ集めに割れないように）
        R3 = cv2.dilate(R2.astype(np.uint8), ell(1.5)).astype(bool) & R
        n3, l3, s3, _ = cv2.connectedComponentsWithStats(R3.astype(np.uint8), 8)
        for i in range(1, n3):
            if s3[i, 4] * px2m2 < 6: continue
            C = (l3 == i) & R2
            ys3, xs3 = np.nonzero(C)
            if len(xs3) < 10: continue
            hm = np.zeros((h, w), np.uint8); cv2.fillPoly(hm, [cv2.convexHull(np.stack([xs3, ys3], 1).astype(np.int32))], 1)
            do_room(hm.astype(bool) & R, r, force=True)
        return
    ys, xs = np.nonzero(R)
    # 短辺（主軸の向きでの幅）
    pts2 = np.stack([xs, ys], 1).astype(np.float32)
    mean = pts2.mean(0); cov = np.cov((pts2 - mean).T); ev, evec = np.linalg.eigh(cov); ax = evec[:, 1]
    proj = (pts2 - mean) @ ax; proj2 = (pts2 - mean) @ evec[:, 0]
    long_m, short_m = (proj.max() - proj.min()) / ppm, (proj2.max() - proj2.min()) / ppm
    if short_m < (0.55 if has_mk else 0.8): return     # 寸法線などで切れた細い帯（番号の丸がある小部屋＝トイレ等は 0.55m まで）
    k = 1 if a <= BIG else min(6, int(math.ceil(a / BIG)))
    targets = []
    qs = np.quantile(proj, np.linspace(0, 1, k + 1))
    for j in range(k):
        S = np.zeros((h, w), np.uint8)
        sel = (proj >= qs[j]) & (proj <= qs[j + 1])
        S[ys[sel], xs[sel]] = 1
        ds = cv2.distanceTransform(S, cv2.DIST_L2, 5)
        # 立てる所: 図面のどの線（家具・階段・カウンター）からも 0.35m 以上離れ、家具の輪郭の中でない所。その中で区画の縁から一番遠い所
        okp = (obs_d >= m2(0.35)) & ~furn & (S > 0)
        if not okp.any(): okp = (obs_d >= m2(0.2)) & ~furn & (S > 0)
        score = np.where(okp, ds, -1) if okp.any() else ds
        vy, vx = np.unravel_index(np.argmax(score), score.shape)
        targets.append((int(vx), int(vy), float(ds[vy, vx] / ppm)))
    # 3m 以上離す（近すぎる真ん中は捨てる）
    tt = []
    for t in targets:
        if all(math.hypot(t[0] - q[0], t[1] - q[1]) / ppm >= 3.0 for q in tt): tt.append(t)
    cnt = cv2.findContours(R.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)[0]
    c0 = max(cnt, key=cv2.contourArea)
    poly = cv2.approxPolyDP(c0, max(1.0, m2(0.05)), True)[:, 0, :]
    tol = max(0.6, 0.12 * short_m)
    out_t = []
    for (u, v, clear) in tt:
        best = None
        for nid, nu, nv in npx:
            if 0 <= int(nv) < h and 0 <= int(nu) < w and R[int(nv), int(nu)]:
                dd = math.hypot(nu - u, nv - v) / ppm
                if dd <= tol and (best is None or dd < best[1]): best = (nid, dd)
        x, z = c2w(u, v)
        # その場の床の高さ（床の帯の点の中央値）
        sel = (np.abs(P[:, 0] - x) < 0.35) & (np.abs(P[:, 2] - z) < 0.35) & (rel > -0.4) & (rel < 0.35)
        fy = float(np.median(P[sel, 1])) if sel.sum() > 30 else floor0
        out_t.append({'u': u + x0, 'v': v + y0, 'x': round(x, 3), 'z': round(z, 3), 'floorY': round(fy, 3), 'clear': round(clear, 2),
                      'node': best[0] if best else None, 'nodeDist': round(best[1], 2) if best else None})
    # 控えの位置（AI が「物の中・壊れ」と言ったとき用）: 立てる所を、真ん中に近い順に 0.7m 以上離して最大 8 か所
    Rd = cv2.distanceTransform(R.astype(np.uint8), cv2.DIST_L2, 5)
    okR = R & (obs_d >= m2(0.3)) & ~furn
    alts = []
    if okR.any():
        cand = np.argwhere(okR); sc = Rd[okR]
        order = np.argsort(-sc)
        for idx in order[:: max(1, len(order) // 4000)]:
            vy, vx = cand[idx]
            if any(math.hypot(vx - a[0] + x0, vy - a[1] + y0) < m2(0.7) for a in alts): continue
            if any(math.hypot(vx - (t['u'] - x0), vy - (t['v'] - y0)) < m2(0.5) for t in out_t): continue
            x, z = c2w(vx, vy)
            sel = (np.abs(P[:, 0] - x) < 0.35) & (np.abs(P[:, 2] - z) < 0.35) & (rel > -0.4) & (rel < 0.35)
            fy = float(np.median(P[sel, 1])) if sel.sum() > 30 else floor0
            alts.append([int(vx) + x0, int(vy) + y0, round(x, 3), round(z, 3), round(fy, 3)])
            if len(alts) >= 8: break
    nodes_in = [nid for nid, nu, nv in npx if 0 <= int(nv) < h and 0 <= int(nu) < w and R[int(nv), int(nu)]]
    void = is_void(c0)
    in_foot = any(foot[min(h - 1, max(0, int(t['v'] - y0))), min(w - 1, max(0, int(t['u'] - x0)))] for t in out_t)
    rooms.append({'id': f'r{len(rooms) + 1}', 'area': round(a, 1), 'long': round(long_m, 2), 'short': round(short_m, 2), 'cover': round(frac, 2),
                  'scanned': not void and (force or in_foot or frac >= 0.5 or len(nodes_in) > 0), 'void': bool(void), 'inFoot': bool(in_foot), 'poly': [[int(p[0]) + x0, int(p[1]) + y0] for p in poly], 'targets': out_t, 'alts': alts, 'nodesIn': nodes_in, 'label': int(r)})
# 細切れ（ariake など）: 太い壁の図面で、3㎡ 未満・番号の丸なしの区画が細い線（文字・寸法・家具）だけで隣と分かれていれば隣にまとめる
if walls.sum() and thick.sum() / walls.sum() >= 0.3:
    thickD = cv2.dilate(thick.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
    kk = np.ones((max(5, int(m2(0.25)) | 1),) * 2, np.uint8)
    for r in range(1, regions.max() + 1):
        R = regions == r; a = R.sum() * px2m2
        if a == 0 or a >= 3 or any(0 <= y < h and 0 <= x < w and R[y, x] for x, y in markers): continue
        ring = cv2.dilate(R.astype(np.uint8), kk).astype(bool) & ~R
        nb = regions[ring]; nb = nb[(nb > 0) & (nb != r)]
        if not len(nb): continue
        sep = ring & walls
        if sep.sum() and (sep & thickD).sum() >= 0.3 * sep.sum(): continue
        regions[R] = np.bincount(nb).argmax()
for r in range(1, regions.max() + 1):
    do_room(regions == r, r)
# inside に多角形を書いたシーン（屋外の広場など、図面で部屋に閉じていない所）で部屋が 1 つも取れないとき: 多角形の中の床を 1 つの部屋にする
if isinstance(ins, list) and not any(rr['scanned'] for rr in rooms):
    lab_force = int(regions.max()) + 1; regions[inside & free_r] = lab_force
    do_room(regions == lab_force, lab_force, force=True)

out = {'v': 1, 'reg': regname, 'blueprint': reg['blueprint'], 'crop': [x0, y0, x1, y1], 'ppm': round(ppm, 3), 'floor0': floor0, 'key': td.get('key'), 'scene': td.get('scene'),
       'eye': None, 'rooms': rooms, 'unscanned': [r['id'] for r in rooms if not r['scanned'] and not r.get('void')], 'voids': [r['id'] for r in rooms if r.get('void')], 'markers': [[x + x0, y + y0] for x, y in markers]}
OUTN = opt('out', 'planrooms')
json.dump(out, open(f'{d}/{OUTN}.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# ── 確認図 ──
vis = img.copy()
rng = np.random.default_rng(3)
for rr in rooms:
    R = np.zeros((h, w), np.uint8); cv2.fillPoly(R, [np.array([[p[0] - x0, p[1] - y0] for p in rr['poly']], np.int32)], 1); R = R.astype(bool)
    col = np.array([90, 200, 90]) if rr['scanned'] else np.array([60, 60, 200]) if rr.get('void') else np.array([150, 150, 150])
    col = (col * 0.6 + rng.integers(0, 100, 3)).astype(np.uint8)
    vis[R] = (vis[R] * 0.55 + col * 0.45).astype(np.uint8)
    for t in (rr['targets'] if rr['scanned'] else []):
        cu, cv = int(t['u'] - x0), int(t['v'] - y0)
        cv2.drawMarker(vis, (cu, cv), (0, 0, 255) if not t['node'] else (255, 0, 0), cv2.MARKER_CROSS, max(10, int(m2(0.5))), 2)
    ys, xs = np.nonzero(R)
    if len(xs): cv2.putText(vis, f"{rr['id']} {rr['area']}", (int(xs.mean()) - 20, int(ys.mean()) + 18), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 1)
for x, y in markers: cv2.circle(vis, (x, y), max(6, int(m2(0.3))), (255, 0, 255), 2)
for nid, nu, nv in npx:
    if 0 <= nu < w and 0 <= nv < h: cv2.circle(vis, (int(nu), int(nv)), 3, (0, 160, 255), -1)
cv2.imwrite(f'{d}/{OUTN}.png', vis)
print(f'planrooms {d}: voids {len(out["voids"])} rooms {len(rooms)} scanned {sum(r["scanned"] for r in rooms)} targets {sum(len(r["targets"]) for r in rooms if r["scanned"])} reuse {sum(1 for r in rooms if r["scanned"] for t in r["targets"] if t["node"])}')
