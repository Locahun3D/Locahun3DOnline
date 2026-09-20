import type { ReactNode } from "react";

/**
 * 2026-09-20: 管理画面共通の小さなページ見出し。
 * 公開側の `ui-page-title`（42〜60px）＋長いリード文は、管理ツールでは1画面目を食うだけなので使わない。
 * タイトル 20px・説明は1行（13px）・右に操作スロット。iPad 横(1180×820)で1行目のデータが
 * スクロールなしに見えることを目的にしている。
 * 繰り返し読む必要のない説明は `help`（折りたたみ「使い方」）へ。
 */
export default function AdminPageHeader({
  title,
  count,
  description,
  actions,
  help,
  back,
}: {
  title: ReactNode;
  /** タイトル横に小さく出す件数など */
  count?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** 折りたたみの「使い方」に入れる補足 */
  help?: ReactNode;
  /** タイトル上の戻りリンク */
  back?: ReactNode;
}) {
  return (
    <header className="mb-4 border-b border-line pb-3">
      {back && <div className="mb-1 text-[12px]">{back}</div>}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="m-0 text-[20px] font-bold leading-[1.4] break-words">{title}</h1>
          {count != null && <span className="text-[13px] text-muted">{count}</span>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {description && <p className="mt-1 text-[13px] leading-[1.6] text-muted">{description}</p>}
      {help && (
        <details className="mt-1 text-[12px] text-muted">
          <summary className="inline-flex min-h-[32px] cursor-pointer items-center hover:text-ink">使い方</summary>
          <div className="max-w-[80ch] pb-1 leading-[1.8]">{help}</div>
        </details>
      )}
    </header>
  );
}

/**
 * 2026-09-20: 絞り込みタブ（受信箱/アーカイブ・種別など）の共通クラス。
 * iPad で押しやすいよう高さ 40px を確保する。
 */
export function adminChip(active: boolean) {
  return `inline-flex min-h-[40px] items-center border px-3 text-[12px] transition ${
    active ? "border-accent text-accent" : "border-line text-muted hover:border-ink hover:text-ink"
  }`;
}

/** 2026-09-20: 空状態は1行で（半画面を占める箱にしない）。 */
export function AdminEmpty({ children }: { children: ReactNode }) {
  return <p className="border border-line px-4 py-3 text-[13px] text-muted">{children}</p>;
}

/** 2026-09-20: 管理ページ共通の外枠。余白を全ページで揃える（上 16px・左右 16/24/32px）。 */
export function AdminPageShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`px-4 pt-4 pb-8 sm:px-6 lg:px-8 ${className}`}>{children}</div>;
}
