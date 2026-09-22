import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getD1 } from "@/lib/d1";
import { propertySchema, type Property } from "@/lib/schemas";
import { missingEnglishFields } from "@/lib/property-english";
import { fillPropertyEnglishWithReport } from "@/lib/property-translate";
import { englishFillToken, sameToken } from "@/lib/english-fill-token";

export const dynamic = "force-dynamic";

/**
 * 英語が欠けた物件を見つけて、自動で英訳する（2026-09-23 本人ルール「追加時点で翻訳されてほしい」
 * 「3DGSが追加された段階でも英語翻訳チェックしてほしい」）。
 *
 * 呼ぶのは定期実行（custom-worker.ts の scheduled、10分ごと）だけ。日本語が入る経路は
 * 管理画面の保存・パイプライン（公式情報の取り込み・3DGS の登録・下書きの自動作成）と複数あり、
 * パイプラインを動かす PC には翻訳の鍵が無い。どの経路で入っても、ここで拾って埋める。
 *
 * 安全策:
 *  - 直近5分に更新された物件は触らない（編集画面を開いている人の保存と衝突させない）。
 *  - 書くのは英語欄だけ。読んだ時点の updated_at と一致するときだけ書く（条件付き更新）。
 *  - 1回に訳すのは MAX_PER_RUN 件まで（時間と費用の上限）。
 *  - 公開中の物件も英語欄は埋める（英語欄だけの変更は公開内容の日本語を変えない）。
 */
const MAX_PER_RUN = 3;
const QUIET_MS = 5 * 60 * 1000;

type Row = { id: string; status: string; updated_at: string; data: string };

export async function POST(req: Request) {
  const { env } = await getCloudflareContext();
  const key = (env as Record<string, unknown>).ANTHROPIC_API_KEY;
  if (typeof key !== "string" || !key) return Response.json({ error: "no_key" }, { status: 503 });
  const token = req.headers.get("x-english-fill-token") || "";
  if (!sameToken(token, await englishFillToken(key))) return Response.json({ error: "forbidden" }, { status: 403 });

  const db = await getD1();
  if (!db) return Response.json({ error: "no_db" }, { status: 503 });
  const rows = ((await db.prepare("SELECT id, status, updated_at, data FROM properties WHERE status != 'archived' ORDER BY updated_at DESC").all()) as { results?: Row[] }).results ?? [];

  const now = Date.now();
  const report: { id: string; filled?: string[]; left?: string[]; skipped?: string; failure?: string }[] = [];
  let translated = 0;
  for (const row of rows) {
    if (translated >= MAX_PER_RUN) break;
    let p: Property;
    try {
      p = propertySchema.parse(JSON.parse(row.data));
    } catch {
      continue;
    }
    const missing = missingEnglishFields(p);
    if (!missing.length) continue;
    if (now - Date.parse(row.updated_at) < QUIET_MS) {
      report.push({ id: row.id, skipped: "recently_edited" });
      continue;
    }
    translated++;
    const { property, failure } = await fillPropertyEnglishWithReport(p);
    const left = missingEnglishFields(property);
    const filled = missing.filter((m) => !left.includes(m));
    if (!filled.length) {
      report.push({ id: row.id, left, failure: failure?.kind ?? "none" });
      continue;
    }
    const updatedAt = new Date().toISOString();
    const next = JSON.stringify({ ...property, updatedAt });
    const res = (await db
      .prepare("UPDATE properties SET data = ?, updated_at = ? WHERE id = ? AND updated_at = ? AND data = ?")
      .bind(next, updatedAt, row.id, row.updated_at, row.data)
      .run()) as { meta?: { changes?: number } };
    if (!res.meta?.changes) {
      report.push({ id: row.id, skipped: "changed_meanwhile" });
      continue;
    }
    report.push({ id: row.id, filled, left });
  }
  return Response.json({ ok: true, translated, report });
}
