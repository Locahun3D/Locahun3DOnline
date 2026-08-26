# -*- coding: utf-8 -*-
"""design-fb-audit.py — 本人のデザインFBが回帰していないかをコードで機械検査する。

使い方:  python scripts/design-fb-audit.py     (リポジトリルートで。NGがあれば exit 1)

⚠ ここにある1行1行は、本人が実際に指摘し・修正し・確認した決定の固定化。
   「なぜこの検査があるのか」は各行の説明と F:\\Claude\\docs\\デザインFB台帳_locahun3d.md 参照。
   仕様を意図的に変えるときは、この検査も同じコミットで更新すること（黙って外さない）。
   本番DOMでしか確認できない項目（幅・影・色の実測）は台帳側の手順に記載。
"""
import io, re, sys

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
]

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

print(f"\n{ok} OK / {fail} NG")
sys.exit(1 if fail else 0)
