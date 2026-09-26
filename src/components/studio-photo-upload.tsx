"use client";

import { useRef, useState } from "react";
import {
  MAX_PHOTO_NAME,
  MAX_PHOTO_NOTE,
  MAX_STUDIO_PHOTO_BYTES,
} from "@/lib/studio-photo-intake";

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

/** 画像の実寸を読む。HEIC などブラウザが復号できない形式では null。 */
async function readImageSize(file: File): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
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
    const next: Row[] = [];
    for (const file of Array.from(files).slice(0, 20)) {
      if (file.size > MAX_STUDIO_PHOTO_BYTES) {
        next.push({
          file,
          name: "",
          note: "",
          wantCover: false,
          state: "error",
          error: en ? "This file is over 25MB." : "25MBを超えています。",
        });
        continue;
      }
      next.push({ file, name: "", note: "", wantCover: false, state: "ready" });
    }
    setRows((prev) => [...prev, ...next]);
  };

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
      body.set("file", row.file);
      body.set("name", row.name);
      body.set("note", row.note);
      body.set("wantCover", row.wantCover ? "1" : "0");
      // 実寸はブラウザで読んで送る（掲載時の縦横比に使う）。読めない形式では送らない。
      const size = await readImageSize(row.file);
      if (size) {
        body.set("width", String(size.width));
        body.set("height", String(size.height));
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
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                <span className="text-[13px] break-all">{row.file.name}</span>
                <span className="text-[12px] text-muted">
                  {row.state === "sent"
                    ? en ? "Sent" : "送信しました"
                    : row.state === "sending"
                      ? en ? "Sending…" : "送信中…"
                      : row.state === "error"
                        ? row.error
                        : formatSize(row.file.size)}
                </span>
              </div>
              {row.state !== "sent" && (
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
          ? "JPEG / PNG / WebP / HEIC, up to 25MB each."
          : "JPEG・PNG・WebP・HEIC、1枚25MBまで。"}
      </p>
    </div>
  );
}
