/**
 * 販売3DGSデータのダウンロード形式を正規化するピュアヘルパー（server/client両用）。
 * downloadFiles（マルチ形式）があればそれを、無ければ単一 downloadFileUrl を
 * 1形式としてフォールバックする。TurboSquid風の「利用可能な形式」一覧の元データ。
 */
export interface DownloadFile {
  format: string;
  url: string;
  sizeMb: number;
}

interface DownloadSource {
  downloadFiles?: { format: string; url: string; sizeMb: number }[];
  downloadFileUrl?: string;
  downloadFileFormat?: string;
  downloadFileSizeMb?: number;
}

export function resolveDownloadFiles(item: DownloadSource): DownloadFile[] {
  const multi = (item.downloadFiles ?? []).filter((f) => f.url && f.format);
  if (multi.length > 0) return multi;
  if (item.downloadFileUrl) {
    return [
      {
        format: item.downloadFileFormat || "DATA",
        url: item.downloadFileUrl,
        sizeMb: item.downloadFileSizeMb ?? 0,
      },
    ];
  }
  return [];
}

/** 形式キーで1ファイルを選ぶ（未指定なら先頭）。 */
export function pickDownloadFile(
  item: DownloadSource,
  format?: string | null,
): DownloadFile | null {
  const files = resolveDownloadFiles(item);
  if (files.length === 0) return null;
  if (format) {
    const hit = files.find((f) => f.format === format);
    if (hit) return hit;
  }
  return files[0];
}
