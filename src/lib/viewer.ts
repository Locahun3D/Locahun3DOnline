/**
 * Central 3DGS viewer configuration.
 * Change the path or params here → every component picks it up.
 */

export const VIEWER_PATH = "/viewer/offline-viewer.html";

export const CORS_PROXY =
  "https://locahun3d-cors-proxy.nakamurakou1108.workers.dev";

interface ViewerUrlOptions {
  orbit?: boolean;
  capture?: boolean;
  protected?: boolean;
  /**
   * ?headless=1: レンダーループを requestAnimationFrame ではなく setTimeout で
   * 駆動し、タブが非表示/背面でも回し続ける。ブラウザは hidden/occluded タブの
   * rAF を停止するため、キャプチャを「別タブで自動実行」する用途では必須。
   * capture:true のときは自動で有効化される。
   */
  headless?: boolean;
  /** 360° オービット1周の秒数（capture/orbit 用）。 */
  orbitSec?: number;
  /**
   * 録画前ウォームアップの追加時間(ms)。既定2秒に加算される。重いシーンで
   * 画質が乗り切る前に録画が始まりボケるのを防ぐ用途（capture 時のみ有効）。
   */
  warmupExtraMs?: number;
}

export function buildViewerUrl(
  splatUrl?: string,
  options?: ViewerUrlOptions,
): string {
  if (!splatUrl) return VIEWER_PATH;
  const params = new URLSearchParams();
  params.set("autoload", splatUrl);
  if (options?.orbit) params.set("orbit", "1");
  if (options?.capture) params.set("capture", "1");
  // キャプチャは非表示 iframe 内で走るため、rAF ではなく setTimeout 駆動
  // （headless）でないと解像度安定化ループが hidden タブで永久停止する。
  if (options?.capture || options?.headless) params.set("headless", "1");
  if (options?.orbitSec) params.set("orbitSec", String(options.orbitSec));
  if (options?.warmupExtraMs && options.warmupExtraMs > 0) {
    params.set("warmupExtra", String(Math.round(options.warmupExtraMs)));
  }
  if (options?.protected) params.set("protected", "1");
  return `${VIEWER_PATH}?${params}`;
}

export function proxySplatUrl(splatUrl: string): string {
  if (/^https?:\/\//.test(splatUrl)) {
    return `/api/admin/splat-proxy?url=${encodeURIComponent(splatUrl)}`;
  }
  // /api/r2 は 3DGS データ形式（.zip 含む）を認証なしでは配信しない
  // （セキュリティ修正済み）。この関数の呼び出し元は署名付きURL取得に
  // 失敗した場合のフォールバック用URLを組み立てるため、/api/r2 のキーは
  // 認証付きの /api/viewer-stream に書き換える（そのまま渡すと 403 になる）。
  const m = splatUrl.match(/^\/api\/r2\/(.+)$/i);
  if (m) return `/api/viewer-stream/${m[1]}`;
  return splatUrl;
}
