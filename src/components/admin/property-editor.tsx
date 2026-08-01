"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  type DataLicense,
} from "@/lib/schemas";
import {
  AFTER_FREE_PERIOD_ACTIONS,
  AFTER_FREE_PERIOD_LABEL,
  dataSalePeriodStatus,
  type DataSaleFreePeriod,
} from "@/lib/settings-schema";
import {
  saveDraftAction,
  publishAction,
  unpublishAction,
  archiveAction,
  deleteAction,
  cleanupReplacedFileAction,
} from "@/app/admin/_actions";
import FileDropzone from "@/components/admin/file-dropzone";
import AssetPickerModal from "./asset-picker-modal";
import SlugEditor from "./slug-editor";
import PropertyOwnerPanel from "./property-owner-panel";
import { usePreviewCapture } from "./use-preview-capture";
import { buildViewerUrl } from "@/lib/viewer";
import { publishReadiness } from "@/lib/publish-readiness";

/**
 * 入力ステップ。⚠ 並び順 = 実際に埋める順番。ここを変えたら本文側の
 * `step === "..."` ブロックの並びも合わせること（上から順に読める状態を保つ）。
 *
 * ── 2026-07-30 の分割 ──────────────────────────────────
 * 以前は 6 ステップで、02「仕様・設備」に住所・アクセス・料金・ルール・実績・
 * タグ・図面まで詰まっていた（39欄 / 3590px）。名前と中身が一致せず
 * 「作りづらい」の主因だったので、作業の単位で切り直した。
 * 料金が 01（時間/日料金）と 02（最低利用時間・ロケハン費）に分かれていた問題も
 * 「料金」ステップへ寄せて解消する。
 * `admin: true` は運営専用（スタジオには出さない）。
 */
const STEPS = [
  { id: "basic", label: "基本情報" },
  { id: "specs", label: "仕様・設備" },
  { id: "terms", label: "利用条件" },
  { id: "pricing", label: "料金" },
  { id: "photos", label: "写真" },
  { id: "plans", label: "図面" },
  { id: "description", label: "紹介文" },
  { id: "features", label: "特徴・タグ" },
  { id: "splat", label: "3DGS データ", admin: true },
  { id: "splatMeta", label: "3DGS 注釈・メタ", admin: true },
  { id: "publish", label: "公開設定", admin: true },
] as const;

type StepId = (typeof STEPS)[number]["id"];

export default function PropertyEditor({
  initial,
  isAdmin = false,
}: {
  initial: Property;
  /** 運営のみ 3DGS を編集できる。studio には読み取り専用で見せる。 */
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<StepId>("basic");
  // 英語(EN)欄は既定で畳む。日本語欄の直後に毎回挟まると入力のリズムが切れるうえ、
  // 実際は空欄でよい（公開作業時に運営がAI翻訳して埋める）。必要な人だけ開く。
  const [showEn, setShowEn] = useState(false);
  // 3DGSデータ行の開閉。行IDごとに保持し、既定は畳んだ状態。
  // ⚠ ファイル1件ごとに販売設定・無料期間・ライセンスまで並ぶので、
  //   全部開くと3件で5000pxを超える（実測 41欄/5399px）。
  const [splatOpen, setSplatOpen] = useState<Record<string, boolean>>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [publishing, startPublish] = useTransition();
  const [publishError, setPublishError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pickImageFor, setPickImageFor] = useState<null | "cover" | "gallery">(null);
  const [previewItemIdx, setPreviewItemIdx] = useState<number | null>(null);
  const [aiTagsLoading, setAiTagsLoading] = useState(false);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiLocationLoading, setAiLocationLoading] = useState(false);
  const [aiLocationError, setAiLocationError] = useState<string | null>(null);
  const [aiTagsNote, setAiTagsNote] = useState<string | null>(null);
  // タイムスタンプは new Date(...).getHours() 等でローカル(JST)整形するが、
  // SSR は Cloudflare Workers 上で UTC 実行されるため、サーバは UTC・クライアントは
  // JST で異なるテキストを描画し React #418（hydration text mismatch）を起こす。
  // mounted は SSR/初回クライアント描画とも false（＝同一テキスト）で、マウント後に
  // true へ切り替えてローカル時刻を出す。これで初期HTMLが一致し hydration が成立する。
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const capture = usePreviewCapture();
  // ⚠ effect の依存にはメンバー式(capture.xxx)ではなくローカルに展開した値を使う。
  //    メンバー式のままだと exhaustive-deps が「capture 全体」を要求し、
  //    毎レンダー新しくなるオブジェクトを依存に入れる＝effectが毎回走る、
  //    という悪化を招く（実際に警告が出ていた）。
  const { capturedUrl, capturedIdx, clearResult, queueCaptures } = capture;
  // プレビュー動画生成の録画前ウォームアップを +3秒 する（重いシーンで画質が
  // 乗り切る前に録画が始まりボケるのを防ぐ）。既定OFF。
  const [warmupPlus3, setWarmupPlus3] = useState(false);
  const captureWarmupMs = warmupPlus3 ? 3000 : 0;

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

  // ── マルチタブ楽観ロック（クライアント側）──
  // 最後にサーバーで確定した updatedAt を保持し、保存のたびにサーバーへ渡す。
  // サーバー値と食い違う＝別タブが先に保存 → 衝突。以後の autosave を止めて
  // 「再読み込みしてください」を表示（古い内容での無言上書きを防ぐ）。
  const baseUpdatedAtRef = useRef<string | undefined>(initial.updatedAt);
  const conflictRef = useRef(false);
  // 同一タブ内の「保存の多重発火」を直列化するためのフラグ。
  //  - saveInFlightRef: いま1本の保存が実行中か。
  //  - pendingSaveRef : 実行中に来た保存要求を1本に畳み込み、完了後に流す。
  // これがないと、動画キャプチャ完了(複数行)＋debounce watch が短時間に
  // 複数の onSaveDraft を同時発火し、どれもが「実行中の保存が返す前の古い
  // baseUpdatedAt」を expectedUpdatedAt に使ってしまう。サーバは毎回 updatedAt を
  // 新しくするため、後続の保存が自分自身の直前の保存と衝突判定され、
  // 単独タブなのに「別タブで更新」という誤検知（＝autosave 停止）を起こす。
  // 直列化すれば expectedUpdatedAt は常に直前の保存が返した最新値になる。
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef(false);

  // 下書き保存はフォーム全体のバリデーションでゲートしない（下書きは不完全でも
  // 保存できるべき）。getValues() を直接サーバーへ送り、サーバー側の寛容な
  // propertySchema で検証。失敗は無言にせず画面に表示する。
  const onSaveDraft = useCallback(() => {
    if (conflictRef.current) return; // 衝突検出後は再読み込みまで保存停止
    // 既に保存中なら、新規保存を同時発火せず「あとで1本だけ」に畳み込む。
    // （直列化しないと自分自身の直前保存と updatedAt が食い違い誤衝突する）
    if (saveInFlightRef.current) {
      pendingSaveRef.current = true;
      return;
    }
    saveInFlightRef.current = true;
    setSaveError(null);
    const data = getValues();
    startSave(async () => {
      try {
        const res = await saveDraftAction(data, {
          expectedUpdatedAt: baseUpdatedAtRef.current,
        });
        if (!res.ok) {
          conflictRef.current = true;
          setSaveError(
            "別のタブ（または別の端末）でこの物件が更新されています。上書き事故を防ぐため自動保存を停止しました。ページを再読み込みしてから編集を続けてください。",
          );
          return;
        }
        baseUpdatedAtRef.current = res.updatedAt;
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
      } finally {
        saveInFlightRef.current = false;
        // 実行中に溜まった保存要求があれば、最新の baseUpdatedAt で1本だけ流す。
        if (pendingSaveRef.current && !conflictRef.current) {
          pendingSaveRef.current = false;
          onSaveDraftRef.current?.();
        }
      }
    });
  }, [getValues, startSave, router]);
  // onSaveDraft を finally から自己参照するための ref（宣言順の循環を避ける）。
  const onSaveDraftRef = useRef<typeof onSaveDraft>(onSaveDraft);
  useEffect(() => { onSaveDraftRef.current = onSaveDraft; }, [onSaveDraft]);

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
    if (capturedUrl && capturedIdx !== null) {
      const prevUrl = getValues(`splatItems.${capturedIdx}.previewVideoUrl`);
      setValue(`splatItems.${capturedIdx}.previewVideoUrl`, capturedUrl, { shouldDirty: true });
      triggerAutoSave();
      clearResult();
      if (prevUrl && prevUrl !== capturedUrl) {
        cleanupReplacedFileAction(initial.id, prevUrl).catch(() => {});
      }
    }
  }, [capturedUrl, capturedIdx, setValue, getValues, triggerAutoSave, clearResult, initial.id]);

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
      queueCaptures(
        missing.map((it) => ({ splatUrl: it.splatUrl, propertyId: initial.id, itemIdx: it.idx })),
      );
    }
  }, [initial.splatItems, initial.id, queueCaptures]);

  // Debounced auto-save: any form change triggers save after 1.5s of inactivity
  // ⚠ react-hooks/incompatible-library はここでは想定内。react-hook-form の
  //    watch() は購読を返す仕様で React Compiler がメモ化できないため、
  //    このコンポーネントは最適化がスキップされる。RHF を使う設計上の
  //    トレードオフで、バグではない（watch の戻り値をメモ化された子へ
  //    渡していないので stale UI も起きない）。RHF をやめない限り解消しない。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/incompatible-library
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
      // 同一フィールドで複数ルールが同じ文言を出すことがあるため重複排除する。
      const msgs = Array.from(
        new Set(result.error.issues.map((i) => i.message)),
      );
      setPublishError(msgs.join(" / "));
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
  // 申請できる状態か（3DGS以外が揃っているか）。編集中の値をそのまま見るので、
  // 入力すると即座にボタンが有効になる。判定の正本は lib/publish-readiness.ts で、
  // サーバー側 requestPublishAction も同じ関数を使う。
  const requestReadiness = publishReadiness(watch());

  // 運営専用ステップ（3DGS・公開設定）はスタジオに出さない。
  // ⚠ STEPS の並び順がそのまま番号になるので、番号は配列から導出する
  //   （StepCard に直書きすると、ステップを1つ足すたび全部ズレる）。
  const visibleSteps = STEPS.filter((s) => !("admin" in s && s.admin) || isAdmin);
  const stepNo = (id: StepId) => {
    const i = visibleSteps.findIndex((s) => s.id === id);
    return String((i < 0 ? 0 : i) + 1).padStart(2, "0");
  };
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
        {/* 申請に必要な残り。どのステップにいても「あと何を埋めればいいか」が見える。
            判定は lib/publish-readiness.ts（申請アクションと同じ関数）。
            以前は申請ボタンを押すまで不足が分からなかった。 */}
        <div
          className={`mb-4 border px-3 py-2.5 ${
            requestReadiness.ready
              ? "border-green-400/40 bg-green-400/[0.06]"
              : "border-amber-400/40 bg-amber-400/[0.06]"
          }`}
        >
          <div className="mono text-[10px] tracking-[0.2em] uppercase opacity-70">
            申請に必要な項目
          </div>
          {requestReadiness.ready ? (
            <div className="text-[12px] text-green-400 mt-1">すべて入力済み</div>
          ) : (
            <>
              <div className="text-[12px] text-amber-400 mt-1">
                あと {requestReadiness.missing.length} 項目
              </div>
              <ul className="mt-1.5 space-y-0.5 text-[11px] text-muted leading-[1.6]">
                {requestReadiness.missing.map((m) => (
                  <li key={m}>・{m}</li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="mono text-[10px] tracking-[0.32em] uppercase opacity-60 mb-3">
          Steps
        </div>
        {visibleSteps.map((s, i) => (
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

        {/* 英語(EN)欄の表示切替。既定は畳んだ状態。 */}
        <button
          type="button"
          onClick={() => setShowEn((v) => !v)}
          aria-pressed={showEn}
          className={`block w-full text-left px-3 py-2.5 border transition mt-4 ${
            showEn
              ? "border-accent text-accent"
              : "border-line text-muted hover:text-ink hover:border-ink"
          }`}
        >
          <div className="text-[12px]">
            {showEn ? "英語(EN)欄を隠す" : "英語(EN)欄を編集する"}
          </div>
          <div className="mono text-[10px] opacity-60 mt-0.5">
            未記入でOK（公開時に運営が翻訳）
          </div>
        </button>
      </aside>

      {/* Form pane */}
      <div className="min-w-0">
        {/* Sticky header（公開URL も同じ枠に統合） */}
        <div className="sticky top-[calc(var(--header-h)/var(--z))] z-20 -mx-2 px-2 py-4 bg-bg/95 backdrop-blur border-b border-line mb-6 space-y-3">
          <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-baseline gap-3 min-w-0">
            <StatusPill status={currentStatus} />
            <div className="serif text-xl truncate">
              {currentTitle || "(無題)"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* mounted 前は空文字（SSR/初回クライアントとも同一）。マウント後に
                ローカル(JST)時刻を出す。savedAt/updatedAt は共にローカル整形のため
                SSR(UTC)と食い違い hydration mismatch を起こすので mounted でゲート。 */}
            {mounted && (savedAt || watch("updatedAt")) && (
              <span className="mono text-[10px] tracking-[0.2em] uppercase opacity-50">
                {savedAt
                  ? // ISO 文字列を slice すると UTC 時刻になり日本では9時間ズレる。
                    // 必ずローカル（JST）で整形する。
                    `Saved ${new Date(savedAt).toLocaleTimeString("ja-JP", { hour12: false })}`
                  : (() => {
                      const s = fmtLocalDateTime(watch("updatedAt"));
                      return s ? `Updated ${s}` : "";
                    })()
                }
              </span>
            )}
            {/* スクロール位置に関わらず常にアクセスできるページ全体プレビュー。
                このヘッダーは sticky（top-16）なので、ここに置けば下方向へ
                スクロールしても押せる。中身はパンくずの「プレビュー ↗」と
                同じ /admin/properties/[id]/preview（物件詳細ページの全体プレビュー）。
                以前ここにあった「3DGSプレビュー」（3DGSキャプチャのオーバーレイを
                開くボタン）は不要になったため撤去した。 */}
            <Link
              href={`/admin/properties/${initial.id}/preview`}
              target="_blank"
              className="px-4 py-2 mono text-[10px] tracking-[0.22em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition"
            >
              プレビュー ↗
            </Link>
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
              <>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={onPublish}
                    disabled={publishing}
                    className="px-5 py-2 mono text-[10px] tracking-[0.22em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition disabled:opacity-50"
                  >
                    {publishing ? "公開中…" : "公開する"}
                  </button>
                )}
                {!isAdmin && (
                  /* ⚠ ここでは申請を確定させない。掲載依頼フォームへ送り、
                     フォーム送信をもって申請確定とする（contact-actions.ts が
                     propertyId を受けて requestPublishAction を呼ぶ）。
                     理由: スキャンの希望日と当日の連絡先はこの画面に無く、
                     ボタン1つで申請させると運営が別途メールで聞き直すことになる。
                     また「押しただけで申請したつもり」の取りこぼしも防げる。 */
                  // ⚠ 3DGS以外が揃うまで申請させない。未入力のまま申請されると
                  //    運営は撮影前に不足項目を1件ずつ聞くことになり申請の意味が消える。
                  //    サーバー側 requestPublishAction も同じ publishReadiness で弾く（二重防御）。
                  requestReadiness.ready ? (
                    <Link
                      href={`/contact/listing?property=${encodeURIComponent(initial.id)}`}
                      className="mono text-[11px] tracking-[0.2em] uppercase border border-accent text-accent px-5 py-2.5 hover:bg-accent hover:text-bg transition inline-block"
                    >
                      公開を申請
                    </Link>
                  ) : (
                    <div className="text-right">
                      <span
                        aria-disabled="true"
                        title={`未入力: ${requestReadiness.missing.join("、")}`}
                        className="mono text-[11px] tracking-[0.2em] uppercase border border-line text-muted px-5 py-2.5 inline-block cursor-not-allowed"
                      >
                        公開を申請
                      </span>
                      <p className="mt-2 text-[11px] text-amber-400 leading-[1.7] max-w-[36ch] ml-auto">
                        申請には 3DGS 以外の入力が必要です。未入力:{" "}
                        <strong className="text-ink">{requestReadiness.missing.join("、")}</strong>
                      </p>
                    </div>
                  )
                )}
              </>
            )}
          </div>
          </div>

          {/* 公開URL（スラッグ）— 独立パネルではなくこの枠の2行目に統合 */}
          <div className="pt-3 border-t border-line">
            <SlugEditor id={initial.id} status={currentStatus} embedded isAdmin={isAdmin} />
          </div>

          {/* 物件⇄アカウントの紐付け（社内運用・admin専用）。studio側には
              見せる情報ではないので isAdmin のときだけ描画する。 */}
          {isAdmin && (
            <div className="pt-3 border-t border-line">
              <PropertyOwnerPanel propertyId={initial.id} />
            </div>
          )}
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
              n={stepNo("basic")}
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
              {showEn && (
                <Field label="物件名（英語・EN版で表示／未記入でOK）" error={formState.errors.titleEn?.message} hint="空欄のままで構いません。公開作業のときに運営側でAI翻訳して埋めます（内容は公開前に確認します）。">
                  <input
                    type="text"
                    {...register("titleEn")}
                    className={inputClass}
                    placeholder="e.g. Setagaya Cyc Studio — Large-span Cyclorama（空欄なら日本語名をそのまま表示）"
                  />
                </Field>
              )}

              <div className="grid md:grid-cols-2 gap-5">
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
              </div>


              <div className="flex items-center justify-between gap-3">
                <div className="mono text-[10px] tracking-[0.18em] uppercase opacity-60">
                  エリア / 座標
                </div>
                <button
                  type="button"
                  disabled={aiLocationLoading}
                  onClick={async () => {
                    setAiLocationError(null);
                    setAiLocationLoading(true);
                    try {
                      const d = getValues();
                      const res = await fetch("/api/admin/suggest-location", {
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
                        }),
                      });
                      const data = (await res.json()) as {
                        prefecture?: string;
                        city?: string;
                        area?: string;
                        coords?: { lat: number; lng: number };
                        error?: string;
                      };
                      if (!res.ok || !data.coords) {
                        setAiLocationError(data.error || "検索に失敗しました");
                        return;
                      }
                      if (data.prefecture) setValue("prefecture", data.prefecture, { shouldDirty: true });
                      if (data.city) setValue("city", data.city, { shouldDirty: true });
                      if (data.area) setValue("area", data.area, { shouldDirty: true });
                      setValue("coords", data.coords, { shouldDirty: true, shouldValidate: true });
                      triggerAutoSave();
                    } catch {
                      setAiLocationError("通信エラーが発生しました");
                    } finally {
                      setAiLocationLoading(false);
                    }
                  }}
                  className="mono text-[10px] tracking-[0.22em] uppercase border border-accent/50 text-accent px-3 py-1 hover:bg-accent hover:text-bg transition disabled:opacity-40 disabled:cursor-wait"
                >
                  {aiLocationLoading ? "検索中…" : "✦ 物件名からAIで検索"}
                </button>
              </div>
              {aiLocationError && (
                <p className="text-[12px] text-red-400 -mt-3">{aiLocationError}</p>
              )}

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
              {showEn && (
                <Field label="市区町村（英語・EN版で表示／未記入でOK）" hint="空欄のままで構いません。公開作業のときに運営側でAI翻訳して埋めます（内容は公開前に確認します）。">
                  <input
                    type="text"
                    {...register("cityEn")}
                    className={inputClass}
                    placeholder="e.g. Tsurumi, Yokohama（空欄なら日本語をそのまま表示。都道府県は自動でローマ字化）"
                  />
                </Field>
              )}

              <Field
                label="座標 (lat, lng) — 地図ピンと距離計算に使用"
                hint="上の「物件名からAIで検索」で自動取得できます。または下の欄に「日本の住所」「Google Maps の URL」「座標」のいずれかを貼り、解析でピン位置を取得。空欄でも下書き OK、公開時は地図に出ません。"
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
              {showEn && (
                <Field label="サマリー（英語・EN版で表示／未記入でOK）" error={formState.errors.summaryEn?.message} hint="空欄のままで構いません。公開作業のときに運営側でAI翻訳して埋めます（内容は公開前に確認します）。">
                  <textarea
                    rows={3}
                    {...register("summaryEn")}
                    className={inputClass}
                    placeholder="e.g. 5.4m ceilings, 25m-span cyclorama. Proven track record for commercials & music videos.（空欄なら日本語をそのまま表示）"
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
              )}

              {watch("permitRequired") && (
                <div className="border-t border-line pt-4 mt-4">
                  <div className="mono text-[10px] tracking-[0.28em] uppercase text-accent/80">
                    ● 施設所有者への問い合わせ不要（道路使用許可等が必要な公共スポットとして扱われます）
                  </div>
                  <p className="text-[11px] text-muted mt-1.5">
                    「許可・注意事項」は STEP 02（仕様・設備）に移動しました。
                    通常の時間貸しに戻すには、上の料金欄で「時間貸し」を選び直してください。
                  </p>
                </div>
              )}

              {/* ── 連絡先 ── */}
              <div className="border-t border-line pt-5 mt-4">
                <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-3">
                  スタジオ連絡先
                  {watch("permitRequired") && (
                    <span className="normal-case tracking-normal opacity-60">
                      {" "}（任意。公共スポットのため空欄でも公開できます）
                    </span>
                  )}
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
            <StepCard n={stepNo("specs")} title="仕様・設備" desc="広さ・電源・設備など、フィルター検索に使われる条件です。">
              {watch("priceType") !== "hourly" ? (
                <div className="border border-accent/40 bg-accent/5 px-4 py-4 space-y-4">
                  <div className="mono text-[10px] tracking-[0.28em] uppercase text-accent/80">
                    撮影許可 情報（レンタルスタジオ向け仕様は非表示中）
                  </div>
                  <p className="text-[11px] text-muted">
                    料金が「時間貸し」以外（撮影許可・無料）のため、天井高・電源仕様
                    などスタジオ向けの項目は非表示にしています。代わりに許可申請に関する情報を入力してください。
                  </p>
                  <Field
                    label="許可の種類"
                    hint="表示文言に使われます（例:「公園使用許可の申請が必要です」）。空なら「撮影許可」。"
                  >
                    <input
                      type="text"
                      list="permit-type-options"
                      {...register("permitType")}
                      className={inputClass}
                      placeholder="例: 道路使用許可"
                    />
                    <datalist id="permit-type-options">
                      <option value="道路使用許可" />
                      <option value="公園使用許可" />
                      <option value="施設利用許可" />
                      <option value="撮影許可" />
                    </datalist>
                  </Field>
                  <Field
                    label="許可・注意事項"
                    hint="例: スクランブル交差点など。道路使用許可の申請先・条件・注意点を記入"
                  >
                    <textarea
                      {...register("permitNotes")}
                      className={`${inputClass} resize-y min-h-[120px]`}
                      rows={5}
                      maxLength={1000}
                      placeholder="例: 撮影には所轄警察署への道路使用許可申請が必要です。申請先・必要日数・当日の交通規制・保険加入の要否などを記入してください。"
                    />
                  </Field>
                  {showEn && (
                    <Field
                      label="許可・注意事項（英語・EN版で表示／未記入でOK）"
                      hint="空欄のままで構いません。公開作業のときに運営側でAI翻訳して埋めます（内容は公開前に確認します）。"
                    >
                      <textarea
                        {...register("permitNotesEn")}
                        className={`${inputClass} resize-y min-h-[120px]`}
                        rows={5}
                        maxLength={2000}
                        placeholder="e.g. Filming requires a road-use permit application from the local police station..."
                      />
                    </Field>
                  )}
                </div>
              ) : (
                <>
                  <div className="grid md:grid-cols-3 gap-5">
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
                    <Toggle label="防音あり" register={register("soundproofing")} />
                    <Toggle label="インターネット" register={register("hasInternet")} />
                  </div>

                  <Field
                    label="駐車可能台数 (台)"
                    hint="駐車場が利用可能な場合の台数。0 = 未設定（詳細ページに出しません）。"
                  >
                    <input
                      type="number"
                      min={0}
                      {...register("parkingCapacity", { valueAsNumber: true })}
                      className={inputClass}
                      placeholder="例: 5"
                    />
                  </Field>
                </>
              )}

              {/* 住所・最寄り駅（料金形態に関わらず入力可。詳細ページ SPECS に表示） */}
              <div className="grid md:grid-cols-2 gap-5">
                <Field label="住所" hint="番地まで（任意）。詳細ページの SPECS に表示されます。">
                  <input
                    type="text"
                    {...register("address")}
                    className={inputClass}
                    placeholder="例: 東京都江東区有明2-9-2"
                  />
                </Field>
                <Field label="最寄り駅" hint="路線・駅名・徒歩分など（任意）。">
                  <input
                    type="text"
                    {...register("nearestStation")}
                    className={inputClass}
                    placeholder="例: ゆりかもめ 有明駅 徒歩3分"
                  />
                </Field>
              </div>
              <div className="grid md:grid-cols-2 gap-5">
                {showEn && (
                  <Field label="住所（英語・EN版で表示／未記入でOK）" hint="空欄のままで構いません。公開作業のときに運営側でAI翻訳して埋めます（内容は公開前に確認します）。">
                    <input
                      type="text"
                      {...register("addressEn")}
                      className={inputClass}
                      placeholder="e.g. 2-9-2 Ariake, Koto-ku, Tokyo（空欄なら日本語をそのまま表示）"
                    />
                  </Field>
                )}
                {showEn && (
                  <Field label="最寄り駅（英語・EN版で表示／未記入でOK）" hint="空欄のままで構いません。公開作業のときに運営側でAI翻訳して埋めます（内容は公開前に確認します）。">
                    <input
                      type="text"
                      {...register("nearestStationEn")}
                      className={inputClass}
                      placeholder="e.g. Yurikamome Ariake Sta., 3 min walk（空欄なら日本語をそのまま表示）"
                    />
                  </Field>
                )}
              </div>

            </StepCard>
          )}

          {step === "terms" && (
            <StepCard n={stepNo("terms")} title="利用条件" desc="撮影できる日・時間と、守っていただくルールです。">
              {/* ── アクセス・利用条件 ── */}
              <SectionHead title="アクセス・利用条件" hint="いつ・どこで撮影できるか。検索の絞り込みにも使われます。" />
              <div className="grid md:grid-cols-3 gap-5">
                <Field label="利用可能時間（補足）" hint="例: 24時間可（要相談）">
                  <input type="text" {...register("availableHours")} className={inputClass} placeholder="例: 24時間可（要相談）" />
                </Field>
                <Field label="撮影可能日" hint="例: 平日／土日祝（要相談）">
                  <input type="text" {...register("availableDays")} className={inputClass} placeholder="例: 平日／土日祝" />
                </Field>
                <Field label="申込期限（リードタイム）" hint="例: 1週間前">
                  <input type="text" {...register("bookingDeadline")} className={inputClass} placeholder="例: 1週間前" />
                </Field>
              </div>

              <div className="grid md:grid-cols-3 gap-5">
                <Field
                  label="利用可能な時間帯"
                  hint="開始〜終了を指定（例: 10:30〜19:00）。上の「利用可能時間（補足）」の自由記述とは別に、検索での絞り込みに使われます。"
                >
                  <div className="flex items-center gap-2.5 pt-1">
                    <input
                      type="time"
                      {...register("customHoursStart")}
                      className="border border-line rounded-md px-2.5 py-1.5 text-[13px]"
                    />
                    <span className="text-[12.5px] text-ink/50">〜</span>
                    <input
                      type="time"
                      {...register("customHoursEnd")}
                      className="border border-line rounded-md px-2.5 py-1.5 text-[13px]"
                    />
                    {(watch("customHoursStart") || watch("customHoursEnd")) && (
                      <button
                        type="button"
                        onClick={() => {
                          setValue("customHoursStart", "", { shouldDirty: true });
                          setValue("customHoursEnd", "", { shouldDirty: true });
                        }}
                        className="text-[11px] text-muted hover:text-ink underline"
                      >
                        クリア
                      </button>
                    )}
                  </div>
                </Field>
              </div>

              {/* ── 撮影条件（設備の有無） ── */}
              <SectionHead title="撮影条件（設備の有無）" hint="あるものだけチェック。無いものは空のままで構いません。" />
              <div className="grid md:grid-cols-3 gap-5">
                <Toggle label="火気使用 可" register={register("fireAllowed")} />
                <Toggle label="控室 あり" register={register("greenRoom")} />
                <Toggle label="トイレ あり" register={register("restroom")} />
                <Toggle label="空調 あり" register={register("airConditioning")} />
                <Toggle label="喫煙所 あり" register={register("smokingArea")} />
              </div>

              {/* ── ルール・規程 ── */}
              <SectionHead title="ルール・規程" hint="トラブルを防ぐための取り決め。空欄でも掲載できます。" />
              <div className="grid md:grid-cols-2 gap-5">
                <Field label="禁止事項" hint="複数行可">
                  <textarea {...register("prohibitedItems")} className={`${inputClass} resize-y min-h-[70px]`} rows={3} maxLength={1000} placeholder="例: 火気使用禁止／生活音より大きな音出し禁止" />
                </Field>
                <Field label="キャンセルポリシー" hint="複数行可">
                  <textarea {...register("cancellationPolicy")} className={`${inputClass} resize-y min-h-[70px]`} rows={3} maxLength={1000} placeholder="例: 7日前まで無料／前日50%／当日100%" />
                </Field>
              </div>
              <div className="grid md:grid-cols-2 gap-5">
                <Toggle label="保険加入 必須" register={register("insuranceRequired")} />
                <Toggle label="立ち会い 必須" register={register("attendanceRequired")} />
              </div>
            </StepCard>
          )}

          {step === "pricing" && (
            <StepCard n={stepNo("pricing")} title="料金" desc="貸し出しの料金と、別途かかる費用です。">
                <Field
                  label={
                    watch("priceType") === "flat"
                      ? "撮影許可費用 (¥)"
                      : watch("priceType") === "free"
                        ? "料金（無料のため入力不要）"
                        : "時間料金 (¥/hr)"
                  }
                  error={formState.errors.hourlyPrice?.message}
                  hint={
                    watch("priceType") === "flat"
                      ? watch("hourlyPrice") > 0
                        ? "時間に関わらず一定の金額（例: 道路使用許可の実費相当）"
                        : "0 のままだと金額を出さず「道路使用許可の申請が必要です」と表示されます（無料という意味にはなりません）"
                      : watch("priceType") === "free"
                        ? "「料金の性質」で無料を選択中のため 0 のままで構いません"
                        : undefined
                  }
                  required={watch("priceType") === "hourly"}
                >
                  <div className="flex gap-2">
                    <select
                      value={watch("priceType") || "hourly"}
                      onChange={(e) => {
                        const v = e.target.value as "hourly" | "flat" | "free";
                        setValue("priceType", v, { shouldDirty: true });
                        // 撮影許可/無料は「施設所有者への通常の問い合わせ先が無い
                        // 公共スポット」を前提にした料金モードなので、選ぶだけで
                        // permitRequired も連動させる（Step02 の仕様欄も切り替わる）。
                        setValue("permitRequired", v !== "hourly", { shouldDirty: true });
                        triggerAutoSave();
                      }}
                      className={`${inputClass.replace("w-full ", "")} shrink-0 w-[9.5rem]`}
                    >
                      {(["hourly", "flat", "free"] as const).map((t) => (
                        <option key={t} value={t} className="bg-bg">
                          {t === "hourly" ? "時間貸し" : t === "flat" ? "撮影許可" : "無料"}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      disabled={watch("priceType") === "free"}
                      placeholder={watch("priceType") === "free" ? "" : "金額を入力"}
                      {...register("hourlyPrice", { valueAsNumber: true })}
                      className={`${inputClass} flex-1 min-w-[7rem] disabled:opacity-40 disabled:cursor-not-allowed`}
                    />
                  </div>
                </Field>
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
              {/* ── 料金の内訳 ── */}
              <SectionHead title="料金の内訳" hint="上の料金に含まれないもの・条件つきのものをここに。" />
              <div className="grid md:grid-cols-2 gap-5">
                <Field label="最低利用時間 (h)" hint="0 = 設定なし">
                  <input type="number" min={0} {...register("minUsageHours", { valueAsNumber: true })} className={inputClass} placeholder="例: 2" />
                </Field>
                <Field label="ロケハン費" hint="例: 1.5hまで無料">
                  <input type="text" {...register("scoutingFee")} className={inputClass} placeholder="例: 1.5hまで無料" />
                </Field>
              </div>
              <Toggle label="表示金額は税込（オフ = 税別）" register={register("taxIncluded")} />
              <Field label="追加費用" hint="照明・音響・機材・ピアノ使用など別途かかる費用（複数行可）">
                <textarea {...register("extraFees")} className={`${inputClass} resize-y min-h-[70px]`} rows={3} maxLength={500} placeholder="例: ホール照明・音響 別途／ピアノ使用 別途" />
              </Field>

            </StepCard>
          )}

          {step === "features" && (
            <StepCard n={stepNo("features")} title="特徴・タグ" desc="検索でヒットしやすくなる情報です。任意ですが、埋めるほど見つけてもらえます。">

              {/* ── 実績・特徴 ── */}
              <SectionHead title="実績・特徴" hint="「どんな画が撮れるか」が伝わる情報。検索でも効きます。" />
              <Field label="撮影実績" hint="例: MV／映画／ドラマ／CM">
                <input type="text" {...register("shootingHistory")} className={inputClass} placeholder="例: MV／映画／ドラマ／CM" />
              </Field>
              <Field label="撮影できるシーン・空間" hint="複数行可。例: 教室、屋上、図書館、ホール、中庭円形ステージ">
                <textarea {...register("availableScenes")} className={`${inputClass} resize-y min-h-[70px]`} rows={3} maxLength={500} placeholder="例: 教室、屋上、図書館、ホール、中庭円形ステージ" />
              </Field>
              <div className="grid md:grid-cols-3 gap-5">
                <Field label="内装・素材" hint="床/壁の素材・色">
                  <input type="text" {...register("interiorNotes")} className={inputClass} placeholder="例: 木床・白壁" />
                </Field>
                <Field label="自然光の方角" hint="例: 南向き大窓、午前順光">
                  <input type="text" {...register("lightDirection")} className={inputClass} placeholder="例: 南向き大窓" />
                </Field>
                <Field label="周辺環境" hint="例: 湾岸の再開発エリア">
                  <input type="text" {...register("surroundings")} className={inputClass} placeholder="例: 湾岸の再開発エリア" />
                </Field>
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
            </StepCard>
          )}

          {step === "plans" && (
            <StepCard n={stepNo("plans")} title="図面 / フロアプラン" desc="平面図・断面図など（PDF / 画像）。任意です。">

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
                          onClick={() => {
                            const url = watch(`blueprints.${idx}.url`);
                            blueprintsArray.remove(idx);
                            if (url) cleanupReplacedFileAction(initial.id, url).catch(() => {});
                          }}
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
                            onClick={() => {
                              const url = watch(`blueprints.${idx}.url`);
                              setValue(`blueprints.${idx}.url`, "", { shouldDirty: true });
                              if (url) cleanupReplacedFileAction(initial.id, url).catch(() => {});
                            }}
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
              n={stepNo("description")}
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
              </Field>
              {showEn && (
                <Field label="本文（英語・EN版で表示／未記入でOK）" hint="空欄のままで構いません。公開作業のときに運営側でAI翻訳して埋めます（内容は公開前に確認します）。">
                  <textarea
                    rows={10}
                    {...register("descriptionEn")}
                    className={inputClass + " font-sans leading-[1.85]"}
                    placeholder="English description shown on the /en version.（空欄なら日本語をそのまま表示）"
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
              )}

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
              n={stepNo("photos")}
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
                    const prevSrc = getValues("cover.src");
                    setValue("cover.src", a.url, { shouldDirty: true, shouldValidate: true });
                    if (prevSrc && prevSrc !== a.url) cleanupReplacedFileAction(initial.id, prevSrc).catch(() => {});
                    setValue("cover.alt", a.label, { shouldDirty: true });
                    if (a.width) setValue("cover.width", a.width, { shouldDirty: true });
                    if (a.height) setValue("cover.height", a.height, { shouldDirty: true });
                  } else if (pickImageFor === "gallery") {
                    galleryArray.append({
                      src: a.url,
                      alt: a.label,
                      altEn: "",
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
                        const prevSrc = getValues("cover.src");
                        setValue("cover.src", "", { shouldDirty: true });
                        setValue("cover.alt", "", { shouldDirty: true });
                        if (prevSrc) cleanupReplacedFileAction(initial.id, prevSrc).catch(() => {});
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
                          onClick={() => {
                            const src = watch(`gallery.${i}.src`);
                            galleryArray.remove(i);
                            if (src) cleanupReplacedFileAction(initial.id, src).catch(() => {});
                          }}
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
                      altEn: "",
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
              n={stepNo("splat")}
              title="3DGS データ"
              desc="3DGSファイルをアップロード。駐車場・1F・2F等フロア別に複数登録できます。"
            >
              {!isAdmin && (
                <div className="border border-accent/40 bg-accent/10 px-4 py-3 mb-5 text-[12.5px] leading-[1.85]">
                  3Dデータは運営が撮影後に差し込みます。<br />
                  この項目の入力は不要です（内容の確認のみ行えます）。
                </div>
              )}
              <fieldset disabled={!isAdmin} className="contents">
              {/* ── 3DGS アイテム (複数・ラベル付き) ── */}
              <div className="mt-4">
                <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60">
                      3DGS データ（フロア・区画別）
                    </div>
                    {/* 動画生成のウォームアップ+3秒トグル。重いシーンでプレビュー
                        動画がボケる時にON（録画前に画質を乗り切らせる）。 */}
                    <label className="flex items-center gap-1.5 text-[11px] text-ink/70 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={warmupPlus3}
                        onChange={(e) => setWarmupPlus3(e.target.checked)}
                        className="accent-accent"
                      />
                      ウォームアップ +3秒（重いシーンのボケ対策）
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      splatItemsArray.append({ id: crypto.randomUUID(), label: "", labelEn: "", splatUrl: "", previewVideoUrl: "", sizeMb: 0, notes: "", forSale: false, salePrice: 0, freePeriod: { enabled: false, startAt: null, endAt: null, note: "", afterEnd: "revert_to_price" as const }, saleDescription: "", saleDescriptionEn: "", accessLevel: "public" as const, downloadFileUrl: "", downloadFileSizeMb: 0, downloadFileFormat: "PLY & OBJ (ZIP)", downloadFiles: [], captureDevice: "Portalcam", license: "standard" as const, licenseOptions: [], editorialRightsCredit: "", downloadVersions: [] });
                      // 追加した行はすぐ入力するので開いておく。
                      const added = getValues("splatItems");
                      const last = added[added.length - 1];
                      if (last) setSplatOpen((m) => ({ ...m, [last.id]: true }));
                    }}
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
                            const item = getValues(`splatItems.${idx}`);
                            splatItemsArray.remove(idx);
                            if (previewItemIdx === idx) setPreviewItemIdx(null);
                            const urls = [
                              item.splatUrl,
                              item.previewVideoUrl,
                              item.downloadFileUrl,
                              ...(item.downloadFiles ?? []).map((f) => f.url),
                            ].filter(Boolean) as string[];
                            for (const url of urls) {
                              cleanupReplacedFileAction(initial.id, url).catch(() => {});
                            }
                          }}
                          className="mono text-[10px] text-muted hover:text-red-400 transition px-2"
                        >
                          削除
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSplatOpen((m) => ({ ...m, [field.id]: !m[field.id] }))
                          }
                          aria-expanded={!!splatOpen[field.id]}
                          className="mono text-[10px] tracking-[0.18em] uppercase border border-line px-3 py-1.5 text-muted hover:text-accent hover:border-accent transition shrink-0"
                        >
                          {splatOpen[field.id] ? "閉じる" : "開く"}
                        </button>
                      </div>

                      {/* ⚠ 本体は既定で畳む。ファイル数に比例して伸び、3件で5000pxを超える。
                          開いている行だけ詳細を出す（開閉状態は splatOpen で行ID別に保持）。 */}
                      {!splatOpen[field.id] ? (
                        <div className="mono text-[10px] text-muted flex items-center gap-3 flex-wrap">
                          <span>{watch(`splatItems.${idx}.splatUrl`) ? "● データあり" : "○ 未アップロード"}</span>
                          {watch(`splatItems.${idx}.forSale`) && <span className="text-accent">販売中</span>}
                          <span className="opacity-60">{watch(`splatItems.${idx}.sizeMb`) ? `${watch(`splatItems.${idx}.sizeMb`)} MB` : ""}</span>
                        </div>
                      ) : (
                      <>

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
                          {/* 再撮影/動画生成ボタンの表示条件は「行ごと」に判定する。
                              以前は `capture.state === "idle"` というグローバル状態で
                              ゲートしていたため、いずれかの行で 1 度キャプチャすると
                              state が "done"/"error" のまま idle に戻らず、全行から
                              ボタンが消えて他の 3DGS を再撮影できなくなっていた。
                              → 「この行で今まさにキャプチャ実行中」のときだけ隠す。
                                 他行は常に表示し、実行中なら startCapture がキューへ積む。 */}
                          {watch(`splatItems.${idx}.splatUrl`) &&
                            !(
                              capture.capturedIdx === idx &&
                              (capture.state === "loading" ||
                                capture.state === "recording" ||
                                capture.state === "uploading")
                            ) && (
                            <button
                              type="button"
                              onClick={() => capture.startCapture(watch(`splatItems.${idx}.splatUrl`), initial.id, idx, captureWarmupMs)}
                              className="mono text-[10px] tracking-[0.22em] uppercase border border-line px-3 py-1.5 hover:border-accent hover:text-accent transition"
                            >
                              {watch(`splatItems.${idx}.previewVideoUrl`) ? "再撮影" : "動画生成"}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              const prevUrl = getValues(`splatItems.${idx}.splatUrl`);
                              setValue(`splatItems.${idx}.splatUrl`, "", { shouldDirty: true });
                              setValue(`splatItems.${idx}.sizeMb`, 0, { shouldDirty: true });
                              if (previewItemIdx === idx) setPreviewItemIdx(null);
                              if (prevUrl) cleanupReplacedFileAction(initial.id, prevUrl).catch(() => {});
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
                            capture.startCapture(uploadedUrl, initial.id, idx, captureWarmupMs);
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
                              label="デフォルト価格 (税込・円)"
                              hint="下の「複数ライセンス販売」が未設定の場合に使われる価格。"
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
                            {showEn && (
                              <Field label="販売説明文（英語・EN版で表示／未記入でOK）" hint="空欄のままで構いません。公開作業のときに運営側でAI翻訳して埋めます（内容は公開前に確認します）。">
                                <textarea
                                  {...register(`splatItems.${idx}.saleDescriptionEn`)}
                                  className={inputClass}
                                  rows={2}
                                  maxLength={2000}
                                  placeholder="e.g. High-detail 3DGS data. Commercial use allowed.（空欄なら日本語をそのまま表示）"
                                />
                              </Field>
                            )}

                            <FreePeriodItemEditor
                              value={watch(`splatItems.${idx}.freePeriod`)}
                              onChange={(v) => setValue(`splatItems.${idx}.freePeriod`, v, { shouldDirty: true })}
                            />

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
                                      const prevUrl = getValues(`splatItems.${idx}.downloadFileUrl`);
                                      setValue(`splatItems.${idx}.downloadFileUrl`, "", { shouldDirty: true });
                                      setValue(`splatItems.${idx}.downloadFileSizeMb`, 0, { shouldDirty: true });
                                      if (prevUrl) cleanupReplacedFileAction(initial.id, prevUrl).catch(() => {});
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

                            {/* ── 日付別バージョン管理（再スキャン等の更新履歴） ── */}
                            <DownloadVersionsEditor
                              control={control}
                              register={register}
                              setValue={setValue}
                              watch={watch}
                              propertyId={initial.id}
                              idx={idx}
                            />

                            {/* ── 商品スペック ── */}
                            <div className="grid sm:grid-cols-2 gap-3">
                              <Field label="データ容量（スペック表示）" hint="アップロード時のファイルサイズから自動表示（編集不可）。旧・点群数は参考にならないため撤去。">
                                <div className={inputClass + " flex items-center gap-2 opacity-80"}>
                                  <span>3DGS {watch(`splatItems.${idx}.sizeMb`) || 0} MB</span>
                                  {!!watch(`splatItems.${idx}.downloadFileSizeMb`) && (
                                    <span className="text-muted">
                                      ／ DL {watch(`splatItems.${idx}.downloadFileSizeMb`)} MB
                                    </span>
                                  )}
                                </div>
                              </Field>
                              <Field label="撮影機材">
                                {(() => {
                                  const current = watch(`splatItems.${idx}.captureDevice`) || "";
                                  // 既存データがプルダウンの2択以外の値を持っていた場合
                                  // (例: 旧「自由入力」時代のレコード)、選択肢から消えて
                                  // 保存時に値が意図せず書き換わらないよう、その値も
                                  // 選択肢として保持する（プルダウン化に伴うデータ破壊防止）。
                                  const options =
                                    current && !CAPTURE_DEVICE_OPTIONS.includes(current as never)
                                      ? [...CAPTURE_DEVICE_OPTIONS, current]
                                      : CAPTURE_DEVICE_OPTIONS;
                                  return (
                                    <select
                                      {...register(`splatItems.${idx}.captureDevice`)}
                                      className={inputClass}
                                    >
                                      <option value="">— 選択 —</option>
                                      {options.map((o) => (
                                        <option key={o} value={o}>
                                          {o}
                                        </option>
                                      ))}
                                    </select>
                                  );
                                })()}
                              </Field>
                            </div>

                            {/* ── ライセンス ── */}
                            <Field
                              label="デフォルトライセンス区分"
                              hint="下の「複数ライセンス販売」が未設定の場合に使われる区分。エディトリアル限定は新規販売不可のため選択肢から除外（既存で選択中の物件のみ表示・変更可）。"
                            >
                              <select
                                {...register(`splatItems.${idx}.license`)}
                                className={inputClass}
                              >
                                {DATA_LICENSES
                                  // エディトリアルは新規選択不可。ただし既存でこの物件に設定済みなら
                                  // 選択肢として残す（保存中に無言で他の区分へ化けるのを防ぐ）。
                                  .filter((l) => l !== "editorial" || watch(`splatItems.${idx}.license`) === "editorial")
                                  .map((l) => (
                                    <option key={l} value={l} className="bg-bg">
                                      {DATA_LICENSE_LABEL[l]} — {l === "editorial" ? "販売終了（新規選択不可）" : DATA_LICENSE_DESC[l]}
                                    </option>
                                  ))}
                              </select>
                            </Field>
                            {watch(`splatItems.${idx}.license`) === "editorial" &&
                              (watch(`splatItems.${idx}.licenseOptions`) || []).length === 0 && (
                                <Field
                                  label="権利表記（エディトリアル利用時・公開に必須）"
                                  hint="ニュース・報道等での利用に必要な権利者クレジット表記。例:「Photo: ロケハン3D」「© 渋谷区」等。"
                                >
                                  <input
                                    {...register(`splatItems.${idx}.editorialRightsCredit`)}
                                    className={inputClass}
                                    placeholder="例: Photo courtesy of ロケハン3D"
                                  />
                                </Field>
                              )}

                            {/* ── 複数ライセンス販売（任意・価格をライセンスごとに調整） ── */}
                            <Field
                              label="複数ライセンス販売（任意）"
                              hint="1つ以上チェックすると、購入者はここから選んで購入するようになります（上のデフォルト価格/区分より優先）。ライセンスごとに価格を変えられます。"
                            >
                              <LicenseOptionsEditor idx={idx} watch={watch} setValue={setValue} />
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
                      </>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              </fieldset>
            </StepCard>
          )}

          {step === "splatMeta" && (
            <StepCard
              n={stepNo("splatMeta")}
              title="3DGS 注釈・メタ"
              desc="スキャン条件の記録と、集計に使う分類です。運営専用。"
            >
              <fieldset disabled={!isAdmin} className="contents">
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
                      {mounted ? (fmtLocalDateTime(watch("splatDataUpdatedAt")) || "—") : "—"}
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
                    {([1, 2, 3, 5] as const).map((n) => (
                      <option key={n} value={n} className="bg-bg">
                        {n} トークン — {TOKEN_COST_LABEL[n]}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field
                  label="空間の複雑さ（社内分析用・公開されません）"
                  hint="判定軸は「3Dが、この物件の写真＋図面に勝つか」。広さ(トークンコスト)とは別軸で、小さくても多部屋なら複雑、広くても白ホリ単室なら単純。どの空間タイプが実際に見られたかを後から集計するために記録します。"
                >
                  <select {...register("spatialComplexity")} className={inputClass}>
                    <option value="unset" className="bg-bg">未分類</option>
                    <option value="complex" className="bg-bg">
                      複雑 — 多部屋ハウス・特殊内装・複雑構造（3Dが効く）
                    </option>
                    <option value="simple" className="bg-bg">
                      単純 — 白ホリ等の単室（写真＋図面でほぼ足りる）
                    </option>
                  </select>
                </Field>
              </div>

              {/* Data sale fields are now per-splatItem (forSale/salePrice/saleDescription) */}
              </fieldset>
            </StepCard>
          )}

          {step === "publish" && (
            <StepCard
              n={stepNo("publish")}
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
                      {mounted ? (fmtLocalDateTime(watch("createdAt")) || "—") : "—"}
                    </dd>
                    <dt className="mono text-[10px] tracking-[0.22em] uppercase opacity-50">最終更新</dt>
                    <dd className="mono text-[11px]">
                      {mounted ? (fmtLocalDateTime(watch("updatedAt")) || "—") : "—"}
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
                  {/* 完全削除は deleteAction=requireAdmin。studio に見せると押した瞬間
                      redirect("/") でページごと追い出される（3df0885 と同じ事故クラス）
                      うえ、そもそも削除は誤操作の被害が大きく admin 専任の方針。 */}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={onDelete}
                      className="mono text-[10px] tracking-[0.22em] uppercase border border-accent text-accent px-4 py-2 hover:bg-accent hover:text-bg transition"
                    >
                      完全削除
                    </button>
                  )}
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

/** 撮影機材のプルダウン選択肢。自由入力は無し（固定2択）。 */
const CAPTURE_DEVICE_OPTIONS = ["Portalcam", "A7III"] as const;

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
                onClick={() => {
                  fa.remove(fi);
                  if (url) cleanupReplacedFileAction(propertyId, url).catch(() => {});
                }}
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
                    if (url) cleanupReplacedFileAction(propertyId, url).catch(() => {});
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

/**
 * 日付別バージョン管理（再スキャン等で一括ダウンロードZIPが更新された場合の
 * 履歴）。DownloadFilesEditor と同じ構造だが、区別軸が「形式」ではなく「日付」。
 * 価格差が無いため、購入者は購入履歴ページでどの日付でも自由にダウンロード
 * できる（ライセンスのような購入時の選択は不要）。
 */
function DownloadVersionsEditor({
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
  const fa = useFieldArray({ control, name: `splatItems.${idx}.downloadVersions` });
  return (
    <div className="border border-dashed border-accent/30 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="mono text-[11px] font-semibold tracking-[0.18em] uppercase text-accent">
          日付別バージョン管理（任意）
        </div>
        <button
          type="button"
          onClick={() => fa.append({ date: "", url: "", sizeMb: 0 })}
          className="mono text-[10px] tracking-[0.22em] uppercase border border-line px-2 py-1 hover:border-accent hover:text-accent transition"
        >
          + 日付を追加
        </button>
      </div>
      <p className="text-[10px] text-muted">
        再スキャン等で一括ダウンロードZIPが更新された場合、旧バージョンを残したまま新しい日付のファイルを追加できます。
        購入者は購入履歴ページでどの日付のバージョンでも自由にダウンロード可能です。空欄なら上の単一ファイル(
        {watch("scannedAt") || "スキャン日未設定"}
        )を1バージョンとして使用。
      </p>
      {fa.fields.map((f, fi) => {
        const url = watch(`splatItems.${idx}.downloadVersions.${fi}.url`);
        const size = watch(`splatItems.${idx}.downloadVersions.${fi}.sizeMb`);
        return (
          <div key={f.id} className="border border-line p-2 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                {...register(`splatItems.${idx}.downloadVersions.${fi}.date`)}
                placeholder="YYYY-MM-DD"
                className={inputClass + " flex-1 min-w-[110px]"}
              />
              <input
                type="number"
                {...register(`splatItems.${idx}.downloadVersions.${fi}.sizeMb`, { valueAsNumber: true })}
                placeholder="MB"
                className={inputClass + " w-24"}
              />
              <button
                type="button"
                onClick={() => {
                  fa.remove(fi);
                  if (url) cleanupReplacedFileAction(propertyId, url).catch(() => {});
                }}
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
                    setValue(`splatItems.${idx}.downloadVersions.${fi}.url`, "", { shouldDirty: true });
                    setValue(`splatItems.${idx}.downloadVersions.${fi}.sizeMb`, 0, { shouldDirty: true });
                    if (url) cleanupReplacedFileAction(propertyId, url).catch(() => {});
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
                label="この日付のファイルをアップロード"
                hint="全形式まとめZIP等 — 20 GB まで"
                onUploaded={(file) => {
                  setValue(
                    `splatItems.${idx}.downloadVersions.${fi}.url`,
                    new URL(file.url, window.location.origin).toString(),
                    { shouldDirty: true, shouldValidate: true },
                  );
                  setValue(
                    `splatItems.${idx}.downloadVersions.${fi}.sizeMb`,
                    Math.max(1, Math.round(file.size / 1024 / 1024)),
                    { shouldDirty: true },
                  );
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

/**
 * ステップ内のセクション見出し。
 *
 * ⚠ 以前は 10px のシアン文字を1行置くだけで、罫線も余白もなかった。
 *   長いステップ（旧「仕様・設備」は3590px）の中で境目がまったく見えず、
 *   「どこからどこまでが同じ話か」が分からない状態だった（2026-07-30 の指摘）。
 *   上罫線＋見出し＋任意の補足で、スクロール中でも切れ目が分かるようにする。
 */
function SectionHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="pt-6 mt-2 border-t border-line">
      <div className="mono text-[10px] tracking-[0.28em] uppercase text-accent">
        {title}
      </div>
      {hint && (
        <p className="text-[11px] text-muted mt-1 leading-[1.7]">{hint}</p>
      )}
    </div>
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
    {
      ok: data.permitRequired || data.hourlyPrice > 0,
      label: data.permitRequired ? "料金（許可制のため入力不要）" : "料金 (0 円以上)",
    },
    {
      ok: !!data.cover.src && (/^https?:\/\//.test(data.cover.src) || data.cover.src.startsWith("/")),
      label: "カバー画像 URL",
    },
    {
      ok:
        (!!data.splatUrl && (/^https?:\/\//.test(data.splatUrl) || data.splatUrl.startsWith("/"))) ||
        (data.splatItems ?? []).some(
          (it) => !!it.splatUrl && (/^https?:\/\//.test(it.splatUrl) || it.splatUrl.startsWith("/")),
        ),
      label: "3DGS データ",
    },
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

// DATA_SALE_PRICE の規模別推奨価格と揃えておくプリセット一覧。
// 0 = 無料配布（会員登録さえすればダウンロード可、Stripe を経由せず即時完了）。
const SALE_PRICE_PRESETS = [0, 50000, 100000, 150000, 200000, 250000, 300000, 500000] as const;

/**
 * 販売ライセンスの複数選択エディタ。ライセンス区分ごとにチェックボックスで
 * 有効/無効、有効な区分には価格入力(SalePriceInput)を表示する。
 * downloadFiles(マルチ形式ダウンロード)と同じ「配列を直接 setValue で
 * 追加/削除」パターン。空配列のまま保存すると、購入APIは resolveLicenseOptions()
 * によりレガシー単一フィールド(splatItems.${idx}.license/salePrice)へ自動
 * フォールバックするため、少なくとも内部的には壊れないが、UI上は1つ以上の
 * 選択を促す。
 */
function LicenseOptionsEditor({
  idx,
  watch,
  setValue,
}: {
  idx: number;
  watch: UseFormWatch<Property>;
  setValue: UseFormSetValue<Property>;
}) {
  const options = watch(`splatItems.${idx}.licenseOptions`) || [];

  const toggle = (license: DataLicense, checked: boolean) => {
    const next = checked
      ? [...options, { license, price: 0 }]
      : options.filter((o) => o.license !== license);
    setValue(`splatItems.${idx}.licenseOptions`, next, { shouldDirty: true });
  };

  const setPrice = (license: DataLicense, price: number) => {
    setValue(
      `splatItems.${idx}.licenseOptions`,
      options.map((o) => (o.license === license ? { ...o, price } : o)),
      { shouldDirty: true },
    );
  };

  const hasEditorial = options.some((o) => o.license === "editorial");

  return (
    <div className="space-y-3">
      {DATA_LICENSES.map((license) => {
        const opt = options.find((o) => o.license === license);
        // エディトリアル限定は新規販売不可（方針転換）。既存で選択済みの物件は
        // 表示・チェック解除はできるが、未選択の物件で新たにチェックはできない
        // ようにする（買い手側は resolveLicenseOptions() で二重に遮断済み）。
        const discontinued = license === "editorial";
        const lockedOff = discontinued && !opt;
        return (
          <div key={license} className="flex flex-wrap items-start gap-3 border-b border-line/30 pb-2.5 last:border-0 last:pb-0">
            <label className={`flex items-start gap-2.5 min-w-[240px] flex-1 ${lockedOff ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
              <input
                type="checkbox"
                checked={!!opt}
                disabled={lockedOff}
                onChange={(e) => toggle(license, e.target.checked)}
                className="w-4 h-4 accent-accent mt-0.5 shrink-0"
              />
              <span>
                <span className="text-[12.5px] font-medium block">
                  {DATA_LICENSE_LABEL[license]}
                  {discontinued && (
                    <span className="ml-1.5 text-[10px] mono uppercase tracking-[0.1em] text-red-400">
                      販売終了（新規選択不可）
                    </span>
                  )}
                </span>
                <span className="text-[10.5px] text-muted">{DATA_LICENSE_DESC[license]}</span>
              </span>
            </label>
            {opt && (
              <SalePriceInput
                value={opt.price}
                onChange={(v) => setPrice(license, v)}
              />
            )}
          </div>
        );
      })}
      {hasEditorial && (
        <Field
          label="権利表記（エディトリアル利用時・公開に必須）"
          hint="ニュース・報道等での利用に必要な権利者クレジット表記。例:「Photo: ロケハン3D」「© 渋谷区」等。"
        >
          <input
            value={watch(`splatItems.${idx}.editorialRightsCredit`) || ""}
            onChange={(e) =>
              setValue(`splatItems.${idx}.editorialRightsCredit`, e.target.value, { shouldDirty: true })
            }
            className="w-full bg-white text-[#111] border border-neutral-300 px-3 py-2.5 text-[15px] font-medium focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/25 transition mono placeholder:text-[#9aa0a6] placeholder:font-normal"
            placeholder="例: Photo courtesy of ロケハン3D"
          />
        </Field>
      )}
      {options.length === 0 && (
        <p className="text-[11px] text-muted">
          未選択の場合、上の「デフォルト価格・デフォルトライセンス区分」がそのまま使われます。
        </p>
      )}
    </div>
  );
}

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
            {p === 0 ? "無料（¥0・要ログイン）" : `¥${p.toLocaleString()}`}
          </option>
        ))}
        <option value="__custom__">カスタム金額</option>
      </select>
      {mode === "custom" && (
        <input
          type="number"
          value={value ?? ""}
          // min={0} はHTML上のヒントに過ぎず負数の入力自体は防げない。
          // クランプしないと保存時に propertySchema の salePrice.min(0) で
          // 弾かれ、生のZodエラーがそのまま表示される事故になる。
          onChange={(e) => onChange(Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
          className={inputClass + " max-w-[180px]"}
          min={0}
          placeholder="金額を入力"
        />
      )}
    </div>
  );
}

/** ISO → "YYYY-MM-DD"（JST日付）。無料期間の日付入力プリフィル用。 */
function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const jst = new Date(d.getTime() + 9 * 3600 * 1000);
  return jst.toISOString().slice(0, 10);
}

const FREE_PERIOD_STATUS_LABEL: Record<"off" | "pending" | "active" | "concluded", string> = {
  off: "無効",
  pending: "開始待ち",
  active: "実施中（¥0）",
  concluded: "終了済み",
};

/**
 * 3Dデータ販売の限定無料期間 — 物件単位ではなく**3DGSアイテム単位**の設定
 * （旧: admin/gift-codes の全物件共通トグル。同一物件内でもデータごとに
 * キャンペーン時期が違うケースに対応するため、アイテムごとに持つ設計へ変更）。
 * チェックを入れると設定パネルが開く。日付は JST の日付として解釈し、
 * settings-actions.ts の旧実装と同じ T00:00:00+09:00 / T23:59:59+09:00 の
 * アンカリングで ISO に変換する。
 */
function FreePeriodItemEditor({
  value,
  onChange,
}: {
  value: DataSaleFreePeriod;
  onChange: (v: DataSaleFreePeriod) => void;
}) {
  // ここも hydration mismatch 回避のため、現在時刻ベースの状態表示は
  // マウント後のみ描画する（fmtLocalDateTime 等と同じ理由・上のコメント参照）。
  const [mounted, setMounted] = useState(false);
  // ⚠ react-hooks/set-state-in-effect はここでは誤検知。
  //    現在時刻に依存する表示をサーバー描画と一致させられないため、
  //    マウント後にだけ描画する。この setState は effect にしか置けない。
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const v = value ?? { enabled: false, startAt: null, endAt: null, note: "", afterEnd: "revert_to_price" as const };
  const status = mounted ? dataSalePeriodStatus(v, new Date().toISOString()) : null;

  return (
    <div className="border-t border-line/40 pt-3 mt-3">
      <label className="flex items-center gap-3 cursor-pointer mb-3">
        <input
          type="checkbox"
          checked={v.enabled}
          onChange={(e) => onChange({ ...v, enabled: e.target.checked })}
          className="w-4 h-4 accent-accent"
        />
        <span className="text-[11px] mono tracking-[0.14em] uppercase opacity-70">
          このデータの限定無料期間を有効にする
        </span>
        {mounted && v.enabled && status && (
          <span
            className={`mono text-[9px] tracking-[0.14em] uppercase border px-1.5 py-0.5 ${
              status === "active"
                ? "border-green-400/40 text-green-400"
                : status === "concluded"
                  ? "border-amber-400/40 text-amber-400"
                  : "border-line text-muted"
            }`}
          >
            {FREE_PERIOD_STATUS_LABEL[status]}
          </span>
        )}
      </label>

      {v.enabled && (
        <div className="space-y-3 pl-7">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="開始日（任意・空＝即時）" hint="">
              <input
                type="date"
                value={toDateInputValue(v.startAt)}
                onChange={(e) => {
                  const raw = e.target.value;
                  onChange({ ...v, startAt: raw ? new Date(`${raw}T00:00:00+09:00`).toISOString() : null });
                }}
                className={inputClass}
              />
            </Field>
            <Field label="終了日（任意・空＝無期限）" hint="">
              <input
                type="date"
                value={toDateInputValue(v.endAt)}
                onChange={(e) => {
                  const raw = e.target.value;
                  onChange({ ...v, endAt: raw ? new Date(`${raw}T23:59:59+09:00`).toISOString() : null });
                }}
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="終了日を過ぎたらどうする？" hint="終了日を設定していない場合はこの項目は使われません（無期限に無料のまま）。">
            <select
              value={v.afterEnd}
              onChange={(e) => onChange({ ...v, afterEnd: e.target.value as DataSaleFreePeriod["afterEnd"] })}
              className={inputClass}
            >
              {AFTER_FREE_PERIOD_ACTIONS.map((a) => (
                <option key={a} value={a}>{AFTER_FREE_PERIOD_LABEL[a]}</option>
              ))}
            </select>
          </Field>
          <Field label="メモ（任意・キャンペーン名など）" hint="">
            <input
              type="text"
              value={v.note}
              maxLength={200}
              onChange={(e) => onChange({ ...v, note: e.target.value })}
              className={inputClass}
              placeholder="例: ローンチ記念 このデータのみ無料"
            />
          </Field>
        </div>
      )}
    </div>
  );
}

// ISO文字列をローカル(JST)の "YYYY-MM-DD HH:mm" に整形する。
// getHours() 等はローカルTZ依存なので、必ずクライアント側マウント後にのみ呼ぶこと
// （SSRのUTC結果と食い違うと hydration mismatch=React #418 になる）。
function fmtLocalDateTime(dt: string | undefined | null): string {
  if (!dt) return "";
  try {
    const d = new Date(dt);
    if (Number.isNaN(d.getTime())) return String(dt);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return String(dt);
  }
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
  const priceType = String(d.priceType || "hourly");
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
  if (priceType === "free") {
    lines.push("【料金目安】");
    lines.push("使用料無料。");
    lines.push("");
  } else if (priceType === "flat") {
    if (hourlyPrice > 0) {
      lines.push("【料金目安】");
      lines.push(`撮影許可 ¥${hourlyPrice.toLocaleString()}（時間に関わらず一定）`);
      lines.push("");
    }
  } else if (hourlyPrice > 0 || dailyPrice > 0) {
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
