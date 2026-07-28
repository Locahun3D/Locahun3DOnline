const DEMO_URL = "https://viewer.locahun3d.com/Locahun3D_OfflineViewer?demo=1";

/**
 * 料金ページ ヒーロー直下 / プランの上に置く「無料体験ファネル」。
 * 登録不要でデモ物件を歩けることを最優先で見せ、次点でサインアップに誘導する。
 * デザインは gen_pricing_v2.py の `.demo-card` を Tailwind に翻訳したもの。
 */
export default function FreeDemoFunnel({
  signUpHref,
  accountHref,
  demoCover,
  en,
  signedIn = false,
}: {
  signUpHref: string;
  accountHref: string;
  demoCover: { src: string; alt: string } | null;
  en: boolean;
  signedIn?: boolean;
}) {
  return (
    <section className="mb-16">
      <div className="grid md:grid-cols-2 border border-line bg-white">
        {/* 左: コピー + CTA */}
        <div className="p-8 sm:p-9 flex flex-col justify-center order-2 md:order-1">
          <h2 className="text-[22px] sm:text-[23px] font-bold leading-[1.5] mb-2.5">
            {en ? (
              <>Try walking through it first.</>
            ) : (
              <>まず、歩いてみてください。</>
            )}
          </h2>
          <p className="text-[12.5px] text-muted leading-[2] mb-6">
            {en ? (
              <>
                No sign-up, no card required. We&apos;ve opened one real studio as a
                3DGS demo you can walk through exactly as scanned.
              </>
            ) : (
              <>
                登録もカードも不要。実際のスタジオを 3DGS でそのまま歩けるデモを1件開放しています。
              </>
            )}
          </p>
          <div className="flex flex-col gap-2.5 max-w-[320px]">
            <a
              href={DEMO_URL}
              target="_blank"
              rel="noopener"
              className="block text-center px-4 py-3 mono text-[11px] tracking-[0.22em] uppercase bg-accent border border-accent text-white hover:opacity-90 transition"
            >
              {en ? "▶ Walk the demo — no sign-up" : "▶ デモを歩く — 登録不要"}
            </a>
            {signedIn ? (
              <>
                <a
                  href={accountHref}
                  className="block text-center px-4 py-3 mono text-[11px] tracking-[0.22em] uppercase border border-line text-ink hover:border-ink/60 transition"
                >
                  {en ? "Check your token balance →" : "マイページでトークン残高を確認 →"}
                </a>
                <span className="text-center text-[10.5px] text-muted">
                  {en
                    ? "You're already signed in"
                    : "既にログイン済みです"}
                </span>
              </>
            ) : (
              <>
                <a
                  href={signUpHref}
                  className="block text-center px-4 py-3 mono text-[11px] tracking-[0.22em] uppercase border border-line text-ink hover:border-ink/60 transition"
                >
                  {en
                    ? "Sign up free — get 6 tokens"
                    : "無料登録して 6 トークンを受け取る"}
                </a>
                <span className="text-center text-[10.5px] text-muted">
                  {en
                    ? "Free plan never expires — no card required"
                    : "Free プランは期限なし・カード登録なし"}
                </span>
              </>
            )}
          </div>
        </div>

        {/* 右: デモ物件カバー画像 + 再生ボタン風オーバーレイ */}
        <a
          href={DEMO_URL}
          target="_blank"
          rel="noopener"
          className="relative block min-h-[220px] sm:min-h-[280px] bg-[#0b0c0e] group order-1 md:order-2"
          aria-label={en ? "Walk the demo — no sign-up" : "デモを歩く — 登録不要"}
        >
          {demoCover && (
            // next/image は本構成（Workers + /api/r2 相対パス）で最適化404になるため
            // 他コンポーネント同様プレーン <img> を使う
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={demoCover.src}
              alt={demoCover.alt}
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 transition"
            />
          )}
          <div className="absolute inset-0 grid place-items-center">
            <span className="w-16 h-16 rounded-full bg-white/92 grid place-items-center shadow-[0_4px_24px_rgba(0,0,0,0.35)]">
              <span
                className="ml-1 block w-0 h-0"
                style={{
                  borderStyle: "solid",
                  borderWidth: "10px 0 10px 16px",
                  borderColor: "transparent transparent transparent #14181c",
                }}
              />
            </span>
          </div>
          <div className="absolute inset-x-0 bottom-0 pt-7 pb-3 px-4 text-center bg-gradient-to-t from-black/60 to-transparent">
            {/* PC(pointer:fine)は「WASD / ドラッグ」、タッチ端末(pointer:coarse)は
                キーボード操作を含まない文言に出し分ける。JS判定はhydration
                ミスマッチのリスクがあるため使わず、両方サーバーレンダリングして
                CSSのみで切り替える。 */}
            <span className="mono text-[10px] tracking-[0.2em] text-white [@media(pointer:coarse)]:hidden">
              {en
                ? "WASD / drag to move — real scan data"
                : "WASD / ドラッグで移動 — 実データそのまま"}
            </span>
            <span className="hidden [@media(pointer:coarse)]:inline mono text-[10px] tracking-[0.2em] text-white">
              {en
                ? "Drag to move — real scan data"
                : "ドラッグで移動 — 実データそのまま"}
            </span>
          </div>
        </a>
      </div>
    </section>
  );
}
