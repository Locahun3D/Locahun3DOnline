/**
 * アップロードされた3DGSファイルから点群数を自動検出する（クライアント側、
 * アップロード前にブラウザ内で File を読むだけなので追加のネットワーク往復は無い）。
 *
 * 対応フォーマット:
 *  - .ply: ヘッダーはテキストなので "element vertex N" 行を読むだけで正確に取れる。
 *  - .splat (antimatter15形式): 1点=32byte固定のフラットバイナリ配列
 *    (pos xyz float32×3=12 + scale xyz float32×3=12 + rgba uint8×4=4 +
 *     rot quaternion uint8×4=4 → 32byte/点)。ファイルサイズがきれいに32で
 *    割り切れない場合は想定外フォーマットの疑いとして検出を諦める（誤った
 *    値を出品ページに載せるより「未検出」の方が安全）。
 *
 * .ksplat / .rad / .zip は独自ヘッダー構造が複雑（圧縮・セクション分割あり）
 * のため未対応 — 管理画面側は従来通り手動入力にフォールバックする。
 */

const PLY_HEADER_SCAN_BYTES = 4096;
const SPLAT_BYTES_PER_POINT = 32;

async function detectPlyPointCount(file: File): Promise<number | null> {
  try {
    const headerText = await file.slice(0, PLY_HEADER_SCAN_BYTES).text();
    const m = headerText.match(/element vertex (\d+)/);
    return m ? parseInt(m[1], 10) : null;
  } catch {
    return null;
  }
}

function detectSplatPointCount(fileSizeBytes: number): number | null {
  if (fileSizeBytes <= 0 || fileSizeBytes % SPLAT_BYTES_PER_POINT !== 0) return null;
  return fileSizeBytes / SPLAT_BYTES_PER_POINT;
}

export async function detectPointCount(file: File): Promise<number | null> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".ply")) return detectPlyPointCount(file);
  if (name.endsWith(".splat")) return detectSplatPointCount(file.size);
  return null;
}
