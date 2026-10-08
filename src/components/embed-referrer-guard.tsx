"use client";

import { useEffect, useState } from "react";
import { isReferrerAllowed } from "@/lib/embed-domains";

/**
 * 埋め込みの「貼ってよいサイト」の補助チェック（2026-10-08・利用規約 第7条）。
 *
 * 本命は middleware が付ける CSP frame-ancestors（ブラウザが表示自体を拒否する）。
 * これは CSP が付かなかった場合（取得失敗・時間切れ等）の保険で、iframe の親ページ
 * （document.referrer）が許可リストの外なら中身を出さない。
 * referrer が空（送らない設定・直接開いた）のときは判定できないので止めない。
 * 許可リストが空なら何もしない（既存の埋め込みは従来どおり）。
 */
export default function EmbedReferrerGuard({
  allowedDomains,
  fallback,
  children,
}: {
  allowedDomains: string[];
  fallback: React.ReactNode;
  children: React.ReactNode;
}) {
  const restricted = allowedDomains.length > 0;
  const [state, setState] = useState<"checking" | "ok" | "blocked">(restricted ? "checking" : "ok");

  useEffect(() => {
    if (!restricted) return;
    const ok = isReferrerAllowed(document.referrer, allowedDomains, window.location.origin);
    // 判定は表示後に1回だけ（document.referrer はサーバーでは読めない）。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(ok ? "ok" : "blocked");
  }, [restricted, allowedDomains]);

  if (state === "blocked") return <>{fallback}</>;
  if (state === "checking") return <div className="w-full h-full bg-bg" aria-busy="true" />;
  return <>{children}</>;
}
