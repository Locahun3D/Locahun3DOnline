# -*- coding: utf-8 -*-
"""design-fb-audit.py — 本人のデザインFBが回帰していないかをコードで機械検査する。

使い方:  python scripts/design-fb-audit.py     (リポジトリルートで。NGがあれば exit 1)

⚠ ここにある1行1行は、本人が実際に指摘し・修正し・確認した決定の固定化。
   「なぜこの検査があるのか」は各行の説明と F:\\Claude\\docs\\デザインFB台帳_locahun3d.md 参照。
   仕様を意図的に変えるときは、この検査も同じコミットで更新すること（黙って外さない）。
   本番DOMでしか確認できない項目（幅・影・色の実測）は台帳側の手順に記載。
"""
import io, json, re, shutil, subprocess, sys, urllib.request

CHECKS = [
    # ⚠「復活させない」系のパターンは、撤去の経緯を書いたコメントに反応しないよう
    #   描画されるJSX側だけに一致する形で書く（>text< や本文の全文一致）。
    # (説明, ファイル, 正規表現, True=存在すべき / False=存在してはならない)
    ("削除理由パネルはライト面 bg-bg + 左赤帯（黒い浮島にしない 2026-08-13）",
     "src/components/admin/accounts-admin.tsx", r"border-l-red-600 bg-bg", True),
    ("削除パネルの旧暗色 bg-[#1a1414] を復活させない",
     "src/components/admin/accounts-admin.tsx", r"bg-\[#1a1414\]", False),
    ("アカウント行グリッドは minmax で1文字縦積みを防止（2026-08-13）",
     "src/components/admin/accounts-admin.tsx", r"minmax\(16rem,1fr\)", True),
    ("アカウント削除は理由必須（サーバー側でも弾く）",
     "src/lib/admin-actions.ts", r"if \(!reason\) return", True),
    ("アナリティクスは 閲覧/サブスク/物件購入 のタブ構成",
     "src/app/admin/analytics/page.tsx", r"物件購入", True),
    ("サイドバーにギフトコードの独立リンクを復活させない（href として）",
     "src/app/admin/layout.tsx", r'href="[^"]*gift-codes', False),
    ("エディターのステップは7（11→7統合 2026-08-13）", "STEPS7", None, None),
    ("録画ウォームアップは常時+3秒（チェックボックス廃止）",
     "src/components/admin/property-editor.tsx", r"captureWarmupMs = 3000", True),
    ("EN入力欄はエディターから非表示（値は保持）",
     "src/components/admin/property-editor.tsx", r"const showEn = false", True),
    ("3DGS削除に確認ダイアログ",
     "src/components/admin/property-editor.tsx", r"」の3DGSデータを削除します", True),
    ("公開設定に Danger zone を復活させない（2026-08-13 非表示化）",
     "src/components/admin/property-editor.tsx", r"Danger zone\n", False),
    ("仕様・設備の見出しは「実績・特徴・タグ」1枚（空見出し2枚に戻さない）",
     "src/components/admin/property-editor.tsx", r'title="実績・特徴・タグ"', True),
    ("アカウント紐付けパネルは isAdmin 限定描画",
     "src/components/admin/property-editor.tsx",
     r'\{isAdmin && \(\n\s*<div className="border-t border-line pt-5 mt-4">\n\s*<PropertyOwnerPanel', True),
    ("ウォークスルー外枠に group（無いとログイン済みでオーバーレイが出ない 2026-08-14）",
     "src/components/viewer-gate.tsx",
     r'className="group relative aspect-video w-full border border-line overflow-hidden bg-\[#141414\]"', True),
    ("トークン単発購入ボタンを復活させない（2026-08-13 全廃）",
     "src/components/viewer-gate.tsx", r"buyTokenPackAction", False),
    ("カート投入は規約同意ガード（処理側）",
     "src/components/data-sale-panel.tsx", r"else if \(agreedTerms\)", True),
    ("＋カートは同意まで disabled（UI側）",
     "src/components/data-sale-panel.tsx", r"disabled=\{!agreedTerms\}", True),
    ("3DGS行の開閉キーはデータ側id（field.id は setValue のたび再生成される）",
     "src/components/admin/property-editor.tsx", r"watch\(`splatItems\.\$\{idx\}\.id`\) \|\| field\.id", True),
    ("自動保存成功時に router.refresh を呼ばない（スクロールが先頭へ戻る）",
     "src/components/admin/property-editor.tsx", r"router\.refresh\(\)[\s\S]{0,80}baseUpdatedAtRef", False),
    ("離脱時に待機中の自動保存を流し切る（B-8: 入力が無言で消える）",
     "src/components/admin/property-editor.tsx", r"beforeunload", True),
    # ⚠ 2026-08-16: /about はトップ(/)の #service セクションへ統合され、
    #   src/app/about/page.tsx は redirect だけの薄いファイルになった。
    #   検査対象を移設先 src/app/page.tsx へ移す（項目は落とさない）。
    ("サービスについて（トップ #service）は 07様式のCSS（.about07 スコープ）を使う",
     "src/app/page.tsx", r"about07", True),
    ("07の生青 #155eef をコードに直書きしない（accentトークン経由）",
     "src/app/page.tsx", r"#155eef;", False),
    ("カタログの CATALOG 見出しを復活させない（2026-08-13 撤去）",
     "src/components/properties/catalog-client.tsx", r">Find a Location<", False),
    ("カタログの募集枠を復活させない",
     "src/components/properties/catalog-client.tsx", r"掲載スタジオ募集中 —", False),
    ("類似スタジオ0件時の破線プレースホルダを復活させない",
     "src/components/property-detail-view.tsx", r"現在、類似スタジオの掲載準備中です", False),
    ("フッターは theme-online（白地で白文字に潰れない 2026-08-13）",
     "src/components/site-footer.tsx", r"theme-online", True),
    ("フッターの導線は掲載依頼（持ち込みスキャン表記に戻さない）",
     "src/components/site-footer.tsx", r"掲載依頼", True),
    # ⚠ 2026-09-03「スマホでスクロールするとヘッダーが貫通する」（2026-08-12にも同報告）。
    #   原因は sticky ヘッダーの backdrop-filter（iOS実機のみ再描画遅延で透ける。
    #   さらに fixed バックストップは backdrop-filter が containing block になり無効だった）。
    #   横iPadも1024pxを超える。幅による例外を作らず全幅で不透明・blur無し。
    ("ヘッダーは全幅すりガラス禁止（横iPadにもPC用blurを適用しない）",
     "src/components/site-header.tsx", r'className="[^"]*backdrop-blur', False),
    ("ヘッダー地は全幅不透明 bg-bg（半透明の幅別例外を作らない）",
     "src/components/site-header.tsx", r'className="[^"]*bg-bg/', False),
    # ⚠ 2026-09-20「スマホでスクロールするとヘッダーの上が抜ける。直しても再発する」の根本対策。
    #   ヘッダーの真上に同色の帯（::before）を常に貼り、上端がずれても本文が見えない構造にした。消さないこと。
    ("ヘッダーの真上に同色の帯（before:bottom-full + before:bg-bg）がある",
     "src/components/site-header.tsx", r'className="[^"]*before:bottom-full[^"]*before:bg-bg', True),
    # ⚠ 2026-09-21「日本語の段落デザインまだ治ってない」。原因は2つあり、どちらも再発しやすい:
    #   (a) 概要本文が `whitespace-pre-line`（元の改行）と句点ごとの <br> の二重描画で、
    #       段落の切れ目だけ2〜3行ぶん空き、文の切れ目は詰まる不揃いな縦の間になっていた。
    #   (b) スマホ幅だけ body の字間を 0.02em に詰めており、本文が詰まって読みにくかった。
    #   ここは静的検査。実測は下の typography_live_check()（scripts/typography-audit.mjs）が担当する。
    ("本文の字間は全幅 0.04em（globals.css の body）",
     "src/app/globals.css", r"letter-spacing: 0\.04em", True),
    # 宣言（末尾の `;` まで）に一致させる。globals.css 側の「なぜ撤去したか」を書いた
    # コメントには `;` を付けていないので、経緯コメントには反応しない。
    ("スマホ幅で本文の字間を詰める指定を復活させない（0.02em）",
     "src/app/globals.css", r"letter-spacing: 0\.02em;", False),
    ("本文の行間は 1.8（globals.css の body）",
     "src/app/globals.css", r"line-height: 1\.8;", True),
    ("概要は空行で段落に割ってから1文1行にする（paragraphs → <p> → sentenceLines）",
     "src/components/property-detail-view.tsx",
     r"paragraphs\(s\.body\)\.map\([\s\S]{0,120}sentenceLines\(para\)", True),
    ("概要本文で whitespace-pre-line と句点ごとの <br> を併用しない（間が二重に空く）",
     "src/components/property-detail-view.tsx",
     # className は data 属性の前にも後ろにも書けるので、前後どちらも見る。
     r"whitespace-pre-line[\s\S]{0,200}data-property-overview-body"
     r"|data-property-overview-body[\s\S]{0,200}whitespace-pre-line", False),
]


def typography_live_check():
    """実ブラウザでの本文タイポグラフィ実測（scripts/typography-audit.mjs を呼ぶ）。

    静的検査だけだと「CSSは正しいが、別の指定に上書きされて実際は詰まっている」を
    取り逃がす（実際 2026-09-21 の字間 0.02em はそれで見落とされていた）。
    開発サーバーが動いていれば実測し、動いていなければ SKIP と明示する
    （OK とは数えない＝黙って通らない）。サーバーが動いているのに1つも測れなければ
    typography-audit.mjs 側が失敗を返すので、ここでも NG になる。

    戻り値: (ok件数, ng件数, skipしたか)
    """
    base = None
    for port in (3000, 3001):
        url = f"http://localhost:{port}/"
        try:
            with urllib.request.urlopen(url, timeout=3) as r:
                if r.status == 200:
                    base = f"http://localhost:{port}"
                    break
        except Exception:
            continue
    if base is None:
        print("SKIP  本文タイポグラフィの実測（localhost:3000/3001 に開発サーバーが無い。"
              "`npm run dev` を立ててから再実行すること）")
        return 0, 0, True

    node = shutil.which("node")
    if not node:
        print("NG    本文タイポグラフィの実測（node が見つからない）")
        return 0, 1, False

    # 公開中の物件を1件選ぶ（概要本文があるページでないと測れない）。
    path = "/properties/wh-002"
    try:
        data = json.load(io.open("data/properties.json", encoding="utf-8"))
        pub = [p for p in data.get("properties", []) if p.get("status") == "published"]
        if pub:
            path = "/properties/" + pub[0]["id"]
    except Exception:
        pass

    try:
        proc = subprocess.run(
            [node, "scripts/typography-audit.mjs", "--base", base, "--paths", path, "--json"],
            capture_output=True, text=True, encoding="utf-8", timeout=300)
        result = json.loads(proc.stdout)
    except Exception as e:
        print(f"NG    本文タイポグラフィの実測（typography-audit.mjs を実行できない: {e}）")
        return 0, 1, False

    if result.get("ok"):
        print(f"OK    本文タイポグラフィの実測（{base}{path} ・{len(result.get('blocks', []))}ブロック"
              "／段落の間隔・行間・字間）")
        return 1, 0, False
    for p in result.get("problems", []):
        print("NG    本文タイポグラフィの実測:", p)
    return 0, max(1, len(result.get("problems", []))), False


ok = fail = 0
for desc, path, pat, expect in CHECKS:
    if path == "STEPS7":
        s = io.open("src/components/admin/property-editor.tsx", encoding="utf-8").read()
        m = re.search(r"const STEPS[^=]*=\s*\[([\s\S]*?)\]", s)
        n = len(re.findall(r"\{ id:", m.group(1))) if m else -1
        good = n == 7
        print(("OK " if good else "NG "), desc, f"(steps={n})")
    else:
        try:
            s = io.open(path, encoding="utf-8").read()
        except FileNotFoundError:
            print("NG ", desc, f"(ファイル消失: {path})"); fail += 1; continue
        good = bool(re.search(pat, s)) == expect
        print(("OK " if good else "NG "), desc)
    ok += good; fail += (not good)

t_ok, t_fail, t_skipped = typography_live_check()
ok += t_ok
fail += t_fail

print(f"\n{ok} OK / {fail} NG" + ("（＋実測1件はSKIP）" if t_skipped else ""))
sys.exit(1 if fail else 0)
