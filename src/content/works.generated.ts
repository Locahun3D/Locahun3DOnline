// ⚠ 自動生成 — 直接編集しない。
// 生成: node scripts/import-works.mjs（取込元 digiroke3d_Web/works・digiroke3d_Web/en/works）
// Cloudflare Workers にはファイルシステムが無いため、記事 JSON は静的 import で
// バンドルに焼き込む。ここは束ねるだけのモジュール。
import type { WorksPage } from "@/lib/works-content";
import p_ja_3dgs_file_formats from "../../content/works/ja/3dgs-file-formats.json";
import p_ja_3dgs_lidar_denoise from "../../content/works/ja/3dgs-lidar-denoise.json";
import p_ja_3dgs_software_comparison from "../../content/works/ja/3dgs-software-comparison.json";
import p_ja_blog from "../../content/works/ja/blog.json";
import p_ja_chevron_rokunowa_mv from "../../content/works/ja/chevron-rokunowa-mv.json";
import p_ja_houdini_comfyui_gsplat_workflow from "../../content/works/ja/houdini-comfyui-gsplat-workflow.json";
import p_ja_index from "../../content/works/ja/index.json";
import p_ja_isaacsim_3dgs_import from "../../content/works/ja/isaacsim-3dgs-import.json";
import p_ja_isaacsim_3dgs_robot_demos from "../../content/works/ja/isaacsim-3dgs-robot-demos.json";
import p_ja_portalcam_drone_ai_workflow from "../../content/works/ja/portalcam-drone-ai-workflow.json";
import p_ja_portalcam_xbin_raw_extraction from "../../content/works/ja/portalcam-xbin-raw-extraction.json";
import p_ja_shibuya_ten_simulations from "../../content/works/ja/shibuya-ten-simulations.json";
import p_ja_ue5_xgrids_3dgs_aerial_ai from "../../content/works/ja/ue5-xgrids-3dgs-aerial-ai.json";
import p_ja_vectorworks_3dgs_mesh from "../../content/works/ja/vectorworks-3dgs-mesh.json";
import p_en_3dgs_file_formats from "../../content/works/en/3dgs-file-formats.json";
import p_en_3dgs_lidar_denoise from "../../content/works/en/3dgs-lidar-denoise.json";
import p_en_3dgs_software_comparison from "../../content/works/en/3dgs-software-comparison.json";
import p_en_blog from "../../content/works/en/blog.json";
import p_en_chevron_rokunowa_mv from "../../content/works/en/chevron-rokunowa-mv.json";
import p_en_houdini_comfyui_gsplat_workflow from "../../content/works/en/houdini-comfyui-gsplat-workflow.json";
import p_en_index from "../../content/works/en/index.json";
import p_en_isaacsim_3dgs_import from "../../content/works/en/isaacsim-3dgs-import.json";
import p_en_isaacsim_3dgs_robot_demos from "../../content/works/en/isaacsim-3dgs-robot-demos.json";
import p_en_portalcam_drone_ai_workflow from "../../content/works/en/portalcam-drone-ai-workflow.json";
import p_en_portalcam_xbin_raw_extraction from "../../content/works/en/portalcam-xbin-raw-extraction.json";
import p_en_shibuya_ten_simulations from "../../content/works/en/shibuya-ten-simulations.json";
import p_en_ue5_xgrids_3dgs_aerial_ai from "../../content/works/en/ue5-xgrids-3dgs-aerial-ai.json";
import p_en_vectorworks_3dgs_mesh from "../../content/works/en/vectorworks-3dgs-mesh.json";

export const WORKS_PAGES: Record<"ja" | "en", Record<string, WorksPage>> = {
 ja: {
  "3dgs-file-formats": p_ja_3dgs_file_formats as WorksPage,
  "3dgs-lidar-denoise": p_ja_3dgs_lidar_denoise as WorksPage,
  "3dgs-software-comparison": p_ja_3dgs_software_comparison as WorksPage,
  "blog": p_ja_blog as WorksPage,
  "chevron-rokunowa-mv": p_ja_chevron_rokunowa_mv as WorksPage,
  "houdini-comfyui-gsplat-workflow": p_ja_houdini_comfyui_gsplat_workflow as WorksPage,
  "index": p_ja_index as WorksPage,
  "isaacsim-3dgs-import": p_ja_isaacsim_3dgs_import as WorksPage,
  "isaacsim-3dgs-robot-demos": p_ja_isaacsim_3dgs_robot_demos as WorksPage,
  "portalcam-drone-ai-workflow": p_ja_portalcam_drone_ai_workflow as WorksPage,
  "portalcam-xbin-raw-extraction": p_ja_portalcam_xbin_raw_extraction as WorksPage,
  "shibuya-ten-simulations": p_ja_shibuya_ten_simulations as WorksPage,
  "ue5-xgrids-3dgs-aerial-ai": p_ja_ue5_xgrids_3dgs_aerial_ai as WorksPage,
  "vectorworks-3dgs-mesh": p_ja_vectorworks_3dgs_mesh as WorksPage,
 },
 en: {
  "3dgs-file-formats": p_en_3dgs_file_formats as WorksPage,
  "3dgs-lidar-denoise": p_en_3dgs_lidar_denoise as WorksPage,
  "3dgs-software-comparison": p_en_3dgs_software_comparison as WorksPage,
  "blog": p_en_blog as WorksPage,
  "chevron-rokunowa-mv": p_en_chevron_rokunowa_mv as WorksPage,
  "houdini-comfyui-gsplat-workflow": p_en_houdini_comfyui_gsplat_workflow as WorksPage,
  "index": p_en_index as WorksPage,
  "isaacsim-3dgs-import": p_en_isaacsim_3dgs_import as WorksPage,
  "isaacsim-3dgs-robot-demos": p_en_isaacsim_3dgs_robot_demos as WorksPage,
  "portalcam-drone-ai-workflow": p_en_portalcam_drone_ai_workflow as WorksPage,
  "portalcam-xbin-raw-extraction": p_en_portalcam_xbin_raw_extraction as WorksPage,
  "shibuya-ten-simulations": p_en_shibuya_ten_simulations as WorksPage,
  "ue5-xgrids-3dgs-aerial-ai": p_en_ue5_xgrids_3dgs_aerial_ai as WorksPage,
  "vectorworks-3dgs-mesh": p_en_vectorworks_3dgs_mesh as WorksPage,
 },
};
