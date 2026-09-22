/**
 * ?ref=stream で返す RAD の「中身」を表す強い ETag（2026-09-21）。
 *
 * 同じ RAD が埋め込み・共有・限定プレビュー・編集画面など、トークン付きの
 * 別々のURLで配られ、しかも参照保存のアーカイブ（ZIP）のキーは保存のたびに変わる。
 * ビューアーは当たり判定のキャッシュ識別子をURL込みで作っていたため、経路が変わる
 * たびに作り直しになっていた。R2 オブジェクトの ETag と ZIP 内の位置から作る
 * この値はURLに依存しないので、ビューアー側で「中身が同じ」と判定できる。
 *
 * 形式: `"l3d-content-<R2 etag（英数・_・- 以外は _）>-<ZIP内オフセット>"`
 * 素の .rad はオフセット 0。server-only は入れない（純関数）。
 */
export function streamContentEtag(objectEtag: string, entryOffset: number): string {
  const tag = String(objectEtag ?? "")
    .replace(/^W\//, "")
    .replace(/"/g, "")
    .replace(/[^A-Za-z0-9_-]/g, "_");
  const offset = Number.isSafeInteger(entryOffset) && entryOffset >= 0 ? entryOffset : 0;
  return `"l3d-content-${tag}-${offset}"`;
}
