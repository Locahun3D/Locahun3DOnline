/**
 * 販売3DGSデータの「選べるライセンス区分」を正規化するピュアヘルパー
 * （server/client両用）。downloads.ts の resolveDownloadFiles と同じ
 * 「マルチ配列があればそれを、無ければレガシー単一フィールドを1件として
 * フォールバック」のパターン。
 */
import { DATA_LICENSES, type DataLicense } from "./schemas";

export interface LicenseOption {
  license: DataLicense;
  price: number;
}

interface LicenseSource {
  licenseOptions?: { license: DataLicense; price: number }[];
  license?: DataLicense;
  salePrice?: number;
}

export function resolveLicenseOptions(item: LicenseSource): LicenseOption[] {
  const multi = (item.licenseOptions ?? []).filter((o) => o.license);
  if (multi.length > 0) {
    // 追加(チェックした)順ではなく、常に DATA_LICENSES のグレード順
    // (standard → editorial → extended → custom) で並べる。管理画面の
    // チェックボックス一覧・買い手のライセンス選択チップ双方で表示順を揃える。
    return [...multi].sort(
      (a, b) => DATA_LICENSES.indexOf(a.license) - DATA_LICENSES.indexOf(b.license),
    );
  }
  return [{ license: item.license ?? "standard", price: item.salePrice ?? 0 }];
}

/** 指定したライセンス区分に対応する価格を取得（見つからなければ null）。 */
export function findLicensePrice(
  item: LicenseSource,
  license: string | undefined | null,
): number | null {
  const options = resolveLicenseOptions(item);
  const match = options.find((o) => o.license === license);
  return match ? match.price : null;
}
