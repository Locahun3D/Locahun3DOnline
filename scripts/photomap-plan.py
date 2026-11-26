# 真上から見た 3DGS の図（tour-topdown.mjs の <name>_raw.png）から、白地に黒い壁線の簡易図面を作る（2026-11-26 本人「簡易図面にして 参考webのような」）。
#   床（明るさのある所）を塊として取り出し → 細かい浮遊物を消す → 外形を太い黒線、中の家具・段差の輪郭を細いグレー線で描く。
#   python scripts/photomap-plan.py <topdown.json> <out.png> [--nodes graph.json]   GPU は使わない
import sys, json, math
import cv2, numpy as np
td = json.load(open(sys.argv[1], encoding='utf-8')); out = sys.argv[2]
raw = cv2.imread(sys.argv[1].replace('.json', '_raw.png'), cv2.IMREAD_COLOR)
ppm = td['ppm']; px = lambda m: max(1, int(round(m * ppm)))
gray = cv2.cvtColor(raw, cv2.COLOR_BGR2GRAY)
hsv = cv2.cvtColor(raw, cv2.COLOR_BGR2HSV)
# 床・家具 = ある程度明るい所。浮遊物は細かく散らばるので、開閉で消してから地点のある塊だけ残す
TH = next((a.split("=")[1] for a in sys.argv if a.startswith("--th=")), "auto"); OP = float(next((a.split("=")[1] for a in sys.argv if a.startswith("--open=")), ".5"))
# 床の明るさ: 地点のまわり 1.5m の明るさの中央値の 45%（暗い部屋でも床を拾う。18〜50 に収める）
nodes = td.get('nodes', [])
if TH == "auto":
    disc = np.zeros_like(gray)
    for nd in nodes:
        cv2.circle(disc, (int(td['px'] / 2 + (nd['x'] - td['center']['x']) * ppm), int(td['px'] / 2 + (nd['z'] - td['center']['z']) * ppm)), px(1.5), 255, -1)
    vals = gray[(disc > 0) & (gray > 8)]
    TH = int(min(50, max(18, 0.45 * np.median(vals)))) if len(vals) else 40
TH = int(TH)
m = (gray > TH).astype(np.uint8) * 255
m = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (px(OP),) * 2))
CL = float(next((a.split("=")[1] for a in sys.argv if a.startswith("--close=")), ".6"))
m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (px(CL),) * 2))
n, lab, stats, _ = cv2.connectedComponentsWithStats(m)
keep = np.zeros_like(m)
hits = set()
for nd in nodes:
    u = int(td['px'] / 2 + (nd['x'] - td['center']['x']) * ppm); v = int(td['px'] / 2 + (nd['z'] - td['center']['z']) * ppm)
    if 0 <= u < m.shape[1] and 0 <= v < m.shape[0] and lab[v, u] > 0: hits.add(lab[v, u])
if not hits: hits = {int(np.argmax(stats[1:, cv2.CC_STAT_AREA])) + 1}
for h in hits: keep[lab == h] = 255
# 塊の中の穴（暗い家具・柱）は小さいものだけ埋める
inv = cv2.bitwise_not(keep); n2, lab2, st2, _ = cv2.connectedComponentsWithStats(inv)
for i in range(1, n2):
    if st2[i, cv2.CC_STAT_AREA] < (0.6 * ppm) ** 2: keep[lab2 == i] = 255
keep = cv2.GaussianBlur(keep, (0, 0), px(.15)); keep = (keep > 127).astype(np.uint8) * 255
# 中の線: 明るさの強い変化（家具・カウンター・段差）。床の内側だけ
inner = cv2.erode(keep, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (px(.3),) * 2))
g = cv2.bilateralFilter(gray, 9, 40, 9)
edges = cv2.Canny(g, 40, 110)
edges[inner == 0] = 0
# 細かい模様（床の柄・照明）を落とす: 短い線は捨てる
n3, lab3, st3, _ = cv2.connectedComponentsWithStats(edges, connectivity=8)
ed = np.zeros_like(edges)
for i in range(1, n3):
    w, h = st3[i, cv2.CC_STAT_WIDTH], st3[i, cv2.CC_STAT_HEIGHT]
    if max(w, h) >= px(.6) and st3[i, cv2.CC_STAT_AREA] >= px(.5): ed[lab3 == i] = 255

# 壁の向き: 外形の辺の向きを長さで重みづけし、90° で割った余りの最頻値（斜めに置かれた部屋でも、その向きにそろえる）
def wall_angle(mask):
    cs, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    hist = np.zeros(90)
    for c in cs:
        q = cv2.approxPolyDP(c, px(.15), True).reshape(-1, 2).astype(float)
        for i in range(len(q)):
            d = q[(i + 1) % len(q)] - q[i]; L = math.hypot(*d)
            if L > 0: hist[int(math.degrees(math.atan2(d[1], d[0]))) % 90] += L
    hist = np.convolve(np.r_[hist[-5:], hist, hist[:5]], np.ones(7), 'same')[5:-5]
    return float(np.argmax(hist))

def straighten(c, eps):
    """外形を単純にして、縦横に近い辺は縦横にそろえる（参考の図面のような壁）。"""
    q = cv2.approxPolyDP(c, eps, True).reshape(-1, 2).astype(float)
    if len(q) < 4: return q.astype(np.int32)
    t = math.radians(ROT); R = np.array([[math.cos(t), math.sin(t)], [-math.sin(t), math.cos(t)]])
    q = q @ R.T   # 壁の向きを縦横にしてからそろえ、最後に戻す
    for _ in range(3):
        for i in range(len(q)):
            j = (i + 1) % len(q); d = q[j] - q[i]
            ang = abs(math.degrees(math.atan2(d[1], d[0]))) % 180
            if ang < 25 or ang > 155: y = (q[i, 1] + q[j, 1]) / 2; q[i, 1] = q[j, 1] = y
            elif abs(ang - 90) < 25: x = (q[i, 0] + q[j, 0]) / 2; q[i, 0] = q[j, 0] = x
    return (q @ R).round().astype(np.int32)

# 描く: 外 = 薄いグレー、床 = 白、家具の線 = グレー、外形 = 黒の太線
H, W = keep.shape
img = np.full((H, W, 3), 236, np.uint8)
img[keep > 0] = (255, 255, 255)
img[cv2.dilate(ed, np.ones((2, 2), np.uint8)) > 0] = (170, 170, 170)
# 向きは写真の中のまっすぐな線（壁際・ソファ・カウンター）から取る。外形の辺はギザギザで当てにならない
def line_angle():
    e = cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 0), 30, 90); e[cv2.dilate(keep, np.ones((15, 15), np.uint8)) == 0] = 0
    ls = cv2.HoughLinesP(e, 1, np.pi / 360, threshold=px(.4), minLineLength=px(.8), maxLineGap=px(.1))
    if ls is None: return wall_angle(keep)
    hist = np.zeros(90)
    for x1, y1, x2, y2 in ls[:, 0]: hist[int(math.degrees(math.atan2(y2 - y1, x2 - x1))) % 90] += math.hypot(x2 - x1, y2 - y1)
    hist = np.convolve(np.r_[hist[-5:], hist, hist[:5]], np.ones(7), 'same')[5:-5]
    return float(np.argmax(hist))
ROT = line_angle()
cnts, hier = cv2.findContours(keep, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
outer, holes = [], []
for c, h in zip(cnts, hier[0]):
    if cv2.contourArea(c) < (0.25 * ppm) ** 2: continue
    (holes if h[3] >= 0 else outer).append(straighten(c, px(.28)))
img[:] = 255
cv2.fillPoly(img, outer, (255, 255, 255))
cv2.fillPoly(img, holes, (255, 255, 255))
lines_mask = cv2.dilate(ed, np.ones((2, 2), np.uint8)) > 0
fill = np.zeros((H, W), np.uint8); cv2.fillPoly(fill, outer, 255); cv2.fillPoly(fill, holes, 0)
img[lines_mask & (cv2.erode(fill, np.ones((5, 5), np.uint8)) > 0)] = (185, 185, 185)
cv2.polylines(img, outer, True, (20, 20, 20), max(3, px(.09)), lineType=cv2.LINE_AA)
# 中の塊（柱・家具の島）は黒く塗る（参考の図面の柱のように）。大きいものは線だけ
for h in holes:
    if cv2.contourArea(h) < (1.2 * ppm) ** 2: cv2.fillPoly(img, [h], (20, 20, 20))
    else: cv2.polylines(img, [h], True, (20, 20, 20), max(2, px(.06)), lineType=cv2.LINE_AA)
cv2.imwrite(out, img)
ys, xs = np.nonzero(fill)
json.dump({'bbox': [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1] if len(xs) else None, 'th': TH, 'angle': ROT}, open(out + '.json', 'w'))
print('plan', out, W, H, 'blobs', len(hits), 'th', TH, 'angle', ROT)
