import type { Property } from "./schemas";

/**
 * 3Dデータ販売の許諾（2026-09-26 本人指示）。
 *
 * ── なぜ要るか ─────────────────────────────────────────────
 * 掲載の確認メールとは別に「3Dデータ（PLY/OBJ）を販売してよいか」を口頭やメールで
 * 個別に聞いていたため、誰にいつ聞いて、何と答えられたかが残らなかった
 * （ビュースタジオ水道橋の 15万円販売がその例）。確認メールに許諾のお願いと規約を
 * 同送し、答えをこの欄に残す。
 *
 * 掲載の承認（publishFlow）とは独立して扱う。「掲載はOK・販売はNG」も、
 * 「公開後に販売だけOK」もあるため。ここは純関数だけ（server / client 両方から import）。
 */

export type DataSaleConsent = Property["dataSaleConsent"];
export type DataSaleStatus = DataSaleConsent["status"];
export type DataSaleAnswer = "granted" | "declined";

export const DATA_SALE_STATUS_LABEL: Record<DataSaleStatus, string> = {
  unasked: "未確認",
  asked: "確認中（返事待ち）",
  granted: "販売OK",
  declined: "販売しない",
};

export const EMPTY_DATA_SALE_CONSENT: DataSaleConsent = {
  status: "unasked",
  askedAt: null,
  answeredAt: null,
  answeredVia: null,
  note: "",
  proposedPrice: 0,
  keyHash: null,
};

/** 掲載者への分配率（掲載データ販売分配規約 第2条）。メール文面と画面で同じ数字を使う。 */
export const REVENUE_SHARE_PERCENT = 20;

export function dataSaleConsentOf(p: Pick<Property, "dataSaleConsent">): DataSaleConsent {
  return p.dataSaleConsent ?? EMPTY_DATA_SALE_CONSENT;
}

/**
 * 確認メールに載せる販売価格（税込・円）。0 なら「価格は改めてご相談」と書く。
 * 物件に販売中の3Dデータがあればその価格、無ければ 0。
 */
export function proposedSalePrice(p: Pick<Property, "splatItems">): number {
  for (const item of p.splatItems ?? []) {
    if (!item.forSale) continue;
    const tiers = item.licenseOptions ?? [];
    const price = tiers.length > 0 ? Math.min(...tiers.map((t) => t.price)) : item.salePrice;
    if (price > 0) return price;
  }
  return 0;
}

/** 確認メールを送った時点の記録（キーのハッシュと提示価格を残す）。 */
export function markDataSaleAsked<T extends Property>(
  p: T,
  opts: { now: string; keyHash: string; proposedPrice: number },
): T {
  const prev = dataSaleConsentOf(p);
  return {
    ...p,
    dataSaleConsent: {
      ...prev,
      // すでに答えをもらっているなら状態は変えない（聞き直しても答えを消さない）。
      status: prev.status === "unasked" ? "asked" : prev.status,
      askedAt: opts.now,
      proposedPrice: opts.proposedPrice || prev.proposedPrice,
      keyHash: opts.keyHash,
    },
  };
}

export type ConsentGuard = { ok: true } | { ok: false; code: string; error: string };

/**
 * スタジオが回答リンクから答えてよいか。
 * 認可はログインではなく「確認メールのURLに入っていたキー」で行う（掲載承認と同じ考え方）。
 */
export function canAnswerDataSale(p: Property, keyHash: string): ConsentGuard {
  const consent = dataSaleConsentOf(p);
  if (!consent.keyHash) {
    return { ok: false, code: "not_asked", error: "この物件では販売許諾の確認を受け付けていません。" };
  }
  if (!keyHash || keyHash !== consent.keyHash) {
    return {
      ok: false,
      code: "bad_key",
      error: "このリンクでは回答できません。最新の確認メールのリンクからお開きください。",
    };
  }
  return { ok: true };
}

/** 回答を記録。答え直し（OK → やっぱり不可）も同じ関数で上書きする。 */
export function recordDataSaleAnswer<T extends Property>(
  p: T,
  opts: { answer: DataSaleAnswer; now: string; via: "studio-link" | "admin"; note?: string },
): T {
  const prev = dataSaleConsentOf(p);
  return {
    ...p,
    dataSaleConsent: {
      ...prev,
      status: opts.answer,
      answeredAt: opts.now,
      answeredVia: opts.via,
      note: (opts.note ?? prev.note).slice(0, 400),
    },
  };
}
