import { describe, it, expect } from "vitest";
import { propertySchema, type Property } from "./schemas";
import {
  DEEMED_APPROVAL_ACTOR,
  deemedApprovalStep,
  enterReview,
  markDeemedApproved,
  recordReconfirmSent,
  recordStudioNotified,
  reviewSubState,
  setStudioChangesRequested,
  setStudioConfirmed,
} from "./publish-flow";
import { buildStudioReconfirmMail, buildDeemedApprovalAdminMail } from "./studio-reconfirm-mail";
import { buildStudioReviewMail } from "./studio-review-mail";
import { runDeemedApproval, type DeemedApprovalDb, type OutgoingMail } from "./deemed-approval-job";

const img = (n: number) => ({ src: `/api/r2/g${n}.jpg`, alt: `写真${n}`, altEn: `Photo ${n}`, width: 1600, height: 1000 });

/** 公開要件を満たし、英訳も揃った物件（publish-flow.test.ts と同じ形）。 */
function ready(over: Partial<Property> = {}): Property {
  const base = propertySchema.parse({
    id: "st-001",
    status: "draft",
    category: "studio",
    title: "テストスタジオ",
    titleEn: "Test Studio",
    area: "tokyo",
    prefecture: "東京都",
    city: "渋谷区",
    cityEn: "Shibuya",
    summary: "自然光が入る白ホリのスタジオです。",
    summaryEn: "A white cyclorama studio with daylight.",
    hourlyPrice: 10000,
    contactEmail: "studio@example.com",
    urlConfirmedAt: "2026-09-01T00:00:00.000Z",
    cover: { src: "/api/r2/cover.jpg", alt: "外観", altEn: "Exterior", width: 1600, height: 1000 },
    gallery: [1, 2, 3, 4, 5, 6].map(img),
    splatItems: [{ id: "scene-1", label: "メイン", labelEn: "Main", splatUrl: "/api/r2/assets/splat/main.zip" }],
  });
  return { ...base, ...over };
}

const DAY = 86_400_000;
const SENT = "2026-10-01T00:00:00.000Z";
const SENT_MS = Date.parse(SENT);

/** 確認メールを実送信して申請中になった物件。 */
function inReview(over: Partial<Property> = {}): Property {
  return enterReview(ready(over), {
    by: "admin@example.com",
    now: SENT,
    mail: { mode: "sent", to: "studio@example.com", approveKeyHash: "h" },
  });
}

describe("deemedApprovalStep（施設掲載規約 第4条3項のタイミング）", () => {
  it("確認メールから14日未満は何もしない", () => {
    expect(deemedApprovalStep(inReview(), SENT_MS + 14 * DAY - 1).kind).toBe("none");
  });

  it("ちょうど14日で再確認メール", () => {
    const step = deemedApprovalStep(inReview(), SENT_MS + 14 * DAY);
    expect(step.kind).toBe("send-reconfirm");
  });

  it("再確認から7日未満は何もしない、7日で公開", () => {
    const re = "2026-10-15T00:10:00.000Z";
    const p = recordReconfirmSent(inReview(), { now: re, mode: "sent" });
    expect(deemedApprovalStep(p, Date.parse(re) + 7 * DAY - 1)).toEqual({
      kind: "none",
      reason: "waiting_reconfirm_reply",
    });
    expect(deemedApprovalStep(p, Date.parse(re) + 7 * DAY).kind).toBe("publish");
  });

  it("再確認を送ったら、同じ時刻に何度呼んでも再確認を二重に指示しない", () => {
    const now = SENT_MS + 15 * DAY;
    const p = recordReconfirmSent(inReview(), { now: new Date(now).toISOString(), mode: "sent" });
    expect(deemedApprovalStep(p, now).kind).toBe("none");
    expect(deemedApprovalStep(p, now + 10 * 60_000).kind).toBe("none");
  });

  it("スタジオ確認済み・修正依頼あり・公開済みなら対象外", () => {
    const late = SENT_MS + 60 * DAY;
    expect(deemedApprovalStep(setStudioConfirmed(inReview(), { confirmed: true, now: SENT }), late).kind).toBe("none");
    expect(
      deemedApprovalStep(setStudioChangesRequested(inReview(), { requested: true, now: SENT }), late),
    ).toEqual({ kind: "none", reason: "changes_requested" });
    expect(deemedApprovalStep({ ...inReview(), status: "published" }, late).kind).toBe("none");
  });

  it("確認メールを実送信していない（dry-run / skipped）なら対象外", () => {
    const dry = enterReview(ready(), { by: "a", now: SENT, mail: { mode: "dry-run", to: "studio@example.com" } });
    const skip = enterReview(ready(), { by: "a", now: SENT, mail: { mode: "skipped" } });
    expect(deemedApprovalStep(dry, SENT_MS + 60 * DAY).kind).toBe("none");
    expect(deemedApprovalStep(skip, SENT_MS + 60 * DAY).kind).toBe("none");
  });

  it("再確認が dry-run なら公開しない", () => {
    const p = recordReconfirmSent(inReview(), { now: "2026-10-15T00:00:00.000Z", mode: "dry-run" });
    expect(deemedApprovalStep(p, SENT_MS + 60 * DAY)).toEqual({ kind: "none", reason: "reconfirm_not_sent" });
  });

  it("確認メールを送り直すと再確認・修正依頼の記録が消え、14日を数え直す", () => {
    const p = setStudioChangesRequested(
      recordReconfirmSent(inReview(), { now: "2026-10-15T00:00:00.000Z", mode: "sent" }),
      { requested: true, now: "2026-10-16T00:00:00.000Z" },
    );
    const resent = recordStudioNotified(p, {
      now: "2026-10-20T00:00:00.000Z",
      mail: { mode: "sent", to: "studio@example.com", approveKeyHash: "h2" },
    });
    expect(resent.publishFlow.studioReconfirmSentAt).toBeNull();
    expect(resent.publishFlow.studioChangesRequestedAt).toBeNull();
    expect(deemedApprovalStep(resent, Date.parse("2026-10-20T00:00:00.000Z") + 13 * DAY).kind).toBe("none");
    expect(deemedApprovalStep(resent, Date.parse("2026-10-20T00:00:00.000Z") + 14 * DAY).kind).toBe(
      "send-reconfirm",
    );
  });

  it("みなし承認の記録（誰が・いつ）が残る", () => {
    const p = markDeemedApproved(inReview(), "2026-10-22T00:00:00.000Z");
    expect(p.publishFlow.studioConfirmedVia).toBe("deemed");
    expect(p.publishFlow.deemedApprovedAt).toBe("2026-10-22T00:00:00.000Z");
    expect(p.publishFlow.deemedApprovedBy).toBe(DEEMED_APPROVAL_ACTOR);
  });

  it("一覧の細目: 再確認中・修正依頼あり", () => {
    const re = recordReconfirmSent(inReview(), { now: "2026-10-15T00:00:00.000Z", mode: "sent" });
    expect(reviewSubState(re.publishFlow)).toBe("reconfirm-sent");
    expect(reviewSubState(setStudioChangesRequested(re, { requested: true, now: SENT }).publishFlow)).toBe(
      "changes-requested",
    );
  });
});

describe("メール文面", () => {
  it("最初の確認メールに14日＋7日のルールが入る", () => {
    const m = buildStudioReviewMail({
      studioName: "テストスタジオ",
      previewUrl: "https://locahun3d.com/preview/t",
      previewExpiresAt: "2026-10-31T00:00:00.000Z",
    });
    expect(m.bodyHtml).toContain("14日以内");
    expect(m.bodyHtml).toContain("7日以内");
    expect(m.bodyHtml).toContain("ご承認いただいたものとして");
    expect(m.bodyHtml).toContain("いつでもお申し付け");
  });

  it("再確認メール: 7日の期限・みなし承認・いつでも修正/削除できる旨", () => {
    const m = buildStudioReconfirmMail({
      studioName: "テストスタジオ",
      firstSentAt: SENT,
      now: "2026-10-15T01:00:00.000Z",
      previewUrl: "https://locahun3d.com/preview/t",
    });
    expect(m.subject).toBe("【ロケハン3D】掲載内容の再確認のお願い（テストスタジオ）");
    expect(m.bodyHtml).toContain("2026年10月1日");
    expect(m.bodyHtml).toContain("7日以内");
    expect(m.bodyHtml).toContain("2026年10月22日まで");
    expect(m.bodyHtml).toContain("ご承認いただいたものとして掲載ページを公開");
    expect(m.bodyHtml).toContain("停止・削除はいつでも");
    // 承認キーは入れない（最初のメールのボタンを無効にしないため）
    expect(m.bodyHtml).not.toContain("approve=");
  });

  it("運営向け通知", () => {
    const pub = buildDeemedApprovalAdminMail({
      propertyId: "st-001",
      title: "テスト",
      siteUrl: "https://locahun3d.com",
      event: { kind: "published" },
    });
    expect(pub.subject).toContain("みなし承認で公開しました");
    const held = buildDeemedApprovalAdminMail({
      propertyId: "st-001",
      title: "テスト",
      siteUrl: "https://locahun3d.com",
      event: { kind: "held", missing: ["カバー写真"] },
    });
    expect(held.bodyHtml).toContain("カバー写真");
  });
});

// ─── 定期処理（メモリ上の擬似 D1） ─────────────────────────────

type PropRow = { id: string; status: string; updated_at: string; data: string };

function fakeDb(props: Property[]) {
  const rows = new Map<string, PropRow>();
  for (const p of props) {
    rows.set(p.id, { id: p.id, status: p.status, updated_at: p.updatedAt ?? SENT, data: JSON.stringify(p) });
  }
  const splits = new Map<string, string>();
  const payees: { data: string }[] = [];
  const db: DeemedApprovalDb = {
    prepare(sql: string) {
      let args: unknown[] = [];
      const stmt = {
        bind(...v: unknown[]) {
          args = v;
          return stmt;
        },
        async all() {
          if (sql.startsWith("SELECT id, status, updated_at, data FROM properties")) {
            return { results: [...rows.values()].filter((r) => r.status === "draft").map((r) => ({ ...r })) };
          }
          if (sql.includes("FROM property_previews")) {
            return { results: [{ token: "tok", expires_at: "2099-01-01T00:00:00.000Z" }] };
          }
          if (sql.startsWith("SELECT data FROM payees")) return { results: payees };
          if (sql.startsWith("SELECT data FROM payout_splits")) {
            const d = splits.get(String(args[0]));
            return { results: d ? [{ data: d }] : [] };
          }
          throw new Error(`unexpected sql: ${sql}`);
        },
        async run() {
          if (sql.startsWith("UPDATE properties")) {
            const [data, status, updatedAt, id, prevUpdated, prevData] = args as string[];
            const r = rows.get(id);
            if (!r || r.updated_at !== prevUpdated || r.data !== prevData) return { meta: { changes: 0 } };
            rows.set(id, { id, status, updated_at: updatedAt, data });
            return { meta: { changes: 1 } };
          }
          if (sql.startsWith("INSERT INTO payout_splits")) {
            splits.set(String(args[0]), String(args[2]));
            return { meta: { changes: 1 } };
          }
          throw new Error(`unexpected sql: ${sql}`);
        },
      };
      return stmt;
    },
  };
  const get = (id: string) => {
    const r = rows.get(id)!;
    return { ...r, property: propertySchema.parse(JSON.parse(r.data)) };
  };
  return { db, get, rows, splits, payees };
}

function mailer(ok = true) {
  const sent: OutgoingMail[] = [];
  return {
    sent,
    cfg: {
      resendApiKey: "re_test_dummy",
      send: async (m: OutgoingMail) => {
        sent.push(m);
        return ok;
      },
      log: () => {},
    },
  };
}

describe("runDeemedApproval（10分ごとの定期処理）", () => {
  it("14日たったら再確認メールを1通だけ送り、記録する（何度走っても1通）", async () => {
    const { db, get } = fakeDb([inReview()]);
    const m = mailer();
    const now = SENT_MS + 14 * DAY + 60_000;
    const r1 = await runDeemedApproval(db, m.cfg, now);
    expect(r1.report).toEqual([{ id: "st-001", action: "reconfirm-sent" }]);
    expect(m.sent).toHaveLength(1);
    expect(m.sent[0].to).toBe("studio@example.com");
    expect(m.sent[0].bcc).toBe("contact@locahun3d.com");
    expect(m.sent[0].subject).toContain("再確認");
    expect(m.sent[0].html).toContain("/preview/tok");
    expect(get("st-001").property.publishFlow.studioReconfirmMode).toBe("sent");
    // 更新日時は進めない（編集中の保存と衝突させない）
    expect(get("st-001").updated_at).toBe(SENT);

    await runDeemedApproval(db, m.cfg, now + 10 * 60_000);
    await runDeemedApproval(db, m.cfg, now + 20 * 60_000);
    expect(m.sent).toHaveLength(1);
  });

  it("送信に失敗したら記録を戻し、次の回に送り直す", async () => {
    const { db, get } = fakeDb([inReview()]);
    const bad = mailer(false);
    const now = SENT_MS + 14 * DAY;
    const r = await runDeemedApproval(db, bad.cfg, now);
    expect(r.report[0]).toMatchObject({ action: "skipped", detail: "send_failed" });
    expect(get("st-001").property.publishFlow.studioReconfirmSentAt).toBeNull();
    const good = mailer(true);
    await runDeemedApproval(db, good.cfg, now + 10 * 60_000);
    expect(good.sent).toHaveLength(1);
  });

  it("再確認から7日で公開し、みなし承認を記録して運営へ通知する（1回だけ）", async () => {
    const re = "2026-10-15T00:00:00.000Z";
    const p = recordReconfirmSent(inReview({ ownerId: "user_studio" }), { now: re, mode: "sent" });
    const { db, get, splits, payees } = fakeDb([p]);
    payees.push({ data: JSON.stringify({ id: "pay-1", userId: "user_studio" }) });
    const m = mailer();
    const now = Date.parse(re) + 7 * DAY;
    const r = await runDeemedApproval(db, m.cfg, now);
    expect(r.report[0].action).toBe("published");
    const row = get("st-001");
    expect(row.status).toBe("published");
    expect(row.property.status).toBe("published");
    expect(row.property.publishRequestedAt).toBeNull();
    expect(row.property.publishFlow.studioConfirmedVia).toBe("deemed");
    expect(row.property.publishFlow.deemedApprovedBy).toBe(DEEMED_APPROVAL_ACTOR);
    expect(row.property.publishFlow.deemedApprovedAt).toBe(new Date(now).toISOString());
    expect(row.property.publishedAt).toBe(new Date(now).toISOString());
    expect(m.sent).toHaveLength(1);
    expect(m.sent[0].to).toBe("contact@locahun3d.com");
    expect(m.sent[0].subject).toContain("みなし承認で公開しました");
    expect(JSON.parse(splits.get("st-001")!).lines).toEqual([
      { payeeId: "pay-1", role: "venue", ratePercent: 20 },
    ]);

    await runDeemedApproval(db, m.cfg, now + 10 * 60_000);
    expect(m.sent).toHaveLength(1);
  });

  it("公開に必要な項目が足りなければ公開せず保留し、通知は1回だけ", async () => {
    const re = "2026-10-15T00:00:00.000Z";
    const p = recordReconfirmSent(inReview(), { now: re, mode: "sent" });
    const broken = { ...p, cover: { ...p.cover, src: "" } };
    const { db, get } = fakeDb([broken]);
    const m = mailer();
    const now = Date.parse(re) + 8 * DAY;
    const r = await runDeemedApproval(db, m.cfg, now);
    expect(r.report[0].action).toBe("held");
    expect(get("st-001").status).toBe("draft");
    expect(get("st-001").property.publishFlow.deemedApprovalHeldAt).toBe(new Date(now).toISOString());
    await runDeemedApproval(db, m.cfg, now + 10 * 60_000);
    expect(m.sent).toHaveLength(1);
  });

  it("鍵が無い環境（開発）では送らず dry-run と記録し、そこからは公開しない", async () => {
    const { db, get } = fakeDb([inReview()]);
    const now = SENT_MS + 14 * DAY;
    const r = await runDeemedApproval(db, { resendApiKey: null, log: () => {} }, now);
    expect(r.report[0].action).toBe("reconfirm-dry-run");
    expect(get("st-001").property.publishFlow.studioReconfirmMode).toBe("dry-run");
    const r2 = await runDeemedApproval(db, { resendApiKey: null, log: () => {} }, now + 30 * DAY);
    expect(r2.report).toEqual([]);
    expect(get("st-001").status).toBe("draft");
  });

  it("MAIL_DRY_RUN では鍵があっても送らない", async () => {
    const { db } = fakeDb([inReview()]);
    const m = mailer();
    await runDeemedApproval(db, { ...m.cfg, dryRun: true }, SENT_MS + 14 * DAY);
    expect(m.sent).toHaveLength(0);
  });
});
