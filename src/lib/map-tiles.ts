/**
 * 地図タイルの取得元。以前は CARTO Voyager（basemaps.cartocdn.com）の無料枠を
 * 使っていたが、CARTO のベースマップ利用規約は商用利用に Enterprise ライセンスを
 * 要求しており（"For commercial purposes, you will need an Enterprise
 * license"）、有料サブスクリプションを提供する当サービスでの継続利用は規約
 * 違反だった。Mapbox（無料枠は月5万マップロードまで商用利用OK、以降は
 * 従量課金で自己申告不要のセルフサーブ）に切り替える。
 *
 * NEXT_PUBLIC_MAPBOX_TOKEN 未設定時（主にローカル開発）は、OpenStreetMap の
 * 標準タイルサーバーにフォールバックする。OSM の Tile Usage Policy 上は
 * 低トラフィックの開発・検証利用は許容されるが、本番の継続トラフィックには
 * 使えない — 本番では必ず環境変数にトークンを設定すること。
 */
export function mapTileConfig(): { url: string; attribution: string } {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (token) {
    return {
      url: `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}{r}?access_token=${token}`,
      attribution:
        '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> <a href="https://www.mapbox.com/map-feedback/" target="_blank" rel="noopener">Improve this map</a>',
    };
  }
  // ⚠ 開発用フォールバック。以前はここに英語の "dev fallback — set
  //   NEXT_PUBLIC_MAPBOX_TOKEN for production" という開発者向け文言が入っていたが、
  //   本番でトークン未設定のまま公開されたときにそのまま顧客の目に見える形で
  //   露出していた（2026-08-01 実機確認）。attribution は必ず表示される文字列
  //   なので、ここには顧客向けに違和感のない文言だけを置く。トークン未設定の
  //   警告はコンソールログ（下記）に出す。
  if (process.env.NODE_ENV !== "production") {
    console.warn("[map-tiles] NEXT_PUBLIC_MAPBOX_TOKEN 未設定。OSM標準タイルにフォールバックしています。");
  }
  return {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  };
}
