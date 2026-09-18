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

/**
 * 区分ごとの価格ルールを当てる。入力配列は変更しない。
 * - エディトリアルは常に無料（2026-09-19 本人決定）
 * - 標準価格がある商品は、拡張価格を常にその2倍にする
 */
export function applyExtendedLicensePricing(options: LicenseOption[]): LicenseOption[] {
  const standard = options.find((option) => option.license === "standard");
  return options.map((option) => {
    if (option.license === "editorial") return { ...option, price: 0 };
    if (option.license === "extended" && standard) return { ...option, price: standard.price * 2 };
    return { ...option };
  });
}

export function resolveLicenseOptions(item: LicenseSource): LicenseOption[] {
  // エディトリアルは 2026-09-19 に販売再開（施設契約で「エディトリアルのみ許諾」を
  // 選べるようにしたため）。どの区分を売るかは物件エディターの設定に従う。
  const multi = (item.licenseOptions ?? []).filter((o) => o.license);
  if (multi.length > 0) {
    // 追加(チェックした)順ではなく、常に DATA_LICENSES のグレード順
    // (editorial → standard → extended → custom) で並べる。管理画面の
    // チェックボックス一覧・買い手のライセンス選択チップ双方で表示順を揃える。
    return applyExtendedLicensePricing(multi).sort(
      (a, b) => DATA_LICENSES.indexOf(a.license) - DATA_LICENSES.indexOf(b.license),
    );
  }
  const fallback = item.license || "standard";
  return applyExtendedLicensePricing([{ license: fallback, price: item.salePrice ?? 0 }]);
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
