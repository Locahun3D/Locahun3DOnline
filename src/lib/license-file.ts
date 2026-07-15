/**
 * ダウンロード同梱用「利用規約」テキストファイル生成（プレーンテキスト）。
 * 購入時点のライセンス区分(purchase.license)に応じて内容を出し分ける。
 * 3DGSデータは数百MB〜数GBに及ぶため、ダウンロード時にファイル本体をZIPで
 * 再構成してテキストを埋め込む方式は取らず（大容量ストリーミングの再圧縮は
 * Workers環境でCPU時間・メモリの両面でリスクが大きい）、領収書と同じく
 * 「同じ購入に紐づく別ファイル」として並べて提供する。
 *
 * 本文は /terms/data-download の全文と要点で内容を一致させること
 * （条文が変わったらここも更新する）。
 */
import { fmtDateTimeJa, fmtDateTimeLocaleJST } from "./date-format";

export interface LicenseFileInput {
  propertyTitle: string;
  itemLabel: string;
  licenseLabel: string;
  licenseDesc: string;
  priceYen: number;
  createdAt: string;
  completedAt?: string;
  termsAgreedAt?: string;
  userEmail: string;
  purchaseId: string;
  /** エディトリアルライセンス購入時のみ設定。公開時に必須の権利者クレジット表記。 */
  editorialRightsCredit?: string;
  /** true なら英語版を生成する。 */
  en?: boolean;
}

function fmtPrice(n: number, en: boolean): string {
  if (n === 0) return en ? "Provided free of charge" : "無償提供";
  return en ? `¥${n.toLocaleString()} (tax incl.)` : `¥${n.toLocaleString()}（税込）`;
}

function fmtDateTime(iso: string | undefined, en: boolean): string {
  if (!iso) return en ? "Not recorded" : "記録なし";
  return en ? fmtDateTimeLocaleJST(iso, "en-US") : fmtDateTimeJa(iso);
}

function generateLicenseTextEN(p: LicenseFileInput): string {
  const shortId = p.purchaseId.slice(0, 8).toUpperCase();
  return `================================================================
Locahun 3D — 3D Data License Summary (for this purchase)
================================================================

This file is a summary of the terms that apply to your download of the
3D scan data below. The full agreement is available at:

    https://locahun3d.com/en/terms/data-download

This English text is a reference translation. The Japanese version at
https://locahun3d.com/terms/data-download is the legally binding
agreement and prevails in case of any discrepancy.

----------------------------------------------------------------
■ Purchase details
----------------------------------------------------------------
Reference no.   : ${shortId}
Property        : ${p.propertyTitle}
Scene           : ${p.itemLabel || "(not set)"}
Price           : ${fmtPrice(p.priceYen, true)}
Purchased at    : ${fmtDateTime(p.completedAt || p.createdAt, true)}
Terms agreed at : ${fmtDateTime(p.termsAgreedAt, true)}
Purchaser       : ${p.userEmail}

----------------------------------------------------------------
■ License tier: ${p.licenseLabel}
----------------------------------------------------------------
${p.licenseDesc}

The Data may only be used within the scope of the license tier above.
The tier in effect is the one at the time of purchase; any later change
to this tier by Locahun 3D does not affect the scope of this purchase.
${p.editorialRightsCredit ? `
----------------------------------------------------------------
■ Required rights credit
----------------------------------------------------------------
When publishing any work made using this Data, you must include the
following rights credit:

    ${p.editorialRightsCredit}
` : ""}
----------------------------------------------------------------
■ Third-party rights captured in the Data (Article 3)
----------------------------------------------------------------
The Data is a scan of a real, physical location and may include
advertisements, signage, posters, corporate logos, trademarks,
characters or other material in which third parties hold rights
("Third-Party Material"). These rights belong to the relevant third
party; the Service grants no license or permission regarding them.

Before publishing, delivering or distributing any work made using this
Data, you must remove, obscure, blur or replace any Third-Party
Material. The Service bears no responsibility for any dispute or
damages arising from a failure to do so.

----------------------------------------------------------------
■ Prohibited acts (excerpt from Article 4)
----------------------------------------------------------------
- Redistributing, reselling or lending the Data to third parties
- Reproducing or imitating the Studio facility without permission
- Providing the Studio's internal structure/equipment info to competitors
- Publishing a modified version in a way that could be mistaken for the
  original Studio
- Selling the Data as an NFT or digital asset
- Publishing confidential Studio information (backyards, loading docks,
  control rooms, etc.) on social media without permission
- Using the Data or derivatives as training data for machine-learning
  or generative-AI models (except with the Service's prior written
  permission)
- Publishing, delivering or distributing a work without removing
  Third-Party Material as required above

----------------------------------------------------------------
■ Publishing on social media
----------------------------------------------------------------
Still images and videos rendered/captured using this Data may be
published on social media. Please include a credit to Locahun 3D
(e.g. the #ロケハン3D tag or a mention of locahun3d.com), except for
content covered by the prohibited acts above.

----------------------------------------------------------------
■ If provided free of charge
----------------------------------------------------------------
Even where this Data is provided free of charge (e.g. through a
campaign), these terms (full text at the URL above) still apply.

================================================================
Locahun 3D (operated by KWI Inc.)
https://locahun3d.com
================================================================
`;
}

export function generateLicenseText(p: LicenseFileInput): string {
  if (p.en) return generateLicenseTextEN(p);
  const shortId = p.purchaseId.slice(0, 8).toUpperCase();
  return `================================================================
ロケハン3D 3Dデータ 利用規約（本購入用サマリー）
================================================================

このファイルは、下記の3Dスキャンデータのダウンロードに際して
発行される利用規約の要約です。全文は下記URLでご確認いただけます。

    https://locahun3d.com/terms/data-download

----------------------------------------------------------------
■ 購入情報
----------------------------------------------------------------
管理番号　　　: ${shortId}
物件　　　　　: ${p.propertyTitle}
シーン　　　　: ${p.itemLabel || "（未設定）"}
価格　　　　　: ${fmtPrice(p.priceYen, false)}
購入日時　　　: ${fmtDateTime(p.completedAt || p.createdAt, false)}
規約同意日時　: ${fmtDateTime(p.termsAgreedAt, false)}
購入者　　　　: ${p.userEmail}

----------------------------------------------------------------
■ 適用ライセンス区分: ${p.licenseLabel}
----------------------------------------------------------------
${p.licenseDesc}

このデータは上記ライセンス区分の範囲でのみご利用いただけます。
区分は購入時点のものが適用され、後日ロケハン3D側で変更されても
本購入分の利用範囲には影響しません。
${p.editorialRightsCredit ? `
----------------------------------------------------------------
■ 権利表記（必須）
----------------------------------------------------------------
本データを使用した制作物を公開する際は、下記の権利表記を必ず
掲載してください。

    ${p.editorialRightsCredit}
` : ""}
----------------------------------------------------------------
■ 第三者の広告物・看板等の削除義務（規約第3条）
----------------------------------------------------------------
本データには、撮影対象の実在空間に写り込んだ第三者の広告物・看板・
ポスター・企業ロゴ・商標・キャラクター等（第三者権利物）が含まれて
いる場合があります。これらの権利は当該第三者に帰属し、本サービスは
何ら許諾するものではありません。

制作物を公開・納品・配布する前に、第三者権利物を削除・除去・ぼかし
処理・差し替え等の方法で必ず取り除いてください。除去を怠ったことで
生じた第三者との紛争・損害について、本サービスは責任を負いません。

----------------------------------------------------------------
■ 禁止事項（規約第4条より抜粋）
----------------------------------------------------------------
・本データの第三者への再配布・転売・貸与
・本データを用いたスタジオ施設の無断複製・模倣
・スタジオの内部構造・設備情報を競合施設に提供する行為
・本データの改変物を、元のスタジオと誤認させる形で公開する行為
・本データをNFT・デジタルアセットとして販売する行為
・本データに含まれる機密情報（バックヤード・搬入口・制御室等）を
  SNS等で無許可公開する行為
・本データおよびその改変物を、機械学習・生成AIモデルの学習データ
  として利用する行為（本サービスの事前の書面による許諾がある
  場合を除く）
・第三者権利物を除去せずに制作物を公開・納品・配布する行為

----------------------------------------------------------------
■ SNSでの公開について
----------------------------------------------------------------
本データを使用してレンダリング・撮影した静止画・映像は、SNS等で
公開いただけます。公開の際は「ロケハン3D」のクレジット表記
（例: #ロケハン3D タグ、または locahun3d.com への言及）を
添えてください。ただし上記禁止事項に該当する内容は除きます。

----------------------------------------------------------------
■ 無償提供の場合
----------------------------------------------------------------
キャンペーン等により本データが無償で提供されている場合も、本規約
（全文は上記URL）がそのまま適用されます。

================================================================
ロケハン3D（運営: KWI株式会社）
https://locahun3d.com
================================================================
`;
}
