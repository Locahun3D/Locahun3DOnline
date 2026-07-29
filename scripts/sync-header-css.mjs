/**
 * sync-header-css.mjs — ヘッダーCSSの単一ソースをオンライン版へ機械コピーする。
 *
 *   node scripts/sync-header-css.mjs --check   # 差分があれば exit 1
 *   node scripts/sync-header-css.mjs --write   # 反映
 *
 * ── なぜ要るのか ──────────────────────────────────────────────
 * ヘッダーは「見た目を1つに揃えたい」のに、実装が2つあった。
 *   スキャン     digiroke3d_Web/assets/site-header.css （手書きCSS）
 *   オンライン   src/components/site-header.tsx        （Tailwindクラス）
 * 同じ意図を別の書き方で表現していたため、人手で同期している限り必ずズレる。
 * 2026-07-29 の1日だけで、この構造が原因のズレが5件出た:
 *   - 100vw の解決値が両サイトで違い、ブランド中心が7.5pxずれた
 *   - height:56px(border込) と h-14+border(57px) で1px違った
 *   - white-space:nowrap が片方の帯指定にしか無く、統合時に落ちた
 *   - .sh-drawer-lang の詳細度が負けてPCナビにENが出た
 *   - Tailwind の max-[1023px] は1023を含まず、CSSの max-width:1023px と1pxずれた
 *
 * → **CSSの正本を1つにし、オンライン版はそれをコピーして読む**。
 *   ハーネス(header-parity 等)は事後に検出するだけで発生は防げないが、
 *   これは発生自体を構造的に止める。
 *
 * ⚠ 正本は digiroke3d_Web/assets/site-header.css。コピー先を直接編集しないこと
 *   （--check が落ちる）。CIやデプロイ前に --check を回す。
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "../../digiroke3d_Web/assets/site-header.css");
const DEST = resolve(HERE, "../src/app/site-header.css");

const BANNER = `/* ============================================================
   ⚠ 自動生成ファイル — 直接編集しないこと
   正本: digiroke3d_Web/assets/site-header.css
   同期: node scripts/sync-header-css.mjs --write
   検査: node scripts/sync-header-css.mjs --check
   ここを手で直すと、スキャンサイトとの見た目が再びズレる。
   ============================================================ */\n`;

if (!existsSync(SRC)) {
  console.error(`正本が見つかりません: ${SRC}`);
  console.error("digiroke3d_Web リポジトリが隣に無い環境では --check をスキップすること。");
  process.exit(2);
}

const want = BANNER + readFileSync(SRC, "utf8");
const have = existsSync(DEST) ? readFileSync(DEST, "utf8") : null;

if (process.argv.includes("--write")) {
  if (have === want) {
    console.log("同期済み（変更なし）");
  } else {
    writeFileSync(DEST, want);
    console.log(`書き込みました: ${DEST}`);
  }
  process.exit(0);
}

if (have === want) {
  console.log("✔ ヘッダーCSSは正本と一致");
  process.exit(0);
}
console.error("✘ ヘッダーCSSが正本とずれています。node scripts/sync-header-css.mjs --write を実行してください。");
process.exit(1);
