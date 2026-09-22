"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  publishByIdAction,
  unpublishAction,
  archiveAction,
  deleteAction,
  requestReviewByIdAction,
} from "@/app/admin/_actions";
import type { PropertyStatus } from "@/lib/schemas";

const BTN =
  "mono text-[10px] tracking-[0.22em] uppercase border px-2.5 py-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed";

/** Per-row quick actions for the admin property list. */
export default function PropertyRowActions({
  id,
  status,
  isAdmin = false,
  title,
  contactEmail,
  canRequestReview = false,
}: {
  id: string;
  status: PropertyStatus;
  isAdmin?: boolean;
  /** 確認ダイアログで「どの物件か」を見せるため。 */
  title?: string;
  /** 確認ダイアログで宛先を見せるため（送信先はサーバーが保存値から決める）。 */
  contactEmail?: string;
  /** 「公開申請待ち」の行か（＝下書き＋公開に必要な項目が揃っている）。 */
  canRequestReview?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const publish = () => {
    setError(null);
    start(async () => {
      const r = await publishByIdAction(id);
      if (!r.ok) setError(r.error);
    });
  };
  const unpublish = () => {
    setError(null);
    start(async () => {
      await unpublishAction(id);
    });
  };
  const archive = () => {
    if (
      !window.confirm(
        "この物件をアーカイブします。公開一覧から外れます（削除ではありません）。よろしいですか？",
      )
    )
      return;
    setError(null);
    start(async () => {
      const r = await archiveAction(id);
      if (r && !r.ok) setError("アーカイブに失敗しました");
    });
  };
  // 一覧から公開申請（＝スタジオへ社外メールが出る）。押す前に宛先を見せて確認する。
  // 処理自体はエディターの「公開申請する」と同じサーバーアクションを id 経由で呼ぶだけ。
  const requestReview = () => {
    if (!contactEmail) {
      setError("連絡先メールが未設定です。エディターで入力してください。");
      return;
    }
    if (
      !window.confirm(
        `「${title || id}」の掲載内容確認メールを ${contactEmail} へ送り、公開申請中にします。よろしいですか？`,
      )
    )
      return;
    setError(null);
    start(async () => {
      const r = await requestReviewByIdAction(id);
      if (!r.ok) setError(r.error);
    });
  };
  const remove = () => {
    if (
      !window.confirm(
        "この物件を削除します。元に戻せません。本当によろしいですか？",
      )
    )
      return;
    setError(null);
    start(async () => {
      await deleteAction(id);
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      {/* 2026-09-21 本人指示「公開申請待ちの場合、右側に 申請メールを送るボタンを追加」。
          常設5つのボタンと同じ行に入れると必ず折り返すので、目立つ一次動作として上の行に置く。 */}
      {isAdmin && canRequestReview && (
        <button
          type="button"
          onClick={requestReview}
          disabled={pending}
          className={`${BTN} border-accent bg-accent/10 text-accent hover:bg-accent hover:text-bg`}
        >
          申請メールを送る
        </button>
      )}
      <div className="flex gap-1.5 justify-end flex-wrap">
        <Link
          href={`/admin/properties/${id}/preview`}
          target="_blank"
          className={`${BTN} border-line hover:border-accent hover:text-accent`}
        >
          プレビュー
        </Link>
        <Link
          href={`/admin/properties/${id}/edit`}
          className={`${BTN} border-line hover:border-accent hover:text-accent`}
        >
          編集
        </Link>
        {/* 「非公開」「アーカイブ」は assertPropertyAccess(所有スタジオも可)なので
            isAdmin に関わらず表示してよい。「公開」「削除」は requireAdmin の
            サーバーアクションで、studio が押すと redirect("/") でページごと
            追い出されるため isAdmin のときだけ表示する。 */}
        {status === "published" ? (
          <button
            type="button"
            onClick={unpublish}
            disabled={pending}
            className={`${BTN} border-line hover:border-ink`}
          >
            非公開
          </button>
        ) : (
          isAdmin && (
            <button
              type="button"
              onClick={publish}
              disabled={pending}
              className={`${BTN} border-accent text-accent hover:bg-accent hover:text-bg`}
            >
              公開
            </button>
          )
        )}
        {status !== "archived" && (
          <button
            type="button"
            onClick={archive}
            disabled={pending}
            className={`${BTN} border-line hover:border-ink`}
          >
            アーカイブ
          </button>
        )}
        {isAdmin && (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className={`${BTN} border-red-500/40 text-red-400 hover:bg-red-500 hover:text-bg`}
          >
            削除
          </button>
        )}
      </div>
      {/* 2026-09-23: 以前は 9px の等幅・幅240pxで、長い理由（翻訳の失敗など）が5行に折れて読めなかった。
          本文と同じ書体・読める大きさ・ボタン列と同じ幅にする。 */}
      {error && (
        <p role="alert" className="max-w-[420px] rounded border border-red-500/30 bg-red-500/5 px-2.5 py-1.5 text-left text-[11.5px] leading-[1.6] text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
