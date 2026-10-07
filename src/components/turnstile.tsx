"use client";

import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile（ボット判定）。フォームの中に置くと、判定が通った時点で
 * `cf-turnstile-response` という hidden input をこの枠内に足す。サーバー側は
 * `verifyTurnstile`（src/lib/turnstile.ts）で照合する。
 *
 * ⚠ トークンは1回しか使えない。入力エラーで送信をやり直すときに古いトークンが
 *   残っていると必ず失敗するので、`resetKey`（useActionState の state）が
 *   変わるたびに widget を作り直す。
 * ⚠ 本番のサイトキーは locahun3d.com（とサブドメイン）でしか動かない。手元
 *   （localhost 等）では Cloudflare 公式のテスト用キー（常に通る）に切り替える。
 */
export const TURNSTILE_FIELD = "cf-turnstile-response";
const SITE_KEY = "0x4AAAAAADUtEHc2L0jw0MOL";
const TEST_SITE_KEY = "1x00000000000000000000AA";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SCRIPT_SRC;
      s.async = true;
      s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile")));
      s.onerror = () => {
        loading = null;
        reject(new Error("turnstile"));
      };
      document.head.appendChild(s);
    });
  }
  return loading;
}

export default function Turnstile({
  resetKey,
  theme = "light",
  en = false,
}: {
  resetKey?: unknown;
  theme?: "light" | "dark" | "auto";
  en?: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let id: string | null = null;
    let cancelled = false;
    const host = window.location.hostname;
    const prod = host === "locahun3d.com" || host.endsWith(".locahun3d.com");
    loadTurnstile()
      .then((ts) => {
        if (cancelled || !boxRef.current) return;
        id = ts.render(boxRef.current, {
          sitekey: prod ? SITE_KEY : TEST_SITE_KEY,
          theme,
          size: "flexible",
          language: en ? "en" : "ja",
          "response-field-name": TURNSTILE_FIELD,
          "refresh-expired": "auto",
        });
      })
      .catch(() => {
        // 読み込めない環境（拡張機能で遮断等）。サーバー側の照合で弾かれ、
        // 画面にはエラー文言が出る。
      });
    return () => {
      cancelled = true;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [resetKey, theme, en]);

  return <div ref={boxRef} className="min-h-[65px] w-full max-w-[400px]" />;
}
