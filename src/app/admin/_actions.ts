"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { repo, assetRepo } from "@/lib/store";
import { userRepo } from "@/lib/users";
import { purchaseRepo } from "@/lib/purchases";
import { inquiryRepo } from "@/lib/inquiries";
import { deleteR2Object, getUploadMode } from "@/lib/uploads";
import { toR2Key } from "@/lib/asset-keys";
import { requireAdmin, requireAdminOrStudioOwner, getCurrentUser } from "@/lib/dal";
import { protectStudioManagedFields } from "@/lib/studio-guard";
import { createNotification } from "@/lib/notifications";
import { renamePayoutRecordsForProperty } from "@/lib/payouts";
import { fillPropertyEnglish, needsEnglish } from "@/lib/property-translate";
import {
  propertySchema,
  publishablePropertySchema,
  pageBlockSchema,
  type Property,
} from "@/lib/schemas";

async function assertPropertyAccess(propertyId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("unauthorized");
  if (user.role === "admin") return user;
  const linked = user.linkedPropertyIds ?? [];
  const prop = await repo.get(propertyId);
  if (prop && (prop.ownerId === user.id || linked.includes(propertyId))) return user;
  throw new Error("forbidden");
}

/** 物件オブジェクト内の url/src っぽい全フィールドの値を再帰的に集める（重複除去）。 */
function collectPropertyFileUrls(p: Property): string[] {
  const urls = new Set<string>();
  const walk = (obj: unknown) => {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      obj.forEach(walk);
      return;
    }
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof v === "string" && /url|src/i.test(k) && v) urls.add(v);
      else if (v && typeof v === "object") walk(v);
    }
  };
  walk(p);
  return [...urls];
}

/**
 * このURLが「全物件の保存済み最新状態」で他に何件、参照されているか数える
 * （excludePropertyId を渡すとその物件自体はカウントから除外）。
 *
 * アセットライブラリは複数物件・同一物件内の複数フィールド（例: カバーと
 * ギャラリーで同じ写真を使い回す）から参照される前提の共有リソースなので、
 * 「差し替え/削除しようとしている箇所以外にまだ使われていないか」を必ず
 * 確認してから実体を消す。確認せず消すと、他物件・他フィールドの画像が
 * 突然壊れる事故になる。
 */
async function countOtherUrlUsages(url: string, excludePropertyId?: string): Promise<number> {
  const props = await repo.list();
  let count = 0;
  for (const p of props) {
    if (p.id === excludePropertyId) continue;
    if (collectPropertyFileUrls(p).includes(url)) count++;
  }
  return count;
}

/**
 * URLに対応する実体ファイルをベストエフォートで削除する。アセットライブラリに
 * 一致レコードがあれば assetRepo.remove（実体+メタデータ）、無ければ（旧来の
 * 手動URL等）直接R2削除を試みる。失敗しても呼び出し元の処理は止めない
 * （差し替え/保存自体をファイル削除の失敗で失敗させない）。
 */
async function deleteFileAsset(url: string, assetsByUrl?: Map<string, { id: string }>): Promise<void> {
  const byUrl = assetsByUrl ?? new Map((await assetRepo.list()).map((a) => [a.url, a] as const));
  const match = byUrl.get(url);
  if (match) {
    await assetRepo.remove(match.id);
    return;
  }
  if ((await getUploadMode()) === "r2") {
    const key = toR2Key(url);
    if (key) {
      try {
        await deleteR2Object(key);
      } catch (e) {
        console.error("[deleteFileAsset] direct R2 delete failed", url, e);
      }
    }
  }
}

/**
 * 物件エディターで1件のファイルを差し替え/削除したとき、他のどこからも
 * 参照されていなければ古い実体を消す。物件エディター配下（差し替えボタン等）
 * から呼ばれるので、保存と同じ assertPropertyAccess（admin または所有スタジオ）
 * で権限を揃える。
 *
 * oldUrl は呼び出し時点でまだフォームが未保存の「差し替え対象そのフィールド」
 * にも一致し得る（D1の最新保存値がまだ古いURLのまま）。そのため物件自体は
 * 除外せず数え、合計参照数が1（＝この差し替え対象フィールド自身のみ）以下
 * なら安全に削除する。
 */
export async function cleanupReplacedFileAction(
  propertyId: string,
  oldUrl: string,
): Promise<void> {
  const user = await assertPropertyAccess(propertyId);
  if (!oldUrl) return;

  /* ⚠ IDOR対策（重要）:
   * assertPropertyAccess は「propertyId を編集してよいか」しか見ないため、
   * oldUrl に他物件のファイルURLを渡されると、自分の物件IDを通した上で
   * 他社の splat/zip/画像の実体を削除できてしまう（countOtherUrlUsages は
   * 全物件横断で数えるので、参照が1件＝他社物件のみ でも通過する）。
   *
   * 物件アップロードのキーは `uploads/<propertyId>/…` なので、非adminには
   * 「自分の物件配下のURL」だけを削除許可する。判定できないURL
   * （アセットライブラリ・外部URL・デモ資産）は消さずに黙って返す
   * ＝この関数はベストエフォートのGCであり、消さなくても実害はない。
   * admin は従来どおり全て削除できる（横断的なアセット管理のため）。 */
  if (user.role !== "admin" && !oldUrl.includes(`uploads/${propertyId}/`)) {
    return;
  }

  const usages = await countOtherUrlUsages(oldUrl);
  if (usages > 1) return; // 他のフィールド/物件でまだ使用中
  await deleteFileAsset(oldUrl);
}

/**
 * 物件削除時、その物件が参照する全ファイル（splat/画像/DL等）のうち、
 * 他のどの物件からも参照されていないものだけを一緒に消す。
 */
async function cleanupPropertyFiles(p: Property): Promise<void> {
  const urls = collectPropertyFileUrls(p);
  if (urls.length === 0) return;
  const assetsByUrl = new Map((await assetRepo.list()).map((a) => [a.url, a] as const));
  for (const url of urls) {
     
    const usedElsewhere = await countOtherUrlUsages(url, p.id);
     
    if (usedElsewhere === 0) await deleteFileAsset(url, assetsByUrl);
  }
}

/**
 * エディタ保存時に、フォームが保持しないサーバ管理フィールドを既存値で保全する。
 * - pageBlocks: 別UI（スタジオページビルダー）の所有物。autosave で消さない。
 * - ownerId: 所有権＝アクセス権の根拠。エディタ保存で空に上書きさせない。
 */
function mergeManaged<T extends Property>(incoming: T, existing: Property | null): T {
  if (!existing) return incoming;
  return {
    ...incoming,
    pageBlocks: existing.pageBlocks,
    ownerId: existing.ownerId || incoming.ownerId,
    // 初回公開時刻はサーバ管理（"New" バッジの基準）。フォーム値で消さない。
    publishedAt: existing.publishedAt || incoming.publishedAt,
    // 公開申請フラグもサーバ管理（requestPublishAction が立て、publishAction が消す）。
    // エディタの入力項目ではないため、古いタブを開いたままの管理者が保存すると
    // stale な null で「申請中」を無言で消してしまう事故が起きる。
    // ※ publishAction は mergeManaged の展開後に publishRequestedAt: null を
    //   明示指定しているので、公開時のクリアはこの保全より優先される。
    publishRequestedAt: existing.publishRequestedAt ?? incoming.publishRequestedAt,
  };
}

/** 初回公開時のみ publishedAt を刻む（再公開では既存値を保持）。 */
function stampPublishedAt<T extends Property>(p: T): T {
  return { ...p, publishedAt: p.publishedAt || new Date().toISOString() };
}

function newDraft(id: string): Property {
  const now = new Date().toISOString();
  // Schema defaults fill in empty strings / zero / empty arrays.
  return propertySchema.parse({
    id,
    status: "draft",
    category: "studio",
    cover: { src: "", alt: "", width: 1600, height: 1000 },
    createdAt: now,
    updatedAt: now,
  });
}

/** カテゴリ別の物件番号プレフィックス（wh-002 形式）。 */
const CATEGORY_ID_PREFIX: Record<string, string> = {
  studio: "st",
  warehouse: "wh",
  house: "hs",
  shop: "sh",
  outdoor: "od",
  venue: "vn",
  school: "sc",
};

/**
 * 既存IDを走査して被らない連番IDを採番する（例: wh-002 → wh-003）。
 * nanoid のランダムIDをやめ、人が読める番号を自動生成する。
 */
async function nextPropertyId(category: string): Promise<string> {
  const prefix = CATEGORY_ID_PREFIX[category] ?? "lc";
  const all = await repo.list();
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  let max = 0;
  for (const p of all) {
    const m = p.id.match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  // 念のため重複を最終チェックし、被っていれば繰り上げる。
  let n = max + 1;
  let id = `${prefix}-${String(n).padStart(3, "0")}`;
  while (await repo.get(id)) {
    n += 1;
    id = `${prefix}-${String(n).padStart(3, "0")}`;
  }
  return id;
}

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

export async function saveDraftAction(
  input: unknown,
  opts?: { expectedUpdatedAt?: string },
) {
  const parsed = propertySchema.parse(input);
  const user = await assertPropertyAccess(parsed.id);
  // 編集フォームが保持しないサーバ管理フィールドは既存値を保全する。
  // pageBlocks（スタジオページビルダー）と ownerId（所有権＝権限の根拠）は
  // エディタの入力対象外なので、autosave で default(空) に上書きさせない。
  const existing = await repo.get(parsed.id);
  // ── マルチタブ楽観ロック ──
  // 同じ物件を 2 タブで開くと、古いタブの autosave が新しいタブの保存
  // （splatUrl 差し替え等）を無言で巻き戻す事故が起きる。クライアントが
  // 最後に読んだ updatedAt と現在のサーバ値が食い違うなら、別タブが先に
  // 保存している → 上書きせず衝突として返す（クライアント側で保存停止＋表示）。
  if (
    opts?.expectedUpdatedAt &&
    existing?.updatedAt &&
    existing.updatedAt !== opts.expectedUpdatedAt
  ) {
    return {
      ok: false as const,
      conflict: true as const,
      serverUpdatedAt: existing.updatedAt,
    };
  }
  // studio の保存では 3DGS・status・申請日時をサーバー側で既存値へ戻す
  // （UIの読み取り専用は改竄ペイロードを防げないため）。
  const guarded = protectStudioManagedFields(parsed, existing ?? null, user.role);
  const saved = await repo.upsert(mergeManaged(guarded, existing));
  revalidatePath("/admin/properties");
  revalidatePath(`/admin/properties/${parsed.id}/edit`);
  return { ok: true as const, id: parsed.id, updatedAt: saved.updatedAt };
}

export async function publishAction(input: unknown) {
  const parsed = publishablePropertySchema.parse(input);
  // 公開は運営の審査を通す（studio は requestPublishAction で申請のみ）。
  // 未審査の物件が公開されるとカタログ品質＝商品価値を毀損するため。
  await requireAdmin();
  const existing = await repo.get(parsed.id);
  let toPublish: Property = stampPublishedAt({
    ...mergeManaged(parsed, existing),
    status: "published",
    publishRequestedAt: null,
  });
  // 公開時に英語(EN欄)が空のフィールドを自動翻訳で埋める。
  // 翻訳失敗・キー未設定でも公開は必ず通す（日本語表示にフォールバック）。
  try {
    toPublish = await fillPropertyEnglish(toPublish);
  } catch {
    /* 翻訳できなくても公開は継続 */
  }
  await repo.upsert(toPublish);
  revalidatePath("/admin/properties");
  revalidatePath(`/admin/properties/${parsed.id}/edit`);
  revalidatePath("/properties");
  revalidatePath(`/properties/${parsed.id}`);
  revalidatePath("/");
  return { ok: true as const, id: parsed.id };
}

/**
 * 英語(EN欄)が未翻訳の物件をまとめて自動翻訳で埋める（管理者一括操作）。
 * 既に手動/自動で埋まっている EN 欄は温存する。翻訳できなかった物件は
 * そのまま（日本語表示のまま）スキップ。件数を返す。
 */
export async function translateMissingEnglishAction() {
  await requireAdmin();
  const all = await repo.list();
  let translated = 0;
  let failed = 0;
  for (const p of all) {
    if (!needsEnglish(p)) continue;
    try {
      const filled = await fillPropertyEnglish(p);
      if (filled !== p && !needsEnglish(filled)) {
        await repo.upsert(filled);
        translated++;
      } else if (filled !== p) {
        // 一部だけ埋まった場合も保存する（完全でなくても前進）。
        await repo.upsert(filled);
        translated++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }
  revalidatePath("/admin/properties");
  revalidatePath("/properties");
  revalidatePath("/");
  return { ok: true as const, translated, failed };
}

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

/** Publish straight from the list by id — validates the stored record first. */
export async function publishByIdAction(id: string) {
  await requireAdmin();
  const existing = await repo.get(id);
  if (!existing) return { ok: false as const, error: "物件が見つかりません" };
  const parsed = publishablePropertySchema.safeParse(existing);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "公開に必要な項目が未入力です。エディタで入力してください。",
    };
  }
  // 公開したら申請フラグを消す（publishAction と同じ扱い）。残したままだと
  // 後で下書きに戻した時に、新たな申請が無いのに「申請中」が復活してしまう。
  await repo.upsert(
    stampPublishedAt({ ...parsed.data, status: "published", publishRequestedAt: null }),
  );
  revalidatePath("/admin/properties");
  revalidatePath("/properties");
  revalidatePath(`/properties/${id}`);
  revalidatePath("/");
  return { ok: true as const };
}

/**
 * 公開を取り下げて下書きへ戻す。**所有者(スタジオ)自身にも許可する。**
 *
 * 掲載者が自走できない一番の原因がこれだった。営業日程が変わった・写真を
 * 差し替えたい・一時的に貸し出しを止めたい、といった時に自分で止められず、
 * 当社へ連絡しないと引っ込められない状態になっていた（当社の運用負荷にもなる）。
 *
 * 非対称にしてあるのは意図的:
 *   取り下げ = 所有者可（自分の情報を隠すだけなので被害が無い）
 *   公開     = admin のみ（publishAction / publishByIdAction は requireAdmin のまま）
 * つまり「いつでも引っ込められるが、出す時は必ず審査を通る」。
 */
export async function unpublishAction(id: string) {
  await assertPropertyAccess(id);
  const existing = await repo.get(id);
  if (!existing) return { ok: false as const, reason: "not_found" as const };
  // 取り下げたら過去の公開申請は無効。残すと再公開時に審査済みに見えてしまう。
  await repo.upsert({ ...existing, status: "draft", publishRequestedAt: null });
  revalidatePath("/admin/properties");
  revalidatePath(`/admin/properties/${id}/edit`);
  revalidatePath("/properties");
  revalidatePath(`/properties/${id}`);
  return { ok: true as const };
}

/**
 * 掲載終了（アーカイブ）。**所有者(スタジオ)自身にも許可する。**
 *
 * 公開の取り下げ(unpublishAction)は所有者に開放済み（commit 600dfc8）。掲載終了も
 * 掲載者が自走できるべきという同じ理由で、こちらも requireAdmin から
 * assertPropertyAccess に変更する。
 *
 * 非対称にしてあるのは意図的:
 *   アーカイブ = 所有者可（掲載終了は自分の情報を引っ込めるだけで被害が無い）
 *   公開・削除 = admin のみ（公開は審査を通す必要がある。削除は誤操作被害が大きい）
 */
export async function archiveAction(id: string) {
  await assertPropertyAccess(id);
  const existing = await repo.get(id);
  if (!existing) return { ok: false as const, reason: "not_found" as const };
  // 取り下げ(unpublishAction)と同じ理由でクリアする: 残すと再公開時に審査済みに見えてしまう。
  await repo.upsert({ ...existing, status: "archived", publishRequestedAt: null });
  revalidatePath("/admin/properties");
  revalidatePath("/properties");
  return { ok: true as const };
}

export async function deleteAction(id: string) {
  await requireAdmin();
  const existing = await repo.get(id);
  if (existing) await cleanupPropertyFiles(existing);
  await repo.remove(id);
  revalidatePath("/admin/properties");
  revalidatePath("/properties");
  redirect("/admin/properties");
}

/** 一括: 選択した物件の status をまとめて変更 (publish/draft/archived)。 */
export async function bulkSetStatusAction(
  ids: string[],
  status: "published" | "draft" | "archived",
) {
  await requireAdmin();
  let done = 0;
  const skipped: string[] = [];
  for (const id of ids) {
    const existing = await repo.get(id);
    if (!existing) {
      skipped.push(id);
      continue;
    }
    if (status === "published") {
      const parsed = publishablePropertySchema.safeParse(existing);
      if (!parsed.success) {
        skipped.push(id); // 公開要件を満たさないものはスキップ
        continue;
      }
      // 公開時は申請フラグを消す（publishAction / publishByIdAction と同じ扱い）。
      await repo.upsert(
        stampPublishedAt({ ...parsed.data, status: "published", publishRequestedAt: null }),
      );
    } else {
      await repo.upsert({ ...existing, status });
    }
    done++;
  }
  revalidatePath("/admin/properties");
  revalidatePath("/properties");
  return { ok: true as const, count: done, total: ids.length, skipped };
}

/** 一括: 選択した物件をまとめて削除。 */
export async function bulkDeleteAction(ids: string[]) {
  await requireAdmin();
  for (const id of ids) {
     
    const existing = await repo.get(id);
     
    if (existing) await cleanupPropertyFiles(existing);
     
    await repo.remove(id);
  }
  revalidatePath("/admin/properties");
  revalidatePath("/properties");
  return { ok: true as const, count: ids.length };
}

/** URL（スラッグ＝物件ID）の変更結果。 */
export type RenameState =
  | { ok: true }
  | { ok: false; error: string }
  | undefined;

/** スラッグ（公開URL）を正規化: 英小文字・数字・ハイフンのみ。 */
function normalizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * 物件の公開URL（スラッグ＝ID）を変更する。主に公開前の調整用。
 * 安全なリネーム移行: 新IDで作成→旧ID削除し、リンク/ブックマーク/購入/問い合わせの
 * 参照も付け替える。重複・不正形式は弾く。成功時は新しい編集ページへ遷移。
 */
export async function renamePropertyAction(
  _prev: RenameState,
  formData: FormData,
): Promise<RenameState> {
  const oldId = String(formData.get("oldId") ?? "");
  const newId = normalizeSlug(String(formData.get("newId") ?? ""));
  await assertPropertyAccess(oldId);

  if (!newId) {
    return { ok: false, error: "URLは英小文字・数字・ハイフンで入力してください。" };
  }
  if (newId.length < 2 || newId.length > 60) {
    return { ok: false, error: "URLは2〜60文字にしてください。" };
  }
  if (newId === oldId) {
    return { ok: false, error: "現在のURLと同じです。" };
  }
  const existing = await repo.get(oldId);
  if (!existing) {
    return { ok: false, error: "物件が見つかりません。" };
  }
  if (await repo.get(newId)) {
    return { ok: false, error: `「${newId}」は既に使われています。別のURLにしてください。` };
  }

  // 1) 物件レコードを新IDで作成 → 旧IDを削除（先に作成してデータ消失を防ぐ）。
  await repo.upsert({ ...existing, id: newId });
  await repo.remove(oldId);

  // 2) 参照を移行（公開前の下書きなら大半は空。公開済みでも安全に付け替える）。
  const users = await userRepo.list();
  for (const u of users) {
    const linked = u.linkedPropertyIds ?? [];
    const bms = u.bookmarks ?? [];
    const hasLink = linked.includes(oldId);
    const hasBm = bms.includes(oldId);
    if (hasLink || hasBm) {
      await userRepo.upsert({
        ...u,
        linkedPropertyIds: hasLink ? linked.map((x) => (x === oldId ? newId : x)) : linked,
        bookmarks: hasBm ? bms.map((x) => (x === oldId ? newId : x)) : bms,
      });
    }
  }
  for (const p of await purchaseRepo.list({ propertyId: oldId })) {
    await purchaseRepo.upsert({ ...p, propertyId: newId });
  }
  for (const i of await inquiryRepo.list({ propertyId: oldId })) {
    await inquiryRepo.upsert({ ...i, propertyId: newId });
  }
  // 分配設定(payout_splits)と台帳(payout_ledger)も物件IDに追従させる。
  // 忘れると分配設定が旧IDに取り残され、以後の販売が起票されなくなる。
  await renamePayoutRecordsForProperty(oldId, newId);

  revalidatePath("/admin/properties");
  revalidatePath("/properties");
  revalidatePath(`/properties/${oldId}`);
  revalidatePath(`/properties/${newId}`);
  redirect(`/admin/properties/${newId}/edit`);
}

/** Save the studio page builder blocks for a property. */
export async function saveStudioPageAction(id: string, blocks: unknown) {
  await assertPropertyAccess(id);
  const existing = await repo.get(id);
  if (!existing) return { ok: false as const, reason: "not_found" as const };
  const pageBlocks = z.array(pageBlockSchema).max(60).parse(blocks);
  await repo.upsert({ ...existing, pageBlocks });
  revalidatePath(`/admin/properties/${id}/page`);
  revalidatePath(`/properties/${id}`);
  return { ok: true as const };
}

// ─── Asset library actions ───────────────────────────────────────
export async function renameAssetAction(id: string, label: string) {
  await requireAdmin();
  const a = await assetRepo.get(id);
  if (!a) return { ok: false as const, reason: "not_found" as const };
  await assetRepo.upsert({ ...a, label: label.slice(0, 120) });
  return { ok: true as const };
}

export async function updateAssetTagsAction(id: string, tags: string[]) {
  await requireAdmin();
  const a = await assetRepo.get(id);
  if (!a) return { ok: false as const, reason: "not_found" as const };
  const cleaned = tags.map((t) => t.trim().slice(0, 40)).filter(Boolean);
  await assetRepo.upsert({ ...a, tags: [...new Set(cleaned)] });
  return { ok: true as const };
}

export async function updateAssetThumbnailAction(id: string, thumbnailUrl: string) {
  await requireAdmin();
  const a = await assetRepo.get(id);
  if (!a) return { ok: false as const, reason: "not_found" as const };
  await assetRepo.upsert({ ...a, thumbnailUrl });
  return { ok: true as const };
}

export async function deleteAssetAction(id: string) {
  await requireAdmin();
  const a = await assetRepo.get(id);
  if (!a) return { ok: false as const, reason: "not_found" as const };
  if ((await getUploadMode()) === "r2" && a.r2Key) {
    try {
      await deleteR2Object(a.r2Key);
    } catch (e) {
      console.error("[deleteAsset] R2 delete failed", e);
    }
  }
  await assetRepo.remove(id);
  return { ok: true as const };
}
