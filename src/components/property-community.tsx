"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * レビュー・掲示板・問い合わせを1枚のカードに統合するタブコンテナ。
 * 旧レイアウトでは3つの独立セクション（各カード＋見出し＋空状態）が縦に並び、
 * 特に0件時の空白が大きかった。タブ化で常に1つ分の高さに収まる。
 *
 * - 問い合わせ先が無い物件では「問い合わせ」タブ自体を出さない
 *   （旧: 「受け付けていません」だけのカードが1画面分占有していた）
 * - ★保存（ブックマーク）はタブ行の右端に常設
 * - #inquiry アンカーで遷移してきた場合は問い合わせタブを初期選択
 */
export default function PropertyCommunity({
  reviewCount,
  commentCount,
  hasContact,
  reviewsSlot,
  boardSlot,
  contactSlot,
  bookmarkSlot,
  locale = "ja",
}: {
  reviewCount: number;
  commentCount: number;
  hasContact: boolean;
  reviewsSlot: ReactNode;
  boardSlot: ReactNode;
  contactSlot: ReactNode;
  bookmarkSlot: ReactNode;
  locale?: "ja" | "en";
}) {
  const en = locale === "en";
  const [tab, setTab] = useState<"reviews" | "board" | "contact">("reviews");

  // 問い合わせ導線（ヒーロー等）から #inquiry で飛んできたら問い合わせタブを開く
  useEffect(() => {
    if (hasContact && typeof window !== "undefined" && window.location.hash === "#inquiry") {
      setTab("contact");
    }
  }, [hasContact]);

  const tabs: { key: "reviews" | "board" | "contact"; label: string }[] = [
    { key: "reviews", label: en ? `Reviews (${reviewCount})` : `レビュー (${reviewCount})` },
    { key: "board", label: en ? `Board (${commentCount})` : `掲示板 (${commentCount})` },
    ...(hasContact
      ? [{ key: "contact" as const, label: en ? "Contact" : "問い合わせ" }]
      : []),
  ];

  return (
    <div>
      <div className="flex items-center gap-0.5 border-b border-line mb-6 flex-wrap">
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-selected={active}
              className={`mono text-[10.5px] tracking-[0.18em] uppercase px-4 py-2.5 -mb-px border-b-2 transition ${
                active
                  ? "border-accent text-ink font-bold"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          );
        })}
        <div className="ml-auto pb-1.5 pl-2">{bookmarkSlot}</div>
      </div>

      {/* 非アクティブタブは DOM から外さず hidden にする（タブ切替のたびに
          楽観状態・入力途中のフォームが消えないように）。 */}
      <div className={tab === "reviews" ? "" : "hidden"}>{reviewsSlot}</div>
      <div className={tab === "board" ? "" : "hidden"}>{boardSlot}</div>
      {hasContact && <div className={tab === "contact" ? "" : "hidden"}>{contactSlot}</div>}
    </div>
  );
}
