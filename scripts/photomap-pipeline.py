# 物件ページ「位置から見る」を公式図面で作る一連の作業（2026-11-26）
#   本人「作業自動化できるようにしておいてね」「スキャンは部屋ごとだけど別々にする必要ないよね」→ 同じ図面・同じ階のシーンは 1 枚の図にまとめる。
#
#   python scripts/photomap-pipeline.py <物件id ...> [--steps=fetch,regcand,rooms,build] [--upload] [--d1]
#     fetch   : シーンごとにスキャン → 点（pts.npz）→ 真上の図（scan.png）→ 部屋の点 → 最初の向き（作業場の stageA.py）
#     regcand : 位置合わせが済んでいない作業 dir に、自動の候補（重なり率の上位 3 案の重ね図）を作る。
#               ★ 候補から正しいものを選ぶ・合わなければ壁の角で合わせる、は目で見る工程（REG_BRIEF.md を担当に渡す）。
#               reg.json か reg_none.txt ができるまで、その dir は図に出ない
#     rooms   : 位置合わせ済みの dir で、部屋の点を選び直す（図面の建物の中・全部の空間に 1 点・36㎡ ごとに +1・最初の向き）
#     build   : 同じ図面・同じ階（reg.json の floor、無ければ crop が重なるもの）をまとめ、crop を合わせて 1 枚の図にし、
#               photomap-build.mjs で all/<id>/pm.json と確認図 pm_preview.jpg を作る
#     --upload: 図の画像を R2 に置く（build のとき）。--d1: pm.json を本番 D1 の photoMaps に書く（--upload と一緒に使う）
#   作業場: F:/Codex/pvgen/tour/photomap（all/<id>/<シーン>/、inventory.json、stageA.py、rerooms.py、REG_BRIEF.md）
import sys, os, json, glob, subprocess
import numpy as np, cv2

WS = 'F:/Codex/pvgen/tour/photomap'; HERE = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.dirname(HERE)
args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = lambda k, d=None: next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith(f'--{k}=')), d)
STEPS = opt('steps', 'fetch,regcand,rooms,build').split(',')
UPLOAD, D1 = '--upload' in sys.argv, '--d1' in sys.argv
if D1 and not UPLOAD: sys.exit('--d1 は --upload と一緒に（図の画像が R2 に無いと本番で表示できない）')
inv = {p['id']: p for p in json.load(open(f'{WS}/inventory.json', encoding='utf-8'))}
py = sys.executable
run = lambda cmd, **kw: subprocess.run(cmd, check=True, **kw)

def units(pid):
    # 作業 dir（scan.png があるもの。階分けは f<k>）
    return sorted({os.path.dirname(p).replace('\\', '/') for p in glob.glob(f'{WS}/all/{pid}/**/scan.png', recursive=True)})

def scene_of(d, pid):
    rel = d.split(f'/all/{pid}/')[1].split('/'); return int(rel[0])

for pid in args:
    print('==', pid)
    if 'fetch' in STEPS:
        run([py, f'{WS}/stageA.py', pid], cwd=WS)
    if 'regcand' in STEPS:
        bps = sorted(glob.glob(f'{WS}/all/{pid}/bp/*.img'))
        for d in units(pid):
            if os.path.exists(f'{d}/reg.json') or os.path.exists(f'{d}/reg_none.txt'): continue
            if not bps: open(f'{d}/reg_none.txt', 'w', encoding='utf-8').write('公式図面なし\n'); continue
            for k, bp in enumerate(bps):
                subprocess.run([py, f'{HERE}/photomap-regiou.py', d, bp, f'{d}/auto{k}'], capture_output=True)
            print('  要確認（位置合わせ）', d, '→ 候補 auto*_cand*.png。REG_BRIEF.md の手順で reg.json か reg_none.txt を作る')
    regdirs = [d for d in units(pid) if os.path.exists(f'{d}/reg.json')]
    if 'rooms' in STEPS and regdirs:
        run([py, f'{WS}/rerooms.py', *regdirs], cwd=WS)
    if 'build' in STEPS and regdirs:
        p = inv.get(pid, {}); bplab = {f'{WS}/all/{pid}/bp/{k}.img': (b.get('label') or '') for k, b in enumerate(p.get('blueprints', []))}
        groups = []   # [{bp, floor, crop, dirs}]
        for d in sorted(regdirs, key=lambda d: scene_of(d, pid)):
            r = json.load(open(f'{d}/reg.json', encoding='utf-8'))
            if not json.load(open(f'{d}/{r.get("select", "rooms.json")}')).get('select'): continue   # 図面の中に点が無いシーン
            bp = os.path.normpath(os.path.join(d, r['blueprint'])).replace('\\', '/')
            c = r.get('crop') or [0, 0, *cv2.imread(bp).shape[1::-1]]
            def same(gr):
                if gr['bp'] != bp: return False
                if r.get('floor') or gr['floor']: return r.get('floor') == gr['floor']
                a, b = gr['crop'], c; ix = max(0, min(a[2], b[2]) - max(a[0], b[0])) * max(0, min(a[3], b[3]) - max(a[1], b[1]))
                return ix >= 0.3 * min((a[2] - a[0]) * (a[3] - a[1]), (b[2] - b[0]) * (b[3] - b[1]))
            g = next((gr for gr in groups if same(gr)), None)
            if g: g['crop'] = [min(g['crop'][0], c[0]), min(g['crop'][1], c[1]), max(g['crop'][2], c[2]), max(g['crop'][3], c[3])]; g['dirs'].append((d, r))
            else: groups.append({'bp': bp, 'floor': r.get('floor'), 'floorEn': r.get('floorEn'), 'crop': list(c), 'dirs': [(d, r)]})
        specs = []
        nbp = len({g['bp'] for g in groups})
        dup = len(groups) > 1 and not all(g['floor'] for g in groups)
        for g in groups:
            lab = g['floor'] or (bplab.get(g['bp']) if nbp > 1 else '') or '平面図'
            labEn = g['floorEn'] or g['floor'] or 'Floor plan'
            if dup and not g['floor']:   # 階の名前が無い図が 2 枚以上 → シーン名で見分ける（reg.json に floor を書くのが本筋）
                sc = (p.get('scenes') or [{}] * 99)[scene_of(g['dirs'][0][0], pid)]; lab = sc.get('label') or lab; labEn = sc.get('labelEn') or labEn
            for d, r in g['dirs']:
                m = dict(r, crop=[int(v) for v in g['crop']]); json.dump(m, open(f'{d}/reg_merged.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
                specs += ['--map', f'{lab}|{labEn}|{d}/td.json|reg={d}/reg_merged.json']
        if not specs: print('  図に出す点なし'); continue
        out = f'{WS}/all/{pid}/pm.json'
        run(['node', 'scripts/photomap-build.mjs', '--property', pid, *specs, '--out', out, *(['--upload'] if UPLOAD else [])], cwd=REPO)
        # 確認図: 図ごとに点と向き
        pm = json.load(open(out, encoding='utf-8')); tiles = []
        for mp in pm:
            im = cv2.imread(f'{REPO}/artifacts/photomap/{os.path.basename(mp["image"]["src"])}')
            if im is None: continue
            H, W = im.shape[:2]
            for q in mp['points']:
                x, y = int(q['x'] * W), int(q['y'] * H); a = np.radians(q['yaw']); r_ = max(7, W // 90)
                cv2.circle(im, (x, y), r_, (60, 60, 230), -1); cv2.arrowedLine(im, (x, y), (int(x + np.sin(a) * r_ * 3), int(y - np.cos(a) * r_ * 3)), (60, 60, 230), max(2, r_ // 3), tipLength=0.4)
            cv2.putText(im, f'{mp["labelEn"]} ({len(mp["points"])})', (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (200, 0, 0), 2)
            s = 700 / max(H, W); tiles.append(cv2.resize(im, (int(W * s), int(H * s))))
        if tiles:
            h = max(t.shape[0] for t in tiles); cv2.imwrite(f'{WS}/all/{pid}/pm_preview.jpg', np.hstack([cv2.copyMakeBorder(t, 0, h - t.shape[0], 0, 4, cv2.BORDER_CONSTANT, value=(255, 255, 255)) for t in tiles]))
        print('  maps', [(m['label'], len(m['points'])) for m in pm], '→', out)
        if D1:
            sql = f'{WS}/_log/pm_{pid}.sql'; js = json.dumps(pm, ensure_ascii=False).replace("'", "''")
            open(sql, 'w', encoding='utf-8').write(f"update properties set data=json_set(data,'$.photoMaps',json('{js}')) where id='{pid}';\n")
            run('npx wrangler d1 execute locahun3d-db --remote --file ' + sql, shell=True, cwd=REPO, env=dict(os.environ, MSYS_NO_PATHCONV='1'))
            print('  D1 updated', pid)
