"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  useForm,
  useFieldArray,
  type SubmitHandler,
  type Resolver,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  propertySchema,
  publishablePropertySchema,
  CATEGORY_LABEL,
  STATUS_LABEL,
  PROPERTY_CATEGORIES,
  STUDIO_TYPE_SUGGESTIONS,
  TOKEN_COST_LABEL,
  type Property,
  type Asset,
} from "@/lib/schemas";
import {
  saveDraftAction,
  publishAction,
  unpublishAction,
  archiveAction,
  deleteAction,
} from "@/app/admin/_actions";
import ViewerUpdateBanner from "./viewer-update-banner";
import FileDropzone, {
  type UploadedFile,
} from "@/components/admin/file-dropzone";
import AssetPickerModal from "./asset-picker-modal";
import { usePreviewCapture } from "./use-preview-capture";
import { buildViewerUrl } from "@/lib/viewer";

const STEPS = [
  { id: "basic", label: "基本情報" },
  { id: "specs", label: "仕様・設備" },
  { id: "description", label: "紹介文" },
  { id: "photos", label: "写真" },
  { id: "splat", label: "3DGS データ" },
  { id: "publish", label: "公開設定" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

export default function PropertyEditor({ initial }: { initial: Property }) {
  const router = useRouter();
  const [step, setStep] = useState<StepId>("basic");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [publishing, startPublish] = useTransition();
  const [publishError, setPublishError] = useState<string | null>(null);
  const [pickImageFor, setPickImageFor] = useState<null | "cover" | "gallery">(null);
  const [pickSplat, setPickSplat] = useState(false);
  const [previewZip, setPreviewZip] = useState(false);
  const [previewSplat, setPreviewSplat] = useState(false);
  const [previewItemIdx, setPreviewItemIdx] = useState<number | null>(null);
  const capture = usePreviewCapture();

  const form = useForm<Property>({
    // zod's input type (fields with .default() are optional) differs from the
    // output Property type; the resolver is sound at runtime, so pin its type.
    resolver: zodResolver(propertySchema) as Resolver<Property>,
    defaultValues: initial,
    mode: "onBlur",
  });

  const { register, handleSubmit, watch, control, getValues, setValue, formState } = form;

  const galleryArray = useFieldArray({
    control,
    name: "gallery",
  });
  const tagsArray = useFieldArray({
    control,
    // @ts-expect-error react-hook-form doesn't love primitive arrays; this works at runtime
    name: "tags",
  });
  const splatItemsArray = useFieldArray({
    control,
    name: "splatItems",
  });
  const blueprintsArray = useFieldArray({
    control,
    name: "blueprints",
  });

  const onSaveDraft: SubmitHandler<Property> = (data) => {
    startSave(async () => {
      try {
        await saveDraftAction(data);
        setSavedAt(new Date().toISOString());
        router.refresh();
      } catch (e) {
        console.error(e);
      }
    });
  };

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const triggerAutoSave = useCallback(
    (delayMs = 0) => {
      clearTimeout(autoSaveTimer.current);
      if (delayMs === 0) {
        handleSubmit(onSaveDraft)();
      } else {
        autoSaveTimer.current = setTimeout(() => handleSubmit(onSaveDraft)(), delayMs);
      }
    },
    [handleSubmit],
  );
  useEffect(() => () => clearTimeout(autoSaveTimer.current), []);

  useEffect(() => {
    if (capture.capturedUrl && capture.capturedIdx !== null) {
      setValue(`splatItems.${capture.capturedIdx}.previewVideoUrl`, capture.capturedUrl, { shouldDirty: true });
      triggerAutoSave();
      capture.clearResult();
    }
  }, [capture.capturedUrl, capture.capturedIdx, setValue, triggerAutoSave, capture.clearResult]);

  // Auto-queue video capture for splatItems missing previewVideoUrl
  const autoQueuedRef = useRef(false);
  useEffect(() => {
    if (autoQueuedRef.current) return;
    const items = initial.splatItems ?? [];
    const missing = items
      .map((it, idx) => ({ ...it, idx }))
      .filter((it) => it.splatUrl && !it.previewVideoUrl);
    if (missing.length > 0) {
      autoQueuedRef.current = true;
      capture.queueCaptures(
        missing.map((it) => ({ splatUrl: it.splatUrl, propertyId: initial.id, itemIdx: it.idx })),
      );
    }
  }, [initial.splatItems, initial.id, capture.queueCaptures]);

  // Debounced auto-save: any form change triggers save after 1.5s of inactivity
  useEffect(() => {
    const sub = watch(() => {
      triggerAutoSave(1500);
    });
    return () => sub.unsubscribe();
  }, [watch, triggerAutoSave]);

  const onPublish = () => {
    setPublishError(null);
    const data = getValues();
    const result = publishablePropertySchema.safeParse(data);
    if (!result.success) {
      setPublishError(
        result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" / "),
      );
      return;
    }
    startPublish(async () => {
      try {
        await publishAction(result.data);
        setSavedAt(new Date().toISOString());
        router.refresh();
      } catch (e) {
        console.error(e);
        setPublishError(String(e));
      }
    });
  };

  const onUnpublish = () => {
    startPublish(async () => {
      await unpublishAction(initial.id);
      router.refresh();
    });
  };

  const onArchive = () => {
    if (!confirm("この物件をアーカイブしますか？")) return;
    startPublish(async () => {
      await archiveAction(initial.id);
      router.refresh();
    });
  };

  const onDelete = () => {
    if (!confirm("この物件を完全に削除します。よろしいですか？")) return;
    startPublish(async () => {
      await deleteAction(initial.id);
    });
  };

  // Autosave on blur — every successful field validation triggers a save.
  // For simplicity: save on Ctrl/Cmd+S.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSubmit(onSaveDraft)();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSubmit]);

  const currentTitle = watch("title");
  const currentStatus = watch("status");
  const currentIdx = STEPS.findIndex((s) => s.id === step);
  const progress = ((currentIdx + 1) / STEPS.length) * 100;

  return (
    <form
      onSubmit={handleSubmit(onSaveDraft)}
      className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8"
    >
      {/* Step navigation */}
      <aside className="lg:sticky lg:top-24 self-start space-y-2">
        <div className="mono text-[10px] tracking-[0.32em] uppercase opacity-60 mb-3">
          Steps
        </div>
        {STEPS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStep(s.id)}
            className={`block w-full text-left px-3 py-2.5 border transition ${
              step === s.id
                ? "border-accent text-accent bg-[#2a1f10]"
                : "border-line text-muted hover:text-ink hover:border-ink"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="mono text-[10px] opacity-60">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-[13px]">{s.label}</span>
            </div>
          </button>
        ))}
      </aside>

      {/* Form pane */}
      <div className="min-w-0">
        {/* Sticky header */}
        <div className="sticky top-16 z-20 -mx-2 px-2 py-4 bg-bg/95 backdrop-blur border-b border-line mb-6 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-baseline gap-3 min-w-0">
            <StatusPill status={currentStatus} />
            <div className="serif text-xl truncate">
              {currentTitle || "(無題)"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(savedAt || watch("updatedAt")) && (
              <span className="mono text-[10px] tracking-[0.2em] uppercase opacity-50">
                {savedAt
                  ? `Saved ${savedAt.slice(11, 19)}`
                  : (() => {
                      const dt = watch("updatedAt");
                      if (!dt) return "";
                      try {
                        const d = new Date(dt);
                        return `Updated ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
                      } catch { return ""; }
                    })()
                }
              </span>
            )}
            <button
              type="submit"
              disabled={saving || publishing}
              className="px-4 py-2 mono text-[10px] tracking-[0.22em] uppercase border border-line hover:border-ink transition disabled:opacity-50"
            >
              {saving ? "保存中…" : "下書き保存 (⌘S)"}
            </button>
            {currentStatus === "published" ? (
              <button
                type="button"
                onClick={onUnpublish}
                disabled={publishing}
                className="px-4 py-2 mono text-[10px] tracking-[0.22em] uppercase border border-line hover:border-ink transition disabled:opacity-50"
              >
                公開を停止
              </button>
            ) : (
              <button
                type="button"
                onClick={onPublish}
                disabled={publishing}
                className="px-5 py-2 mono text-[10px] tracking-[0.22em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition disabled:opacity-50"
              >
                {publishing ? "公開中…" : "公開する"}
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-px bg-line mb-6 relative overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-accent transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        {publishError && (
          <div className="mb-6 border border-accent bg-[#1a0c00] p-4">
            <div className="mono text-[10px] tracking-[0.28em] uppercase text-accent mb-2">
              ⚠ 公開できません
            </div>
            <div className="text-[12px] text-muted leading-[1.7]">
              {publishError}
            </div>
          </div>
        )}

        {/* Step content */}
        <section className="space-y-6">
          {step === "basic" && (
            <StepCard
              n="01"
              title="基本情報"
              desc="検索結果とカードに出る情報です。"
            >
              <Field label="物件名" error={formState.errors.title?.message} required>
                <input
                  type="text"
                  {...register("title")}
                  className={inputClass}
                  placeholder="例: Setagaya Cyc Studio｜白ホリ大スパン"
                />
              </Field>

              <div className="grid md:grid-cols-3 gap-5">
                <Field label="カテゴリ" required>
                  <select {...register("category")} className={inputClass}>
                    {PROPERTY_CATEGORIES.map((c) => (
                      <option key={c} value={c} className="bg-bg">
                        {CATEGORY_LABEL[c]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="スタジオ種類"
                  hint="ハウス / ガレージ / 白ホリ ... (datalist から選択 or 自由入力)"
                >
                  <input
                    type="text"
                    list="studio-type-suggestions"
                    {...register("studioType")}
                    className={inputClass}
                    placeholder="例: ハウススタジオ"
                  />
                  <datalist id="studio-type-suggestions">
                    {STUDIO_TYPE_SUGGESTIONS.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </Field>
                <Field
                  label="時間料金 (¥/hr)"
                  error={formState.errors.hourlyPrice?.message}
                  required
                >
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    {...register("hourlyPrice", { valueAsNumber: true })}
                    className={inputClass}
                  />
                </Field>
              </div>

              <Field
                label="日料金 (¥/day)"
                hint="日貸しを行う場合のみ入力。0 のままだと「日貸し非対応」扱い。"
                error={formState.errors.dailyPrice?.message}
              >
                <input
                  type="number"
                  min={0}
                  step={5000}
                  {...register("dailyPrice", { valueAsNumber: true })}
                  className={inputClass}
                  placeholder="0 = 日貸しなし"
                />
              </Field>

              <div className="grid md:grid-cols-3 gap-5">
                <Field label="エリア" error={formState.errors.area?.message} required>
                  <input
                    type="text"
                    {...register("area")}
                    className={inputClass}
                    placeholder="例: 東京西エリア"
                  />
                </Field>
                <Field label="都道府県" required>
                  <input type="text" {...register("prefecture")} className={inputClass} />
                </Field>
                <Field label="市区町村" required>
                  <input type="text" {...register("city")} className={inputClass} />
                </Field>
              </div>

              <Field
                label="座標 (lat, lng) — 地図ピンと距離計算に使用"
                hint="Google Maps で右クリック → 数値をコピーして貼り付け。空欄でも下書き OK、公開時は地図に出ません。"
              >
                <CoordsInput
                  value={watch("coords")}
                  onChange={(c) =>
                    setValue("coords", c, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                />
              </Field>

              <Field
                label="サマリー (一覧カードに出る短文)"
                error={formState.errors.summary?.message}
                required
              >
                <textarea
                  rows={3}
                  {...register("summary")}
                  className={inputClass}
                  placeholder="例: 天井高 5.4m、25m スパンの白ホリ。CM・MV 撮影で実績多数。"
                />
              </Field>

              {/* ── 連絡先 ── */}
              <div className="border-t border-line pt-5 mt-4">
                <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-3">
                  スタジオ連絡先
                </div>
                <div className="grid md:grid-cols-3 gap-5">
                  <Field label="HP / ウェブサイト" hint="https:// から入力">
                    <input
                      type="url"
                      {...register("contactWebsite")}
                      className={inputClass}
                      placeholder="https://example.com"
                    />
                  </Field>
                  <Field label="電話番号">
                    <input
                      type="tel"
                      {...register("contactPhone")}
                      className={inputClass}
                      placeholder="03-1234-5678"
                    />
                  </Field>
                  <Field label="メールアドレス">
                    <input
                      type="email"
                      {...register("contactEmail")}
                      className={inputClass}
                      placeholder="info@example.com"
                    />
                  </Field>
                </div>
              </div>
            </StepCard>
          )}

          {step === "specs" && (
            <StepCard n="02" title="仕様・設備" desc="フィルター検索に使われます。">
              <div className="grid md:grid-cols-3 gap-5">
                <Field label="収容人数 (名)">
                  <input
                    type="number"
                    min={0}
                    {...register("capacity", { valueAsNumber: true })}
                    className={inputClass}
                  />
                </Field>
                <Field label="床面積 (㎡)">
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    {...register("floorAreaSqm", { valueAsNumber: true })}
                    className={inputClass}
                  />
                </Field>
                <Field label="天井高 (m)">
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    {...register("ceilingHeightM", { valueAsNumber: true })}
                    className={inputClass}
                  />
                </Field>
              </div>

              <Field
                label="電源仕様"
                hint="例: 100V 15A / 100V/200V 三相 60A / 簡易電源 (発電機推奨)"
              >
                <input
                  type="text"
                  {...register("powerVoltage")}
                  className={inputClass}
                  placeholder="100V 30A など"
                />
              </Field>

              <div className="grid md:grid-cols-3 gap-5">
                <Toggle label="自然光あり" register={register("hasNaturalLight")} />
                <Toggle label="駐車可" register={register("parking")} />
                <Toggle label="搬入口 大" register={register("loadingDock")} />
              </div>

              <Field
                label="タグ"
                hint="Enter で確定、× で削除。検索キーワードに使われます。"
              >
                <TagsEditor
                  values={watch("tags")}
                  onAdd={(v) => tagsArray.append(v as never)}
                  onRemove={(i) => tagsArray.remove(i)}
                />
              </Field>

              {/* ── 図面 / フロアプラン ── */}
              <div className="border-t border-line pt-5 mt-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60">
                    図面 / フロアプラン
                  </div>
                  <button
                    type="button"
                    onClick={() => blueprintsArray.append({ label: "", url: "" })}
                    className="mono text-[10px] tracking-[0.22em] uppercase border border-line px-3 py-1.5 hover:border-accent hover:text-accent transition"
                  >
                    + 追加
                  </button>
                </div>

                {blueprintsArray.fields.length === 0 && (
                  <div className="text-[12px] text-muted py-4 text-center border border-dashed border-line">
                    「+ 追加」で図面を登録（PDF / 画像 — 50 MB まで）
                  </div>
                )}

                <div className="space-y-3">
                  {blueprintsArray.fields.map((field, idx) => (
                    <div key={field.id} className="border border-line bg-[#141414] p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <input
                          type="text"
                          {...register(`blueprints.${idx}.label`)}
                          className={`${inputClass} flex-1`}
                          placeholder="ラベル（例: 1F 平面図 / 断面図）"
                        />
                        <button
                          type="button"
                          onClick={() => blueprintsArray.remove(idx)}
                          className="mono text-[10px] text-muted hover:text-red-400 transition px-2"
                        >
                          削除
                        </button>
                      </div>
                      {watch(`blueprints.${idx}.url`) ? (
                        <div className="flex items-center gap-3">
                          <div className="mono text-[18px] text-accent">■</div>
                          <div className="flex-1 min-w-0 text-[11px] mono truncate">
                            {watch(`blueprints.${idx}.url`)}
                          </div>
                          <a
                            href={watch(`blueprints.${idx}.url`)}
                            target="_blank"
                            rel="noopener"
                            className="mono text-[10px] tracking-[0.22em] uppercase border border-accent text-accent px-3 py-1.5 hover:bg-accent/10 transition"
                          >
                            確認
                          </a>
                          <button
                            type="button"
                            onClick={() => setValue(`blueprints.${idx}.url`, "", { shouldDirty: true })}
                            className="mono text-[10px] tracking-[0.22em] uppercase border border-line px-3 py-1.5 hover:border-accent hover:text-accent transition"
                          >
                            差し替え
                          </button>
                        </div>
                      ) : (
                        <FileDropzone
                          propertyId={initial.id}
                          kind="document"
                          accept=".pdf,.jpg,.jpeg,.png,.webp"
                          label="図面ファイル (PDF / 画像)"
                          hint="PDF / JPEG / PNG / WebP — 50 MB まで"
                          onUploaded={(f) => {
                            setValue(
                              `blueprints.${idx}.url`,
                              new URL(f.url, window.location.origin).toString(),
                              { shouldDirty: true, shouldValidate: true },
                            );
                            triggerAutoSave();
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </StepCard>
          )}

          {step === "description" && (
            <StepCard
              n="03"
              title="紹介文"
              desc="物件詳細ページに表示されます。改行 OK、文字数の目安は 200〜800 文字。"
            >
              <Field label="本文">
                <textarea
                  rows={14}
                  {...register("description")}
                  className={inputClass + " font-sans leading-[1.85]"}
                  placeholder="このスタジオの特徴、ロケーション、利用シーン、注意事項などをご記入ください。"
                />
                <div className="flex items-center justify-between mt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const d = getValues();
                      const draft = generateDescriptionDraft(d);
                      if (draft) {
                        setValue("description", draft, { shouldDirty: true });
                      }
                    }}
                    className="mono text-[10px] tracking-[0.22em] uppercase border border-accent/50 text-accent px-3 py-1 hover:bg-accent hover:text-bg transition"
                  >
                    ✦ AI下書き生成
                  </button>
                  <div className="mono text-[10px] opacity-50">
                    {watch("description")?.length ?? 0} / 4000
                  </div>
                </div>
              </Field>

              <div className="border border-dashed border-line p-5">
                <div className="mono text-[10px] tracking-[0.28em] uppercase text-accent mb-2">
                  ● 入れ込み編集
                </div>
                <p className="text-[12px] text-muted leading-[1.85] mb-3">
                  見出し・本文・画像・ギャラリー・3DGS を並べた
                  <strong className="text-ink">スタジオ紹介ページ</strong>を組み立てられます。
                  設定すると、物件詳細はこの構成で表示されます（未設定なら上記の本文＋標準レイアウト）。
                </p>
                <a
                  href={`/admin/properties/${initial.id}/page`}
                  className="inline-block mono text-[10px] tracking-[0.22em] uppercase border border-accent text-accent px-4 py-2 hover:bg-accent hover:text-bg transition"
                >
                  スタジオページビルダーを開く →
                </a>
              </div>
            </StepCard>
          )}

          {step === "photos" && (
            <StepCard
              n="04"
              title="写真"
              desc="カバー画像 1 枚 + ギャラリー（最大 40 枚）。ドラッグ&ドロップで public/uploads/ に保存、または既存ライブラリから選択。"
            >
              {/* Library pickers */}
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setPickImageFor("cover")}
                  className="text-[12px] border border-line px-2 py-1 hover:border-accent transition"
                >
                  ライブラリからカバーを選択
                </button>
                <button
                  type="button"
                  onClick={() => setPickImageFor("gallery")}
                  className="text-[12px] border border-line px-2 py-1 hover:border-accent transition"
                >
                  ライブラリからギャラリーに追加
                </button>
              </div>
              <AssetPickerModal
                kind="image"
                open={pickImageFor !== null}
                onClose={() => setPickImageFor(null)}
                onPick={(a: Asset) => {
                  if (pickImageFor === "cover") {
                    setValue("cover.src", a.url, { shouldDirty: true, shouldValidate: true });
                    setValue("cover.alt", a.label, { shouldDirty: true });
                    if (a.width) setValue("cover.width", a.width, { shouldDirty: true });
                    if (a.height) setValue("cover.height", a.height, { shouldDirty: true });
                  } else if (pickImageFor === "gallery") {
                    galleryArray.append({
                      src: a.url,
                      alt: a.label,
                      width: a.width ?? 1600,
                      height: a.height ?? 1000,
                    });
                  }
                }}
              />

              {/* COVER */}
              <div>
                <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-70 mb-1.5">
                  カバー画像 <span className="text-accent">*</span>
                </div>
                {watch("cover.src") ? (
                  <div className="border border-line bg-[#141414] p-2 relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={watch("cover.src")}
                      alt="cover preview"
                      className="w-full max-h-[320px] object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setValue("cover.src", "", { shouldDirty: true });
                        setValue("cover.alt", "", { shouldDirty: true });
                      }}
                      className="absolute top-3 right-3 mono text-[10px] tracking-[0.22em] uppercase border border-line bg-bg/80 px-2 py-1 hover:border-accent hover:text-accent transition"
                    >
                      差し替え
                    </button>
                  </div>
                ) : (
                  <FileDropzone
                    propertyId={initial.id}
                    kind="image"
                    accept="image/*"
                    label="Cover image"
                    hint="JPEG / PNG / WebP / AVIF / GIF — 25 MB まで"
                    onUploaded={(f, name) => {
                      setValue("cover.src", f.url, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                      if (!getValues("cover.alt"))
                        setValue("cover.alt", name.replace(/\.[^.]+$/, ""), {
                          shouldDirty: true,
                        });
                      triggerAutoSave();
                    }}
                  />
                )}
                <Field
                  label="カバー画像 代替テキスト"
                  hint="読み上げ・SEO に使われます"
                  required
                >
                  <input
                    type="text"
                    {...register("cover.alt")}
                    className={inputClass}
                    placeholder="例: 白ホリゾント全景"
                  />
                </Field>
              </div>

              {/* GALLERY */}
              <div>
                <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-3">
                  ギャラリー ({galleryArray.fields.length} 枚)
                </div>

                {galleryArray.fields.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                    {galleryArray.fields.map((f, i) => (
                      <div
                        key={f.id}
                        className="relative border border-line bg-[#141414]"
                      >
                        {watch(`gallery.${i}.src`) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={watch(`gallery.${i}.src`)}
                            alt=""
                            className="w-full aspect-[4/3] object-cover"
                          />
                        ) : (
                          <div className="w-full aspect-[4/3] flex items-center justify-center mono text-[10px] opacity-40">
                            no preview
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => galleryArray.remove(i)}
                          className="absolute top-1.5 right-1.5 mono text-[9px] tracking-[0.22em] uppercase border border-line bg-bg/80 px-1.5 py-0.5 hover:border-accent hover:text-accent transition"
                        >
                          ×
                        </button>
                        <input
                          type="text"
                          {...register(`gallery.${i}.alt` as const)}
                          className="w-full bg-transparent border-t border-line px-2 py-1.5 text-[11px] mono focus:outline-none focus:border-accent"
                          placeholder="代替テキスト"
                        />
                      </div>
                    ))}
                  </div>
                )}

                <FileDropzone
                  propertyId={initial.id}
                  kind="image"
                  accept="image/*"
                  multiple
                  label="Gallery photos (multi)"
                  hint="複数同時 OK"
                  onUploaded={(f, name) => {
                    galleryArray.append({
                      src: f.url,
                      alt: name.replace(/\.[^.]+$/, ""),
                      width: 1600,
                      height: 1000,
                    });
                    triggerAutoSave();
                  }}
                />
              </div>
            </StepCard>
          )}

          {step === "splat" && (
            <StepCard
              n="05"
              title="3DGS データ"
              desc="ZIPプロジェクトまたは個別3DGSファイルをアップロード。駐車場・1F・2F等フロア別に複数登録できます。"
            >
              <ViewerUpdateBanner />

              {/* ── ZIP プロジェクトファイル ── */}
              <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-3 mt-4">
                ZIP プロジェクトファイル
              </div>
              {watch("zipUrl") ? (
                <>
                  <div className="border border-line bg-[#141414] p-4 flex items-center gap-4 flex-wrap">
                    <div className="mono text-[24px] text-[#5ec8e8]">◆</div>
                    <div className="flex-1 min-w-0">
                      <div className="mono text-[10px] tracking-[0.28em] uppercase text-[#5ec8e8] mb-1">
                        ZIP Loaded
                      </div>
                      <div className="text-[12px] mono truncate">
                        {watch("zipUrl")}
                      </div>
                      <div className="text-[11px] text-muted mt-1">
                        {watch("zipSizeMb")} MB
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPreviewZip((v) => !v)}
                      className="mono text-[10px] tracking-[0.22em] uppercase border border-[#5ec8e8] text-[#5ec8e8] px-3 py-2 hover:bg-[#5ec8e8]/10 transition"
                    >
                      {previewZip ? "閉じる" : "プレビュー"}
                    </button>
                    <a
                      href={watch("zipUrl")}
                      download
                      className="mono text-[10px] tracking-[0.22em] uppercase border border-line px-3 py-2 hover:border-accent hover:text-accent transition"
                    >
                      ダウンロード
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        setValue("zipUrl", "", { shouldDirty: true });
                        setValue("zipSizeMb", 0, { shouldDirty: true });
                        setPreviewZip(false);
                      }}
                      className="mono text-[10px] tracking-[0.22em] uppercase border border-line px-3 py-2 hover:border-accent hover:text-accent transition"
                    >
                      差し替え
                    </button>
                  </div>
                  {previewZip && (
                    <div className="border border-line bg-black overflow-hidden" style={{ aspectRatio: "16/9" }}>
                      <iframe
                        src={buildViewerUrl(watch("zipUrl"))}
                        title="3DGS ZIP プレビュー"
                        className="w-full h-full border-0"
                        allow="fullscreen; xr-spatial-tracking; gyroscope; accelerometer"
                        sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-popups"
                      />
                    </div>
                  )}
                </>
              ) : (
                <FileDropzone
                  propertyId={initial.id}
                  kind="zip"
                  accept=".zip"
                  label="ロケハン3D ZIP プロジェクトファイル (.zip)"
                  hint="複数3DGS をまとめてアップロード — 20 GB まで"
                  onUploaded={(f) => {
                    const now = new Date();
                    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
                    setValue("zipUrl", new URL(f.url, window.location.origin).toString(), {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                    setValue("zipSizeMb", Math.max(1, Math.round(f.size / 1024 / 1024)), {
                      shouldDirty: true,
                    });
                    if (!watch("scannedAt")) {
                      setValue("scannedAt", today, { shouldDirty: true });
                    }
                    setValue("splatDataUpdatedAt", now.toISOString(), { shouldDirty: true });
                    triggerAutoSave();
                  }}
                />
              )}

              {/* ── 個別 3DGS アイテム (複数・ラベル付き) ── */}
              <div className="border-t border-line pt-5 mt-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60">
                    個別 3DGS データ（フロア・区画別）
                  </div>
                  <button
                    type="button"
                    onClick={() => splatItemsArray.append({ label: "", splatUrl: "", previewVideoUrl: "", sizeMb: 0, notes: "", forSale: false, salePrice: 0, saleDescription: "", accessLevel: "public" as const, downloadFileUrl: "", downloadFileSizeMb: 0, downloadFileFormat: "PLY & OBJ (ZIP)" })}
                    className="mono text-[10px] tracking-[0.22em] uppercase border border-line px-3 py-1.5 hover:border-accent hover:text-accent transition"
                  >
                    + 追加
                  </button>
                </div>

                {splatItemsArray.fields.length === 0 && (
                  <div className="text-[12px] text-muted py-4 text-center border border-dashed border-line">
                    「+ 追加」で 3DGS データを登録（駐車場・1F・2F 等）
                  </div>
                )}

                <div className="space-y-4">
                  {splatItemsArray.fields.map((field, idx) => (
                    <div key={field.id} className="border border-line bg-[#141414] p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <span className="mono text-[10px] text-accent opacity-60 w-5 shrink-0">
                          {String(idx + 1).padStart(2, "0")}
                        </span>
                        <input
                          type="text"
                          {...register(`splatItems.${idx}.label`)}
                          className={`${inputClass} flex-1`}
                          placeholder="ラベル（例: 1F / 駐車場 / 屋上）"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            splatItemsArray.remove(idx);
                            if (previewItemIdx === idx) setPreviewItemIdx(null);
                          }}
                          className="mono text-[10px] text-muted hover:text-red-400 transition px-2"
                        >
                          削除
                        </button>
                      </div>

                      {watch(`splatItems.${idx}.splatUrl`) ? (
                        <div className="flex items-center gap-3">
                          <div className="mono text-[18px] text-accent">●</div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] mono truncate">
                              {watch(`splatItems.${idx}.splatUrl`)}
                            </div>
                            <div className="text-[10px] text-muted mt-0.5">
                              {watch(`splatItems.${idx}.sizeMb`)} MB
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setPreviewItemIdx(previewItemIdx === idx ? null : idx)}
                            className="mono text-[10px] tracking-[0.22em] uppercase border border-accent text-accent px-3 py-1.5 hover:bg-accent/10 transition"
                          >
                            {previewItemIdx === idx ? "閉じる" : "プレビュー"}
                          </button>
                          {watch(`splatItems.${idx}.splatUrl`) && capture.state === "idle" && (
                            <button
                              type="button"
                              onClick={() => capture.startCapture(watch(`splatItems.${idx}.splatUrl`), initial.id, idx)}
                              className="mono text-[10px] tracking-[0.22em] uppercase border border-line px-3 py-1.5 hover:border-accent hover:text-accent transition"
                            >
                              {watch(`splatItems.${idx}.previewVideoUrl`) ? "再撮影" : "動画生成"}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setValue(`splatItems.${idx}.splatUrl`, "", { shouldDirty: true });
                              setValue(`splatItems.${idx}.sizeMb`, 0, { shouldDirty: true });
                              if (previewItemIdx === idx) setPreviewItemIdx(null);
                            }}
                            className="mono text-[10px] tracking-[0.22em] uppercase border border-line px-3 py-1.5 hover:border-accent hover:text-accent transition"
                          >
                            差し替え
                          </button>
                        </div>
                      ) : (
                        <FileDropzone
                          propertyId={initial.id}
                          kind="splat"
                          accept=".splat,.ply,.ksplat,.rad,.zip"
                          label="3DGS file (.splat / .ply / .ksplat / .rad / .zip)"
                          hint="3 GB まで"
                          onUploaded={(f) => {
                            const now = new Date();
                            const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
                            const uploadedUrl = new URL(f.url, window.location.origin).toString();
                            setValue(
                              `splatItems.${idx}.splatUrl`,
                              uploadedUrl,
                              { shouldDirty: true, shouldValidate: true },
                            );
                            setValue(
                              `splatItems.${idx}.sizeMb`,
                              Math.max(1, Math.round(f.size / 1024 / 1024)),
                              { shouldDirty: true },
                            );
                            if (!watch("scannedAt")) {
                              setValue("scannedAt", today, { shouldDirty: true });
                            }
                            setValue("splatDataUpdatedAt", now.toISOString(), { shouldDirty: true });
                            triggerAutoSave();
                            capture.startCapture(uploadedUrl, initial.id, idx);
                          }}
                        />
                      )}

                      {capture.state !== "idle" && capture.state !== "done" && capture.capturedIdx === idx && (
                        <div className="py-2">
                          <div className="flex items-center gap-2 text-[11px] mono text-accent">
                            <span className="inline-block w-3 h-3 rounded-full bg-accent animate-pulse" />
                            {capture.progress}
                            {capture.queueLength > 0 && (
                              <span className="text-muted text-[9px]">（残り {capture.queueLength} 件）</span>
                            )}
                            <button type="button" onClick={capture.cancel} className="text-muted hover:text-ink ml-auto text-[10px]">
                              キャンセル
                            </button>
                          </div>
                          {capture.state === "recording" && capture.progressPct > 0 && (
                            <div className="mt-1.5 h-1 bg-[#222] rounded overflow-hidden">
                              <div
                                className="h-full bg-accent transition-all duration-700"
                                style={{ width: `${capture.progressPct}%` }}
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {previewItemIdx === idx && watch(`splatItems.${idx}.splatUrl`) && (
                        <div className="border border-line bg-black overflow-hidden" style={{ aspectRatio: "16/9" }}>
                          {watch(`splatItems.${idx}.previewVideoUrl`) ? (
                            <video
                              src={watch(`splatItems.${idx}.previewVideoUrl`)}
                              className="w-full h-full object-cover"
                              autoPlay
                              loop
                              muted
                              playsInline
                            />
                          ) : (
                            <iframe
                              src={buildViewerUrl(watch(`splatItems.${idx}.splatUrl`))}
                              title={`3DGS プレビュー: ${watch(`splatItems.${idx}.label`) || `#${idx + 1}`}`}
                              className="w-full h-full border-0"
                              allow="fullscreen; xr-spatial-tracking; gyroscope; accelerometer"
                              sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-popups"
                            />
                          )}
                        </div>
                      )}

                      <textarea
                        {...register(`splatItems.${idx}.notes`)}
                        className={`${inputClass} resize-y min-h-[60px]`}
                        rows={2}
                        placeholder="注釈（スキャン条件・注意点・撮影メモなど）"
                      />

                      {/* Per-item data sale settings */}
                      <div className="border-t border-line/40 pt-3 mt-3">
                        <label className="flex items-center gap-3 cursor-pointer mb-3">
                          <input
                            type="checkbox"
                            {...register(`splatItems.${idx}.forSale`)}
                            className="w-4 h-4 accent-accent"
                          />
                          <span className="text-[11px] mono tracking-[0.14em] uppercase opacity-70">販売する</span>
                        </label>

                        {watch(`splatItems.${idx}.forSale`) && (
                          <div className="space-y-3 pl-7">
                            <Field
                              label="販売価格 (税込・円)"
                              hint=""
                            >
                              <SalePriceInput
                                value={watch(`splatItems.${idx}.salePrice`)}
                                onChange={(v) => setValue(`splatItems.${idx}.salePrice`, v, { shouldDirty: true })}
                              />
                            </Field>
                            <Field label="販売説明文" hint="">
                              <textarea
                                {...register(`splatItems.${idx}.saleDescription`)}
                                className={inputClass}
                                rows={2}
                                maxLength={1000}
                                placeholder="例: 高精細3DGSデータ。商用利用可。"
                              />
                            </Field>

                            {/* ── ダウンロード用ファイル (PLY & OBJ ZIP) ── */}
                            <div className="border border-dashed border-accent/30 p-3 space-y-2">
                              <div className="mono text-[10px] tracking-[0.22em] uppercase text-accent/70 mb-2">
                                販売用ダウンロードファイル（PLY & OBJ ZIP）
                              </div>
                              <div className="text-[10px] text-muted mb-2">
                                ※ ビューアー用3DGSファイルとは別。購入者がダウンロードするPLY＆OBJのZIPデータ。
                              </div>
                              {watch(`splatItems.${idx}.downloadFileUrl`) ? (
                                <div className="flex items-center gap-3">
                                  <div className="mono text-[18px] text-green-400">●</div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-[11px] mono truncate">
                                      {watch(`splatItems.${idx}.downloadFileUrl`)}
                                    </div>
                                    <div className="text-[10px] text-muted mt-0.5">
                                      {watch(`splatItems.${idx}.downloadFileSizeMb`)} MB ・ {watch(`splatItems.${idx}.downloadFileFormat`) || "PLY & OBJ (ZIP)"}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setValue(`splatItems.${idx}.downloadFileUrl`, "", { shouldDirty: true });
                                      setValue(`splatItems.${idx}.downloadFileSizeMb`, 0, { shouldDirty: true });
                                    }}
                                    className="mono text-[10px] tracking-[0.22em] uppercase border border-line px-3 py-1.5 hover:border-accent hover:text-accent transition"
                                  >
                                    差し替え
                                  </button>
                                </div>
                              ) : (
                                <FileDropzone
                                  propertyId={initial.id}
                                  kind="zip"
                                  accept=".zip,.ply,.obj"
                                  label="PLY & OBJ ZIP ファイル (.zip / .ply / .obj)"
                                  hint="販売用ダウンロードデータ — 20 GB まで"
                                  onUploaded={(f) => {
                                    const uploadedUrl = new URL(f.url, window.location.origin).toString();
                                    setValue(`splatItems.${idx}.downloadFileUrl`, uploadedUrl, { shouldDirty: true, shouldValidate: true });
                                    setValue(`splatItems.${idx}.downloadFileSizeMb`, Math.max(1, Math.round(f.size / 1024 / 1024)), { shouldDirty: true });
                                    triggerAutoSave();
                                  }}
                                />
                              )}
                              <Field label="ファイル形式" hint="">
                                <input
                                  type="text"
                                  {...register(`splatItems.${idx}.downloadFileFormat`)}
                                  className={inputClass}
                                  placeholder="PLY & OBJ (ZIP)"
                                />
                              </Field>
                            </div>
                          </div>
                        )}

                        {/* ── 閲覧権限 ── */}
                        <Field label="閲覧権限" hint="バックヤード・バックステージは制限あり、ドーム天井構造・リギング等はNDA限定に設定">
                          <select
                            {...register(`splatItems.${idx}.accessLevel`)}
                            className={inputClass}
                          >
                            <option value="public">制限なし（一般公開）</option>
                            <option value="restricted">制限あり（制作会社 Team プラン限定）</option>
                            <option value="nda_only">NDA 限定（機密構造・リギング情報を含む）</option>
                          </select>
                        </Field>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── 注釈 ── */}
              <div className="border-t border-line pt-5 mt-6">
                <Field
                  label="3DGS データ注釈"
                  hint="スキャン条件・特記事項・撮影時の天候や機材など自由記述"
                >
                  <textarea
                    {...register("splatNotes")}
                    className={`${inputClass} resize-y min-h-[80px]`}
                    rows={3}
                    placeholder="例: 晴天14時撮影 / Insta360 X4使用 / 一部足場あり注意 / 2F奥の部屋は未スキャン"
                  />
                </Field>
              </div>

              {/* ── 共通メタ ── */}
              <div className="border-t border-line pt-5 mt-6">
                <div className="grid md:grid-cols-2 gap-5">
                  <Field label="アップロード日">
                    <div className={`${inputClass} bg-[#1a1a1a] cursor-default`}>
                      {watch("scannedAt") || "—"}
                    </div>
                  </Field>
                  <Field label="最終更新">
                    <div className={`${inputClass} bg-[#1a1a1a] cursor-default`}>
                      {(() => {
                        const dt = watch("splatDataUpdatedAt");
                        if (!dt) return "—";
                        try {
                          const d = new Date(dt);
                          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
                        } catch {
                          return dt;
                        }
                      })()}
                    </div>
                  </Field>
                </div>

                <Field
                  label="トークンコスト (1 件視聴の消費数)"
                  hint="閲覧者のサブスクは月次トークン制。サイズが大きいほど消費トークン多。"
                >
                  <select
                    {...register("tokenCost", { valueAsNumber: true })}
                    className={inputClass}
                  >
                    {([1, 2, 3] as const).map((n) => (
                      <option key={n} value={n} className="bg-bg">
                        {n} トークン — {TOKEN_COST_LABEL[n]}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              {/* Data sale fields are now per-splatItem (forSale/salePrice/saleDescription) */}
            </StepCard>
          )}

          {step === "publish" && (
            <StepCard
              n="06"
              title="公開設定"
              desc="必須欄が揃っていれば「公開する」ボタンで反映されます。"
            >
              <div className="border border-line p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-1">
                      Current status
                    </div>
                    <StatusPill status={currentStatus} />
                  </div>
                  <div className="mono text-[10px] text-muted">
                    ID: {initial.id}
                  </div>
                </div>

                <Checklist data={watch()} />

                <div className="pt-4 border-t border-line text-[12px] text-muted leading-[1.7]">
                  公開後、編集中の内容は引き続き下書きとして保存され、
                  「公開する」を再度押すまで本番には反映されません。
                </div>

                <div className="pt-4 border-t border-line">
                  <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-2">
                    タイムスタンプ
                  </div>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12px]">
                    <dt className="mono text-[10px] tracking-[0.22em] uppercase opacity-50">作成</dt>
                    <dd className="mono text-[11px]">
                      {(() => {
                        const dt = watch("createdAt");
                        if (!dt) return "—";
                        try {
                          const d = new Date(dt);
                          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
                        } catch { return dt; }
                      })()}
                    </dd>
                    <dt className="mono text-[10px] tracking-[0.22em] uppercase opacity-50">最終更新</dt>
                    <dd className="mono text-[11px]">
                      {(() => {
                        const dt = watch("updatedAt");
                        if (!dt) return "—";
                        try {
                          const d = new Date(dt);
                          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
                        } catch { return dt; }
                      })()}
                    </dd>
                  </dl>
                </div>
              </div>

              <div className="border border-line p-5">
                <div className="mono text-[10px] tracking-[0.28em] uppercase text-muted mb-3">
                  Danger zone
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={onArchive}
                    className="mono text-[10px] tracking-[0.22em] uppercase border border-line px-4 py-2 hover:border-ink transition"
                  >
                    アーカイブ
                  </button>
                  <button
                    type="button"
                    onClick={onDelete}
                    className="mono text-[10px] tracking-[0.22em] uppercase border border-accent text-accent px-4 py-2 hover:bg-accent hover:text-bg transition"
                  >
                    完全削除
                  </button>
                </div>
              </div>
            </StepCard>
          )}
        </section>

        {/* Step nav */}
        <div className="flex justify-between mt-10 pt-6 border-t border-line">
          <button
            type="button"
            disabled={currentIdx === 0}
            onClick={() => setStep(STEPS[currentIdx - 1].id)}
            className="mono text-[11px] tracking-[0.22em] uppercase border border-line px-4 py-2 hover:border-ink transition disabled:opacity-30"
          >
            ← {currentIdx > 0 ? STEPS[currentIdx - 1].label : ""}
          </button>
          <button
            type="button"
            disabled={currentIdx === STEPS.length - 1}
            onClick={() => setStep(STEPS[currentIdx + 1].id)}
            className="mono text-[11px] tracking-[0.22em] uppercase border border-accent text-accent px-5 py-2 hover:bg-accent hover:text-bg transition disabled:opacity-30"
          >
            {currentIdx < STEPS.length - 1
              ? `${STEPS[currentIdx + 1].label} →`
              : ""}
          </button>
        </div>
      </div>
    </form>
  );
}

// --- small UI helpers ------------------------------------------------------

const inputClass =
  "w-full bg-white text-[#111] border border-line px-3 py-2 text-[14px] focus:outline-none focus:border-accent transition mono placeholder:text-[#999]";

function Field({
  label,
  children,
  hint,
  error,
  required,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="block mono text-[10px] tracking-[0.28em] uppercase opacity-70 mb-1.5">
        {label}
        {required && <span className="text-accent ml-1">*</span>}
      </span>
      {children}
      {hint && !error && (
        <span className="block text-[11px] text-muted mt-1">{hint}</span>
      )}
      {error && (
        <span className="block text-[11px] text-accent mt-1">{error}</span>
      )}
    </label>
  );
}

function StepCard({
  n,
  title,
  desc,
  children,
}: {
  n: string;
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-line p-7 space-y-5 bg-[#222]">
      <header>
        <div className="mono text-[10px] tracking-[0.32em] uppercase text-accent mb-1">
          STEP {n}
        </div>
        <h2 className="serif text-2xl">{title}</h2>
        {desc && (
          <p className="text-[12px] text-muted mt-1 leading-[1.75]">{desc}</p>
        )}
      </header>
      <div className="space-y-5">{children}</div>
    </div>
  );
}

function Toggle({
  label,
  register,
}: {
  label: string;
  register: ReturnType<ReturnType<typeof useForm<Property>>["register"]>;
}) {
  return (
    <label className="flex items-center gap-3 border border-line px-4 py-3 cursor-pointer hover:border-ink transition">
      <input type="checkbox" {...register} className="accent-[#5ec8e8]" />
      <span className="text-[13px]">{label}</span>
    </label>
  );
}

function StatusPill({ status }: { status: Property["status"] }) {
  const cls =
    status === "published"
      ? "bg-accent text-bg"
      : status === "draft"
        ? "bg-[#222] text-ink"
        : "bg-[#111] text-muted";
  return (
    <span
      className={`inline-block px-2 py-1 mono text-[9px] tracking-[0.22em] uppercase ${cls}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function TagsEditor({
  values,
  onAdd,
  onRemove,
}: {
  values: string[] | undefined;
  onAdd: (v: string) => void;
  onRemove: (i: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="border border-line p-3 bg-[#141414]">
      <div className="flex flex-wrap gap-2 mb-2">
        {(values ?? []).map((t, i) => (
          <span
            key={`${t}-${i}`}
            className="inline-flex items-center gap-1 mono text-[10px] tracking-[0.18em] uppercase border border-line px-2 py-1"
          >
            {t}
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="opacity-50 hover:opacity-100 hover:text-accent"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        ref={inputRef}
        type="text"
        placeholder="タグを入力して Enter"
        className="w-full bg-transparent text-[13px] focus:outline-none mono"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const v = inputRef.current?.value.trim();
            if (v) {
              onAdd(v);
              if (inputRef.current) inputRef.current.value = "";
            }
          }
        }}
      />
    </div>
  );
}

function CoordsInput({
  value,
  onChange,
}: {
  value: { lat: number; lng: number } | null | undefined;
  onChange: (v: { lat: number; lng: number } | null) => void;
}) {
  const [paste, setPaste] = useState("");

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
        <input
          type="number"
          step="any"
          value={value?.lat ?? ""}
          onChange={(e) => {
            const lat = e.target.value === "" ? null : Number(e.target.value);
            const lng = value?.lng ?? 0;
            if (lat === null && (value?.lng === undefined)) onChange(null);
            else if (lat !== null && !Number.isNaN(lat))
              onChange({ lat, lng });
          }}
          className={inputClass}
          placeholder="lat (35.6580)"
        />
        <input
          type="number"
          step="any"
          value={value?.lng ?? ""}
          onChange={(e) => {
            const lng = e.target.value === "" ? null : Number(e.target.value);
            const lat = value?.lat ?? 0;
            if (lng === null && (value?.lat === undefined)) onChange(null);
            else if (lng !== null && !Number.isNaN(lng))
              onChange({ lat, lng });
          }}
          className={inputClass}
          placeholder="lng (139.7016)"
        />
        <button
          type="button"
          onClick={() => onChange(null)}
          className="mono text-[10px] tracking-[0.22em] uppercase border border-line px-3 py-2 hover:border-accent hover:text-accent transition"
        >
          クリア
        </button>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={paste}
          onChange={(e) => {
            setPaste(e.target.value);
            const parsed = parseCoordsFromInput(e.target.value);
            if (parsed) {
              onChange(parsed);
            }
          }}
          placeholder="Google Maps URL または座標をペースト"
          className={inputClass}
        />
        <button
          type="button"
          onClick={() => {
            const parsed = parseCoordsFromInput(paste);
            if (parsed) {
              onChange(parsed);
            }
          }}
          className="mono text-[10px] tracking-[0.22em] uppercase border border-line px-3 py-2 hover:border-accent hover:text-accent transition whitespace-nowrap"
        >
          解析
        </button>
      </div>

      {value && (
        <div className="mono text-[10px] text-muted">
          現在の座標: {value.lat.toFixed(4)}, {value.lng.toFixed(4)} —{" "}
          <a
            href={`https://www.google.com/maps?q=${value.lat},${value.lng}`}
            target="_blank"
            rel="noopener"
            className="text-accent hover:underline"
          >
            Google Maps で確認 ↗
          </a>
        </div>
      )}
    </div>
  );
}

function Checklist({ data }: { data: Property }) {
  const checks = [
    { ok: data.title.length >= 2, label: "物件名" },
    { ok: data.summary.length >= 10, label: "サマリー (10 文字以上)" },
    { ok: data.city.length > 0, label: "市区町村" },
    { ok: data.hourlyPrice > 0, label: "料金 (0 円以上)" },
    { ok: !!data.cover.src && /^https?:\/\//.test(data.cover.src), label: "カバー画像 URL" },
    { ok: !!data.splatUrl && /^https?:\/\//.test(data.splatUrl), label: "3DGS Splat URL" },
  ];
  const allOk = checks.every((c) => c.ok);
  return (
    <div>
      <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-2">
        Publish checklist
      </div>
      <ul className="space-y-1.5 text-[13px]">
        {checks.map((c, i) => (
          <li
            key={i}
            className={`flex items-center gap-2 ${c.ok ? "text-ink" : "text-muted"}`}
          >
            <span
              className={`inline-block w-4 text-center ${c.ok ? "text-accent" : "opacity-40"}`}
            >
              {c.ok ? "✓" : "○"}
            </span>
            {c.label}
          </li>
        ))}
      </ul>
      <div
        className={`mt-3 mono text-[10px] tracking-[0.24em] uppercase ${
          allOk ? "text-accent" : "text-muted"
        }`}
      >
        {allOk ? "▸ 公開準備 OK" : "▸ 未入力の必須項目があります"}
      </div>
    </div>
  );
}

const SALE_PRICE_PRESETS = [50000, 100000, 150000] as const;

function SalePriceInput({
  value,
  onChange,
}: {
  value: number | undefined;
  onChange: (v: number) => void;
}) {
  const isPreset = value != null && (SALE_PRICE_PRESETS as readonly number[]).includes(value);
  const [mode, setMode] = useState<"preset" | "custom">(isPreset || !value ? "preset" : "custom");

  return (
    <div className="flex gap-2 items-start">
      <select
        value={mode === "custom" ? "__custom__" : String(value ?? "")}
        onChange={(e) => {
          if (e.target.value === "__custom__") {
            setMode("custom");
          } else {
            setMode("preset");
            onChange(Number(e.target.value));
          }
        }}
        className={inputClass + " max-w-[220px]"}
      >
        <option value="">-- 選択 --</option>
        {SALE_PRICE_PRESETS.map((p) => (
          <option key={p} value={p}>
            ¥{p.toLocaleString()}
          </option>
        ))}
        <option value="__custom__">カスタム金額</option>
      </select>
      {mode === "custom" && (
        <input
          type="number"
          value={value ?? ""}
          onChange={(e) => onChange(Number(e.target.value))}
          className={inputClass + " max-w-[180px]"}
          min={0}
          placeholder="金額を入力"
        />
      )}
    </div>
  );
}

function parseCoordsFromInput(input: string): { lat: number; lng: number } | null {
  const s = input.trim();
  if (!s) return null;
  // Google Maps URL: /@lat,lng or ?q=lat,lng or /place/.../@lat,lng
  const urlMatch = s.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/) ||
    s.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/) ||
    s.match(/maps\/place\/[^/]*\/(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (urlMatch) {
    const lat = Number(urlMatch[1]);
    const lng = Number(urlMatch[2]);
    if (!Number.isNaN(lat) && !Number.isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng };
    }
  }
  // Plain coords: "35.6580, 139.7016"
  const coordMatch = s.match(/(-?\d+\.?\d*)[\s,]+(-?\d+\.?\d*)/);
  if (coordMatch) {
    const lat = Number(coordMatch[1]);
    const lng = Number(coordMatch[2]);
    if (!Number.isNaN(lat) && !Number.isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng };
    }
  }
  return null;
}

function generateDescriptionDraft(d: Record<string, unknown>): string {
  const title = String(d.title || "");
  const category = String(d.category || "");
  const studioType = String(d.studioType || "");
  const area = String(d.area || "");
  const city = String(d.city || "");
  const prefecture = String(d.prefecture || "");
  const capacity = Number(d.capacity) || 0;
  const floorArea = Number(d.floorAreaSqm) || 0;
  const ceiling = Number(d.ceilingHeightM) || 0;
  const power = String(d.powerVoltage || "");
  const hasLight = d.hasNaturalLight;
  const parking = d.parking;
  const dock = d.loadingDock;
  const tags = Array.isArray(d.tags) ? d.tags : [];
  const hourlyPrice = Number(d.hourlyPrice) || 0;
  const dailyPrice = Number(d.dailyPrice) || 0;
  const contactWebsite = String(d.contactWebsite || "");
  const splatItems = Array.isArray(d.splatItems) ? d.splatItems : [];

  if (!title && !category) return "";

  const lines: string[] = [];
  const loc = [prefecture, city].filter(Boolean).join("");
  const typeName = studioType || category || "スタジオ";

  // ── 概要セクション ──
  lines.push("【概要】");
  if (title) {
    lines.push(`${title}は、${loc ? loc + "に位置する" : ""}${typeName}です。`);
  } else if (loc) {
    lines.push(`${loc}に位置する${typeName}。`);
  }
  if (tags.length) {
    lines.push(`CM・映画・ドラマ・MV・スチール撮影など${tags.join("・")}に対応し、多様な制作ニーズを満たします。`);
  }
  lines.push("");

  // ── スペック・設備セクション ──
  lines.push("【スペック・設備】");
  const specs: string[] = [];
  if (floorArea) specs.push(`床面積 ${floorArea}㎡`);
  if (ceiling) specs.push(`天井高 ${ceiling}m`);
  if (capacity) specs.push(`最大収容 ${capacity}名`);
  if (specs.length) lines.push(specs.join(" ／ "));

  const features: string[] = [];
  if (hasLight) features.push("自然光が入る大開口");
  if (parking) features.push("駐車場完備（大型車両搬入可）");
  if (dock) features.push("搬入口・搬入用エレベーターあり");
  if (power) features.push(`電源 ${power}（大容量照明機材対応）`);
  if (ceiling >= 5) features.push("大型セット・高所作業に対応する天井高");
  if (floorArea >= 300) features.push("大規模セット組みに適した広さ");
  if (features.length) lines.push(features.join("\n"));
  lines.push("");

  // ── 特色・強み セクション ──
  lines.push("【特色・強み】");
  if (category === "studio" || category === "warehouse") {
    lines.push("・完全防音・遮光環境で天候・時間帯を問わず撮影可能");
    if (floorArea >= 200) lines.push("・広大な空間を活かした自由なセットデザイン");
    if (hasLight) lines.push("・自然光と人工照明を組み合わせた多彩なライティング");
  }
  if (category === "house") {
    lines.push("・生活感のあるリアルなインテリアで、ドラマ・CM に即使用可");
    lines.push("・建物まるごと貸し切り可、外観撮影にも対応");
  }
  if (category === "outdoor") {
    lines.push("・屋外ならではの開放感とロケーション");
    lines.push("・時間帯で表情が変わる自然光の魅力");
  }
  lines.push("・経験豊富なスタッフが常駐し、制作進行をサポート");
  lines.push("・ケータリング・控室・メイクルーム等の付帯設備充実");
  lines.push("");

  // ── 実績 セクション ──
  lines.push("【制作利用実績】");
  lines.push("大手映像制作会社・広告代理店の実績多数。");
  lines.push("CM / 映画 / ドラマ / MV / カタログ / EC撮影 等、幅広いジャンルでご利用いただいています。");
  lines.push("※ 守秘義務により具体的な作品名は非公開ですが、お問い合わせ時に実績をご案内可能です。");
  lines.push("");

  // ── 3DGS ロケハン セクション ──
  lines.push("【3DGS オンラインロケハン】");
  lines.push("高精度 3DGS（3D Gaussian Splatting）によるフォトリアル 3D スキャン済。");
  if (splatItems.length > 1) {
    lines.push(`${splatItems.length}区画を個別スキャンしており、フロアごとの空間確認が可能です。`);
  }
  lines.push("ブラウザ上で実空間を自由に歩き回り、天井高・搬入動線・機材配置を事前検証できます。");
  lines.push("現地下見の前段階として時間・交通費を大幅に削減できます。");
  lines.push("");

  // ── 料金 セクション ──
  if (hourlyPrice > 0 || dailyPrice > 0) {
    lines.push("【料金目安】");
    if (hourlyPrice > 0) lines.push(`時間利用: ¥${hourlyPrice.toLocaleString()}/hr〜`);
    if (dailyPrice > 0) lines.push(`日貸し: ¥${dailyPrice.toLocaleString()}/日〜`);
    lines.push("※ 撮影内容・規模により変動します。詳細はお問い合わせください。");
    lines.push("");
  }

  // ── 問い合わせ誘導 ──
  lines.push("【お問い合わせ】");
  lines.push("ご利用検討・空き確認・お見積もりはお気軽にお問い合わせください。");
  if (contactWebsite) lines.push(`HP: ${contactWebsite}`);

  return lines.join("\n");
}
