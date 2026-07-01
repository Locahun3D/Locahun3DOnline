"use client";

import { useState } from "react";

interface Result {
  ok: boolean;
  created?: boolean;
  rotated?: boolean;
  exists?: boolean;
  id?: string;
  url?: string;
  events?: string[];
  webhookSecret?: string;
  command?: string;
  message?: string;
  error?: string;
}

/**
 * 管理者がWebhookエンドポイントをワンクリックでStripeに登録するボタン。
 * 登録先の環境はWorkerのSTRIPE_SECRET_KEYと自動一致する（ダッシュボードで環境を探さない）。
 * 新規作成時のみ whsec が表示される → 管理者が wrangler secret put で投入する。
 */
export default function StripeWebhookSetupButton() {
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<Result | null>(null);

  const run = async (rotate: boolean) => {
    setLoading(true);
    setRes(null);
    try {
      const r = await fetch(
        `/api/admin/stripe-setup-webhook${rotate ? "?rotate=1" : ""}`,
        { method: "POST" },
      );
      setRes((await r.json()) as Result);
    } catch (e) {
      setRes({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          disabled={loading}
          onClick={() => run(false)}
          className="mono text-[10px] tracking-[0.2em] uppercase border border-[#5ec8e8] text-[#5ec8e8] px-3 py-1 hover:bg-[#5ec8e8]/10 transition disabled:opacity-40"
        >
          {loading ? "処理中…" : "Webhookを登録"}
        </button>
        {res?.exists && (
          <button
            type="button"
            disabled={loading}
            onClick={() => run(true)}
            title="既存を削除して署名シークレットを再発行"
            className="mono text-[10px] tracking-[0.2em] uppercase border border-amber-400 text-amber-400 px-3 py-1 hover:bg-amber-400/10 transition disabled:opacity-40"
          >
            whsecを再発行
          </button>
        )}
      </div>

      {res && !res.ok && (
        <div className="text-[11px] text-red-400">エラー: {res.error}</div>
      )}

      {res?.ok && res.exists && (
        <div className="text-[11px] text-muted">{res.message}</div>
      )}

      {res?.ok && res.webhookSecret && (
        <div className="space-y-1.5 border border-[#5ec8e8]/40 bg-[#0a0a0a] p-3">
          <div className="text-[11px] text-green-400">
            {res.rotated ? "Webhookを再発行しました" : "Webhookを登録しました"}（{res.url}）
          </div>
          <div className="mono text-[10px] text-muted uppercase tracking-[0.2em]">
            署名シークレット（この画面でだけ表示・要コピー）
          </div>
          <pre className="bg-black border border-line p-2 mono text-[11px] text-accent overflow-x-auto whitespace-pre select-all">
            {res.webhookSecret}
          </pre>
          <div className="mono text-[10px] text-muted uppercase tracking-[0.2em] mt-2">
            ターミナルで投入（値の入力を求められたら上のwhsecを貼付）
          </div>
          <pre className="bg-black border border-line p-2 mono text-[11px] overflow-x-auto whitespace-pre select-all">
            {res.command}
          </pre>
          <div className="text-[10px] text-amber-400/80">
            ※ 投入後は再デプロイ不要でWorkerに即反映されます（wrangler secret put で反映）。
          </div>
        </div>
      )}
    </div>
  );
}
