"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_CAPTION, MAX_GALLERY, type PhotoSlot } from "@/lib/studio-photo-edit";

/**
 * スタジオが確認ページで掲載写真を直接編集する欄（2026-10-02 本人指示
 * 「スタジオ確認用URLで写真を直接編集。公開前に追加・入れ替えが簡単にできるように」）。
 *
 * 操作するとその場でページに反映する（下のプレビューも描き直す）。
 *   - ページの先頭（カバー）: 差し替え・説明の編集
 *   - ページ内の写真: 追加・差し替え・並べ替え（左右）・カバーにする・削除・説明の編集
 * 受け口は /api/studio-photos/edit。確認メールのリンク（?approve=キー）から開いた、公開申請中の物件だけ。
 */

type Img = { src: string; alt: string; width: number; height: number };
type Photos = { cover: Img; gallery: Img[]; updatedAt: string };

/** 送る前に必ず JPEG に書き直す（位置情報などの EXIF を落とす。長辺 3000px まで縮める）。 */
async function toJpeg(file: File): Promise<{ blob: Blob; width: number; height: number } | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  const scale = Math.min(1, 3000 / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return null;
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  return blob ? { blob, width, height } : null;
}

export default function StudioPhotoEditor({
  token,
  approveKey,
  initial,
  en,
}: {
  token: string;
  approveKey: string;
  initial: Photos;
  en: boolean;
}) {
  const router = useRouter();
  const [photos, setPhotos] = useState<Photos>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replaceSlot = useRef<PhotoSlot | null>(null);
  const t = (ja: string, e: string) => (en ? e : ja);

  async function send(op: object, file?: { blob: Blob; width: number; height: number; name: string; alt?: string }) {
    const body = new FormData();
    body.set("token", token);
    body.set("key", approveKey);
    body.set("updatedAt", photos.updatedAt);
    body.set("op", JSON.stringify(op));
    if (file) {
      body.set("file", file.blob, file.name);
      body.set("width", String(file.width));
      body.set("height", String(file.height));
      body.set("alt", file.alt ?? "");
    }
    const res = await fetch("/api/studio-photos/edit", { method: "POST", body });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; photos?: Photos } | null;
    if (json?.photos) setPhotos(json.photos);
    if (!res.ok || !json?.ok) throw new Error(json?.error || t("保存できませんでした。", "Could not save."));
    return json.photos as Photos;
  }

  async function run(label: string, fn: () => Promise<void>, done: string) {
    setBusy(label);
    setMessage(null);
    try {
      await fn();
      setMessage({ text: done });
      router.refresh();
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : t("保存できませんでした。", "Could not save."), error: true });
    } finally {
      setBusy(null);
      setConfirmRemove(null);
    }
  }

  async function prepared(file: File) {
    const jpeg = await toJpeg(file);
    if (!jpeg) {
      throw new Error(
        t(
          `「${file.name}」はこのブラウザで読み込めません。JPEG で書き出してから選んでください。`,
          `"${file.name}" cannot be read in this browser. Please export it as JPEG.`,
        ),
      );
    }
    return { ...jpeg, name: file.name.replace(/\.[^.]+$/, "") + ".jpg", alt: file.name.replace(/\.[^.]+$/, "").slice(0, MAX_CAPTION) };
  }

  const onAdd = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    void run(
      "add",
      async () => {
        let i = 0;
        for (const f of list) {
          i += 1;
          setBusy(`add:${i}/${list.length}`);
          await send({ type: "add" }, await prepared(f));
        }
      },
      t(`${list.length}枚を追加しました。`, `Added ${list.length} photo(s).`),
    );
  };

  const onReplace = (files: FileList | null) => {
    const slot = replaceSlot.current;
    if (!files || !files[0] || !slot) return;
    const f = files[0];
    void run("replace", async () => void (await send({ type: "replace", slot }, await prepared(f))), t("差し替えました。", "Replaced."));
  };

  const pickReplace = (slot: PhotoSlot) => {
    replaceSlot.current = slot;
    replaceRef.current?.click();
  };

  const saveCaption = (slot: PhotoSlot, alt: string, current: string) => {
    if (alt.trim() === current.trim()) return;
    void run("caption", async () => void (await send({ type: "caption", slot, alt })), t("説明を保存しました。", "Caption saved."));
  };

  const n = photos.gallery.length;
  const btn =
    "min-h-[40px] px-3 border border-line text-[12px] hover:border-ink transition disabled:opacity-40 disabled:hover:border-line";
  const field = "w-full bg-[#0f0f0f] border border-line px-2.5 py-2 text-[13px] leading-[1.6]";
  const disabled = busy !== null;

  return (
    <div id="photos" className="frame border border-line bg-[#151515] px-4 py-4 text-[14px] text-ink" data-studio-photo-editor>
      <div className="mono text-[11px] tracking-[0.2em] uppercase text-muted mb-2">Photos</div>
      <p className="leading-[1.9] mb-3">
        {en ? (
          <>
            You can edit the photos on this page directly.
            <br />
            Add, replace, reorder or remove photos — changes appear on the page right away.
            <br />
            The page stays private until it is published.
          </>
        ) : (
          <>
            このページの写真を、ここで直接編集できます。
            <br />
            追加・差し替え・並べ替え・削除をすると、すぐに下のページへ反映されます。
            <br />
            公開されるまで、このページは一般には表示されません。
          </>
        )}
      </p>

      <input ref={addRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden"
        onChange={(e) => { onAdd(e.target.files); e.target.value = ""; }} />
      <input ref={replaceRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
        onChange={(e) => { onReplace(e.target.files); e.target.value = ""; }} />

      {/* ページの先頭（カバー） */}
      <div className="border border-line p-3 mb-4">
        <div className="text-[12px] text-muted mb-2">{t("ページの先頭（カバー）", "Top of the page (cover)")}</div>
        <div className="flex flex-col min-[560px]:flex-row gap-3">
          <div className="w-full min-[560px]:w-[240px] aspect-[16/10] shrink-0 bg-[#0f0f0f] border border-line overflow-hidden">
            {photos.cover.src ? (
              // eslint-disable-next-line @next/next/no-img-element -- R2 の公開画像。next/image は使わない
              <img src={photos.cover.src} alt={photos.cover.alt} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full grid place-items-center text-[12px] text-muted">{t("未設定", "Not set")}</div>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <input
              key={`cover-${photos.updatedAt}`}
              className={field}
              maxLength={MAX_CAPTION}
              defaultValue={photos.cover.alt}
              placeholder={t("写真の説明（例: 窓から自然光が入るメインスタジオ）", "Caption (e.g. main studio with daylight)")}
              disabled={disabled}
              onBlur={(e) => saveCaption({ kind: "cover" }, e.target.value, photos.cover.alt)}
            />
            <button type="button" className={btn} disabled={disabled} onClick={() => pickReplace({ kind: "cover" })}>
              {t("カバーを差し替える", "Replace cover")}
            </button>
          </div>
        </div>
      </div>

      {/* ページ内の写真 */}
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <div className="text-[12px] text-muted">
          {t(`ページ内の写真 ${n}枚`, `Photos on the page: ${n}`)}
          {n < 6 && <span className="text-accent ml-2">{t(`（あと${6 - n}枚あると見栄えが良くなります）`, `(${6 - n} more recommended)`)}</span>}
        </div>
        <button type="button" className={`${btn} border-accent text-accent`} disabled={disabled || n >= MAX_GALLERY} onClick={() => addRef.current?.click()}>
          {t("＋ 写真を追加", "+ Add photos")}
        </button>
      </div>

      <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
        {photos.gallery.map((g, i) => (
          <li key={`${g.src}-${i}`} className="border border-line p-2.5 flex flex-col gap-2">
            <div className="relative aspect-[4/3] bg-[#0f0f0f] overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element -- R2 の公開画像。next/image は使わない */}
              <img src={g.src} alt={g.alt} loading="lazy" className="w-full h-full object-cover" />
              <span className="absolute top-1.5 left-1.5 mono text-[11px] bg-black/70 px-1.5 py-0.5">{String(i + 1).padStart(2, "0")}</span>
            </div>
            <input
              key={`cap-${i}-${photos.updatedAt}`}
              className={field}
              maxLength={MAX_CAPTION}
              defaultValue={g.alt}
              placeholder={t("写真の説明", "Caption")}
              disabled={disabled}
              onBlur={(e) => saveCaption({ kind: "gallery", index: i }, e.target.value, g.alt)}
            />
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className={btn} aria-label={t("前へ", "Move earlier")} disabled={disabled || i === 0}
                onClick={() => void run("move", async () => void (await send({ type: "move", index: i, to: i - 1 })), t("並べ替えました。", "Reordered."))}>←</button>
              <button type="button" className={btn} aria-label={t("後ろへ", "Move later")} disabled={disabled || i === n - 1}
                onClick={() => void run("move", async () => void (await send({ type: "move", index: i, to: i + 1 })), t("並べ替えました。", "Reordered."))}>→</button>
              <button type="button" className={btn} disabled={disabled}
                onClick={() => void run("cover", async () => void (await send({ type: "cover", index: i })), t("カバーにしました。前のカバーはこの位置に移しました。", "Set as cover."))}>
                {t("カバーにする", "Make cover")}
              </button>
              <button type="button" className={btn} disabled={disabled} onClick={() => pickReplace({ kind: "gallery", index: i })}>
                {t("差し替え", "Replace")}
              </button>
              {confirmRemove === i ? (
                <button type="button" className={`${btn} border-[#ff9a8a] text-[#ff9a8a]`} disabled={disabled}
                  onClick={() => void run("remove", async () => void (await send({ type: "remove", index: i })), t("削除しました。", "Removed."))}>
                  {t("本当に削除", "Confirm remove")}
                </button>
              ) : (
                <button type="button" className={btn} disabled={disabled} onClick={() => setConfirmRemove(i)}>
                  {t("削除", "Remove")}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <p className={`text-[13px] mt-3 leading-[1.8] min-h-[1.8em] ${message?.error ? "text-[#ff9a8a]" : "text-muted"}`} aria-live="polite">
        {busy
          ? busy.startsWith("add:")
            ? t(`追加しています（${busy.slice(4)}）…`, `Adding (${busy.slice(4)})…`)
            : t("保存しています…", "Saving…")
          : message?.text}
      </p>
      <p className="text-[12px] text-muted leading-[1.8]">
        {t(
          "JPEG・PNG・WebP。大きな写真は自動で縮小し、位置情報などの撮影データは取り除いて保存します。",
          "JPEG / PNG / WebP. Large photos are resized and location data is removed before saving.",
        )}
      </p>
    </div>
  );
}
