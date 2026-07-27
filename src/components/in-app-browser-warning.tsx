"use client";

import { useEffect, useState } from "react";

/**
 * Googleは「安全なブラウザの使用」ポリシーにより、Instagram/LINE/Facebook等の
 * アプリ内蔵ブラウザ(WebView)からのGoogleサインインを拒否する
 * （accounts.google.com 側の「アクセスをブロック」画面 — こちらでは制御できない）。
 * 事前にアプリ内ブラウザを検知し、詰まる前に案内する。
 */
function detectInAppBrowser(ua: string): string | null {
  if (/Instagram/i.test(ua)) return "Instagram";
  if (/FBAN|FBAV/i.test(ua)) return "Facebook";
  if (/\bLine\//i.test(ua)) return "LINE";
  if (/MicroMessenger/i.test(ua)) return "WeChat";
  if (/TikTok|musical_ly/i.test(ua)) return "TikTok";
  if (/Twitter/i.test(ua)) return "X (Twitter)";
  return null;
}

/** 汎用 Android WebView（アプリ名が特定できないアプリ内ブラウザ全般）。 */
function isGenericWebview(ua: string): boolean {
  return /; wv\)/i.test(ua);
}

export default function InAppBrowserWarning({ locale = "ja" }: { locale?: "ja" | "en" }) {
  const en = locale === "en";
  const [appName, setAppName] = useState<string | null>(null);
  const [isWebview, setIsWebview] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || "";
    setAppName(detectInAppBrowser(ua));
    setIsWebview(isGenericWebview(ua));
  }, []);

  if (!appName && !isWebview) return null;

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — user can still long-press the address bar */
    }
  };

  return (
    <div className="mx-auto min-[1200px]:mx-0 w-full max-w-sm mb-5 border border-amber-300 bg-amber-50 rounded-md px-4 py-3.5 text-left">
      <div className="text-[12.5px] font-bold text-amber-900 mb-1.5">
        {en ? "⚠ Google sign-in may not work here" : "⚠ このままだとGoogleログインができない場合があります"}
      </div>
      <p className="text-[12px] text-amber-900/90 leading-[1.75] mb-2.5">
        {en ? (
          <>
            {appName ? `You're viewing this inside the ${appName} app's built-in browser` : "You appear to be inside an app's built-in browser"}
            . Google blocks sign-in from these for security reasons. Please open this page in Safari or Chrome instead
            {appName ? " (usually via the \"⋯\" or share menu → \"Open in Browser\")" : ""}.
          </>
        ) : (
          <>
            {appName ? `${appName}アプリ内のブラウザで開いています` : "アプリ内蔵のブラウザで開いています"}
            。セキュリティ上の理由でGoogleがこの状態でのログインをブロックします。
            {appName ? "画面右上の「…」または共有メニューから「ブラウザで開く」を選ぶか、" : ""}
            Safari・Chromeなど通常のブラウザで開き直してください。
          </>
        )}
      </p>
      <button
        type="button"
        onClick={copyUrl}
        className="mono text-[10.5px] tracking-[0.14em] uppercase border border-amber-400 text-amber-900 px-3 py-1.5 rounded-sm hover:bg-amber-100 transition"
      >
        {copied ? (en ? "✓ Copied" : "✓ コピーしました") : en ? "Copy this page's URL" : "このページのURLをコピー"}
      </button>
    </div>
  );
}
