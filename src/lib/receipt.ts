/**
 * 領収書HTML生成（受領書ルートとメール送信で共用）。ピュア関数。
 */
import { fmtDateJa, fmtDateLongJST } from "./date-format";

export interface ReceiptInput {
  id: string;
  propertyTitle: string;
  itemLabel: string;
  priceYen: number;
  createdAt: string;
  completedAt?: string;
  userEmail: string;
  licenseLabel?: string;
  licenseDesc?: string;
  /** true なら英語版を生成する。 */
  en?: boolean;
}

function fmtPrice(n: number) {
  return `¥${n.toLocaleString()}`;
}

function fmtDate(iso: string, en: boolean) {
  return en ? fmtDateLongJST(iso, "en-US") : fmtDateJa(iso);
}

export function generateReceiptHtml(p: ReceiptInput, opts?: { forEmail?: boolean }): string {
  const en = p.en ?? false;
  const date = fmtDate(p.completedAt || p.createdAt, en);
  const shortId = p.id.slice(0, 8).toUpperCase();
  const forEmail = opts?.forEmail ?? false;

  const t = en
    ? {
        title: `Receipt ${shortId} — Locahun 3D`,
        heading: "Receipt",
        item: "Item",
        detail: "Detail",
        amount: "Amount",
        dataItem: "3DGS data",
        total: "Total (tax incl.)",
        taxNote: "* The amount above includes consumption tax.",
        license: "License",
        purchaser: "Purchaser",
        issuer: "Issuer: Locahun 3D (operated by KWI Inc.)",
        contact: "Contact: info@locahun3d.com",
        printBtn: "Print / Save as PDF",
      }
    : {
        title: `領収書 ${shortId} — ロケハン3D`,
        heading: "領収書",
        item: "品目",
        detail: "詳細",
        amount: "金額",
        dataItem: "3DGSデータ",
        total: "合計（税込）",
        taxNote: "※ 上記金額には消費税が含まれています。",
        license: "ライセンス",
        purchaser: "購入者",
        issuer: "発行者: ロケハン3D（KWI株式会社）",
        contact: "お問い合わせ: info@locahun3d.com",
        printBtn: "印刷 / PDF保存",
      };

  return `<!DOCTYPE html>
<html lang="${en ? "en" : "ja"}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t.title}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&family=JetBrains+Mono:wght@400&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Noto Sans JP', sans-serif; background: #fff; color: #111; padding: 40px; max-width: 800px; margin: 0 auto; }
  .mono { font-family: 'JetBrains Mono', monospace; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 24px; margin-bottom: 32px; }
  .logo { font-size: 20px; font-weight: 700; letter-spacing: 0.06em; }
  .logo small { display: block; font-size: 11px; font-weight: 400; opacity: 0.5; letter-spacing: 0.16em; text-transform: uppercase; margin-top: 4px; }
  .receipt-meta { text-align: right; font-size: 12px; line-height: 1.8; }
  .receipt-meta .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.2em; opacity: 0.4; }
  h1 { font-size: 28px; font-weight: 700; letter-spacing: 0.08em; margin-bottom: 32px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 32px; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.2em; opacity: 0.4; padding: 8px 0; border-bottom: 1px solid #ddd; font-weight: 400; }
  th.right, td.right { text-align: right; }
  td { padding: 16px 0; border-bottom: 1px solid #eee; font-size: 14px; vertical-align: top; }
  .total-row td { border-bottom: 2px solid #111; font-weight: 700; font-size: 18px; padding: 16px 0; }
  .tax-note { font-size: 11px; opacity: 0.5; margin-top: -24px; margin-bottom: 32px; }
  footer { border-top: 1px solid #ddd; padding-top: 24px; margin-top: 40px; font-size: 11px; opacity: 0.5; line-height: 1.8; }
  @media print { body { padding: 20px; } .no-print { display: none; } }
  .print-btn { position: fixed; bottom: 24px; right: 24px; background: #111; color: #fff; border: none; padding: 12px 24px; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; cursor: pointer; font-family: 'JetBrains Mono', monospace; }
  .print-btn:hover { background: #333; }
</style>
</head>
<body>
  <header>
    <div class="logo">
      ロケハン3D
      <small>locahun3d.com</small>
    </div>
    <div class="receipt-meta mono">
      <div class="label">Receipt No.</div>
      <div>${shortId}</div>
      <div class="label" style="margin-top:8px">Date</div>
      <div>${date}</div>
    </div>
  </header>

  <h1>${t.heading}</h1>

  <table>
    <thead>
      <tr>
        <th>${t.item}</th>
        <th>${t.detail}</th>
        <th class="right">${t.amount}</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${t.dataItem}</td>
        <td>
          ${p.propertyTitle}${p.itemLabel ? ` (${p.itemLabel})` : ""}
        </td>
        <td class="right mono">${fmtPrice(p.priceYen)}</td>
      </tr>
      <tr class="total-row">
        <td colspan="2">${t.total}</td>
        <td class="right mono">${fmtPrice(p.priceYen)}</td>
      </tr>
    </tbody>
  </table>

  <p class="tax-note">${t.taxNote}</p>

  ${p.licenseLabel ? `<div style="margin-bottom: 24px; border: 1px solid #ddd; padding: 12px 16px;">
    <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.2em; opacity:0.4; margin-bottom:4px;">${t.license}</div>
    <div style="font-size:13px; font-weight:700;">${p.licenseLabel}</div>
    ${p.licenseDesc ? `<div style="font-size:11px; opacity:0.6; margin-top:4px;">${p.licenseDesc}</div>` : ""}
  </div>` : ""}

  <div style="margin-bottom: 32px;">
    <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.2em; opacity:0.4; margin-bottom:8px;">${t.purchaser}</div>
    <div class="mono" style="font-size:13px;">${p.userEmail}</div>
  </div>

  <footer>
    <div>${t.issuer}</div>
    <div>URL: https://locahun3d.com</div>
    <div>${t.contact}</div>
  </footer>
${forEmail ? "" : `
  <button class="print-btn no-print" onclick="window.print()">${t.printBtn}</button>`}
</body>
</html>`;
}
