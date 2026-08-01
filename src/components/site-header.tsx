import Link from "next/link";
import { Show, UserButton } from "@clerk/nextjs";
import { getCurrentUser } from "@/lib/dal";
import { listNotifications } from "@/lib/notifications";
import HeaderMark from "@/components/header-mark";
import CartLink from "@/components/cart-link";
import NotificationBell from "@/components/notification-bell";
import LangToggle from "@/components/lang-toggle";
import HeaderTabletNav from "@/components/header-tablet-nav";
import HeaderAuthButtons from "@/components/header-auth-buttons";
import HeaderAccountMenu from "@/components/header-account-menu";
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
  // ⚠ 表記はスキャンサイト scripts/sync_header.py の BRAND_TEXT と一字一句そろえること。
  //    以前ここだけ "Locahun3D"（スペース無し）で、EN版のブランド幅が
  //    両サイトで 131.2px / 131.5px と食い違っていた（2026-07-29 実測）。
  const brandName = locale === "en" ? "Locahun 3D" : "ロケハン3D";

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
          className="flex items-center gap-1.5 text-[11px] mono tracking-[0.12em] uppercase text-muted hover:text-accent transition whitespace-nowrap"
        >
          {/* ⚠ 権限バッジ（「個人」「撮影スタジオ」等）はヘッダーから外した。
              マイページで確認でき、毎ページ出す情報ではないため
              （2026-07-29 ユーザー判断）。右側が軽くなる副次効果もある。 */}
          <span className="hidden min-[360px]:inline">{t("auth.mypage")}</span>
        </Link>
      )}
      {/* スタジオ(掲載者)の入口。これが無いと、掲載ページを作る権限はあるのに
          /admin/properties を直接URLで教えてもらう以外に辿り着けなかった。 */}
      {user?.role === "studio" && (
        <Link
          href={lh("/admin/properties")}
          className="hidden min-[1200px]:inline-block px-3 py-1.5 text-[10px] mono tracking-[0.22em] uppercase text-muted border-l border-line pl-3 hover:text-accent transition whitespace-nowrap"
        >
          ⌂ {locale === "en" ? "Listings" : "掲載管理"}
        </Link>
      )}
      {/* 管理者リンクはPC専用（旧 mobile-nav.tsx から踏襲、モバイルは基本操作しないため非表示） */}
      {user?.role === "admin" && (
        <Link
          href={lh("/admin")}
          className="hidden min-[1200px]:inline-block px-3 py-1.5 text-[10px] mono tracking-[0.22em] uppercase text-muted border-l border-line pl-3 hover:text-accent transition whitespace-nowrap"
        >
          ⚙ {t("auth.admin")}
        </Link>
      )}
      {/* ⚠ ベルはアバター（UserButton）の右。並びは
          … マイページ / アバター / ベル。以前はベルがアバターの左だった。 */}
      <UserButton appearance={{ elements: { avatarBox: "w-7 h-7" } }} />
      {user && (
        <NotificationBell notifications={recentNotifications} unreadCount={unreadCount} locale={locale} en={locale === "en"} />
      )}
    </Show>
  );

  // トグルの状態規則（スキャンサイトと共通）:
  // 各セルは常に自サービス色のボーダー50%、アクティブ側のみ bg12%+文字を
  // サービス色に。数値もスキャン側 @media(max-width:1199px) ブロックと1:1。
  // ⚠ 寸法は全幅固定。幅で変えると回転で見た目が変わる（docs/header-rules.md R2）。
  //    値はスキャンサイト assets/site-header.css の .sh-toggle と 1:1。
  const scanOnlineToggle = (
    <div className="flex items-stretch brand text-[9px] tracking-[0.04em]">
      <a
        href={scanUrl}
        className="px-1.5 py-[3px] border border-[#ffb454]/50 text-ink hover:bg-[#ffb454] hover:text-bg transition whitespace-nowrap"
      >
        {t("header.scan")}
      </a>
      <a
        href={lh("/properties")}
        className="px-1.5 py-[3px] border border-l-0 border-[#5ec8e8]/50 text-[#5ec8e8] bg-[#5ec8e8]/12 hover:bg-[#5ec8e8] hover:text-bg transition whitespace-nowrap"
      >
        {t("header.online")}
      </a>
    </div>
  );

  return (
    // ⚠ ヘッダーだけ html の zoom を打ち消す。--z は 720/1200px で
    //    0.7→0.8→0.9 と段階的に変わるため、CSS値を固定しても実サイズが幅で変わり、
    //    端末を回転させるだけで見た目が変わっていた
    //    （iPhone15 縦0.7/横0.8、iPad Pro12.9 縦0.8/横0.9）。
    //    ズームの外に出すと CSS px = 実 px となりスキャンサイトと同一寸法になる。
    //    詳細は docs/header-rules.md の R2。
    <header
      // ⚠ line-height / letter-spacing は必ずここで打ち消す。指定が無いと body の
      //    1.8 を継承し、スキャンサイト(.site-header{line-height:1.5})より
      //    トグルの枠が縦に2.7px、ブランド文字が1px大きくなる
      //    （実測 390/820/1440 の全幅で再現。ユーザー報告「枠が拡大される」の正体）。
      //    横幅は一致していたため font-size だけ見ていては気づけなかった。
      style={{ zoom: "calc(1 / var(--z))", lineHeight: 1.5, letterSpacing: "normal" }}
      className="sticky top-0 z-50 border-b border-line bg-bg/95 backdrop-blur-sm"
    >
      {/* ══ PC/タブレット(720px+) — 1行 ══
          720–1023px（iPad縦）だけ左をハンバーガー、中央をブランド絶対中央寄せに
          切り替える。1024px 以上は従来どおり 左=ナビ / 中央=ブランド / 右=操作。 */}
      {/* ⚠ h-[55px]+border-b 1px = 56px。スキャン側 .site-header は height:56px に
          ボーダーを含む(border-box)ため、h-14(56px) だと 1px 高くなる（実測 57 vs 56）。
          --header-h も 56px なので、ここを変えるときは globals.css も同時に。 */}
      <div className="flex frame items-center h-[55px] gap-2 min-[1200px]:gap-3">
        <div className="flex items-center gap-4 xl:gap-7 flex-1 min-w-0">
          <HeaderTabletNav menuLabel={locale === "en" ? "Menu" : "メニュー"}>
            {/* ⚠ 1024–1199px の gap は 8px。この帯だけ ⌂掲載管理 / ⚙管理 が
                ナビ側に出るぶんナビが1項目長くなり、11px だと中央のブランドへ
                5.4px 食い込む（admin でサインインしたときだけ出る。実測: /,
                /properties, /pricing, /account, /dashboard, /cart の6ページ）。
                8px にすると 4つの間隔で 12px 縮み、6.6px の余裕が出る。 */}
            <nav className="flex items-center gap-2 min-[1200px]:gap-4 min-[1440px]:gap-6 max-[1024px]:flex-col max-[1024px]:items-stretch max-[1024px]:gap-0">
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
              {/* 480px未満でバーから外した分をここに出す。
                  幅を稼ぐために「消す」のではなく「移す」のがルール（R3）。 */}
              {/* バーから外した分をここへ出す。出し分けの境界は「バー側で隠す幅」と
                  必ず対にすること（片方だけ変えると消失または重複する）。
                  EN            : <1024（iPad縦でトグルと重なるため）
                  カート/認証    : <768（719〜730px でトグルと3〜8px重なる。実測で
                                   744px以降は収まるが余裕を見て 768px を境界にした）
                  ⚠ Tailwind の max-[Npx] は「N未満」。バー側 max-[768px]:hidden と
                     ドロワー側 min-[768px]:hidden が過不足なく対になる。 */}
              {/* ここ（☰ドロワー）はページ移動だけ。EN・カート・認証は右の●
                  (HeaderAccountMenu)が担当する。スキャンサイトも同じ役割分担なので、
                  「ENの場所がサイトで違う」が構造的に起きない。 */}
            </nav>
          </HeaderTabletNav>
        </div>

        {/* 720px以上の全帯: ヘッダー全幅に重ねた 1fr auto 1fr グリッドの2列目にブランドを
            置き、ブランドの水平中心をビューポート中心へ固定する。
            ⚠ 幅の上限を付けないこと。2026-07-28 まで上端が max-[1200px] だったため
            1200px以上だけがこの仕掛けから外れ、左右 flex-1 による
            「グループ中央寄せ」に落ちていた。結果、1199→1200 の1px境界で
            ブランドが 84px 飛び（実測 599.5→515.9）、PC帯ではスキャンサイトと
            26.8px ずれていた（online 598.9 / scan 572.1 @1366px）。
            それ以前は上端が max-[1024px] で、1024–1199px（iPad 横向きの全機種:
            1024/1080/1133/1180/1194）が同じ理由で 320〜405px ずれていた。
            同じ失敗を2度しているので、帯を区切ってよいのは寸法だけ。
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
        {/* 左右 padding は .frame と同値。列2＝ブランドの中心は左右対称なので
            padding では動かないが、列3の右端（EN）を本文の余白位置に揃えるために要る。 */}
        {/* ⚠ z-[2] は必須。右側グループ(EN/カート/認証)は flex-1 なので箱が行の
            中央から右端まで広がり、relative z-[1] を持つ。この中央グリッドは
            absolute だが z-index が auto だと DOM 順で後ろの右側グループに
            負け、**中央のトグルとブランドがクリックできなくなる**
            （実測: elementFromPoint が右側グループを返していた）。
            グリッド自体は pointer-events-none なので、上に乗せても右側の
            ボタンのクリックは妨げない。 */}
        {/* ⚠ 列は minmax(0,1fr) にする。素の 1fr だと col3(トグル)の最小幅が
            col1(空)より大きくなって列が広がり、ブランドが左へ押される
            （実測 375px: col1=99.3 / col3=119.3 → 中心が-10px、320pxで-37.5px）。
            0まで縮める指定にすれば左右の列は必ず同幅になり、ブランドは常に中央。
            はみ出た分は右の padding 内に収まる（実測 375pxで10px、余白16px）。 */}
        <div className="z-[2] grid grid-cols-[minmax(0,1fr)_auto_auto_minmax(0,1fr)] items-center gap-0 absolute inset-x-0 top-0 h-[55px] px-[max(clamp(1rem,4vw,48px),calc((100vw_-_1440px)/2))] pointer-events-none">
          <Link
            href={lh("/")}
            aria-label={brandName}
            className="flex items-center col-start-2 row-start-1 gap-1.5 pointer-events-auto"
          >
            <HeaderMark />
            <span className="brand text-lg tracking-[0.01em] whitespace-nowrap">{brandName}</span>
          </Link>
          {/* トグルと（≥1536pxで中央側に出る）EN は必ず1つの列3グループにまとめる。
              別々に col-start-3 を振ると重なる。EN を justify-self-end にするのも不可で、
              右端にはカート/認証ボタンが居るため衝突する（scan側は .sh-right が空なので
              右端でよい、という非対称はここだけ許容する）。 */}
          {/* ⚠ ブランド(列2)とトグル(列3)を「1組」で中央に置く。両端は同幅の1frなので
              2列まとめて画面中央に来る。2026-07-29 まではブランド単体を中央にしていたが、
              それは「トグル幅が両サイトで違う」時代の回避策。ズームをヘッダーから
              外して両サイト 111.3px で一致したため、見た目どおりに戻した。 */}
          {/* ⚠ 360px未満はこのトグルをバーから外し、右の●パネルへ移す（R3）。
              実測(JA=最長ラベル・外周padding 8px)の空き: 360px=-6.9/-4.9✕、
              375px=+0.6/+2.6○、390px=+8.1/+10.1○。375px は iPhone SE の幅で、
              下回るのは旧世代の小型端末だけ。外すとブランド単独が中央に来る。
              スキャン側 assets/site-header.css の .sh-acct-toggle と対。 */}
          <div className="max-[375px]:hidden col-start-3 row-start-1 justify-self-start flex items-center gap-2 ml-2 pointer-events-auto">
            {scanOnlineToggle}
            </div>
          {/* 列4は空のスペーサー（両端を同幅にしてブランド＋トグルを中央に保つ）。
              ⚠ ここに EN を置かないこと。中央グリッドは absolute で画面端まで伸びるので、
                 列4の右端＝右グループ（カート/マイページ/ベル/アバター）と同じ位置になり
                 必ず重なる。実測: 1440pxで EN が2つ、1536px以上ではサインイン時に
                 EN×アバターが28px、1920pxで EN×マイページが33.8px重なっていた
                 （サインアウトでは右が軽く露見しない＝サインイン状態での検証が必須）。
                 EN は下の右グループ側 LangToggle に一本化してある。 */}
        </div>

        {/* ⚠ 720–733px では中央グリッド側のトグル(列3)と、この右グループ先頭のENが
            重なる（本番=未ログインで EN/カート/ログイン/新規登録 の4項目が並ぶ最も
            混む状態で、実測 720px:-6px / 730px:-1px）。スキャンサイトは右側が空なので
            起きない＝オンライン版固有。中央機構やトグル側（両サイト共通＝パリティ対象）は
            触らず、この右グループの間隔だけを詰めて解消する。 */}
        {/* ⚠ 480px未満はここをバーから外す。残すとブランドが中央からずれる
            （実測: 375pxで-10px、320pxで-37.5px）。中身はドロワー側に出す（R3）。 */}
        {/* 768px未満: バーに並べる余地が無いので、アイコン1つに畳んで押したら開く。
            バーへ常時展開すると 375px でブランドの中央ぞろえが16px崩れる（実測）。 */}
        <div className="flex-1 flex justify-end min-w-0 relative z-[1]">
          <HeaderAccountMenu label={locale === "en" ? "Language & account" : "言語・アカウント"}>
            {/* 360px未満だけバーから退避してきたスキャン/オンライン トグル。 */}
            <div className="min-[375px]:hidden flex items-center">{scanOnlineToggle}</div>
            <div className="flex items-center gap-3">
              <LangToggle />
              {/* 撮影スタジオは自分の物件管理専用アカウント。他物件のデータ購入は
                  対象外（サーバー側も /api/purchase で403）なので、買えないカートへの
                  導線自体を出さない（2026-08-01）。 */}
              {user?.role !== "studio" && (
                <span className="min-[768px]:hidden flex items-center">
                  <CartLink />
                </span>
              )}
            </div>
            {/* 768–1023px ではカート/認証はバーに出ているので、ここでは重複させない。 */}
            <div className="min-[768px]:hidden flex items-center gap-2 flex-wrap empty:hidden">
              {authButtons}
              {authSignedIn}
            </div>
          </HeaderAccountMenu>
        </div>

        <div className="max-[768px]:hidden flex items-center gap-2 max-[1024px]:gap-2 max-[767px]:gap-1 justify-end min-w-0 relative z-[1]">
          {/* ⚠ Tailwind v4 の max-[Npx] は「N未満」。スキャン側の
              @media(max-width:1023px)（1023を含む）と揃えるには max-[1024px]。
              1023px ちょうどで片サイトだけENが出る不一致が実際に発生した。 */}
          {/* 1024px以上のENはここだけ。スキャン側は右が空なので画面右端に付くが、
              オンラインはカート/認証が居るためその左に並ぶ。この非対称だけは許容する。 */}
          <LangToggle className="max-[1024px]:hidden" />
          {user?.role !== "studio" && <CartLink />}
          {authButtons}
          {authSignedIn}
        </div>
      </div>

    </header>
  );
}
