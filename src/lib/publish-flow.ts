import type { TranslateFailure } from "./ai-translate";
import type { Property } from "./schemas";
import { reviewReadiness } from "./publish-readiness";
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
  studioConfirmedVia: null,
  studioApproveKeyHash: null,
  publishedAt: null,
  studioPhotosEditedAt: null,
  studioReconfirmSentAt: null,
  studioReconfirmMode: null,
  studioChangesRequestedAt: null,
  deemedApprovedAt: null,
  deemedApprovedBy: null,
  deemedApprovalHeldAt: null,
};

/** みなし承認の再確認・公開を行う「再確認待ち」の各フィールドを白紙にした差分。 */
const CLEAR_DEEMED_PROGRESS = {
  studioReconfirmSentAt: null,
  studioReconfirmMode: null,
  studioChangesRequestedAt: null,
  deemedApprovalHeldAt: null,
} as const;

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

/**
 * 画面に出す段階（2026-09-21 本人指示「下書き → 書くことが埋まったら公開申請待ち → 公開申請済み → 公開」）。
 * `ready` は公開に必要な項目がすべて埋まっているか（publishReadiness と同じ基準）。
 * タブ・絞り込み・保存の判断は従来どおり publishStage（4段階）を使う。ここは表示だけ。
 */
export type PublishDisplayStage = "draft" | "ready" | "review" | "published" | "archived";

export const PUBLISH_DISPLAY_LABEL: Record<PublishDisplayStage, string> = {
  draft: "下書き",
  ready: "公開申請待ち",
  review: "公開申請済み",
  published: "公開中",
  archived: "アーカイブ",
};

export function publishDisplayStage(p: StageSource, ready: boolean): PublishDisplayStage {
  const stage = publishStage(p);
  return stage === "draft" && ready ? "ready" : stage;
}

/** 申請中の細かい状態（一覧バッジ・エディター表示用）。 */
export type ReviewSubState =
  | "mail-unsent"
  | "awaiting-studio"
  | "reconfirm-sent"
  | "changes-requested"
  | "studio-confirmed";

export function reviewSubState(flow: PublishFlow | undefined | null): ReviewSubState {
  const f = flow ?? EMPTY_PUBLISH_FLOW;
  if (f.studioConfirmedAt) return "studio-confirmed";
  if (f.studioChangesRequestedAt) return "changes-requested";
  if (f.studioNotifiedAt && f.studioNotifyMode !== "skipped") {
    return f.studioReconfirmSentAt ? "reconfirm-sent" : "awaiting-studio";
  }
  return "mail-unsent";
}

export const REVIEW_SUBSTATE_LABEL: Record<ReviewSubState, string> = {
  "mail-unsent": "確認メール未送信",
  "awaiting-studio": "スタジオ確認待ち",
  "reconfirm-sent": "再確認中（期限後にみなし承認）",
  "changes-requested": "修正依頼あり",
  "studio-confirmed": "スタジオ確認済み",
};

// ─── みなし承認（掲載規約 第4条3項・2026-10-08 本人判断） ────────────
//
// 確認用リンクを送った日から14日以内に回答（承認・修正の求め）が無ければ再確認メールを1通。
// 再確認から7日以内にも回答が無ければ、承認されたものとみなして公開する。
// 実行は Worker の定期実行（10分ごと。src/lib/deemed-approval-job.ts）。判断はここの純関数だけ。

/** 確認メールから再確認メールまでの日数。 */
export const DEEMED_RECONFIRM_AFTER_DAYS = 14;
/** 再確認メールからみなし承認（公開）までの日数。 */
export const DEEMED_PUBLISH_AFTER_DAYS = 7;
/** みなし承認の記録に残す主体。 */
export const DEEMED_APPROVAL_ACTOR = "system:deemed-approval";

const DAY_MS = 86_400_000;

export type DeemedApprovalStep =
  | { kind: "none"; reason: string }
  | { kind: "send-reconfirm"; dueAt: string }
  | { kind: "publish"; dueAt: string };

function parseMs(iso: string | null | undefined): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? NaN : t;
}

/**
 * いま何をすべきか（純関数。nowMs を注入してテストする）。何度呼んでも同じ状態なら同じ答え
 * （＝10分ごとに走っても、記録が進まない限り同じ処理を二重にしない。記録は呼び出し側が条件付き更新で書く）。
 *
 * 対象: 公開申請中 ／ 確認メールを**実際に送っている**（dry-run・skipped は対象外）／
 *       スタジオ未確認 ／ 修正依頼の記録なし。
 */
export function deemedApprovalStep(
  p: Pick<Property, "status" | "publishRequestedAt" | "publishFlow">,
  nowMs: number,
): DeemedApprovalStep {
  if (publishStage(p) !== "review") return { kind: "none", reason: "not_in_review" };
  const f = p.publishFlow ?? EMPTY_PUBLISH_FLOW;
  if (f.studioConfirmedAt) return { kind: "none", reason: "confirmed" };
  if (f.studioChangesRequestedAt) return { kind: "none", reason: "changes_requested" };
  if (f.studioNotifyMode !== "sent") return { kind: "none", reason: "mail_not_sent" };
  const notified = parseMs(f.studioNotifiedAt);
  if (Number.isNaN(notified)) return { kind: "none", reason: "mail_not_sent" };

  const reconfirm = parseMs(f.studioReconfirmSentAt);
  // 再確認の記録が無い、または確認メールの再送より前のもの（＝古い流れ）なら、再確認がまだ。
  if (Number.isNaN(reconfirm) || reconfirm < notified) {
    const due = notified + DEEMED_RECONFIRM_AFTER_DAYS * DAY_MS;
    if (nowMs < due) return { kind: "none", reason: "waiting_first_reply" };
    return { kind: "send-reconfirm", dueAt: new Date(due).toISOString() };
  }
  // 再確認を実際に送っていない（dry-run）なら、みなし承認はしない。
  if (f.studioReconfirmMode !== "sent") return { kind: "none", reason: "reconfirm_not_sent" };
  const due = reconfirm + DEEMED_PUBLISH_AFTER_DAYS * DAY_MS;
  if (nowMs < due) return { kind: "none", reason: "waiting_reconfirm_reply" };
  if (f.deemedApprovalHeldAt) return { kind: "none", reason: "held_not_publishable" };
  return { kind: "publish", dueAt: new Date(due).toISOString() };
}

/** 再確認メールの送信を記録。 */
export function recordReconfirmSent<T extends Property>(
  p: T,
  opts: { now: string; mode: "sent" | "dry-run" },
): T {
  return {
    ...p,
    publishFlow: {
      ...(p.publishFlow ?? EMPTY_PUBLISH_FLOW),
      studioReconfirmSentAt: opts.now,
      studioReconfirmMode: opts.mode,
      deemedApprovalHeldAt: null,
    },
  };
}

/** みなし承認として確認済みを記録する（公開そのものは markPublished と組み合わせる）。 */
export function markDeemedApproved<T extends Property>(p: T, now: string): T {
  return {
    ...p,
    publishFlow: {
      ...(p.publishFlow ?? EMPTY_PUBLISH_FLOW),
      studioConfirmedAt: now,
      studioConfirmedVia: "deemed",
      deemedApprovedAt: now,
      deemedApprovedBy: DEEMED_APPROVAL_ACTOR,
      deemedApprovalHeldAt: null,
    },
  };
}

/** 期限は来たが公開に必要な項目が足りず保留した、を記録（運営への通知を1回にするため）。 */
export function markDeemedApprovalHeld<T extends Property>(p: T, now: string): T {
  return {
    ...p,
    publishFlow: { ...(p.publishFlow ?? EMPTY_PUBLISH_FLOW), deemedApprovalHeldAt: now },
  };
}

/** スタジオから修正の依頼を受けた（運営が記録）。記録がある間はみなし承認しない。 */
export function setStudioChangesRequested<T extends Property>(
  p: T,
  opts: { requested: boolean; now: string },
): T {
  return {
    ...p,
    publishFlow: {
      ...(p.publishFlow ?? EMPTY_PUBLISH_FLOW),
      studioChangesRequestedAt: opts.requested ? opts.now : null,
    },
  };
}

/** ごく緩いメール形式チェック（宛先の打ち間違いを送信前に止める）。 */
export function isPlausibleEmail(s: string | undefined | null): boolean {
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test((s ?? "").trim());
}

export type GuardResult = { ok: true } | { ok: false; code: string; error: string };

/**
 * 公開申請へ入れるか（翻訳の前に判定できる部分）。
 *  1. すでに公開中/アーカイブなら不可
 *  2. 公開に必要な項目が揃っていて、3DGS も入っている（reviewReadiness。2026-09-29: 3DGS 無しでは申請にしない）
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
  const readiness = reviewReadiness(p);
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
export function translationGuard(afterTranslate: Property, failure?: TranslateFailure): GuardResult {
  const missing = missingEnglishFields(afterTranslate);
  if (missing.length === 0) return { ok: true };
  return {
    ok: false,
    code: "translation_missing",
    error: `英語への翻訳が完了していないため公開申請にできません（未翻訳: ${missing.join("、")}）。${translationFailureText(failure)}`,
  };
}

/**
 * 訳せなかった理由を、次に何をすればいいかが分かる言葉にする（2026-09-23）。
 * 以前は理由によらず「ANTHROPIC_API_KEY 未設定、または API エラー」と出ていたが、実際には
 * AI の返事の一部が欠けただけのこともあり（STUDIO MONTFORT）、キーを疑って時間を失う。
 */
export function translationFailureText(failure?: TranslateFailure): string {
  switch (failure?.kind) {
    case "no_key":
      return "自動翻訳の設定（ANTHROPIC_API_KEY）が本番にありません。管理者に設定を依頼してください。";
    case "http":
      if (failure.status === 401 || failure.status === 403) {
        return `自動翻訳の API キーが無効です（HTTP ${failure.status}）。管理者が本番の ANTHROPIC_API_KEY を新しいキーに設定し直すまで、自動翻訳はできません。`;
      }
      return `自動翻訳の API がエラーを返しました（HTTP ${failure.status}${failure.message ? `: ${failure.message}` : ""}）。少し待ってもう一度押してください。`;
    case "truncated":
      return "訳文が長すぎて途中で切れました。説明文を短くするか、英語欄を手で入力してください。";
    case "parse":
      return "自動翻訳の返事を読み取れませんでした。もう一度押してください。続く場合は英語欄を手で入力してください。";
    case "network":
      return "自動翻訳に接続できませんでした。少し待ってもう一度押してください。";
    default:
      return "自動翻訳が一部の項目を訳しませんでした。もう一度押すか、エディターの英語欄に手で入力してください。";
  }
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
  | { mode: "sent" | "dry-run"; to: string; approveKeyHash?: string | null }
  | { mode: "skipped" };

/**
 * スタジオ自身の承認ボタンで公開してよいか（2026-09-21 本人指示「OKボタン押したら自動で公開」）。
 * 条件: 公開申請中 ／ 確認メールを実際に出している ／ メールのURLに入っていたキーが一致。
 * プレビューURLは他の人にも共有されうるので、URLを知っているだけでは公開できないようにキーを別に持つ。
 */
export function canStudioApprove(p: Property, keyHash: string): GuardResult {
  if (p.status === "published") return { ok: false, code: "already_published", error: "すでに公開されています。" };
  if (publishStage(p) !== "review") return { ok: false, code: "not_in_review", error: "この物件は現在、確認の受付中ではありません。" };
  const f = p.publishFlow ?? EMPTY_PUBLISH_FLOW;
  if (!f.studioNotifiedAt || f.studioNotifyMode === "skipped" || !f.studioApproveKeyHash) {
    return { ok: false, code: "no_request", error: "確認のご依頼が出ていません。" };
  }
  if (!keyHash || keyHash !== f.studioApproveKeyHash) {
    return { ok: false, code: "bad_key", error: "このリンクでは承認できません。最新の確認メールのリンクからお開きください。" };
  }
  return { ok: true };
}

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
      studioConfirmedVia: opts.mail.mode === "skipped" ? prev.studioConfirmedVia : null,
    },
  };
}

function mailFields(mail: MailOutcome, now: string, prev: PublishFlow) {
  if (mail.mode === "skipped") {
    // すでに送信済みの記録があるなら消さない（skipped で上書きすると履歴が嘘になる）。
    if (prev.studioNotifiedAt && prev.studioNotifyMode !== "skipped") return {};
    return { studioNotifiedAt: null, studioNotifiedTo: null, studioNotifyMode: "skipped" as const };
  }
  // 確認メールを（出し直して）送ったら、みなし承認の14日は送った日から数え直す。
  return {
    studioNotifiedAt: now,
    studioNotifiedTo: mail.to,
    studioNotifyMode: mail.mode,
    studioApproveKeyHash: mail.approveKeyHash ?? null,
    ...CLEAR_DEEMED_PROGRESS,
  };
}

/** 確認メールの（再）送信を記録。 */
export function recordStudioNotified<T extends Property>(
  p: T,
  opts: { now: string; mail: { mode: "sent" | "dry-run"; to: string; approveKeyHash?: string | null } },
): T {
  return {
    ...p,
    publishFlow: {
      ...(p.publishFlow ?? EMPTY_PUBLISH_FLOW),
      studioNotifiedAt: opts.now,
      studioNotifiedTo: opts.mail.to,
      studioNotifyMode: opts.mail.mode,
      // 送り直したら承認キーも入れ替わる（古いメールのボタンは無効になる）。
      studioApproveKeyHash: opts.mail.approveKeyHash ?? null,
      // 送り直した日から、みなし承認の14日を数え直す（修正依頼の記録も、直した内容を出し直したので消す）。
      ...CLEAR_DEEMED_PROGRESS,
    },
  };
}

/** 「スタジオ確認済み」の手動チェック（外すこともできる）。 */
export function setStudioConfirmed<T extends Property>(
  p: T,
  opts: { confirmed: boolean; now: string; via?: "admin" | "studio-link" },
): T {
  return {
    ...p,
    publishFlow: {
      ...(p.publishFlow ?? EMPTY_PUBLISH_FLOW),
      studioConfirmedAt: opts.confirmed ? opts.now : null,
      studioConfirmedVia: opts.confirmed ? (opts.via ?? "admin") : null,
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
    // 公開したら承認キーは使い切り（同じメールのボタンで再公開できないようにする）。
    publishFlow: { ...(p.publishFlow ?? EMPTY_PUBLISH_FLOW), publishedAt: now, studioApproveKeyHash: null },
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
