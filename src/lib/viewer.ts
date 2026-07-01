/**
 * Central 3DGS viewer configuration.
 * Change the path or params here → every component picks it up.
 */

export const VIEWER_PATH = "/viewer/offline-viewer.html";

export const VIEWER_GITHUB = {
  versionUrl:
    "https://raw.githubusercontent.com/Locahun3D/Locahun3D/main/version.json",
  htmlUrl:
    "https://raw.githubusercontent.com/Locahun3D/Locahun3D/main/Locahun3D_OfflineViewer.html",
};

export const CORS_PROXY =
  "https://locahun3d-cors-proxy.nakamurakou1108.workers.dev";

interface ViewerUrlOptions {
  orbit?: boolean;
  capture?: boolean;
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
  return `${VIEWER_PATH}?${params}`;
}

export function proxySplatUrl(splatUrl: string): string {
  if (/^https?:\/\//.test(splatUrl)) {
    return `/api/admin/splat-proxy?url=${encodeURIComponent(splatUrl)}`;
  }
  return splatUrl;
}
