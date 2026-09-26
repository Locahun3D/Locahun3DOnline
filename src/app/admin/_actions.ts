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
import { renamePayoutRecordsForProperty, autoCreateStudioVenueSplit } from "@/lib/payouts";
import { newStudioApproveKey } from "@/lib/studio-approval";
import { propertyEmbedRepo } from "@/lib/property-embeds";
import { embedUrl as buildEmbedUrl } from "@/lib/embed-snippet";

/** メールに載せる埋め込みURL。サイトの絶対URLは lib/email.ts と同じ決め方にそろえる。 */
const appEmbedUrl = (token: string) =>
  buildEmbedUrl(process.env.NEXT_PUBLIC_APP_URL || "https://locahun3d.com", token);
import { fillPropertyEnglish, fillPropertyEnglishWithReport, needsEnglish } from "@/lib/property-translate";
import type { TranslateFailure } from "@/lib/ai-translate";
import {
  propertySchema,
  publishablePropertySchema,
  pageBlockSchema,
  type Property,
} from "@/lib/schemas";
import { publishReadiness } from "@/lib/publish-readiness";
import {
  canRequestReview,
  canResendStudioMail,
  canReusePreview,
  enterReview,
  markPublished,
  recordStudioNotified,
  resetReview,
  setStudioConfirmed,
  translationGuard,
  publishStage,
  type MailOutcome,
} from "@/lib/publish-flow";
import { propertyPreviewRepo, type PropertyPreview } from "@/lib/property-previews";
import {
  dataSaleConsentOf,
  markDataSaleAsked,
  recordDataSaleAnswer,
  proposedSalePrice,
} from "@/lib/data-sale-consent";

/**
 * 確認メールで3Dデータ販売の許諾も聞くか（2026-09-26 本人指示）。
 * すでに「販売OK」をもらっている物件には聞き直さない（規約の同送はメール側で常に行う）。
 */
function dataSaleAsk(p: Property): { price: number } | undefined {
  return dataSaleConsentOf(p).status === "granted" ? undefined : { price: proposedSalePrice(p) };
}

/**
 * 確認メールに写真の投稿口の案内を入れる（2026-09-26 本人指示）。
 * 公開に必要なギャラリーはカバー以外6枚。足りていても追加は歓迎なので節自体は出す。
 */
function photoAsk(p: Property): { missing: number } {
  return { missing: Math.max(0, 6 - p.gallery.length) };
}
import { sendStudioReviewMail } from "@/lib/email";
import {sceneEditAssetProtection} from '@/lib/scene-edit-asset-protection';

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
  if(await sceneEditAssetProtection({id:'',url,r2Key:toR2Key(url)??''},()=>repo.list()))return;
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
    // 公開ワークフローの監査記録も同じくサーバ管理（2026-09-20）。フォームは古い値を
    // 持ち回るだけなので、常に既存値を正とする（専用アクションは展開後に上書きする）。
    publishFlow: existing.publishFlow ?? incoming.publishFlow,
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

export async function publishAction(input: unknown, opts?: { expectedUpdatedAt?: string }) {
  const parsed = publishablePropertySchema.parse(input);
  // 公開は運営の審査を通す（studio は requestPublishAction で申請のみ）。
  // 未審査の物件が公開されるとカタログ品質＝商品価値を毀損するため。
  await requireAdmin();
  const existing = await repo.get(parsed.id);
  if (opts?.expectedUpdatedAt && existing?.updatedAt && existing.updatedAt !== opts.expectedUpdatedAt) {
    return { ok: false as const, conflict: true as const, serverUpdatedAt: existing.updatedAt };
  }
  let toPublish: Property = stampPublishedAt(
    markPublished(mergeManaged(parsed, existing), new Date().toISOString()),
  );
  // 公開時に英語(EN欄)が空のフィールドを自動翻訳で埋める。
  // 翻訳失敗・キー未設定でも公開は必ず通す（日本語表示にフォールバック）。
  try {
    toPublish = await fillPropertyEnglish(toPublish);
  } catch {
    /* 翻訳できなくても公開は継続 */
  }
  // Translation may take seconds. Recheck before writing so another editor's
  // update during that wait is not replaced by this earlier snapshot.
  if (opts?.expectedUpdatedAt) {
    const current = await repo.get(parsed.id);
    if (current?.updatedAt && current.updatedAt !== opts.expectedUpdatedAt) {
      return { ok: false as const, conflict: true as const, serverUpdatedAt: current.updatedAt };
    }
  }
  const saved = await repo.upsert(toPublish);
  // 直接掲載スタジオの分配自動設定。受取者が未登録なら何もしない設計なので
  // 失敗しても公開自体は止めない（翻訳フォールバックと同じ扱い）。
  try {
    await autoCreateStudioVenueSplit(toPublish.id, toPublish.ownerId);
  } catch {
    /* 分配自動設定に失敗しても公開は継続。/admin/payouts で手動対応可 */
  }
  revalidatePath("/admin/properties");
  revalidatePath(`/admin/properties/${parsed.id}/edit`);
  revalidatePath("/properties");
  revalidatePath(`/properties/${parsed.id}`);
  revalidatePath("/");
  return { ok: true as const, id: parsed.id, updatedAt: saved.updatedAt, status: saved.status, property: saved };
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

  // ⚠ 3DGS以外が揃っていない申請は受け付けない。中身が空のまま申請されると、
  //    運営は撮影に行く前に不足項目を1件ずつ問い合わせることになり申請の意味がなくなる。
  //    判定は publish-readiness に集約（同じ関数をエディターの表示側でも使う＝二重防御）。
  const readiness = publishReadiness(existing);
  if (!readiness.ready) {
    return {
      ok: false as const,
      error: `3DGS以外の項目を入力してから申請してください。未入力: ${readiness.missing.join("、")}`,
    };
  }

  const requestedAt = new Date().toISOString();
  await repo.upsert({
    ...existing,
    publishRequestedAt: requestedAt,
    publishFlow: { ...existing.publishFlow, requestedAt, requestedBy: user.email || user.name },
  });

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

// ─── 公開ワークフロー（下書き → 公開申請 → 公開） 2026-09-20 ─────────────
// 設計: docs/property-publish-workflow-2026-09-20.md ／ 判断ロジック: lib/publish-flow.ts
//
// ⚠ ここのアクションはスタジオへ**社外メールを送る**。呼び出し元は運営が押すボタンだけ
//   （エディターの「公開申請する」「確認メールを再送」）。スクリプト・取り込み・ページ表示の
//   副作用から呼ばないこと。RESEND_API_KEY の無い環境（開発・テスト）では送信せずログだけ
//   出し、記録にも dry-run と残す（lib/email.ts の mailDryRun）。

/** 既存のプレビューリンクの残りが十分ならそのまま使う（共有済みURLを壊さない）。足りなければ再発行。 */
async function ensurePreview(propertyId: string): Promise<PropertyPreview> {
  const current = await propertyPreviewRepo.findByProperty(propertyId);
  if (current && canReusePreview(current)) return current;
  return propertyPreviewRepo.create({ propertyId });
}

type FlowOk = {
  ok: true;
  updatedAt: string | undefined;
  property: Property;
  mailMode: "sent" | "dry-run" | "skipped";
  mailTo: string | null;
  previewExpiresAt: string | null;
};
type FlowErr = { ok: false; conflict?: true; error: string };

/**
 * 下書き → 公開申請。
 *  1. 公開に必要な項目の検証  2. 英訳（自動翻訳。埋まらなければ中止）
 *  3. プレビューリンクの確保  4. スタジオへ確認メール  5. 記録して保存（書き込みは1回）
 * どこかで失敗したら何も保存せずエラーを返す（＝申請中にならない）。
 */
export async function requestReviewAction(
  input: unknown,
  opts?: { expectedUpdatedAt?: string; skipMail?: boolean },
): Promise<FlowOk | FlowErr> {
  const user = await requireAdmin();
  const parsed = propertySchema.parse(input);
  const existing = await repo.get(parsed.id);
  if (!existing) return { ok: false, error: "物件が見つかりません" };
  if (opts?.expectedUpdatedAt && existing.updatedAt && existing.updatedAt !== opts.expectedUpdatedAt) {
    return { ok: false, conflict: true, error: "別のタブでこの物件が更新されています。" };
  }
  const skipMail = !!opts?.skipMail;
  const merged = mergeManaged(parsed, existing);

  const guard = canRequestReview(merged, { skipMail });
  if (!guard.ok) return { ok: false, error: guard.error };

  // 翻訳は必須。fillPropertyEnglish は失敗しても例外を投げず元のまま返すので、
  // 結果を translationGuard で検査して「埋まっていなければ止める」。
  let translated: Property = merged;
  let translateFailure: TranslateFailure | undefined;
  try {
    const report = await fillPropertyEnglishWithReport(merged);
    translated = report.property;
    translateFailure = report.failure;
  } catch {
    /* 下の translationGuard が未翻訳として弾く */
  }
  const tg = translationGuard(translated, translateFailure);
  if (!tg.ok) return { ok: false, error: tg.error };

  // 翻訳は数秒かかる。その間に別の保存が入っていたら上書きしない。
  if (opts?.expectedUpdatedAt) {
    const current = await repo.get(parsed.id);
    if (current?.updatedAt && current.updatedAt !== opts.expectedUpdatedAt) {
      return { ok: false, conflict: true, error: "別のタブでこの物件が更新されています。" };
    }
  }

  let mail: MailOutcome = { mode: "skipped" };
  let previewExpiresAt: string | null = null;
  let approveKeyHash: string | null = null;
  if (!skipMail) {
    const preview = await ensurePreview(parsed.id);
    previewExpiresAt = preview.expiresAt;
    const approve = newStudioApproveKey();
    approveKeyHash = approve.hash;
    // 自社サイトへ貼れる3Dツアーの恒久URL（2026-09-21 本人指示）。
    // ensure なので、既にあるトークンは作り直さない（先方が貼ったコードを切らない）。
    const embed = await propertyEmbedRepo.ensure(parsed.id).catch(() => null);
    const sent = await sendStudioReviewMail({
      approveKey: approve.key,
      embedUrl: embed ? appEmbedUrl(embed.token) : undefined,
      to: translated.contactEmail,
      studioName: translated.title,
      previewPath: `/preview/${preview.token}`,
      previewExpiresAt: preview.expiresAt,
      dataSale: dataSaleAsk(translated),
      photoUpload: photoAsk(translated),
    });
    if (sent.status === "failed") {
      return { ok: false, error: `${sent.error} 公開申請にはしていません。時間をおいて再実行してください。` };
    }
    mail = { mode: sent.status, to: sent.to, approveKeyHash };
  }

  // 2026-09-23: メール送信には数秒かかる。その間に別の保存（エディターの自動保存など）が入って
  // いたら、翻訳前の内容で上書きせず、最新の保存内容に申請の記録だけを入れる（英語欄は定期処理が埋める）。
  const flowOpts = { by: user.email || user.name, now: new Date().toISOString(), mail };
  let saved: Property;
  try {
    const latest = await repo.get(parsed.id);
    const base = latest && latest.updatedAt !== existing.updatedAt ? latest : translated;
    const withFlow = enterReview(base, flowOpts);
    // 販売許諾の回答リンクは掲載の承認キーと同じキーを使う（メールは1通・リンクは2種類）。
    // ハッシュは dataSaleConsent 側にも持たせる（公開時に承認キーを消しても回答できるように）。
    saved = await repo.upsert(
      !skipMail && approveKeyHash
        ? markDataSaleAsked(withFlow, {
            now: flowOpts.now,
            keyHash: approveKeyHash,
            proposedPrice: proposedSalePrice(withFlow),
          })
        : withFlow,
    );
  } catch {
    if (mail.mode === "sent") {
      return {
        ok: false,
        error: `スタジオへの確認メールは送信しましたが、申請の記録を保存できませんでした（メールの承認ボタンは使えません）。もう一度「申請メールを送る」を押してください（${mail.to} に2通目が届きます）。`,
      };
    }
    return { ok: false, error: "申請の記録を保存できませんでした。もう一度押してください。" };
  }
  revalidatePath("/admin/properties");
  revalidatePath(`/admin/properties/${parsed.id}/edit`);
  return {
    ok: true,
    updatedAt: saved.updatedAt,
    property: saved,
    mailMode: mail.mode,
    mailTo: mail.mode === "skipped" ? null : mail.to,
    previewExpiresAt,
  };
}

/**
 * 一覧の行から「申請メールを送る」を押したときの入口（2026-09-21 本人指示）。
 * 一覧はフォームの値を持たないので、保存済みの内容を読んで requestReviewAction に渡すだけ。
 * メール送信・翻訳・プレビュー確保のロジックは絶対に複製しない（分岐すると送信条件がずれる）。
 */
export async function requestReviewByIdAction(id: string): Promise<FlowOk | FlowErr> {
  await requireAdmin();
  const existing = await repo.get(id);
  if (!existing) return { ok: false, error: "物件が見つかりません" };
  return requestReviewAction(existing, { expectedUpdatedAt: existing.updatedAt });
}

/**
 * 確認メールの再送。保存済みの内容（contactEmail）宛に送る。
 * 二重送信の防止: クライアントの確認ダイアログ + サーバー側 60 秒クールダウン。
 */
export async function resendStudioReviewMailAction(id: string): Promise<FlowOk | FlowErr> {
  await requireAdmin();
  const existing = await repo.get(id);
  if (!existing) return { ok: false, error: "物件が見つかりません" };
  const guard = canResendStudioMail(existing);
  if (!guard.ok) return { ok: false, error: guard.error };
  // 再送でも「申請中＝英訳済み」を崩さない（申請後に日本語を足して EN が空のまま、を送らない）。
  const tg = translationGuard(existing);
  if (!tg.ok) return { ok: false, error: `${tg.error} いったん申請を取り下げ、「公開申請する」をやり直すと自動翻訳されます。` };
  const preview = await ensurePreview(id);
  const approve = newStudioApproveKey();
  const embed = await propertyEmbedRepo.ensure(id).catch(() => null);
  const sent = await sendStudioReviewMail({
    approveKey: approve.key,
    embedUrl: embed ? appEmbedUrl(embed.token) : undefined,
    to: existing.contactEmail,
    studioName: existing.title,
    previewPath: `/preview/${preview.token}`,
    previewExpiresAt: preview.expiresAt,
    // 初回を「送らずに申請中」にしていた場合、これが1通目なので【再送】は付けない。
    resend: !!existing.publishFlow.studioNotifiedAt,
    dataSale: dataSaleAsk(existing),
    photoUpload: photoAsk(existing),
  });
  if (sent.status === "failed") return { ok: false, error: sent.error };
  // 送信中に別の保存が入っていても消さないよう、最新の保存内容に送信の記録だけを足す（2026-09-23）。
  const latest = (await repo.get(id)) ?? existing;
  const now = new Date().toISOString();
  const saved = await repo.upsert(
    markDataSaleAsked(
      recordStudioNotified(latest, {
        now,
        mail: { mode: sent.status, to: sent.to, approveKeyHash: approve.hash },
      }),
      { now, keyHash: approve.hash, proposedPrice: proposedSalePrice(latest) },
    ),
  );
  revalidatePath("/admin/properties");
  revalidatePath(`/admin/properties/${id}/edit`);
  return {
    ok: true,
    updatedAt: saved.updatedAt,
    property: saved,
    mailMode: sent.status,
    mailTo: sent.to,
    previewExpiresAt: preview.expiresAt,
  };
}

/** 「スタジオ確認済みにする」の手動チェック（スタジオの返事はメールで来るため運営が記録する）。 */
export async function setStudioConfirmedAction(
  id: string,
  confirmed: boolean,
): Promise<{ ok: true; updatedAt: string | undefined; property: Property } | FlowErr> {
  await requireAdmin();
  const existing = await repo.get(id);
  if (!existing) return { ok: false, error: "物件が見つかりません" };
  if (publishStage(existing) !== "review") {
    return { ok: false, error: "公開申請中の物件ではありません。" };
  }
  const saved = await repo.upsert(
    setStudioConfirmed(existing, { confirmed, now: new Date().toISOString() }),
  );
  revalidatePath("/admin/properties");
  revalidatePath(`/admin/properties/${id}/edit`);
  return { ok: true, updatedAt: saved.updatedAt, property: saved };
}

/**
 * 3Dデータ販売の許諾を運営が手で記録する（2026-09-26）。
 * スタジオが電話・口頭・メール本文で答えたときの受け皿。スタジオ自身の回答リンクは
 * preview/[token]/_actions.ts の studioDataSaleAction。
 */
export async function setDataSaleConsentAction(
  id: string,
  answer: "granted" | "declined" | "reset",
  note?: string,
): Promise<{ ok: true; updatedAt: string | undefined; property: Property } | FlowErr> {
  await requireAdmin();
  const existing = await repo.get(id);
  if (!existing) return { ok: false, error: "物件が見つかりません" };
  const now = new Date().toISOString();
  const next =
    answer === "reset"
      ? { ...existing, dataSaleConsent: { ...dataSaleConsentOf(existing), status: "asked" as const, answeredAt: null, answeredVia: null } }
      : recordDataSaleAnswer(existing, { answer, now, via: "admin", note });
  const saved = await repo.upsert(next);
  revalidatePath("/admin/properties");
  revalidatePath(`/admin/properties/${id}/edit`);
  return { ok: true, updatedAt: saved.updatedAt, property: saved };
}

/** 申請を取り下げて下書きへ戻す（メールは送らない。プレビューリンクは残す）。 */
export async function withdrawReviewAction(
  id: string,
): Promise<{ ok: true; updatedAt: string | undefined; property: Property } | FlowErr> {
  await requireAdmin();
  const existing = await repo.get(id);
  if (!existing) return { ok: false, error: "物件が見つかりません" };
  if (publishStage(existing) !== "review") {
    return { ok: false, error: "公開申請中の物件ではありません。" };
  }
  const saved = await repo.upsert(resetReview(existing));
  revalidatePath("/admin/properties");
  revalidatePath(`/admin/properties/${id}/edit`);
  return { ok: true, updatedAt: saved.updatedAt, property: saved };
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
  await repo.upsert(stampPublishedAt(markPublished(parsed.data, new Date().toISOString())));
  try {
    await autoCreateStudioVenueSplit(parsed.data.id, parsed.data.ownerId);
  } catch {
    /* 分配自動設定に失敗しても公開は継続。/admin/payouts で手動対応可 */
  }
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
export async function unpublishAction(id: string, opts?: { expectedUpdatedAt?: string }) {
  await assertPropertyAccess(id);
  const existing = await repo.get(id);
  if (!existing) return { ok: false as const, reason: "not_found" as const };
  if (opts?.expectedUpdatedAt && existing.updatedAt && existing.updatedAt !== opts.expectedUpdatedAt) {
    return { ok: false as const, conflict: true as const, serverUpdatedAt: existing.updatedAt };
  }
  // 取り下げたら過去の公開申請は無効。残すと再公開時に審査済みに見えてしまう。
  const saved = await repo.upsert({ ...resetReview(existing), status: "draft" });
  revalidatePath("/admin/properties");
  revalidatePath(`/admin/properties/${id}/edit`);
  revalidatePath("/properties");
  revalidatePath(`/properties/${id}`);
  return { ok: true as const, updatedAt: saved.updatedAt, status: saved.status };
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
  await repo.upsert({ ...resetReview(existing), status: "archived" });
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
      await repo.upsert(stampPublishedAt(markPublished(parsed.data, new Date().toISOString())));
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
  // ⚠ URLを能動的に変更した時点で「確認した」とみなし urlConfirmedAt を立てる
  //   （公開申請の必須項目。publishablePropertySchema参照）。
  await repo.upsert({ ...existing, id: newId, urlConfirmedAt: new Date().toISOString() });
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

/**
 * URLを変更せず「このURLでよい」と確認したことを記録する。
 * renamePropertyAction と同じ urlConfirmedAt を、リネームせずに立てるための
 * 軽量版（自動生成IDのままで問題ない物件向け）。
 * ⚠ ここではリダイレクトしない（呼び出し元 SlugEditor は編集フォームの中に
 *   埋め込まれており、ページ遷移すると入力中の他フィールドが失われる）。
 *   戻り値の確認時刻を使って、呼び出し側が RHF の urlConfirmedAt を
 *   その場で更新する（サーバー側は直接 upsert 済みなので反映は保証される）。
 */
export async function confirmPropertySlugAction(id: string): Promise<{ ok: boolean; confirmedAt?: string }> {
  await assertPropertyAccess(id);
  const existing = await repo.get(id);
  if (!existing) return { ok: false };
  const confirmedAt = new Date().toISOString();
  await repo.upsert({ ...existing, urlConfirmedAt: confirmedAt });
  revalidatePath(`/admin/properties/${id}/edit`);
  return { ok: true, confirmedAt };
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
  const protection=await sceneEditAssetProtection(a,()=>repo.list());
  if(protection)return {ok:false as const,reason:protection};
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
