# スタジオ セルフサーブ物件登録 — 設計

- 策定: 2026-07-22
- 採用案: **案A（申請制セルフサーブ）＋ 見え方(a)**
- 背景: DECISION_LOG D-008「供給の律速を外す」。運営がスキャン〜掲載まで全部やる構造だと、カタログ成長が人数に比例する。入力作業をスタジオ側へ移し、運営は**スキャンと審査だけ**に集中する。

## 1. 目的

スタジオが**自分でアカウントを作り、物件情報を最後まで入力し、「3DGSデータを差し込むだけ」の状態**にできるようにする。運営の手作業（物件の作成・紐付け・情報入力）をゼロにする。

**成功条件**: 運営が一切触らずに、スタジオが登録 → 物件作成 → 全項目入力 → 公開申請、まで到達できる。運営の作業は「3DGS差し込み＋審査＋公開」だけになる。

## 2. 現状（調査結果）

**既に実装済み・変更しない**
- `studio` ロール、オンボーディングでの種別選択・屋号入力
- `/admin` へのスタジオ入場（`requireAdminOrStudioOwner`）、ナビは「物件」のみに絞り込み
- **`assertPropertyAccess()`** — `ownerId` または `linkedPropertyIds` を照合するIDOR対策（正しく動作している）
- `/admin/properties` 一覧はスタジオには自分の物件のみ表示
- `saveDraftAction` / `renamePropertyAction` / `saveStudioPageAction` はスタジオ可

**欠落（本設計の対象）**
| # | 欠落 | 影響 |
|---|---|---|
| 1 | `createDraftAction` が `requireAdmin` | スタジオが物件を作れない＝**最大のブロッカー** |
| 2 | 物件との紐付けが admin の手作業（`linkedPropertyIds`） | 自己登録しても運営待ちになる |
| 3 | `publishAction` がスタジオでも通る | **未審査で公開されうる** |
| 4 | 3DGS欄がスタジオにも編集可能 | 「差し込むだけ」の分担が曖昧 |

## 3. 設計

### 3-1. フロー

```
スタジオ登録(Clerk) → オンボーディングで「スタジオ」選択・屋号入力
  → /admin/properties で「＋ 物件を登録」（新規: スタジオも可）
  → 6ステップ入力（基本/仕様/紹介文/写真/3DGS=ロック/公開）
  → 「公開を申請」
  → 運営: 3DGS差し込み → 審査 → 公開
```

### 3-2. 権限の変更（最小限）

| 対象 | 現在 | 変更後 |
|---|---|---|
| `createDraftAction` | admin限定 | **admin または studio**。studio作成時は `ownerId=自分` / `status='draft'` を**サーバー側で強制** |
| `publishAction` | `assertPropertyAccess`（studio可） | **admin限定**へ戻す |
| `requestPublishAction`（新規） | — | studio が公開申請。`publishRequestedAt` を立て、運営へ通知 |
| 3DGSステップ | 全員編集可 | studio には**読み取り専用**＋「運営がスキャン後に差し込みます」表示 |

**変更しないもの**: `assertPropertyAccess`（既に正しい）／一覧の絞り込み（既に正しい）／ナビのgating（既に正しい）。

### 3-3. データモデル

`Property` に1フィールドだけ追加する。

```ts
/** スタジオが公開申請した日時 (ISO)。null = 未申請。
 *  公開・却下時にクリアする。運営一覧の「申請中」バッジの根拠。 */
publishRequestedAt: z.string().nullable().default(null)
```

- **`ownerId` は既存**（`propertySchema` にある）。studio作成時にここへ自分のIDを入れることで、`assertPropertyAccess` が自動的に通る＝**紐付けの手作業が消える（欠落#2の解決）**。
- 新規ステータスは**作らない**。`draft` のまま `publishRequestedAt` の有無で「申請中」を表現する（既存のstatus遷移・一括操作・フィルタを壊さないため）。

### 3-4. 見え方（案a）

- **スタジオ側**: 自分の物件は常に見える（申請前も申請後も）。申請済みは「申請中・運営確認待ち」と表示。
- **運営側**: 一覧に**「申請中」バッジ**を表示。`publishRequestedAt` の新しい順で気づける。
- 公開されたら `publishRequestedAt` をクリアしてバッジを消す。

### 3-5. エラー処理・境界

- studio が `publishAction` を直叩き → `requireAdmin` で拒否（サーバー側で担保）。
- studio が他社物件のIDで `createDraft`／`saveDraft` → `assertPropertyAccess` が `forbidden` を投げる（既存の防御が効く）。
- studio が 3DGS フィールドを改竄したリクエストを送る → **`saveDraftAction` 側で、studio の場合は 3DGS 関連フィールド（`splatUrl`/`splatItems`/`splatSizeMb`/`zipUrl` 等）を保存前に既存値で上書き**する。UIの読み取り専用だけでは防御にならないため、サーバー側で必ず落とす。
- 公開申請の重複 → `publishRequestedAt` が既にあれば何もしない（冪等）。

### 3-6. テスト

- `assertPropertyAccess` の既存挙動が壊れていないこと。
- studio が作成した物件の `ownerId` が自分になり、`status='draft'` であること。
- studio の `saveDraft` で3DGSフィールドが変更されないこと（サーバー側強制の検証）。
- studio からの `publishAction` が拒否されること。
- 実機: スタジオアカウントで登録→作成→入力→申請、運営側で「申請中」バッジが出ることをブラウザで確認。

## 4. スコープ外（今回やらない）

- 物件の**譲渡・共同編集**（複数スタジオ担当者）。`linkedPropertyIds` の既存機構で運営が対応可能。
- スタジオ向けの独立UI（`/studio/*`）。既存の `/admin` をロールで出し分ける現行方式を継続（重複実装を避ける）。
- 申請却下の理由入力UI。まずは運営が直接連絡する運用で足りる。
- スタジオへのメール通知。まずはアプリ内通知（既存 `createNotification`）のみ。
