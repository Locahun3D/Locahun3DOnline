import "@/lib/env";
import {ClerkProvider} from "@clerk/nextjs";
import { jaJP, enUS } from "@clerk/localizations";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { Noto_Sans_JP, JetBrains_Mono } from "next/font/google";
import "./globals.css";
// ⚠ 2026-09-03 works 統合まで、このCSSの正本は digiroke3d_Web/assets/site-header.css
//    で、scripts/sync-header-css.mjs が機械コピーしていた。マーケサイトの静的
//    ヘッダーが無くなった（works も本物の SiteHeader を使う）ので同期は廃止し、
//    **このファイルが正本**になった。ここを直接編集してよい。
//    globals.css の後に読むことで、ヘッダーのスタイルが本文側の指定に負けない。
import "./site-header.css";
import SiteHeader from "@/components/site-header";
import ClerkPopoverZoomFix from "@/components/clerk-popover-zoom-fix";
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

// @clerk/localizations の jaJP は formFieldInputPlaceholder__signUpPassword が未訳で、
// Clerk のデフォルト英語 "Create a password" にフォールバックしてしまう。実在キーのみ上書き。
const jaJPFixed = {
  ...jaJP,
  formFieldInputPlaceholder__signUpPassword: "パスワードを入力",
  // Clerk 既定の見出しは applicationName を差し込むため、ダッシュボード上の
  // インスタンス名がそのまま出る（実機で「Locahun3d_Online にサインイン」と
  // アンダースコア込みで表示されていた）。サービス名を固定で出す。
  signIn: {
    ...jaJP.signIn,
    start: {
      ...jaJP.signIn?.start,
      title: "ロケハン3D オンラインにログイン",
      subtitle: "おかえりなさい。続けるにはログインしてください。",
    },
  },
  signUp: {
    ...jaJP.signUp,
    start: {
      ...jaJP.signUp?.start,
      title: "ロケハン3D オンラインに登録",
      subtitle: "アカウントを作成して、3Dロケハンを始めましょう。",
    },
  },
};

/** EN 側も同じ理由で見出しだけ固定する。 */
const enUSFixed = {
  ...enUS,
  signIn: {
    ...enUS.signIn,
    start: {
      ...enUS.signIn?.start,
      title: "Sign in to Locahun 3D Online",
      subtitle: "Welcome back. Sign in to continue.",
    },
  },
  signUp: {
    ...enUS.signUp,
    start: {
      ...enUS.signUp?.start,
      title: "Create your Locahun 3D Online account",
      subtitle: "Sign up to start scouting locations in 3D.",
    },
  },
};

/**
 * Clerk ウィジェットのブランド適用。
 *
 * 未設定だと Clerk 既定のライトテーマ（白カード・濃灰テキスト・灰ボタン）が
 * そのまま出るため、黒基調の当サイト上で完全に浮いていた（特にスマホでは
 * 画面の大半を占めるので影響が大きい）。加えて既定カードは幅が内容依存で、
 * 390px 端末で実測 245px しか使わず左右が大きく余っていた。
 *
 * 色は globals.css の @theme と同じ値を直接指定する（Clerk は Shadow DOM 外
 * だが独自のスタイル注入をするため、CSS 変数ではなく実値を渡すのが確実）。
 */
const clerkAppearance = {
  // ⚠ 変数名は @clerk/nextjs 7 系の名前を使うこと。旧名 (colorText /
  // colorTextSecondary / colorInputBackground / colorInputText) は型でも実行時でも
  // 黙って無視され、既定のライトテーマの文字色が残る＝暗いカードに暗い文字で
  // ほぼ判読不能になる（実際に踏んだ）。正しくは colorForeground /
  // colorMutedForeground / colorInput / colorInputForeground。
  variables: {
    colorPrimary: "#ffb454",
    colorPrimaryForeground: "#000000",
    colorBackground: "#111111",
    colorForeground: "#fafaf6",
    colorMutedForeground: "#9b9b93",
    // ソーシャルログインボタン等の文字色はこの neutral から α で生成される。
    // 既定(黒)のままだと暗いカード上で「Googleで続ける」がほぼ読めない。
    colorNeutral: "#fafaf6",
    colorMuted: "#1c1c1c",
    colorBorder: "#2a2a2a",
    colorInput: "#1c1c1c",
    colorInputForeground: "#fafaf6",
    colorDanger: "#ff6b6b",
    colorSuccess: "#4ade80",
    colorModalBackdrop: "rgba(0,0,0,0.72)",
    borderRadius: "2px",
    fontFamily: "var(--font-sans), sans-serif",
  },
  // 色は variables 側で完結させる（要素クラスは Clerk 内部CSSとの詳細度争いに
  // なり効かないことがある）。ここではレイアウトだけ補正する。
  elements: {
    rootBox: "w-full",
    card: "w-full",
  },
  // ⚠ 幅制限は「1カラムの認証カード」だけに掛けること。
  // Clerk 内部クラスが cl-cardBox に max-width:335px を当てており、素の
  // max-w-[420px] では詳細度で負ける（390px 端末で実測 235px しか使わず、
  // 左右に大きな余白が出ていた）。Tailwind v4 の important 修飾子（末尾 `!`）
  // で上書きするが、これを elements(全コンポーネント共通)に置くと
  // **UserProfile モーダルまで 420px に潰れる**。あちらは
  // 「左ナビ＋右詳細」の2カラムで 880px 前後を前提にしており、420px だと
  // 右カラムにメールアドレスや連携アカウントの値が入らず「…」ボタンだけが
  // 残り、横スクロールバーが出る（2026-07-22 に実機で発生）。
  signIn: { elements: { cardBox: "w-full max-w-[420px]! mx-auto" } },
  signUp: { elements: { cardBox: "w-full max-w-[420px]! mx-auto" } },
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const en = locale === "en";
  return {
    metadataBase: new URL("https://locahun3d.com"),
    title: en
      ? {
          default: "Locahun 3D Online | Bring the set home in 3DGS",
          template: "%s | Locahun 3D Online",
        }
      : {
          default: "ロケハン3D オンライン｜3DGS で現場を持ち帰る",
          template: "%s｜ロケハン3D オンライン",
        },
    description: en
      ? "Locahun 3D Online captures real spaces with 3D Gaussian Splatting so you can scout studios and locations, verify framing and lighting — all in the browser before the shoot."
      : "ロケハン3D オンラインは、実空間を 3D Gaussian Splatting で持ち帰り、ブラウザだけで現場検証・スタジオ検索・撮影前ロケハンを完結させるサービスです。",
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
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  // 掲載者サイトへ iframe で貼られる埋め込みページ(/embed/*)では、当社の
  // ヘッダー・フッターを出さない（掲載者のサイト内にナビが二重に現れて
  // デザインを壊すため）。App Router の layout は自分の pathname を知れないので
  // middleware が付ける x-embed で判定する（DECISION_LOG D-008）。
  const h = await headers();
  const bare = h.get("x-embed") === "1";
  return (
    <html
      lang={locale}
      className={`${serif.variable} ${sans.variable} ${mono.variable}`}
    >
      {/* ⚠ min-h-screen(=100vh) は使わない。html に zoom が掛かっているため
          100vh は「ズーム後の座標系」で解決され、実画面より短くなる。結果、
          内容の少ないページ(/sign-in, /cart 等)でフッターが画面途中で終わり、
          その下に黒い空白が残っていた（実測: 390px で147px、820pxで236px、
          1440pxで75px）。実画面基準の高さは --z 規約どおり calc(100vh/var(--z))。 */}
      <body className={bare ? "" : "min-h-[calc(100vh/var(--z))] flex flex-col"}>
        <LocaleProvider locale={locale}>
          <ClerkProvider
            localization={locale === "en" ? enUSFixed : jaJPFixed}
            appearance={clerkAppearance}
          >
            {bare ? (
              children
            ) : (
              <>
                <ClerkPopoverZoomFix />
                <SiteHeader />
                {/* [&>*]:flex-1 — 短いページでライト背景(theme-online)がフッター手前で
                    途切れ、黒い埋め草が「黒帯」に見える実害があったため、
                    ページ直下のラッパーを常に main いっぱいまで伸ばす。 */}
                <main className="flex-1 flex flex-col [&>*]:flex-1">{children}</main>
                <SiteFooter />
              </>
            )}
          </ClerkProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}