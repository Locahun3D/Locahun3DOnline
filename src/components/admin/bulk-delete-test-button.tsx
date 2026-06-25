"use client";

/**
 * テスト購入を一括削除するボタン（確認ダイアログ付き）。
 * 親の <form action={bulkDeleteTestPurchasesAction}> 内に置いて使う。
 */
export default function BulkDeleteTestButton({ count }: { count: number }) {
  return (
    <button
      type="submit"
      disabled={count === 0}
      className="mono text-[10px] tracking-[0.18em] uppercase border border-red-400/50 text-red-400 px-3 py-1.5 hover:bg-red-400 hover:text-bg transition disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-red-400"
      onClick={(e) => {
        if (!confirm(`削除可能なテスト購入 ${count} 件をすべて削除しますか？（元に戻せません）`)) {
          e.preventDefault();
        }
      }}
    >
      🗑 テスト購入を一括削除（{count}）
    </button>
  );
}
