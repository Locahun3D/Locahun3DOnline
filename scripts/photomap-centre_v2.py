# 「位置から見る」の点を、公式図面の部屋の真ん中に置く（2026-11-27）
#   本人「出来るだけ部屋の中央でとること」「写真がない部屋はないようにすること」
#        「もっと徹底的にきれいに配置されるように仕組みを完璧に構築」「AIチェックをしっかり一点ずついれるように」
#
#   python scripts/photomap-centre.py <作業 dir ...> [--replan] [--no-ai] [--rounds=5] [--jobs=4]
#     1. photomap-planrooms.py で図面を部屋に分け、スキャン済みの部屋ごとに真ん中（45㎡ 超は分けて複数）を出す
#     2. 真ん中のすぐ近く（max(0.6m, 短辺 12%)）に写真ツアーの地点があればそれを使う。無ければその位置で 360° を新しく撮る
#        （bake-pano.mjs --at。目の高さは写真ツアーと同じ・床からの高さ。R2 には書かない。--upload はパイプラインで）
#     3. 全部の点を 1 点ずつ AI（claude -p fable → だめなら codex）に見せる: 360° の帯（L F R B と真下）＋図面の部屋の切り抜きと点の位置
#        → {ok, reason, inRoom, insideObject, broken, onStairs, bestFace}
#        ok でなければ、同じ部屋の控えの位置（真ん中に近い順・立てる所）で撮り直して見せる（最大 --rounds 回）。
#        それでもだめなら部屋の中の既存の地点（AI で ok のもの）。それも無ければ外して記録する
#     4. <dir>/centre.json（図に出す点）と <物件>/ai_points.json（全部の判定）を書く。最初の向きは AI の bestFace
import sys, os, json, math, subprocess, glob, re, urllib.request, concurrent.futures as cf
import numpy as np, cv2

HERE = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.dirname(HERE)
dirs = [a.rstrip('/\\').replace('\\', '/') for a in sys.argv[1:] if not a.startswith('--')]
opt = lambda k, dv=None: next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith(f'--{k}=')), dv)
REPLAN, NOAI = '--replan' in sys.argv, '--no-ai' in sys.argv
# 窓を出す撮影（bake-pano --at）をしない: --no-render か止め札 _log/NO_WINDOW。撮る予定の点は centre.json の pending と _log/render_queue.txt に残す
NOREND = '--no-render' in sys.argv or os.path.exists('F:/Codex/pvgen/tour/photomap/_log/NO_WINDOW')
ROUNDS, JOBS = int(opt('rounds', '5')), int(opt('jobs', '4'))
ORIGIN = 'https://locahun3d.com'
UA = {'User-Agent': 'Mozilla/5.0 (photomap-centre)'}
FACE_O = {'F': 0, 'R': 90, 'B': 180, 'L': -90}

def get(url, binary=False):
    b = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
    return b if binary else json.loads(b)

def label_tile(img, t):
    cv2.rectangle(img, (0, 0), (40, 34), (0, 0, 0), -1); cv2.putText(img, t, (6, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 255), 2); return img

def strip_from(files, out, title):
    tiles = []
    for k in ['l', 'f', 'r', 'b', 'd']:
        im = cv2.imdecode(np.frombuffer(files[k], np.uint8), cv2.IMREAD_COLOR)
        tiles.append(label_tile(cv2.resize(im, (320, 320)), k.upper()))
    s = np.hstack(tiles); cv2.rectangle(s, (0, 0), (16 + 15 * len(title), 30), (0, 0, 0), -1)
    cv2.putText(s, title, (6, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
    cv2.imwrite(out, s, [cv2.IMWRITE_JPEG_QUALITY, 80])

PROMPT = """あなたはロケハンサイト Locahun 3D の「位置から見る」の点検担当です。
施設の公式平面図の部屋ごとに 1 か所、3D スキャンからその位置の 360° 写真を作りました。見る人は図面の点を押してその部屋の眺めを見ます。
本人の決まり: 点は「できるだけ部屋の真ん中」、写真は「その部屋がよく分かる眺め」。

ファイル（{dir}）:
- {pid}.jpg: その点の 360° の帯。左から L・F・R・B（目の高さ、各 90°）と右端の D＝真下（足元）。
- {pid}_plan.jpg: 公式平面図の切り抜き。緑の線＝この点が受け持つ部屋の範囲、赤い丸＝点の位置、赤い矢印＝F の向き。

点検（どれかに当たれば ok:false）:
- insideObject: 壁・柱・家具・棚・カウンター・ベッド・植物などの中や 0.3m 以内にいて、L/F/R/B のどれかの 3 割以上が物の内側・ぼやけた塊・壁の大写しで塞がれている。机や台の上に浮いている（D の真ん中が天板・座面）
- broken: 画面の大半がちぎれた点・にじんだ色・黒・空白で、どんな場所か分からない（3D の撮影範囲の外）。L/F/R/B の半分以上が全体ににじんで、家具や部屋の形が判別できない場合も broken
- blurDirs: L/F/R/B のうち、画面の広い範囲（3 割以上）に強いにじみ・溶けた色があって床や家具の輪郭が崩れている方向の数（0〜4）。2 以上なら ok:false（第6回の審査: 2 方向のにじみで落ちた）
- inRoom=false: 写真が図面の緑の範囲の部屋に見えない（明らかに別の部屋・屋外・階段の途中・天井裏や床下）
- onStairs: 階段の段の途中（踊り場・上端・下端は可）
- 空中: D に床がはっきり写らない（吹き抜けの上など）
似た眺め・地味・家具が手前に写るのは外さない。水色の半透明の塗り（「立ち入り禁止」の札つき）は施設が指定した立ち入り禁止範囲の表示で、壊れではない。点がその塗りの中なら inRoom=false。bestFace は塗りが少ない方向。
bestFace: その部屋が一番よく分かる（奥行きがあり、床と家具・部屋の特徴が広く見える）方向を L/F/R/B から 1 つ。窓や壁の大写し・隅向き・にじんだ方向・札や覆い（シート・足場・カーテン）が画面の大半を占める方向は選ばない。

答えは JSON だけ:
{{"ok":true,"reason":"だめな時だけ短く日本語で","inRoom":true,"insideObject":false,"broken":false,"onStairs":false,"blurDirs":0,"bestFace":"F","room":"写真から分かる部屋の種類（例: 会議室・キッチン・トイレ）"}}"""

def ai_check(work, pid, extra=''):
    prompt = PROMPT.format(dir=work.replace('\\', '/'), pid=pid) + extra
    errs = []
    # 本人決定 11/27: 審査は codex gpt-6-astra のみ（claude CLI は 401 のため呼ばない）。codex の時間切れで物件ごと落ちていた（babel・modello）→ 2 回まで試し、だめなら判定なしで続ける
    txt = None; by = 'codex:gpt-6-astra'
    for attempt in range(2):
        out = os.path.join(work, f'codex-{pid}.txt')
        try:
            r = subprocess.run(['codex.cmd' if os.name == 'nt' else 'codex', 'exec', '--skip-git-repo-check', '-m', 'gpt-6-astra', '-s', 'read-only', '-o', out,
                                '-i', os.path.join(work, f'{pid}.jpg'), '-i', os.path.join(work, f'{pid}_plan.jpg'), '-'],
                               input=prompt, capture_output=True, text=True, encoding='utf-8', timeout=600, shell=os.name == 'nt', cwd=work)
        except subprocess.TimeoutExpired: errs.append(f'codex: 時間切れ（{attempt + 1} 回目）'); continue
        if os.path.exists(out): txt = open(out, encoding='utf-8').read(); os.remove(out); break
        errs.append('codex: ' + (r.stderr or '')[-120:])
    m = re.search(r'\{[\s\S]*\}', txt or '')
    if not m: return {'ok': None, 'error': ' / '.join(errs) or 'JSON なし', 'by': by}
    try: j = json.loads(m.group(0))
    except Exception as e: return {'ok': None, 'error': 'JSON が読めない ' + str(e)[:60], 'by': by}
    j['by'] = by
    # 項目どうしの食い違いは厳しい方に
    if j.get('insideObject') or j.get('broken') or j.get('onStairs') or j.get('inRoom') is False: j['ok'] = False
    try:
        if int(j.get('blurDirs') or 0) >= 2: j['ok'] = False; j['reason'] = j.get('reason') or '2 方向以上がにじんでいる'
    except (TypeError, ValueError): pass
    return j

def plan_crop(pr, reg, room, u, v, yaw, out, bp):
    M = np.array(reg['world2img'], float)
    ppm = math.hypot(M[0, 0], M[0, 1])
    poly = np.array(room['poly'], np.int32)
    xs, ys = poly[:, 0], poly[:, 1]
    mg = int(1.5 * ppm)
    a, b = max(0, xs.min() - mg), max(0, ys.min() - mg)
    c, d = min(bp.shape[1], xs.max() + mg), min(bp.shape[0], ys.max() + mg)
    im = bp.copy()
    cv2.polylines(im, [poly], True, (0, 180, 0), max(2, int(ppm * 0.06)))
    r = max(6, int(ppm * 0.18))
    cv2.circle(im, (int(u), int(v)), r, (0, 0, 255), -1)
    fx, fz = math.sin(yaw), math.cos(yaw)
    du, dv = M[0, 0] * fx + M[0, 1] * fz, M[1, 0] * fx + M[1, 1] * fz
    n = math.hypot(du, dv) or 1
    cv2.arrowedLine(im, (int(u), int(v)), (int(u + du / n * r * 4), int(v + dv / n * r * 4)), (0, 0, 255), max(2, r // 3), tipLength=0.35)
    crop = im[b:d, a:c]
    s = 900 / max(crop.shape[:2])
    if s < 1: crop = cv2.resize(crop, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    cv2.imwrite(out, crop, [cv2.IMWRITE_JPEG_QUALITY, 85])

def cyan_frac(work, pid):   # 第2回の審査（fc-space）: 施設が指定した「立ち入り禁止」の水色の塗りが最初の向きの大半を占めた → 方向ごとの水色の割合
    im = cv2.imread(f'{work}/{pid}.jpg')
    if im is None: return {}
    hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV); out = {}
    for k, o in enumerate((-90, 0, 90, 180)):
        t = hsv[:, k * 320:(k + 1) * 320]
        out[o] = float(((t[..., 0] >= 85) & (t[..., 0] <= 100) & (t[..., 1] > 150) & (t[..., 2] > 170)).mean())
    return out

SCAN = {}
def sharp(work, pid):   # 第2回の審査（ingleneuk 点1）: 最初の向きが全面にじんだ方向だった → 方向ごとのくっきり度（ラプラシアンの分散）
    im = cv2.imread(f'{work}/{pid}.jpg', 0)
    if im is None: return {}
    return {o: float(cv2.Laplacian(im[30:, k * 320:(k + 1) * 320], cv2.CV_64F).var()) for k, o in enumerate((-90, 0, 90, 180))}

def pick_face(room, c, ai_o, M, cyan=None, sh=None):
    # 第1回の審査: 最初の向きが壁・扉・窓の大写しになる点が多かった → 図面の部屋の中で、4 方向のうち一番遠くまで見通せる向き。
    # AI の bestFace がその 85% 以上見通せるなら AI を優先（設備が見える向きを選んでいることがある）
    poly = np.array(room['poly'], np.float32); A2 = np.array(M, float)[:, :2]
    def ray(o):
        a = c['yaw'] - math.radians(o); d = A2 @ np.array([math.sin(a), math.cos(a)]); d = d / (np.linalg.norm(d) or 1); L = 0
        while cv2.pointPolygonTest(poly, (float(c['u'] + d[0] * L), float(c['v'] + d[1] * L)), False) >= 0 and L < 5000: L += 2
        # 11/28 第8回の審査（fc-space 点4）: 最初の向きがプライベートゾーン（図の斜線の部屋）の札・荷物だった → 部屋を出た先がすぐ斜線の部屋なら、その向きは見通しを 1 割に
        ppm_ = float(np.linalg.norm(A2[:, 0]))
        if L < 8 * ppm_ and any(cv2.pointPolygonTest(hp, (float(c['u'] + d[0] * (L + 0.4 * ppm_)), float(c['v'] + d[1] * (L + 0.4 * ppm_))), False) >= 0 for hp in SCAN.get('hatchP', [])):
            HIT.add(o)
        if SCAN.get('img') is not None:   # 第3回の審査: 図面では奥まで空いていても、実際は壁・棚が目の前のことがある → スキャンの壁・物（scan.png の黒）までの距離でも切る
            sm, im = SCAN['meta'], SCAN['img']; scale = np.linalg.norm(A2 @ np.array([math.sin(a), math.cos(a)]))
            for k in range(1, int(L / max(scale, 1e-6) * sm['ppm']) + 1):
                m = k / sm['ppm']; x = c['x'] + math.sin(a) * m; z = c['z'] + math.cos(a) * m
                px, py = int((x - sm['x0']) * sm['ppm']), int((z - sm['z0']) * sm['ppm'])
                if 0 <= py < im.shape[0] and 0 <= px < im.shape[1] and im[py, px] < 60 and m > 0.25:
                    L = min(L, m * scale); break
        return L
    # 第4回の審査: 中心の1本だけだと、扉の隙間から奥が見える向きが勝ち、画面の大半は家具・壁の大写しになる → 画角内の5本の平均
    HIT = set()
    lens = {o: float(np.mean([ray(o + k) for k in (-30, -15, 0, 15, 30)])) for o in (0, 90, 180, -90)}
    hit = {o for o in lens if any(o + k in HIT for k in (-15, 0, 15))}
    if hit and len(hit) < 4: lens = {o: L * (0.1 if o in hit else 1) for o, L in lens.items()}
    if sh and max(sh.values()) > 0:   # くっきり度が一番の方向の 4 割未満の方向（にじみ）は選びにくく
        mx = max(sh.values()); lens = {o: L * (1 if sh.get(o, mx) >= 0.4 * mx else 0.2) for o, L in lens.items()}
    big = (room.get('area') or 0) >= 45
    ct = 0.06 if big else 0.15   # 11/28 第9回の審査（fc-space 点6）: 広いホールで立ち入り禁止の塗りが 1 割前後でも「大きく捉え」と言われた
    if cyan and any(cyan.get(o, 0) < ct for o in lens): lens = {o: L * (1 if cyan.get(o, 0) < ct else 0.05) for o, L in lens.items()}
    if big:   # 11/28 第9回の審査（fc-space 点4・6: 251㎡ のホールの端の点が、シャッター・荷物・禁止範囲を向いた）: 広い部屋は区画の真ん中の方を向く
        cu, cv_ = poly.mean(0); vu, vv = cu - c['u'], cv_ - c['v']; nv_ = math.hypot(vu, vv)
        if nv_ > 1.5 * float(np.linalg.norm(A2[:, 0])):
            def toward(o):
                a = c['yaw'] - math.radians(o); d = A2 @ np.array([math.sin(a), math.cos(a)]); d = d / (np.linalg.norm(d) or 1)
                return 0.25 + 0.75 * max(0.0, (d[0] * vu + d[1] * vv) / nv_)
            lens = {o: L * toward(o) for o, L in lens.items()}
        best = max(lens, key=lens.get)
        return ai_o if lens.get(ai_o, 0) >= 0.8 * lens[best] else best
    best = max(lens, key=lens.get)
    # 第5回の審査: 見通しだけで選ぶと「隣室への開口」「壁面中心で設備が見えない」と言われる → 写真を見た AI の bestFace を重く（6 割以上見通せれば AI、9㎡ 未満の小部屋は設備が見える AI の向きを常に）
    if (room.get('area') or 0) < 9 and lens.get(ai_o, 0) >= 0.3 * lens[best]: return ai_o   # にじみ・立ち入り禁止で下げた向きは除く
    # 第7回の審査（ariake 102教室・器楽レッスン室1・会議室）: 見通しで AI の向きを覆した 3 点が全部「窓・扉・壁の大写し」で落ちた（AI の向きを使った点は 1 件のみ）→ 見通しが 35% 以上あれば AI
    return ai_o if lens.get(ai_o, 0) >= 0.35 * lens[best] else best

def deep_yaw(room, u, v, M):
    # 部屋の範囲の中で一番遠くまで見通せる向き（図面の画素で 32 方向に線を伸ばす）→ 世界の yaw
    poly = np.array(room['poly'], np.float32)
    def depth(t):
        du, dv = math.cos(t), math.sin(t); L = 0
        while cv2.pointPolygonTest(poly, (float(u + du * L), float(v + dv * L)), False) >= 0 and L < 5000: L += 2
        return L
    # 第5回の審査: 一番遠い 1 本は対角＝部屋の隅に向きやすい（「窓と扉のある隅」「窓際の隅」）→ 部屋の軸（minAreaRect）の 4 方向から、画角 ±30° の見通しの平均が一番長い方向
    (_, _), (_, _), ang = cv2.minAreaRect(poly)
    axes = [math.radians(ang) + k * math.pi / 2 for k in range(4)]
    sc = [(float(np.mean([depth(t + math.radians(e)) for e in (-30, -15, 0, 15, 30)])), t) for t in axes]
    best = (max(sc)[1], 0)
    du, dv = math.cos(best[0]), math.sin(best[0])
    Ai = np.linalg.inv(np.array(M, float)[:, :2])
    dx, dz = Ai @ np.array([du, dv])
    return math.atan2(dx, dz)

def run_dir(d):
    pid = d.split('/all/')[1].split('/')[0]
    reg_name = 'reg_merged.json' if os.path.exists(f'{d}/reg_merged.json') else 'reg.json'
    if not os.path.exists(f'{d}/planrooms.json'):
        subprocess.run([sys.executable, f'{HERE}/photomap-planrooms_v2.py', d, f'--reg={reg_name}'], check=True)
    pr = json.load(open(f'{d}/planrooms.json', encoding='utf-8'))
    reg = json.load(open(f'{d}/{reg_name}', encoding='utf-8'))
    td = json.load(open(f'{d}/td.json', encoding='utf-8'))
    g = get(f'{ORIGIN}/api/pano/{td["key"]}.graph.json')
    gn = {n['id']: n for n in g['nodes']}
    offs = [n['pos']['y'] - n['floorY'] for n in g['nodes'] if n.get('floorY') is not None]
    EYE = float(np.median(offs)) if offs else 1.15
    bp = cv2.imdecode(np.fromfile(os.path.normpath(os.path.join(d, reg['blueprint'])), np.uint8), cv2.IMREAD_COLOR)
    M = reg['world2img']
    SCAN['img'] = cv2.imread(f'{d}/scan.png', 0) if os.path.exists(f'{d}/scan.png') else None
    SCAN['meta'] = json.load(open(f'{d}/scan.json')) if os.path.exists(f'{d}/scan.json') else None
    SCAN['hatchP'] = [np.array(r['poly'], np.float32) for r in pr['rooms'] if r.get('hatched') and r.get('poly')]
    work = f'{d}/centre'; os.makedirs(work, exist_ok=True)
    at_path = f'{work}/at.json'
    at = json.load(open(at_path, encoding='utf-8')) if os.path.exists(at_path) else {'scene': td['scene'], 'key': td['key'], 'points': []}
    have = {p['id']: p for p in at['points']}
    nid = [800 + len(at['points'])]
    def new_point(x, z, fy, yaw, dy=0.0):
        y = round(fy + EYE + dy, 3)
        for q in at['points']:   # やり直しのときは同じ位置の撮影済みを使う
        # 11/28 第8回の審査（zigsaw 点5）: 同じ位置の撮影済みを使い回すとき、写真は前に撮った向き（q['yaw']）で撮れている → 呼び出し側は p['yaw'] を使う（新しく計算した yaw を使うと矢印が 180° 逆になった）
            if abs(q['x'] - x) < 0.05 and abs(q['z'] - z) < 0.05 and abs(q.get('y', y) - y) < 0.05: return q
        nid[0] += 1; p = {'id': f'n{nid[0]}', 'x': x, 'y': y, 'z': z, 'yaw': round(yaw, 4)}
        at['points'].append(p); have[p['id']] = p; return p
    def render():
        if NOREND: return
        todo = [p for p in at['points'] if not p.get('done')]
        if not todo: return
        json.dump(at, open(at_path, 'w', encoding='utf-8'), indent=1)
        # 11/27: 本番ビューアーを開始 360° 画像の前に巻き戻した（3f5d869）ため public の viewer には __startPano（360° のキー計算）が無い → 撮影は巻き戻し前の viewer の写し（_viewer/、61385cb）で
        vw = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(d))) if '/all/' not in d else d.split('/all/')[0], '_viewer', 'offline-viewer-startpano.html')
        r = subprocess.run(['node', 'scripts/bake-pano.mjs', '--at', at_path, '--out', work] + (['--viewer', vw] if os.path.exists(vw) else []), cwd=REPO, capture_output=True, text=True, encoding='utf-8')
        open(f'{work}/render.log', 'a', encoding='utf-8').write(r.stdout + r.stderr)
        at.update(json.load(open(at_path, encoding='utf-8'))); have.update({p['id']: p for p in at['points']})
    def node_strip(n_id):
        if os.path.exists(f'{work}/{n_id}.jpg'): return
        files = {k: get(f'{ORIGIN}/api/pano/{td["key"]}-g{g["set"]}-{n_id}-{k}.s.jpg', True) for k in 'lfrbd'}
        # 11/27: 本番の焼き込みが壊れて全地点・全方向が同じ 1 枚のシーンがある（phome 1F・grass 1F ほか）→ その地点は使わない
        sm = {k: cv2.resize(cv2.imdecode(np.frombuffer(files[k], np.uint8), 0), (64, 64)).astype(float) for k in 'lfrb'}
        if np.mean([np.abs(sm['f'] - sm[k]).mean() for k in 'lrb']) < 3: raise RuntimeError('本番の 360° 画像が壊れている（全方向が同じ画）')
        strip_from(files, f'{work}/{n_id}.jpg', n_id)
    def pick_node(s):   # 部屋の中の既存の地点のうち、真ん中に一番近いもの（まだ試していないもの）
        if reg.get('brokenPano'): return None   # 本番の 360° 画像が壊れたシーン（全方向が同じ画など）: 既存地点を使わない
        tried_ids = {t['id'] for t in s['tried']}
        ns = [gn[i] for i in s['room'].get('nodesIn', []) if i in gn and i not in tried_ids]
        if not ns: return None
        tu, tv = s['target']['u'], s['target']['v']; Mx = np.array(M, float)
        def uv(n): return Mx[0, 0] * n['pos']['x'] + Mx[0, 1] * n['pos']['z'] + Mx[0, 2], Mx[1, 0] * n['pos']['x'] + Mx[1, 1] * n['pos']['z'] + Mx[1, 2]
        # 第2回の審査: 部屋の端・隅の既存地点を拾うと「壁際」「隅」で落ちる → 壁から 0.5m 以上の地点を優先、無ければ一番壁から離れた地点
        poly = np.array(s['room']['poly'], np.float32).reshape(-1, 1, 2)
        def edge(n): return cv2.pointPolygonTest(poly, tuple(float(q) for q in uv(n)), True) / pr['ppm']
        far = [n for n in ns if edge(n) >= 0.5]
        n = min(far, key=lambda n: math.hypot(uv(n)[0] - tu, uv(n)[1] - tv)) if far else max(ns, key=edge); u, v = uv(n)
        return {'kind': 'node', 'id': n['id'], 'x': n['pos']['x'], 'z': n['pos']['z'], 'u': u, 'v': v, 'yaw': n.get('yaw', 0)}
    # ── 1 回目の点 ──
    slots = []   # {room, target, cand: {kind, id, x, z, u, v, yaw}, tried: [...], verdicts: []}
    for room in pr['rooms']:
        if not room['scanned']: continue
        for t in room['targets']:
            if CLAIM is not None and (d, t['u'], t['v']) not in CLAIM: continue   # 同じ図の別のシーンが受け持つ部屋
            if t['node'] and t['node'] in gn and not reg.get('brokenPano'):
                n = gn[t['node']]; u, v = t['u'], t['v']
                cand = {'kind': 'node', 'id': n['id'], 'x': n['pos']['x'], 'z': n['pos']['z'], 'u': u, 'v': v, 'yaw': n.get('yaw', 0)}
            else:
                yaw = deep_yaw(room, t['u'], t['v'], M)
                p = new_point(t['x'], t['z'], t['floorY'], yaw)
                cand = {'kind': 'new', 'id': p['id'], 'x': t['x'], 'z': t['z'], 'u': t['u'], 'v': t['v'], 'yaw': p['yaw']}
            slots.append({'room': room, 'target': t, 'cand': cand, 'tried': [], 'verdicts': [], 'altIdx': 0, 'final': None})
    # 図面から部屋が取れなかったシーン: 以前の選び方（rooms.json の select）の地点を AI 確認つきで使う
    if not slots and not any(r['scanned'] for r in pr['rooms']) and os.path.exists(f'{d}/{reg.get("select", "rooms.json")}'):
        Mx = np.array(M, float); R2 = 2.0 * pr['ppm']
        for i in json.load(open(f'{d}/{reg.get("select", "rooms.json")}', encoding='utf-8')).get('select', []):
            if i not in gn: continue
            n = gn[i]; u = Mx[0, 0] * n['pos']['x'] + Mx[0, 1] * n['pos']['z'] + Mx[0, 2]; v = Mx[1, 0] * n['pos']['x'] + Mx[1, 1] * n['pos']['z'] + Mx[1, 2]
            room = {'id': f'sel-{i}', 'area': 0, 'poly': [[u - R2, v - R2], [u + R2, v - R2], [u + R2, v + R2], [u - R2, v + R2]], 'alts': [], 'nodesIn': [], 'scanned': True, 'fallback': True}
            t = {'u': u, 'v': v, 'x': n['pos']['x'], 'z': n['pos']['z'], 'node': i}
            cand = {'kind': 'node', 'id': i, 'x': n['pos']['x'], 'z': n['pos']['z'], 'u': u, 'v': v, 'yaw': n.get('yaw', 0)}
            slots.append({'room': room, 'target': t, 'cand': cand, 'tried': [], 'verdicts': [], 'altIdx': 0, 'final': None})
    FLOOR = reg.get('floor') or ''
    def ctx(s):   # 点ごとの補足（図の階・撮影者が実際に立った地点か）
        t = chr(10) * 2 + '補足: この図は「' + (FLOOR or '平面図') + '」。'
        if s['cand']['kind'] == 'node':
            t += 'この点は写真ツアーの撮影者が実際に立った既存の地点（立てる床の上）。「空中」「屋根の上で部屋でない」は理由にしない（屋上・屋根の上を歩ける施設がある）。'
        ar = s['room'].get('area') or 0
        short = 99
        if s['room'].get('poly'):
            (_, _), (rw, rh), _ = cv2.minAreaRect(np.array(s['room']['poly'], np.float32)); short = min(rw, rh) / pr['ppm']
        if 0 < ar < 9 or (0 < ar < 20 and short < 3.2):   # 第2回: 15㎡ でも幅 3m 未満の細い部屋は同じ扱い（zigsaw r1）   # 第1回の審査: トイレ・納戸など小部屋は「壁に近すぎ」で全候補が落ちていた
            t += f'この部屋は約 {ar}㎡・幅約 {short:.1f}m の小さい・細い部屋（トイレ・洗面・納戸・廊下など）。壁や扉が近くに大きく写るのは当然なので「壁の大写し」「壁に近い」では不合格にしない。物の中にいる・机や便器の上に浮いている・全体がにじんで何の部屋か分からない・別の部屋に見える ときだけ不合格。bestFace は部屋の設備（便器・洗面台・棚など）が一番見える方向。'
        if reg.get('planDiffers'):   # 司令塔 11/27: 間仕切りが現況と違っても、スキャン済みなら図の部屋の範囲内に点・写真を付ける（位置合わせは地点の写真で確認済みのシーンだけ reg に書く）
            t += '注意: この図は公式図面だが、現況の間仕切りが図と違う箇所がある（' + str(reg.get('planDiffersNote', '')) + '）。位置合わせは写真ツアーの地点の写真で確認済み。写真が「図の閉じた小部屋」ではなく開けた空間・隣の部屋とつながった空間に見えるのは現況どおりなので、それだけでは inRoom=false にしない（屋外・別の階・天井裏に見えるときは inRoom=false）。'
        if any(w in FLOOR for w in ('屋上', 'ルーフ', 'テラス', 'バルコニー')):
            t += '屋外の区画なので、空・周りの建物が写るのは正常。床が屋根材・デッキでも可。'
        return t
    # 本人ルール「写真がない部屋はないように」(11/27): にじみで落ちた部屋は、部屋の中の別の位置（真ん中から 0.5〜1.5m）・目線の高さ違いを最低 3 つ試す。全部にじむときだけ点なしにする
    Mi = cv2.invertAffineTransform(np.array(M, np.float64))
    def is_blur(v): return v.get('broken') is True or any(w in str(v.get('reason', '')) for w in ('にじ', 'ぼけ', 'ボケ', 'ぼや', '判別でき', '分からな', 'わからな', 'broken', 'blur'))
    def scan_free(x, z, r=0.3):   # scan.png で半径 r の中に壁・物（黒）が無い
        if SCAN.get('img') is None: return True
        sm, im = SCAN['meta'], SCAN['img']; px, py = int((x - sm['x0']) * sm['ppm']), int((z - sm['z0']) * sm['ppm']); k = max(1, int(r * sm['ppm']))
        w = im[max(0, py - k):py + k + 1, max(0, px - k):px + k + 1]
        return w.size > 0 and (w < 60).mean() < 0.05
    def blur_queue(s):
        room, t = s['room'], s['target']; ppm = pr['ppm']; q = []
        poly = np.array(room['poly'], np.float32).reshape(-1, 1, 2)
        fy = t.get('floorY', room.get('alts', [[0, 0, 0, 0, 0]])[0][4] if room.get('alts') else 0)
        for a in sorted(room.get('alts', []), key=lambda a: math.hypot(a[0] - t['u'], a[1] - t['v'])):
            dd = math.hypot(a[0] - t['u'], a[1] - t['v']) / ppm
            if 0.5 <= dd <= 1.5: q.append((a[0], a[1], a[2], a[3], a[4], 0.0))
        for r, mw in ((0.8, 0.4), (1.2, 0.4), (0.5, 0.4), (1.5, 0.4), (0.5, 0.2), (0.35, 0.1), (0.3, 0.0)):   # 小部屋でも 3 つ取れるよう、壁からの余裕と距離を段々ゆるめる
            for k in range(8):
                if len(q) >= 3: break
                u = t['u'] + r * ppm * math.cos(k * math.pi / 4); v = t['v'] + r * ppm * math.sin(k * math.pi / 4)
                if cv2.pointPolygonTest(poly, (float(u), float(v)), True) < mw * ppm: continue
                if any(math.hypot(u - b[0], v - b[1]) < min(0.6, r) * ppm for b in q): continue
                x = Mi[0, 0] * u + Mi[0, 1] * v + Mi[0, 2]; z = Mi[1, 0] * u + Mi[1, 1] * v + Mi[1, 2]
                if mw > 0 and not scan_free(x, z): continue   # 第4回の審査（makinoshita 浴室）: 浴槽・家具の上の候補は外す（最後の段だけは許す）
                q.append((u, v, round(x, 3), round(z, 3), fy, 0.0))
        q = q[:3]
        q += [(t['u'], t['v'], t['x'], t['z'], fy, -0.35), (t['u'], t['v'], t['x'], t['z'], fy, 0.35)]   # 目線の高さ違い
        return q
    for rnd in range(1, ROUNDS + 6):
        pend = [s for s in slots if s['final'] is None and s['cand']]
        if not pend: break
        render()
        jobs = []
        for s in pend:
            c = s['cand']
            if c['kind'] == 'node':
                try: node_strip(c['id'])
                except Exception as e: s['verdicts'].append({'id': c['id'], 'ok': False, 'reason': '画像が取れない ' + str(e)[:60]}); s['cand'] = None; continue
            elif not have.get(c['id'], {}).get('done'):
                if NOREND:   # 窓を出せない間: 撮る予定として残し、それまでは部屋の中の既存の地点で代える（AI 確認つき）
                    if not s.get('pending'): s['pending'] = c
                    s['tried'].append(c); c = s['cand'] = pick_node(s)
                    if not c: continue
                    try: node_strip(c['id'])
                    except Exception as e: s['verdicts'].append({'id': c['id'], 'ok': False, 'reason': '画像が取れない ' + str(e)[:60]}); s['cand'] = None; continue
                else:
                    s['verdicts'].append({'id': c['id'], 'ok': False, 'reason': '撮れなかった'}); s['tried'].append(c); s['cand'] = None; continue
            plan_crop(pr, reg, s['room'], c['u'], c['v'], c['yaw'], f'{work}/{c["id"]}_plan.jpg', bp)
            jobs.append(s)
        if NOAI:
            for s in jobs: s['verdicts'].append({'id': s['cand']['id'], 'ok': True, 'bestFace': 'F', 'by': 'none'}); s['final'] = dict(s['cand'], o=0)
        else:
            with cf.ThreadPoolExecutor(JOBS) as ex:
                res = list(ex.map(lambda s: ai_check(work, s['cand']['id'], ctx(s)), jobs))
            for s, v in zip(jobs, res):
                v = dict(v, id=s['cand']['id'], kind=s['cand']['kind'], round=rnd)
                s['verdicts'].append(v)
                cf_ = cyan_frac(work, s['cand']['id'])
                if v.get('ok') is True and cf_ and np.mean(list(cf_.values())) > 0.4: v = dict(v, ok=False, reason='立ち入り禁止の水色の範囲の中・すぐ脇（4 方向平均 %.0f%%）' % (100 * np.mean(list(cf_.values())))); s['verdicts'][-1] = v
                # 司令塔 11/27: 点そのものがにじんでいるのに AI 点検を通る → くっきり度のしきい値で機械的にも落とす
                # （実測: にじみで落ちた点は 4 方向の最大 150〜380、通った普通の点は 2 方向以上が 300 超。白壁の小部屋は低いので 9㎡ 未満は最大 200 未満だけ）
                sh_ = sharp(work, s['cand']['id'])
                if v.get('ok') is True and sh_:
                    small_ = (s['room'].get('area') or 0) < 9
                    blurry = max(sh_.values()) < 200 if small_ else sum(1 for x in sh_.values() if x >= 280) < 2
                    if blurry: v = dict(v, ok=False, reason='写真がにじんでいる（くっきり度 ' + '/'.join(str(int(x)) for x in sh_.values()) + '）'); s['verdicts'][-1] = v
                if v.get('ok') is True: s['final'] = dict(s['cand'], o=pick_face(s['room'], s['cand'], FACE_O.get(str(v.get('bestFace', 'F')).upper()[:1], 0), M, cyan_frac(work, s['cand']['id']), sharp(work, s['cand']['id'])))
                else: s['tried'].append(s['cand']); s['cand'] = None
        # 次の候補: 控えの位置（撮り直し）→ 最後は部屋の中の既存の地点
        for s in slots:
            if s['final'] is not None or s['cand']: continue
            room = s['room']
            if s['verdicts'] and is_blur(s['verdicts'][-1]) and 'blurQ' not in s and not NOREND: s['blurQ'] = blur_queue(s)
            if s.get('blurQ'):
                u, v, x, z, fy, dy = s['blurQ'].pop(0); yaw = deep_yaw(room, u, v, M)
                p = new_point(x, z, fy, yaw, dy); s['blurTries'] = s.get('blurTries', 0) + 1
                s['cand'] = {'kind': 'new', 'id': p['id'], 'x': x, 'z': z, 'u': u, 'v': v, 'yaw': p['yaw'], 'dy': dy}; continue
            alts = [a for a in room.get('alts', []) if all(math.hypot(a[0] - t['u'], a[1] - t['v']) > 0.6 * pr['ppm'] for t in s['tried'])]
            if rnd < ROUNDS and alts and not (NOREND and s.get('pending')):
                a = alts[0]; yaw = deep_yaw(room, a[0], a[1], M)
                p = new_point(a[2], a[3], a[4], yaw)
                s['cand'] = {'kind': 'new', 'id': p['id'], 'x': a[2], 'z': a[3], 'u': a[0], 'v': a[1], 'yaw': p['yaw']}
            elif 'blurQ' not in s and not NOREND and s.update(blurQ=blur_queue(s)) is None and s['blurQ']:   # 第4回の審査: にじみ以外で落ちた部屋も、控えが尽きたら別位置・高さ違いを 3 つ以上試す
                u, v, x, z, fy, dy = s['blurQ'].pop(0); yaw = deep_yaw(room, u, v, M)
                p = new_point(x, z, fy, yaw, dy); s['blurTries'] = s.get('blurTries', 0) + 1
                s['cand'] = {'kind': 'new', 'id': p['id'], 'x': x, 'z': z, 'u': u, 'v': v, 'yaw': p['yaw'], 'dy': dy}
            else:
                s['cand'] = pick_node(s)
    json.dump(at, open(at_path, 'w', encoding='utf-8'), indent=1)
    pts = []
    for s in slots:
        f = s['final']
        if not f: continue
        e = {'id': f['id'], 'kind': f['kind'], 'x': f['x'], 'z': f['z'], 'yaw': f['yaw'], 'o': f['o'], 'room': s['room']['id']}
        if f['kind'] == 'new': e['base'] = f'/api/pano/{at["key"]}-g{at["set"]}-'
        if s.get('pending'): e['pending'] = {k: s['pending'][k] for k in ('id', 'x', 'z', 'yaw')}   # 撮れたらこの点に置き換える
        pts.append(e)
    # 確定した点どうしが近すぎる（別の部屋の点が 1.2m 以内）なら、後の方を外す
    keep = []; AREA = {r['id']: r.get('area') or 0 for r in pr['rooms']}
    for e in pts:
        # 第2回（higashiazabu）: 1.6㎡ の小部屋が隣り合うと 1.2m 以内になり、片方の部屋の点が消えていた → 両方 9㎡ 以上の時だけ 1.2m、小部屋が絡むと 0.6m
        if all(math.hypot(e['x'] - k['x'], e['z'] - k['z']) >= (1.2 if min(AREA.get(e['room'], 0), AREA.get(k['room'], 0)) >= 9 else 0.6) for k in keep): keep.append(e)
    used = {e['id'] for e in keep if e['kind'] == 'new'}
    for p in at['points']: p['ok'] = p['id'] in used   # R2 に上げるのは使う点だけ
    json.dump(at, open(at_path, 'w', encoding='utf-8'), indent=1)
    pend_only = [{'room': s['room']['id'], **{k: s['pending'][k] for k in ('id', 'x', 'z', 'yaw')}} for s in slots if s.get('pending') and not s['final']]
    if any(p for p in at['points'] if not p.get('done')):
        q = 'F:/Codex/pvgen/tour/photomap/_log/render_queue.txt'
        lines = set(open(q, encoding='utf-8').read().split()) if os.path.exists(q) else set()
        if at_path not in lines: open(q, 'a', encoding='utf-8').write(at_path + chr(10))
    json.dump({'v': 1, 'key': at['key'], 'set': at.get('set'), 'points': keep, 'pending': pend_only}, open(f'{d}/centre.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    log = {'dir': d, 'rooms': len(pr['rooms']), 'scanned': sum(r['scanned'] for r in pr['rooms']), 'unscanned': pr['unscanned'], 'noWall': pr.get('noWall', []), 'hatched': pr.get('hatched', []), 'thinFloor': pr.get('thinFloor', []), 'notWalked': pr.get('notWalked', []), 'voids': pr.get('voids', []),
           'points': len(keep), 'new': sum(1 for e in keep if e['kind'] == 'new'),
           'pending': sum(1 for s in slots if s.get('pending')), 'pendingNoStandIn': len(pend_only),
           'blurRooms': [{'room': s['room']['id'], 'area': s['room']['area'], 'tries': len(s['verdicts']), 'blurTries': s.get('blurTries', 0), 'reason': str(s['verdicts'][-1].get('reason', ''))[:80] if s['verdicts'] else ''}
                         for s in slots if not s['final'] and s['verdicts'] and sum(map(is_blur, s['verdicts'])) >= max(1, len(s['verdicts']) - 1) and s.get('blurTries', 0) >= 3],
           'failRooms': [{'room': s['room']['id'], 'area': s['room']['area'], 'tries': len(s['verdicts']), 'retries': s.get('blurTries', 0), 'reasons': [str(v.get('reason', ''))[:60] for v in s['verdicts']][-4:]} for s in slots if not s['final']],
           'slots': [{'room': s['room']['id'], 'area': s['room']['area'], 'final': s['final'] and s['final']['id'], 'blurTries': s.get('blurTries', 0), 'verdicts': s['verdicts']} for s in slots]}
    print(f"centre {d}: rooms {log['rooms']} scanned {log['scanned']} points {log['points']} new {log['new']} pending {log['pending']} (代替なし {log['pendingNoStandIn']}) dropped {sum(1 for s in slots if not s['final'])}")
    return pid, log

CLAIM = None
def claim_targets(dirs):
    # 同じ図面・同じ階（1 枚の図にまとまる）のシーンどうしで、同じ部屋の真ん中を二重に撮らない:
    # 1m 以内の真ん中は、その部屋の床がよく写っている（cover が高い）シーンが受け持つ（既存の地点が使える方を少し優先）
    claims = {}
    for d in dirs:
        reg_name = 'reg_merged.json' if os.path.exists(f'{d}/reg_merged.json') else 'reg.json'
        if REPLAN or not os.path.exists(f'{d}/planrooms.json'):
            subprocess.run([sys.executable, f'{HERE}/photomap-planrooms_v2.py', d, f'--reg={reg_name}'], check=True)
        reg = json.load(open(f'{d}/{reg_name}', encoding='utf-8')); pr = json.load(open(f'{d}/planrooms.json', encoding='utf-8'))
        gk = (os.path.normpath(os.path.join(d, reg['blueprint'])).lower(), reg.get('floor') or '')
        lst = claims.setdefault(gk, [])
        for room in pr['rooms']:
            if not room['scanned']: continue
            for t in room['targets']:
                sc = room['cover'] + (0.15 if t['node'] else 0)
                # 第4回の審査（babel ウッドデッキ）: 同じシーンの隣り合う別の部屋の真ん中（0.69m）まで 1 つにまとめて部屋が消えていた → まとめるのは別のシーンどうしだけ
                hit = next((c for c in lst if c['who'][0] != d and math.hypot(c['u'] - t['u'], c['v'] - t['v']) < pr['ppm'] * 1.0), None)
                if hit is None: lst.append({'u': t['u'], 'v': t['v'], 'sc': sc, 'who': (d, t['u'], t['v'])})
                elif sc > hit['sc']: hit.update(sc=sc, who=(d, t['u'], t['v']))
    return {c['who'] for lst in claims.values() for c in lst}

def is_area(d):   # 周辺地図（photomap-osm.py の OSM 図）は対象外（建物が部屋になる）。photomap-rooms.py の方式で
    r = json.load(open(f'{d}/reg.json', encoding='utf-8'))
    return r.get('floor') == '周辺地図' or os.path.exists(os.path.join(os.path.dirname(os.path.normpath(os.path.join(d, r['blueprint']))), '0_meta.json'))

def dedupe_rooms(dirs, by_pid):
    # 第1回の審査: 同じ図面・同じ階を複数のシーンが受け持つと、部屋分けが少しずつ違うため 1 部屋に 2 点入ることがあった（modello LDK・residence 洋室・makinoshita 廊下）。
    # 図の上で、ある点の部屋（45㎡ 以下）の中に別の点が入っていたら、その部屋の真ん中に近い方だけ残す
    groups = {}
    for d in dirs:
        rn = 'reg_merged.json' if os.path.exists(f'{d}/reg_merged.json') else 'reg.json'
        reg = json.load(open(f'{d}/{rn}', encoding='utf-8'))
        if not os.path.exists(f'{d}/centre.json'): continue
        gk = (os.path.normpath(os.path.join(d, reg['blueprint'])).lower(), reg.get('floor') or '')
        groups.setdefault(gk, []).append((d, reg, json.load(open(f'{d}/centre.json', encoding='utf-8')), json.load(open(f'{d}/planrooms.json', encoding='utf-8'))))
    for items in groups.values():
        pts = []
        for d, reg, c, pr in items:
            Mx = reg['world2img']; rooms = {r['id']: r for r in pr['rooms']}
            for e in c['points']:
                u = Mx[0][0] * e['x'] + Mx[0][1] * e['z'] + Mx[0][2]; v = Mx[1][0] * e['x'] + Mx[1][1] * e['z'] + Mx[1][2]
                pts.append({'d': d, 'e': e, 'u': u, 'v': v, 'room': rooms.get(e['room'])})
        drop = set()
        for i, a in enumerate(pts):
            R = a['room']
            if not R or R['area'] > 45 or not R.get('targets'): continue
            poly = np.array(R['poly'], np.float32); t = R['targets'][0]
            for j, b in enumerate(pts):
                if i == j or (a['d'], a['e']['id']) in drop or (b['d'], b['e']['id']) in drop: continue
                if a['d'] == b['d'] and a['e']['room'] == b['e']['room']: continue   # 同じシーンの同じ部屋の複数点（広い部屋）は planrooms が決めたもの
                if cv2.pointPolygonTest(poly, (float(b['u']), float(b['v'])), False) < 0: continue
                da, db = math.hypot(a['u'] - t['u'], a['v'] - t['v']), math.hypot(b['u'] - t['u'], b['v'] - t['v'])
                drop.add((b['d'], b['e']['id']) if db >= da else (a['d'], a['e']['id']))
        for d, reg, c, pr in items:
            keep = [e for e in c['points'] if (d, e['id']) not in drop]
            if len(keep) < len(c['points']):
                print(f'dedupe {d}: 同じ部屋の重複 {len(c["points"]) - len(keep)} 点を外した')
                c['points'] = keep; json.dump(c, open(f'{d}/centre.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
                for lg in by_pid.get(d.split('/all/')[1].split('/')[0], []):
                    if lg['dir'] == d: lg['dedupe'] = sorted(i for dd, i in drop if dd == d); lg['points'] = len(keep)

if __name__ == '__main__':
    skip = [d for d in dirs if is_area(d)]
    if skip: print('周辺地図は対象外:', *skip)
    dirs = [d for d in dirs if d not in skip]
    CLAIM = claim_targets(dirs)
    by_pid = {}
    for d in dirs:
        pid, log = run_dir(d)
        by_pid.setdefault(pid, []).append(log)
    dedupe_rooms(dirs, by_pid)
    for pid, logs in by_pid.items():
        f = f'{dirs[0].split("/all/")[0]}/all/{pid}/ai_points.json'
        old = json.load(open(f, encoding='utf-8')) if os.path.exists(f) else {}
        for lg in logs: old[lg['dir']] = lg
        json.dump(old, open(f, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
