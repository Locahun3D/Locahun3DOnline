# 本人が tour-topdown の図に打った点（オレンジ等の塗り丸）を読み取り、世界座標の地点にする（2026-11-23）
#   python scripts/tour-marks-read.py <name> <本人の画像> [--hue=lo,hi]
#   本人の画像は図のスクショ（縮小・切り取りあり）でよい: 図（<name>_mark.png）を倍率を振って重ね合わせて位置を合わせる。
#   出力: artifacts/topdown/<name>_marks.json（[{id,x,z}]）と <name>_marks_check.png（読み取った点を図に戻して描いたもの）
import sys, json, numpy as np, cv2
D = 'F:/Codex/viewerfix/artifacts/topdown/'
name, shot = sys.argv[1], sys.argv[2]
info = json.load(open(D + name + '.json', encoding='utf-8'))
ref = cv2.imread(D + name + '_mark.png'); img = cv2.imdecode(np.fromfile(shot, np.uint8), cv2.IMREAD_COLOR)
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
# 打たれた丸: 濃いオレンジ〜赤（色相 0〜14、彩度・明度が高い）。開始位置の印（#ffb454）は色相 ~17 なので外れる
lo, hi = 0, 14
for a in sys.argv[3:]:
    if a.startswith('--hue='): lo, hi = map(int, a[6:].split(','))
m = cv2.inRange(hsv, (lo, 170, 200), (hi, 255, 255))
m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
n, lab, stats, cent = cv2.connectedComponentsWithStats(m)
areas = stats[1:, cv2.CC_STAT_AREA]
med = np.median(areas) if len(areas) else 0
dots = []
for i in range(1, n):
    a = stats[i, cv2.CC_STAT_AREA]
    if a <= med * 0.4: continue
    k = int(round(a / med))
    if k <= 1: dots.append(tuple(cent[i])); continue
    # くっついた丸（2〜3 個）は画素を k 個に分ける
    ys, xs = np.nonzero(lab == i); P = np.float32(np.column_stack([xs, ys]))
    _, _, cc = cv2.kmeans(P, k, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 50, 0.1), 5, cv2.KMEANS_PP_CENTERS)
    dots += [tuple(c) for c in cc]
# 位置合わせ: 図を倍率 s で縮めて本人の画像の中を探す（丸の所は比べない）
g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY); g[m > 0] = 0
gr = cv2.cvtColor(ref, cv2.COLOR_BGR2GRAY)
best = (-1, None, None)
for s in np.arange(0.30, 1.01, 0.005):
    t = cv2.resize(gr, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    if t.shape[0] > g.shape[0] or t.shape[1] > g.shape[1]:
        # 本人の画像が切り取られているときは図の中央部分で合わせる
        c = int(min(g.shape) * 0.9); y0 = (t.shape[0] - c) // 2; x0 = (t.shape[1] - c) // 2
        if c <= 50: continue
        tt = t[y0:y0 + c, x0:x0 + c]; off = (x0, y0)
    else:
        tt = t; off = (0, 0)
    r = cv2.matchTemplate(g, tt, cv2.TM_CCOEFF_NORMED); _, mv, _, ml = cv2.minMaxLoc(r)
    if mv > best[0]: best = (mv, s, (ml[0] - off[0], ml[1] - off[1]))
score, s, (ox, oy) = best
W = info['px']; ppm = info['ppm']; cx, cz = info['center']['x'], info['center']['z']
pts = []
for i, (u, v) in enumerate(sorted(dots, key=lambda d: (round(d[1] / 15), d[0]))):
    ur, vr = (u - ox) / s, (v - oy) / s   # 図（mark.png）の画素
    pts.append({'id': f'm{i + 1}', 'x': round(cx + (ur - W / 2) / ppm, 2), 'z': round(cz + (vr - W / 2) / ppm, 2)})
json.dump({'from': shot, 'match': round(float(score), 3), 'scale': round(float(s), 4), 'points': pts}, open(D + name + '_marks.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
chk = ref.copy()
for p in pts:
    u = int(W / 2 + (p['x'] - cx) * ppm); v = int(W / 2 + (p['z'] - cz) * ppm)
    cv2.circle(chk, (u, v), 9, (0, 90, 255), -1); cv2.circle(chk, (u, v), 9, (255, 255, 255), 2)
cv2.imwrite(D + name + '_marks_check.png', chk)
print('dots', len(pts), 'match', round(float(score), 3), 'scale', round(float(s), 4), 'offset', ox, oy)
