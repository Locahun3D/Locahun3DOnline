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
import { getLocale } from "@/lib/i18n/server";
import { localizedHref, translate, type DictKey } from "@/lib/i18n/dictionaries";

/**
 * ナビ。`external` は別サイト（works）へのリンクで、新しいタブで開く。
 * ⚠ works の URL は不変（本人指示 2026-08-16）。X で共有済みのリンクを全部生かすため、
 *   web.locahun3d.com/works/ のまま。EN は /en/works/。
 */
const NAV: { href: string; key: DictKey; code: string; external?: boolean }[] = [
  { href: "/properties", key: "nav.properties", code: "0.1" },
  { href: "/demo", key: "nav.demo", code: "0.2" },
  { href: "/pricing", key: "nav.pricing", code: "0.3" },
  { href: "/about", key: "nav.about", code: "0.4" },
  { href: "/works/index.html", key: "nav.works", code: "0.5", external: true },
  { href: "/contact", key: "nav.contact", code: "0.6" },
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

  // ⚠ 2026-08-16: 「スキャン / オンライン」トグルは撤去した。2サイト分岐を廃止し
  //    locahun3d.com へ一本化する方針（本人指示）のため、切り替える先が無くなった。
  //    代わりに works（実績＆ブログ）と /demo をナビに置いている。
  //    これに伴い中央グリッドは「ブランド単体を中央」に戻してある。

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
      {/* ⚠ スマホ実機(WebKit)対策のバックストップ。sticky＋zoom(1/--z)＋bg/95+blur の
          組み合わせは、実機でスクロール中にヘッダー上側が透けて本文が見える
          （ユーザー報告 2026-08-12。デスクトップChromeのモバイルエミュでは再現しない）。
          ヘッダー自身の箱に頼らず、実画面の最上部56px(このスコープはヘッダーの
          逆zoom内なので h-14=実px)を fixed の不透明レイヤーで常に塗っておく。
          ヘッダーが正位置にある限り完全に背後に隠れるので見た目は不変。
          1024px以上は問題が出ておらず、すりガラス表現を保つため出さない。 */}
      <div
        aria-hidden
        className="min-[1024px]:hidden fixed inset-x-0 top-0 h-14 -z-[1] bg-bg border-b border-line"
      />
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
            {/* ⚠ 2026-08-16: ナビが4→6項目になったので gap を詰めた。
                以前の min-[1440px]:gap-6 では 1440px の JA で
                「お問い合わせ」が中央ブランドへ 81.9px 食い込んでいた（実測）。 */}
            <nav className="flex items-center gap-2 min-[1200px]:gap-3 min-[1680px]:gap-5 max-[1024px]:flex-col max-[1024px]:items-stretch max-[1024px]:gap-0">
              {NAV.map((n) => {
                // ⚠ 1024–1199px は6項目だと中央ブランドに食い込む（実測）。
                //    この帯だけ 12px にして幅を確保する（≥1200px は従来の13px）。
                const cls =
                  "group flex items-center gap-1.5 text-[13px] max-[1200px]:text-[12px] max-[1024px]:text-[14px] max-[1024px]:py-[11px] max-[1024px]:gap-2.5 font-light text-muted hover:text-ink transition-colors whitespace-nowrap";
                // ⚠ 番号(0.1〜)は幅に余裕がある帯だけ。6項目になった分しきい値を
                //    1440→1920px へ上げた（1440px では中央ブランドと重なる。実測）。
                const code = (
                  <span className="hidden min-[1920px]:inline mono text-[10px] tracking-[0.2em] opacity-50 group-hover:text-accent group-hover:opacity-100 transition">
                    {n.code}
                  </span>
                );
                return n.external ? (
                  <a
                    key={n.href}
                    href={`https://web.locahun3d.com${locale === "en" ? "/en" : ""}${n.href}`}
                    target="_blank"
                    rel="noopener"
                    className={cls}
                  >
                    {code}
                    {t(n.key)}
                  </a>
                ) : (
                  <Link key={n.href} href={lh(n.href)} className={cls}>
                    {code}
                    {t(n.key)}
                  </Link>
                );
              })}
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
                  {/* ⚠ 1024–1199px（1行ナビ）はラベルを落としてアイコンだけにする。
                      ナビが6項目になったぶん、この1項目が中央ブランドへ食い込む
                      （実測 1024px で 24.8px）。ドロワー帯(≤1023)はラベルを出す。 */}
                  ⌂{" "}
                  <span className="min-[1024px]:max-[1200px]:hidden">
                    {locale === "en" ? "Listings" : "掲載管理"}
                  </span>
                </Link>
              )}
              {user?.role === "admin" && (
                <Link
                  href={lh("/admin")}
                  className="min-[1200px]:hidden flex items-center gap-1.5 text-[13px] max-[1024px]:text-[14px] max-[1024px]:py-[11px] max-[1024px]:gap-2.5 font-light text-accent hover:text-ink transition-colors whitespace-nowrap"
                >
                  ⚙ <span className="min-[1024px]:max-[1200px]:hidden">{t("auth.admin")}</span>
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
            </nav>
            {/* 2026-08-12: ●(HeaderAccountMenu)を廃止（ユーザー指示「ENだけでいい」）。
                旧●パネルの中身はこのドロワー下部へ移した。ENだけはバー右側に常時表示。
                出し分け境界はバー側と必ず対にする:
                  カート/認証              : <768（768以上はバー右グループに出ている）
                ⚠ 2026-08-16: ここにあった「スキャン/オンライン トグル(<375)」は
                  分岐廃止に伴い撤去した。 */}
            <div className="min-[1024px]:hidden mt-1 pt-3 border-t border-line flex items-center gap-3 flex-wrap empty:hidden">
              {user?.role !== "studio" && (
                <span className="min-[768px]:hidden flex items-center">
                  <CartLink />
                </span>
              )}
              <span className="min-[768px]:hidden flex items-center gap-2 flex-wrap empty:hidden">
                {authButtons}
                {authSignedIn}
              </span>
            </div>
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
        {/* ⚠ 列は minmax(0,1fr) にする。素の 1fr だと右列の最小幅が左列より大きくなって
            列が広がり、ブランドが左へ押される（トグルが居た頃の実測 375px:
            col1=99.3 / col3=119.3 → 中心が-10px、320pxで-37.5px）。
            0まで縮める指定にすれば左右の列は必ず同幅になり、ブランドは常に中央。
            ⚠ 2026-08-16: スキャン/オンライン トグル（旧・列3）の撤去に伴い
            3列（1fr / ブランド / 1fr）へ戻した。 */}
        <div className="z-[2] grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-0 absolute inset-x-0 top-0 h-[55px] px-[max(clamp(1rem,4vw,48px),calc((100vw_-_1440px)/2))] pointer-events-none">
          <Link
            href={lh("/")}
            aria-label={brandName}
            className="flex items-center col-start-2 row-start-1 gap-1.5 pointer-events-auto"
          >
            <HeaderMark />
            <span className="brand text-lg tracking-[0.01em] whitespace-nowrap">{brandName}</span>
          </Link>
          {/* 列3は空のスペーサー（両端を同幅にしてブランドを中央に保つ）。
              ⚠ ここに EN を置かないこと。中央グリッドは absolute で画面端まで伸びるので、
                 列3の右端＝右グループ（カート/マイページ/ベル/アバター）と同じ位置になり
                 必ず重なる。実測: 1440pxで EN が2つ、1536px以上ではサインイン時に
                 EN×アバターが28px、1920pxで EN×マイページが33.8px重なっていた
                 （サインアウトでは右が軽く露見しない＝サインイン状態での検証が必須）。
                 EN は下の右グループ側 LangToggle に一本化してある。 */}
        </div>

        {/* ⚠ 480px未満はここをバーから外す。残すとブランドが中央からずれる
            （実測: 375pxで-10px、320pxで-37.5px）。中身はドロワー側に出す（R3）。 */}
        {/* 768px未満: バーに並べる余地が無いので、アイコン1つに畳んで押したら開く。
            バーへ常時展開すると 375px でブランドの中央ぞろえが16px崩れる（実測）。 */}
        <div className="flex-1 flex justify-end min-w-0 relative z-[1] items-center gap-2">
          {/* 2026-08-12: EN はスマホ帯でも●パネル内でなくバーに直接出す（ユーザー要望
              「ヘッダー右上にENが表示されてほしい」）。スキャン側は●自体を廃止して
              EN を列4常時表示にしたので、位置（右端付近）が両サイトで一致する。
              1024px以上は下の右グループ側 LangToggle が担当（重複防止で min-[1024px]:hidden）。 */}
          <LangToggle className="min-[1024px]:hidden" />
          {/* ● (言語・アカウント) ボタンは 2026-08-12 に廃止（ユーザー指示「ENだけでいい」。
              EN と ● を並べると 375px で中央トグルに EN が重なることも実測）。
              旧●パネルの中身（≤374pxのトグル退避・カート・認証）は ☰ ドロワー下部へ
              移動した（HeaderTabletNav の children 側）。スキャンサイトも同日●廃止済み。 */}
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
