"use client";

/** 支払明細書ページの印刷ボタン。画面には出すが印刷時は隠す(print:hidden)。 */
export default function StatementPrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden fixed bottom-6 right-6 bg-[#111] text-white border-none px-6 py-3 text-[12px] tracking-[0.16em] uppercase cursor-pointer font-mono hover:bg-[#333] transition"
    >
      印刷 / PDF保存
    </button>
  );
}
