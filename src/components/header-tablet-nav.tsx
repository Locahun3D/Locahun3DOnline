"use client";

import { useEffect, useState } from "react";

/**
 * タブレット縦(720–1023px)専用のハンバーガー＋ドロワー。
 *
 * なぜ必要か: この帯を1行フルナビのままにすると、サインイン時の右側
 * （EN/カート/通知ベル/アバター）が重くなり、実測で 768px のナビ最終項目と
 * 中央ブランドが -5px（＝重なり）になっていた。ナビを畳めば恒久的に余裕が出る。
 *
 * ⚠ ナビ要素そのものを子として受け取り、ここで「行 or ドロワー」を切り替える。
 *   ナビをもう1組複製してはいけない（header-parity.mjs は `nav a` を
 *   querySelector で1件だけ拾うため、非表示の複製があると別の値を測って落ちる）。
 * ⚠ 1024px 以上はドロワー化せず従来の1行フルナビ（この帯は現状維持が指示）。
 *   境界は max-[1024px] / min-[1024px] のペアで排他にする（max-[1023px] だと
 *   1023.5px のような小数幅がどちらにも該当しない）。
 */
export default function HeaderTabletNav({
  menuLabel,
  children,
}: {
  menuLabel: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  // 1024px 以上へリサイズしたらドロワー状態を捨てる（開いたまま帯を跨ぐと
  // ≥1024 で絶対配置の残骸が残る）。
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => mq.matches && setOpen(false);
    mq.addEventListener("change", onChange);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      mq.removeEventListener("change", onChange);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const bar = `block w-5 h-[1.5px] transition-colors ${open ? "bg-accent" : "bg-muted group-hover:bg-accent"}`;

  return (
    <>
      <button
        type="button"
        data-hb
        aria-label={menuLabel}
        aria-expanded={open}
        aria-controls="header-tablet-nav"
        onClick={() => setOpen((v) => !v)}
        className="group min-[1024px]:hidden shrink-0 -ml-2 w-10 h-10 flex flex-col items-center justify-center gap-1 cursor-pointer"
      >
        <span className={bar} />
        <span className={bar} />
        <span className={bar} />
      </button>
      <div
        id="header-tablet-nav"
        // ヘッダーは layout 常駐でクライアント遷移してもアンマウントされないため、
        // ドロワー内リンクで遷移した後も開いたまま残っていた（ユーザー報告 2026-08-12）。
        // effect で pathname を見る方式は react-hooks/set-state-in-effect に当たるので、
        // リンククリック（イベント）で閉じる。ハッシュ遷移や同一ページ遷移でも閉じる。
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) setOpen(false);
        }}
        className={
          "max-[1024px]:absolute max-[1024px]:inset-x-0 max-[1024px]:top-full max-[1024px]:z-10 " +
          // 半透明だと背後のページ本文が透けて読みにくかった（実測スクショ）ので不透明。
          "max-[1024px]:bg-bg max-[1024px]:border-b max-[1024px]:border-line " +
          "max-[1024px]:pt-1 max-[1024px]:pb-3 " +
          (open ? "" : "max-[1024px]:hidden")
        }
      >
        <div className="max-[1024px]:frame">{children}</div>
      </div>
    </>
  );
}
