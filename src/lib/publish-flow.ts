import type { Property } from "./schemas";
import { publishReadiness } from "./publish-readiness";
import { missingEnglishFields } from "./property-english";

/**
 * 公開ワークフロー（下書き → 公開申請 → 公開）の状態と遷移ガード（2026-09-20）。
 *
 * ── 設計の要点 ─────────────────────────────────────────────
 * 「公開申請」は新しい status を足さず、従来どおり `status='draft'` +
 * `publishRequestedAt` で表す。公開側・カタログ・一括操作・Dropbox パイプラインは
 * すべて `status` だけを見ているので、enum を増やすと全部の分岐を直す必要が出る。
 * 監査記録（誰がいつ申請し、スタジオへいつ誰宛に送り、いつ確認が取れたか）は
 * `publishFlow` に持つ。
 *
 * ここは純関数だけ（server / client 両方から import する。`server-only` 禁止）。
 * メール送信・翻訳・DB 書き込みは app/admin/_actions.ts が行い、判断だけをここに集める。
 * 設計: docs/property-publish-workflow-2026-09-20.md
 */

export type PublishFlow = Property["publishFlow"];
export type PublishStage = "draft" | "review" | "published" | "archived";

export const PUBLISH_STAGE_LABEL: Record<PublishStage, string> = {
  draft: "下書き",
  review: "公開申請中",
  published: "公開中",
  archived: "アーカイブ",
};

export const EMPTY_PUBLISH_FLOW: PublishFlow = {
  requestedAt: null,
  requestedBy: null,
  studioNotifiedAt: null,
  studioNotifiedTo: null,
  studioNotifyMode: null,
  studioConfirmedAt: null,
  publishedAt: null,
};

/** 確認メール再送のクールダウン（誤って連打・二重送信しないため）。 */
export const RESEND_COOLDOWN_MS = 60_000;
/** 既存のプレビューリンクを使い回す条件: 残り日数がこれ以上あること。 */
export const PREVIEW_MIN_REMAINING_DAYS = 14;

type StageSource = Pick<Property, "status" | "publishRequestedAt">;

/** 画面に出す段階。申請中は「draft かつ publishRequestedAt あり」。 */
export function publishStage(p: StageSource): PublishStage {
  if (p.status === "published") return "published";
  if (p.status === "archived") return "archived";
  return p.publishRequestedAt ? "review" : "draft";
}

/** 申請中の細かい状態（一覧バッジ・エディター表示用）。 */
export type ReviewSubState = "mail-unsent" | "awaiting-studio" | "studio-confirmed";

export function reviewSubState(flow: PublishFlow | undefined | null): ReviewSubState {
  const f = flow ?? EMPTY_PUBLISH_FLOW;
  if (f.studioConfirmedAt) return "studio-confirmed";
  if (f.studioNotifiedAt && f.studioNotifyMode !== "skipped") return "awaiting-studio";
  return "mail-unsent";
}

export const REVIEW_SUBSTATE_LABEL: Record<ReviewSubState, string> = {
  "mail-unsent": "確認メール未送信",
  "awaiting-studio": "スタジオ確認待ち",
  "studio-confirmed": "スタジオ確認済み",
};

/** ごく緩いメール形式チェック（宛先の打ち間違いを送信前に止める）。 */
export function isPlausibleEmail(s: string | undefined | null): boolean {
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test((s ?? "").trim());
}

export type GuardResult = { ok: true } | { ok: false; code: string; error: string };

/**
 * 公開申請へ入れるか（翻訳の前に判定できる部分）。
 *  1. すでに公開中/アーカイブなら不可
 *  2. 公開に必要な項目が揃っている（publishReadiness と同じ基準）
 *  3. スタジオの確認メール宛先がある。無ければ「メールを送らずに申請中にする」を
 *     明示的に選んだ場合のみ通す（黙って未送信のまま進めない）
 */
export function canRequestReview(
  p: Property,
  opts: { skipMail: boolean },
): GuardResult {
  if (p.status === "published") {
    return { ok: false, code: "already_published", error: "すでに公開されています。" };
  }
  if (p.status === "archived") {
    return { ok: false, code: "archived", error: "アーカイブ済みの物件は公開申請にできません。下書きに戻してください。" };
  }
  const readiness = publishReadiness(p);
  if (!readiness.ready) {
    return {
      ok: false,
      code: "not_ready",
      error: `公開申請に必要な項目が未入力です: ${readiness.missing.join("、")}`,
    };
  }
  if (!opts.skipMail) {
    const to = p.contactEmail.trim();
    if (!to) {
      return {
        ok: false,
        code: "no_studio_email",
        error:
          "スタジオの確認メール宛先（問い合わせ先メール）が未入力です。「基本情報」でメールを入力するか、「メールを送らずに申請中にする」にチェックしてください。",
      };
    }
    if (!isPlausibleEmail(to)) {
      return {
        ok: false,
        code: "bad_studio_email",
        error: `スタジオのメールアドレスの形式が正しくありません: ${to}`,
      };
    }
  }
  return { ok: true };
}

/**
 * 翻訳必須ガード（本人指示 2026-09-20「公開申請になったら、翻訳を必ずするように」）。
 * 自動翻訳をかけた「後」の物件を渡す。1つでも EN が空なら申請へ進めない。
 */
export function translationGuard(afterTranslate: Property): GuardResult {
  const missing = missingEnglishFields(afterTranslate);
  if (missing.length === 0) return { ok: true };
  return {
    ok: false,
    code: "translation_missing",
    error: `英語への翻訳が完了していないため公開申請にできません（未翻訳: ${missing.join("、")}）。自動翻訳が失敗しています（ANTHROPIC_API_KEY 未設定、または API エラー）。少し待って再実行してください。`,
  };
}

/** 再送までの残り時間(ms)。0 = 送ってよい。 */
export function resendCooldownRemaining(
  flow: PublishFlow | undefined | null,
  nowMs: number = Date.now(),
): number {
  const last = flow?.studioNotifiedAt ? Date.parse(flow.studioNotifiedAt) : NaN;
  if (Number.isNaN(last)) return 0;
  return Math.max(0, RESEND_COOLDOWN_MS - (nowMs - last));
}

/** 再送してよいか（申請中であること・宛先・クールダウン）。 */
export function canResendStudioMail(p: Property, nowMs: number = Date.now()): GuardResult {
  if (publishStage(p) !== "review") {
    return { ok: false, code: "not_in_review", error: "公開申請中の物件ではありません。" };
  }
  const to = p.contactEmail.trim();
  if (!to || !isPlausibleEmail(to)) {
    return { ok: false, code: "no_studio_email", error: "スタジオのメールアドレスが未入力か、形式が正しくありません。" };
  }
  const remain = resendCooldownRemaining(p.publishFlow, nowMs);
  if (remain > 0) {
    return {
      ok: false,
      code: "cooldown",
      error: `直前に送信したばかりです。あと ${Math.ceil(remain / 1000)} 秒待ってから再送してください。`,
    };
  }
  return { ok: true };
}

/** 既存プレビューリンクを使い回せるか（残り日数が十分ならURLを変えない＝共有済みURLを壊さない）。 */
export function canReusePreview(
  preview: { expiresAt: string } | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!preview) return false;
  const exp = Date.parse(preview.expiresAt);
  if (Number.isNaN(exp)) return false;
  return exp - nowMs >= PREVIEW_MIN_REMAINING_DAYS * 86_400_000;
}

export type MailOutcome =
  | { mode: "sent" | "dry-run"; to: string }
  | { mode: "skipped" };

// ─── 遷移（Property を受けて Property を返す純関数） ───────────────

/** 下書き → 公開申請。すでに申請中（スタジオ自身の申請など）なら申請日時は保持する。 */
export function enterReview<T extends Property>(
  p: T,
  opts: { by: string; now: string; mail: MailOutcome },
): T {
  const prev = p.publishFlow ?? EMPTY_PUBLISH_FLOW;
  const requestedAt = p.publishRequestedAt ?? opts.now;
  return {
    ...p,
    status: "draft",
    publishRequestedAt: requestedAt,
    publishFlow: {
      ...prev,
      requestedAt: prev.requestedAt ?? requestedAt,
      requestedBy: prev.requestedBy ?? opts.by,
      ...mailFields(opts.mail, opts.now, prev),
      // 内容を出し直したら、以前の「確認済み」は無効（確認したのは前の内容）。
      studioConfirmedAt: opts.mail.mode === "skipped" ? prev.studioConfirmedAt : null,
    },
  };
}

function mailFields(mail: MailOutcome, now: string, prev: PublishFlow) {
  if (mail.mode === "skipped") {
    // すでに送信済みの記録があるなら消さない（skipped で上書きすると履歴が嘘になる）。
    if (prev.studioNotifiedAt && prev.studioNotifyMode !== "skipped") return {};
    return { studioNotifiedAt: null, studioNotifiedTo: null, studioNotifyMode: "skipped" as const };
  }
  return { studioNotifiedAt: now, studioNotifiedTo: mail.to, studioNotifyMode: mail.mode };
}

/** 確認メールの（再）送信を記録。 */
export function recordStudioNotified<T extends Property>(
  p: T,
  opts: { now: string; mail: { mode: "sent" | "dry-run"; to: string } },
): T {
  return {
    ...p,
    publishFlow: {
      ...(p.publishFlow ?? EMPTY_PUBLISH_FLOW),
      studioNotifiedAt: opts.now,
      studioNotifiedTo: opts.mail.to,
      studioNotifyMode: opts.mail.mode,
    },
  };
}

/** 「スタジオ確認済み」の手動チェック（外すこともできる）。 */
export function setStudioConfirmed<T extends Property>(
  p: T,
  opts: { confirmed: boolean; now: string },
): T {
  return {
    ...p,
    publishFlow: {
      ...(p.publishFlow ?? EMPTY_PUBLISH_FLOW),
      studioConfirmedAt: opts.confirmed ? opts.now : null,
    },
  };
}

/** 申請の取り下げ / 公開停止 / アーカイブ: 申請まわりを白紙に戻す（公開日時の履歴だけ残す）。 */
export function resetReview<T extends Property>(p: T): T {
  return {
    ...p,
    publishRequestedAt: null,
    publishFlow: {
      ...EMPTY_PUBLISH_FLOW,
      publishedAt: p.publishFlow?.publishedAt ?? null,
    },
  };
}

/** 公開: 申請フラグを消し、公開日時を刻む（申請〜確認の記録は監査用に残す）。 */
export function markPublished<T extends Property>(p: T, now: string): T {
  return {
    ...p,
    status: "published",
    publishRequestedAt: null,
    publishFlow: { ...(p.publishFlow ?? EMPTY_PUBLISH_FLOW), publishedAt: now },
  };
}

/** 公開前の注意（ブロックはしない。運営は確認ダイアログの上で公開できる）。 */
export function publishWarnings(p: Pick<Property, "publishRequestedAt" | "publishFlow">): string[] {
  const out: string[] = [];
  if (!p.publishRequestedAt) {
    out.push("公開申請（スタジオへの確認メール）を経ていません。");
  } else if (!p.publishFlow?.studioConfirmedAt) {
    out.push("スタジオの確認がまだ取れていません（「スタジオ確認済みにする」が未チェック）。");
  }
  return out;
}
