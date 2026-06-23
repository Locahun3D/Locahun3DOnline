"use client";

/**
 * 返金ボタン（確認ダイアログ付き）。
 * サーバーコンポーネントは onClick ハンドラを子に渡せないため、
 * confirm を持つ submit ボタンだけをクライアント側に切り出す。
 * 親の <form action={refundPurchaseAction}> 内にそのまま置いて使う。
 */
export default function RefundButton() {
  return (
    <button
      type="submit"
      className="mono text-[10px] uppercase border border-purple-400/40 text-purple-400/80 px-2 py-1 hover:bg-purple-400 hover:text-bg transition"
      onClick={(e) => {
        if (!confirm("この購入を返金しますか？")) e.preventDefault();
      }}
    >
      返金
    </button>
  );
}
