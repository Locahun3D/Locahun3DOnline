import "@/lib/env";
import {ClerkProvider} from "@clerk/nextjs";
import { jaJP, enUS } from "@clerk/localizations";
import type { Metadata } from "next";
import { Noto_Sans_JP, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";
import { LocaleProvider } from "@/components/locale-provider";
import { getLocale } from "@/lib/i18n/server";

// 明朝体は全面禁止。`--font-serif` も Noto Sans JP（ゴシック）に振り替え、
// `serif` ユーティリティ / Tailwind `font-serif` / `.leader` をすべてゴシックで描画する。
const serif = Noto_Sans_JP({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["200", "300", "400", "700", "900"],
  display: "swap",
});

const sans = Noto_Sans_JP({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["200", "300", "400", "600", "700", "900"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["300", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://locahun3d.com"),
  title: {
    default: "ロケハン3D オンライン｜3DGS で現場を持ち帰る",
    template: "%s｜ロケハン3D オンライン",
  },
  description:
    "ロケハン3D オンラインは、実空間を 3D Gaussian Splatting で持ち帰り、ブラウザだけで現場検証・スタジオ検索・撮影前ロケハンを完結させるサービスです。",
  // オンライン版の既定ファビコンは青。トップ (/) のみ page.tsx で白に上書きする。
  icons: { icon: "/icon-blue.svg" },
  openGraph: {
    type: "website",
    siteName: "ロケハン3D",
    locale: "ja_JP",
    images: [
      {
        url: "/og-cover.jpg",
        width: 1200,
        height: 630,
        alt: "ロケハン3D — 実空間を 3D Gaussian Splatting で持ち帰る",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og-cover.jpg"],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      className={`${serif.variable} ${sans.variable} ${mono.variable}`}
    >
      <body className="min-h-screen flex flex-col">
        <LocaleProvider locale={locale}>
          <ClerkProvider localization={locale === "en" ? enUS : jaJP}>
            <SiteHeader />
            <main className="flex-1">{children}</main>
            <SiteFooter />
          </ClerkProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}