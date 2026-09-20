"use client";

import { useEffect, useState } from "react";
import {
  PUBLISH_STAGE_LABEL,
  REVIEW_SUBSTATE_LABEL,
  resendCooldownRemaining,
  reviewSubState,
  isPlausibleEmail,
  type PublishFlow,
  type PublishStage,
} from "@/lib/publish-flow";

/**
 * 公開ワークフロー（下書き → 公開申請 → 公開）の操作パネル（運営専用・2026-09-20）。
 * 「公開設定」ステップの先頭に置く。状態の判断は lib/publish-flow.ts、実処理は
 * app/admin/_actions.ts。ここは表示とボタンだけで、書き込みは親（PropertyEditor）の
 * 書き込みキュー経由のコールバックに任せる（autosave と順序が前後しないように）。
 */
export default function PublishFlowPanel({
  stage,
  flow,
  contactEmail,
  missingRequired,
  missingEnglish,
  busy,
  mounted,
  notice,
  onRequest,
  onResend,
  onSetConfirmed,
  onWithdraw,
  onPublish,
}: {
  stage: PublishStage;
  flow: PublishFlow;
  contactEmail: string;
  missingRequired: string[];
  missingEnglish: string[];
  busy: boolean;
  /** ローカル時刻の整形は hydration 後だけ（SSR=UTC と食い違うため）。 */
  mounted: boolean;
  notice: string | null;
  onRequest: (opts: { skipMail: boolean }) => void;
  onResend: () => void;
  onSetConfirmed: (confirmed: boolean) => void;
  onWithdraw: () => void;
  onPublish: () => void;
}) {
  const [skipMail, setSkipMail] = useState(false);
  // 再送クールダウンの残り秒。1秒ごとに更新（送信直後だけ動く）。
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    const tick = () => setCooldown(Math.ceil(resendCooldownRemaining(flow) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [flow]);

  const email = contactEmail.trim();
  const emailOk = isPlausibleEmail(email);
  const fmt = (iso: string | null) =>
    mounted && iso
      ? new Date(iso).toLocaleString("ja-JP", { hour12: false, dateStyle: "short", timeStyle: "short" })
      : "—";
  const sub = reviewSubState(flow);
  const stages: PublishStage[] = ["draft", "review", "published"];
  const btn =
    "px-4 py-2 mono text-[10px] tracking-[0.22em] uppercase border transition disabled:opacity-50 disabled:cursor-not-allowed";
  const primary = `${btn} border-accent text-accent hover:bg-accent hover:text-bg`;
  const secondary = `${btn} border-line hover:border-ink`;

  return (
    <div className="border border-line p-5 space-y-5" data-publish-flow={stage}>
      {/* 段階の表示: 下書き → 公開申請中 → 公開中 */}
      <ol className="flex flex-wrap items-center gap-2 mono text-[10px] tracking-[0.2em] uppercase">
        {stages.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            {i > 0 && <span className="opacity-40">→</span>}
            <span
              aria-current={stage === s ? "step" : undefined}
              className={`px-2.5 py-1 border ${
                stage === s ? "border-accent text-accent bg-[#2a1f10]" : "border-line text-muted"
              }`}
            >
              {PUBLISH_STAGE_LABEL[s]}
            </span>
          </li>
        ))}
        {stage === "archived" && (
          <li className="px-2.5 py-1 border border-line text-muted">{PUBLISH_STAGE_LABEL.archived}</li>
        )}
      </ol>

      {notice && (
        <div className="border border-green-400/40 bg-green-400/[0.06] px-3 py-2 text-[12px] leading-[1.7]">
          {notice}
        </div>
      )}

      {stage === "draft" && (
        <div className="space-y-4">
          <p className="text-[12px] text-muted leading-[1.8]">
            「公開申請する」を押すと、次の順に処理します。
            <br />
            途中で失敗した場合は公開申請にならず、何も送信されません。
          </p>
          <ul className="space-y-1.5 text-[12px] leading-[1.7]">
            <FlowItem ok={missingRequired.length === 0} label="公開に必要な項目が揃っている">
              {missingRequired.length > 0 && `未入力: ${missingRequired.join("、")}`}
            </FlowItem>
            <FlowItem ok={missingEnglish.length === 0} pendingOk label="英語への翻訳（未翻訳は自動翻訳します。必須）">
              {missingEnglish.length > 0 && `これから翻訳: ${missingEnglish.join("、")}`}
            </FlowItem>
            <FlowItem ok pendingOk label="プレビューリンク（ログイン不要・30日）を用意" />
            <FlowItem ok={skipMail || emailOk} label="スタジオへ確認メールを送信">
              {skipMail
                ? "今回は送信しません"
                : emailOk
                  ? `宛先: ${email}`
                  : email
                    ? `メールアドレスの形式が正しくありません: ${email}`
                    : "宛先が未入力です。「基本情報」の問い合わせ先メールを入力してください"}
            </FlowItem>
          </ul>
          <label className="flex items-start gap-2 text-[12px] leading-[1.7] cursor-pointer">
            <input
              type="checkbox"
              checked={skipMail}
              onChange={(e) => setSkipMail(e.target.checked)}
              className="mt-1 w-4 h-4 accent-[#ffb454]"
            />
            <span>
              メールを送らずに申請中にする
              <span className="block text-[11px] text-muted">
                スタジオへ別の手段で連絡済みのときだけ。後から「確認メールを送信」で送れます。
              </span>
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy || missingRequired.length > 0 || (!skipMail && !emailOk)}
              onClick={() => {
                const msg = skipMail
                  ? "メールを送らずに公開申請中にします。よろしいですか？"
                  : `英訳を確認し、${email} へ確認メールを送信して公開申請中にします。よろしいですか？`;
                if (confirm(msg)) onRequest({ skipMail });
              }}
              className={primary}
            >
              {busy ? "処理中…（翻訳に数十秒かかることがあります）" : "公開申請する"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onPublish}
              className="mono text-[10px] tracking-[0.18em] text-muted underline underline-offset-4 hover:text-ink disabled:opacity-50"
            >
              申請を経ずに公開する
            </button>
          </div>
        </div>
      )}

      {stage === "review" && (
        <div className="space-y-4">
          <div className="text-[13px]">
            状態: <span className="text-accent font-bold">{REVIEW_SUBSTATE_LABEL[sub]}</span>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12px]">
            <Row k="公開申請">{fmt(flow.requestedAt)}{flow.requestedBy ? `（${flow.requestedBy}）` : ""}</Row>
            <Row k="確認メール">
              {flow.studioNotifiedAt
                ? `${fmt(flow.studioNotifiedAt)} → ${flow.studioNotifiedTo ?? ""}`
                : "未送信"}
              {flow.studioNotifyMode === "dry-run" && (
                <span className="ml-2 text-amber-400">ドライラン（実際には送信していません）</span>
              )}
            </Row>
            <Row k="スタジオ確認">{flow.studioConfirmedAt ? fmt(flow.studioConfirmedAt) : "未確認"}</Row>
            <Row k="英訳">{missingEnglish.length === 0 ? "完了" : `未翻訳あり: ${missingEnglish.join("、")}`}</Row>
          </dl>

          <label className="flex items-start gap-2 text-[12px] leading-[1.7] cursor-pointer">
            <input
              type="checkbox"
              checked={!!flow.studioConfirmedAt}
              disabled={busy}
              onChange={(e) => onSetConfirmed(e.target.checked)}
              className="mt-1 w-4 h-4 accent-[#ffb454]"
            />
            <span>
              スタジオ確認済みにする
              <span className="block text-[11px] text-muted">
                スタジオからメールで「この内容でOK」の返事をもらったらチェックします。
              </span>
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy} onClick={onPublish} className={primary}>
              {busy ? "処理中…" : "公開する"}
            </button>
            <button
              type="button"
              disabled={busy || cooldown > 0 || !emailOk}
              title={!emailOk ? "スタジオのメールアドレスを入力して保存してください" : undefined}
              onClick={() => {
                const first = !flow.studioNotifiedAt;
                if (
                  confirm(
                    `${email} へ確認メールを${first ? "送信" : "もう一度送信"}します。よろしいですか？`,
                  )
                )
                  // 1通目（スタジオ自身の申請や「送らずに申請中」の後）は、英訳の確認を含む
                  // 申請処理をそのまま通す。2通目以降だけが純粋な再送。
                  if (first) onRequest({ skipMail: false });
                  else onResend();
              }}
              className={secondary}
            >
              {cooldown > 0
                ? `再送まで ${cooldown} 秒`
                : flow.studioNotifiedAt
                  ? "確認メールを再送"
                  : "確認メールを送信"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (confirm("公開申請を取り下げて下書きに戻します。スタジオへの連絡は行いません。よろしいですか？"))
                  onWithdraw();
              }}
              className={secondary}
            >
              申請を取り下げる
            </button>
          </div>
        </div>
      )}

      {stage === "archived" && (
        <div className="space-y-3">
          <p className="text-[12px] text-muted leading-[1.8]">アーカイブ済みです。再掲載する場合はそのまま公開できます。</p>
          <button type="button" disabled={busy} onClick={onPublish} className={secondary}>
            {busy ? "処理中…" : "公開する"}
          </button>
        </div>
      )}

      {stage === "published" && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12px]">
          <Row k="公開">{fmt(flow.publishedAt)}</Row>
          <Row k="スタジオ確認">{flow.studioConfirmedAt ? fmt(flow.studioConfirmedAt) : "記録なし"}</Row>
          <Row k="確認メール">
            {flow.studioNotifiedAt ? `${fmt(flow.studioNotifiedAt)} → ${flow.studioNotifiedTo ?? ""}` : "記録なし"}
          </Row>
        </dl>
      )}
    </div>
  );
}

function FlowItem({
  ok,
  pendingOk = false,
  label,
  children,
}: {
  ok: boolean;
  /** 未完了でもブロックしない項目（申請時に自動で行う処理）。 */
  pendingOk?: boolean;
  label: string;
  children?: React.ReactNode;
}) {
  const mark = ok ? "✓" : pendingOk ? "…" : "✕";
  const color = ok ? "text-green-400" : pendingOk ? "text-amber-400" : "text-red-400";
  return (
    <li className="flex gap-2">
      <span className={`mono ${color}`} aria-hidden="true">{mark}</span>
      <span>
        {label}
        {children ? <span className="block text-[11px] text-muted">{children}</span> : null}
      </span>
    </li>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="mono text-[10px] tracking-[0.22em] uppercase opacity-50">{k}</dt>
      <dd className="text-[12px]">{children}</dd>
    </>
  );
}
