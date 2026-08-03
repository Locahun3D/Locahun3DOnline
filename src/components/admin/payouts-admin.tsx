"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  savePayeeAction,
  getPayoutSplitAction,
  savePayoutSplitAction,
  createSettlementAction,
  markSettlementPaidAction,
  findMissingAccrualsAction,
  recordMissingAccrualAction,
  recordAllMissingAccrualsAction,
  type SavePayeeState,
} from "@/app/admin/payouts/_actions";
import type {
  Payee,
  PayoutSplit,
  PayoutSplitLine,
  PayoutRole,
  PayoutSettlement,
  MissingAccrual,
} from "@/lib/payouts";

/**
 * 収益分配・精算の管理UI（受取者/分配設定/精算の3タブ）。
 *
 * ⚠ payouts.ts は "server-only" に依存するため、ここでは型のみ
 * (`import type`) を取り込む。ラベル定数はクライアントで完結するよう
 * このファイル内に複製する（isolatedModules で type-only import は実行時
 * コードを含まないため、これでクライアントバンドルは壊れない）。
 */

const PAYEE_KIND_OPTIONS = [
  { value: "scanner", label: "撮影者" },
  { value: "venue", label: "施設" },
] as const;

const ENTITY_TYPE_OPTIONS = [
  { value: "individual", label: "個人" },
  { value: "corporation", label: "法人" },
] as const;

const BANK_ACCOUNT_TYPE_OPTIONS = ["普通", "当座"] as const;

function kindLabel(kind: string): string {
  return PAYEE_KIND_OPTIONS.find((o) => o.value === kind)?.label ?? kind;
}

function entityTypeLabel(entityType: string): string {
  return ENTITY_TYPE_OPTIONS.find((o) => o.value === entityType)?.label ?? entityType;
}

/** 口座番号は一覧では下4桁のみ表示。 */
function maskAccountNumber(accountNumber: string): string {
  return `••••${accountNumber.slice(-4)}`;
}

/** マイナンバー登録有無のマスク表示（@/lib/mynumber-crypto の maskMyNumber と同じ表示規約）。 */
function maskMyNumber(hasValue: boolean): string {
  return hasValue ? "登録済み" : "未登録";
}

function fmtYen(n: number): string {
  return `¥${n.toLocaleString()}`;
}

const inputCls =
  "bg-neutral-300 text-black border border-line px-2.5 py-1.5 text-[13px] focus:outline-none focus:border-accent transition";

type AccruedSummary = {
  count: number;
  grossYen: number;
  withholdingYen: number;
  netYen: number;
  belowMinimum: boolean;
};

type Tab = "payees" | "splits" | "settlements" | "reconcile";

/**
 * 持ち込みスキャン詳細の「受取者として登録」リンクからのプリフィル。
 * 銀行口座は必須スキーマのため不完全な受取者は作らず、フォームへの
 * 事前入力で引き継ぐ（口座は admin が登録時に入力する）。
 */
export interface PayeePrefill {
  name: string;
  contactEmail: string;
  note: string;
}

interface PayoutsAdminProps {
  payees: Payee[];
  properties: { id: string; title: string }[];
  splits: PayoutSplit[];
  accruedSummaryByPayee: Record<string, AccruedSummary>;
  settlementsByPayee: Record<string, PayoutSettlement[]>;
  prefill?: PayeePrefill | null;
  /** userId紐付け選択肢（直接掲載スタジオの分配自動設定用）。 */
  studioUsers?: { id: string; label: string }[];
}

export default function PayoutsAdmin({
  payees,
  properties,
  splits,
  accruedSummaryByPayee,
  settlementsByPayee,
  prefill = null,
  studioUsers = [],
}: PayoutsAdminProps) {
  const [tab, setTab] = useState<Tab>("payees");

  const tabs: { key: Tab; label: string }[] = [
    { key: "payees", label: `受取者（${payees.length}）` },
    { key: "splits", label: "分配設定" },
    { key: "settlements", label: "精算" },
    { key: "reconcile", label: "突合" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`mono text-[11px] tracking-[0.2em] uppercase px-4 py-2.5 border-b-2 -mb-px transition ${
              tab === t.key
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "payees" && (
        <PayeesTab payees={payees} prefill={prefill} studioUsers={studioUsers} />
      )}
      {tab === "splits" && (
        <SplitsTab properties={properties} payees={payees} splits={splits} />
      )}
      {tab === "settlements" && (
        <SettlementsTab
          payees={payees}
          accruedSummaryByPayee={accruedSummaryByPayee}
          settlementsByPayee={settlementsByPayee}
        />
      )}
      {tab === "reconcile" && <ReconcileTab properties={properties} />}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// 受取者タブ
// ──────────────────────────────────────────────────────────────────

function PayeesTab({
  payees,
  prefill,
  studioUsers,
}: {
  payees: Payee[];
  prefill: PayeePrefill | null;
  studioUsers: { id: string; label: string }[];
}) {
  const [editing, setEditing] = useState<Payee | null>(null);
  // プリフィルがあれば最初からフォームを開く（持ち込み詳細からの導線）
  const [showForm, setShowForm] = useState(!!prefill);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60">
          受取者一覧
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="mono text-[11px] tracking-[0.2em] uppercase border border-accent text-accent px-3 py-1.5 hover:bg-accent hover:text-bg transition"
        >
          ＋ 受取者を追加
        </button>
      </div>

      {payees.length === 0 ? (
        <p className="text-[13px] text-muted border border-line p-6 text-center">
          まだ受取者が登録されていません。
        </p>
      ) : (
        <div className="border border-line overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="mono text-[10px] tracking-[0.2em] uppercase text-left opacity-40 border-b border-line">
                <th className="px-4 py-3 font-normal">種別</th>
                <th className="px-4 py-3 font-normal">名称</th>
                <th className="px-4 py-3 font-normal">区分</th>
                <th className="px-4 py-3 font-normal">口座</th>
                <th className="px-4 py-3 font-normal">インボイス番号</th>
                <th className="px-4 py-3 font-normal">マイナンバー</th>
                <th className="px-4 py-3 font-normal text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/50">
              {payees.map((p) => (
                <tr key={p.id} className="hover:bg-neutral-100 transition">
                  <td className="px-4 py-3">
                    <span className="mono text-[9px] tracking-[0.14em] uppercase border border-line px-1.5 py-0.5">
                      {kindLabel(p.kind)}
                    </span>
                  </td>
                  <td className="px-4 py-3">{p.name}</td>
                  <td className="px-4 py-3 mono text-[11px] opacity-60">
                    {entityTypeLabel(p.entityType)}
                  </td>
                  <td className="px-4 py-3 mono text-[11px] opacity-60">
                    {p.bank.bankName} {p.bank.branchName} / {maskAccountNumber(p.bank.accountNumber)}
                  </td>
                  <td className="px-4 py-3 mono text-[11px] opacity-60">
                    {p.invoiceRegNumber || "—"}
                  </td>
                  <td className="px-4 py-3 mono text-[11px] opacity-60">
                    {maskMyNumber(!!p.myNumberEncrypted)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(p);
                        setShowForm(true);
                      }}
                      className="mono text-[10px] tracking-[0.18em] uppercase border border-line px-2 py-1 hover:border-accent hover:text-accent transition"
                    >
                      編集
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <PayeeForm
          payee={editing}
          prefill={editing ? null : prefill}
          studioUsers={studioUsers}
          onDone={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

function PayeeForm({
  payee,
  prefill,
  studioUsers,
  onDone,
}: {
  payee: Payee | null;
  prefill?: PayeePrefill | null;
  studioUsers: { id: string; label: string }[];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<SavePayeeState, FormData>(
    savePayeeAction,
    undefined,
  );

  // 既存受取者の更新が成功したら閉じる（一覧は revalidatePath 済みの props で
  // 自動的に最新化される）。新規作成時は連続登録できるよう開いたままにする。
  useEffect(() => {
    if (state?.ok && payee) onDone();
  }, [state, payee, onDone]);

  return (
    <section className="border border-line bg-[#1c1c1c] p-5">
      <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-4">
        {payee ? `編集: ${payee.name}` : "新規受取者"}
      </div>
      <form
        key={payee?.id ?? "new"}
        action={formAction}
        className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        <input type="hidden" name="id" value={payee?.id ?? ""} />

        <label className="flex flex-col gap-1">
          <span className="mono text-[10px] tracking-[0.18em] uppercase opacity-60">種別</span>
          <select name="kind" defaultValue={payee?.kind ?? "scanner"} className={inputCls}>
            {PAYEE_KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="mono text-[10px] tracking-[0.18em] uppercase opacity-60">個人/法人</span>
          <select name="entityType" defaultValue={payee?.entityType ?? "individual"} className={inputCls}>
            {ENTITY_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="mono text-[10px] tracking-[0.18em] uppercase opacity-60">氏名/名称</span>
          <input name="name" defaultValue={payee?.name ?? prefill?.name ?? ""} required className={inputCls} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="mono text-[10px] tracking-[0.18em] uppercase opacity-60">連絡先メール（任意）</span>
          <input name="contactEmail" type="email" defaultValue={payee?.contactEmail ?? prefill?.contactEmail ?? ""} className={inputCls} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="mono text-[10px] tracking-[0.18em] uppercase opacity-60">
            インボイス登録番号（任意）
          </span>
          <input
            name="invoiceRegNumber"
            defaultValue={payee?.invoiceRegNumber ?? ""}
            placeholder="T1234567890123"
            className={inputCls}
          />
        </label>

        <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-1">
          <span className="mono text-[10px] tracking-[0.18em] uppercase opacity-60">メモ（任意）</span>
          <input name="note" defaultValue={payee?.note ?? prefill?.note ?? ""} maxLength={500} className={inputCls} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="mono text-[10px] tracking-[0.18em] uppercase opacity-60">
            紐づくスタジオアカウント（任意）
          </span>
          <select name="userId" defaultValue={payee?.userId ?? ""} className={inputCls}>
            <option value="">紐づけなし（従来どおり手動管理）</option>
            {studioUsers.map((u) => (
              <option key={u.id} value={u.id}>{u.label}</option>
            ))}
          </select>
          <span className="text-[11px] text-muted">
            設定すると、そのスタジオの物件公開時に分配設定（施設20%）が自動作成されます。
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="mono text-[10px] tracking-[0.18em] uppercase opacity-60">
            マイナンバー（{payee?.myNumberEncrypted ? "登録済み・再入力で上書き" : "任意・数字12桁"}）
          </span>
          <input
            name="myNumberDigits"
            type="password"
            inputMode="numeric"
            pattern="\d{12}"
            maxLength={12}
            placeholder={payee?.myNumberEncrypted ? "•••••••••••• (変更する場合のみ入力)" : "123456789012"}
            className={inputCls}
          />
          <span className="text-[11px] text-muted">
            暗号化して保存され、一覧・編集画面には常にマスク表示のみ（平文は表示されません）。
            源泉徴収が発生する個人受取者の支払調書提出に必要な場合のみ入力してください。
          </span>
        </label>

        <div className="sm:col-span-2 lg:col-span-3 border-t border-line/50 pt-4 mt-1">
          <div className="mono text-[10px] tracking-[0.2em] uppercase opacity-50 mb-3">
            振込先口座
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <label className="flex flex-col gap-1">
              <span className="mono text-[10px] tracking-[0.18em] uppercase opacity-60">銀行名</span>
              <input name="bankName" defaultValue={payee?.bank.bankName ?? ""} required className={inputCls} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="mono text-[10px] tracking-[0.18em] uppercase opacity-60">支店名</span>
              <input name="branchName" defaultValue={payee?.bank.branchName ?? ""} required className={inputCls} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="mono text-[10px] tracking-[0.18em] uppercase opacity-60">預金種別</span>
              <select name="accountType" defaultValue={payee?.bank.accountType ?? "普通"} className={inputCls}>
                {BANK_ACCOUNT_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="mono text-[10px] tracking-[0.18em] uppercase opacity-60">口座番号</span>
              <input name="accountNumber" defaultValue={payee?.bank.accountNumber ?? ""} required className={inputCls} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="mono text-[10px] tracking-[0.18em] uppercase opacity-60">口座名義（カナ）</span>
              <input name="accountHolder" defaultValue={payee?.bank.accountHolder ?? ""} required className={inputCls} />
            </label>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed opacity-60">
            ※ 口座は<strong>受取者本人（法人は当該法人）名義</strong>であることを登録前に確認すること。
            マイナンバーは上の欄で暗号化して登録できます（特定個人情報のため、取得時は
            利用目的の明示など法令上の手続きを別途行うこと）。
          </p>
        </div>

        <div className="sm:col-span-2 lg:col-span-3 flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={pending}
            className="mono text-[11px] tracking-[0.2em] uppercase border border-accent text-accent px-4 py-2 hover:bg-accent hover:text-bg transition disabled:opacity-50"
          >
            {pending ? "保存中…" : "保存"}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="mono text-[11px] tracking-[0.2em] uppercase text-muted hover:text-ink transition"
          >
            キャンセル
          </button>
        </div>
      </form>

      {state?.ok === false && <p className="mt-3 text-[12px] text-red-400">{state.error}</p>}
      {state?.ok === true && !payee && (
        <p className="mt-3 text-[12px] text-green-400">追加しました: {state.payee.name}</p>
      )}
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────
// 分配設定タブ
// ──────────────────────────────────────────────────────────────────

function SplitsTab({
  properties,
  payees,
  splits,
}: {
  properties: { id: string; title: string }[];
  payees: Payee[];
  splits: PayoutSplit[];
}) {
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [lines, setLines] = useState<PayoutSplitLine[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const configuredIds = new Set(
    splits.filter((s) => s.lines.length > 0).map((s) => s.propertyId),
  );

  function selectProperty(id: string) {
    setSelectedPropertyId(id);
    setError(null);
    setSavedAt(null);
    setLoaded(false);
    if (!id) {
      setLines([]);
      setLoaded(true);
      return;
    }
    start(async () => {
      const split = await getPayoutSplitAction(id);
      setLines(split?.lines ?? []);
      setLoaded(true);
    });
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      { payeeId: payees[0]?.id ?? "", role: "scanner" as PayoutRole, ratePercent: 0 },
    ]);
  }
  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }
  function updateLine(idx: number, patch: Partial<PayoutSplitLine>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  const total = Math.round(lines.reduce((s, l) => s + (l.ratePercent || 0), 0) * 100) / 100;
  const overLimit = total > 70;

  function save() {
    setError(null);
    setSavedAt(null);
    if (lines.some((l) => !l.payeeId)) {
      setError("受取者が未選択の行があります。");
      return;
    }
    start(async () => {
      const r = await savePayoutSplitAction(selectedPropertyId, lines);
      if (r.ok) {
        setLines(r.split.lines);
        setSavedAt(Date.now());
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      <label className="flex flex-col gap-1 max-w-md">
        <span className="mono text-[10px] tracking-[0.18em] uppercase opacity-60">物件を選択</span>
        <select
          value={selectedPropertyId}
          onChange={(e) => selectProperty(e.target.value)}
          className={inputCls}
        >
          <option value="">選択してください</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {configuredIds.has(p.id) ? "● " : ""}
              {p.title}
            </option>
          ))}
        </select>
        <span className="text-[11px] text-muted">● は分配設定済みの物件。</span>
      </label>

      {!selectedPropertyId ? (
        <p className="text-[13px] text-muted border border-line p-6 text-center">
          物件を選択すると分配設定を編集できます。
        </p>
      ) : !loaded ? (
        <p className="text-[13px] text-muted py-4">読み込み中…</p>
      ) : (
        <div className="border border-line bg-[#1c1c1c] p-5 space-y-4">
          {payees.length === 0 ? (
            <p className="text-[13px] text-muted">
              先に「受取者」タブで受取者を登録してください。
            </p>
          ) : (
            <>
              {lines.length === 0 ? (
                <p className="text-[13px] text-muted">この物件にはまだ分配設定がありません。</p>
              ) : (
                <div className="space-y-2">
                  {lines.map((line, idx) => (
                    <div key={idx} className="flex flex-wrap items-center gap-2">
                      <select
                        value={line.payeeId}
                        onChange={(e) => updateLine(idx, { payeeId: e.target.value })}
                        className={inputCls}
                      >
                        <option value="">受取者を選択</option>
                        {payees.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      <select
                        value={line.role}
                        onChange={(e) => updateLine(idx, { role: e.target.value as PayoutRole })}
                        className={inputCls}
                      >
                        {PAYEE_KIND_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={0}
                        max={70}
                        step={0.01}
                        value={line.ratePercent}
                        onChange={(e) => updateLine(idx, { ratePercent: Number(e.target.value) })}
                        className={`${inputCls} w-24`}
                      />
                      <span className="mono text-[11px] opacity-50">%</span>
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        className="mono text-[10px] uppercase text-red-400 border border-red-500/40 px-2 py-1 hover:bg-red-500/10 transition"
                      >
                        削除
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={addLine}
                  className="mono text-[10px] tracking-[0.18em] uppercase border border-line px-3 py-1.5 hover:border-accent hover:text-accent transition"
                >
                  ＋ 行を追加
                </button>
                <span className={`mono text-[11px] ${overLimit ? "text-red-400" : "text-muted"}`}>
                  合計 {total}%（当社取り分 {Math.max(0, 100 - total)}%）
                </span>
              </div>

              {overLimit && (
                <p className="text-[12px] text-red-400">
                  分配率の合計は70%までです（当社取り分は最低30%必要）。
                </p>
              )}
              {error && <p className="text-[12px] text-red-400">{error}</p>}
              {savedAt && !error && <p className="text-[12px] text-green-400">保存しました。</p>}

              <button
                type="button"
                onClick={save}
                disabled={pending}
                className="mono text-[11px] tracking-[0.2em] uppercase border border-accent text-accent px-4 py-2 hover:bg-accent hover:text-bg transition disabled:opacity-50"
              >
                {pending ? "保存中…" : "分配設定を保存"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// 精算タブ
// ──────────────────────────────────────────────────────────────────

function SettlementsTab({
  payees,
  accruedSummaryByPayee,
  settlementsByPayee,
}: {
  payees: Payee[];
  accruedSummaryByPayee: Record<string, AccruedSummary>;
  settlementsByPayee: Record<string, PayoutSettlement[]>;
}) {
  const [periodLabels, setPeriodLabels] = useState<Record<string, string>>({});
  const [pendingPayeeId, setPendingPayeeId] = useState<string | null>(null);
  const [pendingSettlementId, setPendingSettlementId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const router = useRouter();

  function createSettlement(payeeId: string) {
    const label = (periodLabels[payeeId] ?? "").trim();
    if (!label) {
      setErrors((e) => ({ ...e, [payeeId]: "精算期間を入力してください" }));
      return;
    }
    setErrors((e) => ({ ...e, [payeeId]: "" }));
    setPendingPayeeId(payeeId);
    void (async () => {
      const r = await createSettlementAction(payeeId, label);
      setPendingPayeeId(null);
      if (r.ok) {
        router.refresh();
      } else {
        setErrors((e) => ({ ...e, [payeeId]: r.error }));
      }
    })();
  }

  function markPaid(settlementId: string) {
    setPendingSettlementId(settlementId);
    void (async () => {
      await markSettlementPaidAction(settlementId);
      setPendingSettlementId(null);
      router.refresh();
    })();
  }

  if (payees.length === 0) {
    return (
      <p className="text-[13px] text-muted border border-line p-6 text-center">
        受取者を先に登録してください。
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {payees.map((payee) => {
        const summary: AccruedSummary = accruedSummaryByPayee[payee.id] ?? {
          count: 0,
          grossYen: 0,
          withholdingYen: 0,
          netYen: 0,
          belowMinimum: false,
        };
        const settlements = settlementsByPayee[payee.id] ?? [];
        const canCreate = summary.count > 0 && !summary.belowMinimum;

        return (
          <div key={payee.id} className="border border-line bg-[#1a1a1a] p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[14px] font-semibold">{payee.name}</span>
              <span className="mono text-[9px] tracking-[0.14em] uppercase border border-line px-1.5 py-0.5 opacity-60">
                {kindLabel(payee.kind)}
              </span>
              <span className="mono text-[11px] text-muted ml-auto">
                未精算 {summary.count}件 / {fmtYen(summary.grossYen)}
              </span>
              {summary.belowMinimum && (
                <span className="mono text-[10px] tracking-[0.18em] uppercase border border-amber-400/40 text-amber-400 px-2 py-0.5">
                  繰越中（最低支払未満）
                </span>
              )}
            </div>

            {canCreate && (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="精算期間（例: 2026Q3）"
                  value={periodLabels[payee.id] ?? ""}
                  onChange={(e) =>
                    setPeriodLabels((p) => ({ ...p, [payee.id]: e.target.value }))
                  }
                  className={`${inputCls} w-48`}
                />
                <button
                  type="button"
                  onClick={() => createSettlement(payee.id)}
                  disabled={pendingPayeeId === payee.id}
                  className="mono text-[10px] tracking-[0.18em] uppercase border border-accent text-accent px-3 py-1.5 hover:bg-accent hover:text-bg transition disabled:opacity-50"
                >
                  {pendingPayeeId === payee.id ? "作成中…" : "精算を作成"}
                </button>
                {errors[payee.id] && (
                  <span className="text-[11px] text-red-400">{errors[payee.id]}</span>
                )}
              </div>
            )}

            {settlements.length > 0 && (
              <div className="border-t border-line/50 pt-3 space-y-2">
                {settlements.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center gap-3 text-[12px]">
                    <span className="mono opacity-60">{s.periodLabel}</span>
                    <span>
                      {fmtYen(s.netYen)}{" "}
                      <span className="opacity-40">(源泉 {fmtYen(s.withholdingYen)})</span>
                    </span>
                    <span
                      className={`mono text-[9px] uppercase px-1.5 py-0.5 border ${
                        s.status === "paid"
                          ? "border-green-400/40 text-green-400"
                          : "border-yellow-400/40 text-yellow-400"
                      }`}
                    >
                      {s.status === "paid" ? "振込済" : "未払い"}
                    </span>
                    <a
                      href={`/admin/payouts/${s.id}/statement`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mono text-[10px] uppercase text-muted hover:text-accent transition"
                    >
                      支払明細書
                    </a>
                    {s.status === "draft" && (
                      <button
                        type="button"
                        onClick={() => markPaid(s.id)}
                        disabled={pendingSettlementId === s.id}
                        className="mono text-[10px] uppercase border border-line px-2 py-1 hover:border-accent hover:text-accent transition disabled:opacity-50 ml-auto"
                      >
                        {pendingSettlementId === s.id ? "処理中…" : "振込済にする"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// 突合タブ（とりこぼし検知＋再起票）
// ──────────────────────────────────────────────────────────────────
//
// recordPayoutAccruals（台帳自動起票フック）は台帳側の障害で購入完了処理を
// 巻き込まないよう握り潰す設計になっている。その代償として起票のとりこぼしが
// 静かに発生し得るため（例: 本番D1にマイグレーション適用前のデプロイ期間）、
// purchases と台帳を突合して欠落を検知・手動再起票できるようにする。

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ja-JP");
  } catch {
    return iso;
  }
}

function ReconcileTab({ properties }: { properties: { id: string; title: string }[] }) {
  const [missing, setMissing] = useState<MissingAccrual[] | null>(null);
  const [running, setRunning] = useState(false);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [recordingAll, setRecordingAll] = useState(false);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<string | null>(null);

  const titleById = new Map(properties.map((p) => [p.id, p.title]));

  function runCheck() {
    setRunning(true);
    setSummary(null);
    setRowErrors({});
    void (async () => {
      const rows = await findMissingAccrualsAction();
      setMissing(rows);
      setRunning(false);
    })();
  }

  function recordOne(purchaseId: string) {
    setRecordingId(purchaseId);
    setRowErrors((e) => ({ ...e, [purchaseId]: "" }));
    void (async () => {
      const r = await recordMissingAccrualAction(purchaseId);
      setRecordingId(null);
      if (r.ok) {
        setMissing((prev) => (prev ? prev.filter((m) => m.purchaseId !== purchaseId) : prev));
      } else {
        setRowErrors((e) => ({ ...e, [purchaseId]: r.error }));
      }
    })();
  }

  function recordAll() {
    setRecordingAll(true);
    setSummary(null);
    void (async () => {
      const r = await recordAllMissingAccrualsAction();
      setRecordingAll(false);
      const failedIds = new Set(r.failed.map((f) => f.purchaseId));
      setMissing((prev) => (prev ? prev.filter((m) => failedIds.has(m.purchaseId)) : prev));
      setRowErrors((prevErrors) => {
        const next = { ...prevErrors };
        for (const f of r.failed) next[f.purchaseId] = f.error;
        return next;
      });
      setSummary(
        r.failed.length === 0
          ? `${r.succeededIds.length}件を起票しました。`
          : `${r.succeededIds.length}件を起票、${r.failed.length}件は失敗しました（下の一覧を確認してください）。`,
      );
    })();
  }

  return (
    <div className="space-y-6">
      <p className="text-[13px] text-muted leading-[1.8] max-w-[70ch]">
        台帳の自動起票フックは、購入完了処理を巻き込まないよう台帳側の障害を
        握り潰すフェイルセーフになっています。そのため、まれに起票の
        とりこぼしが静かに発生し得ます（例: 本番DBにマイグレーション適用前の
        デプロイ期間）。ここで purchases と台帳を突合し、欠落があれば
        手動で再起票できます。
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={runCheck}
          disabled={running}
          className="mono text-[11px] tracking-[0.2em] uppercase border border-accent text-accent px-4 py-2 hover:bg-accent hover:text-bg transition disabled:opacity-50"
        >
          {running ? "確認中…" : "突合を実行"}
        </button>
        {missing && missing.length > 0 && (
          <button
            type="button"
            onClick={recordAll}
            disabled={recordingAll || recordingId !== null}
            className="mono text-[11px] tracking-[0.2em] uppercase border border-line px-4 py-2 hover:border-accent hover:text-accent transition disabled:opacity-50"
          >
            {recordingAll ? "起票中…" : "すべて起票"}
          </button>
        )}
        {summary && <span className="text-[12px] text-muted">{summary}</span>}
      </div>

      {missing === null ? (
        <p className="text-[13px] text-muted border border-line p-6 text-center">
          「突合を実行」を押すと、分配設定はあるのに台帳に起票されていない
          購入がないか確認します。
        </p>
      ) : missing.length === 0 ? (
        <p className="text-[13px] text-muted border border-line p-6 text-center">
          取りこぼしはありません。
        </p>
      ) : (
        <div className="border border-line overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="mono text-[10px] tracking-[0.2em] uppercase text-left opacity-40 border-b border-line">
                <th className="px-4 py-3 font-normal">購入日時</th>
                <th className="px-4 py-3 font-normal">物件</th>
                <th className="px-4 py-3 font-normal">購入ID</th>
                <th className="px-4 py-3 font-normal text-right">金額</th>
                <th className="px-4 py-3 font-normal text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/50">
              {missing.map((m) => (
                <tr key={m.purchaseId} className="hover:bg-neutral-100 transition">
                  <td className="px-4 py-3 mono text-[11px] opacity-60">
                    {fmtDateTime(m.purchasedAt)}
                  </td>
                  <td className="px-4 py-3">{titleById.get(m.propertyId) ?? m.propertyId}</td>
                  <td className="px-4 py-3 mono text-[11px] opacity-60">{m.purchaseId}</td>
                  <td className="px-4 py-3 text-right mono text-[12px]">{fmtYen(m.priceYen)}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => recordOne(m.purchaseId)}
                      disabled={recordingId === m.purchaseId || recordingAll}
                      className="mono text-[10px] tracking-[0.18em] uppercase border border-accent text-accent px-2.5 py-1 hover:bg-accent hover:text-bg transition disabled:opacity-50"
                    >
                      {recordingId === m.purchaseId ? "起票中…" : "起票する"}
                    </button>
                    {rowErrors[m.purchaseId] && (
                      <div className="mt-1 text-[11px] text-red-400">
                        {rowErrors[m.purchaseId]}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
