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
 * 定期実行3（2026-10-14）: 3DGS シーンの容量表示を R2 の実ファイルに合わせる（src/lib/scene-size-job.ts）。
 * 仮ファイルで登録して本物で上書きする手順だと「1 MB」と出たままになる（本人「1mbになるバグなおして」）。
 *
 * ⚠ この入口が壊れるとサイト全体が止まる。fetch には一切手を加えないこと。
 */
// OpenNext のビルドで生成されるファイル（型なし）。このファイルは tsconfig の対象外（wrangler がまとめる）。
import handler from "./.open-next/worker.js";
import { runEnglishFill, type EnglishFillDb } from "./src/lib/english-fill-job";
import { runDeemedApproval, type DeemedApprovalDb } from "./src/lib/deemed-approval-job";
import { runSceneSizeFix, type SceneSizeBucket, type SceneSizeDb } from "./src/lib/scene-size-job";
import { runMediaEnglish, type MediaEnglishBucket } from "./src/lib/media-english-job";

type Env = { ANTHROPIC_API_KEY?: string } & Record<string, unknown>;
type Ctx = { waitUntil(p: Promise<unknown>): void };

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

export default {
  fetch: handler.fetch,
  async scheduled(_event: unknown, env: Env, ctx: Ctx) {
    const db = env.DB as (EnglishFillDb & DeemedApprovalDb & SceneSizeDb) | undefined;
    if (!db) return;

    const bucket = env.R2_ASSETS as SceneSizeBucket | undefined;
    if (bucket) {
      ctx.waitUntil(
        runSceneSizeFix(db, bucket).then(
          (r) => {
            if (r.fixed) console.log("[scene-size]", JSON.stringify(r).slice(0, 2000));
          },
          (e) => console.log("[scene-size] error", String(e).slice(0, 500)),
        ),
      );
    }

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
    // 図面とビューアー注釈の英訳（画像の文字は Claude で読む）。
    // 鍵が効かないときは文字の翻訳だけ Workers AI に回す（画像は鍵が直るまで後回し）。
    if (bucket) {
      ctx.waitUntil(
        runMediaEnglish(db, bucket as unknown as MediaEnglishBucket, { apiKey: key, ai }).then(
          (r) => { if (r.report.length) console.log("[media-english]", JSON.stringify(r).slice(0, 2000)); },
          (e) => console.log("[media-english] error", String(e).slice(0, 500)),
        ),
      );
    }
  },
};
