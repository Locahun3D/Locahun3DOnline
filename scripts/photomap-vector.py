# 点群から「不動産の間取り図」ふうの平面図を描く（2026-11-26 本人「不動産で使えるくらいに」。手本 planear.co.jp の平面図）。
#   1. 壁 = 0.3〜2.1m の 6 帯のうち 5 帯以上に点がある所（カウンター・ソファ・浮遊物は通さない）
#   2. 壁から縦・横・斜めの線を取り、線を図全体まで延ばして平面を区画に分ける
#   3. 撮影位置から壁にぶつかるまで広がる空き床で、各区画を室内・室外に分ける → 外形は必ず壁の線の上に乗る
#   4. 外形の辺のうち、壁（物）が沿っていない所は破線（根拠のない実線を描かない）
#   5. 柱（天井まで続く 0.35m 角以上の孤立した塊）・間仕切り・造り付けの大きな家具（1.5㎡以上 or 長辺2m以上）
#   python scripts/photomap-vector.py <..._sec.json> <点の .npz> [--k=3] [--debug]
#   出力: <名前>_vec.json（geom = 線の形）と _vec_raw.png
import sys, json, numpy as np, cv2
from scipy import ndimage
from skimage.morphology import skeletonize
from skimage.transform import probabilistic_hough_line
from shapely.geometry import LineString, Polygon, Point, box
from shapely.ops import unary_union, polygonize
args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = lambda k, d: next((a.split('=', 1)[1] for a in sys.argv if a.startswith(f'--{k}=')), d)
td = json.load(open(args[0], encoding='utf-8')); d = np.load(args[1]); P, A, L = d['p'], d['a'], d['leaf']
fy = td['floorY']; rot = td.get('rot', 0.0); ro = td.get('rotOrigin', {'x': 0, 'z': 0}); ppm = td['ppm']; S = td['px']; c = td['center']
cs, sn = np.cos(rot), np.sin(rot)
r = lambda m_: max(1, int(round(m_ * ppm)))
ell = lambda m_: cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (r(m_), r(m_)))
def to_px(x, z):
    dx, dz = x - ro['x'], z - ro['z']; xr, zr = ro['x'] + cs * dx - sn * dz, ro['z'] + sn * dx + cs * dz
    return (xr - c['x']) * ppm + S / 2, (zr - c['z']) * ppm + S / 2
h = P[:, 1] - fy
u, v = to_px(P[:, 0], P[:, 2]); u = u.astype(int); v = v.astype(int); ok = (u >= 0) & (u < S) & (v >= 0) & (v < S) & L
NP = np.array([to_px(n['x'], n['z']) for n in td['nodes']])
# 図に出す印（--select=rooms.json のときはその地点だけ）。部屋の名前は印から離して置く
_sel = set(json.load(open(opt('select', None), encoding='utf-8'))['select']) if opt('select', None) else None
MP = np.array([to_px(n['x'], n['z']) for n in td['nodes'] if _sel is None or n['id'] in _sel]) if (_sel is None or _sel) else NP
def raster(k, blur):
    D = np.zeros((S, S), np.float32); np.add.at(D, (v[k], u[k]), 1); return cv2.GaussianBlur(D, (0, 0), blur)
def node_comp(M):
    n, lab = cv2.connectedComponents(M.astype(np.uint8))
    ids = {lab[int(y), int(x)] for x, y in NP if 0 <= int(x) < S and 0 <= int(y) < S} - {0}
    return np.isin(lab, list(ids)).astype(np.uint8)
def clean(M, mn):
    n, lab, st, _ = cv2.connectedComponentsWithStats(M.astype(np.uint8), connectivity=8)
    keep = np.zeros(n, bool); keep[1:] = st[1:, cv2.CC_STAT_AREA] >= mn * ppm * ppm; return keep[lab].astype(np.uint8)
seed = np.full((S, S), 255, np.uint8)
for x, y in NP: cv2.circle(seed, (int(x), int(y)), 2, 0, -1)
NEAR = (cv2.distanceTransform(seed, cv2.DIST_L2, 5) < 8 * ppm).astype(np.uint8)
# ---- 1. 高さ別の占有
BINS = np.arange(0.3, 2.11, 0.3); occ = []
for a_, b_ in zip(BINS[:-1], BINS[1:]):
    Dk = raster(ok & (A > 0.3) & (h >= a_) & (h < b_), 1.0); t = np.percentile(Dk[Dk > 0], 90) * float(opt('bt', '0.15'))
    occ.append(cv2.dilate((Dk > t).astype(np.uint8), np.ones((3, 3), np.uint8)) & NEAR)
occ = np.array(occ); wcnt = occ.sum(0); NB = len(occ)
WALL = clean(cv2.morphologyEx((wcnt >= NB - int(opt('wmiss', '2'))).astype(np.uint8), cv2.MORPH_CLOSE, ell(.08)), 0.04)
OB = (occ[:4].sum(0) >= 2).astype(np.uint8)   # 何か物がある（外形の辺の根拠に使う）
WALLT = WALL.copy()   # 天井近くまで続く壁だけ（間仕切りの判定用）
# 高さが続かなくても、細長く 1.5m 以上続く物は壁として扱う（鏡・ガラス・点の薄い壁、ブースの背）
n_, lab_, st_, _ = cv2.connectedComponentsWithStats(cv2.morphologyEx((wcnt >= 3).astype(np.uint8), cv2.MORPH_CLOSE, ell(.1)), connectivity=8)   # 背の低いソファ・カウンターは入れない
for i in range(1, n_):
    if st_[i, cv2.CC_STAT_AREA] < r(.5) * r(.1): continue
    cn_, _ = cv2.findContours((lab_ == i).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    (_, _), (rw_, rh_), _ = cv2.minAreaRect(cn_[0])
    if max(rw_, rh_) >= r(1.5) and st_[i, cv2.CC_STAT_AREA] / max(1, max(rw_, rh_)) <= r(.3): WALL[lab_ == i] = 1
# 柱: 天井近くまで続く、0.35〜1.0m 角のまとまった塊
FULL = (wcnt >= NB).astype(np.uint8)
# 柱は壁の線に吸われる前に、天井まで続く帯（6/6）の塊から取る（壁から少し離れた丸・角の塊）
cols = []; n2, lab2, st2, _ = cv2.connectedComponentsWithStats(cv2.morphologyEx(FULL, cv2.MORPH_OPEN, ell(.12)), connectivity=8)
for i in range(1, n2):
    x, y, w, hh, ar = st2[i]
    if r(.35) <= min(w, hh) and max(w, hh) <= r(1.0) and max(w, hh) / max(1, min(w, hh)) < 1.6 and ar > 0.6 * w * hh:
        cc_, _ = cv2.findContours((lab2 == i).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE); (_, _), rad_ = cv2.minEnclosingCircle(cc_[0])
        cols.append((x, y, w, hh, 'c' if ar > 0.7 * np.pi * rad_ * rad_ else 'r')); dm_ = cv2.dilate((lab2 == i).astype(np.uint8), ell(.1)) > 0; WALL[dm_] = 0; WALLT[dm_] = 0
# ---- 2. 壁の線
def axis_pieces(M, horiz):
    ker = np.ones((1, r(.5)), np.uint8) if horiz else np.ones((r(.5), 1), np.uint8)
    O = cv2.morphologyEx(M, cv2.MORPH_OPEN, ker); n_, lab_, st_, cen_ = cv2.connectedComponentsWithStats(O, connectivity=8); out = []
    for i in range(1, n_):
        x, y, w, hh, ar = st_[i]
        if horiz and w >= r(.5) and hh <= r(.45): out.append((cen_[i][1], x, x + w))
        if not horiz and hh >= r(.5) and w <= r(.45): out.append((cen_[i][0], y, y + hh))
    return out, O
# 長い斜めの壁（縦横から 8°以上傾いた 3m 以上の直線）を先に取る。縦横の太い帯として拾われると段々になるため（渋谷 6F 外観の斜めの廊下）
DG = []; DM = np.zeros((S, S), np.uint8)
for (x0, y0), (x1, y1) in probabilistic_hough_line(skeletonize(WALL > 0), threshold=10, line_length=r(3.0), line_gap=r(.6), rng=0):
    ang = np.degrees(np.arctan2(y1 - y0, x1 - x0)) % 180
    if min(ang, 180 - ang) > 8 and abs(ang - 90) > 8:
        # 同じ線の重複（角度 3°以内・距離 0.3m 以内）はまとめる
        dup = False
        for k_, ((a0, b0), (a1, b1)) in enumerate(DG):
            ang2 = np.degrees(np.arctan2(b1 - b0, a1 - a0)) % 180
            if min(abs(ang - ang2), 180 - abs(ang - ang2)) < 3 and LineString([(a0, b0), (a1, b1)]).distance(Point((x0 + x1) / 2, (y0 + y1) / 2)) < r(.3):
                if np.hypot(x1 - x0, y1 - y0) > np.hypot(a1 - a0, b1 - b0): DG[k_] = ((x0, y0), (x1, y1))
                dup = True; break
        if not dup: DG.append(((x0, y0), (x1, y1)))
# 手すりの柱の列（0.6m 未満の小さな塊が 5 本以上・間隔 3m 以内で一直線）→ 1 本の線として外周に使う（屋外テラス）
RAIL = np.zeros((S, S), np.uint8)
nq, labq, stq, cenq = cv2.connectedComponentsWithStats(WALL, connectivity=8)
PO = np.array([cenq[i] for i in range(1, nq) if max(stq[i, 2], stq[i, 3]) < r(1.0) and stq[i, cv2.CC_STAT_AREA] >= r(.08) ** 2], float).reshape(-1, 2)
rngp = np.random.default_rng(1)
for _round in range(4):
    if len(PO) < 5: break
    best = None
    for _ in range(600):
        a_, b_ = PO[rngp.choice(len(PO), 2, replace=False)]; d_ = b_ - a_; Ln = np.linalg.norm(d_)
        if Ln < r(1.0): continue
        d_ /= Ln; nrm = np.array([-d_[1], d_[0]]); dist = np.abs((PO - a_) @ nrm); inl = dist < r(.25)
        if best is None or inl.sum() > best[0]: best = (inl.sum(), a_, d_, inl)
    if best is None or best[0] < 5: break
    _, a_, d_, inl = best; t_ = np.sort((PO[inl] - a_) @ d_)
    # 3m より開いた所で切って、5 本以上続く区間だけ
    cuts = np.split(t_, np.where(np.diff(t_) > r(3.0))[0] + 1)
    for c_ in cuts:
        if len(c_) >= 5:
            p0, p1 = a_ + d_ * c_[0], a_ + d_ * c_[-1]
            DG.append((tuple(p0), tuple(p1))); cv2.line(RAIL, tuple(int(v) for v in p0), tuple(int(v) for v in p1), 1, max(2, r(.1)))
            print('rail', len(c_), 'posts', round((c_[-1] - c_[0]) / ppm, 1), 'm')
    PO = PO[~inl]
for (x0, y0), (x1, y1) in DG: cv2.line(DM, (int(x0), int(y0)), (int(x1), int(y1)), 1, r(.45))
WALLA = (WALL & (DM == 0)).astype(np.uint8)
if "--dbgdg" in sys.argv: print("DG", [(tuple(int(v) for v in a_), tuple(int(v) for v in b_)) for a_, b_ in DG])
HP, HO = axis_pieces(WALLA, True); VP, VO = axis_pieces(WALLA, False)
RES = WALLA & (cv2.dilate(HO | VO, ell(.15)) == 0)
if RES.sum() > 0:
    for (x0, y0), (x1, y1) in probabilistic_hough_line(skeletonize(RES > 0), threshold=10, line_length=r(1.0), line_gap=r(.2), rng=0):
        ang = np.degrees(np.arctan2(y1 - y0, x1 - x0)) % 180
        if min(ang, 180 - ang) > 12 and abs(ang - 90) > 12: DG.append(((x0, y0), (x1, y1)))
# 曲面の壁: 縦横の線にならなかった壁の塊に円を当てる（誤差 0.06m 以内・半径 1〜15m・開き 35°以上）
ARCS = []
rng_ = np.random.default_rng(0)
SKW = skeletonize(WALL > 0)
n_, lab_, st_, _ = cv2.connectedComponentsWithStats(SKW.astype(np.uint8), connectivity=8)
for i in range(1, n_):
    if st_[i, cv2.CC_STAT_AREA] < r(1.5): continue
    yy, xx = np.nonzero(lab_ == i); PTS = np.c_[xx, yy].astype(float)
    for _round in range(3):   # 1 つの塊から最大 3 本の弧
        if len(PTS) < r(1.5): break
        best = None
        for _ in range(400):
            p3 = PTS[rng_.choice(len(PTS), 3, replace=False)]
            (x1, y1), (x2, y2), (x3, y3) = p3; dd = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2))
            if abs(dd) < 1e-6: continue
            ux = ((x1 ** 2 + y1 ** 2) * (y2 - y3) + (x2 ** 2 + y2 ** 2) * (y3 - y1) + (x3 ** 2 + y3 ** 2) * (y1 - y2)) / dd
            uy = ((x1 ** 2 + y1 ** 2) * (x3 - x2) + (x2 ** 2 + y2 ** 2) * (x1 - x3) + (x3 ** 2 + y3 ** 2) * (x2 - x1)) / dd
            R_ = np.hypot(x1 - ux, y1 - uy)
            if not (r(1) < R_ < r(40)): continue   # 大きな弧（ホールの外周）も
            inl = np.abs(np.hypot(PTS[:, 0] - ux, PTS[:, 1] - uy) - R_) < r(.05)
            if best is None or inl.sum() > best[0]: best = (inl.sum(), ux, uy, R_, inl)
        if best is None or best[0] < r(1.5): break
        _, ux, uy, R_, inl = best
        ang = np.sort(np.arctan2(PTS[inl, 1] - uy, PTS[inl, 0] - ux)); gaps = np.diff(np.r_[ang, ang[0] + 2 * np.pi]); j = int(np.argmax(gaps))
        a0_ = ang[(j + 1) % len(ang)]; a1_ = ang[j] if j + 1 < len(ang) else ang[j]
        if a1_ < a0_: a1_ += 2 * np.pi
        span = a1_ - a0_
        # 弧として連続しているか（点の数 ≒ 弧長）・直線で説明できないか（開き 35°以上）
        if '--dbgdg' in sys.argv: print('arc?', round(R_ / ppm, 1), round(float(np.degrees(span))), int(inl.sum()), round(0.6 * span * R_))
        if (np.degrees(span) >= 35 or (span * R_ >= r(6) and np.degrees(span) >= 12)) and inl.sum() >= 0.6 * span * R_:   # 大きな弧は長さ 6m 以上で
            ARCS.append((ux, uy, R_, a0_, a1_))
        PTS = PTS[~inl]
print('arcs', [(round(R_ / ppm, 2), round(float(np.degrees(a1_ - a0_)))) for _, _, R_, a0_, a1_ in ARCS])
def arc_line(cx_, cy_, R_, a0_, a1_, ext):
    # 弧（弦 0.6m 以上の折れ線）＋両端から接線方向に ext だけ延ばした線
    n_ = max(2, int(np.ceil((a1_ - a0_) * R_ / r(.6)))); t_ = np.linspace(a0_, a1_, n_ + 1)
    pts = [(cx_ + R_ * np.cos(t), cy_ + R_ * np.sin(t)) for t in t_]
    t0d = np.array([np.sin(a0_), -np.cos(a0_)]); t1d = np.array([-np.sin(a1_), np.cos(a1_)])
    return [tuple(np.array(pts[0]) + t0d * ext)] + pts + [tuple(np.array(pts[-1]) + t1d * ext)]
def cluster(pieces):
    pieces = sorted(pieces); out = []
    for off, a_, b_ in pieces:
        w_ = b_ - a_
        if out and off - out[-1][0] < r(float(opt('lmerge', '.4'))): o = out[-1]; o[0] = (o[0] * o[1] + off * w_) / (o[1] + w_); o[1] += w_
        else: out.append([off, w_])
    return [o[0] for o in out if o[1] >= r(.5)]
HY, VX = cluster(HP), cluster(VP)
# ---- 3. 空き床 → 区画を室内・室外に
D = raster(ok & (A > 0.2) & (((h > -0.15) & (h < 0.15)) | ((h > 2.3) & (h < 4.0))), 3)
FC = cv2.morphologyEx((D > np.percentile(D[D > 0], 50) * 0.3).astype(np.uint8), cv2.MORPH_OPEN, ell(.5))
# 撮影位置から見通せる床（壁で止まる。家具は通す）。壁の隙間から漏れた分は、床か天井に点がある所だけ残す
WD = cv2.dilate(WALL | RAIL, ell(.08)) > 0   # 手すりの線も見通しを止める
VIS = np.zeros((S, S), np.uint8); ANG = np.linspace(0, 2 * np.pi, 1440, endpoint=False); RR = np.arange(0, 8 * ppm)
for x, y in NP:
    X = (x + np.cos(ANG)[:, None] * RR[None]).astype(int); Y = (y + np.sin(ANG)[:, None] * RR[None]).astype(int)
    inb = (X >= 0) & (X < S) & (Y >= 0) & (Y < S); Xc, Yc = np.clip(X, 0, S - 1), np.clip(Y, 0, S - 1)
    hit = WD[Yc, Xc] | ~inb; first = np.where(hit.any(1), hit.argmax(1), len(RR))
    m_ = RR[None] < first[:, None]; VIS[Yc[m_], Xc[m_]] = 1
VIS = cv2.morphologyEx(VIS, cv2.MORPH_CLOSE, ell(.15))
FREE = (VIS & cv2.dilate(FC, ell(float(opt('fcgrow', '1.0'))))).astype(np.uint8)
# 物の陰（見通せない所）も、床か天井に点があって撮影位置から回り込めるなら室内
FREE |= node_comp(cv2.morphologyEx((FC & (~WD)).astype(np.uint8), cv2.MORPH_OPEN, ell(.3))) & cv2.dilate(VIS, ell(2.0))   # 見通せる床から 1.0m 以内だけ
FREE = node_comp(cv2.morphologyEx(FREE, cv2.MORPH_OPEN, ell(.25)))
FREE0 = cv2.dilate(VIS, ell(.2)) > 0
FREE = ndimage.binary_fill_holes(cv2.morphologyEx(FREE, cv2.MORPH_CLOSE, ell(.6))).astype(np.uint8)
ys, xs = np.nonzero(FREE); bx0, by0, bx1, by1 = max(0, xs.min() - r(1)), max(0, ys.min() - r(1)), min(S - 1, xs.max() + r(1)), min(S - 1, ys.max() + r(1))
frame = box(bx0, by0, bx1, by1)
lines = [LineString([(bx0, y), (bx1, y)]) for y in HY] + [LineString([(x, by0), (x, by1)]) for x in VX]
for (x0, y0), (x1, y1) in DG:   # 斜めの線は図の枠まで延ばす
    dx_, dy_ = x1 - x0, y1 - y0; n_ = np.hypot(dx_, dy_); dx_, dy_ = dx_ / n_, dy_ / n_; Lb = 4 * S
    lines.append(LineString([(x0 - dx_ * Lb, y0 - dy_ * Lb), (x1 + dx_ * Lb, y1 + dy_ * Lb)]).intersection(frame))
for ac in ARCS: lines.append(LineString(arc_line(*ac, 4 * S)).intersection(frame))
lines.append(frame.exterior)
faces = list(polygonize(unary_union([l for l in lines if not l.is_empty])))
inside = []
for f in faces:
    if f.area < 4: continue
    mask = np.zeros((int(by1 - by0) + 2, int(bx1 - bx0) + 2), np.uint8)
    cv2.fillPoly(mask, [np.round(np.array(f.exterior.coords) - [bx0, by0]).astype(np.int32)], 1)
    sub = FREE[int(by0):int(by0) + mask.shape[0], int(bx0):int(bx0) + mask.shape[1]]
    mm = mask[:sub.shape[0], :sub.shape[1]].astype(bool)
    if mm.sum() and sub[mm].mean() > float(opt('fin', '0.4')): inside.append(f)
print('free', FREE.sum() / ppm / ppm, 'm2 inside faces', len(inside), '/', len(faces), 'frame', bx0, by0, bx1, by1, 'f0', faces[0].bounds if faces else None, 'areas', sorted(f.area for f in faces)[-3:])
# 外側に面した辺のほとんどに壁（物）が沿っていない区画は室外に倒す（撮影位置を含む区画は残す）
SUPp = cv2.dilate(OB | WALL, ell(.4))
def support(g_):
    pts = []
    for part in (getattr(g_, 'geoms', None) or [g_]):
        if part.geom_type not in ('LineString', 'LinearRing') or part.length < 1: continue
        n_ = max(2, int(part.length / 2)); pts += [part.interpolate(t, normalized=True) for t in np.linspace(0, 1, n_)]
    if not pts: return 1.0
    return float(np.mean([SUPp[min(S - 1, max(0, int(q.y))), min(S - 1, max(0, int(q.x)))] for q in pts]))
NODEP = [Point(x, y) for x, y in NP]
for _it in range(8):
    U_ = unary_union(inside); ext = U_.boundary; keep = []; changed = False
    for f in inside:
        sh = f.boundary.intersection(ext)
        if sh.length < r(.3) or any(f.contains(q) for q in NODEP): keep.append(f); continue
        if sh.length >= 0.35 * f.boundary.length and support(sh) < 0.3: changed = True; continue
        keep.append(f)
    inside = keep
    if not changed: break
U = unary_union(inside).buffer(0.5).buffer(-0.5)
U = U.buffer(-r(.45), join_style='mitre').buffer(r(.45), join_style='mitre')   # 0.9m より細い首（廊下へ漏れた帯）を切る
polys = [g for g in (U.geoms if U.geom_type == 'MultiPolygon' else [U]) if any(g.contains(Point(x, y)) for x, y in NP) or g.area > (2 * ppm) ** 2]
polys = [Polygon(g.exterior).simplify(1.0) for g in polys]
def no_short(poly, mn):
    # 0.6m 未満の辺を消す: 角の面取り → 角に、段差（前後の辺が平行）→ 短い方の隣の辺を長い方の線にそろえる
    P_ = [np.array(t, float) for t in list(poly.exterior.coords)[:-1]]
    def isect(a1, a2, b1, b2):
        d1, d2 = a2 - a1, b2 - b1; den = d1[0] * d2[1] - d1[1] * d2[0]
        if abs(den) < 1e-6: return None
        t = ((b1[0] - a1[0]) * d2[1] - (b1[1] - a1[1]) * d2[0]) / den; return a1 + d1 * t
    for _ in range(200):
        n_ = len(P_)
        if n_ < 5: break
        Ls = [np.linalg.norm(P_[(i + 1) % n_] - P_[i]) for i in range(n_)]
        i = int(np.argmin(Ls))
        if Ls[i] >= mn: break
        a0, a1, b0, b1 = P_[(i - 1) % n_], P_[i], P_[(i + 1) % n_], P_[(i + 2) % n_]
        q = isect(a0, a1, b0, b1)
        if q is not None and np.linalg.norm(q - a1) < 3 * mn:
            P_[i] = q; P_.pop((i + 1) % n_)
        else:   # 段差
            if Ls[(i - 1) % n_] < Ls[(i + 1) % n_]:   # 前の辺が短い → 前の辺を次の辺の線へ
                d_ = b0 - a1; P_[(i - 1) % n_] = P_[(i - 1) % n_] + d_; P_.pop(i)
            else:
                d_ = a1 - b0; P_[(i + 2) % n_] = P_[(i + 2) % n_] + d_; P_.pop((i + 1) % n_)
    return Polygon(P_).buffer(0)
polys = [no_short(g, r(.6)) for g in polys]
polys = [max(g.geoms, key=lambda q: q.area) if g.geom_type == 'MultiPolygon' else g for g in polys]
def tidy(poly):
    P_ = [np.array(t, float) for t in list(poly.exterior.coords)[:-1]]
    # とげ・楔: 内角 70° 未満で、前後を結ぶ線から 1.0m 未満しか出ていない頂点は消す
    for _ in range(50):
        n_ = len(P_); hit = None
        if n_ < 5: break
        for i in range(n_):
            a0, v, b0 = P_[i - 1], P_[i], P_[(i + 1) % n_]
            u1, u2 = a0 - v, b0 - v; c_ = np.dot(u1, u2) / max(1e-6, np.linalg.norm(u1) * np.linalg.norm(u2))
            ang = np.degrees(np.arccos(np.clip(c_, -1, 1)))
            dl = np.linalg.norm(b0 - a0); dep = abs((b0 - a0)[0] * (v - a0)[1] - (b0 - a0)[1] * (v - a0)[0]) / max(1e-6, dl)
            if ang < 70 and dep < r(1.0): hit = i; break
        if hit is None: break
        P_.pop(hit)
    # 縦横から 5° 以内の辺は縦横にそろえる
    for _ in range(3):
        n_ = len(P_)
        for i in range(n_):
            a0, b0 = P_[i], P_[(i + 1) % n_]; dx, dy = b0 - a0; ang = np.degrees(np.arctan2(abs(dy), abs(dx)))
            if 0 < ang <= 5: m_ = (a0[1] + b0[1]) / 2; P_[i] = np.array([a0[0], m_]); P_[(i + 1) % n_] = np.array([b0[0], m_])
            elif 85 <= ang < 90: m_ = (a0[0] + b0[0]) / 2; P_[i] = np.array([m_, a0[1]]); P_[(i + 1) % n_] = np.array([m_, b0[1]])
    # 弧: 斜めの辺を含み同じ向きに曲がる 3 辺以上の折れ線に円を当て、ずれ 0.15m 以内なら弧で描き直す
    n_ = len(P_)
    def turn(i): a0, v, b0 = P_[i - 1], P_[i], P_[(i + 1) % n_]; return np.sign((v - a0)[0] * (b0 - v)[1] - (v - a0)[1] * (b0 - v)[0])
    T = [turn(i) for i in range(n_)]
    out = []; i = 0; arcs_ = 0
    while i < n_:
        j = i
        while j + 1 < n_ and T[j + 1] == T[i] and T[i] != 0: j += 1
        run = list(range(i - 1, j + 2)) if i > 0 and j + 1 < n_ else None
        def tang(k):   # 頂点 k で向きが変わる角度（度）
            u1 = P_[k % n_] - P_[(k - 1) % n_]; u2 = P_[(k + 1) % n_] - P_[k % n_]
            return np.degrees(np.arccos(np.clip(np.dot(u1, u2) / max(1e-6, np.linalg.norm(u1) * np.linalg.norm(u2)), -1, 1)))
        if run and len(run) >= 4 and all(tang(k) < 50 for k in run[1:-1]):
            Q = np.array([P_[k % n_] for k in run]); A_ = np.c_[2 * Q, np.ones(len(Q))]; bb = (Q ** 2).sum(1)
            cx, cy, c0 = np.linalg.lstsq(A_, bb, rcond=None)[0]; R_ = np.sqrt(max(1e-6, c0 + cx * cx + cy * cy))
            res = np.abs(np.hypot(Q[:, 0] - cx, Q[:, 1] - cy) - R_).max()
            if res <= (r(.15) if len(run) >= 5 else r(.1)) and R_ < r(15) and abs(np.unwrap(np.arctan2(Q[:, 1] - cy, Q[:, 0] - cx))[-1] - np.arctan2(Q[0, 1] - cy, Q[0, 0] - cx)) < np.radians(200):
                th = np.unwrap(np.arctan2(Q[:, 1] - cy, Q[:, 0] - cx)); t0 = th[0]; dt = th[-1] - th[0]   # 途中の頂点を通る向きに回る
                m_ = max(4, int(abs(dt) * R_ / r(.3)))
                for t_ in np.linspace(0, 1, m_ + 1)[1:-1]: out.append(np.array([cx + R_ * np.cos(t0 + dt * t_), cy + R_ * np.sin(t0 + dt * t_)]))
                arcs_ += 1; i = j + 1; continue
        out.append(P_[i]); i += 1
    if arcs_: print('polygon arcs', arcs_)
    Z = list(out if arcs_ else P_)
    for _ in range(50):
        n_ = len(Z); hit = None
        if n_ < 5: break
        for i in range(n_):
            a0, v, b0 = Z[i - 1], Z[i], Z[(i + 1) % n_]
            u1, u2 = a0 - v, b0 - v; c_ = np.dot(u1, u2) / max(1e-6, np.linalg.norm(u1) * np.linalg.norm(u2))
            dl = np.linalg.norm(b0 - a0); dep = abs((b0 - a0)[0] * (v - a0)[1] - (b0 - a0)[1] * (v - a0)[0]) / max(1e-6, dl)
            if np.degrees(np.arccos(np.clip(c_, -1, 1))) < (80 if arcs_ else 70) and dep < r(1.0): hit = i; break
        if hit is None: break
        Z.pop(hit)
    g_ = Polygon(Z).buffer(0)
    return max(g_.geoms, key=lambda q: q.area) if g_.geom_type == 'MultiPolygon' else g_
polys = [tidy(g) for g in polys]
# ---- 4. 辺ごとの根拠（物が沿っているか）→ 実線と破線
SUP = cv2.dilate(OB | WALL | RAIL, ell(.4))   # 手すりの線は壁と同じく実線の根拠
outer, dashed = [], []
def runs(a_, b_):
    a_, b_ = np.array(a_, float), np.array(b_, float); Ln = np.linalg.norm(b_ - a_); n_ = max(2, int(Ln / 2)); t_ = np.linspace(0, 1, n_)
    pts = a_[None] + (b_ - a_)[None] * t_[:, None]
    sup = np.array([SUP[min(S - 1, max(0, int(p_[1]))), min(S - 1, max(0, int(p_[0])))] for p_ in pts]).astype(bool)
    if len(sup) > 3: sup = ndimage.binary_closing(sup, np.ones(max(1, int(r(.5) / max(1.0, Ln / n_))))) | sup
    out = []; i = 0
    while i < len(sup):
        j = i
        while j + 1 < len(sup) and sup[j + 1] == sup[i]: j += 1
        out.append((bool(sup[i]), pts[i], pts[min(len(pts) - 1, j + 1)])); i = j + 1
    # 0.6m 未満の区間は隣と同じ扱いにしてつなぐ
    while len(out) > 1:
        lens = [np.linalg.norm(q - p_) for _, p_, q in out]; i = int(np.argmin(lens))
        if lens[i] >= r(.6): break
        j = i - 1 if i > 0 else i + 1; s0, p0, q0 = out[min(i, j)]; s1, p1, q1 = out[max(i, j)]
        keep = out[j][0]; out[min(i, j)] = (keep, p0, q1); out.pop(max(i, j))
        k_ = 0
        while k_ < len(out) - 1:
            if out[k_][0] == out[k_ + 1][0]: out[k_] = (out[k_][0], out[k_][1], out[k_ + 1][2]); out.pop(k_ + 1)
            else: k_ += 1
    return out, Ln
for g in polys:
    co = list(g.exterior.coords)
    for a_, b_ in zip(co[:-1], co[1:]):
        rr, tot = runs(a_, b_)
        if tot < 1: continue
        sup_len = sum(np.linalg.norm(q - p_) for s_, p_, q in rr if s_)
        if sup_len >= 0.7 * tot: outer.append((a_, b_))
        elif sup_len < 0.3 * tot: dashed.append((a_, b_))
        else:
            for s_, p_, q in rr: (outer if s_ else dashed).append((tuple(p_), tuple(q)))
# 両側が実線の 1.8m 以下の破線は開口（線を描かない）
def _touch(p_, L_): return any(min(np.hypot(p_[0] - a_[0], p_[1] - a_[1]), np.hypot(p_[0] - b_[0], p_[1] - b_[1])) < 2 for a_, b_ in L_)
UPo = unary_union(polys)
def _beyond(a_, b_):
    a_, b_ = np.array(a_, float), np.array(b_, float); d_ = b_ - a_; Ln = np.linalg.norm(d_); nrm = np.array([-d_[1], d_[0]]) / max(1e-6, Ln)
    for t_ in (.3, .5, .7):
        m_ = a_ + d_ * t_
        for sg_ in (1, -1):
            q_ = m_ + nrm * sg_ * r(.8)
            if UPo.contains(Point(*q_)): continue
            if 0 <= q_[0] < S and 0 <= q_[1] < S and FREE0[int(q_[1]), int(q_[0])]: return True
    return False
openings, closed = [], []
for d_ in dashed:
    a_, b_ = d_; Ln = np.hypot(b_[0] - a_[0], b_[1] - a_[1])
    _ang = np.degrees(np.arctan2(abs(b_[1] - a_[1]), abs(b_[0] - a_[0]))); _axis = _ang < 10 or _ang > 80   # 斜めの辺は出入口にしない（欠けた角に見える）
    if Ln <= r(1.8) and _axis and _touch(a_, outer) and _touch(b_, outer) and _beyond(a_, b_): openings.append(d_)
    elif not _axis and Ln <= r(2.0): closed.append(d_)
    elif Ln <= r(1.2): closed.append(d_)
dashed = [d_ for d_ in dashed if d_ not in openings and d_ not in closed]; outer += closed
# 開口の両端に 0.3m の止め線（壁の厚みの向き）
open_ticks = []
for a_, b_ in openings:
    a_, b_ = np.array(a_, float), np.array(b_, float); d_ = b_ - a_; nrm = np.array([-d_[1], d_[0]]) / max(1e-6, np.linalg.norm(d_)) * r(.15)
    for e_ in (a_, b_): open_ticks.append((tuple(e_ - nrm), tuple(e_ + nrm)))
EDGE_FAIL = any(min(min(p_[0], p_[1]), S - 1 - max(p_[0], p_[1])) < r(.3) for g in polys for p_ in g.exterior.coords)
# ---- 5. 間仕切り: 天井近くまで続く壁（WALLT）の線だけ。外形に重なる所は消す・端は 0.5m 以内の線へつなぐ・浮いた 1.5m 未満は捨てる
from shapely.ops import nearest_points
UP = unary_union(polys); BND = UP.boundary; INSIDE = UP.buffer(-r(.05))
HPT, _ = axis_pieces(WALLT, True); VPT, _ = axis_pieces(WALLT, False)
segs = [LineString([(a_, off), (b_, off)]) for off, a_, b_ in HPT if b_ - a_ >= r(.8)] + [LineString([(off, a_), (off, b_)]) for off, a_, b_ in VPT if b_ - a_ >= r(.8)]
inner_ls = []
for sg in segs:
    g_ = sg.intersection(INSIDE).difference(BND.buffer(r(.3)))
    for part in (getattr(g_, 'geoms', None) or [g_]):
        if part.geom_type == 'LineString' and part.length >= r(.6): inner_ls.append(part)
def snap_ends(L_):
    # 端を線の向きのまま延ばす・縮める（斜めにしない）。0.5m 以内で他の線か外形に当たればつなぐ
    out = []
    for i, ln in enumerate(L_):
        others = unary_union([BND] + [o for j, o in enumerate(L_) if j != i])
        (x0, y0), (x1, y1) = ln.coords[0], ln.coords[-1]; d_ = np.array([x1 - x0, y1 - y0]); d_ = d_ / max(1e-6, np.linalg.norm(d_))
        ends = [np.array([x0, y0]), np.array([x1, y1])]; conn = 0
        for e, sg_ in ((0, -1), (1, 1)):
            p_ = ends[e]; ray = LineString([tuple(p_ - d_ * sg_ * r(.5)), tuple(p_ + d_ * sg_ * r(.5))]); hit = ray.intersection(others)
            if hit.is_empty: continue
            pts_ = [hit] if hit.geom_type == 'Point' else [g_ for g_ in getattr(hit, 'geoms', []) if g_.geom_type == 'Point']
            if not pts_: continue
            q_ = min(pts_, key=lambda q: Point(tuple(p_)).distance(q)); ends[e] = np.array([q_.x, q_.y]); conn += 1
        out.append((LineString([tuple(ends[0]), tuple(ends[1])]), conn))
    return out
inner = []
for ln, conn in snap_ends(inner_ls):
    if conn == 0: continue   # どこにもつながらない線は捨てる
    if ln.length < r(.6) or (conn == 1 and ln.length < r(1.5)): continue   # 片端だけつながる線は 1.5m 以上だけ
    inner.append((ln.coords[0], ln.coords[-1]))
inner += open_ticks
furn_lines = []
# ---- 造り付けの設備（バー・ブース・DJ ブースなど）: 物があって壁ではない所を 0.35m でまとめ、直交の閉じた図形に。
#   図形の中の占有率 45% 未満は描かない（別々の物を 1 つの枠でくくらない）
furn = []; furn_holes = []
FA = np.zeros((S, S), np.uint8); cv2.fillPoly(FA, [np.round(np.array(g.exterior.coords)).astype(np.int32) for g in polys], 1)
FM = ((occ[:4].sum(0) >= 2) & (cv2.dilate(WALLT, ell(.12)) == 0) & cv2.erode(FA, ell(.2))).astype(np.uint8)
FM1 = ((occ[:4].sum(0) >= 1) & (cv2.dilate(WALLT, ell(.12)) == 0)).astype(np.uint8)   # 占有率は天板だけの帯も数える
FMc = cv2.morphologyEx(FM, cv2.MORPH_CLOSE, np.ones((r(.15), r(.15)), np.uint8))
n3, lab3, st3, _ = cv2.connectedComponentsWithStats(FMc, connectivity=8)
g10 = max(1, r(.1))
for i in range(1, n3):
    x, y, w, hh, ar = st3[i]
    if not (ar >= 1.2 * ppm * ppm or max(w, hh) >= r(2.0)): continue
    comp = (lab3[y:y + hh, x:x + w] == i).astype(np.uint8)
    raw = FM1[y:y + hh, x:x + w] & cv2.dilate(comp, np.ones((3, 3), np.uint8))
    cc_, _ = cv2.findContours(comp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE); (_, _), rad_ = cv2.minEnclosingCircle(max(cc_, key=cv2.contourArea))
    if cv2.contourArea(max(cc_, key=cv2.contourArea)) > 0.65 * np.pi * rad_ ** 2 and rad_ < r(.8): continue   # 丸テーブル
    # 輪郭を縦横の格子（0.3m、頂点が 8 を超えたら 0.5m）に吸着した直交多角形。自分の形の中の占有率 60% 以上だけ
    def occ_of(mask_): return raw[mask_ > 0].mean() if mask_.sum() else 0
    best = None
    for gs in (.3, .5):
        c_ = max(2, r(gs)); gx, gy = max(1, int(np.ceil(w / c_))), max(1, int(np.ceil(hh / c_)))
        pad = np.zeros((gy * c_, gx * c_), np.uint8); pad[:hh, :w] = comp
        cells = pad.reshape(gy, c_, gx, c_).mean((1, 3)) > 0.45
        if not cells.any(): continue
        bx = unary_union([Polygon([(cx_ * c_, cy_ * c_), ((cx_ + 1) * c_, cy_ * c_), ((cx_ + 1) * c_, (cy_ + 1) * c_), (cx_ * c_, (cy_ + 1) * c_)]) for cy_, cx_ in zip(*np.nonzero(cells))])
        if bx.geom_type == 'MultiPolygon': bx = max(bx.geoms, key=lambda q: q.area)
        bx = Polygon(bx.exterior).simplify(0.01)
        pts_ = list(bx.exterior.coords)[:-1]
        if len(pts_) > 8: continue
        m_ = np.zeros_like(comp); cv2.fillPoly(m_, [np.round(np.array(pts_)).astype(np.int32)], 1)
        if occ_of(m_) >= 0.6: best = pts_; break
    if best is None: continue
    pg = Polygon((np.array(best, float) + [x, y]).tolist()).intersection(UP.buffer(-r(.08)))
    if pg.geom_type == 'Polygon' and pg.area > (0.6 * ppm) ** 2: furn.append(np.array(pg.exterior.coords)[:-1].reshape(-1).tolist())
# ---- 造作（_labels.json の shape: 世界座標の多角形）。描いてあればそれを使い、点群から拾った家具は使わない
#   バー・DJ ブース・ソファは点群だけでは壁や床の物と区別できない（2026-11-26 審査 r5）。断面を見て人が描いた形を正とする
import os
_lp = args[0].replace('_sec.json', '_labels.json')
if '--auto-furn' not in sys.argv: furn = []   # 点群から拾った家具は形が実物に合わないことが多いので、既定では描かない
if os.path.exists(_lp):
    _man = [lb for lb in json.load(open(_lp, encoding='utf-8')) if lb.get('shape')]
    if _man:
        furn = []
        for lb in _man:
            pg = Polygon([to_px(x_, z_) for x_, z_ in lb['shape']]).buffer(0).intersection(UP.buffer(-r(.05)))
            if pg.geom_type == 'MultiPolygon': pg = max(pg.geoms, key=lambda q: q.area)
            if not (pg.geom_type == 'Polygon' and pg.area > (0.2 * ppm) ** 2): print('WARN manual shape outside plan', lb.get('text')); continue
            furn.append(np.array(pg.exterior.coords)[:-1].reshape(-1).tolist())
            NEARP = cv2.dilate((occ[:4].sum(0) > 0).astype(np.uint8), ell(.4))   # 家具の高さ帯の点から 0.2m 以内
            ring = [pg.exterior.interpolate(t_, normalized=True) for t_ in np.linspace(0, 1, 80)]
            fit = np.mean([NEARP[min(S - 1, int(q.y)), min(S - 1, int(q.x))] > 0 for q in ring])
            ovl = pg.exterior.intersection(UP.boundary.buffer(r(.1))).length / max(1, pg.exterior.length)
            if fit < 0.6: print('WARN manual shape off the scan', lb.get('text') or '?', f'{fit:.0%}')
            if ovl > 0.25: print('WARN manual shape on the outline', lb.get('text') or '?', f'{ovl:.0%}')
        print('manual furn', len(furn))
    _mc = [lb for lb in json.load(open(_lp, encoding='utf-8')) if lb.get('kind') == 'col']
    if _mc:
        cols = []
        for lb in _mc:
            cx_, cy_ = to_px(lb['x'], lb['z']); d_ = lb.get('d', .4) * ppm / 0.9
            cols.append((cx_ - d_ / 2, cy_ - d_ / 2, d_, d_, 'c' if lb.get('round', True) else 'r'))
        print('manual cols', len(cols))
    # 家具の中を通る間仕切り線は消す
    FP = unary_union([Polygon(np.array(fp).reshape(-1, 2)).buffer(r(.15)) for fp in furn]) if furn else None
    if FP is not None: inner = [(a_, b_) for a_, b_ in inner if LineString([a_, b_]).intersection(FP).length < 0.6 * LineString([a_, b_]).length]
# ---- ラベル（<名前>_labels.json: 世界座標 x,z と文字）
import os
labels = []
lp = args[0].replace('_sec.json', '_labels.json')
if os.path.exists(lp):
    for lb in json.load(open(lp, encoding='utf-8')):
        lx, ly = to_px(lb['x'], lb['z'])
        if not lb.get('text') or lb.get('kind') == 'col': continue
        if lb.get('shape'):
            from shapely.ops import polylabel
            _pg = Polygon([to_px(x_, z_) for x_, z_ in lb['shape']]).buffer(0)
            if _pg.geom_type == 'Polygon':
                _q = _pg.centroid if _pg.contains(_pg.centroid) else polylabel(_pg, 1.0); lx, ly = _q.x, _q.y   # 四角は真ん中・L 字などは中の点
                _mr = np.array(_pg.minimum_rotated_rectangle.exterior.coords)[:4]; _e = [np.linalg.norm(_mr[(i + 1) % 4] - _mr[i]) for i in range(4)]
                if min(_e) < r(.5) or not _pg.contains(_pg.centroid):   # 細い形・L 字（カウンター・ベンチ）は文字を外に出す: 長い辺の中央の外側、外周から遠い側
                    _i = int(np.argmax(_e)); _d = (_mr[(_i + 1) % 4] - _mr[_i]) / max(1e-6, _e[_i]); _nv = np.array([-_d[1], _d[0]])
                    _c = np.array([_pg.centroid.x, _pg.centroid.y]); _off = min(_e) / 2 + r(.35)
                    _cand = [_c + _nv * _off, _c - _nv * _off]
                    _best = max(_cand, key=lambda q: (UP.contains(Point(*q)), UP.boundary.distance(Point(*q))))
                    lx, ly = float(_best[0]), float(_best[1])
        if lb.get('kind') == 'furn' and not any(Polygon(np.array(fp).reshape(-1, 2)).distance(Point(lx, ly)) < r(2.0) for fp in furn): continue
        # 印（撮影位置）から 0.9m 以内なら、近くの空いた所へずらす（上下 0.6〜1.2m・左右 1.0〜2.0m の候補から最寄り）
        if lb.get('kind', 'room') == 'room' and len(MP) and np.hypot(MP[:, 0] - lx, MP[:, 1] - ly).min() < r(1.3):   # 設備の名前は形のそばから動かさない
            _cs = [(lx + dx_ * ppm, ly + dy_ * ppm) for dx_, dy_ in ((0, -.6), (0, .6), (0, -1.2), (0, 1.2), (-1, 0), (1, 0), (-2, 0), (2, 0), (-1, -.6), (1, -.6), (-1, .6), (1, .6))]
            _cs = [q for q in _cs if UP.buffer(-r(.3)).contains(Point(*q)) and np.hypot(MP[:, 0] - q[0], MP[:, 1] - q[1]).min() >= r(1.3)]
            if _cs: lx, ly = _cs[0]
        labels.append((lx, ly, lb['text'], lb.get('textEn', ''), 1 if lb.get('kind', 'room') == 'room' else 0))
    inner = [(a_, b_) for a_, b_ in inner if not any(LineString([a_, b_]).distance(Point(l_[0], l_[1])) < r(.6) for l_ in labels)]
# ---- 描く（確認用 PNG。画面は geom を SVG で描く）
k = int(opt('k', '3')); SS = S * k
img = np.full((SS, SS, 3), 255, np.uint8); BLACK = (20, 20, 20); GRAY = (140, 140, 140)
Pk = lambda p_: (int(round(p_[0] * k)), int(round(p_[1] * k)))
for fp in furn: cv2.polylines(img, [np.round(np.array(fp).reshape(-1, 2) * k).astype(np.int32)], True, GRAY, max(1, k), cv2.LINE_AA)
for a_, b_ in outer: cv2.line(img, Pk(a_), Pk(b_), BLACK, max(2, int(0.1 * ppm * k)), cv2.LINE_AA)
for a_, b_ in dashed:
    a_, b_ = np.array(a_, float), np.array(b_, float); Ln = np.linalg.norm(b_ - a_); seg = r(.25)
    for t0 in np.arange(0, Ln, seg * 2): cv2.line(img, Pk(a_ + (b_ - a_) * t0 / Ln), Pk(a_ + (b_ - a_) * min(Ln, t0 + seg) / Ln), BLACK, max(1, int(0.04 * ppm * k)), cv2.LINE_AA)
for a_, b_ in inner: cv2.line(img, Pk(a_), Pk(b_), BLACK, max(1, int(0.05 * ppm * k)), cv2.LINE_AA)
for a_, b_ in furn_lines: cv2.line(img, Pk(a_), Pk(b_), GRAY, max(1, k), cv2.LINE_AA)
for x, y, w, hh, ct in cols:
    s_ = max(w, hh) * 0.9; cx, cy = x + w / 2, y + hh / 2
    if ct == 'c': cv2.circle(img, Pk((cx, cy)), int(s_ / 2 * k), BLACK, -1, cv2.LINE_AA)
    else: cv2.rectangle(img, Pk((cx - s_ / 2, cy - s_ / 2)), Pk((cx + s_ / 2, cy + s_ / 2)), BLACK, -1)
base = args[0].replace('_sec.json', '')
if '--debug' in sys.argv:
    dbg = cv2.cvtColor(cv2.imread(args[0].replace('.json', '_raw.png'), 0), cv2.COLOR_GRAY2BGR) // 2 + 127
    dbg[(FREE > 0) & (WALL == 0)] = (dbg[(FREE > 0) & (WALL == 0)] * 0.8 + np.array([60, 200, 255]) * 0.2).astype(np.uint8)
    dbg[WALL > 0] = (200, 120, 0)
    for a_, b_ in outer: cv2.line(dbg, tuple(int(t) for t in a_), tuple(int(t) for t in b_), (0, 0, 255), 2)
    for a_, b_ in dashed: cv2.line(dbg, tuple(int(t) for t in a_), tuple(int(t) for t in b_), (0, 200, 255), 2)
    for a_, b_ in inner: cv2.line(dbg, tuple(int(t) for t in a_), tuple(int(t) for t in b_), (200, 0, 200), 2)
    for lx, ly, t_, _, _k in labels: cv2.putText(dbg, t_.encode('ascii', 'ignore').decode() or 'L', (int(lx), int(ly)), cv2.FONT_HERSHEY_SIMPLEX, .6, (0, 0, 0), 2); cv2.circle(dbg, (int(lx), int(ly)), 6, (0, 0, 0), 2)
    for fp in furn: cv2.polylines(dbg, [np.array(fp).reshape(-1, 2).astype(np.int32)], True, (0, 160, 0), 2)
    for x, y in NP: cv2.circle(dbg, (int(x), int(y)), 4, (255, 0, 0), -1)
    cv2.imwrite(base + '_vec_debug.png', dbg)
cv2.imwrite(base + '_vec_raw.png', img)
R1 = lambda t: round(float(t) * k, 1)
seg4 = lambda L_: [[R1(a_[0]), R1(a_[1]), R1(b_[0]), R1(b_[1])] for a_, b_ in L_]
# 外周の実線のうち壁（物）から 0.3m 以内の割合（審査の目安）
SUP3 = cv2.dilate(OB | WALL, ell(.6)); tot = hit = 0
for a_, b_ in outer:
    a_, b_ = np.array(a_, float), np.array(b_, float); n_ = max(2, int(np.linalg.norm(b_ - a_) / 2))
    for t_ in np.linspace(0, 1, n_): p_ = a_ + (b_ - a_) * t_; tot += 1; hit += int(SUP3[min(S - 1, int(p_[1])), min(S - 1, int(p_[0]))])
geom = {'outer': seg4(outer), 'dashed': seg4(dashed), 'walls': seg4(inner), 'flines': seg4(furn_lines), 'fholes': [[R1(t) for t in fp] for fp in furn_holes], 'opens': seg4(openings),
        'cols': [[R1(x + w / 2 - max(w, hh) * .45), R1(y + hh / 2 - max(w, hh) * .45), R1(max(w, hh) * .9), R1(max(w, hh) * .9) * (-1 if ct == 'c' else 1)] for x, y, w, hh, ct in cols],   # 高さが負 = 丸柱
        'labels': [[R1(lx), R1(ly), t_, te_, k_] for lx, ly, t_, te_, k_ in labels],
        'furn': [[R1(t) for t in fp] for fp in furn]}
out = dict(td); out.update({'px': SS, 'ppm': ppm * k, 'section': {'vector': True}, 'geom': geom})
json.dump(out, open(base + '_vec.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
short = sum(1 for a_, b_ in outer + dashed if np.hypot(b_[0] - a_[0], b_[1] - a_[1]) < r(.25))
dl = sum(np.hypot(b_[0] - a_[0], b_[1] - a_[1]) for a_, b_ in dashed); ol = sum(np.hypot(b_[0] - a_[0], b_[1] - a_[1]) for a_, b_ in outer)
print('EDGE_FAIL' if EDGE_FAIL else 'edge ok', 'openings', len(openings))
print('vec', base, f'dashed {dl / max(1, dl + ol):.0%}', 'lines H', len(HY), 'V', len(VX), 'D', len(DG), 'faces', len(faces), 'outer', len(outer), 'dashed', len(dashed), 'inner', len(inner), 'cols', len(cols), 'furn', len(furn), f'wall-hug {hit / max(1, tot):.0%}', 'short<0.6m', short)
