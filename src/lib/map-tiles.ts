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
  // 開発用フォールバック（本番では NEXT_PUBLIC_MAPBOX_TOKEN を必ず設定すること）。
  return {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors (dev fallback — set NEXT_PUBLIC_MAPBOX_TOKEN for production)',
  };
}
