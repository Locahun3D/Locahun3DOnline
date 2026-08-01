"use client";

import { useActionState, useState, useTransition } from "react";
import { renamePropertyAction, confirmPropertySlugAction, type RenameState } from "@/app/admin/_actions";
import PreviewShare from "./preview-share";
import EmbedShare from "./embed-share";

/**
 * 物件の公開URL（スラッグ＝ID）を編集する小コントロール。
 * 「編集」で入力欄を開き、変更すると renamePropertyAction が安全にリネーム移行し、
 * 成功時は新しい編集ページへ自動遷移する。主に公開前のURL調整用。
 */
export default function SlugEditor({
  id,
  status,
  embedded = false,
  isAdmin = false,
  urlConfirmedAt = "",
  onConfirmed,
}: {
  id: string;
  status: string;
  /** true = 親のパネル（エディタのヘッダー枠）内に埋め込むため、独自の枠線・背景を持たない。 */
  embedded?: boolean;
  /**
   * 仮URL/埋め込みパネルは admin 限定で描画する。
   * ⚠ これを常時描画すると、パネルがマウント時に呼ぶ getPropertyPreviewAction /
   * getPropertyEmbedAction の requireAdmin() が studio を redirect("/") で弾き、
   * **エディタを開いた瞬間にページごとホームへ飛ぶ**（実機で再現・修正済み）。
   * サーバーアクション内の redirect は 303 になりページ全体を持っていく。
   */
  isAdmin?: boolean;
  /** 公開URLを確認・変更済みか（publishablePropertySchemaの必須項目）。 */
  urlConfirmedAt?: string;
  /** 「このURLでよい」確認後、親フォームのRHF状態を即時更新するコールバック。 */
  onConfirmed?: (confirmedAt: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(id);
  const [confirming, startConfirm] = useTransition();
  const [state, action, pending] = useActionState<RenameState, FormData>(
    renamePropertyAction,
    undefined,
  );
  // embedded 時は親（エディタ全体）の <form> の中に置かれるため、<form> を
  // ネストできない（HTML 不正・submit が親に食われる）。div + 手動 action 実行にする。
  const [, startTransition] = useTransition();
  const submitRename = () => {
    const fd = new FormData();
    fd.set("oldId", id);
    fd.set("newId", value);
    startTransition(() => action(fd));
  };
  const published = status === "published";

  return (
    <div
      className={
        embedded
          ? ""
          : "border border-neutral-300 bg-white px-4 py-3 rounded-md shadow-sm"
      }
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="mono text-[11px] font-semibold tracking-[0.22em] uppercase text-neutral-500 shrink-0">
          公開URL
        </span>

        {!editing ? (
          <>
            <code className="text-[14px] font-medium text-neutral-800 break-all">
              locahun3d.com/properties/
              <span className="text-accent font-bold">{id}</span>
            </code>
            {/* ⚠ 公開申請には「公開URLを確認したこと」が必須（publishablePropertySchema
                の urlConfirmedAt）。URLを変更すれば renamePropertyAction が自動で
                立てるが、自動生成IDのままでよい場合に確認する手段が無かった。
                このボタンは confirmPropertySlugAction を直接呼び、リダイレクトせず
                onConfirmed で親フォームのRHF状態をその場で更新する。 */}
            {urlConfirmedAt ? (
              <span className="mono text-[10px] tracking-[0.12em] uppercase text-green-700 shrink-0">
                ✓ 確認済み
              </span>
            ) : (
              <button
                type="button"
                disabled={confirming}
                onClick={() => {
                  startConfirm(async () => {
                    const res = await confirmPropertySlugAction(id);
                    if (res.ok && res.confirmedAt) onConfirmed?.(res.confirmedAt);
                  });
                }}
                className="mono text-[10px] tracking-[0.12em] uppercase text-accent border border-accent/50 px-2.5 py-1 rounded-md hover:bg-accent hover:text-white transition disabled:opacity-50 shrink-0"
              >
                {confirming ? "確認中…" : "このURLでよい"}
              </button>
            )}
            {/* 仮URL発行（限定プレビュー共有URL）。公開URLのすぐ隣に置くことで、
                「まだ下書きだが先方に見せたい」場面で見つけやすくする。 */}
            <div className="ml-auto flex items-center gap-2">
              {isAdmin && (
                <PreviewShare
                  propertyId={id}
                  buttonLabel="仮URLを発行"
                  buttonClassName="text-[13px] font-medium border border-neutral-300 text-neutral-700 px-3.5 py-1.5 rounded-md hover:border-accent hover:text-accent transition shrink-0"
                />
              )}
              {/* 掲載者が自社サイトへ貼る3Dツアー埋め込みコード（D-008 ホスティング商品）。
                  公開URL・仮URLと並ぶ「この物件のURLを配る」導線としてここに置く。
                  発行・管理は現状 admin 運用（ホスティング商品は2026年内無料提供・
                  当社側で発行）のため、パネルも admin のみに出す。 */}
              {isAdmin && (
                <EmbedShare
                  propertyId={id}
                  buttonLabel="埋め込みコード"
                  buttonClassName="text-[13px] font-medium border border-neutral-300 text-neutral-700 px-3.5 py-1.5 rounded-md hover:border-accent hover:text-accent transition shrink-0"
                />
              )}
              <button
                type="button"
                onClick={() => {
                  setValue(id);
                  setEditing(true);
                }}
                className="text-[13px] font-medium border border-neutral-300 text-neutral-700 px-3.5 py-1.5 rounded-md hover:border-accent hover:text-accent transition shrink-0"
              >
                URLを編集
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2 w-full">
            <span className="text-[13px] text-neutral-500 mono shrink-0">
              /properties/
            </span>
            <input
              name="newId"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitRename();
                }
              }}
              autoFocus
              placeholder="shibuya-kitaya-park"
              className="flex-1 min-w-[160px] bg-white text-neutral-900 border border-neutral-300 rounded-md px-3 py-2 text-[14px] font-medium mono focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition"
            />
            <button
              type="button"
              onClick={submitRename}
              disabled={pending}
              className="text-[13px] font-bold bg-accent text-white px-4 py-2 rounded-md hover:bg-accent/85 transition disabled:opacity-50 shrink-0"
            >
              {pending ? "変更中…" : "変更する"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-[13px] font-medium border border-neutral-300 text-neutral-600 px-3.5 py-2 rounded-md hover:text-neutral-900 transition shrink-0"
            >
              キャンセル
            </button>
          </div>
        )}
      </div>

      {state?.ok === false && (
        <p className="mt-2 text-[12px] text-red-600">{state.error}</p>
      )}

      {(!embedded || editing) && (
        <p className="mt-2 text-[12px] text-neutral-500 leading-relaxed">
          英小文字・数字・ハイフンのみ。
          {published
            ? "公開中のため、変更すると既存リンク・ブックマークのURLも変わります。"
            : "公開前に決めておくのがおすすめです。"}
        </p>
      )}
    </div>
  );
}
