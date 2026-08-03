import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * マイナンバー（個人番号）の暗号化・復号。
 *
 * ── なぜ必要か ────────────────────────────────────────────
 * 分配金（掲載データ販売分配・持ち込みスキャン分配）を個人へ支払う際、
 * 源泉徴収した支払いは税務署への支払調書提出が必要で、2016年以降これには
 * マイナンバーの記載が求められる（2026-08-02 リーガルチェックで発覚した穴）。
 * マイナンバー法上、平文でDBに保存することは許容されない取り扱いのため、
 * AES-GCMで暗号化してから保存する。**復号は支払調書作成など真に必要な
 * 場面でのみ行うこと。一覧・編集画面では常に `maskMyNumber` でマスク表示する。**
 *
 * 鍵は `PAYEE_MYNUMBER_ENC_KEY`（32byte を base64 エンコードしたもの）を
 * 環境変数として別途設定する。生成例:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 * 鍵が未設定の環境では暗号化・復号とも例外を投げる（平文保存のフォールバックは
 * 意図的に用意しない — 「暗号化できないなら保存しない」を強制するため）。
 */

async function getKey(): Promise<CryptoKey> {
  let raw: string | undefined;
  try {
    const { env } = await getCloudflareContext();
    raw = (env as Record<string, unknown>).PAYEE_MYNUMBER_ENC_KEY as string | undefined;
  } catch {
    /* not on Workers */
  }
  raw ??= process.env.PAYEE_MYNUMBER_ENC_KEY;
  if (!raw) {
    throw new Error(
      "PAYEE_MYNUMBER_ENC_KEY が未設定です。マイナンバーは暗号化キー無しでは保存できません。",
    );
  }
  const keyBytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  if (keyBytes.length !== 32) {
    throw new Error("PAYEE_MYNUMBER_ENC_KEY は32byte(base64)である必要があります。");
  }
  return crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** マイナンバー(12桁の数字文字列)を暗号化し、base64(iv(12byte) + ciphertext) で返す。 */
export async function encryptMyNumber(plainDigits: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder().encode(plainDigits);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc);
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return toBase64(combined);
}

/** encryptMyNumber の逆。支払調書作成など、真に平文が必要な場面でのみ呼ぶこと。 */
export async function decryptMyNumber(encoded: string): Promise<string> {
  const key = await getKey();
  const combined = fromBase64(encoded);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plain);
}

/** マスク表示用（一覧・編集画面はこれだけ使い、復号は絶対にしない）。 */
export function maskMyNumber(hasValue: boolean): string {
  return hasValue ? "登録済み（••••••••••••）" : "未登録";
}
