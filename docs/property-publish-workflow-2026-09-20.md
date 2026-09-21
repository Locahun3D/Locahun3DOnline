# 物件の公開ワークフロー（下書き → 公開申請 → 公開）— 2026-09-20

本人指示:
「物件のステータス管理を、下書き→公開申請→公開 という流れにしたい。公開申請にすると、スタジオ側に新規で確認のメールが飛ぶようにしたい」
「JA/EN翻訳をするのもワークフローにしたい。公開申請になったら、翻訳を必ずするように」

## 着手前にあったもの（作り直さず、上に積んだ）

| 既存 | 内容 |
|---|---|
| `status` | `draft / published / archived`。公開側・カタログ・一括操作・Dropbox パイプラインは全部これだけを見る |
| `publishRequestedAt` | スタジオ(studio ロール)が掲載依頼フォームから申請すると `requestPublishAction` が立てる。一覧に「申請中」バッジ。運営へアプリ内通知 |
| `publishablePropertySchema` / `publishReadiness` | 公開に必要な項目の検証と「申請に必要な項目」チェックリスト |
| `fillPropertyEnglish`（`ai-translate.ts`, Claude API, `ANTHROPIC_API_KEY`） | 空の EN 欄だけを自動翻訳。公開時と「英語を自動翻訳」一括ボタンで使用。**失敗しても例外を投げず元のまま返す** |
| `propertyPreviewRepo` | `/preview/<token>`。ログイン不要・30日・1物件1トークン（再発行＝URL変更） |
| `lib/email.ts` | Resend。`RESEND_API_KEY` が無ければ送らない。`shell()` が共通レイアウト |

## 決めたこと

1. **`status` は増やさない。「公開申請中」= `draft` + `publishRequestedAt`。**
   enum を足すと公開側フィルタ・一括操作・studio ガード・Dropbox パイプライン（SQL で `status='draft'` を書く）の全分岐を直す必要がある。
   既存の 2026-07-22 設計（スタジオ申請）と同じ表現なので、スタジオ発の申請も運営発の申請も同じ「公開申請中」に合流する。
   段階の判定は `publishStage()`（`lib/publish-flow.ts`）の1か所。
2. **監査記録は `property.publishFlow`**（全欄 null 既定 → 旧レコード・パイプラインの行もそのまま parse できる）。
   `requestedAt / requestedBy / studioNotifiedAt / studioNotifiedTo / studioNotifyMode(sent|dry-run|skipped) / studioConfirmedAt / publishedAt`。
   サーバ管理フィールド: エディタ保存（`mergeManaged`）でも studio 保存（`protectStudioManagedFields`）でも既存値を保全する。
3. **公開申請（`requestReviewAction`・運営のみ）は「全部成功したら1回だけ保存」。** 順に:
   ① 必須項目（`publishReadiness` と同じ基準）→ ② 宛先の確認 → ③ 自動翻訳 → `translationGuard`（1つでも EN が空なら中止）→
   ④ プレビューリンク確保 → ⑤ スタジオへ確認メール → ⑥ `enterReview()` を保存。
   どこで失敗しても保存しない＝「申請中なのに翻訳されていない／メールが出ていない」状態を作らない。
4. **翻訳は必須。** `fillPropertyEnglish` は失敗を黙って握るので、結果を `missingEnglishFields()` で検査して止める。
   判定は純関数 `lib/property-english.ts` に移し、サーバーのガードとエディターの表示で同じ関数を使う（`property-translate.ts` は再エクスポート）。
   再送時も同じガードをかける。直接公開（`publishAction`）は従来どおり翻訳失敗でも通す（運営の緊急用。確認ダイアログは出る）。
5. **宛先は `property.contactEmail`。** 空・形式不正なら止める。「メールを送らずに申請中にする」を明示チェックしたときだけメール無しで進める（`skipped` と記録、一覧は「確認メール未送信」）。
6. **プレビューリンクは残り14日以上あれば使い回す。** 毎回再発行すると、すでに共有した URL が無効になるため。足りなければ再発行（30日）。
7. **メール**: 差出人・返信先 `contact@locahun3d.com`（スタジオがそのまま返信できる）、運営へ BCC で控え。
   文面は純関数 `lib/studio-review-mail.ts`（スタジオ名・プレビューURL・期限(JST)・確認してほしい点＝掲載内容/料金/写真/設備・返信方法・短い英語）。レイアウトは既存 `shell()`。
8. **実送信の安全策**:
   - 送るのは運営がボタンを押した Server Action（`requestReviewAction` / `resendStudioReviewMailAction`）だけ。スクリプト・取り込み・ページ表示からは呼ばない。
   - `mailDryRun()` = `RESEND_API_KEY` が無い、または `MAIL_DRY_RUN=1`。このときは送らずに `console.info` へ出し、記録にも `dry-run` と残る（画面に「実際には送信していません」と表示）。
   - 送信失敗（Resend エラー）は申請を中止してエラー表示。
   - 再送: 確認ダイアログ + サーバー側 60 秒クールダウン（`canResendStudioMail`）。ボタンに残り秒を表示。
9. **スタジオ確認は手動チェック**（返事はメールで来る。受信の取り込みは未実装のため）。「スタジオ確認済みにする」で `studioConfirmedAt` を記録。
   未確認・未申請のまま「公開する」を押すと確認ダイアログ（`publishWarnings`）。運営は了承すれば公開できる。
   再申請すると以前の確認済みは消える（確認したのは前の内容）。
10. **公開**で `publishRequestedAt` を消し `publishFlow.publishedAt` を刻む（記録は残す）。**公開停止・アーカイブ・申請取り下げ**で申請まわりを白紙に戻す（`resetReview`。公開日時の履歴だけ残す）。

## 画面

- **一覧** `/admin/properties`: タブ「全て / 下書き / 公開申請中 / 公開 / アーカイブ」。下書きタブに申請中は含めない。バッジ「公開申請中」＋細目（確認メール未送信 / スタジオ確認待ち / スタジオ確認済み）。
- **エディター**: ステップ数は 7 のまま。「公開設定」ステップ先頭に `PublishFlowPanel`（段階表示・申請前チェック・記録・操作ボタン）。
  ヘッダー主ボタンは 下書き=「公開申請へ」（公開設定ステップへ移動）、申請中=「公開する」。申請を経ない直接公開は公開設定ステップ内の小さいリンク。
  状態ピルは申請中に「公開申請中」。
- 公開サイトは未変更（下書きは従来どおり出ない）。studio 側の UI・申請導線も未変更。

## ファイル

- `src/lib/publish-flow.ts`（+test）— 段階・ガード・遷移の純関数
- `src/lib/property-english.ts` — 未翻訳項目の判定（純関数）
- `src/lib/studio-review-mail.ts`（+test）— 文面ビルダー／`src/lib/email.ts` — `mailDryRun` `sendStudioReviewMail`
- `src/app/admin/_actions.ts` — `requestReviewAction` `resendStudioReviewMailAction` `setStudioConfirmedAction` `withdrawReviewAction`、公開系は `markPublished` / `resetReview` 経由に統一
- `src/components/admin/publish-flow-panel.tsx`、`property-editor.tsx`、`properties-admin.tsx`、`admin/properties/page.tsx`
- `src/lib/schemas.ts`（`publishFlow`）、`src/lib/studio-guard.ts`

## 既知の限界・未対応

- 翻訳は「空の EN 欄を埋める」方式。申請後に日本語を書き換えても EN は古いまま（差分検知なし）。必要なら JA のハッシュを持って再翻訳を促す仕組みを足す。
- スタジオ確認はメール返信の目視。受信取り込みは無い（`docs/inbound-email-decision-2026-07-28.md`）。
- 一括公開・一覧からの「公開」は確認ダイアログ無しで従来どおり通る（`publishFlow.publishedAt` は刻む）。
- マイページ（studio）の進捗ラベルは従来の判定のまま（運営発の申請でも「撮影依頼済み / 公開審査待ち」と出る）。
- 取り下げ時にスタジオへの連絡メールは送らない。
- 本番で確認メールを出すには Workers に `RESEND_API_KEY`（既存）と、翻訳用の `ANTHROPIC_API_KEY`（既存の自動翻訳と同じ）が必要。

## スタジオの承認ボタンで自動公開（2026-09-21 追加）

本人指示「OKボタン押したら自動で公開されるようにできない？」。

- 確認メールのリンクは `/preview/<token>?approve=<key>`。このリンクで開いたときだけ、プレビューの最上部に「この内容でOK・公開する」が出る（2段階: ボタン → 「はい、公開する」）。
- 押すと `studioApproveAction`（`src/app/preview/[token]/_actions.ts`）が、プレビューの有効期限・公開申請中・キーの一致を確かめてから、`studioConfirmedAt`（`studioConfirmedVia: "studio-link"`）を記録して公開する。
- 公開に必要な項目が欠けているときは公開せず、「スタジオ確認済み」だけを記録する（画面は「運営で仕上げてから公開します」）。
- どちらの場合も、運営（contact@）へ通知メールが届く。社外へのメールは送らない。
- キーは24バイトの乱数。物件には SHA-256 だけを保存する（`publishFlow.studioApproveKeyHash`）。プレビューURLだけを知っている人にはボタンが出ない。
- メールを送り直すとキーが入れ替わり、古いメールのボタンは無効になる。公開・申請の取り下げでキーは消える（使い切り）。
- 取り下げたいときは、物件編集の「公開停止」。
- 修正の希望は、従来どおりメールへの返信で受ける。
