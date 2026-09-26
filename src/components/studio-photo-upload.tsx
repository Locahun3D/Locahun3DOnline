"use client";

import { useEffect, useRef, useState } from "react";
import {
  MAX_PHOTO_NAME,
  MAX_PHOTO_NOTE,
  MAX_STUDIO_PHOTO_BYTES,
} from "@/lib/studio-photo-intake";

/**
 * 送る前にブラウザで縮小する（2026-09-26 本人指示「25MB制限とって、入れ込むときに最適化」）。
 * 長辺をこの大きさまで落とし、JPEG に書き直す。掲載ページの表示は最大2000px前後なので、
 * トリミングの余裕を見ても十分。書き直すと EXIF（撮影者名・GPS）も落ちる。
 * 8K の書き出し画像（数十MB）でも、送るのは数MBになる。
 */
const OPTIMIZE_LONG_EDGE = 3000;
const OPTIMIZE_QUALITY = 0.9;

/**
 * スタジオが掲載用の写真を送る欄（2026-09-26 本人指示）。
 * 確認メールのリンク（?approve=キー）から開いたときだけ、プレビュー画面に出る。
 *
 * 1枚ずつ「名前・注釈・カバー希望」を付けて送ってもらう（本人指示
 * 「名前、注釈、ヘッダー希望などを付けてもらえるとどこの写真かわかる」）。
 * まとめて選べるが、名前と注釈は1枚ごとに書けるようにしてある。
 * 送信先は /api/studio-photos。届いた写真は運営が採用するまで公開されない。
 */
type Row = {
  file: File;
  /** 一覧に出す小さな見本（ブラウザ内のURL。HEIC など表示できない形式では空）。 */
  preview: string;
  name: string;
  note: string;
  wantCover: boolean;
  state: "ready" | "sending" | "sent" | "error";
  error?: string;
};

/** 1MB 未満は KB で出す（小さい写真が「0 MB」と出ると壊れて見える）。 */
function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${Math.round(bytes / 1024 / 102.4) / 10} MB`;
}

/**
 * 送る前の最適化。長辺 OPTIMIZE_LONG_EDGE まで縮めて JPEG にする。
 * ブラウザが読めない形式（多くのブラウザでの HEIC）は null を返し、原本のまま送る。
 * 元より大きくなる場合（小さい写真を書き直したとき）も原本を使う。
 */
async function optimize(file: File): Promise<{ blob: Blob; width: number; height: number } | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  const scale = Math.min(1, OPTIMIZE_LONG_EDGE / Math.max(bitmap.width, bitmap.height));
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
  // 透過PNGは黒く潰れないよう白地に置く（写真の用途では透過は要らない）。
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", OPTIMIZE_QUALITY),
  );
  if (!blob) return null;
  if (scale === 1 && blob.size >= file.size && file.type === "image/jpeg") {
    return { blob: file, width, height };
  }
  return { blob, width, height };
}

/** 一覧のサムネイルに使えるか（多くのブラウザは HEIC を表示できない）。 */
function canPreview(file: File): boolean {
  return /^image\/(jpeg|png|webp|gif|avif)$/.test(file.type);
}

export default function StudioPhotoUpload({
  token,
  approveKey,
  en,
  missingCount,
}: {
  token: string;
  approveKey: string;
  en: boolean;
  /** 公開に必要な枚数まで、あと何枚か（0なら足りている）。 */
  missingCount: number;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [sentTotal, setSentTotal] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const add = (files: FileList | null) => {
    if (!files) return;
    const next: Row[] = Array.from(files)
      .slice(0, 20)
      .map((file) => ({
        file,
        preview: canPreview(file) ? URL.createObjectURL(file) : "",
        name: "",
        note: "",
        wantCover: false,
        state: "ready" as const,
      }));
    setRows((prev) => [...prev, ...next]);
  };

  const remove = (i: number) =>
    setRows((prev) => {
      const gone = prev[i];
      if (gone?.preview) URL.revokeObjectURL(gone.preview);
      return prev.filter((_, idx) => idx !== i);
    });

  // 画面を離れるときにサムネイルのURLを解放する（描画中に ref を書かないよう effect で同期）。
  const rowsRef = useRef<Row[]>([]);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  useEffect(
    () => () => {
      for (const r of rowsRef.current) if (r.preview) URL.revokeObjectURL(r.preview);
    },
    [],
  );

  const patch = (i: number, p: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...p } : r)));

  const send = async () => {
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (row.state !== "ready") continue;
      patch(i, { state: "sending", error: undefined });
      const body = new FormData();
      body.set("token", token);
      body.set("key", approveKey);
      // 送る前に縮小（25MB の上限はやめた。大きな書き出し画像もここで数MBになる）。
      const optimized = await optimize(row.file);
      const payload = optimized ? optimized.blob : row.file;
      if (payload.size > MAX_STUDIO_PHOTO_BYTES) {
        patch(i, {
          state: "error",
          error: en
            ? "This file is too large to send and could not be shrunk in the browser."
            : "この形式は自動で縮小できず、大きすぎて送れません。JPEG で書き出して選び直してください。",
        });
        continue;
      }
      const outName = optimized ? row.file.name.replace(/\.[^.]+$/, "") + ".jpg" : row.file.name;
      body.set("file", payload, outName);
      body.set("name", row.name);
      body.set("note", row.note);
      body.set("wantCover", row.wantCover ? "1" : "0");
      if (optimized) {
        body.set("width", String(optimized.width));
        body.set("height", String(optimized.height));
      }
      try {
        const res = await fetch("/api/studio-photos", { method: "POST", body });
        const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        if (!res.ok || !json?.ok) {
          patch(i, {
            state: "error",
            error: json?.error || (en ? "Upload failed." : "送信できませんでした。"),
          });
          continue;
        }
        patch(i, { state: "sent" });
        setSentTotal((n) => n + 1);
      } catch {
        patch(i, { state: "error", error: en ? "Network error." : "通信に失敗しました。" });
      }
    }
  };

  const pending = rows.filter((r) => r.state === "ready").length;
  const box = "frame border border-line bg-[#151515] px-4 py-4 text-[14px] text-ink";
  const field =
    "w-full bg-[#0f0f0f] border border-line px-3 py-2 text-[13px] leading-[1.7]";
  const primary =
    "min-h-[44px] px-5 bg-accent text-black font-bold text-[14px] tracking-[0.04em] disabled:opacity-50";
  const ghost = "min-h-[44px] px-4 border border-line text-[13px]";

  return (
    <div id="photos" className={box} data-studio-photos={pending > 0 ? "ready" : "idle"}>
      <div className="mono text-[11px] tracking-[0.2em] uppercase text-muted mb-2">Photos</div>
      <p className="leading-[1.9] mb-3">
        {en ? (
          <>
            You can send photos for this page here.
            <br />
            {missingCount > 0
              ? `${missingCount} more photo${missingCount > 1 ? "s" : ""} are needed to publish.`
              : "Extra photos are welcome; we will pick the best ones."}
            <br />
            Please add a name, a note and tick the box if you want it at the top — it tells us which
            room each photo shows.
            <br />
            When you add or change photos, please let us know by replying to our email.
          </>
        ) : (
          <>
            掲載ページに使う写真を、ここから送っていただけます。
            <br />
            {missingCount > 0
              ? `公開にはあと ${missingCount} 枚必要です。`
              : "追加の写真も歓迎です。良いものを選んで掲載します。"}
            <br />
            どの部屋の写真か分かるように、1枚ずつ「名前」「注釈」をお書きください。
            <br />
            ページの頭（カバー）に使ってほしい写真には、チェックを入れてください。
            <br />
            追加、変更した場合はメールの返信にてお知らせください。
          </>
        )}
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        className="hidden"
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="flex flex-wrap gap-2 mb-3">
        <button type="button" className={ghost} onClick={() => inputRef.current?.click()}>
          {en ? "Choose photos" : "写真を選ぶ"}
        </button>
        {pending > 0 && (
          <button type="button" className={primary} onClick={send}>
            {en ? `Send ${pending} photo(s)` : `${pending}枚を送る`}
          </button>
        )}
      </div>

      {rows.length > 0 && (
        <ul className="space-y-3">
          {rows.map((row, i) => (
            <li key={`${row.file.name}-${i}`} className="border border-line p-3">
              {/* サムネイルを左に置く（2026-09-26 本人指示「サムネ表示がいる」）。
                  どの写真に名前・注釈を書いているかが一目で分かるように。 */}
              <div className="flex gap-3">
                <div className="w-[96px] h-[64px] shrink-0 bg-[#0f0f0f] border border-line overflow-hidden flex items-center justify-center">
                  {row.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element -- ブラウザ内の一時URL。next/image は使わない
                    <img src={row.preview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="mono text-[10px] text-muted">
                      {/\.hei[cf]$/i.test(row.file.name) ? "HEIC" : en ? "No preview" : "表示不可"}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                    <span className="text-[13px] break-all">{row.file.name}</span>
                    <span className="flex items-baseline gap-3">
                      <span className={`text-[12px] ${row.state === "error" ? "text-[#ff9a8a]" : "text-muted"}`}>
                        {row.state === "sent"
                          ? en ? "Sent" : "送信しました"
                          : row.state === "sending"
                            ? en ? "Optimizing & sending…" : "縮小して送信中…"
                            : row.state === "error"
                              ? row.error
                              : formatSize(row.file.size)}
                      </span>
                      {/* 送る前なら一覧から外せる（2026-09-26 本人指示「削除ボタンほしい」）。 */}
                      {(row.state === "ready" || row.state === "error") && (
                        <button
                          type="button"
                          onClick={() => remove(i)}
                          className="min-h-[32px] px-3 border border-line text-[12px] text-muted hover:text-ink hover:border-ink transition"
                        >
                          {en ? "Remove" : "削除"}
                        </button>
                      )}
                    </span>
                  </div>
                  {/* 送れなかったファイルには名前・注釈の欄を出さない（書いても無駄になる）。 */}
                  {row.state !== "sent" && row.state !== "error" && (
                    <div className="space-y-2">
                      <input
                        className={field}
                        maxLength={MAX_PHOTO_NAME}
                        value={row.name}
                        onChange={(e) => patch(i, { name: e.target.value })}
                        placeholder={en ? "Name (e.g. 2F studio, window side)" : "名前（例: 2Fスタジオ 窓側）"}
                      />
                      <input
                        className={field}
                        maxLength={MAX_PHOTO_NOTE}
                        value={row.note}
                        onChange={(e) => patch(i, { note: e.target.value })}
                        placeholder={en ? "Note (e.g. morning daylight)" : "注釈（例: 午前中の自然光）"}
                      />
                      <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={row.wantCover}
                          onChange={(e) => patch(i, { wantCover: e.target.checked })}
                        />
                        <span>{en ? "Use this at the top of the page" : "ページの頭（カバー）に使ってほしい"}</span>
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {sentTotal > 0 && (
        <p className="text-[13px] text-muted mt-3 leading-[1.8]">
          {en
            ? `Thank you — ${sentTotal} photo(s) received. We will check them and add them to the page.`
            : `ありがとうございます。${sentTotal}枚お預かりしました。内容を確認のうえ掲載ページに入れます。`}
        </p>
      )}
      <p className="text-[12px] text-muted mt-2 leading-[1.8]">
        {en
          ? "JPEG / PNG / WebP / HEIC. Large photos are resized automatically before sending."
          : "JPEG・PNG・WebP・HEIC。大きな写真は、送るときに自動で縮小します。"}
      </p>
    </div>
  );
}
