"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  useForm,
  useFieldArray,
  type Resolver,
  type Control,
  type UseFormRegister,
  type UseFormSetValue,
  type UseFormWatch,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  propertySchema,
  publishablePropertySchema,
  CATEGORY_LABEL,
  STATUS_LABEL,
  PROPERTY_CATEGORIES,
  STUDIO_TYPE_SUGGESTIONS,
  AREA_SUGGESTIONS,
  TOKEN_COST_LABEL,
  DATA_LICENSES,
  DATA_LICENSE_LABEL,
  DATA_LICENSE_DESC,
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
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pickImageFor, setPickImageFor] = useState<null | "cover" | "gallery">(null);
  const [pickSplat, setPickSplat] = useState(false);
  const [previewSplat, setPreviewSplat] = useState(false);
  const [previewItemIdx, setPreviewItemIdx] = useState<number | null>(null);
  const [aiTagsLoading, setAiTagsLoading] = useState(false);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiTagsNote, setAiTagsNote] = useState<string | null>(null);
  const capture = usePreviewCapture();

  const form = useForm<Property>({
    // zod's input type (fields with .default() are optional) differs from the
    // output Property type; the resolver is sound at runtime, so pin its type.
    resolver: zodResolver(propertySchema) as Resolver<Property>,
    defaultValues: initial,
    mode: "onBlur",
  });

  const { register, watch, control, getValues, setValue, formState } = form;

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

  // 下書き保存はフォーム全体のバリデーションでゲートしない（下書きは不完全でも
  // 保存できるべき）。getValues() を直接サーバーへ送り、サーバー側の寛容な
  // propertySchema で検証。失敗は無言にせず画面に表示する。
  const onSaveDraft = useCallback(() => {
    setSaveError(null);
    const data = getValues();
    startSave(async () => {
      try {
        await saveDraftAction(data);
        setSavedAt(new Date().toISOString());
        setSaveError(null);
        router.refresh();
      } catch (e) {
        console.error(e);
        setSaveError(
          e instanceof Error
            ? `保存に失敗しました: ${e.message}`
            : "保存に失敗しました（入力内容をご確認ください）",
        );
      }
    });
  }, [getValues, startSave, router]);

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const triggerAutoSave = useCallback(
    (delayMs = 0) => {
      clearTimeout(autoSaveTimer.current);
      if (delayMs === 0) {
        onSaveDraft();
      } else {
        autoSaveTimer.current = setTimeout(() => onSaveDraft(), delayMs);
      }
    },
    [onSaveDraft],
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
        onSaveDraft();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSaveDraft]);

  const currentTitle = watch("title");
  const currentStatus = watch("status");
  const currentIdx = STEPS.findIndex((s) => s.id === step);
  const progress = ((currentIdx + 1) / STEPS.length) * 100;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSaveDraft();
      }}
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

        {saveError && (
          <div className="mb-6 border border-red-500 bg-[#1a0a0a] p-4">
            <div className="mono text-[10px] tracking-[0.28em] uppercase text-red-400 mb-2">
              ⚠ 下書き保存に失敗しました
            </div>
            <div className="text-[12px] text-muted leading-[1.7]">
              {saveError}
            </div>
          </div>
        )}

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
                  hint="一覧から選択。無ければ「その他（自由入力）」"
                >
                  <SuggestSelect
                    value={watch("studioType") || ""}
                    onChange={(v) =>
                      setValue("studioType", v, { shouldDirty: true })
                    }
                    options={STUDIO_TYPE_SUGGESTIONS}
                    placeholder="スタジオ種類を入力"
                  />
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
                  <SuggestSelect
                    value={watch("area") || ""}
                    onChange={(v) => setValue("area", v, { shouldDirty: true })}
                    options={AREA_SUGGESTIONS}
                    placeholder="エリアを入力"
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
                hint="下の欄に「日本の住所」「Google Maps の URL」「座標」のいずれかを貼り、解析でピン位置を取得。空欄でも下書き OK、公開時は地図に出ません。"
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
                <button
                  type="button"
                  disabled={aiSummaryLoading}
                  onClick={async () => {
                    setAiSummaryLoading(true);
                    try {
                      const d = getValues();
                      const res = await fetch("/api/admin/suggest-summary", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          title: d.title,
                          category: d.category,
                          studioType: d.studioType,
                          prefecture: d.prefecture,
                          city: d.city,
                          area: d.area,
                          contactWebsite: d.contactWebsite,
                          description: d.description,
                          capacity: d.capacity,
                          floorAreaSqm: d.floorAreaSqm,
                          ceilingHeightM: d.ceilingHeightM,
                          hasNaturalLight: d.hasNaturalLight,
                          parking: d.parking,
                          loadingDock: d.loadingDock,
                          powerVoltage: d.powerVoltage,
                          tags: Array.isArray(d.tags) ? d.tags : [],
                        }),
                      });
                      const data = (await res.json()) as {
                        summary?: string;
                        error?: string;
                      };
                      if (!res.ok || !data.summary) {
                        alert(data.error || "サマリー生成に失敗しました");
                        return;
                      }
                      setValue("summary", data.summary, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                      triggerAutoSave();
                    } catch {
                      alert("通信エラーが発生しました");
                    } finally {
                      setAiSummaryLoading(false);
                    }
                  }}
                  className="mt-2 mono text-[10px] tracking-[0.22em] uppercase border border-accent/50 text-accent px-3 py-1 hover:bg-accent hover:text-bg transition disabled:opacity-40 disabled:cursor-wait"
                >
                  {aiSummaryLoading ? "生成中…" : "✦ AIでサマリー生成"}
                </button>
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
                  <Field
                    label="メールアドレス"
                    hint="問い合わせフォームの送信先（先方へ直接転送）"
                  >
                    <input
                      type="email"
                      {...register("contactEmail")}
                      className={inputClass}
                      placeholder="studio@example.com"
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
                <Field
                  label="天井高 (m)"
                  hint={
                    watch("category") === "outdoor"
                      ? "屋外のため対象外（自動で「—」表示）"
                      : undefined
                  }
                >
                  {watch("category") === "outdoor" ? (
                    <input
                      type="text"
                      disabled
                      value="— 屋外のため対象外"
                      className={inputClass + " opacity-60 cursor-not-allowed"}
                    />
                  ) : (
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      {...register("ceilingHeightM", { valueAsNumber: true })}
                      className={inputClass}
                    />
                  )}
                </Field>
              </div>

              <Field
                label="電源仕様"
                hint="下のボタンで素早く入力。屋外・電源不可の場合は「なし」。"
              >
                <input
                  type="text"
                  {...register("powerVoltage")}
                  className={inputClass}
                  placeholder="100V 30A など"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {POWER_PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() =>
                        setValue("powerVoltage", p, { shouldDirty: true })
                      }
                      className="mono text-[10px] tracking-[0.1em] border border-line px-2.5 py-1 hover:border-accent hover:text-accent transition"
                    >
                      {p}
                    </button>
                  ))}
                </div>
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
                <button
                  type="button"
                  disabled={aiTagsLoading}
                  onClick={async () => {
                    setAiTagsLoading(true);
                    try {
                      const d = getValues();
                      const res = await fetch("/api/admin/suggest-tags", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          title: d.title,
                          category: d.category,
                          studioType: d.studioType,
                          prefecture: d.prefecture,
                          city: d.city,
                          area: d.area,
                          contactWebsite: d.contactWebsite,
                          description: d.description,
                          capacity: d.capacity,
                          floorAreaSqm: d.floorAreaSqm,
                          ceilingHeightM: d.ceilingHeightM,
                          hasNaturalLight: d.hasNaturalLight,
                          parking: d.parking,
                          loadingDock: d.loadingDock,
                          powerVoltage: d.powerVoltage,
                          existingTags: Array.isArray(d.tags) ? d.tags : [],
                        }),
                      });
                      const data = (await res.json()) as {
                        tags?: string[];
                        source?: "ai" | "heuristic";
                        error?: string;
                      };
                      if (!res.ok || !data.tags) {
                        alert(data.error || "タグ生成に失敗しました");
                        return;
                      }
                      const existing = new Set(
                        (Array.isArray(d.tags) ? d.tags : []).map((t) => String(t).trim()),
                      );
                      const fresh = data.tags.filter((t) => t && !existing.has(t));
                      setAiTagsNote(
                        data.source === "ai"
                          ? "✓ 公式サイト＋ネット検索から生成しました"
                          : "※ APIキー未設定のため簡易生成（ネット検索なし）。本番はキー投入でHP＋検索から割り出します。",
                      );
                      if (!fresh.length) {
                        return;
                      }
                      for (const t of fresh) tagsArray.append(t as never);
                      triggerAutoSave();
                    } catch {
                      alert("通信エラーが発生しました");
                    } finally {
                      setAiTagsLoading(false);
                    }
                  }}
                  className="mt-2 mono text-[10px] tracking-[0.22em] uppercase border border-accent/50 text-accent px-3 py-1 hover:bg-accent hover:text-bg transition disabled:opacity-40 disabled:cursor-wait"
                >
                  {aiTagsLoading ? "検索中…" : "✦ AIでタグ自動生成（HP＋ネット検索）"}
                </button>
                {aiTagsNote && (
                  <div className="mt-1.5 text-[11px] text-muted">{aiTagsNote}</div>
                )}
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
                              f.url,
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
                      focus: "center",
                    });
                  }
                }}
              />

              {/* COVER */}
              <div>
                <div className="mono text-[11px] font-semibold tracking-[0.2em] uppercase text-neutral-600 mb-1.5">
                  カバー画像（詳細ページのヘッダー） <span className="text-accent">*</span>
                </div>
                {watch("cover.src") ? (
                  <div className="border border-line bg-[#141414] p-2 relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={watch("cover.src")}
                      alt="cover preview"
                      className="w-full aspect-[16/9] object-cover"
                      style={{ objectPosition: watch("cover.focus") || "center" }}
                    />
                    {/* トリミング基準ピッカー（残す位置を指定。プレビューに即反映） */}
                    <div className="absolute bottom-3 left-3 flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-white bg-black/60 px-2 py-1 rounded">
                        表示位置 ▾
                      </span>
                      <FocusPicker
                        value={watch("cover.focus") || "center"}
                        onChange={(v) =>
                          setValue("cover.focus", v, { shouldDirty: true })
                        }
                      />
                    </div>
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
                {watch("cover.src") && (
                  <p className="text-[12px] text-neutral-500 mt-1.5 leading-relaxed">
                    ↑ プレビュー左下の <span className="font-semibold text-neutral-700">「表示位置」</span>
                    で、詳細ページ上部（ヘッダー）に表示される位置を9点から調整できます。
                  </p>
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
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={watch(`gallery.${i}.src`)}
                              alt=""
                              className="w-full aspect-[4/3] object-cover"
                              style={{
                                objectPosition:
                                  watch(`gallery.${i}.focus`) || "center",
                              }}
                            />
                            {/* トリミング基準ピッカー */}
                            <div className="absolute top-1.5 left-1.5">
                              <FocusPicker
                                value={watch(`gallery.${i}.focus`) || "center"}
                                onChange={(v) =>
                                  setValue(`gallery.${i}.focus`, v, {
                                    shouldDirty: true,
                                  })
                                }
                              />
                            </div>
                          </>
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
                      focus: "center",
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
              desc="3DGSファイルをアップロード。駐車場・1F・2F等フロア別に複数登録できます。"
            >
              {/* ── 3DGS アイテム (複数・ラベル付き) ── */}
              <div className="mt-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60">
                    3DGS データ（フロア・区画別）
                  </div>
                  <button
                    type="button"
                    onClick={() => splatItemsArray.append({ label: "", splatUrl: "", previewVideoUrl: "", sizeMb: 0, notes: "", forSale: false, salePrice: 0, saleDescription: "", accessLevel: "public" as const, downloadFileUrl: "", downloadFileSizeMb: 0, downloadFileFormat: "PLY & OBJ (ZIP)", downloadFiles: [], pointCount: 0, captureDevice: "", license: "standard" as const })}
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

                      <div className="mono text-[9px] tracking-[0.2em] uppercase text-accent/60">
                        ① ビューアー用 3DGS ファイル
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
                            const uploadedUrl = f.url;
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

                      <div className="mono text-[9px] tracking-[0.2em] uppercase text-ink/40">
                        ② メモ（任意）
                      </div>
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
                          <span className="text-[11px] mono tracking-[0.14em] uppercase opacity-70">③ このデータを販売する</span>
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
                              <div className="mono text-[11px] font-semibold tracking-[0.18em] uppercase text-accent mb-2">
                                一括ダウンロードファイル（全形式まとめ ZIP）
                              </div>
                              <div className="text-[10px] text-muted mb-2">
                                ※ ビューアー用3DGSファイルとは別。購入者が「一括ダウンロード」で取得する全形式入りZIP。
                                個別形式は下の「マルチ形式」で追加（任意）。
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
                                    const uploadedUrl = f.url;
                                    setValue(`splatItems.${idx}.downloadFileUrl`, uploadedUrl, { shouldDirty: true, shouldValidate: true });
                                    setValue(`splatItems.${idx}.downloadFileSizeMb`, Math.max(1, Math.round(f.size / 1024 / 1024)), { shouldDirty: true });
                                    // 形式が未入力なら拡張子から自動セット（zipはバンドル表記のため上書きしない）。
                                    const fmt = formatFromUrl(uploadedUrl);
                                    if (fmt && fmt !== "ZIP" && !watch(`splatItems.${idx}.downloadFileFormat`)) {
                                      setValue(`splatItems.${idx}.downloadFileFormat`, fmt, { shouldDirty: true });
                                    }
                                    triggerAutoSave();
                                  }}
                                />
                              )}
                              <Field label="ファイル形式（単一・フォールバック用）" hint="">
                                <input
                                  type="text"
                                  {...register(`splatItems.${idx}.downloadFileFormat`)}
                                  className={inputClass}
                                  placeholder="PLY & OBJ (ZIP)"
                                />
                              </Field>
                            </div>

                            {/* ── マルチ形式ダウンロード（TurboSquid風） ── */}
                            <DownloadFilesEditor
                              control={control}
                              register={register}
                              setValue={setValue}
                              watch={watch}
                              propertyId={initial.id}
                              idx={idx}
                            />

                            {/* ── 商品スペック ── */}
                            <div className="grid sm:grid-cols-2 gap-3">
                              <Field label="点群数（スペック表示）" hint="例: 12000000">
                                <input
                                  type="number"
                                  {...register(`splatItems.${idx}.pointCount`, { valueAsNumber: true })}
                                  className={inputClass}
                                  placeholder="0"
                                  min={0}
                                />
                              </Field>
                              <Field label="撮影機材" hint="例: iPhone 15 Pro LiDAR">
                                <input
                                  type="text"
                                  {...register(`splatItems.${idx}.captureDevice`)}
                                  className={inputClass}
                                  placeholder="撮影機材・手法"
                                />
                              </Field>
                            </div>

                            {/* ── ライセンス ── */}
                            <Field label="ライセンス区分" hint="購入者の利用範囲。商品ページ・領収書に表示されます。">
                              <select
                                {...register(`splatItems.${idx}.license`)}
                                className={inputClass}
                              >
                                {DATA_LICENSES.map((l) => (
                                  <option key={l} value={l} className="bg-bg">
                                    {DATA_LICENSE_LABEL[l]} — {DATA_LICENSE_DESC[l]}
                                  </option>
                                ))}
                              </select>
                            </Field>
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
  "w-full bg-white text-[#111] border border-neutral-300 px-3 py-2.5 text-[15px] font-medium focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/25 transition mono placeholder:text-[#9aa0a6] placeholder:font-normal";

/** アップロードファイルの拡張子から表示用フォーマット名を推定（自動入力用）。 */
function formatFromUrl(url: string): string {
  const ext = (url.split("?")[0].match(/\.([a-z0-9]+)$/i)?.[1] || "").toLowerCase();
  const map: Record<string, string> = {
    rad: "3DGS RAD",
    ply: "PLY",
    obj: "OBJ",
    zip: "ZIP",
    splat: "SPLAT",
    ksplat: "KSPLAT",
    glb: "GLB",
    gltf: "glTF",
    fbx: "FBX",
  };
  return map[ext] || ext.toUpperCase();
}

/** 画像トリミングのフォーカス位置（object-position 値）。3×3 の9点。 */
const FOCUS_POSITIONS = [
  "left top",
  "center top",
  "right top",
  "left center",
  "center",
  "right center",
  "left bottom",
  "center bottom",
  "right bottom",
] as const;

/**
 * 画像の切り抜き基準（object-position）を 3×3 グリッドで指定するピッカー。
 * 多様なアスペクト比の写真を object-cover で切る際に「写真のどこを残すか」を選ぶ。
 */
function FocusPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const active = value || "center";
  return (
    <div
      className="inline-grid grid-cols-3 gap-0.5 bg-black/55 backdrop-blur-sm p-1 rounded"
      title="トリミング基準（残す位置）"
    >
      {FOCUS_POSITIONS.map((pos) => (
        <button
          key={pos}
          type="button"
          aria-label={`トリミング基準: ${pos}`}
          onClick={() => onChange(pos)}
          className={`w-3.5 h-3.5 rounded-[2px] border transition ${
            active === pos
              ? "bg-accent border-accent"
              : "bg-white/25 border-white/40 hover:bg-white/60"
          }`}
        />
      ))}
    </div>
  );
}

/** 電源仕様のクイック入力プリセット（「なし」含む）。 */
const POWER_PRESETS = [
  "なし",
  "100V 15A",
  "100V 20A",
  "100V 30A",
  "200V 単相",
  "三相 200V",
  "簡易電源 (発電機推奨)",
] as const;

/**
 * 候補から選択、無ければ「その他（自由入力）」でテキスト入力に切り替わる
 * 汎用セレクト（任意の文字列を保持できる）。スタジオ種類・エリア等で共用。
 */
function SuggestSelect({
  value,
  onChange,
  options: rawOptions,
  placeholder = "自由入力",
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  placeholder?: string;
}) {
  const options = rawOptions.filter((s) => s !== "その他");
  const inList = options.includes(value);
  const [freeMode, setFreeMode] = useState(value !== "" && !inList);

  return (
    <div className="space-y-2">
      <select
        value={freeMode ? "__other__" : value}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__other__") {
            setFreeMode(true);
            onChange("");
          } else {
            setFreeMode(false);
            onChange(v);
          }
        }}
        className={inputClass}
      >
        <option value="">— 選択 —</option>
        {options.map((s) => (
          <option key={s} value={s} className="bg-white">
            {s}
          </option>
        ))}
        <option value="__other__" className="bg-white">
          その他（自由入力）
        </option>
      </select>
      {freeMode && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}

/** splatItem ごとのマルチ形式ダウンロード編集（ネスト配列＋形式別アップロード）。 */
function DownloadFilesEditor({
  control,
  register,
  setValue,
  watch,
  propertyId,
  idx,
}: {
  control: Control<Property>;
  register: UseFormRegister<Property>;
  setValue: UseFormSetValue<Property>;
  watch: UseFormWatch<Property>;
  propertyId: string;
  idx: number;
}) {
  const fa = useFieldArray({ control, name: `splatItems.${idx}.downloadFiles` });
  return (
    <div className="border border-dashed border-accent/30 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="mono text-[11px] font-semibold tracking-[0.18em] uppercase text-accent">
          マルチ形式ダウンロード（任意）
        </div>
        <button
          type="button"
          onClick={() => fa.append({ format: "", url: "", sizeMb: 0 })}
          className="mono text-[10px] tracking-[0.22em] uppercase border border-line px-2 py-1 hover:border-accent hover:text-accent transition"
        >
          + 形式を追加
        </button>
      </div>
      <p className="text-[10px] text-muted">
        形式ごとに本物のファイルをアップロード（PLY / RAD / OBJ 等）。空欄なら上の単一ファイルを使用。
      </p>
      {fa.fields.map((f, fi) => {
        const url = watch(`splatItems.${idx}.downloadFiles.${fi}.url`);
        const size = watch(`splatItems.${idx}.downloadFiles.${fi}.sizeMb`);
        return (
          <div key={f.id} className="border border-line p-2 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                {...register(`splatItems.${idx}.downloadFiles.${fi}.format`)}
                placeholder="形式 (PLY / RAD / OBJ)"
                className={inputClass + " flex-1 min-w-[110px]"}
              />
              <input
                type="number"
                {...register(`splatItems.${idx}.downloadFiles.${fi}.sizeMb`, { valueAsNumber: true })}
                placeholder="MB"
                className={inputClass + " w-24"}
              />
              <button
                type="button"
                onClick={() => fa.remove(fi)}
                className="mono text-[12px] border border-line px-2 py-2 hover:border-red-400 hover:text-red-400 transition"
                aria-label="削除"
              >
                ×
              </button>
            </div>
            {url ? (
              <div className="flex items-center gap-2">
                <span className="mono text-[18px] text-green-400">●</span>
                <div className="flex-1 min-w-0">
                  <div className="mono text-[10px] truncate">{url}</div>
                  <div className="text-[10px] text-muted">{size || 0} MB</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setValue(`splatItems.${idx}.downloadFiles.${fi}.url`, "", { shouldDirty: true });
                    setValue(`splatItems.${idx}.downloadFiles.${fi}.sizeMb`, 0, { shouldDirty: true });
                  }}
                  className="mono text-[10px] tracking-[0.22em] uppercase border border-line px-3 py-1.5 hover:border-accent hover:text-accent transition"
                >
                  差し替え
                </button>
              </div>
            ) : (
              <FileDropzone
                propertyId={propertyId}
                kind="zip"
                accept=".ply,.obj,.rad,.zip,.splat,.ksplat"
                label="この形式のファイルをアップロード"
                hint="PLY / RAD / OBJ など — 20 GB まで"
                onUploaded={(file) => {
                  setValue(
                    `splatItems.${idx}.downloadFiles.${fi}.url`,
                    new URL(file.url, window.location.origin).toString(),
                    { shouldDirty: true, shouldValidate: true },
                  );
                  setValue(
                    `splatItems.${idx}.downloadFiles.${fi}.sizeMb`,
                    Math.max(1, Math.round(file.size / 1024 / 1024)),
                    { shouldDirty: true },
                  );
                  // 形式名が未入力なら拡張子から自動セット。
                  const fmt = formatFromUrl(file.url);
                  if (fmt && !watch(`splatItems.${idx}.downloadFiles.${fi}.format`)) {
                    setValue(`splatItems.${idx}.downloadFiles.${fi}.format`, fmt, {
                      shouldDirty: true,
                    });
                  }
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

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
      <span className="block mono text-[11px] font-semibold tracking-[0.18em] uppercase text-neutral-600 mb-1.5">
        {label}
        {required && <span className="text-accent ml-1">*</span>}
      </span>
      {children}
      {hint && !error && (
        <span className="block text-[12px] text-neutral-500 mt-1">{hint}</span>
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
  const [resolving, setResolving] = useState(false);
  const [resolveErr, setResolveErr] = useState<string | null>(null);

  const handleParse = async () => {
    setResolveErr(null);
    const parsed = parseCoordsFromInput(paste);
    if (parsed) {
      onChange(parsed);
      return;
    }
    const q = paste.trim();
    if (q.length < 2) {
      setResolveErr("住所・地名、Google Maps の URL、または座標を入力してください");
      return;
    }
    // 住所/地名・短縮URL ともサーバー側で解決（GSI住所検索 → Nominatim、URLはリダイレクト解決）。
    setResolving(true);
    try {
      const res = await fetch("/api/admin/resolve-maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: q }),
      });
      const data = (await res.json()) as {
        coords?: { lat: number; lng: number };
        error?: string;
      };
      if (res.ok && data.coords) {
        onChange(data.coords);
        setResolveErr(null);
      } else {
        setResolveErr(data.error || "座標を取得できませんでした");
      }
    } catch {
      setResolveErr("通信エラーが発生しました");
    } finally {
      setResolving(false);
    }
  };

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
          placeholder="日本の住所 / Google Maps URL（共有・短縮可）/ 座標 をペースト → 解析"
          className={inputClass}
        />
        <button
          type="button"
          onClick={handleParse}
          disabled={resolving}
          className="mono text-[10px] tracking-[0.22em] uppercase border border-line px-3 py-2 hover:border-accent hover:text-accent transition whitespace-nowrap disabled:opacity-40 disabled:cursor-wait"
        >
          {resolving ? "解析中…" : "解析"}
        </button>
      </div>

      {resolveErr && (
        <div className="mono text-[10px] text-red-400">{resolveErr}</div>
      )}

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
    { ok: !!data.splatUrl && (/^https?:\/\//.test(data.splatUrl) || data.splatUrl.startsWith("/api/")), label: "3DGS Splat URL" },
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
    lines.push(`特徴: ${tags.join("・")}`);
  }
  lines.push("");

  // ── スペック・設備セクション（入力された実データのみ。誇張表現は付けない） ──
  lines.push("【スペック・設備】");
  const specs: string[] = [];
  if (floorArea) specs.push(`床面積 ${floorArea}㎡`);
  if (ceiling) specs.push(`天井高 ${ceiling}m`);
  if (capacity) specs.push(`最大収容 ${capacity}名`);
  if (specs.length) lines.push(specs.join(" ／ "));

  const features: string[] = [];
  if (hasLight) features.push("自然光あり");
  if (parking) features.push("駐車場あり");
  if (dock) features.push("大型搬入口あり");
  if (power) features.push(`電源 ${power}`);
  if (features.length) lines.push(features.join(" ／ "));
  lines.push("");

  // 【特色・強み】【制作利用実績】等の自動文は、物件と無関係に毎回挿入され
  // 誇張・虚偽になり得るため生成しない。特色は上のタグ・設備（実データ）で表す。
  // 3DGS の一般説明も全物件共通で自明なため生成しない。

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
