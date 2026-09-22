import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getD1 } from "@/lib/d1";
import { runEnglishFill } from "@/lib/english-fill-job";
import { englishFillToken, sameToken } from "@/lib/english-fill-token";

export const dynamic = "force-dynamic";

/**
 * 英語の自動補完を手で1回走らせる入口（2026-09-23）。ふだんは Worker の定期実行
 * （custom-worker.ts → runEnglishFill を直接）が10分ごとに走るので、ここは確認用。
 * 呼べるのは ANTHROPIC_API_KEY から作った印を持つ呼び出しだけ（新しい秘密は増やさない）。
 */
export async function POST(req: Request) {
  const { env } = await getCloudflareContext();
  const key = (env as Record<string, unknown>).ANTHROPIC_API_KEY;
  if (typeof key !== "string" || !key) return Response.json({ error: "no_key" }, { status: 503 });
  const token = req.headers.get("x-english-fill-token") || "";
  if (!sameToken(token, await englishFillToken(key))) return Response.json({ error: "forbidden" }, { status: 403 });
  const db = await getD1();
  if (!db) return Response.json({ error: "no_db" }, { status: 503 });
  return Response.json({ ok: true, ...(await runEnglishFill(db, key)) });
}
