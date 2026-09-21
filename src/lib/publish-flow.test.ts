import { describe, it, expect } from "vitest";
import { propertySchema, type Property } from "./schemas";
import {
  EMPTY_PUBLISH_FLOW,
  RESEND_COOLDOWN_MS,
  canRequestReview,
  canStudioApprove,
  canResendStudioMail,
  canReusePreview,
  enterReview,
  isPlausibleEmail,
  markPublished,
  publishStage,
  publishDisplayStage,
  PUBLISH_DISPLAY_LABEL,
  publishWarnings,
  recordStudioNotified,
  resendCooldownRemaining,
  resetReview,
  reviewSubState,
  setStudioConfirmed,
  translationGuard,
} from "./publish-flow";
import { missingEnglishFields, needsEnglish } from "./property-english";

const img = (n: number) => ({ src: `/api/r2/g${n}.jpg`, alt: `写真${n}`, altEn: `Photo ${n}`, width: 1600, height: 1000 });

/** 公開要件を満たし、英訳も揃った物件。 */
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
  });
  return { ...base, ...over };
}

const NOW = "2026-09-20T03:00:00.000Z";

describe("publishFlow スキーマ", () => {
  it("publishFlow を持たない旧レコード（Dropbox パイプラインの SQL 行）も parse できる", () => {
    const p = propertySchema.parse({
      id: "wh-001",
      status: "draft",
      category: "warehouse",
      cover: { src: "", alt: "", width: 1600, height: 1000 },
    });
    expect(p.publishFlow).toEqual(EMPTY_PUBLISH_FLOW);
    expect(p.publishRequestedAt).toBeNull();
  });
  it("テスト用の ready() は公開要件を満たしている（前提の確認）", () => {
    expect(canRequestReview(ready(), { skipMail: false })).toEqual({ ok: true });
  });
});

describe("publishStage", () => {
  it("draft + publishRequestedAt = 公開申請中。status は増やさない", () => {
    expect(publishStage({ status: "draft", publishRequestedAt: null })).toBe("draft");
    expect(publishStage({ status: "draft", publishRequestedAt: NOW })).toBe("review");
    expect(publishStage({ status: "published", publishRequestedAt: NOW })).toBe("published");
    expect(publishStage({ status: "archived", publishRequestedAt: NOW })).toBe("archived");
  });
});

describe("canRequestReview", () => {
  it("必須項目が足りないと止める（不足項目名を返す）", () => {
    const r = canRequestReview(ready({ summary: "" }), { skipMail: false });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("not_ready");
      expect(r.error).toContain("紹介文");
    }
  });
  it("スタジオのメールが空なら止める（黙って未送信のまま進めない）", () => {
    const r = canRequestReview(ready({ contactEmail: "", contactWebsite: "https://example.com" }), { skipMail: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("no_studio_email");
  });
  it("「メールを送らずに申請中にする」を明示すればメール無しでも通る", () => {
    const r = canRequestReview(ready({ contactEmail: "", contactWebsite: "https://example.com" }), { skipMail: true });
    expect(r).toEqual({ ok: true });
  });
  it("形式のおかしいアドレスは送信前に止める", () => {
    const r = canRequestReview(ready({ contactEmail: "studio＠example" }), { skipMail: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("bad_studio_email");
  });
  it("公開中・アーカイブからは申請にできない", () => {
    expect(canRequestReview(ready({ status: "published" }), { skipMail: true }).ok).toBe(false);
    expect(canRequestReview(ready({ status: "archived" }), { skipMail: true }).ok).toBe(false);
  });
  it("isPlausibleEmail", () => {
    expect(isPlausibleEmail("a@b.co")).toBe(true);
    expect(isPlausibleEmail(" a@b.co ")).toBe(true);
    expect(isPlausibleEmail("a@b")).toBe(false);
    expect(isPlausibleEmail("a@b.co, c@d.co")).toBe(false);
    expect(isPlausibleEmail("")).toBe(false);
  });
});

describe("翻訳必須ガード", () => {
  it("英訳が揃っていれば通る", () => {
    expect(needsEnglish(ready())).toBe(false);
    expect(translationGuard(ready())).toEqual({ ok: true });
  });
  it("自動翻訳が失敗して EN が空のままなら公開申請を止め、未翻訳の項目名を出す", () => {
    const p = ready({ titleEn: "", description: "天井が高い。", descriptionEn: "" });
    expect(missingEnglishFields(p)).toEqual(["物件名", "概要"]);
    const r = translationGuard(p);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("translation_missing");
      expect(r.error).toContain("物件名");
      expect(r.error).toContain("概要");
    }
  });
  it("日本語が空の欄は翻訳不要（EN が空でも未翻訳に数えない）", () => {
    expect(missingEnglishFields(ready({ address: "", addressEn: "" }))).toEqual([]);
  });
  it("ギャラリーの代替テキストと 3DGS シーン名も対象", () => {
    const p = ready();
    p.gallery = p.gallery.map((g, i) => (i < 2 ? { ...g, altEn: "" } : g));
    expect(missingEnglishFields(p)).toEqual(["ギャラリーの代替テキスト（2枚）"]);
  });
});

describe("遷移", () => {
  it("下書き → 公開申請: 申請日時・操作者・送信先を記録し、status は draft のまま", () => {
    const out = enterReview(ready(), { by: "admin@locahun3d.com", now: NOW, mail: { mode: "sent", to: "studio@example.com" } });
    expect(out.status).toBe("draft");
    expect(out.publishRequestedAt).toBe(NOW);
    expect(publishStage(out)).toBe("review");
    expect(out.publishFlow).toMatchObject({
      requestedAt: NOW,
      requestedBy: "admin@locahun3d.com",
      studioNotifiedAt: NOW,
      studioNotifiedTo: "studio@example.com",
      studioNotifyMode: "sent",
      studioConfirmedAt: null,
    });
    expect(reviewSubState(out.publishFlow)).toBe("awaiting-studio");
  });
  it("スタジオ自身がすでに申請していた場合、申請日時は保持する", () => {
    const earlier = "2026-09-10T00:00:00.000Z";
    const out = enterReview(ready({ publishRequestedAt: earlier }), { by: "admin", now: NOW, mail: { mode: "sent", to: "s@example.com" } });
    expect(out.publishRequestedAt).toBe(earlier);
    expect(out.publishFlow.requestedAt).toBe(earlier);
    expect(out.publishFlow.studioNotifiedAt).toBe(NOW);
  });
  it("メールを送らずに申請中: skipped と記録し、状態は「確認メール未送信」", () => {
    const out = enterReview(ready(), { by: "admin", now: NOW, mail: { mode: "skipped" } });
    expect(out.publishFlow.studioNotifyMode).toBe("skipped");
    expect(out.publishFlow.studioNotifiedAt).toBeNull();
    expect(reviewSubState(out.publishFlow)).toBe("mail-unsent");
  });
  it("ドライランは dry-run と記録する（実送信と区別できる）", () => {
    const out = enterReview(ready(), { by: "admin", now: NOW, mail: { mode: "dry-run", to: "s@example.com" } });
    expect(out.publishFlow.studioNotifyMode).toBe("dry-run");
  });
  it("スタジオ確認済みの記録と解除", () => {
    const inReview = enterReview(ready(), { by: "admin", now: NOW, mail: { mode: "sent", to: "s@example.com" } });
    const ok = setStudioConfirmed(inReview, { confirmed: true, now: "2026-09-21T00:00:00.000Z" });
    expect(ok.publishFlow.studioConfirmedAt).toBe("2026-09-21T00:00:00.000Z");
    expect(reviewSubState(ok.publishFlow)).toBe("studio-confirmed");
    expect(setStudioConfirmed(ok, { confirmed: false, now: NOW }).publishFlow.studioConfirmedAt).toBeNull();
  });
  it("公開: 申請フラグを消し公開日時を刻む。申請〜確認の記録は残す", () => {
    const inReview = setStudioConfirmed(
      enterReview(ready(), { by: "admin", now: NOW, mail: { mode: "sent", to: "s@example.com" } }),
      { confirmed: true, now: NOW },
    );
    const pub = markPublished(inReview, "2026-09-22T00:00:00.000Z");
    expect(pub.status).toBe("published");
    expect(pub.publishRequestedAt).toBeNull();
    expect(pub.publishFlow.publishedAt).toBe("2026-09-22T00:00:00.000Z");
    expect(pub.publishFlow.studioConfirmedAt).toBe(NOW);
    expect(pub.publishFlow.studioNotifiedTo).toBe("s@example.com");
  });
  it("取り下げ: 申請まわりを白紙に戻す（公開日時の履歴だけ残す）", () => {
    const pub = markPublished(enterReview(ready(), { by: "admin", now: NOW, mail: { mode: "sent", to: "s@example.com" } }), NOW);
    const back = resetReview(pub);
    expect(back.publishRequestedAt).toBeNull();
    expect(back.publishFlow).toEqual({ ...EMPTY_PUBLISH_FLOW, publishedAt: NOW });
  });
  it("再申請すると以前の「確認済み」は無効になる（確認したのは前の内容）", () => {
    const confirmed = setStudioConfirmed(
      enterReview(ready(), { by: "admin", now: NOW, mail: { mode: "sent", to: "s@example.com" } }),
      { confirmed: true, now: NOW },
    );
    const again = enterReview(confirmed, { by: "admin", now: "2026-09-25T00:00:00.000Z", mail: { mode: "sent", to: "s@example.com" } });
    expect(again.publishFlow.studioConfirmedAt).toBeNull();
  });
});

describe("確認メールの再送ガード", () => {
  const sentAt = Date.parse(NOW);
  const inReview = enterReview(ready(), { by: "admin", now: NOW, mail: { mode: "sent", to: "studio@example.com" } });

  it("送信から 60 秒以内は再送できない（二重送信防止）", () => {
    expect(resendCooldownRemaining(inReview.publishFlow, sentAt + 10_000)).toBe(RESEND_COOLDOWN_MS - 10_000);
    const r = canResendStudioMail(inReview, sentAt + 10_000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("cooldown");
  });
  it("60 秒過ぎれば再送できる", () => {
    expect(canResendStudioMail(inReview, sentAt + RESEND_COOLDOWN_MS)).toEqual({ ok: true });
  });
  it("申請中でない物件には送れない（下書き・公開中）", () => {
    expect(canResendStudioMail(ready()).ok).toBe(false);
    expect(canResendStudioMail(markPublished(inReview, NOW), sentAt + 120_000).ok).toBe(false);
  });
  it("宛先が無ければ送れない", () => {
    const r = canResendStudioMail({ ...inReview, contactEmail: "" }, sentAt + 120_000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("no_studio_email");
  });
  it("再送を記録すると日時と宛先が更新される", () => {
    const out = recordStudioNotified(inReview, { now: "2026-09-21T00:00:00.000Z", mail: { mode: "sent", to: "new@example.com" } });
    expect(out.publishFlow.studioNotifiedAt).toBe("2026-09-21T00:00:00.000Z");
    expect(out.publishFlow.studioNotifiedTo).toBe("new@example.com");
    expect(out.publishFlow.requestedAt).toBe(NOW);
  });
});

describe("プレビューリンクの使い回し", () => {
  const now = Date.parse(NOW);
  const days = (n: number) => new Date(now + n * 86_400_000).toISOString();
  it("残り 14 日以上なら既存 URL を使う（共有済み URL を壊さない）", () => {
    expect(canReusePreview({ expiresAt: days(20) }, now)).toBe(true);
  });
  it("残りが少ない・期限切れ・未発行なら再発行", () => {
    expect(canReusePreview({ expiresAt: days(3) }, now)).toBe(false);
    expect(canReusePreview({ expiresAt: days(-1) }, now)).toBe(false);
    expect(canReusePreview(null, now)).toBe(false);
  });
});

describe("publishWarnings（止めないが確認ダイアログを出す）", () => {
  it("申請を経ていない公開", () => {
    expect(publishWarnings({ publishRequestedAt: null, publishFlow: EMPTY_PUBLISH_FLOW })).toHaveLength(1);
  });
  it("申請中だがスタジオ未確認", () => {
    const w = publishWarnings({ publishRequestedAt: NOW, publishFlow: EMPTY_PUBLISH_FLOW });
    expect(w[0]).toContain("スタジオの確認");
  });
  it("確認済みなら警告なし", () => {
    expect(publishWarnings({ publishRequestedAt: NOW, publishFlow: { ...EMPTY_PUBLISH_FLOW, studioConfirmedAt: NOW } })).toEqual([]);
  });
});

describe("canStudioApprove（スタジオの承認ボタンで公開してよいか）", () => {
  const inReview = (over: Partial<Property["publishFlow"]> = {}): Property =>
    ready({
      publishRequestedAt: "2026-09-21T00:00:00.000Z",
      publishFlow: { ...EMPTY_PUBLISH_FLOW, studioNotifiedAt: "2026-09-21T00:00:00.000Z", studioNotifiedTo: "s@example.com", studioNotifyMode: "sent", studioApproveKeyHash: "h1", ...over },
    });
  it("申請中・メール送信済み・キー一致のときだけ通る", () => {
    expect(canStudioApprove(inReview(), "h1").ok).toBe(true);
    expect(canStudioApprove(inReview(), "other").ok).toBe(false);
    expect(canStudioApprove(inReview(), "").ok).toBe(false);
  });
  it("プレビューURLだけ（キーなし）・メール未送信・申請前・公開済みは通らない", () => {
    expect(canStudioApprove(inReview({ studioApproveKeyHash: null }), "").ok).toBe(false);
    expect(canStudioApprove(inReview({ studioNotifyMode: "skipped" }), "h1").ok).toBe(false);
    expect(canStudioApprove({ ...inReview(), publishRequestedAt: null }, "h1").ok).toBe(false);
    expect(canStudioApprove({ ...inReview(), status: "published" }, "h1").ok).toBe(false);
  });
  it("メールを送り直すとキーが入れ替わり、公開・取り下げでキーは消える", () => {
    const resent = recordStudioNotified(inReview(), { now: "2026-09-22T00:00:00.000Z", mail: { mode: "sent", to: "s@example.com", approveKeyHash: "h2" } });
    expect(canStudioApprove(resent, "h1").ok).toBe(false);
    expect(canStudioApprove(resent, "h2").ok).toBe(true);
    expect(markPublished(resent, "2026-09-23T00:00:00.000Z").publishFlow.studioApproveKeyHash).toBeNull();
    expect(resetReview(resent).publishFlow.studioApproveKeyHash).toBeNull();
  });
});

describe("publishDisplayStage（一覧・エディターの表示）", () => {
  const draft = ready();
  it("下書き → 公開申請待ち → 公開申請済み → 公開中", () => {
    expect(publishDisplayStage(draft, false)).toBe("draft");
    expect(publishDisplayStage(draft, true)).toBe("ready");
    expect(publishDisplayStage({ ...draft, publishRequestedAt: "2026-09-21T00:00:00.000Z" }, true)).toBe("review");
    expect(publishDisplayStage({ ...draft, status: "published" }, true)).toBe("published");
    expect(publishDisplayStage({ ...draft, status: "archived" }, true)).toBe("archived");
  });
  it("申請中とアーカイブは、項目の充足では変わらない", () => {
    expect(publishDisplayStage({ ...draft, publishRequestedAt: "2026-09-21T00:00:00.000Z" }, false)).toBe("review");
    expect(publishDisplayStage({ ...draft, status: "archived" }, false)).toBe("archived");
  });
  it("表示の名前", () => {
    expect(PUBLISH_DISPLAY_LABEL.ready).toBe("公開申請待ち");
    expect(PUBLISH_DISPLAY_LABEL.review).toBe("公開申請済み");
  });
});
