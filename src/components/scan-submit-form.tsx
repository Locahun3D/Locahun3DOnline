"use client";

import { useActionState, useRef, useState } from "react";
import { submitScanSubmissionAction, type ScanSubmitState } from "@/lib/scan-submission-actions";
import { PROPERTY_CATEGORIES, categoryLabel } from "@/lib/schemas";
import { useLocale } from "@/components/locale-provider";

const MAX_SAMPLE_IMAGES = 5;
const MAX_SAMPLE_IMAGE_BYTES = 25 * 1024 * 1024; // 25MB
const SAMPLE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const inputClass =
  "w-full border border-line rounded-md px-3.5 py-2.5 text-[14px] bg-white focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition";

const CONSENT_ITEMS_JA = [
  "本データは自身が撮影したもので、第三者の権利を侵害しないことを保証します",
  "掲載・販売は当社が施設の許諾を得られた場合のみ行われ、それまで内容は非公開で取り扱われます",
  "許諾が得られなかった場合、お預かりした内容（サンプル画像を含む）は削除されます",
  "売上の分配率・支払条件は成立時に個別に合意します（個人への支払いは源泉徴収の対象となる場合があります）",
  "本データのAI学習利用に関するライセンス管理は当社に委ねます",
];

const CONSENT_ITEMS_EN = [
  "This data was captured by me, and does not infringe any third party's rights.",
  "Listing and sale will only happen once we have obtained the facility's permission — until then, everything is handled privately.",
  "If permission cannot be obtained, everything we hold (including sample images) will be deleted.",
  "Revenue share and payment terms will be agreed individually once a deal is reached (payments to individuals may be subject to withholding tax).",
  "Management of AI-training licensing for this data is entrusted to us.",
];

/**
 * /submit-scan の申請フォーム。事業背景は scan-submissions.ts 冒頭コメント参照:
 * 「非公開預かり」が安全装置なので、ここで受け取るのはサンプル画像のみ
 * （フルデータの受け渡しは審査通過後に個別案内）。
 */
export default function ScanSubmitForm() {
  const en = useLocale() === "en";
  const [state, formAction, pending] = useActionState<ScanSubmitState, FormData>(
    submitScanSubmissionAction,
    undefined,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState("");

  const syncFiles = (next: File[]) => {
    setFiles(next);
    if (fileInputRef.current) {
      const dt = new DataTransfer();
      next.forEach((f) => dt.items.add(f));
      fileInputRef.current.files = dt.files;
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError("");
    const picked = [...(e.target.files ?? [])];
    const merged = [...files];
    for (const f of picked) {
      if (merged.some((x) => x.name === f.name && x.size === f.size)) continue;
      if (!SAMPLE_IMAGE_TYPES.includes(f.type)) {
        setFileError(en ? "Only images (JPEG / PNG / WebP / GIF) can be attached." : "添付できるのは画像（JPEG / PNG / WebP / GIF）のみです。");
        continue;
      }
      if (f.size > MAX_SAMPLE_IMAGE_BYTES) {
        setFileError(en ? `Each image must be under ${MAX_SAMPLE_IMAGE_BYTES / 1024 / 1024}MB.` : `画像1枚あたりのサイズ上限は ${MAX_SAMPLE_IMAGE_BYTES / 1024 / 1024}MB です。`);
        continue;
      }
      if (merged.length >= MAX_SAMPLE_IMAGES) {
        setFileError(en ? `You can attach up to ${MAX_SAMPLE_IMAGES} images.` : `サンプル画像は最大 ${MAX_SAMPLE_IMAGES} 枚までです。`);
        break;
      }
      merged.push(f);
    }
    syncFiles(merged);
  };

  if (state?.ok) {
    return (
      <div className="bg-white border border-line px-8 py-11 text-center">
        <div className="text-accent text-3xl mb-3">✓</div>
        <h3 className="text-[16px] font-bold text-ink mb-2">
          {en ? "Your application has been submitted" : "申請を送信しました"}
        </h3>
        <p className="text-[12.5px] text-muted leading-relaxed">
          {en
            ? "We will review it and get back to you. You can check the status below."
            : "内容を審査のうえご連絡いたします。状態は下の一覧でご確認いただけます。"}
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="bg-white border border-line px-7 py-8 sm:px-8">
      <div className="space-y-5">
        <Field en={en} label={en ? "Facility / location name" : "施設・場所名"} required>
          <input name="locationName" type="text" required maxLength={120} placeholder={en ? "e.g. Former XYZ Factory" : "例: 旧〇〇工場"} className={inputClass} />
        </Field>

        <div className="grid md:grid-cols-3 gap-4">
          <Field en={en} label={en ? "Prefecture" : "都道府県"} optional>
            <input name="prefecture" type="text" maxLength={20} placeholder={en ? "e.g. Tokyo" : "例: 東京都"} className={inputClass} />
          </Field>
          <Field en={en} label={en ? "City" : "市区町村"} optional>
            <input name="city" type="text" maxLength={60} placeholder={en ? "e.g. Setagaya" : "例: 世田谷区"} className={inputClass} />
          </Field>
          <Field en={en} label={en ? "Category" : "カテゴリ"} required>
            <select name="category" required defaultValue="studio" className={inputClass}>
              {PROPERTY_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {categoryLabel(c, en ? "en" : "ja")}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field en={en} label={en ? "Description of the space & capture range" : "空間の説明・撮影範囲"} required>
          <textarea
            name="description"
            rows={4}
            required
            maxLength={4000}
            placeholder={en ? "e.g. An abandoned factory, roughly 800 sqm. Scanned the main floor and the second-floor walkway." : "例: 廃工場、延床約800㎡。1階フロアと2階の渡り廊下をスキャンしました。"}
            className={`${inputClass} leading-relaxed resize-y`}
          />
        </Field>

        <div className="grid md:grid-cols-2 gap-4">
          <Field en={en} label={en ? "Capture device" : "撮影機材"} required>
            <input name="captureDevice" type="text" required maxLength={120} placeholder={en ? "e.g. iPhone 15 Pro (LiDAR) + Polycam" : "例: iPhone 15 Pro（LiDAR）+ Polycam"} className={inputClass} />
          </Field>
          <Field en={en} label={en ? "Capture month" : "撮影年月"} required>
            <input name="capturedAt" type="month" required className={inputClass} />
          </Field>
        </div>

        <Field en={en} label={en ? "Facility contact (if known)" : "施設の連絡先（分かれば）"} optional>
          <input name="facilityContact" type="text" maxLength={300} placeholder={en ? "e.g. owner name / phone / email" : "例: オーナー名・電話・メールなど"} className={inputClass} />
        </Field>

        <Field
          en={en}
          label={en ? "Sample images" : "サンプル画像"}
          required
          note={en ? `up to ${MAX_SAMPLE_IMAGES} images, ${MAX_SAMPLE_IMAGE_BYTES / 1024 / 1024}MB each` : `最大${MAX_SAMPLE_IMAGES}枚・各${MAX_SAMPLE_IMAGE_BYTES / 1024 / 1024}MBまで`}
        >
          <input
            name="sampleImages"
            type="file"
            accept={SAMPLE_IMAGE_TYPES.join(",")}
            multiple
            ref={fileInputRef}
            onChange={onFileChange}
            className="block w-full text-[13px] text-muted file:mr-3 file:border file:border-line file:rounded-md file:bg-white file:px-3.5 file:py-2 file:text-[12.5px] file:text-ink file:cursor-pointer hover:file:border-accent file:transition"
          />
          <p className="mt-1.5 text-[11.5px] text-muted">
            {en
              ? "Sample images only — please do not upload the full dataset here."
              : "サンプル画像のみです。フルデータはここではアップロードしないでください。"}
          </p>
          {fileError && <p className="mt-1.5 text-[12px] text-red-600">{fileError}</p>}
          {files.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {files.map((f, i) => (
                <div key={`${f.name}-${f.size}`} className="relative border border-line rounded-md overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={URL.createObjectURL(f)}
                    alt={f.name}
                    className="h-20 w-auto"
                    onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)}
                  />
                  <button
                    type="button"
                    aria-label={en ? `Remove ${f.name}` : `${f.name} を削除`}
                    onClick={() => syncFiles(files.filter((_, j) => j !== i))}
                    className="absolute top-1 right-1 w-5 h-5 leading-none rounded-full bg-black/60 text-white text-[11px] hover:bg-black/80 transition"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </Field>

        <Field en={en} label={en ? "External data link" : "データの共有リンク"} optional note={en ? "e.g. Gigafile-style share link" : "例: ギガファイル便等の共有リンク"}>
          <input name="dataLink" type="url" maxLength={500} placeholder="https://..." className={inputClass} />
        </Field>

        <div className="border-t border-line pt-5">
          <div className="mono text-[10px] tracking-[0.2em] uppercase text-muted mb-2.5">
            {en ? "Please confirm before submitting" : "送信前にご確認ください"}
          </div>
          <ul className="space-y-1.5 text-[12.5px] text-muted leading-relaxed mb-2">
            {(en ? CONSENT_ITEMS_EN : CONSENT_ITEMS_JA).map((t) => (
              <li key={t} className="flex gap-2">
                <span aria-hidden className="text-accent shrink-0">
                  ・
                </span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <p className="text-[10.5px] text-muted/80 leading-relaxed mb-4">
            {en
              ? "Note: formal terms of service are still being prepared. In addition to the above, the terms will apply once ready."
              : "（注記）正式な利用規約は整備中です。上記に加え、整備後の規約が適用されます。"}
          </p>
          <label className="flex items-start gap-2.5 mb-5 cursor-pointer">
            <input type="checkbox" name="consent" required className="mt-0.5" />
            <span className="text-[13px] leading-relaxed">
              {en ? "I have read and agree to the above." : "上記の内容を確認し、同意します。"}
            </span>
          </label>

          {state?.ok === false && (
            <p className="mb-4 text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-md px-3.5 py-2.5">
              {state.error}
            </p>
          )}

          <div className="text-center">
            <button
              type="submit"
              disabled={pending}
              className="w-full sm:w-auto bg-accent text-white text-[15px] font-bold px-8 py-3.5 rounded-md hover:bg-accent/85 transition shadow-sm disabled:opacity-50"
            >
              {pending ? (en ? "Submitting…" : "送信中…") : en ? "Submit application →" : "申請する →"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  optional,
  note,
  en,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  note?: string;
  en?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-ink/70 mb-1.5 block">
        {label}
        {required && <span className="text-red-500 text-[11px] ml-1">{en ? "required" : "必須"}</span>}
        {optional && <span className="text-muted text-[11px] ml-1">{en ? "optional" : "任意"}</span>}
        {note && <span className="text-muted text-[11px] ml-1.5">（{note}）</span>}
      </span>
      {children}
    </label>
  );
}
