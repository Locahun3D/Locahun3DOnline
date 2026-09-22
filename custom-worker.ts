/**
 * Worker の入口（2026-09-23）。OpenNext が作る .open-next/worker.js の fetch はそのまま使い、
 * 定期実行（Cron Trigger）だけを足す。wrangler.jsonc の main がこのファイルを指す。
 *
 * 定期実行: 10分ごとに、英語が欠けた物件を自動で英訳する（/api/internal/english-fill）。
 * 本人ルール「追加時点で翻訳されてほしい」「3DGSが追加された段階でも英語翻訳チェックしてほしい」。
 * 日本語が入る経路（管理画面・公式情報の取り込み・3DGS の登録・下書きの自動作成）を問わず拾う。
 *
 * ⚠ この入口が壊れるとサイト全体が止まる。fetch には一切手を加えないこと。
 */
// OpenNext のビルドで生成されるファイル（型なし）。このファイルは tsconfig の対象外（wrangler がまとめる）。
import handler from "./.open-next/worker.js";
import { englishFillToken } from "./src/lib/english-fill-token";

type Env = { ANTHROPIC_API_KEY?: string } & Record<string, unknown>;
type Ctx = { waitUntil(p: Promise<unknown>): void };

export default {
  fetch: handler.fetch,
  async scheduled(_event: unknown, env: Env, ctx: Ctx) {
    const key = env.ANTHROPIC_API_KEY;
    if (!key) return;
    const request = new Request("https://locahun3d.com/api/internal/english-fill", {
      method: "POST",
      headers: { "x-english-fill-token": await englishFillToken(key) },
    });
    ctx.waitUntil(
      handler.fetch(request, env, ctx).then(async (res: Response) => {
        // 結果は Workers のログ（observability）に残す。
        console.log("[english-fill]", res.status, (await res.text()).slice(0, 2000));
      }),
    );
  },
};
