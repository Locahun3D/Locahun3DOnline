import { resolveDownloadFiles, type DownloadFile } from "./downloads";
import { resolveDownloadVersions } from "./download-versions";

export function individualPurchaseDownloads(files: DownloadFile[], defaultUrl: string): DownloadFile[] {
  return files.filter((file) => file.url !== defaultUrl);
}

export interface PurchaseContentsSource {
  downloadFiles?: { format: string; url: string; sizeMb: number }[];
  downloadFileUrl?: string;
  downloadFileFormat?: string;
  downloadFileSizeMb?: number;
  downloadVersions?: { date: string; url: string; sizeMb: number }[];
}

export interface PurchaseContent {
  format: string;
  sizeMb: number | null;
  date: string;
  kind: "file" | "version";
}

/** Purchase-facing metadata only: never expose storage URLs or count viewer-only assets. */
export function resolvePurchaseContents(item: PurchaseContentsSource): PurchaseContent[] {
  const seenUrls = new Set<string>();
  const seenFormats = new Set<string>();
  const result: PurchaseContent[] = [];
  const formatFromUrl = (url: string) => /\.([a-z0-9]+)$/i.exec(url.split(/[?#]/)[0])?.[1].toUpperCase() || "";
  const displayFormat = (url: string, format: string) => {
    const extension = formatFromUrl(url);
    // Old schema defaults do not prove ZIP contents when the registered file is not ZIP.
    const conflictingDefault = url === item.downloadFileUrl && format === "PLY & OBJ (ZIP)" && extension && extension !== "ZIP";
    return format === "DATA" || conflictingDefault ? extension : format;
  };
  const append = (url: string, format: string, sizeMb: number, date: string, kind: PurchaseContent["kind"]) => {
    if (seenUrls.has(url)) return;
    seenUrls.add(url);
    result.push({ format, sizeMb: Number.isFinite(sizeMb) && sizeMb > 0 ? sizeMb : null, date, kind });
  };
  for (const file of resolveDownloadFiles(item)) {
    // The download API selects the first matching format.
    if (seenFormats.has(file.format)) continue;
    seenFormats.add(file.format);
    append(file.url, displayFormat(file.url, file.format), file.sizeMb, "", "file");
  }
  const seenDates = new Set<string>();
  for (const version of resolveDownloadVersions(item)) {
    if (seenDates.has(version.date)) continue;
    seenDates.add(version.date);
    // Missing date can only select the newest/default version, not an older one.
    if (!version.date && seenDates.size > 1) continue;
    append(version.url, version.url === item.downloadFileUrl && item.downloadFileFormat
      ? displayFormat(version.url, item.downloadFileFormat) : formatFromUrl(version.url), version.sizeMb, version.date, "version");
  }
  return result;
}
