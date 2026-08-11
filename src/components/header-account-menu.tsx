"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * スマホ用のアカウントメニュー（バー右端のアイコン → 押すと下に開く）。
 *
 * なぜ要るか: 狭い画面では EN / カート / ログイン / 新規登録 をバーに置けず
 * ハンバーガーの中へ退避させていたが、「ログイン導線がナビの奥にあるのは困る。
 * ヘッダー右に出してほしい」という指摘を受けた（2026-07-29）。
 * バーに常時展開すると 375px でブランドの中央ぞろえが崩れる（実測 -16px）ため、
 * 「アイコン1つだけ置いて、押したら開く」形にした。
 *
 * ⚠ 左のハンバーガー（ナビ専用）とは別物。役割を混ぜないこと:
 *     左 ☰ = ページ移動 / 右 ● = アカウント・言語・カート
 * ⚠ 表示幅はバー側の出し分けと必ず対にする。現在は 1024px 未満で出す:
 *     768–1023px … 中身は EN のみ（カート/認証はバーに並ぶ）
 *     <768px     … EN＋カート＋認証（バー側は max-[768px]:hidden）
 *   1024px 以上はバーに EN が出るのでこのボタン自体を出さない。
 *   閾値 1024px はスキャンサイト assets/site-header.css の .sh-acct と対。
 *   片方だけ変えると「ENの場所がサイトで違う」に逆戻りする。
 */
export default function HeaderAccountMenu({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // ヘッダーは layout 常駐でクライアント遷移してもアンマウントされないため、
  // パネル内リンクで遷移した後も開いたまま残る（下の「遷移すればアンマウント
  // される」という旧コメントは SPA 遷移では成り立たない）。pathname で閉じる。
  const pathname = usePathname();
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    // 1024px 以上へリサイズしたら閉じる（バー側に EN が出るため二重になる）。
    const mq = window.matchMedia("(min-width: 1024px)");
    const onMq = () => mq.matches && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    // 外側タップで閉じる。パネル内のリンクは stopPropagation せず素通しで良い
    // （遷移すればアンマウントされる）。
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    mq.addEventListener("change", onMq);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      mq.removeEventListener("change", onMq);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="min-[1024px]:hidden relative shrink-0">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls="header-account-menu"
        onClick={() => setOpen((v) => !v)}
        className="w-9 h-9 -mr-1.5 flex items-center justify-center text-muted hover:text-accent transition cursor-pointer"
      >
        {/* 人型アイコン。カート等と並べても意味が衝突しない汎用の「アカウント」記号。 */}
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
             strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="8" r="3.4" />
          <path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" />
        </svg>
      </button>

      {open && (
        <div
          id="header-account-menu"
          className="absolute right-0 top-full mt-1 z-20 border border-line bg-bg px-4 py-3 flex flex-col items-stretch gap-3"
        >
          {children}
        </div>
      )}
    </div>
  );
}
