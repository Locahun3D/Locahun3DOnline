import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { purchaseRepo } from "@/lib/purchases";
import { repo as propertyRepo } from "@/lib/store";
import { DATA_LICENSE_LABEL, DATA_LICENSE_DESC } from "@/lib/schemas";

export const runtime = "nodejs";

function fmtPrice(n: number) {
  return `¥${n.toLocaleString()}`;
}

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  } catch {
    return iso;
  }
}

function generateReceiptHtml(p: {
  id: string;
  propertyTitle: string;
  itemLabel: string;
  priceYen: number;
  createdAt: string;
  completedAt?: string;
  userEmail: string;
  licenseLabel?: string;
  licenseDesc?: string;
}) {
  const date = fmtDate(p.completedAt || p.createdAt);
  const shortId = p.id.slice(0, 8).toUpperCase();

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>領収書 ${shortId} — ロケハン3D</title>
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

  <h1>領収書</h1>

  <table>
    <thead>
      <tr>
        <th>品目</th>
        <th>詳細</th>
        <th class="right">金額</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>3DGSデータ</td>
        <td>
          ${p.propertyTitle}${p.itemLabel ? ` (${p.itemLabel})` : ""}
        </td>
        <td class="right mono">${fmtPrice(p.priceYen)}</td>
      </tr>
      <tr class="total-row">
        <td colspan="2">合計（税込）</td>
        <td class="right mono">${fmtPrice(p.priceYen)}</td>
      </tr>
    </tbody>
  </table>

  <p class="tax-note">※ 上記金額には消費税が含まれています。</p>

  ${p.licenseLabel ? `<div style="margin-bottom: 24px; border: 1px solid #ddd; padding: 12px 16px;">
    <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.2em; opacity:0.4; margin-bottom:4px;">ライセンス</div>
    <div style="font-size:13px; font-weight:700;">${p.licenseLabel}</div>
    ${p.licenseDesc ? `<div style="font-size:11px; opacity:0.6; margin-top:4px;">${p.licenseDesc}</div>` : ""}
  </div>` : ""}

  <div style="margin-bottom: 32px;">
    <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.2em; opacity:0.4; margin-bottom:8px;">購入者</div>
    <div class="mono" style="font-size:13px;">${p.userEmail}</div>
  </div>

  <footer>
    <div>発行者: ロケハン3D（中村 航）</div>
    <div>URL: https://locahun3d.com</div>
    <div>お問い合わせ: info@locahun3d.com</div>
  </footer>

  <button class="print-btn no-print" onclick="window.print()">印刷 / PDF保存</button>
</body>
</html>`;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const { id } = await params;
  const purchase = await purchaseRepo.get(id);
  if (!purchase) {
    return NextResponse.json({ error: "購入が見つかりません" }, { status: 404 });
  }

  if (purchase.userId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "アクセス権がありません" }, { status: 403 });
  }

  if (purchase.status !== "completed") {
    return NextResponse.json({ error: "未完了の購入です" }, { status: 400 });
  }

  const property = await propertyRepo.get(purchase.propertyId);
  const license = property?.splatItems[purchase.splatItemIndex]?.license ?? "standard";

  const html = generateReceiptHtml({
    ...purchase,
    licenseLabel: DATA_LICENSE_LABEL[license],
    licenseDesc: DATA_LICENSE_DESC[license],
  });
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
