# 物件ごとの「位置から見る」を Fable に審査させる（2026-11-27 本人「点決めた後fableにFBもらって 合格するまで回して」「全ての部屋で」）
#
#   python scripts/photomap-review.py <物件id> [--model=fable]
#     入力: all/<id>/pm.json（photomap-build の出力）、artifacts/photomap/*.webp（図）、各シーンの planrooms.png・ai_points.json、
#           点の正面の写真（新しく撮った点は <dir>/centre/<点>-<面>.s.jpg、既存の地点は本番 /api/pano/...s.jpg）
#     出力: all/<id>/review/（審査に見せた画像）と all/<id>/review.json {pass, issues:[{point|room, problem, fix}], points:{番号: {map,id}}, by}
#     審査の決まり（本人のルール）: 全部の部屋に点・点は部屋の真ん中・家具/壁/階段の上でない・矢印は部屋が一番よく分かる向き・
#     1 部屋に点は 1 つ（45㎡ 超の広い部屋は複数可）・図と写真が読める。点が無い部屋は、理由（吹き抜け・未スキャン・AI 不合格）が妥当か
import sys, os, json, glob, re, subprocess, urllib.request, math
import numpy as np, cv2

HERE = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.dirname(HERE)
WS = 'F:/Codex/pvgen/tour/photomap'
ORIGIN = 'https://locahun3d.com'
UA = {'User-Agent': 'Mozilla/5.0 (photomap-review)'}
pid = sys.argv[1]
opt = lambda k, dv=None: next((a.split('=', 1)[1] for a in sys.argv[2:] if a.startswith(f'--{k}=')), dv)
MODEL = opt('model', 'fable')
P = f'{WS}/all/{pid}'
OUT = f'{P}/review'; os.makedirs(OUT, exist_ok=True)
for f in glob.glob(f'{OUT}/*'): os.remove(f)
FACE = {0: 'f', 90: 'r', 180: 'b', -90: 'l', 270: 'l', -180: 'b'}

pm = json.load(open(f'{P}/pm.json', encoding='utf-8'))
# 新しく撮った点の写真（R2 に上げる前）: base → ローカルの centre/
local = {}
for at in glob.glob(f'{P}/**/centre/at.json', recursive=True):
    a = json.load(open(at, encoding='utf-8'))
    if a.get('set'): local[f'/api/pano/{a["key"]}-g{a["set"]}-'] = os.path.dirname(at)

def face_img(base, pt):
    # 第1回: 正面 1 枚だけだと広い部屋の点どうしが同じ写真に見えた → 最初の向き（大）＋ 残り 3 方向（小）
    o = int(round((pt.get('o') or 0) / 90.0)) * 90
    order = [FACE.get(((o + k * 90 + 180) % 360) - 180, 'f') for k in range(4)]
    ims = [face_one(base, pt, f) for f in order]
    if ims[0] is None: return None
    big = cv2.resize(ims[0], (300, 300)); row = [cv2.resize(i, (100, 100)) if i is not None else np.full((100, 100, 3), 200, np.uint8) for i in ims[1:]]
    return np.vstack([big, np.hstack(row)])

def face_one(base, pt, fc):
    if base in local:
        f = f'{local[base]}/{pt["id"]}-{fc}.s.jpg'
        return cv2.imread(f) if os.path.exists(f) else None
    try:
        b = urllib.request.urlopen(urllib.request.Request(f'{ORIGIN}{base}{pt["id"]}-{fc}.s.jpg', headers=UA), timeout=60).read()
        return cv2.imdecode(np.frombuffer(b, np.uint8), cv2.IMREAD_COLOR)
    except Exception: return None

num = 0; numbers = {}; thumbs = []; maps = []
for k, mp in enumerate(pm):
    im = cv2.imread(f'{REPO}/artifacts/photomap/{os.path.basename(mp["image"]["src"])}')
    if im is None: continue
    s = 1400 / max(im.shape[:2]); im = cv2.resize(im, None, fx=s, fy=s, interpolation=cv2.INTER_AREA) if s < 1 else im
    H, W = im.shape[:2]; r_ = max(8, W // 90)
    # 第4回の審査（ariake）: 番号が密集して読めない → 点と矢印を先に全部描き、番号は点・矢印・他の番号と重ならない位置へ（遠いときは引出線）
    P = [(int(q['x'] * W), int(q['y'] * H), math.radians(q['yaw'])) for q in mp['points']]
    occ = [(x - r_, y - r_, x + r_, y + r_) for x, y, _ in P] + [(min(x, int(x + math.sin(a) * r_ * 3)) - 3, min(y, int(y - math.cos(a) * r_ * 3)) - 3, max(x, int(x + math.sin(a) * r_ * 3)) + 3, max(y, int(y - math.cos(a) * r_ * 3)) + 3) for x, y, a in P]
    def place(x, y, txt):
        (tw, th), _ = cv2.getTextSize(txt, cv2.FONT_HERSHEY_SIMPLEX, 0.8, 2)
        for rr in (1, 2, 3, 4, 6):
            for ang in range(-45, 315, 45):
                cx = int(x + math.cos(math.radians(ang)) * r_ * 1.6 * rr); cy = int(y - math.sin(math.radians(ang)) * r_ * 1.6 * rr)
                bx = (cx - tw // 2 - 2, cy - th // 2 - 2, cx + tw // 2 + 2, cy + th // 2 + 2)
                if bx[0] < 0 or bx[1] < 0 or bx[2] >= W or bx[3] >= H: continue
                if any(not (bx[2] < o[0] or bx[0] > o[2] or bx[3] < o[1] or bx[1] > o[3]) for o in occ): continue
                occ.append(bx); return (bx[0] + 2, bx[3] - 2), rr > 2
        return (x + r_, y - r_), False
    for x, y, a in P:
        cv2.circle(im, (x, y), r_, (60, 60, 230), -1)
        cv2.arrowedLine(im, (x, y), (int(x + math.sin(a) * r_ * 3), int(y - math.cos(a) * r_ * 3)), (60, 60, 230), max(2, r_ // 3), tipLength=0.4)
    for q in mp['points']:
        num += 1; numbers[num] = {'map': mp['label'], 'id': q['id']}
        x, y = int(q['x'] * W), int(q['y'] * H); a = math.radians(q['yaw'])
        org, lead = place(x, y, str(num))
        if lead: cv2.line(im, (x, y), (org[0], org[1] - 8), (200, 0, 0), 1)
        cv2.putText(im, str(num), org, cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 5); cv2.putText(im, str(num), org, cv2.FONT_HERSHEY_SIMPLEX, 0.8, (200, 0, 0), 2)
        t = face_img(q.get('base') or mp['photoBase'], q)
        t = t if t is not None else np.full((400, 300, 3), 200, np.uint8)
        cv2.rectangle(t, (0, 0), (150, 34), (0, 0, 0), -1); cv2.putText(t, f'{num} {mp["labelEn"][:6]}', (5, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
        thumbs.append(t)
    cv2.putText(im, mp['labelEn'], (10, 34), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (200, 0, 0), 2)
    fn = f'map{k + 1}.jpg'; cv2.imwrite(f'{OUT}/{fn}', im, [cv2.IMWRITE_JPEG_QUALITY, 88]); maps.append(fn)
sheets = []
for i in range(0, len(thumbs), 20):
    T = thumbs[i:i + 20]
    while len(T) % 5: T.append(np.full((400, 300, 3), 255, np.uint8))
    g = np.vstack([np.hstack(T[j:j + 5]) for j in range(0, len(T), 5)])
    fn = f'photos{i // 20 + 1}.jpg'; cv2.imwrite(f'{OUT}/{fn}', g, [cv2.IMWRITE_JPEG_QUALITY, 82]); sheets.append(fn)
# 部屋の一覧（点が無い部屋と、その理由）
rooms_txt = []; plans = []
ai = json.load(open(f'{P}/ai_points.json', encoding='utf-8')) if os.path.exists(f'{P}/ai_points.json') else {}
for j, (d, logs) in enumerate(sorted(ai.items())):
    for lg in (logs if isinstance(logs, list) else [logs]):
        sc = lg['dir'].split('/all/')[1]
        if os.path.exists(f'{lg["dir"]}/planrooms.png'):
            im = cv2.imread(f'{lg["dir"]}/planrooms.png'); s = 1400 / max(im.shape[:2])
            if s < 1: im = cv2.resize(im, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
            fn = f'rooms{len(plans) + 1}.jpg'; cv2.imwrite(f'{OUT}/{fn}', im, [cv2.IMWRITE_JPEG_QUALITY, 85]); plans.append((fn, sc))
        for v in lg.get('voids', []): rooms_txt.append(f'- {sc} {v}: 吹き抜け（図に × ）なので点なし')
        for v in lg.get('unscanned', []): rooms_txt.append(f'- {sc} {v}: 3D スキャンの範囲の外なので点なし')
        for sl in lg['slots']:
            if not sl['final']:
                rs = [x.get('reason') or x.get('error') or '' for x in sl['verdicts']][-3:]
                rooms_txt.append(f'- {sc} {sl["room"]}（{sl["area"]}㎡）: 候補を全部 AI が不合格 → 点なし（試した候補 {len(sl["verdicts"])} 個、うち別位置・高さ違いの撮り直し {sl.get("blurTries", 0)} 個）。理由: ' + ' / '.join(r[:50] for r in rs))

PROMPT = f"""あなたはロケハンサイト Locahun 3D の物件ページ「位置から見る」の最終審査担当です。物件: {pid}
施設の公式平面図に点を打ち、点を押すとその位置の 360° 写真が開きます。見る人はロケ地を探す制作会社の人です。

ファイル（{OUT}）:
- {', '.join(maps)}: 物件ページに出す図（赤い丸＝点、矢印＝最初に見える向き、赤い数字＝点の番号）
- {', '.join(sheets) or '（なし）'}: 各点の写真。上の大きい 1 枚＝最初に見える向き、下の小さい 3 枚＝右・後ろ・左（左上に番号）
- {', '.join(f'{a}（{b}）' for a, b in plans) or '（なし）'}: 部屋分けの確認図（緑＝スキャンのある部屋、灰＝範囲外、赤っぽい＝吹き抜け、r番号＝部屋）

点が無い部屋とその理由:
{chr(10).join(rooms_txt) or '- なし'}

本人のルール（全部満たせば合格）:
1. 図面の全ての部屋（トイレ・廊下・玄関などの小部屋も含む。吹き抜け・階段室・3D の範囲外は除く）に点がある。点が無い部屋は、上の理由が妥当か確かめる（「壁に近すぎ」「壁の大写し」だけが理由で点が無い小部屋は妥当でない＝不合格。「全体がにじんで判別できない」は、別位置・高さ違いの撮り直しを 3 個以上試しても全部にじんだときだけ妥当（3 個未満なら不合格・fix は「部屋の中の別位置を試す」）。「別の部屋に見える」は図の位置ずれの疑いとして problem に書く）
2. 点は部屋のできるだけ真ん中（壁際・隅・扉の上は不可）。45㎡ を超える広い部屋は複数可、それ以外は 1 部屋 1 点（重複は不可）
3. 写真が家具・壁・階段の中や上でなく、ぼやけて分からない写真でない。その部屋の写真に見える
（水色の半透明の塗り「立ち入り禁止」は施設指定の範囲の表示。壊れではない。最初の向きの大半がその塗りなら指摘する）
4. 矢印（最初の向き）は部屋が一番よく分かる方向（壁の大写し・隅向きは不可）。ただし 9㎡ 未満の小部屋（トイレ・洗面・納戸・廊下）はどの向きでも壁が近いのが当然なので、壁が近いこと・点が部屋の端に見えることだけでは落とさない
5. 図と点・番号が読める（点が重なって読めない・図の外に点がある は不可）
細かすぎる好み（数十 cm のずれ・写真の地味さ）では落とさない。

答えは JSON だけ（problem と fix は日本語で短く。fix はアルゴリズムで直せる書き方で）:
{{"pass": true, "issues": [{{"point": 3, "room": "図の部屋名か r番号", "problem": "...", "fix": "..."}}]}}"""

def run_claude():
    r = subprocess.run(['claude.cmd' if os.name == 'nt' else 'claude', '-p', '--model', MODEL, '--output-format', 'json', '--allowedTools', 'Read', '--add-dir', OUT],
                       input=PROMPT, capture_output=True, text=True, encoding='utf-8', timeout=1800, shell=os.name == 'nt')
    try:
        o = json.loads(r.stdout); return (o.get('result') if not o.get('is_error') else None), f'claude:{MODEL}'
    except Exception: return None, f'claude:{MODEL}'
def run_codex():
    out = f'{OUT}/codex.txt'
    imgs = sum([['-i', f'{OUT}/{f}'] for f in maps + sheets + [a for a, _ in plans]], [])
    subprocess.run(['codex.cmd' if os.name == 'nt' else 'codex', 'exec', '--skip-git-repo-check', '-m', 'gpt-6-astra', '-s', 'read-only', '-o', out, *imgs, '-'],
                   input=PROMPT, capture_output=True, text=True, encoding='utf-8', timeout=1800, shell=os.name == 'nt', cwd=OUT)
    return (open(out, encoding='utf-8').read() if os.path.exists(out) else None), 'codex:gpt-6-astra'
txt, by = run_claude()
if not txt: txt, by = run_codex()
m = re.search(r'\{[\s\S]*\}', txt or '')
try: res = json.loads(m.group(0)) if m else {'pass': None, 'error': 'JSON なし', 'raw': (txt or '')[:500]}
except Exception as e: res = {'pass': None, 'error': str(e)[:80], 'raw': (txt or '')[:500]}
res.update(points=numbers, by=by, rooms=rooms_txt, maps=len(maps), nPoints=num)
json.dump(res, open(f'{P}/review.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'review {pid}: pass={res.get("pass")} issues={len(res.get("issues") or [])} points={num} by={by}')
