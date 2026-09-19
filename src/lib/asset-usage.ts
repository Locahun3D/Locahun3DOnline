/**
 * PURE: compute which properties reference each asset URL.
 * No server-only import — testable in node env.
 */
import type { Asset, Property } from "./schemas";
import {sceneEditSourceKey} from './scene-edit-contract';

/**
 * url → propertyId[] (only urls actually referenced are present).
 *
 * ⚠ 参照元は多数のフィールドに散らばっている（実機で発覚: 複数シーンを持つ
 * 物件の 3DGS/プレビュー動画/ダウンロードファイルが軒並み「未使用」と誤判定
 * されていた）。トップレベルの splatUrl/zipUrl はレガシー1シーン時代の名残
 * で、現行エディタは splatItems[] に複数シーンを登録する（CLAUDE.md参照）。
 * 新しい参照経路を追加する時は必ずここにも追加すること。
 */
export function computeAssetUsage(
  properties: Pick<
    Property,
    "id" | "cover" | "gallery" | "splatUrl" | "zipUrl" | "blueprints" | "splatItems"
  >[],
  assets: (Pick<Asset, "url"> & Partial<Pick<Asset,"r2Key">>)[],
  options: {historyOnly?:boolean} = {},
): Record<string, string[]> {
  const known = new Set(assets.map((a) => a.url).filter(Boolean));
  const aliases = new Map<string,string[]>();
  for(const asset of assets){
    const key=asset.r2Key || sceneEditSourceKey(asset.url);
    if(key&&asset.url)aliases.set(key,[...(aliases.get(key)??[]),asset.url]);
  }
  const usage: Record<string, string[]> = {};
  const add = (url: string | undefined, pid: string) => {
    if (!url) return;
    const key=sceneEditSourceKey(url);
    const urls=new Set([...(known.has(url)?[url]:[]),...(key?aliases.get(key)??[]:[])]);
    for(const matched of urls)(usage[matched]??=[]).push(pid);
  };
  for (const p of properties) {
    if (!options.historyOnly) {
    add(p.cover?.src, p.id);
    for (const g of p.gallery ?? []) add(g.src, p.id);
    add(p.splatUrl, p.id); // レガシー1シーン物件
    add(p.zipUrl, p.id); // レガシー1シーン物件
    for (const b of p.blueprints ?? []) add(b.url, p.id);
    }
    for (const item of p.splatItems ?? []) {
      for (const version of item.editVersions ?? []) add(version.url, p.id);
      if(options.historyOnly)continue;
      add(item.splatUrl, p.id);
      add(item.previewVideoUrl, p.id);
      add(item.downloadFileUrl, p.id);
      for (const f of item.downloadFiles ?? []) add(f.url, p.id);
    }
  }
  return usage;
}
