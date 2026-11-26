# 「位置から見る」の点を部屋ごとの真ん中に置く（2026-11-26 本人「歩く地点でポイント打っていたけど、部屋ごとの真ん中にあるのが一番使いやすい」。参考 planear の図面も部屋ごとに矢印）。
#   python scripts/photomap-rooms.py <tour-topdown の json> <シーンの点 .npz> <出力 rooms.json> [--per=30] [--door=0.45] [--debug=<png>]
#   1. スキャンの点から歩ける床（床の高さの点がある・腰から頭の高さに物が無い）を作る
#   2. 床を扉の半分（--door m）だけ削ると、扉・狭い通路で部屋が分かれる → 1 つの塊 = 1 部屋
#   3. 部屋ごとに、広さ --per m² あたり 1 点（小部屋は 1 点）。部屋の床を k 個に分けた中心に、いちばん近いツアーの地点を選ぶ
#   出力: { select: [地点 id...], rooms: [{ area, ids }] }。reg json に select=<file> で渡すと、この地点だけ図に出す。
import sys, json, urllib.request
import numpy as np, cv2

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = lambda k, d=None: next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith(f'--{k}=')), d)
tdp, npz, outp = args
PER, DOOR, dbg = float(opt('per', '30')), float(opt('door', '0.45')), opt('debug')
td = json.load(open(tdp, encoding='utf-8'))
UA = {'User-Agent': 'Mozilla/5.0 (photomap-rooms)'}
g = json.load(urllib.request.urlopen(urllib.request.Request(f"https://locahun3d.com/api/pano/{td['key']}.graph.json", headers=UA)))
linked = set(i for e in g['edges'] for i in e)
nodes = [n for i, n in enumerate(g['nodes']) if len(g['nodes']) < 3 or i in linked]

d = np.load(npz); P, A, L = d['p'], d['a'], d['leaf']
fy = float(td['floorY'])
ok = L & (A > 0.3)
R = 0.1
N = np.array([[n['pos']['x'], n['pos']['z']] for n in nodes])
x0, z0 = N.min(0) - 8; x1, z1 = N.max(0) + 8
W, H = int((x1 - x0) / R) + 1, int((z1 - z0) / R) + 1
def grid(m):
    q = P[m][:, [0, 2]]; q = q[(q[:, 0] > x0) & (q[:, 0] < x1) & (q[:, 1] > z0) & (q[:, 1] < z1)]
    g_ = np.zeros((H, W), np.uint16); np.add.at(g_, (((q[:, 1] - z0) / R).astype(int), ((q[:, 0] - x0) / R).astype(int)), 1); return g_
floor = grid(ok & (np.abs(P[:, 1] - fy) < 0.15)) >= 2
obst = grid(ok & (P[:, 1] > fy + 0.4) & (P[:, 1] < fy + 1.9)) >= 3
px = lambda x, z: (int((x - x0) / R), int((z - z0) / R))
ell = lambda m: cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * int(m / R) + 1,) * 2)
floor = cv2.morphologyEx(floor.astype(np.uint8), cv2.MORPH_CLOSE, ell(0.3))
# 床の点は暗い床・黒い床で欠けるので、ツアーの地点（歩ける所に 1.5m おき）のまわり 1.3m も床とみなす
walk = np.zeros((H, W), np.uint8)
for p in N: cv2.circle(walk, px(*p), int(1.3 / R), 1, -1)
near = np.zeros((H, W), np.uint8)
for p in N: cv2.circle(near, px(*p), int(3.0 / R), 1, -1)
free = (((walk > 0) | ((floor > 0) & (near > 0))) & ~cv2.dilate(obst.astype(np.uint8), ell(0.12)).astype(bool)).astype(np.uint8)
free = cv2.morphologyEx(free, cv2.MORPH_OPEN, ell(0.15))
# 地点がある塊だけ（外の床の断片は入れない）
nl, lab = cv2.connectedComponents(free, connectivity=8)
keep_l = {lab[min(H - 1, max(0, px(*p)[1])), min(W - 1, max(0, px(*p)[0]))] for p in N} - {0}
free = np.isin(lab, list(keep_l)).astype(np.uint8)
core = cv2.erode(free, ell(DOOR))
nc, cl = cv2.connectedComponents(core, connectivity=8)
# 削った部屋を元の広さに戻す（いちばん近い部屋に床を割り当てる）
dist = np.full((H, W), 1e9); room = np.zeros((H, W), np.int32)
for i in range(1, nc):
    m = (cl == i).astype(np.uint8)
    if m.sum() * R * R < 1.5: continue
    dt = cv2.distanceTransform(1 - m, cv2.DIST_L2, 5)
    b = (dt < dist) & (free > 0); dist[b] = dt[b]; room[b] = i
sel, rooms = [], []
rng = np.random.default_rng(0)
for i in np.unique(room[room > 0]):
    ys, xs = np.nonzero(room == i); area = len(xs) * R * R
    inside = [j for j, p in enumerate(N) if room[min(H - 1, max(0, px(*p)[1])), min(W - 1, max(0, px(*p)[0]))] == i]
    if not inside or area < 2.5: continue
    k = int(min(16, max(1, round(area / PER)), len(inside)))
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
        if j is not None and np.hypot(*(N[j] - c)) < max(3.0, np.sqrt(area / k)): ids.append(nodes[j]['id'])
    sel += ids; rooms.append({'area': round(area, 1), 'ids': ids})
json.dump({'select': sel, 'rooms': rooms}, open(outp, 'w'), indent=1)
print('rooms', len(rooms), 'points', len(sel), '/', len(nodes), [r['area'] for r in rooms])
if dbg:
    rng2 = np.random.default_rng(1); col = rng2.integers(60, 255, (room.max() + 1, 3)); col[0] = 0
    im = col[room].astype(np.uint8); im[obst] = (255, 255, 255)
    for j, n in enumerate(nodes):
        c = (0, 0, 255) if n['id'] in sel else (90, 90, 90)
        cv2.circle(im, px(*N[j]), 4 if n['id'] in sel else 2, c, -1)
    cv2.imwrite(dbg, im)
