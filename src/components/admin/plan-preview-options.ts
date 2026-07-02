/**
 * 管理プレビューの「プラン別表示シミュレーション」の選択肢。
 * server / client 両方から import されるため "use client" を付けない
 * プレーンモジュールに置く（client モジュールの値 export は RSC からは
 * 参照プロキシになり実行時エラーになる）。
 */
export const PREVIEW_PLAN_OPTIONS = [
  { value: "admin", label: "管理者（実際の状態）" },
  { value: "guest", label: "未ログイン" },
  { value: "free", label: "無料会員（Free）" },
  { value: "individual", label: "個人プラン" },
  { value: "studio", label: "スタジオプラン" },
  { value: "team", label: "Team（制作会社）" },
  { value: "team_nda", label: "Team + NDA締結済み" },
] as const;

export type PreviewPlan = (typeof PREVIEW_PLAN_OPTIONS)[number]["value"];
