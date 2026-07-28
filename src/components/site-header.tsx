import Link from "next/link";
import { Show, UserButton } from "@clerk/nextjs";
import { getCurrentUser } from "@/lib/dal";
import { roleLabel } from "@/lib/account-schema";
import { listNotifications } from "@/lib/notifications";
import HeaderMark from "@/components/header-mark";
import CartLink from "@/components/cart-link";
import NotificationBell from "@/components/notification-bell";
import LangToggle from "@/components/lang-toggle";
import HeaderTabletNav from "@/components/header-tablet-nav";
import HeaderAuthButtons from "@/components/header-auth-buttons";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref, translate, type DictKey } from "@/lib/i18n/dictionaries";

const NAV: { href: string; key: DictKey; code: string }[] = [
  { href: "/properties", key: "nav.properties", code: "0.1" },
  { href: "/pricing", key: "nav.pricing", code: "0.2" },
  { href: "/about", key: "nav.about", code: "0.3" },
  { href: "/contact", key: "nav.contact", code: "0.4" },
];

export default async function SiteHeader() {
  const user = await getCurrentUser();
  // 通知はこれまで /account に来ないと存在に気づけなかった。ヘッダーのベルで
  // 未読件数を常時見せ、押せばその場で最近の通知一覧をドロップダウン表示する
  // （マイページへ飛ばさずに読める）。集計・取得はサインイン時のみサーバー側。
  const notifications = user ? await listNotifications(user.id) : [];
  const unreadCount = notifications.filter((n) => !n.read).length;
  // ドロップダウンには最近分のみ渡す（全件はマイページの一覧で。payload を絞る）。
  const recentNotifications = notifications.slice(0, 12);
  const locale = await getLocale();
  const t = (k: DictKey) => translate(locale, k);
  const lh = (href: string) => localizedHref(href, locale);
  const scanUrl = locale === "en" ? "https://web.locahun3d.com/en/" : "https://web.locahun3d.com/";
  // EN版はブランド表記も英字に切り替える（マーク自体は共通）。
  const brandName = locale === "en" ? "Locahun3D" : "ロケハン3D";

  /**
   * 帯の構成（スキャンサイト assets/site-header.css と完全に同じ切り方）:
   *   <720px      : 2段ヘッダー（スマホ。ハンバーガーには畳まない）
   *   720–1023px  : 1行。左=ハンバーガー / 中央=ブランド＋トグル / 右=最小限
   *   ≥1024px     : 1行フルナビ（従来どおり）
   * 切替は min-[720px]: / max-[1024px]: で書くこと（Tailwind lg=1024 や md=768 の
   * ショートハンドと混ぜると出力順で後勝ちし境界がズレる実害があった）。
   * ⚠ 経緯: 1200px → 768px → 720px。
   *   1200px の頃は html の zoom(<1200px=0.7) でレイアウト実効幅が 820/0.7=1171px
   *   相当に広がる一方 @media は実寸評価なので「中身は広いのにヘッダーだけ2段」
   *   ＝2段目が丸ごと空白、という崩れが出ていた。
   *   768px にした後も iPad mini 6 縦(744px)がスマホ扱いに落ちるのが残ったため
   *   720px へ下げた。globals.css の zoom ティア境界も同じ 720px。
   *   （どちらか片方だけ変えると再発する）
   * 2段側は「PC/モバイルで見える要素を変えない、サイズ調整のみで揃える」という
   * 明示の指示に基づく（実測: 全要素を1行9pxに詰めても600px超で320-390px
   * 幅には物理的に収まらないため、2段構成で妥協）。
   */
  // modal 経路の着地先は client 側で現在パスから決める（HeaderAuthButtons）。
  // ヘッダーは全ページ共通なので、サーバーで固定値を渡すと
  // 「どのページで押しても同じ場所に着地」になってしまう。
  const authButtons = (
    <HeaderAuthButtons loginLabel={t("auth.login")} signupLabel={t("auth.signup")} />
  );

  const authSignedIn = (
    <Show when="signed-in">
      {user && (
        <Link
          href={lh("/account")}
          className="flex items-center gap-1 min-[720px]:gap-1.5 min-[1200px]:gap-2 text-[9px] min-[720px]:text-[11px] min-[1200px]:text-[12px] mono tracking-[0.05em] min-[720px]:tracking-[0.12em] min-[1200px]:tracking-[0.18em] uppercase text-muted hover:text-accent transition whitespace-nowrap"
        >
          {/* 権限バッジ（例「撮影スタジオ」）は 720–1023px では出さない。
              ハンバーガー化したこの帯はサインイン時の右側が最も混み、バッジを
              足すと中央のブランド／トグルに寄ってくる。1024px 以上は元どおり表示。
              ⚠ 範囲は max-[Npx] で排他にすること（sm: と min-[720px]: を
              同じプロパティで重ねると出力順で勝敗が不定になる）。 */}
          <span className="hidden sm:max-[720px]:inline min-[1024px]:inline border border-line px-1 min-[720px]:px-1.5 py-0.5 text-[8px] min-[720px]:text-[10px] min-[1200px]:text-[9px]">
            {roleLabel(user.role, locale)}
          </span>
          <span className="hidden min-[360px]:inline">{t("auth.mypage")}</span>
        </Link>
      )}
      {/* スタジオ(掲載者)の入口。これが無いと、掲載ページを作る権限はあるのに
          /admin/properties を直接URLで教えてもらう以外に辿り着けなかった。 */}
      {user?.role === "studio" && (
        <Link
          href={lh("/admin/properties")}
          className="hidden min-[1200px]:inline-block px-2 min-[1200px]:px-3 py-1 min-[1200px]:py-1.5 text-[9px] min-[1200px]:text-[10px] mono tracking-[0.14em] min-[1200px]:tracking-[0.22em] uppercase text-muted border-l border-line pl-2 min-[1200px]:pl-3 hover:text-accent transition whitespace-nowrap"
        >
          ⌂ {locale === "en" ? "Listings" : "掲載管理"}
        </Link>
      )}
      {/* 管理者リンクはPC専用（旧 mobile-nav.tsx から踏襲、モバイルは基本操作しないため非表示） */}
      {user?.role === "admin" && (
        <Link
          href={lh("/admin")}
          className="hidden min-[1200px]:inline-block px-2 min-[1200px]:px-3 py-1 min-[1200px]:py-1.5 text-[9px] min-[1200px]:text-[10px] mono tracking-[0.14em] min-[1200px]:tracking-[0.22em] uppercase text-muted border-l border-line pl-2 min-[1200px]:pl-3 hover:text-accent transition whitespace-nowrap"
        >
          ⚙ {t("auth.admin")}
        </Link>
      )}
      {user && (
        <NotificationBell notifications={recentNotifications} unreadCount={unreadCount} locale={locale} en={locale === "en"} />
      )}
      <UserButton appearance={{ elements: { avatarBox: "w-6 h-6 min-[720px]:w-7 min-[720px]:h-7" } }} />
    </Show>
  );

  // トグルの状態規則（スキャンサイトと共通）:
  // 各セルは常に自サービス色のボーダー50%、アクティブ側のみ bg12%+文字を
  // サービス色に。数値もスキャン側 @media(max-width:1199px) ブロックと1:1。
  const scanOnlineToggle = (
    <div className="flex items-stretch brand text-[7px] min-[360px]:text-[8px] min-[720px]:text-[9px] min-[1200px]:text-[11px] tracking-[0.02em] min-[720px]:tracking-[0.04em] min-[1200px]:tracking-[0.06em]">
      <a
        href={scanUrl}
        className="px-[3px] min-[360px]:px-1 min-[720px]:px-1.5 min-[1200px]:px-3 py-0.5 min-[720px]:py-[3px] min-[1200px]:py-1 border border-[#ffb454]/50 text-ink hover:bg-[#ffb454] hover:text-bg transition whitespace-nowrap"
      >
        {t("header.scan")}
      </a>
      <a
        href={lh("/properties")}
        className="px-[3px] min-[360px]:px-1 min-[720px]:px-1.5 min-[1200px]:px-3 py-0.5 min-[720px]:py-[3px] min-[1200px]:py-1 border border-l-0 border-[#5ec8e8]/50 text-[#5ec8e8] bg-[#5ec8e8]/12 hover:bg-[#5ec8e8] hover:text-bg transition whitespace-nowrap"
      >
        {t("header.online")}
      </a>
    </div>
  );

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/95 backdrop-blur-sm">
      {/* ══ PC/タブレット(720px+) — 1行 ══
          720–1023px（iPad縦）だけ左をハンバーガー、中央をブランド絶対中央寄せに
          切り替える。1024px 以上は従来どおり 左=ナビ / 中央=ブランド / 右=操作。 */}
      <div className="hidden min-[720px]:flex frame items-center h-16 gap-2 min-[1200px]:gap-3">
        <div className="flex items-center gap-4 xl:gap-7 flex-1 min-w-0">
          <HeaderTabletNav menuLabel={locale === "en" ? "Menu" : "メニュー"}>
            <nav className="flex items-center gap-[11px] min-[1200px]:gap-4 min-[1440px]:gap-6 max-[1024px]:flex-col max-[1024px]:items-stretch max-[1024px]:gap-0">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={lh(n.href)}
                  className="group flex items-center gap-1.5 text-[13px] max-[1024px]:text-[14px] max-[1024px]:py-[11px] max-[1024px]:gap-2.5 font-light text-muted hover:text-ink transition-colors whitespace-nowrap"
                >
                  <span className="hidden min-[1440px]:inline mono text-[10px] tracking-[0.2em] opacity-50 group-hover:text-accent group-hover:opacity-100 transition">
                    {n.code}
                  </span>
                  {t(n.key)}
                </Link>
              ))}
              {/* 掲載管理 / 管理 の入口は右側に置いてあるが `hidden min-[1200px]:inline-block`
                  なので 720–1199px では完全に消えていた（実測: 744/768/820/834/1024/1180 で
                  リンクが存在しない）。「これが無いと掲載ページに辿り着けない」入口なので、
                  この帯だけナビ側（720–1023はドロワー / 1024–1199は1行ナビ）に出す。
                  ≥1200px は従来の右側リンクがあるので min-[1200px]:hidden で重複を防ぐ。 */}
              {user?.role === "studio" && (
                <Link
                  href={lh("/admin/properties")}
                  className="min-[1200px]:hidden flex items-center gap-1.5 text-[13px] max-[1024px]:text-[14px] max-[1024px]:py-[11px] max-[1024px]:gap-2.5 font-light text-accent hover:text-ink transition-colors whitespace-nowrap"
                >
                  ⌂ {locale === "en" ? "Listings" : "掲載管理"}
                </Link>
              )}
              {user?.role === "admin" && (
                <Link
                  href={lh("/admin")}
                  className="min-[1200px]:hidden flex items-center gap-1.5 text-[13px] max-[1024px]:text-[14px] max-[1024px]:py-[11px] max-[1024px]:gap-2.5 font-light text-accent hover:text-ink transition-colors whitespace-nowrap"
                >
                  ⚙ {t("auth.admin")}
                </Link>
              )}
            </nav>
          </HeaderTabletNav>
        </div>

        {/* 720–1199px: ヘッダー全幅に重ねた 1fr auto 1fr グリッドの2列目にブランドを
            置き、ブランドの水平中心をビューポート中心へ固定する。
            ⚠ 上端は max-[1200px]（=1199px まで）。以前は max-[1024px] で、
            1024–1199px（iPad 横向きの全機種: 1024/1080/1133/1180/1194）だけが
            この仕掛けから外れ、左右 flex-1 による「グループ中央寄せ」に落ちていた。
            グループ中央寄せは zoom 倍率でズレ量が変わるため、スキャンサイトとは
            実測で 320〜405px ずれ、1023→1024 の境界でも位置が飛んでいた。
            ⚠ これがスキャンサイト(assets/site-header.css 同帯)とブランド中心X座標を
            ±0px で一致させる仕掛け。「中央＝幅の50%」は html の zoom 倍率に
            依存しないので、zoom 0.8 のオンライン版でも実画面座標で一致する。
            グループ全体を中央寄せにするとトグル幅の半分だけズレる上、zoom 差で
            そのズレ量が両サイトで揃わない（実測 約10px）ため必ずブランド単体を
            中央列に置くこと。
            ⚠ 中心の基準は「100vw の 50%」。inset-x-0 だけだと基準が html の
            コンテンツ幅になり、scrollbar-gutter:stable が予約する 15px の分だけ
            スキャンサイトより 7.5px 左へずれる（実測）。translateX で
            (100vw/--z − 自分の幅)/2 だけ右へ戻すと、ガターの有無に関わらず
            中心が常に 50vw になる（ガター0の環境では自動的に 0px）。
            vw は zoom の影響を受けない実画面基準なので /var(--z) で割り戻す。 */}
        <div className="flex items-center gap-2.5 flex-shrink-0 max-[1200px]:grid max-[1200px]:grid-cols-[1fr_auto_1fr] max-[1200px]:gap-0 max-[1200px]:absolute max-[1200px]:inset-x-0 max-[1200px]:top-0 max-[1200px]:h-16 max-[1200px]:pointer-events-none max-[1200px]:translate-x-[calc((100vw/var(--z)-100%)/2)]">
          <Link
            href={lh("/")}
            aria-label={brandName}
            className="flex items-center gap-2.5 max-[1200px]:col-start-2 max-[1200px]:row-start-1 max-[1200px]:gap-1.5 max-[1200px]:pointer-events-auto"
          >
            <HeaderMark />
            <span className="brand text-lg tracking-[0.01em] whitespace-nowrap">{brandName}</span>
          </Link>
          <div className="hidden min-[720px]:block ml-1 max-[1200px]:col-start-3 max-[1200px]:row-start-1 max-[1200px]:justify-self-start max-[1200px]:ml-2 max-[1200px]:pointer-events-auto">
            {scanOnlineToggle}
          </div>
          <LangToggle className="hidden 2xl:inline-block" />
        </div>

        <div className="flex items-center gap-3 max-[1024px]:gap-2 flex-1 justify-end min-w-0 max-[1200px]:relative max-[1200px]:z-[1]">
          <LangToggle className="2xl:hidden" />
          <CartLink />
          {authButtons}
          {authSignedIn}
        </div>
      </div>

      {/* ══ モバイル(720px未満) — 2段。PCと同じ要素をサイズ調整して
          全て表示する（要素の非表示・ハンバーガー化はしない）。 ══ */}
      <div className="min-[720px]:hidden frame">
        {/* 1段目: ロゴ / スキャン・オンライン / EN / カート / 認証。
            768px以上（タブレット帯）はスマホ極小サイズのままだと余白だらけで
            崩れて見えるため、中間サイズへ拡大する（スキャンサイトと数値共通）。 */}
        <div className="flex items-center h-12 min-[768px]:h-14 gap-0.5 min-[360px]:gap-1 min-[768px]:gap-2">
          <Link href={lh("/")} aria-label={brandName} className="flex items-center gap-1 min-[768px]:gap-2 shrink-0">
            <HeaderMark size={18} />
            <span className="brand text-[11px] min-[360px]:text-[13px] min-[768px]:text-[16px] tracking-[0.01em] whitespace-nowrap">
              {brandName}
            </span>
          </Link>
          <div className="shrink-0">{scanOnlineToggle}</div>
          <div className="flex-1" />
          <LangToggle className="shrink-0" compact />
          <div className="shrink-0">
            <CartLink />
          </div>
          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
            {authButtons}
            {authSignedIn}
          </div>
        </div>
        {/* 2段目: 主要ナビ。番号コードはモバイル非表示・中央寄せ
            （スキャンサイトのモバイルnavと書体/サイズ/整列を1:1で共通化）。 */}
        <nav className="flex flex-wrap items-center justify-center gap-x-3 min-[768px]:gap-x-6 gap-y-1 pb-2 min-[768px]:pb-2.5">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={lh(n.href)}
              className="text-[11px] min-[768px]:text-[13px] font-light text-muted hover:text-ink transition-colors whitespace-nowrap"
            >
              {t(n.key)}
            </Link>
          ))}
          {/* PC同様、studio(掲載者)にだけ掲載管理への入口をモバイルにも出す。
              admin向けリンクは既存方針どおりモバイル非表示のまま。 */}
          {user?.role === "studio" && (
            <Link
              href={lh("/admin/properties")}
              className="text-[11px] min-[768px]:text-[13px] font-light text-accent hover:text-ink transition-colors whitespace-nowrap"
            >
              {locale === "en" ? "Listings" : "掲載管理"}
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
