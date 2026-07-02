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
  if (options?.protected) params.set("protected", "1");
  return `${VIEWER_PATH}?${params}`;
}

export function proxySplatUrl(splatUrl: string): string {
  if (/^https?:\/\//.test(splatUrl)) {
    return `/api/admin/splat-proxy?url=${encodeURIComponent(splatUrl)}`;
  }
  return splatUrl;
}
