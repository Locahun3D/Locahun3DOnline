import { propertySchema, publishablePropertySchema, type Property } from "./schemas";
import {
  deemedApprovalStep,
  isPlausibleEmail,
  markDeemedApprovalHeld,
  markDeemedApproved,
  markPublished,
  recordReconfirmSent,
} from "./publish-flow";
import { publishReadiness } from "./publish-readiness";
import { buildDeemedApprovalAdminMail, buildStudioReconfirmMail } from "./studio-reconfirm-mail";
import { mailShell } from "./mail-shell";

/**
 * みなし承認（施設掲載規約 第4条3項・2026-10-08 本人判断）の定期処理。
 *
 *   確認メール（実送信）から14日、スタジオの回答（承認・修正依頼）が無い → 再確認メールを1通
 *   再確認（実送信）から7日、まだ回答が無い → 公開に必要な項目が揃っていれば「みなし承認」で公開
 *
 * Worker の定期実行（custom-worker.ts の scheduled、10分ごと）から**直接**呼ぶ。english-fill-job.ts と同じく
 * Next の外でも動く部品（schemas・publish-flow・メール文面の純関数）だけで組む。
 * "server-only" や getCloudflareContext を持つモジュールをここで import しないこと（Worker ごと起動しなくなる）。
 *
 * 安全策（10分ごとに走っても二重に動かない）:
 *  - 判断は純関数 deemedApprovalStep(p, now) だけ。状態が進まない限り同じ答え。
 *  - 書き込みは「読んだ時点の updated_at と data が一致するときだけ」の条件付き更新。
 *  - 再確認メールは**先に記録してから**送る（記録できた1回だけが送る）。送れなかったら記録を戻して次回に回す。
 *  - 実送信できない環境（RESEND_API_KEY 無し / MAIL_DRY_RUN=1）では送らずログだけ。記録は dry-run になり、
 *    dry-run の再確認からはみなし承認しない（＝開発環境で勝手に公開しない）。
 *  - 1回の実行で処理するのは MAX_ACTIONS_PER_RUN 件まで。
 */
export const MAX_ACTIONS_PER_RUN = 5;

/** 直接掲載スタジオへの分配率（payouts.ts の STUDIO_VENUE_SHARE_PERCENT と同じ値。あちらは server-only のため複製）。 */
const STUDIO_VENUE_SHARE_PERCENT = 20;
const MAX_TOTAL_SPLIT_PERCENT = 70;

type Row = { id: string; status: string; updated_at: string; data: string };
type Stmt = {
  bind(...v: unknown[]): Stmt;
  all(): Promise<{ results?: unknown[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
};
export type DeemedApprovalDb = { prepare(sql: string): Stmt };

export type OutgoingMail = {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  bcc?: string;
};

export interface DeemedApprovalConfig {
  /** Resend の API キー。無ければ送らない（dry-run）。 */
  resendApiKey?: string | null;
  /** MAIL_DRY_RUN=1 相当。true なら送らない。 */
  dryRun?: boolean;
  /** サイトの URL（NEXT_PUBLIC_APP_URL）。 */
  appUrl?: string;
  /** 運営の受信箱（EMAIL_OPERATOR）。 */
  operator?: string;
  /** 返信できる差出人（EMAIL_REPLY_FROM）。 */
  replyFrom?: string;
  /** テスト用の送信差し替え。省略時は Resend へ fetch。 */
  send?: (mail: OutgoingMail) => Promise<boolean>;
  /** ログ出力の差し替え（テスト用）。 */
  log?: (msg: string) => void;
}

export type DeemedApprovalReport = {
  id: string;
  action: "reconfirm-sent" | "reconfirm-dry-run" | "published" | "held" | "skipped";
  detail?: string;
};

function isDryRun(cfg: DeemedApprovalConfig): boolean {
  return !!cfg.dryRun || !cfg.resendApiKey;
}

async function sendViaResend(apiKey: string, mail: OutgoingMail): Promise<boolean> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: mail.from,
        to: [mail.to],
        ...(mail.bcc ? { bcc: [mail.bcc] } : {}),
        ...(mail.replyTo ? { reply_to: [mail.replyTo] } : {}),
        subject: mail.subject,
        html: mail.html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** 実送信。dry-run なら送らずに "dry-run"。 */
async function deliver(cfg: DeemedApprovalConfig, mail: OutgoingMail): Promise<"sent" | "dry-run" | "failed"> {
  const log = cfg.log ?? ((m: string) => console.info(m));
  if (isDryRun(cfg)) {
    log(`[mail:dry-run] deemed-approval mail NOT sent. to=${mail.to} subject=${mail.subject}`);
    return "dry-run";
  }
  const ok = cfg.send ? await cfg.send(mail) : await sendViaResend(cfg.resendApiKey as string, mail);
  return ok ? "sent" : "failed";
}

/** 条件付き更新（読んだ時点の updated_at と data が一致するときだけ）。書けたら true。 */
async function casUpdate(
  db: DeemedApprovalDb,
  row: Row,
  next: { data: string; status?: string; updatedAt?: string },
): Promise<boolean> {
  const res = await db
    .prepare(
      "UPDATE properties SET data = ?, status = ?, updated_at = ? WHERE id = ? AND updated_at = ? AND data = ?",
    )
    .bind(next.data, next.status ?? row.status, next.updatedAt ?? row.updated_at, row.id, row.updated_at, row.data)
    .run();
  return !!res.meta?.changes;
}

/** 有効なプレビューの URL（承認キーなし）。無ければ undefined。 */
async function previewUrlFor(db: DeemedApprovalDb, propertyId: string, nowIso: string, appUrl: string) {
  try {
    const rows = ((await db
      .prepare("SELECT token, expires_at FROM property_previews WHERE property_id = ? ORDER BY expires_at DESC")
      .bind(propertyId)
      .all()).results ?? []) as { token: string; expires_at: string }[];
    const live = rows.find((r) => r.expires_at > nowIso);
    return live ? `${appUrl}/preview/${live.token}` : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 直接掲載スタジオの分配設定（施設20%）を自動で足す。publish 系アクションの autoCreateStudioVenueSplit と同じ規則
 * （冪等・非破壊・受取者未登録なら何もしない・合計70%超なら足さない）。失敗しても公開は取り消さない。
 */
async function ensureVenueSplit(db: DeemedApprovalDb, p: Property, nowIso: string): Promise<string> {
  if (!p.ownerId) return "";
  try {
    const payees = ((await db.prepare("SELECT data FROM payees").all()).results ?? []) as { data: string }[];
    const payee = payees
      .map((r) => {
        try {
          return JSON.parse(r.data) as { id: string; userId?: string };
        } catch {
          return null;
        }
      })
      .find((x) => x && x.userId === p.ownerId);
    if (!payee) return "";
    const splitRows = ((await db
      .prepare("SELECT data FROM payout_splits WHERE property_id = ?")
      .bind(p.id)
      .all()).results ?? []) as { data: string }[];
    const existing = splitRows[0]
      ? (JSON.parse(splitRows[0].data) as { lines?: { payeeId: string; role: string; ratePercent: number }[] })
      : null;
    const lines = existing?.lines ?? [];
    if (lines.some((l) => l.payeeId === payee.id)) return "";
    const total = lines.reduce((s, l) => s + (l.ratePercent || 0), 0) + STUDIO_VENUE_SHARE_PERCENT;
    if (Math.round(total * 100) / 100 > MAX_TOTAL_SPLIT_PERCENT) {
      return "分配設定（施設20%）は合計が70%を超えるため自動で追加していません。/admin/payouts で確認してください。";
    }
    const split = {
      propertyId: p.id,
      lines: [...lines, { payeeId: payee.id, role: "venue", ratePercent: STUDIO_VENUE_SHARE_PERCENT }],
      updatedAt: nowIso,
    };
    await db
      .prepare(
        "INSERT INTO payout_splits (property_id, updated_at, data) VALUES (?, ?, ?) " +
          "ON CONFLICT(property_id) DO UPDATE SET updated_at=excluded.updated_at, data=excluded.data",
      )
      .bind(p.id, nowIso, JSON.stringify(split))
      .run();
    return "分配設定に施設20%を自動で追加しました。";
  } catch {
    return "分配設定（施設20%）の自動追加に失敗しました。/admin/payouts で確認してください。";
  }
}

export async function runDeemedApproval(
  db: DeemedApprovalDb,
  cfg: DeemedApprovalConfig,
  now = Date.now(),
): Promise<{ report: DeemedApprovalReport[] }> {
  const appUrl = (cfg.appUrl || "https://locahun3d.com").replace(/\/$/, "");
  const operator = cfg.operator || "contact@locahun3d.com";
  const replyFrom = cfg.replyFrom || "ロケハン3D <contact@locahun3d.com>";
  const nowIso = new Date(now).toISOString();
  // 「公開申請中」は status='draft' + publishRequestedAt（publish-flow.ts）。公開中・アーカイブは読まない。
  const rows = ((await db
    .prepare("SELECT id, status, updated_at, data FROM properties WHERE status = 'draft'")
    .all()).results ?? []) as Row[];
  const report: DeemedApprovalReport[] = [];
  let actions = 0;

  for (const row of rows) {
    if (actions >= MAX_ACTIONS_PER_RUN) break;
    let p: Property;
    try {
      p = propertySchema.parse(JSON.parse(row.data));
    } catch {
      continue;
    }
    const step = deemedApprovalStep(p, now);
    if (step.kind === "none") continue;
    actions++;

    if (step.kind === "send-reconfirm") {
      const to = (p.publishFlow.studioNotifiedTo || p.contactEmail || "").trim();
      if (!isPlausibleEmail(to)) {
        report.push({ id: row.id, action: "skipped", detail: "no_studio_email" });
        continue;
      }
      const mode = isDryRun(cfg) ? "dry-run" : "sent";
      // 先に記録（＝この回だけが送る権利を取る）。更新日時は進めない（編集中の人の保存と衝突させない）。
      const claimed = recordReconfirmSent(p, { now: nowIso, mode });
      const claimedData = JSON.stringify(claimed);
      if (!(await casUpdate(db, row, { data: claimedData }))) {
        report.push({ id: row.id, action: "skipped", detail: "changed_meanwhile" });
        continue;
      }
      const mail = buildStudioReconfirmMail({
        studioName: p.title,
        firstSentAt: p.publishFlow.studioNotifiedAt ?? nowIso,
        now: nowIso,
        previewUrl: await previewUrlFor(db, p.id, nowIso, appUrl),
        contactAddress: operator,
        siteUrl: appUrl,
      });
      const result = await deliver(cfg, {
        to,
        from: replyFrom,
        replyTo: operator,
        bcc: to === operator ? undefined : operator,
        subject: mail.subject,
        html: mailShell(mail.heading, mail.bodyHtml),
      });
      if (result === "failed") {
        // 記録を戻して次の回に送り直す（戻せなければ、運営が物件編集で状況を見られる）。
        await casUpdate(db, { ...row, data: claimedData }, { data: row.data });
        report.push({ id: row.id, action: "skipped", detail: "send_failed" });
        continue;
      }
      report.push({ id: row.id, action: result === "sent" ? "reconfirm-sent" : "reconfirm-dry-run" });
      continue;
    }

    // step.kind === "publish"
    const parsed = publishablePropertySchema.safeParse(p);
    if (!parsed.success) {
      const held = markDeemedApprovalHeld(p, nowIso);
      if (await casUpdate(db, row, { data: JSON.stringify(held) })) {
        const admin = buildDeemedApprovalAdminMail({
          propertyId: p.id,
          title: p.title,
          siteUrl: appUrl,
          event: { kind: "held", missing: publishReadiness(p).missing },
        });
        await deliver(cfg, { to: operator, from: replyFrom, subject: admin.subject, html: mailShell(admin.heading, admin.bodyHtml) });
        report.push({ id: row.id, action: "held" });
      } else {
        report.push({ id: row.id, action: "skipped", detail: "changed_meanwhile" });
      }
      continue;
    }
    const published = markPublished(markDeemedApproved(parsed.data, nowIso), nowIso);
    const next: Property = {
      ...published,
      // 初回公開日（カタログの New 表示の基準）は未設定のときだけ刻む（publish 系アクションと同じ）。
      publishedAt: p.publishedAt || nowIso,
      updatedAt: nowIso,
    };
    if (!(await casUpdate(db, row, { data: JSON.stringify(next), status: "published", updatedAt: nowIso }))) {
      report.push({ id: row.id, action: "skipped", detail: "changed_meanwhile" });
      continue;
    }
    const splitNote = await ensureVenueSplit(db, next, nowIso);
    const admin = buildDeemedApprovalAdminMail({
      propertyId: p.id,
      title: p.title,
      siteUrl: appUrl,
      event: { kind: "published", splitNote },
    });
    await deliver(cfg, { to: operator, from: replyFrom, subject: admin.subject, html: mailShell(admin.heading, admin.bodyHtml) });
    report.push({ id: row.id, action: "published", detail: splitNote || undefined });
  }
  return { report };
}
