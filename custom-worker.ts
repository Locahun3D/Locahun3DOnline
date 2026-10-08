/**
 * Worker の入口（2026-09-23）。OpenNext が作る .open-next/worker.js の fetch はそのまま使い、
 * 定期実行（Cron Trigger）だけを足す。wrangler.jsonc の main がこのファイルを指す。
 *
 * 定期実行: 10分ごとに、英語が欠けた物件を自動で英訳する（src/lib/english-fill-job.ts を直接呼ぶ）。
 * 本人ルール「追加時点で翻訳されてほしい」「3DGSが追加された段階でも英語翻訳チェックしてほしい」。
 * 日本語が入る経路（管理画面・公式情報の取り込み・3DGS の登録・下書きの自動作成）を問わず拾う。
 *
 * 定期実行2（2026-10-08）: みなし承認（施設掲載規約 第4条3項）。確認メールから14日で再確認メールを1通、
 * 再確認から7日で回答が無ければ公開する（src/lib/deemed-approval-job.ts）。英訳とは独立に動く。
 *
 * ⚠ この入口が壊れるとサイト全体が止まる。fetch には一切手を加えないこと。
 */
// OpenNext のビルドで生成されるファイル（型なし）。このファイルは tsconfig の対象外（wrangler がまとめる）。
import handler from "./.open-next/worker.js";
import { runEnglishFill, type EnglishFillDb } from "./src/lib/english-fill-job";
import { runDeemedApproval, type DeemedApprovalDb } from "./src/lib/deemed-approval-job";

type Env = { ANTHROPIC_API_KEY?: string } & Record<string, unknown>;
type Ctx = { waitUntil(p: Promise<unknown>): void };

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

export default {
  fetch: handler.fetch,
  async scheduled(_event: unknown, env: Env, ctx: Ctx) {
    const db = env.DB as (EnglishFillDb & DeemedApprovalDb) | undefined;
    if (!db) return;

    const dryFlag = (str(env.MAIL_DRY_RUN) ?? "").toLowerCase();
    ctx.waitUntil(
      runDeemedApproval(db, {
        resendApiKey: str(env.RESEND_API_KEY) ?? null,
        dryRun: dryFlag === "1" || dryFlag === "true",
        appUrl: str(env.NEXT_PUBLIC_APP_URL),
        operator: str(env.EMAIL_OPERATOR),
        replyFrom: str(env.EMAIL_REPLY_FROM),
      }).then(
        (r) => {
          if (r.report.length) console.log("[deemed-approval]", JSON.stringify(r).slice(0, 2000));
        },
        (e) => console.log("[deemed-approval] error", String(e).slice(0, 500)),
      ),
    );

    const key = env.ANTHROPIC_API_KEY ?? null;
    const ai = (env.AI as Parameters<typeof runEnglishFill>[1]["ai"]) ?? null;
    if (!key && !ai) return;
    // ⚠ サイト自身の URL を fetch しない（自分の独自ドメインへの接続は Cloudflare が 522 で拒否する。
    //    本番のログで確認）。英訳の処理を直接呼ぶ。
    ctx.waitUntil(
      runEnglishFill(db, { apiKey: key, ai }).then(
        (r) => console.log("[english-fill]", JSON.stringify(r).slice(0, 2000)),
        (e) => console.log("[english-fill] error", String(e).slice(0, 500)),
      ),
    );
  },
};
