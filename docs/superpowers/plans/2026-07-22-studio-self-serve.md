# スタジオ セルフサーブ物件登録 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** スタジオが自分でアカウントを作り物件情報を最後まで入力し、運営が「3DGSデータを差し込むだけ」の状態にできるようにする。

**Architecture:** 既存の `/admin` をロールで出し分ける現行方式を継続する。新しいUIツリー(`/studio/*`)は作らない。権限層(`assertPropertyAccess`・一覧絞り込み・ナビgating)は既に正しいので変更しない。埋めるのは4つの欠落だけ: ①`createDraftAction` をstudioへ開放し `ownerId=自分` を強制（これで紐付けの手作業が構造的に消える）②`publishAction` をadmin限定へ戻す ③`requestPublishAction` を新設 ④3DGSフィールドをサーバー側で保護。

**Tech Stack:** Next.js 16 (App Router, Server Actions) / TypeScript / zod / vitest / Cloudflare D1

**Spec:** `docs/superpowers/specs/2026-07-22-studio-self-serve-design.md`

---

## File Structure

| ファイル | 責務 | 変更 |
|---|---|---|
| `src/lib/schemas.ts` | `publishRequestedAt` フィールド追加 | Modify |
| `src/lib/studio-guard.ts` | **新規**: studioの保存時に3DGS等を保護する純粋関数（テスト可能な単位として切り出す） | Create |
| `src/lib/studio-guard.test.ts` | 上記のテスト | Create |
| `src/app/admin/_actions.ts` | create/save/publish/requestPublish の権限と保護の適用 | Modify |
| `src/lib/notifications.ts` | 通知type に `publish_request` 追加 | Modify |
| `src/components/admin/property-editor.tsx` | 3DGSステップをstudioに読み取り専用化＋申請ボタン | Modify |
| `src/components/admin/properties-admin.tsx` | 「申請中」バッジ | Modify |
| `src/app/admin/properties/page.tsx` | バッジ用に `publishRequestedAt` を一覧へ渡す | Modify |

**設計判断**: 3DGS保護は `_actions.ts` に直接書かず `studio-guard.ts` へ切り出す。理由 = `_actions.ts` は既に500行超で、セキュリティ上最も重要なロジックをテスト可能な純粋関数として独立させたいため。

---

## Task 1: `publishRequestedAt` フィールドを追加

**Files:**
- Modify: `src/lib/schemas.ts`（`spatialComplexity` の直後）

- [ ] **Step 1: スキーマにフィールドを追加**

`src/lib/schemas.ts` の `spatialComplexity` 定義の直後に追加:

```ts
  /**
   * スタジオが公開申請した日時 (ISO)。null = 未申請。
   * 公開時・却下時にクリアする。運営一覧の「申請中」バッジの根拠。
   *
   * 新しい status は増やさない: status は draft のまま、この欄の有無だけで
   * 「申請中」を表現する（既存の status 遷移・一括操作・フィルタを壊さないため）。
   */
  publishRequestedAt: z.string().nullable().default(null),
```

- [ ] **Step 2: 型チェックで既存が壊れていないことを確認**

Run: `npx tsc --noEmit 2>&1 | grep -v "\.test\.ts" | head -5`
Expected: 出力なし（テストファイル由来の既存エラーのみ除外）

- [ ] **Step 3: Commit**

```bash
git add src/lib/schemas.ts
git commit -m "物件に publishRequestedAt を追加（スタジオの公開申請）"
```

---

## Task 2: 3DGS保護の純粋関数を作る（TDD）

**Files:**
- Create: `src/lib/studio-guard.ts`
- Create: `src/lib/studio-guard.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/studio-guard.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { protectStudioManagedFields } from "./studio-guard";
import type { Property } from "./schemas";

/** 最小限の Property を作るヘルパ（必要な欄だけ上書き）。 */
function prop(over: Partial<Property>): Property {
  return {
    splatUrl: "",
    zipUrl: "",
    zipSizeMb: 0,
    splatSizeMb: 0,
    splatItems: [],
    status: "draft",
    publishRequestedAt: null,
    ...over,
  } as Property;
}

describe("protectStudioManagedFields", () => {
  it("studio の保存では 3DGS 系フィールドを既存値で上書きする", () => {
    const incoming = prop({
      splatUrl: "evil.splat",
      splatSizeMb: 999,
      zipUrl: "evil.zip",
      zipSizeMb: 999,
      splatItems: [{ id: "x" }] as Property["splatItems"],
    });
    const existing = prop({
      splatUrl: "real.splat",
      splatSizeMb: 12,
      zipUrl: "real.zip",
      zipSizeMb: 34,
      splatItems: [],
    });

    const out = protectStudioManagedFields(incoming, existing, "studio");

    expect(out.splatUrl).toBe("real.splat");
    expect(out.splatSizeMb).toBe(12);
    expect(out.zipUrl).toBe("real.zip");
    expect(out.zipSizeMb).toBe(34);
    expect(out.splatItems).toEqual([]);
  });

  it("admin の保存では 3DGS 系フィールドをそのまま通す", () => {
    const incoming = prop({ splatUrl: "new.splat", splatSizeMb: 50 });
    const existing = prop({ splatUrl: "old.splat", splatSizeMb: 10 });

    const out = protectStudioManagedFields(incoming, existing, "admin");

    expect(out.splatUrl).toBe("new.splat");
    expect(out.splatSizeMb).toBe(50);
  });

  it("studio は status と publishRequestedAt を書き換えられない", () => {
    const incoming = prop({ status: "published", publishRequestedAt: "2026-01-01T00:00:00.000Z" });
    const existing = prop({ status: "draft", publishRequestedAt: null });

    const out = protectStudioManagedFields(incoming, existing, "studio");

    expect(out.status).toBe("draft");
    expect(out.publishRequestedAt).toBeNull();
  });

  it("既存が無い（新規作成直後）場合も studio の 3DGS 欄は空にする", () => {
    const incoming = prop({ splatUrl: "evil.splat", splatSizeMb: 999 });

    const out = protectStudioManagedFields(incoming, null, "studio");

    expect(out.splatUrl).toBe("");
    expect(out.splatSizeMb).toBe(0);
  });
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `npx vitest run src/lib/studio-guard.test.ts`
Expected: FAIL — `Failed to resolve import "./studio-guard"`

- [ ] **Step 3: 最小の実装を書く**

`src/lib/studio-guard.ts`:

```ts
import type { Property } from "./schemas";
import type { AccountRole } from "./account-schema";

/**
 * studio ロールが保存できない「運営管理フィールド」を、既存値へ強制的に戻す。
 *
 * なぜサーバー側で必要か:
 * エディタUIで3DGSステップを読み取り専用にしても、Server Action へ細工した
 * ペイロードを直接投げれば splatUrl 等を書き換えられてしまう。UIのロックは
 * 防御にならないので、保存経路の必ず通る場所でサーバーが落とす。
 *
 * 対象:
 *  - 3DGS 一式（運営がスキャン後に差し込む）
 *  - status / publishRequestedAt（公開は admin 限定、申請は専用アクション経由）
 */
export function protectStudioManagedFields<T extends Property>(
  incoming: T,
  existing: Property | null,
  role: AccountRole,
): T {
  if (role === "admin") return incoming;
  return {
    ...incoming,
    splatUrl: existing?.splatUrl ?? "",
    zipUrl: existing?.zipUrl ?? "",
    zipSizeMb: existing?.zipSizeMb ?? 0,
    splatSizeMb: existing?.splatSizeMb ?? 0,
    splatItems: existing?.splatItems ?? [],
    status: existing?.status ?? "draft",
    publishRequestedAt: existing?.publishRequestedAt ?? null,
  };
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run src/lib/studio-guard.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 5: Commit**

```bash
git add src/lib/studio-guard.ts src/lib/studio-guard.test.ts
git commit -m "スタジオが書き換えられない運営管理フィールドの保護関数を追加"
```

---

## Task 3: `createDraftAction` をスタジオへ開放

**Files:**
- Modify: `src/app/admin/_actions.ts:199-208`

- [ ] **Step 1: アクションを書き換える**

`src/app/admin/_actions.ts` の `createDraftAction` を丸ごと置き換え:

```ts
export async function createDraftAction() {
  // admin だけでなく studio も自分の物件を作れる（セルフサーブ）。
  // studio が作った物件は ownerId=本人 になるため、以降の編集は
  // assertPropertyAccess が自動で許可する＝運営による紐付け作業が不要になる。
  const user = await requireAdminOrStudioOwner();
  // 既定カテゴリ(studio)で採番。エディターでカテゴリ変更後も番号は維持される。
  const id = await nextPropertyId("studio");
  const draft = newDraft(id);
  draft.ownerId = user.id;
  await repo.upsert(draft);
  revalidatePath("/admin/properties");
  redirect(`/admin/properties/${draft.id}/edit`);
}
```

- [ ] **Step 2: 型チェック**

Run: `npx tsc --noEmit 2>&1 | grep -v "\.test\.ts" | head -5`
Expected: 出力なし

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/_actions.ts
git commit -m "スタジオが自分の物件を新規作成できるようにする（ownerId=本人）"
```

---

## Task 4: `saveDraftAction` に3DGS保護を適用

**Files:**
- Modify: `src/app/admin/_actions.ts:210-238`

- [ ] **Step 1: import を追加**

`src/app/admin/_actions.ts` の import 群に追加:

```ts
import { protectStudioManagedFields } from "@/lib/studio-guard";
```

- [ ] **Step 2: 保存時に保護を挟む**

`saveDraftAction` 内の `const saved = await repo.upsert(mergeManaged(parsed, existing));` を置き換え:

```ts
  // studio の保存では 3DGS・status・申請日時をサーバー側で既存値へ戻す
  // （UIの読み取り専用は改竄ペイロードを防げないため）。
  const guarded = protectStudioManagedFields(parsed, existing ?? null, user.role);
  const saved = await repo.upsert(mergeManaged(guarded, existing));
```

- [ ] **Step 3: `user` を取得できるようにする**

同関数の `await assertPropertyAccess(parsed.id);` を置き換え（戻り値の user を使う）:

```ts
  const user = await assertPropertyAccess(parsed.id);
```

- [ ] **Step 4: 型チェックと既存テスト**

Run: `npx tsc --noEmit 2>&1 | grep -v "\.test\.ts" | head -5 && npx vitest run`
Expected: 型エラーなし、既存テスト全PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/_actions.ts
git commit -m "スタジオの保存で3DGS・statusをサーバー側で保護"
```

---

## Task 5: `publishAction` をadmin限定へ戻す

**Files:**
- Modify: `src/app/admin/_actions.ts:242-254`

- [ ] **Step 1: 権限を差し替える**

`publishAction` の `await assertPropertyAccess(parsed.id);` を置き換え:

```ts
  // 公開は運営の審査を通す（studio は requestPublishAction で申請のみ）。
  // 未審査の物件が公開されるとカタログ品質＝商品価値を毀損するため。
  await requireAdmin();
```

- [ ] **Step 2: 公開時に申請フラグをクリア**

同関数の `repo.upsert(...)` 行を置き換え:

```ts
  await repo.upsert(
    stampPublishedAt({
      ...mergeManaged(parsed, existing),
      status: "published",
      publishRequestedAt: null,
    }),
  );
```

- [ ] **Step 3: 型チェック**

Run: `npx tsc --noEmit 2>&1 | grep -v "\.test\.ts" | head -5`
Expected: 出力なし

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/_actions.ts
git commit -m "公開をadmin限定に戻し、公開時に申請フラグをクリア"
```

---

## Task 6: 通知タイプに `publish_request` を追加

**Files:**
- Modify: `src/lib/notifications.ts:19`

- [ ] **Step 1: 型を広げる**

`src/lib/notifications.ts` の `type: "inquiry_reply";` を置き換え:

```ts
  /** inquiry_reply=問い合わせ返信 / publish_request=スタジオからの公開申請 */
  type: "inquiry_reply" | "publish_request";
```

- [ ] **Step 2: 型チェック**

Run: `npx tsc --noEmit 2>&1 | grep -v "\.test\.ts" | head -5`
Expected: 出力なし

- [ ] **Step 3: Commit**

```bash
git add src/lib/notifications.ts
git commit -m "通知タイプに publish_request を追加"
```

---

## Task 7: `requestPublishAction` を新設

**Files:**
- Modify: `src/app/admin/_actions.ts`（`publishAction` の直後に追加）

- [ ] **Step 1: import を追加**

```ts
import { createNotification } from "@/lib/notifications";
import { userRepo } from "@/lib/users";
```

（既に import 済みならこの手順は不要。`grep -n "createNotification\|userRepo" src/app/admin/_actions.ts` で確認する）

- [ ] **Step 2: アクションを追加**

`publishAction` の直後に追加:

```ts
/**
 * スタジオからの公開申請。status は draft のまま publishRequestedAt を立て、
 * 運営（admin全員）へアプリ内通知を送る。運営が3DGSを差し込み審査して公開する。
 * 既に申請済みなら何もしない（冪等）。
 */
export async function requestPublishAction(id: string) {
  const user = await assertPropertyAccess(id);
  const existing = await repo.get(id);
  if (!existing) return { ok: false as const, error: "物件が見つかりません" };
  if (existing.status === "published") {
    return { ok: false as const, error: "すでに公開されています" };
  }
  if (existing.publishRequestedAt) {
    return { ok: true as const, alreadyRequested: true as const };
  }

  await repo.upsert({ ...existing, publishRequestedAt: new Date().toISOString() });

  const admins = (await userRepo.list()).filter((u) => u.role === "admin");
  for (const a of admins) {
    await createNotification({
      userId: a.id,
      type: "publish_request",
      title: "公開申請が届きました",
      body: `${user.name} さんから「${existing.title || id}」の公開申請が届きました。3DGSデータの差し込みと審査をお願いします。`,
      // Notification.link は必須（クリック時の遷移先・相対パス）。
      link: `/admin/properties/${id}/edit`,
    });
  }

  revalidatePath("/admin/properties");
  revalidatePath(`/admin/properties/${id}/edit`);
  return { ok: true as const };
}
```

- [ ] **Step 3: 型チェック**

Run: `npx tsc --noEmit 2>&1 | grep -v "\.test\.ts" | head -10`
Expected: 出力なし

（`createNotification` は `Omit<Notification, "id" | "read" | "createdAt">` を受ける。必須は `userId` / `type` / `title` / `body` / `link` の5つで、上のコードは全て埋めてある。）

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/_actions.ts
git commit -m "スタジオからの公開申請アクションを追加（運営へ通知）"
```

---

## Task 8: エディターで3DGSを読み取り専用化＋申請ボタン

**Files:**
- Modify: `src/components/admin/property-editor.tsx`
- Modify: `src/app/admin/properties/[id]/edit/page.tsx`（`isAdmin` を渡す）

- [ ] **Step 1: 編集ページから `isAdmin` を渡す**

`src/app/admin/properties/[id]/edit/page.tsx` で現在のユーザーを取得し、`PropertyEditor` へ `isAdmin` を渡す。既存の props に追加:

```tsx
const currentUser = await getCurrentUser();
// ...
<PropertyEditor ... isAdmin={currentUser?.role === "admin"} />
```

`getCurrentUser` が未 import なら `import { getCurrentUser } from "@/lib/dal";` を追加する。

- [ ] **Step 2: エディターの props に追加**

`src/components/admin/property-editor.tsx` の props 型と分割代入に追加:

```tsx
  /** 運営のみ 3DGS を編集できる。studio には読み取り専用で見せる。 */
  isAdmin?: boolean;
```

分割代入に `isAdmin = false,` を追加。

- [ ] **Step 3: 3DGSステップをロック**

`step === "splat"` のブロック先頭（`<StepCard ...>` の直下）に挿入:

```tsx
{!isAdmin && (
  <div className="border border-accent/40 bg-accent/10 px-4 py-3 mb-5 text-[12.5px] leading-[1.85]">
    3Dデータは運営が撮影後に差し込みます。<br />
    この項目の入力は不要です（内容の確認のみ行えます）。
  </div>
)}
```

さらに、同ステップ内の入力要素をまとめて無効化するため、既存のフォーム部分を `<fieldset disabled={!isAdmin} className="contents">` … `</fieldset>` で囲む。

- [ ] **Step 4: 公開ボタンを申請ボタンに差し替える**

`step === "publish"` ブロックの公開ボタン付近に、studio 用の分岐を追加:

```tsx
{!isAdmin && (
  <button
    type="button"
    onClick={() => {
      startTransition(async () => {
        const res = await requestPublishAction(watch("id"));
        alert(res.ok ? "公開申請を送信しました。運営が確認します。" : res.error);
      });
    }}
    className="mono text-[11px] tracking-[0.2em] uppercase border border-accent text-accent px-5 py-2.5 hover:bg-accent hover:text-bg transition"
  >
    公開を申請
  </button>
)}
```

`requestPublishAction` を import し、既存の「公開する」ボタンは `{isAdmin && ( ... )}` で囲む。

- [ ] **Step 5: 型チェックとビルド**

Run: `npx tsc --noEmit 2>&1 | grep -v "\.test\.ts" | head -5 && npm run build 2>&1 | tail -3`
Expected: 型エラーなし、ビルド成功

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/property-editor.tsx "src/app/admin/properties/[id]/edit/page.tsx"
git commit -m "エディター: studioには3DGSを読み取り専用にし公開申請ボタンを出す"
```

---

## Task 9: 一覧に「申請中」バッジ

**Files:**
- Modify: `src/app/admin/properties/page.tsx`
- Modify: `src/components/admin/properties-admin.tsx`

- [ ] **Step 1: 一覧データに申請日時を含める**

`src/app/admin/properties/page.tsx` の `PropertyListItem` マッピングに追加:

```ts
    publishRequestedAt: p.publishRequestedAt ?? null,
```

- [ ] **Step 2: 型に追加**

`src/components/admin/properties-admin.tsx` の `PropertyListItem` 型に追加:

```ts
  publishRequestedAt?: string | null;
```

- [ ] **Step 3: バッジを表示**

同ファイルの各行の status バッジの隣に追加:

```tsx
{p.publishRequestedAt && p.status !== "published" && (
  <span className="mono text-[9px] tracking-[0.2em] uppercase border border-accent text-accent px-1.5 py-0.5">
    申請中
  </span>
)}
```

- [ ] **Step 4: 型チェック**

Run: `npx tsc --noEmit 2>&1 | grep -v "\.test\.ts" | head -5`
Expected: 出力なし

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/properties/page.tsx src/components/admin/properties-admin.tsx
git commit -m "物件一覧に「申請中」バッジを表示"
```

---

## Task 10: 実機検証（スタジオ視点で通しで動かす）

**Files:** なし（検証のみ）

- [ ] **Step 1: dev環境にスタジオアカウントを用意**

`data/users.json` をバックアップし、テスト用ユーザーの role を `studio`・`onboarded: true`・`linkedPropertyIds: []` にする。

```bash
cp data/users.json data/users.json.bak
```

その後 dev サーバーを**再起動**する（users.json はプロセス起動時に読み込まれるため）。

- [ ] **Step 2: 通しで検証**

ブラウザで以下を順に確認する:

1. スタジオでサインイン → `/admin/properties` にアクセスできる。ナビは「物件」のみ
2. 「＋ 新規物件を作成」でエディターに入れる（**Task 3 の検証**）
3. 基本情報・写真などを入力して保存できる
4. **3DGSステップが読み取り専用**になっており「運営が差し込みます」の案内が出る（**Task 8 の検証**）
5. 「公開を申請」を押すと成功メッセージが出る（**Task 7 の検証**）
6. 一覧に「申請中」バッジが出る（**Task 9 の検証**）
7. サインアウトし admin でサインイン → 一覧に同じ物件が「申請中」で見える

- [ ] **Step 3: セキュリティの実地確認（最重要）**

ブラウザのDevToolsコンソールから、studio セッションで 3DGS を書き換えるペイロードを直接投げても**反映されない**ことを確認する。エディターで splatUrl が空のまま変わらなければ合格（**Task 4 の検証**）。

同様に、studio が他社物件のIDでエディターURLを直打ちして **forbidden** になることを確認する。

- [ ] **Step 4: テストデータを戻す**

```bash
mv data/users.json.bak data/users.json
```

dev サーバーを再起動し、元のアカウント状態に戻ったことを確認する。

- [ ] **Step 5: 最終確認とコミット**

Run: `npx tsc --noEmit 2>&1 | grep -v "\.test\.ts" | head -5 && npx vitest run && npm run build 2>&1 | tail -3`
Expected: 型エラーなし・テスト全PASS・ビルド成功

```bash
git add -A
git commit -m "スタジオ セルフサーブ物件登録の実機検証完了"
```

---

## 完了条件

- スタジオが運営の手を一切借りずに、登録→物件作成→全項目入力→公開申請まで到達できる
- 3DGSフィールドはスタジオからは（改竄ペイロードでも）変更できない
- 公開は admin のみが実行できる
- 運営の一覧に「申請中」が見え、通知も届く
