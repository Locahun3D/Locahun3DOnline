/**
 * `/partials/header` — 配信用ヘッダー部品の組み立てヘルパー。
 *
 * ねらい: works（web.locahun3d.com/works/**・静的HTML）のヘッダーを
 * 「オンライン版の本物のヘッダー」そのものにする。works 側にマークアップも
 * 数値も一切持たせないのが目的なので、**ここで手書きのCSS/HTMLを足さない**。
 * 素材は必ず「実際に描画された `/partials/header-frame` の HTML」と
 * 「そのページが読み込んでいるビルド済みCSS」だけ。加工は機械的な変換に限る。
 *
 * 変換の内訳:
 *   1. CSS: @font-face を捨てる（Shadow DOM 内の @font-face はそもそも
 *      適用されない仕様。かつ Noto Sans JP のサブセット定義だけで 1.1MB ある）。
 *      works 側は同じ Noto Sans JP / JetBrains Mono を Google Fonts から
 *      document レベルで読んでいるので、family 名で解決できる。
 *   2. CSS: `:root` / `html` / `body` セレクタを `:host` へ寄せる。Shadow 内では
 *      `:root` が何にもマッチせず、CSS変数（--color-*, --font-*）が全滅するため。
 *   3. CSS: `zoom` と `--z` の宣言だけ落とす。これはページ全体のスケール指定であって
 *      ヘッダーの持ち物ではない。ヘッダー自身が `zoom: calc(1/var(--z))` で打ち消す
 *      設計なので、works 側では `--z:1` を与えて等倍にする（末尾で :host に付与）。
 *   4. CSS: ヘッダーHTMLに出てこないクラスのルールを落とす（178KB → 数KB）。
 *      「セレクタ中の全クラストークンが使用クラス集合にあるものだけ残す」という
 *      機械判定。動的に付け外しするクラスは DYNAMIC_CLASSES で明示的に守る。
 *   5. HTML: ルート相対リンクを locahun3d.com の絶対URLへ。
 */

export const ONLINE_ORIGIN = "https://locahun3d.com";
export const WORKS_ORIGIN = "https://web.locahun3d.com";

/**
 * 静的HTMLに埋め込んだ後、シム(JS)が付け外しするクラス。
 * ヘッダーの初期HTMLには現れないので prune から明示的に守る。
 * ⚠ header-tablet-nav.tsx のドロワー開閉と対。片方だけ変えると works で崩れる。
 */
const DYNAMIC_CLASSES = ["max-[1024px]:hidden", "bg-accent", "bg-muted"];

/** ホスト要素のid（シムと works 側の両方から参照する）。 */
export const HOST_ID = "lh-online-header";

// ── CSS パーサ（波括弧の対応だけ見る簡易版） ──────────────────────────

type Node =
  | { kind: "at-statement"; text: string } // `@layer a, b;`
  | { kind: "block"; prelude: string; body: string };

/**
 * プレリュード（セレクタ／at-rule 見出し）からコメントを除く。
 * ⚠ これを省くと壊れる。ビルド後のCSSは「CSSコメント + @font-face{…}」のように
 *   コメントが at-rule の直前に付く。コメント込みで判定すると
 *   `@font-face` が at-rule と見なされず、しかもコメント内の `.module.css` が
 *   クラス名として拾われて **@layer properties ごと落ちる**（実測: ヘッダー下の
 *   1px ボーダーが消え、フォント定義が漏れた）。
 */
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "");
}

function parseNodes(css: string): Node[] {
  const out: Node[] = [];
  let buf = "";
  let i = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch === "{") {
      let depth = 1;
      let j = i + 1;
      while (j < css.length && depth > 0) {
        if (css[j] === "{") depth++;
        else if (css[j] === "}") depth--;
        j++;
      }
      out.push({ kind: "block", prelude: stripComments(buf).trim(), body: css.slice(i + 1, j - 1) });
      buf = "";
      i = j;
    } else if (ch === ";" && stripComments(buf).trim().startsWith("@")) {
      out.push({ kind: "at-statement", text: stripComments(buf).trim() + ";" });
      buf = "";
      i++;
    } else {
      buf += ch;
      i++;
    }
  }
  return out;
}

/** トップレベルのカンマでセレクタリストを割る（`:is(a,b)` の中は割らない）。 */
function splitSelectorList(sel: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of sel) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      parts.push(buf);
      buf = "";
    } else buf += ch;
  }
  if (buf.trim()) parts.push(buf);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/**
 * セレクタ片からクラス名を取り出す。Tailwind v4 はエスケープを多用するので
 * （`.max-\[1024px\]\:hidden`）バックスラッシュを外して実クラス名に戻す。
 */
function classTokens(part: string): string[] {
  const out: string[] = [];
  const re = /\.((?:\\.|[A-Za-z0-9_-])+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(part))) out.push(m[1].replace(/\\(.)/g, "$1"));
  return out;
}

/** `:root` / `html` / `body` を `:host` へ寄せる（`html body` のような組も含む）。 */
function hostifySelector(part: string): string {
  let s = part.replace(/(^|[\s>+~(,])(:root|html|body)(?=$|[\s>+~,:.[)])/g, "$1:host");
  // `:host :host` / `:host:host` に潰れた組を1つにまとめる
  s = s.replace(/:host(\s*[>+~]?\s*):host/g, ":host");
  return s;
}

const DROP_DECL = /(^|;)\s*(zoom|--z)\s*:[^;]*/gi;

function stripPageScaleDecls(body: string): string {
  return body.replace(DROP_DECL, "$1").replace(/;\s*;/g, ";");
}

/**
 * CSS を「Shadow DOM 内で、このヘッダーHTMLに対して効く分」だけに絞って返す。
 * @param used ヘッダーHTMLに出現するクラス名の集合
 */
export function transformCss(css: string, used: Set<string>): string {
  const usedAll = new Set(used);
  for (const c of DYNAMIC_CLASSES) usedAll.add(c);

  const walk = (nodes: Node[], inProperties = false): string => {
    let out = "";
    for (const n of nodes) {
      if (n.kind === "at-statement") {
        out += n.text;
        continue;
      }
      const p = n.prelude;
      if (/^@font-face/i.test(p)) continue; // Shadow DOM では効かない＋巨大
      if (/^@(charset|import)/i.test(p)) continue;
      /* ⚠ `@property` は @font-face と同じく document スコープで、Shadow DOM 内の
       *    スタイルシートに書いても登録されない。Tailwind v4 の
       *    `border-bottom-style: var(--tw-border-style)` のような指定は初期値が
       *    取れず無効になり、**ヘッダー下の1pxボーダーが消える**（実測 55px/56px）。
       *    Tailwind は @property 非対応ブラウザ向けの同じ初期値一式を
       *    `@layer properties { @supports(…) { *,:before,:after,::backdrop { … } } }`
       *    として既に出力しているので、その @supports のゲートだけ外して常に効かせる。
       *    ＝値はTailwindが出したものをそのまま使う（手書きしない）。 */
      if (inProperties && /^@supports/i.test(p)) {
        out += walk(parseNodes(n.body), true);
        continue;
      }
      if (/^@(media|supports|container|layer|scope)/i.test(p)) {
        const inner = walk(parseNodes(n.body), inProperties || /^@layer\s+properties\b/i.test(p));
        if (inner.trim()) out += `${p}{${inner}}`;
        continue;
      }
      if (/^@(keyframes|-webkit-keyframes|property|counter-style|font-feature-values)/i.test(p)) {
        out += `${p}{${n.body}}`;
        continue;
      }
      if (p.startsWith("@")) continue; // 未知の at-rule は捨てる

      const kept = splitSelectorList(p)
        .filter((part) => classTokens(part).every((c) => usedAll.has(c)))
        .map(hostifySelector);
      if (!kept.length) continue;
      const body = stripPageScaleDecls(n.body);
      if (!body.trim()) continue;
      out += `${kept.join(",")}{${body}}`;
    }
    return out;
  };

  // ⚠ 末尾に置くこと（同詳細度は後勝ち）。works ページには html の zoom が無いので
  //    ヘッダーは等倍。display:contents はホストに箱を作らせないため（箱があると
  //    ヘッダーの position:sticky がホストの高さに閉じ込められて効かなくなる）。
  return walk(parseNodes(css)) + `:host{--z:1;display:contents}`;
}

/** HTML の class 属性から使用クラス集合を作る。 */
export function collectClasses(html: string): Set<string> {
  const out = new Set<string>();
  const re = /\sclass="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    for (const c of m[1].split(/\s+/)) if (c) out.add(c);
  }
  return out;
}

/** `<header …>…</header>` を1つ取り出す（ヘッダー内に header は入れ子にしない）。 */
export function extractHeader(html: string): string | null {
  const start = html.indexOf("<header");
  if (start < 0) return null;
  const end = html.indexOf("</header>", start);
  if (end < 0) return null;
  return html.slice(start, end + "</header>".length);
}

/** `<head>` 内の `<link rel="stylesheet">` の href を並び順のまま返す。 */
export function extractStylesheetHrefs(html: string): string[] {
  const out: string[] = [];
  const re = /<link\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[0];
    if (!/rel="?stylesheet/i.test(tag)) continue;
    const href = tag.match(/href="([^"]+)"/i)?.[1];
    if (href) out.push(href);
  }
  return out;
}

/** `<head>`/`<body>` 直挿しの `<style>` 中身（dev の Turbopack 経路）。 */
export function extractInlineStyles(html: string): string[] {
  const out: string[] = [];
  const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

/**
 * ヘッダーHTMLを「別ドメインに置いても壊れない」形へ機械変換する。
 *  - ルート相対の href/src を locahun3d.com の絶対URLへ（同一タブのまま）
 *  - 言語トグル（aria-label="Language"）の行き先だけ works 側の対応ページへ差し替え
 *  - `<script>` は落とす（RSC ペイロード等が混ざっても意味が無い）
 */
export function transformHeaderHtml(html: string, altLangUrl: string | null): string {
  let out = html.replace(/<script\b[\s\S]*?<\/script>/gi, "");
  out = out.replace(/\s(href|src)="\/(?!\/)([^"]*)"/g, (_m, attr, path) => ` ${attr}="${ONLINE_ORIGIN}/${path}"`);
  if (altLangUrl) {
    out = out.replace(/<a\b[^>]*aria-label="Language"[^>]*>/gi, (tag) =>
      tag.replace(/\shref="[^"]*"/i, ` href="${altLangUrl}"`),
    );
  }
  return out;
}

/** `alt` クエリの検証（works ドメイン配下だけ許可＝オープンリダイレクト防止）。 */
export function sanitizeAltLangUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw, WORKS_ORIGIN);
    if (u.origin !== WORKS_ORIGIN) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * 静的ページ側で動かす最小のシム。
 * React は works ページで動かないので、ヘッダーの「押したら動く」部分だけを
 * ここで配線する。見た目に関わる値は一切持たない（クラスの付け外しのみ）。
 */
export function shimScript(): string {
  return `(function(){var h=document.getElementById(${JSON.stringify(HOST_ID)});if(!h||!h.shadowRoot)return;var r=h.shadowRoot;
var b=r.querySelector('[data-hb]'),d=r.getElementById('header-tablet-nav');
var HID='max-[1024px]:hidden';
function set(o){if(!d)return;d.classList.toggle(HID,!o);if(b){b.setAttribute('aria-expanded',String(o));
Array.prototype.forEach.call(b.children,function(s){s.classList.toggle('bg-accent',o);s.classList.toggle('bg-muted',!o);});}}
if(b&&d){b.addEventListener('click',function(){set(d.classList.contains(HID));});
d.addEventListener('click',function(e){if(e.target.closest('a'))set(false);});
addEventListener('keydown',function(e){if(e.key==='Escape')set(false);});
matchMedia('(min-width:1024px)').addEventListener('change',function(e){if(e.matches)set(false);});}
r.querySelectorAll('[data-auth]').forEach(function(el){el.addEventListener('click',function(){
location.href=${JSON.stringify(ONLINE_ORIGIN)}+(el.getAttribute('data-auth')==='signup'?'/sign-up':'/sign-in');});});})();`;
}

/** 最終出力（Declarative Shadow DOM 1ブロック + シム）。 */
export function buildPartial(headerHtml: string, css: string): string {
  return (
    `<div id="${HOST_ID}"><template shadowrootmode="open">` +
    `<style>${css}</style>${headerHtml}` +
    `</template></div>` +
    `<script>${shimScript()}</script>`
  );
}
