"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  updateScanSubmissionAction,
  createDraftFromScanSubmissionAction,
} from "@/lib/scan-submission-actions";
import { SCAN_SUBMISSION_STATUSES, scanStatusLabel, type ScanSubmissionStatus } from "@/lib/scan-submissions";

/**
 * 状態遷移＋運営メモ編集（1フォーム）。選択式で任意の状態へ遷移できる
 * （後戻りも可）。保存時のみ申請者へ通知が飛ぶ（状態が実際に変わった場合）。
 */
export function SubmissionStatusForm({
  id,
  initialStatus,
  initialNote,
}: {
  id: string;
  initialStatus: ScanSubmissionStatus;
  initialNote: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<ScanSubmissionStatus>(initialStatus);
  const [note, setNote] = useState(initialNote);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const onSave = () => {
    setError("");
    setSaved(false);
    startTransition(async () => {
      const res = await updateScanSubmissionAction(id, status, note);
      if (res.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <div className="border border-line rounded-md p-4">
      <div className="mono text-[10px] tracking-[0.18em] uppercase text-muted mb-3">
        状態・運営メモ
      </div>
      <label className="block mb-3">
        <span className="text-[12px] text-muted block mb-1">状態</span>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as ScanSubmissionStatus)}
          className="border border-line rounded-md px-3 py-2 text-[13px] bg-[#0f0f0f]"
        >
          {SCAN_SUBMISSION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {scanStatusLabel(s)}
            </option>
          ))}
        </select>
      </label>
      <label className="block mb-3">
        <span className="text-[12px] text-muted block mb-1">運営メモ</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          maxLength={4000}
          className="w-full border border-line rounded-md px-3 py-2 text-[13px] leading-relaxed resize-y bg-[#0f0f0f]"
        />
      </label>
      {error && <p className="text-[12px] text-red-400 mb-2">{error}</p>}
      {saved && !pending && <p className="text-[12px] text-green-400 mb-2">保存しました。</p>}
      <button
        type="button"
        onClick={onSave}
        disabled={pending}
        className="text-[12px] border border-accent text-accent px-4 py-2 rounded-sm hover:bg-accent hover:text-bg transition disabled:opacity-50"
      >
        {pending ? "保存中…" : "保存する"}
      </button>
    </div>
  );
}

/** cleared 状態の申請から物件下書きを作成するボタン。 */
export function CreateDraftButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: true; propertyId: string } | { ok: false; error: string } | null>(null);

  const onClick = () => {
    startTransition(async () => {
      const res = await createDraftFromScanSubmissionAction(id);
      setResult(res);
      if (res.ok) router.refresh();
    });
  };

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="text-[12px] border border-accent bg-accent text-bg px-4 py-2 rounded-sm hover:bg-accent/85 transition disabled:opacity-50"
      >
        {pending ? "作成中…" : "物件下書きを作成"}
      </button>
      {result && !result.ok && <p className="mt-2 text-[12px] text-red-400">{result.error}</p>}
      {result?.ok && (
        <p className="mt-2 text-[12px] text-green-400">
          下書きを作成しました →{" "}
          <a href={`/admin/properties/${result.propertyId}/edit`} className="underline">
            編集ページへ
          </a>
        </p>
      )}
    </div>
  );
}
