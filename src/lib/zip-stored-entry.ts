/**
 * ZIP に無圧縮で入っている 3DGS 本体（.rad）の、ファイル内での位置を読む（2026-09-21）。
 *
 * ビューアー用の ZIP は、パイプラインが 1件目に .rad を**無圧縮**で入れて作っている
 * （project.json はその後ろ）。無圧縮なので、ZIP の中の該当部分をそのまま返せば .rad になる。
 * つまり ZIP のまま置いてあるシーンでも、全体を落とさずに Range で少しずつ読める。
 *
 * ここは先頭 1KB だけを読んでローカルヘッダを見る（中央ディレクトリは読まない）。
 * 判定できないとき（圧縮されている・1件目が .rad でない・ZIP64）は null を返し、
 * 呼び出し側は従来どおり ZIP 全体を配る。
 */
export type StoredEntry = { name: string; offset: number; size: number };

const LOCAL_HEADER = 0x04034b50;

/** ZIP の先頭バイト列から、1件目が「無圧縮の .rad」ならその位置と大きさを返す。 */
export function parseStoredRadHeader(head: Uint8Array): StoredEntry | null {
  if (head.byteLength < 30) return null;
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
  if (view.getUint32(0, true) !== LOCAL_HEADER) return null;
  if (view.getUint16(8, true) !== 0) return null; // 0 = 無圧縮のときだけ扱う
  const compressed = view.getUint32(18, true);
  const uncompressed = view.getUint32(22, true);
  const nameLength = view.getUint16(26, true);
  const extraLength = view.getUint16(28, true);
  // 0xFFFFFFFF は ZIP64（4GB 超）。この経路では扱わない。
  if (compressed === 0xffffffff || compressed !== uncompressed || compressed < 1) return null;
  const start = 30 + nameLength + extraLength;
  if (head.byteLength < 30 + nameLength) return null;
  const name = new TextDecoder().decode(head.subarray(30, 30 + nameLength));
  if (!/\.rad$/i.test(name)) return null;
  return { name: name.split("/").pop() || name, offset: start, size: compressed };
}

type RangeReader = (offset: number, length: number) => Promise<Uint8Array | null>;

/** R2 などから先頭を読んで解析する。1回の小さな Range 取得だけで済む。 */
export async function readStoredRadEntry(read: RangeReader): Promise<StoredEntry | null> {
  const head = await read(0, 1024);
  if (!head) return null;
  return parseStoredRadHeader(head);
}

/**
 * 「.rad の中での Range 要求」を「ZIP の中での Range 要求」に読み替える。
 * 範囲の外に出る要求は null（呼び出し側が 416 を返す）。
 */
export function mapRangeIntoEntry(
  entry: StoredEntry,
  range: { offset: number; length?: number } | { suffix: number } | undefined,
): { offset: number; length: number } {
  if (!range) return { offset: entry.offset, length: entry.size };
  if ("suffix" in range) {
    const length = Math.min(range.suffix, entry.size);
    return { offset: entry.offset + entry.size - length, length };
  }
  const start = Math.min(range.offset, entry.size);
  const length = Math.min(range.length ?? entry.size - start, entry.size - start);
  return { offset: entry.offset + start, length };
}
