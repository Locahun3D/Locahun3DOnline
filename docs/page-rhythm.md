# ページ見出し・余白の共通基準

2026-09-12: 個別のfont-size/line-height/余白指定による画面間の不一致を修正。

- 通常ページは外枠`ui-page-shell`、見出しグループ`ui-page-header`、h1`ui-page-title`、説明`ui-page-lead`。
- 上余白と見出しグループ下余白は24px、720px以上32px。左右幅や既存の中央/左寄せは変更しない。
- h1は42–60px・行高1.35・太さ700（2026-09-12本人指示で従来の1.5倍）。節見出し`ui-section-title`は20–24px・1.4、同列カード`ui-card-title`は18px・1.5。
- 値の正本はglobals.css。既存CSSズームは維持し、標準見出しに個別clampや`text-3xl`を重ねない。
- ヘッダー内に操作ボタンがある場合はflex-wrapを維持。カードは固定高さにせず、内容を伸縮し末尾CTA/金額を揃える。
- ホームは既存構成・画像を保持したまま共通の文字サイズを使用。Works一覧も同スケール、記事本文は編集用独自レイアウトのまま。

## 意図的な例外

- 物件詳細の狭いギャラリー横サマリー見出しは24/32px。40pxでは実測129→216pxへ高さが増え、構図を崩すため維持。
- 検索優先の物件一覧には新しいh1を追加しない。
- 記事のエディトリアル見出し、支払明細の印刷書式、Clerk内部見出しは通常ページのクラスで上書きしない。
- 外部3Dビューアー本体は別成果物なので今回の対象外。

## 再検証

- `node scripts/verify-page-rhythm.mjs`: 実Chrome日英3幅、ホーム/問い合わせ/カート/料金の見出しと余白・カード上下。
- `node scripts/verify-form-heading-alignment.mjs`: 公開フォーム/規約/認証。
- `node scripts/verify-admin-page-rhythm.mjs`: 認証データ読取を隔離した実JSX画面。
- `node scripts/verify-catalog-heading-alignment.mjs`: 検索/物件/Works。
- `python scripts/design-fb-audit.py`、型・テスト、画像目視を行う。管理画面のfixtureは実認証・本番送信の検証とは区別する。
