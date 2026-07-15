/**
 * 販売3DGSデータの「日付別バージョン」を正規化するピュアヘルパー
 * （server/client両用）。downloads.ts の resolveDownloadFiles と同じ
 * 「マルチ配列があればそれを、無ければレガシー単一フィールドを1件として
 * フォールバック」のパターン。価格差は無いため、購入後いつでもどの日付の
 * バージョンでもダウンロード可能（ライセンスのような購入時選択は不要）。
 */
export interface DownloadVersion {
  date: string;
  url: string;
  sizeMb: number;
}

interface DownloadVersionSource {
  downloadVersions?: { date: string; url: string; sizeMb: number }[];
  downloadFileUrl?: string;
  downloadFileSizeMb?: number;
}

export function resolveDownloadVersions(
  item: DownloadVersionSource,
  fallbackDate?: string,
): DownloadVersion[] {
  const multi = (item.downloadVersions ?? []).filter((v) => v.url);
  if (multi.length > 0) {
    // 新しい日付が先に来るよう表示順を揃える（日付欠落分は末尾）。
    return [...multi].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }
  if (item.downloadFileUrl) {
    return [
      {
        date: fallbackDate || "",
        url: item.downloadFileUrl,
        sizeMb: item.downloadFileSizeMb ?? 0,
      },
    ];
  }
  return [];
}

/** 日付キーで1バージョンを選ぶ（未指定 or 不一致なら最新＝先頭）。 */
export function pickDownloadVersion(
  item: DownloadVersionSource,
  fallbackDate: string | undefined,
  date?: string | null,
): DownloadVersion | null {
  const versions = resolveDownloadVersions(item, fallbackDate);
  if (versions.length === 0) return null;
  if (date) {
    const hit = versions.find((v) => v.date === date);
    if (hit) return hit;
  }
  return versions[0];
}
