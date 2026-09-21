#!/usr/bin/env node
/**
 * 掲載スタジオのサイトに 3Dツアーを貼ったら「どう見えるか」を確かめる検証ページ
 * （2026-09-21 本人指示「埋め込みしたらどうなるかのテストページみたい」）。
 *
 * ダミーのスタジオサイトを別オリジンで立て、公開申請メールで渡すのと**同じ**
 * 埋め込みコードをその中に貼る。別オリジンであることが要点で、
 * 同一オリジンの iframe では X-Frame-Options も 100dvh の縮みも再現しない。
 *
 *   node scripts/embed-demo.mjs                     # 本番の歌舞伎町ゲート
 *   node scripts/embed-demo.mjs --url http://localhost:3001/embed/emb-test-000000001
 *   node scripts/embed-demo.mjs --port 8137
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const embedUrl = arg("url", "https://locahun3d.com/embed/yM-OaRq8FiqIKSYBF2");
const port = Number(arg("port", "8137"));
const html = fs
  .readFileSync(path.join(here, "embed-demo.html"), "utf8")
  .replace("__EMBED_URL__", embedUrl);

http
  .createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  })
  .listen(port, () => {
    console.log(`貼り付け先のダミーサイト: http://localhost:${port}/`);
    console.log(`埋め込んでいる3Dツアー:   ${embedUrl}`);
  });
