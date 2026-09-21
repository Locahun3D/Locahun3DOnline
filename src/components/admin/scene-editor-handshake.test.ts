import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * 3DGS編集の読み込み指示は、ビューアーが ready を送るたびに出し直す。
 *
 * 本番の /viewer/scene-editor.html は拡張子なしのURLへ 307 で飛ぶため、iframe は
 * 文書を2回作る。1回目に出した指示は差し替えで消えるので、1回しか出さない作りだと
 * 「3DGSを読み込んでいます」のまま止まる（2026-09-21 本番で実測）。
 */
describe("3DGS編集の受け渡し", () => {
  const src = readFileSync(
    path.join(process.cwd(), "src/components/admin/scene-editor.tsx"),
    "utf8",
  );
  const readyBranch = src.slice(src.indexOf("locahun:scene-editor-ready"));

  it("ready を受けたら、送信済みの印を落としてから出し直す", () => {
    const line = readyBranch.slice(0, 160);
    expect(line).toContain("loadSent.current=false");
    expect(line).toContain("load()");
  });

  it("読み込み指示はシーンの読み込み先を必ず添える", () => {
    expect(src).toContain("type:'locahun:scene-load'");
    expect(src).toContain("sourceUrl:session.current.sourceUrl");
  });
});
