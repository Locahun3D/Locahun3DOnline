# 「位置から見る」の点を部屋ごとの真ん中に置く（2026-11-26 本人「歩く地点でポイント打っていたけど、部屋ごとの真ん中にあるのが一番使いやすい」。参考 planear の図面も部屋ごとに矢印）。
#   python scripts/photomap-rooms.py <tour-topdown の json> <シーンの点 .npz> <出力 rooms.json> [--per=36] [--gap=3] [--reg=reg.json] [--door=0.45] [--debug=<png>]
#   1. スキャンの点から歩ける床（床の高さの点がある・腰から頭の高さに物が無い）を作る
#   2. 床を扉の半分（--door m）だけ削ると、扉・狭い通路で部屋が分かれる → 1 つの塊 = 1 部屋
#   3. 部屋ごとに、広さ --per m² あたり 1 点（小部屋は 1 点）。部屋の床を k 個に分けた中心に、いちばん近いツアーの地点を選ぶ
#   出力: { select: [地点 id...], rooms: [{ area, ids }] }。reg json に select=<file> で渡すと、この地点だけ図に出す。
import sys, json, urllib.request
import numpy as np, cv2

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = lambda k, d=None: next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith(f'--{k}=')), d)
tdp, npz, outp = args
PER, DOOR, dbg = float(opt('per', '36')), float(opt('door', '0.45')), opt('debug')
MIN_GAP = float(opt('gap', '3.0'))   # 同じ部屋の点どうし（地図上で重ならない間隔）
td = json.load(open(tdp, encoding='utf-8'))
UA = {'User-Agent': 'Mozilla/5.0 (photomap-rooms)'}
g = json.load(urllib.request.urlopen(urllib.request.Request(f"https://locahun3d.com/api/pano/{td['key']}.graph.json", headers=UA)))
linked = set(i for e in g['edges'] for i in e)
nodes = [n for i, n in enumerate(g['nodes']) if len(g['nodes']) < 3 or i in linked]
_tdids = {n['id'] for n in td.get('nodes', [])}
if _tdids: nodes = [n for n in nodes if n['id'] in _tdids] or [n for n in g['nodes'] if n['id'] in _tdids]   # 階ごとの図のときはその階の地点だけ
# 公式図面に合わせたシーンは、図面の切り取り範囲に入る地点だけから選ぶ（屋外・図面に無い所に矢印を出さない）
d = np.load(npz); P, A, L = d['p'], d['a'], d['leaf']
fy = float(td['floorY'])
# 屋根の下か（地点の真上 2.1〜8m に点がまとまってある = 天井・屋根）。庭・道路・バルコニーは空なので無い
_CQ = P[(L & (A > 0.3)) & (P[:, 1] > fy + 2.1) & (P[:, 1] < fy + 8.0)][:, [0, 2]]
def _roofed(n):
    if not len(_CQ): return False
    dx = _CQ[:, 0] - n['pos']['x']; dz = _CQ[:, 1] - n['pos']['z']
    return int(((dx * dx + dz * dz) < 0.6 * 0.6).sum()) >= 15
if opt('reg'):
    _rg = json.load(open(opt('reg'), encoding='utf-8')); _M = np.array(_rg['world2img']); _c = _rg.get('crop')
    # 建物の内側 = 図面の線を少し太らせて、紙の端から外を塗りつぶした残り（扉・窓のすき間は太らせで閉じる）
    import os as _os
    _bp = cv2.imread(_os.path.normpath(_os.path.join(_os.path.dirname(opt('reg')), _rg['blueprint'])), cv2.IMREAD_GRAYSCALE)
    _c = _c or [0, 0, _bp.shape[1], _bp.shape[0]]
    _th = 140.0; _wl = (_bp < _th).astype(np.uint8);   # 線の濃さは図面ごとに違う（大津の閾値の 8 割・最大 140）
    _ppm = float(np.hypot(*_M[0, :2])); _k = max(5, int(1.2 * _ppm) | 1)   # 線を 0.6m ずつ太らせる = 1.2m までの窓・扉のすき間を閉じる（図面の縮尺は位置合わせの変換から）   # 壁の濃い線だけ（木目・色の床は拾わない）
    _wl = cv2.dilate(_wl, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (_k, _k)))
    _x0, _y0, _x1, _y1 = [int(v) for v in _c]; _wc = _wl[_y0:_y1, _x0:_x1]
    # 建物の形 = 太らせた線のいちばん大きい塊（建物の壁。寸法線・凡例は別の塊）の穴を埋めたもの。
    # 外から塗る方法は、縁側・広い開口から部屋の中まで外扱いになるので使わない
    _nl, _lb, _st, _ = cv2.connectedComponentsWithStats(_wc, connectivity=8)
    _big = (_lb == 1 + int(np.argmax(_st[1:, cv2.CC_STAT_AREA]))).astype(np.uint8) if _nl > 1 else _wc
    _ff = cv2.copyMakeBorder(1 - _big, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=1); cv2.floodFill(_ff, np.zeros((_ff.shape[0] + 2, _ff.shape[1] + 2), np.uint8), (0, 0), 2)
    _in = np.zeros(_wl.shape, bool); _in[_y0:_y1, _x0:_x1] = _ff[1:-1, 1:-1] != 2
    # reg.json の inside で上書き: "crop"（表示範囲の全部。中庭など屋外も図に描かれている時）/ "hull"（建物の線の凸包。大きな窓で外とつながる図）/ [[u,v],...]（建物の外形の多角形・元の図面の画素）
    _ins = _rg.get('inside', 'crop')   # 既定は表示範囲の全部（線から建物の内側を推す 'auto' は寸法線・大きな窓で外れやすい。外まで撮ったスキャンだけ多角形を書く）
    if _ins == 'crop': _in[:] = False; _in[_y0:_y1, _x0:_x1] = True
    elif _ins == 'hull' or isinstance(_ins, list):
        _poly = cv2.convexHull(cv2.findNonZero(_big)) + np.array([_x0, _y0]) if _ins == 'hull' else np.array(_ins, np.int32).reshape(-1, 1, 2)
        _in[:] = False; _m = np.zeros(_wl.shape, np.uint8); cv2.fillPoly(_m, [_poly.astype(np.int32)], 1); _in = _m > 0
    def _inside_crop(n):
        u, v = _M @ np.array([n['pos']['x'], n['pos']['z'], 1.0]); return _c[0] <= u <= _c[2] and _c[1] <= v <= _c[3]
    def _inside(n):
        u, v = _M @ np.array([n['pos']['x'], n['pos']['z'], 1.0])
        if not (_c[0] <= u <= _c[2] and _c[1] <= v <= _c[3]): return False
        return bool(_in[int(min(_bp.shape[0] - 1, max(0, v))), int(min(_bp.shape[1] - 1, max(0, u)))])
    _incrop = [n for n in nodes if _inside_crop(n)]
    nodes = [n for n in _incrop if _inside(n)]   # 図面の建物の線の内側（屋根の判定は木・庇も拾うので使わない）
    if _incrop and not nodes: nodes = _incrop   # 建物の形が取れない図面（外壁が閉じていない・床が濃い）は表示範囲だけで判断
    if not nodes:   # 図面の中に地点が無い（屋外だけのシーンなど）→ 点を出さない
        json.dump({'select': [], 'rooms': []}, open(outp, 'w'), indent=1); print('rooms 0 points 0 (no node inside the plan)'); sys.exit(0)

ok = L & (A > 0.3)
R = 0.1
N = np.array([[n['pos']['x'], n['pos']['z']] for n in nodes])
x0, z0 = N.min(0) - 8; x1, z1 = N.max(0) + 8
W, H = int((x1 - x0) / R) + 1, int((z1 - z0) / R) + 1
def grid(m):
    q = P[m][:, [0, 2]]; q = q[(q[:, 0] > x0) & (q[:, 0] < x1) & (q[:, 1] > z0) & (q[:, 1] < z1)]
    g_ = np.zeros((H, W), np.uint16); np.add.at(g_, (((q[:, 1] - z0) / R).astype(int), ((q[:, 0] - x0) / R).astype(int)), 1); return g_
floor = grid(ok & (np.abs(P[:, 1] - fy) < 0.15)) >= 2
obst = grid(ok & (P[:, 1] > fy + float(opt("lo", "1.3"))) & (P[:, 1] < fy + 2.0)) >= 3   # 机・台・椅子（腰の高さ）は部屋を分けない。壁・棚・建具の高さだけ
px = lambda x, z: (int((x - x0) / R), int((z - z0) / R))
ell = lambda m: cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * int(m / R) + 1,) * 2)
floor = cv2.morphologyEx(floor.astype(np.uint8), cv2.MORPH_CLOSE, ell(0.3))
# 床の点は暗い床・黒い床で欠けるので、ツアーの地点（歩ける所に 1.5m おき）のまわり 1.3m も床とみなす
walk = np.zeros((H, W), np.uint8)
# 地点の間隔が広いシーン（屋外の通り）は半径を間隔に合わせる（小さな円が離れて部屋が細切れにならないように）
_nn = np.sort(np.sqrt(((N[:, None] - N[None]) ** 2).sum(-1)), 1)[:, 1] if len(N) > 1 else np.array([1.5])
WR = float(min(4.0, max(1.3, 0.75 * np.median(_nn))))
for p in N: cv2.circle(walk, px(*p), int(WR / R), 1, -1)
near = np.zeros((H, W), np.uint8)
for p in N: cv2.circle(near, px(*p), int(3.0 / R), 1, -1)
free = (((walk > 0) | ((floor > 0) & (near > 0))) & ~cv2.dilate(obst.astype(np.uint8), ell(0.12)).astype(bool)).astype(np.uint8)
free = cv2.morphologyEx(free, cv2.MORPH_OPEN, ell(0.15))
# 地点がある塊だけ（外の床の断片は入れない）
nl, lab = cv2.connectedComponents(free, connectivity=8)
keep_l = {lab[min(H - 1, max(0, px(*p)[1])), min(W - 1, max(0, px(*p)[0]))] for p in N} - {0}
free = np.isin(lab, list(keep_l)).astype(np.uint8)
# 家具の多い部屋（キッチンの島など）は通路が扉の幅より狭く、削ると全部消える → 削る幅を段階的に小さくする
for door in (DOOR, DOOR * 0.66, DOOR * 0.33, 0):
    core = cv2.erode(free, ell(door)) if door > 0 else free.copy()
    nc, cl = cv2.connectedComponents(core, connectivity=8)
    # 削った部屋を元の広さに戻す（いちばん近い部屋に床を割り当てる）
    dist = np.full((H, W), 1e9); room = np.zeros((H, W), np.int32)
    for i in range(1, nc):
        m = (cl == i).astype(np.uint8)
        if m.sum() * R * R < 1.5: continue
        dt = cv2.distanceTransform(1 - m, cv2.DIST_L2, 5)
        b = (dt < dist) & (free > 0); dist[b] = dt[b]; room[b] = i
    if (room > 0).sum() >= 0.5 * (free > 0).sum(): break
sel, rooms = [], []
rng = np.random.default_rng(0)
for i in np.unique(room[room > 0]):
    ys, xs = np.nonzero(room == i); area = len(xs) * R * R
    inside = [j for j, p in enumerate(N) if room[min(H - 1, max(0, px(*p)[1])), min(W - 1, max(0, px(*p)[0]))] == i]
    if not inside or area < 1.0: continue   # 地点がある空間はすべて 1 点（以前は 2.5㎡ 未満や小さい部屋を落としていた）
    if len(inside) == 1 and abs(area - np.pi * WR * WR) < 0.08 * np.pi * WR * WR: continue   # 壁に当たらない丸のまま = 床の点が無い所の地点 1 つ（部屋ではない）
    harea = cv2.morphologyEx((room == i).astype(np.uint8), cv2.MORPH_CLOSE, ell(1.2)).sum() * R * R   # 家具（島・台）で欠けた床も部屋の広さに数える
    k = int(min(16, max(1, round(0.5 * (area + harea) / PER)), len(inside)))   # 360°ツアーの標準: 幅 6m（約 36㎡）までは 1 点、それを超えたら 36㎡ ごとに +1（2026-11-26 Web 調査）
    pts = np.stack([x0 + xs * R, z0 + ys * R], 1)
    if k == 1:
        # 部屋の真ん中 = 壁からいちばん遠い所（細長い部屋・L 字でも部屋の中）
        m = (room == i).astype(np.uint8); dt = cv2.distanceTransform(m, cv2.DIST_L2, 5)
        cy, cx = np.unravel_index(np.argmax(dt), dt.shape); C = np.array([[x0 + cx * R, z0 + cy * R]])
    else:
        sub = pts[rng.choice(len(pts), min(len(pts), 6000), replace=False)].astype(np.float32)
        _, _, C = cv2.kmeans(sub, k, None, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_MAX_ITER, 50, 1e-3), 5, cv2.KMEANS_PP_CENTERS)
    ids = []
    for c in C:
        cand = sorted(inside, key=lambda j: np.hypot(*(N[j] - c)))
        j = next((j for j in cand if nodes[j]['id'] not in ids), None)
        _far = lambda j: all(np.hypot(*(N[j] - N[q])) >= MIN_GAP for q in [jj for jj, n in enumerate(nodes) if n['id'] in ids])   # 同じ部屋の 2 点目以降だけ間隔を見る（各部屋の 1 点目は必ず置く）
        j = next((j for j in cand if nodes[j]['id'] not in ids and _far(j)), None) if j is not None else None
        if j is not None and np.hypot(*(N[j] - c)) < max(3.0, np.sqrt(area / k)): ids.append(nodes[j]['id'])
    m = (room == i).astype(np.uint8); dtm = cv2.distanceTransform(m, cv2.DIST_L2, 5); cy, cx = np.unravel_index(np.argmax(dtm), dtm.shape)
    sel += ids; rooms.append({'area': round(area, 1), 'ids': ids, 'center': [round(float(x0 + cx * R), 2), round(float(z0 + cy * R), 2)]})
json.dump({'select': sel, 'rooms': rooms}, open(outp, 'w'), indent=1)
print('rooms', len(rooms), 'points', len(sel), '/', len(nodes), [r['area'] for r in rooms])
if dbg:
    rng2 = np.random.default_rng(1); col = rng2.integers(60, 255, (room.max() + 1, 3)); col[0] = 0
    im = col[room].astype(np.uint8); im[obst] = (255, 255, 255)
    for j, n in enumerate(nodes):
        c = (0, 0, 255) if n['id'] in sel else (90, 90, 90)
        cv2.circle(im, px(*N[j]), 4 if n['id'] in sel else 2, c, -1)
    cv2.imwrite(dbg, im)
