"use client";

/**
 * 購入記録の削除ボタン（確認ダイアログ付き）。
 * 親の <form action={deletePurchaseAction}> 内に置いて使う。
 */
export default function DeletePurchaseButton() {
  return (
    <button
      type="submit"
      className="mono text-[10px] uppercase border border-red-400/40 text-red-400/80 px-2 py-1 hover:bg-red-400 hover:text-bg transition"
      onClick={(e) => {
        if (!confirm("この購入記録を完全に削除しますか？（元に戻せません）")) e.preventDefault();
      }}
    >
      削除
    </button>
  );
}
