import "server-only";
import { propertyPreviewRepo, isPreviewExpired } from "./property-previews";
import { propertyEmbedRepo } from "./property-embeds";
import { viewerShareRepo } from "./viewer-shares";

/**
 * 限定プレビュー・埋め込み・共有リンクのトークンを、3DGS の配信 (/api/viewer-stream) でも通す（2026-09-21）。
 *
 * これらのトークンは既に `/api/viewer-asset` が「ログイン不要で見せてよい」と判断している経路。
 * 参照保存のシーンは本体を `?ref=stream` で読むため、そこを会員限定のままにすると
 * 埋め込み先や共有リンクで 3D が出ない（本番で真っ白になった）。
 *
 * ここは**物件IDを返すだけ**。返った物件と、要求されたファイルの持ち主が一致するかは
 * 呼び出し側が必ず確かめる（他物件のファイルを読ませないため）。
 */
export interface ViewerStreamGrant {
  propertyId: string;
  /** 監査・レート制限のための識別子（例: `embed:xxxx`）。 */
  via: string;
}

export async function viewerStreamTokenGrant(tokens: {
  preview?: string;
  embed?: string;
  share?: string;
}): Promise<ViewerStreamGrant | null> {
  const preview = (tokens.preview || "").trim();
  if (preview) {
    const found = await propertyPreviewRepo.get(preview);
    if (found && !isPreviewExpired(found)) {
      return { propertyId: found.propertyId, via: `preview:${preview}` };
    }
  }
  const embed = (tokens.embed || "").trim();
  if (embed) {
    const found = await propertyEmbedRepo.get(embed);
    if (found?.enabled) return { propertyId: found.propertyId, via: `embed:${embed}` };
  }
  const share = (tokens.share || "").trim();
  if (share) {
    const found = await viewerShareRepo.get(share);
    // 共有リンクは 3DGS のキーに直接ひもづく（物件IDは持たない）。
    // 呼び出し側の物件照合を通すため、キーから物件を引くのは呼び出し側に任せる。
    if (found) return { propertyId: found.propertyId, via: `share:${share}` };
  }
  return null;
}
