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
- inRoom=false: 写真が図面の緑の範囲の部屋に見えない（明らかに別の部屋・屋外・階段の途中・天井裏や床下）
- onStairs: 階段の段の途中（踊り場・上端・下端は可）
- 空中: D に床がはっきり写らない（吹き抜けの上など）
似た眺め・地味・家具が手前に写るのは外さない。
bestFace: その部屋が一番よく分かる（奥行きがあり、床と家具・部屋の特徴が広く見える）方向を L/F/R/B から 1 つ。窓や壁の大写し・隅向き・にじんだ方向は選ばない。

答えは JSON だけ:
{{"ok":true,"reason":"だめな時だけ短く日本語で","inRoom":true,"insideObject":false,"broken":false,"onStairs":false,"bestFace":"F","room":"写真から分かる部屋の種類（例: 会議室・キッチン・トイレ）"}}"""

def ai_check(work, pid, extra=''):
    prompt = PROMPT.format(dir=work.replace('\\', '/'), pid=pid) + extra
    errs = []
    r = subprocess.run(['claude.cmd' if os.name == 'nt' else 'claude', '-p', '--model', 'fable', '--output-format', 'json', '--allowedTools', 'Read', '--add-dir', work],
                       input=prompt, capture_output=True, text=True, encoding='utf-8', timeout=900, shell=os.name == 'nt')
    txt = None
    try:
        o = json.loads(r.stdout); txt = o.get('result') if not o.get('is_error') else None
        if txt is None: errs.append('claude: ' + str(o.get('result'))[:120])
    except Exception as e: errs.append('claude: ' + (r.stderr or r.stdout or str(e))[:120])
    by = 'claude:fable'
    if txt is None:
        out = os.path.join(work, f'codex-{pid}.txt')
        r = subprocess.run(['codex.cmd' if os.name == 'nt' else 'codex', 'exec', '--skip-git-repo-check', '-m', 'gpt-6-astra', '-s', 'read-only', '-o', out,
                            '-i', os.path.join(work, f'{pid}.jpg'), '-i', os.path.join(work, f'{pid}_plan.jpg'), '-'],
                           input=prompt, capture_output=True, text=True, encoding='utf-8', timeout=1200, shell=os.name == 'nt', cwd=work)
        if os.path.exists(out): txt = open(out, encoding='utf-8').read(); os.remove(out); by = 'codex:gpt-6-astra'
        else: errs.append('codex: ' + (r.stderr or '')[-120:])
    m = re.search(r'\{[\s\S]*\}', txt or '')
    if not m: return {'ok': None, 'error': ' / '.join(errs) or 'JSON なし', 'by': by}
    try: j = json.loads(m.group(0))
    except Exception as e: return {'ok': None, 'error': 'JSON が読めない ' + str(e)[:60], 'by': by}
    j['by'] = by
    # 項目どうしの食い違いは厳しい方に
    if j.get('insideObject') or j.get('broken') or j.get('onStairs') or j.get('inRoom') is False: j['ok'] = False
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

def pick_face(room, c, ai_o, M):
    # 第1回の審査: 最初の向きが壁・扉・窓の大写しになる点が多かった → 図面の部屋の中で、4 方向のうち一番遠くまで見通せる向き。
    # AI の bestFace がその 85% 以上見通せるなら AI を優先（設備が見える向きを選んでいることがある）
    poly = np.array(room['poly'], np.float32); A2 = np.array(M, float)[:, :2]
    def ray(o):
        a = c['yaw'] - math.radians(o); d = A2 @ np.array([math.sin(a), math.cos(a)]); d = d / (np.linalg.norm(d) or 1); L = 0
        while cv2.pointPolygonTest(poly, (float(c['u'] + d[0] * L), float(c['v'] + d[1] * L)), False) >= 0 and L < 5000: L += 2
        return L
    lens = {o: ray(o) for o in (0, 90, 180, -90)}
    best = max(lens, key=lens.get)
    return ai_o if lens.get(ai_o, 0) >= 0.85 * lens[best] else best

def deep_yaw(room, u, v, M):
    # 部屋の範囲の中で一番遠くまで見通せる向き（図面の画素で 32 方向に線を伸ばす）→ 世界の yaw
    poly = np.array(room['poly'], np.float32)
    best = (0, 0.0)
    for k in range(32):
        t = 2 * math.pi * k / 32; du, dv = math.cos(t), math.sin(t); L = 0
        while cv2.pointPolygonTest(poly, (float(u + du * L), float(v + dv * L)), False) >= 0 and L < 5000: L += 2
        if L > best[1]: best = (t, L)
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
    work = f'{d}/centre'; os.makedirs(work, exist_ok=True)
    at_path = f'{work}/at.json'
    at = json.load(open(at_path, encoding='utf-8')) if os.path.exists(at_path) else {'scene': td['scene'], 'key': td['key'], 'points': []}
    have = {p['id']: p for p in at['points']}
    nid = [800 + len(at['points'])]
    def new_point(x, z, fy, yaw):
        for q in at['points']:   # やり直しのときは同じ位置の撮影済みを使う
            if abs(q['x'] - x) < 0.05 and abs(q['z'] - z) < 0.05: return q
        nid[0] += 1; p = {'id': f'n{nid[0]}', 'x': x, 'y': round(fy + EYE, 3), 'z': z, 'yaw': round(yaw, 4)}
        at['points'].append(p); have[p['id']] = p; return p
    def render():
        if NOREND: return
        todo = [p for p in at['points'] if not p.get('done')]
        if not todo: return
        json.dump(at, open(at_path, 'w', encoding='utf-8'), indent=1)
        r = subprocess.run(['node', 'scripts/bake-pano.mjs', '--at', at_path, '--out', work], cwd=REPO, capture_output=True, text=True, encoding='utf-8')
        open(f'{work}/render.log', 'a', encoding='utf-8').write(r.stdout + r.stderr)
        at.update(json.load(open(at_path, encoding='utf-8'))); have.update({p['id']: p for p in at['points']})
    def node_strip(n_id):
        if os.path.exists(f'{work}/{n_id}.jpg'): return
        files = {k: get(f'{ORIGIN}/api/pano/{td["key"]}-g{g["set"]}-{n_id}-{k}.s.jpg', True) for k in 'lfrbd'}
        strip_from(files, f'{work}/{n_id}.jpg', n_id)
    def pick_node(s):   # 部屋の中の既存の地点のうち、真ん中に一番近いもの（まだ試していないもの）
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
            if t['node'] and t['node'] in gn:
                n = gn[t['node']]; u, v = t['u'], t['v']
                cand = {'kind': 'node', 'id': n['id'], 'x': n['pos']['x'], 'z': n['pos']['z'], 'u': u, 'v': v, 'yaw': n.get('yaw', 0)}
            else:
                yaw = deep_yaw(room, t['u'], t['v'], M)
                p = new_point(t['x'], t['z'], t['floorY'], yaw)
                cand = {'kind': 'new', 'id': p['id'], 'x': t['x'], 'z': t['z'], 'u': t['u'], 'v': t['v'], 'yaw': yaw}
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
        if any(w in FLOOR for w in ('屋上', 'ルーフ', 'テラス', 'バルコニー')):
            t += '屋外の区画なので、空・周りの建物が写るのは正常。床が屋根材・デッキでも可。'
        return t
    for rnd in range(1, ROUNDS + 2):
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
                if v.get('ok') is True: s['final'] = dict(s['cand'], o=pick_face(s['room'], s['cand'], FACE_O.get(str(v.get('bestFace', 'F')).upper()[:1], 0), M))
                else: s['tried'].append(s['cand']); s['cand'] = None
        # 次の候補: 控えの位置（撮り直し）→ 最後は部屋の中の既存の地点
        for s in slots:
            if s['final'] is not None or s['cand']: continue
            room = s['room']
            alts = [a for a in room.get('alts', []) if all(math.hypot(a[0] - t['u'], a[1] - t['v']) > 0.6 * pr['ppm'] for t in s['tried'])]
            if rnd < ROUNDS and alts and not (NOREND and s.get('pending')):
                a = alts[0]; yaw = deep_yaw(room, a[0], a[1], M)
                p = new_point(a[2], a[3], a[4], yaw)
                s['cand'] = {'kind': 'new', 'id': p['id'], 'x': a[2], 'z': a[3], 'u': a[0], 'v': a[1], 'yaw': yaw}
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
    keep = []
    for e in pts:
        if all(math.hypot(e['x'] - k['x'], e['z'] - k['z']) >= 1.2 for k in keep): keep.append(e)
    used = {e['id'] for e in keep if e['kind'] == 'new'}
    for p in at['points']: p['ok'] = p['id'] in used   # R2 に上げるのは使う点だけ
    json.dump(at, open(at_path, 'w', encoding='utf-8'), indent=1)
    pend_only = [{'room': s['room']['id'], **{k: s['pending'][k] for k in ('id', 'x', 'z', 'yaw')}} for s in slots if s.get('pending') and not s['final']]
    if any(p for p in at['points'] if not p.get('done')):
        q = 'F:/Codex/pvgen/tour/photomap/_log/render_queue.txt'
        lines = set(open(q, encoding='utf-8').read().split()) if os.path.exists(q) else set()
        if at_path not in lines: open(q, 'a', encoding='utf-8').write(at_path + chr(10))
    json.dump({'v': 1, 'key': at['key'], 'set': at.get('set'), 'points': keep, 'pending': pend_only}, open(f'{d}/centre.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    log = {'dir': d, 'rooms': len(pr['rooms']), 'scanned': sum(r['scanned'] for r in pr['rooms']), 'unscanned': pr['unscanned'], 'voids': pr.get('voids', []),
           'points': len(keep), 'new': sum(1 for e in keep if e['kind'] == 'new'),
           'pending': sum(1 for s in slots if s.get('pending')), 'pendingNoStandIn': len(pend_only),
           'slots': [{'room': s['room']['id'], 'area': s['room']['area'], 'final': s['final'] and s['final']['id'], 'verdicts': s['verdicts']} for s in slots]}
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
                hit = next((c for c in lst if math.hypot(c['u'] - t['u'], c['v'] - t['v']) < pr['ppm'] * 1.0), None)
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
