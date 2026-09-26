/**
 * サイトにある規約の一覧（2026-09-26）。
 *
 * ここを唯一の出どころにする。以前は「スタジオへの確認メールに入れる規約」だけが
 * studio-review-mail.ts に直書きされていて、規約を足したときにメールと管理画面が
 * すぐズレる形だった。メール（STUDIO_MAIL_TERMS）も管理画面（/admin/terms）も
 * この表を読む。
 *
 * 規約ページを追加したら、ここに1行足すこと（terms-catalog.test.ts が
 * src/app/terms/<slug>/page.tsx の存在を確かめる）。
 */
export interface TermsDoc {
  /** サイト内パス（EN は /en を前に付ける）。 */
  path: string;
  title: string;
  titleEn: string;
  /** 誰に向けた規約か（管理画面の一覧で読む人が選べるように）。 */
  audience: "スタジオ" | "購入者" | "提出者" | "全員";
  /** 一覧・メールに出す1行説明。 */
  note: string;
  /** 制定日（ページ末尾の表記と合わせる）。 */
  effective: string;
  /** 直近の改定日（無ければ空）。 */
  updated?: string;
  /** スタジオへの掲載確認メールに毎回同送するか（本人指示 2026-09-26）。 */
  inStudioMail: boolean;
}

export const TERMS_DOCS: readonly TermsDoc[] = [
  {
    path: "/terms/listing",
    title: "施設掲載規約",
    titleEn: "Facility Listing Terms",
    audience: "スタジオ",
    note: "掲載の条件・写真の扱い・掲載の停止",
    effective: "2026-09-26",
    inStudioMail: true,
  },
  {
    path: "/terms/listing-revenue-share",
    title: "掲載データ販売分配規約",
    titleEn: "Listing Data Revenue Share Terms",
    audience: "スタジオ",
    note: "販売時の分配（20%）と精算",
    effective: "2026-08-02",
    updated: "2026-08-04",
    inStudioMail: true,
  },
  {
    path: "/terms/data-download",
    title: "3Dデータ購入規約",
    titleEn: "3D Data Purchase Agreement",
    audience: "購入者",
    note: "購入者が守る条件（第三者の権利物の扱いを含む）",
    effective: "2026-06-23",
    updated: "2026-09-19",
    inStudioMail: true,
  },
  {
    path: "/terms/service",
    title: "利用規約",
    titleEn: "Terms of Service",
    audience: "全員",
    note: "サービス全体",
    effective: "2026-07-11",
    updated: "2026-09-21",
    inStudioMail: true,
  },
  {
    path: "/terms/tokushoho",
    title: "特定商取引法に基づく表記",
    titleEn: "Legal Notice (Act on Specified Commercial Transactions)",
    audience: "購入者",
    note: "運営者・支払い・キャンセル",
    effective: "2026-07-01",
    updated: "2026-08-02",
    inStudioMail: true,
  },
  {
    path: "/terms/submission",
    title: "持ち込みスキャン規約",
    titleEn: "Scan Submission Agreement",
    audience: "提出者",
    note: "第三者が撮って持ち込んだデータの扱いと分配（30/50%）",
    effective: "2026-08-02",
    updated: "2026-08-04",
    // 掲載の確認メールは施設側に送るもの。提出者向けの規約は混ぜない。
    inStudioMail: false,
  },
];

/** スタジオへの掲載確認メールに毎回入れる規約（並び順は読む順）。 */
export const STUDIO_MAIL_TERMS = TERMS_DOCS.filter((d) => d.inStudioMail);
