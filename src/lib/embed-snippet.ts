/**
 * 掲載スタジオが自社サイトへ貼る「3Dツアー埋め込み」のURLとコードを組み立てる（純関数・2026-09-21）。
 *
 * 本人指示: 公開申請のメールで、先方のサイトに埋め込める3Dビューアーのリンクを渡す。恒久的なもの。
 * 参考にしたのは Matterport の埋め込み（`<iframe src="…/show/?m=…" allowfullscreen allow="xr-spatial-tracking">`）:
 *  - URLは**期限なし**で、モデルに対して1本。貼り替えを強いない。
 *  - 表示の調整はURLのパラメータで行う（自動再生・タイトルの有無など）。
 *  - 公式の案内は固定サイズの iframe だが、実際の制作現場では**比率を保つ入れ物**に入れて使う。
 *    固定高さ（例 520px）のままだと、スマホで極端に縦長・横長になって崩れる。
 *
 * サーバー（メール本文）と管理画面の両方から使う。片方だけ直して食い違うのを防ぐため、
 * ここが唯一の正本。`server-only` は入れない。
 */

export interface EmbedOptions {
  /** 読み込み後すぐ3Dを開始する（既定: しない＝サムネイルから訪問者が押して開始）。 */
  autoplay?: boolean;
  /** 下端の物件名の帯を出すか（既定: 出す）。ブランド表示（Powered by）は常に出す。 */
  title?: boolean;
  /** 複数シーンがある物件で、開くシーンのID。省略すると先頭の公開シーン。 */
  scene?: string;
}

/** 埋め込み用の恒久URL。パラメータは既定値と同じなら付けない（URLを短く保つ）。 */
export function embedUrl(origin: string, token: string, opts: EmbedOptions = {}): string {
  const base = `${origin.replace(/\/+$/, "")}/embed/${token}`;
  const params = new URLSearchParams();
  if (opts.autoplay) params.set("autoplay", "1");
  if (opts.title === false) params.set("title", "0");
  if (opts.scene) params.set("scene", opts.scene);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/**
 * 貼り付け用の埋め込みコード。
 * 高さは `padding-top`（%＝親の幅に対する比）で作り、iframe をその上に敷く。昔からある方法で、
 * どのブラウザでも同じ比率になる。幅は親に合わせて伸び縮みするので、スマホでも崩れない。
 *
 * ⚠ `aspect-ratio` と `padding-top` を**両方**書くと高さが二重に付く（実測: 16:9 のつもりが 0.89:1）。
 *    インラインの style では `@supports` で出し分けられないため、確実に効く padding だけにする。
 */
export function embedSnippet(
  url: string,
  { title = "3Dツアー", ratio = "16 / 9" }: { title?: string; ratio?: string } = {},
): string {
  const pad = paddingTopFor(ratio);
  return [
    `<div style="position:relative;width:100%;padding-top:${pad};overflow:hidden;">`,
    `  <iframe src="${esc(url)}" title="${esc(title)}"`,
    `    style="position:absolute;inset:0;width:100%;height:100%;border:0;"`,
    `    loading="lazy" allowfullscreen allow="fullscreen; xr-spatial-tracking"></iframe>`,
    `</div>`,
  ].join("\n");
}

/**
 * `aspect-ratio` を解釈できないブラウザ向けの保険（高さを padding で作る昔からの方法）。
 * `aspect-ratio` が効く環境では padding より `aspect-ratio` が勝つので、二重にはならない。
 */
export function paddingTopFor(ratio: string): string {
  const m = /^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/.exec(ratio);
  if (!m) return "56.25%";
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!w || !h) return "56.25%";
  return `${((h / w) * 100).toFixed(4).replace(/\.?0+$/, "")}%`;
}
