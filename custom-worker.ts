/**
 * Worker の入口（2026-09-23）。OpenNext が作る .open-next/worker.js の fetch はそのまま使い、
 * 定期実行（Cron Trigger）だけを足す。wrangler.jsonc の main がこのファイルを指す。
 *
 * 定期実行: 10分ごとに、英語が欠けた物件を自動で英訳する（src/lib/english-fill-job.ts を直接呼ぶ）。
 * 本人ルール「追加時点で翻訳されてほしい」「3DGSが追加された段階でも英語翻訳チェックしてほしい」。
 * 日本語が入る経路（管理画面・公式情報の取り込み・3DGS の登録・下書きの自動作成）を問わず拾う。
 *
 * ⚠ この入口が壊れるとサイト全体が止まる。fetch には一切手を加えないこと。
 */
// OpenNext のビルドで生成されるファイル（型なし）。このファイルは tsconfig の対象外（wrangler がまとめる）。
import handler from "./.open-next/worker.js";
import { runEnglishFill, type EnglishFillDb } from "./src/lib/english-fill-job";

type Env = { ANTHROPIC_API_KEY?: string } & Record<string, unknown>;
type Ctx = { waitUntil(p: Promise<unknown>): void };

export default {
  fetch: handler.fetch,
  async scheduled(_event: unknown, env: Env, ctx: Ctx) {
    const key = env.ANTHROPIC_API_KEY;
    const db = env.DB as EnglishFillDb | undefined;
    if (!key || !db) return;
    // ⚠ サイト自身の URL を fetch しない（自分の独自ドメインへの接続は Cloudflare が 522 で拒否する。
    //    本番のログで確認）。英訳の処理を直接呼ぶ。
    ctx.waitUntil(
      runEnglishFill(db, key).then(
        (r) => console.log("[english-fill]", JSON.stringify(r).slice(0, 2000)),
        (e) => console.log("[english-fill] error", String(e).slice(0, 500)),
      ),
    );
  },
};
