"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  propertySchema,
  publishablePropertySchema,
  CATEGORY_LABEL,
  STATUS_LABEL,
  PROPERTY_CATEGORIES,
  STUDIO_TYPE_SUGGESTIONS,
  type Property,
} from "@/lib/schemas";
import {
  saveDraftAction,
  publishAction,
  unpublishAction,
  archiveAction,
  deleteAction,
} from "@/app/admin/_actions";
import FileDropzone, {
  type UploadedFile,
} from "@/components/admin/file-dropzone";

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

  const form = useForm<Property>({
    resolver: zodResolver(propertySchema),
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
                ? "border-accent text-accent bg-[#0c0905]"
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
            {savedAt && (
              <span className="mono text-[10px] tracking-[0.2em] uppercase opacity-50">
                Saved {savedAt.slice(11, 19)}
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
                  onAdd={(v) => tagsArray.append(v)}
                  onRemove={(i) => tagsArray.remove(i)}
                />
              </Field>
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
                <div className="text-right mono text-[10px] opacity-50 mt-1">
                  {watch("description")?.length ?? 0} / 4000
                </div>
              </Field>
            </StepCard>
          )}

          {step === "photos" && (
            <StepCard
              n="04"
              title="写真"
              desc="カバー画像 1 枚 + ギャラリー（最大 40 枚）。ドラッグ&ドロップで public/uploads/ に保存されます。"
            >
              {/* COVER */}
              <div>
                <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-70 mb-1.5">
                  カバー画像 <span className="text-accent">*</span>
                </div>
                {watch("cover.src") ? (
                  <div className="border border-line bg-[#0a0a0a] p-2 relative">
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
                        className="relative border border-line bg-[#0a0a0a]"
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
                  }}
                />
              </div>
            </StepCard>
          )}

          {step === "splat" && (
            <StepCard
              n="05"
              title="3DGS データ"
              desc="Splat ファイル (.splat / .ply / .ksplat) をアップロード。アノテーション設置は Phase 2。"
            >
              {watch("splatUrl") ? (
                <div className="border border-line bg-[#0a0a0a] p-4 flex items-center gap-4">
                  <div className="mono text-[24px] text-accent">●</div>
                  <div className="flex-1 min-w-0">
                    <div className="mono text-[10px] tracking-[0.28em] uppercase text-accent mb-1">
                      Loaded
                    </div>
                    <div className="text-[12px] mono truncate">
                      {watch("splatUrl")}
                    </div>
                    <div className="text-[11px] text-muted mt-1">
                      {watch("splatSizeMb")} MB
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setValue("splatUrl", "", { shouldDirty: true });
                      setValue("splatSizeMb", 0, { shouldDirty: true });
                    }}
                    className="mono text-[10px] tracking-[0.22em] uppercase border border-line px-3 py-2 hover:border-accent hover:text-accent transition"
                  >
                    差し替え
                  </button>
                </div>
              ) : (
                <FileDropzone
                  propertyId={initial.id}
                  kind="splat"
                  accept=".splat,.ply,.ksplat"
                  label="3DGS file (.splat / .ply / .ksplat)"
                  hint="大容量 OK — 1 GB まで"
                  onUploaded={(f) => {
                    setValue("splatUrl", new URL(f.url, window.location.origin).toString(), {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                    setValue(
                      "splatSizeMb",
                      Math.max(1, Math.round(f.size / 1024 / 1024)),
                      { shouldDirty: true },
                    );
                  }}
                />
              )}

              <Field
                label="Splat URL (手入力で上書きも可)"
                hint="既に R2 などに置いてある場合"
                error={formState.errors.splatUrl?.message}
              >
                <input
                  type="url"
                  {...register("splatUrl")}
                  className={inputClass}
                  placeholder="https://pub-....r2.dev/your_scan.splat"
                />
              </Field>

              <div className="grid md:grid-cols-2 gap-5">
                <Field label="ファイルサイズ (MB)">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    {...register("splatSizeMb", { valueAsNumber: true })}
                    className={inputClass}
                  />
                </Field>
                <Field
                  label="スキャン日"
                  error={formState.errors.scannedAt?.message}
                  hint="YYYY-MM-DD"
                >
                  <input
                    type="text"
                    {...register("scannedAt")}
                    className={inputClass}
                    placeholder="2026-05-23"
                  />
                </Field>
              </div>

              <div className="border border-dashed border-line p-6 text-center">
                <div className="mono text-[10px] tracking-[0.28em] uppercase text-accent mb-2">
                  ● Phase 2
                </div>
                <div className="serif text-lg mb-2">アノテーション設置</div>
                <p className="text-[12px] text-muted leading-[1.85] max-w-[44ch] mx-auto">
                  3DGS 上に「📍 イベント / 🅿️ 駐車枠 / 🚪 搬入動線 / 📐 採寸」を
                  クリックで配置できる UI を後で統合します
                  （既存サービスの実装を参照予定）。
                  現状はメタデータのみで公開可能です。
                </p>
              </div>
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
  "w-full bg-[#0a0a0a] border border-line px-3 py-2 text-[14px] focus:outline-none focus:border-accent transition mono";

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
    <div className="border border-line p-7 space-y-5 bg-[#070707]">
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
      <input type="checkbox" {...register} className="accent-[#ffb454]" />
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
    <div className="border border-line p-3 bg-[#0a0a0a]">
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
          onChange={(e) => setPaste(e.target.value)}
          placeholder="Google Maps からペースト: 35.6580, 139.7016"
          className={inputClass}
        />
        <button
          type="button"
          onClick={() => {
            const m = paste.match(
              /(-?\d+\.\d+)[\s,]+(-?\d+\.\d+)/,
            );
            if (m) {
              onChange({ lat: Number(m[1]), lng: Number(m[2]) });
              setPaste("");
            }
          }}
          className="mono text-[10px] tracking-[0.22em] uppercase border border-line px-3 py-2 hover:border-accent hover:text-accent transition"
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
