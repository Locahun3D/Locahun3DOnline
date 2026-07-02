import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/dal";
import { assetRepo } from "@/lib/store";
import { getUploadMode, statR2Object } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 24h より古い uploading 行は「完了し得ない失敗アップロード」とみなして掃除する。 */
const STALE_UPLOADING_MS = 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
  await requireAdmin();
  let body: { id?: string; width?: number; height?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "no_id" }, { status: 400 });

  const pending = await assetRepo.get(id);
  if (!pending) return NextResponse.json({ error: "unknown_asset" }, { status: 404 });

  // ── R2 実在確認ゲート ─────────────────────────────────────────────
  // presign 時点で D1 行が先にできる構造上、PUT が無言で失敗しても
  // ここに到達し得る。オブジェクトの存在（＋サイズ一致）を確認できない限り
  // 絶対に ready へ倒さない。壊れた参照が splatUrl になる事故の元栓。
  if (pending.r2Key && (await getUploadMode()) === "r2") {
    let stat: { size: number } | null;
    try {
      stat = await statR2Object(pending.r2Key);
    } catch (e) {
      console.error("[assets/commit] R2 verify failed:", e);
      return NextResponse.json(
        {
          error: "verify_failed",
          message:
            "ストレージの確認に失敗しました。時間をおいて再度アップロードしてください。",
        },
        { status: 502 },
      );
    }
    if (!stat) {
      return NextResponse.json(
        {
          error: "object_missing",
          message:
            "アップロードされたファイルがストレージに存在しません（転送が完了していない可能性があります）。もう一度アップロードしてください。",
        },
        { status: 409 },
      );
    }
    if (pending.size > 0 && stat.size > 0 && stat.size !== pending.size) {
      return NextResponse.json(
        {
          error: "size_mismatch",
          message: `アップロードが途中で終わっています（期待 ${pending.size} バイト / 実際 ${stat.size} バイト）。もう一度アップロードしてください。`,
        },
        { status: 409 },
      );
    }
  }

  const asset = await assetRepo.upsert({
    ...pending,
    status: "ready",
    width: body.width ?? pending.width,
    height: body.height ?? pending.height,
  });

  // ── 失敗アップロードの残骸掃除（ベストエフォート）─────────────────
  // リトライのたびに新 ID の uploading 行が積み上がる問題への対処。
  // 同じ kind+filename で 24h 以上前から uploading のまま残っている行は
  // もう完了し得ない（presign URL は 10 分で失効）ので、メタと R2 blob を削除。
  // 進行中アップロードを誤殺しないよう 24h マージンを取る。失敗しても commit
  // の成功は妨げない。
  try {
    const cutoff = Date.now() - STALE_UPLOADING_MS;
    const stale = (await assetRepo.list({ kind: pending.kind, status: "uploading" })).filter(
      (a) =>
        a.id !== asset.id &&
        a.filename === pending.filename &&
        new Date(a.uploadedAt ?? 0).getTime() < cutoff,
    );
    for (const a of stale) await assetRepo.remove(a.id);
    if (stale.length) {
      console.log(`[assets/commit] cleaned ${stale.length} stale uploading assets for ${pending.filename}`);
    }
  } catch (e) {
    console.warn("[assets/commit] stale cleanup failed:", e);
  }

  return NextResponse.json({ ok: true, asset });
}
