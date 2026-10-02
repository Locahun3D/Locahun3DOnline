import type { Property } from "./schemas";

/**
 * スタジオが確認ページ（確認メールのリンク）で掲載写真を直接編集する（2026-10-02 本人指示
 * 「スタジオ確認用URLで、写真を直接編集できるように。公開前に写真の追加・入れ替えが簡単にできるように」）。
 *
 * 以前は「写真を送る」だけで、運営が採用するまでページに出なかった（隔離して1枚ずつ採用）。
 * スタジオ自身のページを、スタジオ自身が公開前に確認しながら直す場面なので、ここでは即反映する。
 * 公開はスタジオの「公開する」か運営の操作なので、直した内容は公開前に必ず目に入る。
 *
 * ここは純関数だけ（server / client 両方から import する。`server-only` 禁止）。
 * 受け口は app/api/studio-photos/edit/route.ts、画面は components/studio-photo-editor.tsx。
 */

/** ギャラリーに置ける枚数の上限（スキーマの上限 40 と同じ）。 */
export const MAX_GALLERY = 40;
/** スタジオが確認ページから追加・差し替えできる回数の上限（1物件あたり。荒らし対策）。 */
export const MAX_STUDIO_UPLOADS = 60;
export const MAX_CAPTION = 200;

export type EditImage = { src: string; alt: string; width: number; height: number };

/** 写真の場所。カバー（ページ頭）か、ギャラリーの何枚目か。 */
export type PhotoSlot = { kind: "cover" } | { kind: "gallery"; index: number };

export type StudioPhotoOp =
  | { type: "add"; image: EditImage }
  | { type: "replace"; slot: PhotoSlot; image: EditImage }
  | { type: "remove"; index: number }
  | { type: "move"; index: number; to: number }
  | { type: "cover"; index: number }
  | { type: "caption"; slot: PhotoSlot; alt: string };

type Photos = Pick<Property, "cover" | "gallery">;
export type EditResult = { ok: true; photos: Photos } | { ok: false; error: string };

const toImage = (img: EditImage, focus = "center") => ({
  src: img.src,
  alt: img.alt.slice(0, MAX_CAPTION),
  // 日本語の説明が変われば英訳は作り直す（空にしておくと定期処理が訳す）。
  altEn: "",
  width: img.width || 1600,
  height: img.height || 1000,
  focus,
});

function inRange(p: Photos, i: number): boolean {
  return Number.isInteger(i) && i >= 0 && i < p.gallery.length;
}

/** 1回分の編集を当てた新しい写真の並びを返す（元は書き換えない）。 */
export function applyStudioPhotoOp(p: Photos, op: StudioPhotoOp): EditResult {
  const gallery = p.gallery.map((g) => ({ ...g }));
  const cover = { ...p.cover };
  switch (op.type) {
    case "add": {
      if (gallery.length >= MAX_GALLERY) return { ok: false, error: `写真は ${MAX_GALLERY} 枚までです。` };
      // カバーが無いページなら、最初の1枚をカバーにする（空のページ頭を残さない）。
      if (!cover.src) return { ok: true, photos: { cover: toImage(op.image), gallery } };
      return { ok: true, photos: { cover, gallery: [...gallery, toImage(op.image)] } };
    }
    case "replace": {
      if (op.slot.kind === "cover") return { ok: true, photos: { cover: toImage(op.image, cover.focus || "center"), gallery } };
      if (!inRange(p, op.slot.index)) return { ok: false, error: "写真が見つかりません。" };
      gallery[op.slot.index] = toImage(op.image, gallery[op.slot.index].focus || "center");
      return { ok: true, photos: { cover, gallery } };
    }
    case "remove": {
      if (!inRange(p, op.index)) return { ok: false, error: "写真が見つかりません。" };
      gallery.splice(op.index, 1);
      return { ok: true, photos: { cover, gallery } };
    }
    case "move": {
      if (!inRange(p, op.index) || !Number.isInteger(op.to)) return { ok: false, error: "写真が見つかりません。" };
      const to = Math.max(0, Math.min(gallery.length - 1, op.to));
      const [item] = gallery.splice(op.index, 1);
      gallery.splice(to, 0, item);
      return { ok: true, photos: { cover, gallery } };
    }
    case "cover": {
      if (!inRange(p, op.index)) return { ok: false, error: "写真が見つかりません。" };
      const [chosen] = gallery.splice(op.index, 1);
      // 今のカバーは消さずに、選んだ写真が居た場所へ入れ替える（元に戻せるように）。
      if (cover.src) gallery.splice(op.index, 0, { ...cover, altEn: cover.altEn ?? "" });
      return { ok: true, photos: { cover: { ...chosen }, gallery } };
    }
    case "caption": {
      const alt = op.alt.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, MAX_CAPTION);
      if (op.slot.kind === "cover") return { ok: true, photos: { cover: { ...cover, alt, altEn: "" }, gallery } };
      if (!inRange(p, op.slot.index)) return { ok: false, error: "写真が見つかりません。" };
      gallery[op.slot.index] = { ...gallery[op.slot.index], alt, altEn: "" };
      return { ok: true, photos: { cover, gallery } };
    }
  }
}

/** リクエストの op を検証して型に合わせる（形が違えば null）。画像は呼び出し側で別に作る。 */
export function parseStudioPhotoOp(raw: unknown): Exclude<StudioPhotoOp, { type: "add" } | { type: "replace" }> | { type: "add" } | { type: "replace"; slot: PhotoSlot } | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const int = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? v : NaN);
  const slot = (v: unknown): PhotoSlot | null => {
    if (!v || typeof v !== "object") return null;
    const s = v as Record<string, unknown>;
    if (s.kind === "cover") return { kind: "cover" };
    if (s.kind === "gallery" && Number.isInteger(s.index)) return { kind: "gallery", index: s.index as number };
    return null;
  };
  switch (o.type) {
    case "add":
      return { type: "add" };
    case "replace": {
      const s = slot(o.slot);
      return s ? { type: "replace", slot: s } : null;
    }
    case "remove":
      return Number.isNaN(int(o.index)) ? null : { type: "remove", index: int(o.index) };
    case "move":
      return Number.isNaN(int(o.index)) || Number.isNaN(int(o.to)) ? null : { type: "move", index: int(o.index), to: int(o.to) };
    case "cover":
      return Number.isNaN(int(o.index)) ? null : { type: "cover", index: int(o.index) };
    case "caption": {
      const s = slot(o.slot);
      return s && typeof o.alt === "string" ? { type: "caption", slot: s, alt: o.alt } : null;
    }
    default:
      return null;
  }
}

/** スタジオが送った写真の公開用キー。ユーザー入力は混ぜない。 */
export function studioPublicKey(propertyId: string, id: string, ext: string): string {
  const safeProperty = propertyId.replace(/[^A-Za-z0-9_-]/g, "");
  const safeId = id.replace(/[^A-Za-z0-9]/g, "");
  return `uploads/${safeProperty}/studio-${safeId}${ext}`;
}
