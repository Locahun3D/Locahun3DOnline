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
if reg.get('darkBg'):   # 11/28 第10回（studio-please-green: 黒地に緑の線の図面で、黒い床がまるごと壁になり部屋が階段だけになった）: 色の付いた線を黒、暗い地を白に描き直す
    _sat = img.max(2).astype(np.int16) - img.min(2).astype(np.int16)
    img = np.where(((_sat > 40) | (img.max(2) > 110))[..., None], 0, 255).astype(np.uint8).repeat(3, 2) if img.ndim == 3 else img
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
# 鏡張りの部屋（ariake 108 ダンス演習室）: 鏡の向こうに映った「偽の部屋」の点が隣の小部屋に重なる → reg.json の scanClip（世界 x,z の多角形）の外の点と地点は使わない
if reg.get('scanClip'):
    _cp = np.array(reg['scanClip'], np.float32).reshape(-1, 1, 2)
    from matplotlib.path import Path as _Path
    _in = _Path(np.array(reg['scanClip'], float)).contains_points(P[:, [0, 2]])
    P = P[_in]
    nodes = [n for n in nodes if cv2.pointPolygonTest(_cp, (float(n['x']), float(n['z'])), False) >= 0]
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
LINCON = float(next((a.split('=')[1] for a in sys.argv if a.startswith('--lincon=')), 0.25))
band_lo = density((rel > 0.5) & (rel < 1.2))
band_hi = density((rel > 1.9) & (rel < 2.3))      # 家具より高い帯 = 壁・建具の上
_wall3 = cv2.dilate((band > 0).astype(np.uint8), np.ones((max(3, int(m2(0.6))),) * 2, np.uint8)).astype(bool)
# v2（本人「全ての部屋で」）: スキャンの範囲 = この階の高さの点がある所を 0.6m で閉じて穴を埋め、1m 広げる。
# 部屋の真ん中がこの中なら撮ってみる（写るかどうかは 1 点ずつの AI が決める）。床の点の多さでは決めない
def ell(mm): k = max(3, int(round(m2(mm))) | 1); return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
foot = density((rel > -0.6) & (rel < 2.6)) > 0
foot = cv2.morphologyEx(foot.astype(np.uint8), cv2.MORPH_CLOSE, ell(0.6))
foot = ndi.binary_fill_holes(foot).astype(np.uint8)
foot0 = foot.astype(bool)
foot = cv2.dilate(foot, ell(2.0)).astype(bool)
# 11/27 第4回（ariake 1F）: 1m 広げた範囲だけだと、壁 1 枚向こうの床がほとんど写っていない小部屋（床 0〜13%）までスキャン済みになり、写らない点を撮っていた
# → 広げた範囲に入るだけの部屋は床の写りが 15% 以上のときだけ（ingle の玄関・トイレは 19〜22% で残る）
# 第2回の審査（eight-cafe の 51㎡ のカフェ）: 図面に描いていない机・椅子・カウンターの中や脇に点が落ち、7 候補すべて「家具に近すぎ」で落ちた。
# スキャンの腰の高さ（床から 0.3〜1.4m）の点が濃い所を物とみなし、そこからの距離 scan_d を候補選びに使う
_ob = cv2.blur(density((rel > 0.3) & (rel < 1.4)), (max(3, int(m2(0.15))),) * 2)
_thr = max(1.0, 0.12 * float(np.percentile(_ob[_ob > 0], 95))) if (_ob > 0).any() else 1e9
scan_obj = _ob > _thr
cv2.imwrite(d+'/dbg_scanobj.png', (scan_obj*255).astype('uint8')) if '--dbg' in sys.argv else None
scan_d = cv2.distanceTransform((~scan_obj).astype(np.uint8), cv2.DIST_L2, 5)

# ── 1. 壁 ──
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.int16)
sat = img.max(2).astype(np.int16) - img.min(2).astype(np.int16)
# 第5回（fc-space）: 図の斜線（ハッチ）＝「利用禁止」「プライベートゾーン」の範囲に点が落ちていた → 斜め 45° の細い線が密な所（1.5㎡ 以上のまとまり）をハッチとみなす
def _hatch():
    g_ = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    L_ = (cv2.morphologyEx(g_, cv2.MORPH_BLACKHAT, cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9))) > 12).astype(np.uint8)
    n_ = max(12, int(m2(0.5))); k1 = np.eye(n_, dtype=np.uint8)
    d1 = cv2.morphologyEx(L_, cv2.MORPH_OPEN, k1); d2 = cv2.morphologyEx(L_, cv2.MORPH_OPEN, np.ascontiguousarray(np.fliplr(k1)))
    H_ = (cv2.blur((d1 | d2).astype(np.float32), (max(3, int(m2(1.0))),) * 2) > 0.03).astype(np.uint8)
    nn, ll, st, _ = cv2.connectedComponentsWithStats(H_, 8)
    keep = np.zeros_like(H_, bool)
    for j in range(1, nn):
        if st[j, 4] * px2m2 < 1.5: continue
        # 斜線は片方の向きだけが 6 本以上並ぶ（fuchu の階段・玄関の赤い網掛けは両方向が同じくらい → 対象外）
        c1 = cv2.connectedComponents((d1 & (ll == j)).astype(np.uint8), connectivity=8)[0] - 1
        c2 = cv2.connectedComponents((d2 & (ll == j)).astype(np.uint8), connectivity=8)[0] - 1
        if max(c1, c2) >= 6 and min(c1, c2) <= 0.3 * max(c1, c2): keep |= ll == j
    return keep
HATCH = _hatch() if not reg.get('noHatch') else np.zeros(img.shape[:2], bool)
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
# 11/28 第8回の審査（makinoshita 北側和室・東側和室1）: 襖・障子の細い二重線が壁として残らず、廊下・台所の一角と和室が 1 部屋になって
# 真ん中が廊下側・入口の隅に落ちた → reg.json の walls（図面の画素で [u1,v1,u2,v2] の線分）を部屋分けの壁として足す（図の部屋の線をなぞるだけ）
for _sg in reg.get('walls') or []:
    _wm = np.zeros((h, w), np.uint8)
    cv2.line(_wm, (int(_sg[0] - x0), int(_sg[1] - y0)), (int(_sg[2] - x0), int(_sg[3] - y0)), 1, max(3, int(m2(0.08))))
    walls_r = walls_r | _wm.astype(bool); walls = walls | _wm.astype(bool)
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
if opt('probe'):
    _pu, _pv = [int(v) for v in opt('probe').split(',')]
    _sl = (slice(_pv - 25, _pv + 25), slice(_pu - 45, _pu + 45))
    print('probe free', round(float(free_r[_sl].mean()), 2), 'inside', round(float(inside[_sl].mean()), 2), 'regions', np.unique(regions[_sl], return_counts=True), 'cover', round(float((cover[_sl] > 0).mean()), 2), 'walls', round(float(walls[_sl].mean()), 2))
_wallsplit = set()   # 3D の壁・床で裏づけた小区画（トイレ・浴室など小さくても部屋として残す）
# 芯が取れない狭い部屋（幅 0.9m 未満の個室が並ぶトイレなど）: どの区画にも入らなかった床のうち、図の端に触れない 1.2㎡ 以上のまとまりも部屋にする
_left = (regions == 0) & free_r & inside
_n, _l, _s, _ = cv2.connectedComponentsWithStats(cv2.morphologyEx(_left.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)), 4)
for _i in range(1, _n):
    _x, _y, _bw, _bh, _a = _s[_i]
    if _x <= 1 or _y <= 1 or _x + _bw >= w - 1 or _y + _bh >= h - 1: continue
    if min(_bw, _bh) < m2(0.5): continue
    # 11/27: 0.7〜1.2㎡ でも 3D の床が写っている（床の点がある）まとまりは部屋（endurehome のユニットバス）
    _flo = float(((cover > 0) & (_l == _i)).sum() / max(1, _a))
    if _a * px2m2 < 1.2 and not (_a * px2m2 >= 0.7 and _flo >= 0.3): continue
    regions[_l == _i] = regions.max() + 1
    if _a * px2m2 < 1.2: _wallsplit.add(int(regions.max()))
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
_todo = list(range(1, regions.max() + 1)) if '--nocolor' not in sys.argv and not reg.get('noColorSplit') else []
_seen = 0
while _todo and _seen < 60:   # 割れた区画もさらに割る（第2回: endurehome の灰の部屋＋青い浴室が 2 段目でしか分かれない）
    r = _todo.pop(0); _seen += 1
    R = regions == r
    if R.sum() * px2m2 < 6: continue   # 第2回: endurehome の 8.4㎡（灰の床の部屋＋青い浴室）が割れなかった
    Rf = R & ~cv2.dilate(walls.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
    X = lab_img[Rf]
    if len(X) < 500: continue
    Xs = X[np.random.default_rng(0).choice(len(X), min(6000, len(X)), replace=False)]
    best, bestd = None, 0
    for k in (2, 3, 4):
        _, lbl, cen = cv2.kmeans(Xs, k, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5), 3, cv2.KMEANS_PP_CENTERS)
        wv = np.array([0.3, 1.0, 1.0], np.float32)   # 明るさだけの差（紙の濃淡・網掛け）では割らない。色味（a,b）の差で割る
        dmin = min(np.linalg.norm((cen[i] - cen[j]) * wv) for i in range(k) for j in range(i + 1, k))
        if dmin >= 10: best, bestd = cen, dmin
    if best is None:
        if '--dbg' in sys.argv: print('colorsplit none', r, round(R.sum()*px2m2,1))
        continue
    lab_all = np.argmin(((lab_img[R][:, None, :] - best[None]) ** 2).sum(2), 1)
    Lm = np.full((h, w), -1, np.int32); Lm[R] = lab_all
    comps = []
    for i in range(len(best)):
        Ci = cv2.morphologyEx((Lm == i).astype(np.uint8), cv2.MORPH_OPEN, ell(0.3))
        n_, l_, s_, _ = cv2.connectedComponentsWithStats(Ci, 8)
        di = min(np.linalg.norm((best[i] - best[j]) * np.array([0.3, 1.0, 1.0], np.float32)) for j in range(len(best)) if j != i)
        comps += [(l_ == j) for j in range(1, n_) if s_[j, 4] * px2m2 >= (1.2 if di >= 18 else 2.5)]   # 他の色とはっきり違う（ΔE 18 以上）色の塊は 1.2㎡ の浴室・トイレでも割る
    # 第5回（eight-cafe 05・08）: 色付きの机（緑・灰・紫）が部屋として割れていた → 塊の中が腰の高さ（0.5〜1.2m）の点で 8.5 割以上埋まっていれば家具（eight-cafe の机 0.98〜1.0、studio-meal の小部屋 0.61〜0.63 は残す）とみなして使わない
    _lo = cv2.dilate((band_lo > 0).astype(np.uint8), np.ones((max(3, int(m2(0.1))),) * 2, np.uint8)).astype(bool)
    _fr = [float((C & _lo).sum() / max(1, C.sum())) for C in comps]
    if '--dbg' in sys.argv: print('colorsplit furn', [round(f, 2) for f in _fr])
    comps = [C for C, f in zip(comps, _fr) if f < 0.85 or C.sum() * px2m2 >= 6]   # 6㎡ 以上の塊は家具でなく床（机と椅子で埋まったカフェの床も腰の高さの点が多い）
    if '--dbg' in sys.argv: print('colorsplit', r, round(R.sum()*px2m2,1), round(bestd,1), [round(c.sum()*px2m2,1) for c in comps])
    if len(comps) < 2: continue
    mk = np.zeros_like(regions)
    for j, C in enumerate(comps): mk[C] = j + 1
    sub = watershed(-dist, mk, mask=R)
    _todo.append(r)
    for j in range(2, len(comps) + 1): regions[sub == j] = nxt; _todo.append(nxt); nxt += 1

# 細い間仕切りで割る（司令塔 11/27「全ての部屋で」: ingleneuk の洗面室＋トイレ、endurehome の部屋＋浴室が 1 区画になっていた）。
# 15㎡ 未満の区画の中を端から端まで横切る細い直線（扉の開口 0.9m までは途切れてよい）があり、両側が 0.9㎡ 以上なら、その線で割る
_g8 = np.clip(gray, 0, 255).astype(np.uint8)
_bh = cv2.morphologyEx(_g8, cv2.MORPH_BLACKHAT, np.ones((max(5, int(m2(0.12)) | 1),) * 2, np.uint8))
_l0 = (((_bh > 40) | (gray < 90)) & (sat < 60)).astype(np.uint8)   # 細い濃い線（塗りの濃淡ではなく線）。黒い壁も含める
_todo2 = [int(r) for r in range(1, regions.max() + 1)]; _n2 = 0
while _todo2 and _n2 < 200 and '--nolinesplit' not in sys.argv:
    r = _todo2.pop(0); _n2 += 1
    R = regions == r; a_ = R.sum() * px2m2
    if a_ < 3.0 or a_ >= 15: continue   # 第5回（modello 浴室 2.6㎡ が浴槽の線で 1.2+1.2 に割れた）: 3㎡ 未満はもう割らない（トイレ 1.1〜1.4㎡ は 3.6〜6.3㎡ の区画から切り出される）
    ys_, xs_ = np.nonzero(R); x0_, x1_, y0_, y1_ = xs_.min(), xs_.max(), ys_.min(), ys_.max()
    Ri = cv2.erode(R.astype(np.uint8), np.ones((3, 3), np.uint8))
    Lr = (_l0 & cv2.dilate(Ri, np.ones((3, 3), np.uint8)) & (1 - cv2.erode(Ri, np.ones((5, 5), np.uint8), iterations=1) * 0)).astype(np.uint8) * 255
    Lr[~cv2.dilate(R.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)] = 0   # 壁として区画の外に出ている間仕切り（扉の開口で区画がつながっている）も拾う
    span = min(x1_ - x0_, y1_ - y0_)
    ls_ = cv2.HoughLinesP(Lr, 1, np.pi / 180, threshold=max(8, int(span * 0.3)), minLineLength=max(6, int(span * 0.35)), maxLineGap=int(m2(0.9)))
    if '--dbg' in sys.argv and ls_ is not None: print(' hough', r, round(a_, 1), [tuple(int(v) for v in q) for q in ls_[:, 0]][:12])
    if ls_ is None: continue
    done_ = False
    # タイル・畳・格子の模様（同じ向きの線が等間隔に 3 本以上）の区画では割らない
    hv = [('h' if math.degrees(math.atan2(abs(q[3] - q[1]), abs(q[2] - q[0]))) <= 8 else 'v' if math.degrees(math.atan2(abs(q[3] - q[1]), abs(q[2] - q[0]))) >= 82 else 'd', (q[1] + q[3]) / 2 if math.degrees(math.atan2(abs(q[3] - q[1]), abs(q[2] - q[0]))) <= 8 else (q[0] + q[2]) / 2) for q in ls_[:, 0]]
    def grid_(o):   # 0.25m 以内の線は 1 本にまとめ、4 本以上が等間隔（間隔のばらつき 3 割未満）なら模様
        ps = sorted(p for k, p in hv if k == o); cl = []
        for p_ in ps:
            if not cl or p_ - cl[-1] > m2(0.25): cl.append(p_)
        if len(cl) < 4: return False
        df = np.diff(cl)
        # 第5回（makinoshita 便所）: 和室の 909mm 割の壁・押入の線も等間隔に並ぶ → 模様とみなすのは間隔 0.75m 未満（タイル）か 6 本以上のときだけ
        return float(df.std() / max(1e-6, df.mean())) < 0.3 and (df.mean() < m2(0.75) or len(cl) >= 6)
    for x1, y1, x2, y2 in sorted(ls_[:, 0], key=lambda q: -math.hypot(q[2] - q[0], q[3] - q[1])):
        ang = math.degrees(math.atan2(abs(y2 - y1), abs(x2 - x1)))
        if 8 < ang < 82: continue                      # 縦・横の線だけ
        if grid_('h' if ang <= 8 else 'v'): continue
        # 線を区画の外まで延ばして切る
        if ang <= 8: yy = int(round((y1 + y2) / 2)); cut = np.zeros((h, w), np.uint8); cv2.line(cut, (int(x0_) - 2, yy), (int(x1_) + 2, yy), 1, 2)
        else: xx = int(round((x1 + x2) / 2)); cut = np.zeros((h, w), np.uint8); cv2.line(cut, (xx, int(y0_) - 2), (xx, int(y1_) + 2), 1, 2)
        # 線は区画の幅の 6 割以上を実際に覆っていること（家具の縁の短い線では割らない）
        on = (cut.astype(bool) & cv2.dilate(R.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)); cov_ = (on & cv2.dilate(_l0, np.ones((3, 3), np.uint8)).astype(bool)).sum() / max(1, on.sum())
        if cov_ < 0.75: continue
        _lp = on & cv2.dilate(_l0, np.ones((3, 3), np.uint8)).astype(bool) & (_l0 > 0)
        dark_ = float(np.percentile(gray[_lp], 30)) if _lp.any() else 255
        _bd = cv2.dilate((band > 0).astype(np.uint8), np.ones((max(3, int(m2(0.15))),) * 2, np.uint8)).astype(bool)
        wall3d = float((on & _bd).sum() / max(1, on.sum()))   # 3D の目の高さの点（本物の壁）がその線の上にどれだけあるか
        _bh = cv2.dilate((band_hi > 0).astype(np.uint8), np.ones((max(3, int(m2(0.15))),) * 2, np.uint8)).astype(bool)
        wallhi = float((on & _bh).sum() / max(1, on.sum()))   # 家具より高い所（床から 1.9〜2.3m）の点が線の上にどれだけあるか
        _inn = R & ~cv2.dilate(cut, np.ones((max(3, int(m2(0.8))),) * 2, np.uint8)).astype(bool)
        bg3d = float((_inn & _bd).sum() / max(1, _inn.sum()))   # 線から離れた区画の中の、目の高さの点の割合（物・吊り物が多い部屋は全体に高い）
        if '--dbg' in sys.argv: print('  cand', r, ang, 'cov', round(cov_, 2), 'wall3d', round(wall3d, 2), 'bg3d', round(bg3d, 2), 'hi', round(wallhi, 2))
        if wall3d < 0.5: continue   # 図の線の上に 3D の壁（目の高さの点）が無い＝浴槽・家具の縁。割らない
        # 司令塔 11/27（carnival 和室）: 畳の線は目の高さに物（吊り物・家具）があると wall3d が 0.5〜0.7 になる。
        # 本物の壁は家具より高い所（1.9〜2.3m）まで続く → 区画の外周の壁はその高さまであるのに、この線の上に無い（3 割未満）なら割らない
        _ring = cv2.dilate(R.astype(np.uint8), np.ones((max(3, int(m2(0.4))),) * 2, np.uint8)).astype(bool) & ~R
        ringhi = float((_ring & _bh).sum() / max(1, _ring.sum()))
        # 線の上と、線から 0.4m ずらした平行線の上で、目の高さの点（細めに 0.08m）の割合を比べる（壁＝線の上だけ高い／散らかり＝どこも同じ）
        _bn = cv2.dilate((band > 0).astype(np.uint8), np.ones((max(3, int(m2(0.08))),) * 2, np.uint8)).astype(bool)
        _sh = max(2, int(m2(0.4))); _Rd = R.astype(bool)
        def _frac_at(k):
            M_ = np.float32([[1, 0, 0], [0, 1, k]]) if ang <= 8 else np.float32([[1, 0, k], [0, 1, 0]])
            c_ = cv2.warpAffine(cut, M_, (w, h)).astype(bool) & _Rd
            return float((c_ & _bn).sum() / max(1, c_.sum())) if c_.sum() > 5 else None
        _offs = [f for f in (_frac_at(_sh), _frac_at(-_sh)) if f is not None]
        lincon = float((on & _bn).sum() / max(1, on.sum())) - (float(np.mean(_offs)) if _offs else 0.0)
        _bl = cv2.dilate((band_lo > 0).astype(np.uint8), np.ones((max(3, int(m2(0.08))),) * 2, np.uint8)).astype(bool)
        walllo = float((on & _bl).sum() / max(1, on.sum()))   # 腰の高さ（0.5〜1.2m）。鴨居・梁は上だけ、壁は下まで続く
        if '--dbg' in sys.argv: print('   ringhi', round(ringhi, 2), 'lincon', round(lincon, 2), 'lo', round(walllo, 2))
        parts = R & ~cut.astype(bool)
        n_, l_, st_, _ = cv2.connectedComponentsWithStats(parts.astype(np.uint8), 4)
        big = [j for j in range(1, n_) if st_[j, 4] * px2m2 >= 0.8]
        if '--dbg' in sys.argv: print('   parts', [(round(st_[j, 4] * px2m2, 2), round(min(st_[j, 2], st_[j, 3]) / ppm, 2)) for j in range(1, n_)])
        if len(big) < 2: continue
        # 両側とも細すぎない（短辺 0.6m 以上）
        if any(min(st_[j, 2], st_[j, 3]) < m2(0.6) for j in big): continue
        # 司令塔 11/27（carnival 和室）: 撮影機材・衝立で目の高さに線状の点がある部屋は 3D だけでは壁と見分けられない。
        # 上（1.9〜2.3m）に壁が無い（3 割未満）か、合わせて 9㎡ 未満（吊り布・衝立で仕切っただけの和室）で、両側が図で同じ色に塗られた同じ部屋（色付き・Lab 差 12 未満。carnival 和室は文字・畳の縁で 9.7）なら割らない
        if wallhi < 0.3 or sum(st_[j, 4] for j in big) * px2m2 < 9:
            _lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(float); _hsv_s = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)[:, :, 1]
            _pm = [(_lab[(l_ == j) & (_l0 == 0)].mean(0), float(_hsv_s[(l_ == j) & (_l0 == 0)].mean())) for j in big]
            if '--dbg' in sys.argv: print('   colour', [(np.round(q, 0).tolist(), round(sv)) for q, sv in _pm])
            _glob = np.median(_lab[_l0 == 0].reshape(-1, 3)[::17], 0)   # 図全体の地の色（please-green のように全面同じ色の CAD 図は対象外）
            if all(sv > 25 for _, sv in _pm) and np.linalg.norm(_pm[0][0] - _glob) > 12 and max(np.linalg.norm(_pm[0][0] - q) for q, _ in _pm[1:]) < 12:
                if '--dbg' in sys.argv: print('   same-colour room, no high wall -> keep whole'); 
                continue
        for j in big[1:]: regions[l_ == j] = nxt; _todo2.append(int(nxt)); _wallsplit.add(int(nxt)); nxt += 1
        _wallsplit.add(int(r))
        _todo2.append(r); done_ = True
        if '--dbg' in sys.argv: print('linesplit', r, round(a_, 1), [round(st_[j, 4] * px2m2, 1) for j in big], 'cov', round(cov_, 2))
        break

if opt('probe'):
    _pu, _pv = [int(v) for v in opt('probe').split(',')]
    _r = regions[_pv, _pu]; print('probe2 region', _r, 'area', round(float((regions == _r).sum() * px2m2), 2), 'ws', int(_r) in _wallsplit, [ (int(k), round(float((regions == k).sum() * px2m2), 1)) for k in np.unique(regions) if k])
# 図面の線（家具・階段の線も含む）からの距離。番号の丸・文字は除く
obs_d = cv2.distanceTransform((~(walls & ~blob)).astype(np.uint8), cv2.DIST_L2, 5)
AVOID = np.zeros((h, w), np.uint8)
for _au, _av, _ar in reg.get('avoid') or []: cv2.circle(AVOID, (int(_au - x0), int(_av - y0)), int(m2(_ar)), 1, -1)
AVOID = AVOID.astype(bool)
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
    if '--dbg' in sys.argv and R.any():
        _ys,_xs=np.nonzero(R); print('room?', r, round(a,2), int(_xs.mean())+x0, int(_ys.mean())+y0, 'border', int((R & border).sum()), 'sat', round(float(sat[R].mean()),1))
    has_mk = any(0 <= y < h and 0 <= x < w and R[y, x] for x, y in markers)
    tinted = float(sat[R].mean()) > 25   # 第2回: endurehome の 1.4㎡ のユニットバス（水色で塗った小部屋）が落ちていた
    ws_ = int(r) in _wallsplit
    if a < (0.8 if ws_ else 0.9 if has_mk else 1.0 if tinted else 1.5): return
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
    # 第5回: 図の部屋の壁（輪郭）のうち、スキャンの目の高さの点（壁）が 0.3m 以内にある割合。閉じた小部屋の中を撮っていないと低い
    _bdr = R & ~cv2.erode(R.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
    wallfrac = float((_bdr & _wall3).sum() / max(1, _bdr.sum()))
    # 20㎡ 未満で壁の 3 割未満しかスキャンに無い部屋は、中を撮っていない（閉じた部屋を外から・鏡の偽の部屋が重なっただけ）→ 点を作らない
    # 実測（第5回）: 撮れている小部屋 0.4〜1.0、審査で「別の部屋に見える」が続いた部屋 0.0〜0.27（zigsaw r3/r12・grass 2F r2/r6・qapla 2F r5/r6）
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
    if short_m < (0.5 if ws_ else 0.55 if has_mk else 0.65 if tinted else 0.8): return     # 寸法線などで切れた細い帯（番号の丸がある小部屋＝トイレ等は 0.55m まで）
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
        if (okp & ~HATCH).any(): okp = okp & ~HATCH   # 斜線（利用禁止）の範囲には置かない
        if (okp & ~AVOID).any(): okp = okp & ~AVOID   # 11/28 第10回（grass メインスタジオ: 点が足場の中）: reg.json の avoid [[u,v,半径m]] の範囲には置かない
        # スキャンの物から 0.55m 離れた所が区画の 15% 以上あり、真ん中らしさ（縁からの距離）を半分以上保てるときだけ使う（スキャンがにじむ区画は物だらけに見えるので使わない）
        okc = okp & (scan_d >= m2(0.55))
        if okc.sum() >= 0.15 * max(1, okp.sum()) and okc.any() and ds[okc].max() >= 0.5 * ds[okp].max(): okp = okc
        # 第2回の審査: 机で埋まった会議室（eight-cafe 08）で、縁から一番遠い所が扉脇の隅になった → 区画の重心に近い方を少し優先
        sy_, sx_ = np.nonzero(S); cy_, cx_ = sy_.mean(), sx_.mean()
        dc = np.hypot(*np.meshgrid(np.arange(w) - cx_, np.arange(h) - cy_)[::-1])
        score = np.where(okp, ds - 0.35 * dc, -1e9) if okp.any() else ds - 0.35 * dc
        vy, vx = np.unravel_index(np.argmax(score), score.shape)
        # 11/28 第8回の審査（makinoshita 台所: 真ん中がダイニングテーブル・椅子の上で 8 候補すべて「家具の上」）:
        # 選んだ所がスキャンの物（腰の高さ）の上なら、物から 0.45m 以上離れた床のうち同じ点数で一番良い所へ
        if scan_d[vy, vx] < m2(0.3):
            okc2 = okp & (scan_d >= m2(0.45))
            if okc2.any():
                score = np.where(okc2, ds - 0.35 * dc, -1e9); vy, vx = np.unravel_index(np.argmax(score), score.shape)
        targets.append((int(vx), int(vy), float(ds[vy, vx] / ppm)))
    # 11/28 第8回の審査（eight-cafe 08 会議室: 机で埋まった部屋で真ん中が入口脇の壁際になった）: reg.json の pins（図面の画素 [u,v]）が
    # この区画の中にあれば、そこを真ん中にする（人が図を見て「机・椅子を除いた床で部屋の中心線上」を指す。区画ごとの手当て）
    _pins = [(int(pu - x0), int(pv - y0)) for pu, pv in (reg.get('pins') or []) if 0 <= pv - y0 < h and 0 <= pu - x0 < w and R[int(pv - y0), int(pu - x0)]]
    if _pins:
        _dsR = cv2.distanceTransform(R.astype(np.uint8), cv2.DIST_L2, 5)
        targets = [(pu, pv, float(_dsR[pv, pu] / ppm)) for pu, pv in _pins]
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
                # 11/28 第9回の審査（eight-cafe 02 カフェ 点4）: 真ん中の近くの既存地点が図面ではテーブルの天板の上 → 家具の線の中・線から 0.2m 未満の地点は使わない（真ん中に新しく撮る）
                if furn[int(nv), int(nu)] or obs_d[int(nv), int(nu)] < m2(0.2): continue
                # 第10回の審査（ariake 中庭・グラウンド: 既存地点が柱・木の幹の至近で正面が塞がれた）: スキャンの物（腰の高さ）から 0.6m 未満の地点も使わない
                if scan_d[int(nv), int(nu)] < m2(0.6): continue
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
    okR = R & (obs_d >= m2(0.3)) & ~furn & ~HATCH & ~AVOID
    okc = okR & (scan_d >= m2(0.5))
    okc45 = okR & (scan_d >= m2(0.45))
    if okc.sum() >= 0.15 * max(1, okR.sum()): okR = okc
    alts = []
    # 11/28 第8回（makinoshita 台所）: 物から離れた床が少ない部屋でも、まずその床（物から 0.45m 以上）を控えにする（家具の上の控えばかりにならない）
    _pool = [okc45, okR] if okc45.any() and not (okR == okc).all() else [okR]
    for _ok in _pool:
        if not _ok.any() or len(alts) >= 8: continue
        cand = np.argwhere(_ok); sc = Rd[_ok]
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
    hatched = float((R & HATCH).sum() / max(1, R.sum())) >= 0.5
    nowall = a < 20 and wallfrac < 0.3 and band.sum() > 0 and len(nodes_in) < 3   # 地点が 3 つ以上ある部屋は実際に歩いた部屋（casablanca r3: 地点 7・壁 0.15）
    void = is_void(c0)
    in_foot = any(foot0[min(h - 1, max(0, int(t['v'] - y0))), min(w - 1, max(0, int(t['u'] - x0)))] for t in out_t) or (frac >= 0.15 and any(foot[min(h - 1, max(0, int(t['v'] - y0))), min(w - 1, max(0, int(t['u'] - x0)))] for t in out_t))
    rooms.append({'id': f'r{len(rooms) + 1}', 'area': round(a, 1), 'long': round(long_m, 2), 'short': round(short_m, 2), 'cover': round(frac, 2), 'wallFrac': round(wallfrac, 2),
                  'scanned': not void and not nowall and not hatched and (force or in_foot or frac >= 0.5 or len(nodes_in) > 0), 'noWall': bool(nowall), 'hatched': bool(hatched), 'void': bool(void), 'inFoot': bool(in_foot), 'poly': [[int(p[0]) + x0, int(p[1]) + y0] for p in poly], 'targets': out_t, 'alts': alts, 'nodesIn': nodes_in, 'label': int(r)})
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
# 手で確かめた「1 部屋なのに割れた」区画（qapla 2F: Bスタジオの中の緑のホリゾントの塗りで 3 つに割れた）: reg.json の merge = [[[u,v],[u,v],...], ...]（図面の画素）ごとに 1 部屋へ
for grp in reg.get('merge') or []:
    labs = [int(regions[int(v) - y0, int(u) - x0]) for u, v in grp if 0 <= int(v) - y0 < h and 0 <= int(u) - x0 < w]
    labs = [l for l in labs if l > 0]
    for l in labs[1:]: regions[regions == l] = labs[0]
for r in range(1, regions.max() + 1):
    do_room(regions == r, r)
# 第6回の審査（meal 倉庫・r1）: 外壁の向こうの小部屋が、窓越しに見えた床の点だけで「スキャンあり」になり、候補の写真が屋外・にじみ → 床の点の密度（1㎡あたり）が
# 一番よく撮れている部屋の 5% 未満の部屋は中を撮っていない（実測 meal: 撮れている部屋 6,800〜12,000、倉庫 99・r2 141）
# 第7回: 床の高さが部屋ごとに違う家（makinoshita: 和室は廊下より高い）で、全体の床帯 ±0.25m だと撮れている部屋まで薄くなり 14 部屋が消えた
# → 部屋ごとに「その部屋の床の高さ」（-1.0〜+0.6m の点の高さの最頻値）を求め、その ±0.25m の点の数 / 面積 を密度にする（窓越しに見えた床はどの高さでも疎）
_lab = np.zeros((h, w), np.int32)
for k, rr in enumerate(rooms, 1):
    cv2.fillPoly(_lab, [np.array([[q[0] - x0, q[1] - y0] for q in rr['poly']], np.int32)], k)
_sel = inb & (rel > -1.0) & (rel < 0.6)
_pl = np.zeros(len(P), np.int32); _pl[_sel] = _lab[v_[_sel].astype(int), u_[_sel].astype(int)]
_den = {}
for k, rr in enumerate(rooms, 1):
    rh = rel[_pl == k]; am = max(1e-6, float((_lab == k).sum()) * px2m2)
    if len(rh) < 20: _den[rr['id']] = 0.0; continue
    hist, edges = np.histogram(rh, bins=16, range=(-1.0, 0.6)); f_ = edges[hist.argmax()] + 0.05
    _den[rr['id']] = float(((rh > f_ - 0.25) & (rh < f_ + 0.25)).sum() / am)
_ref = max([_den[rr['id']] for rr in rooms if rr['area'] >= 4 and rr['id'] in _den] or [0])   # 小部屋の飛び抜けた値（makinoshita r16 3.6㎡ 42,000）を基準にしない
# 第7回の審査（ariake 階段広場）: 床の高さがばらつく屋外のシーンは床の帯が拾えず（最良の部屋でも 1,000/㎡ 未満）、ガラス越しに見えた屋内の部屋が全部「スキャンあり」→ 候補が屋外・にじみ。
# そのときは写真ツアーの地点から 1.5m 以内（歩いた所）が部屋の 15% 未満の部屋は中を撮っていないとみなす
_wk = {}
for rr in rooms:
    _m = np.zeros((h, w), np.uint8); cv2.fillPoly(_m, [np.array([[q[0] - x0, q[1] - y0] for q in rr['poly']], np.int32)], 1); _m = _m.astype(bool)
    _wk[rr['id']] = float((walked & _m).sum() / max(1, _m.sum()))
for rr in rooms:
    rr['walkFrac'] = round(_wk.get(rr['id'], 0), 2)
    if _ref < 1000 and rr['scanned'] and not rr['nodesIn'] and _wk.get(rr['id'], 0) < 0.15 and walked.any():
        rr['scanned'] = False; rr['notWalked'] = True
for rr in rooms:
    rr['floorDen'] = round(_den.get(rr['id'], 0))
    if _ref > 1000 and rr['scanned'] and not rr['nodesIn'] and _den.get(rr['id'], 0) < 0.08 * _ref:   # 実測（部屋ごとの床）: meal 倉庫 660（基準 9,942）・qapla 2F 廊下 425（6,442）／撮れている最小 makinoshita r22 2,056（15,490）・modello r4 1,732（15,903）
        rr['scanned'] = False; rr['thinFloor'] = True
# inside に多角形を書いたシーン（屋外の広場など、図面で部屋に閉じていない所）で部屋が 1 つも取れないとき: 多角形の中の床を 1 つの部屋にする
if isinstance(ins, list) and not any(rr['scanned'] for rr in rooms):
    lab_force = int(regions.max()) + 1; regions[inside & free_r] = lab_force
    do_room(regions == lab_force, lab_force, force=True)

out = {'v': 1, 'reg': regname, 'blueprint': reg['blueprint'], 'crop': [x0, y0, x1, y1], 'ppm': round(ppm, 3), 'floor0': floor0, 'key': td.get('key'), 'scene': td.get('scene'),
       'eye': None, 'rooms': rooms, 'unscanned': [r['id'] for r in rooms if not r['scanned'] and not r.get('void') and not r.get('noWall') and not r.get('hatched') and not r.get('thinFloor') and not r.get('notWalked')], 'thinFloor': [r['id'] for r in rooms if r.get('thinFloor')], 'notWalked': [r['id'] for r in rooms if r.get('notWalked')], 'noWall': [r['id'] for r in rooms if r.get('noWall') and not r.get('void')], 'hatched': [r['id'] for r in rooms if r.get('hatched') and not r.get('void')], 'voids': [r['id'] for r in rooms if r.get('void')], 'markers': [[x + x0, y + y0] for x, y in markers]}
OUTN = opt('out', 'planrooms')
json.dump(out, open(f'{d}/{OUTN}.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1, default=lambda o: o.item() if hasattr(o, 'item') else str(o))

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
