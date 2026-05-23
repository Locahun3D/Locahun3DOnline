export type PropertyCategory =
  | "studio"
  | "warehouse"
  | "house"
  | "shop"
  | "outdoor";

export interface PropertyImage {
  src: string;
  alt: string;
  width: number;
  height: number;
}

export interface Property {
  id: string;
  title: string;
  category: PropertyCategory;
  area: string;
  prefecture: string;
  city: string;
  hourlyPrice: number;
  capacity: number;
  floorAreaSqm: number;
  ceilingHeightM: number;
  tags: string[];
  summary: string;
  description: string;
  cover: PropertyImage;
  gallery: PropertyImage[];
  splatUrl: string;
  splatSizeMb: number;
  scannedAt: string;
  hasNaturalLight: boolean;
  parking: boolean;
  loadingDock: boolean;
}

const ph = (seed: number, w = 1600, h = 1000) =>
  `https://picsum.photos/seed/locahun3d-${seed}/${w}/${h}`;

const SAMPLE_SPLAT =
  "https://pub-6fe11fc6301a424ba739695a7c4d2dd9.r2.dev/locahun3d_Demo_point_cloud.splat";

export const PROPERTIES: Property[] = [
  {
    id: "stg-001",
    title: "Setagaya Cyc Studio｜白ホリ大スパン",
    category: "studio",
    area: "東京西エリア",
    prefecture: "東京都",
    city: "世田谷区",
    hourlyPrice: 22000,
    capacity: 40,
    floorAreaSqm: 220,
    ceilingHeightM: 5.4,
    tags: ["白ホリ", "天井5m超", "搬入口大", "電源200V"],
    summary:
      "天井高 5.4m、25m スパンの白ホリ。CM・MV 撮影で実績多数。サイクロラマ＋電動バトンを完備。",
    description:
      "都心からのアクセスと、開放感のある大スパン白ホリゾントが両立するスタジオ。撮影用照明 12 灯、ヘアメイクルーム 2 部屋、ケータリングスペースを併設。\nセッティングのプリビズには、3DGS スキャンを使った仮想立ち回りが特に有効です。",
    cover: { src: ph(1), alt: "Setagaya Cyc Studio 白ホリ", width: 1600, height: 1000 },
    gallery: [
      { src: ph(11), alt: "白ホリゾント全景", width: 1600, height: 1000 },
      { src: ph(12), alt: "搬入口と天井バトン", width: 1600, height: 1000 },
      { src: ph(13), alt: "メイク室", width: 1600, height: 1000 },
      { src: ph(14), alt: "コントロールルーム", width: 1600, height: 1000 },
    ],
    splatUrl: SAMPLE_SPLAT,
    splatSizeMb: 410,
    scannedAt: "2026-04-18",
    hasNaturalLight: false,
    parking: true,
    loadingDock: true,
  },
  {
    id: "wh-002",
    title: "Yokohama Industrial Warehouse｜重厚な質感",
    category: "warehouse",
    area: "神奈川エリア",
    prefecture: "神奈川県",
    city: "横浜市鶴見区",
    hourlyPrice: 18000,
    capacity: 60,
    floorAreaSqm: 480,
    ceilingHeightM: 7.2,
    tags: ["倉庫", "コンクリート", "鉄骨", "天井高"],
    summary:
      "戦後の重量鉄骨倉庫。剥き出しの梁・コンクリ床・サビた鉄扉。アクション/ファッション向き。",
    description:
      "京浜運河沿いに建つ大型倉庫。築 50 年以上の経年が生むテクスチャは、CG では再現が難しい質感を持ちます。\n3DGS スキャン済のため、レンズ選択・ライティング設計を撮影前にブラウザで完結できます。",
    cover: { src: ph(2), alt: "Yokohama 倉庫外観", width: 1600, height: 1000 },
    gallery: [
      { src: ph(21), alt: "倉庫内部俯瞰", width: 1600, height: 1000 },
      { src: ph(22), alt: "鉄骨梁", width: 1600, height: 1000 },
      { src: ph(23), alt: "シャッター開口", width: 1600, height: 1000 },
    ],
    splatUrl: SAMPLE_SPLAT,
    splatSizeMb: 410,
    scannedAt: "2026-03-22",
    hasNaturalLight: true,
    parking: true,
    loadingDock: true,
  },
  {
    id: "hs-003",
    title: "Kichijoji Mid-century House｜生活感のある一軒家",
    category: "house",
    area: "東京西エリア",
    prefecture: "東京都",
    city: "武蔵野市",
    hourlyPrice: 12000,
    capacity: 12,
    floorAreaSqm: 110,
    ceilingHeightM: 2.6,
    tags: ["一軒家", "庭付き", "60年代", "畳"],
    summary:
      "築 60 年の和洋折衷住宅。木製建具・畳・庭。家族ドラマ／CM の生活シーンに最適。",
    description:
      "井の頭線吉祥寺駅徒歩 14 分。リビング・ダイニング・和室 2 間、庭からの自然光が入ります。\n調度品込みでの貸出。3DGS スキャンには家具配置がそのまま含まれているため、カット割りの検証が可能です。",
    cover: { src: ph(3), alt: "Kichijoji 一軒家", width: 1600, height: 1000 },
    gallery: [
      { src: ph(31), alt: "リビング", width: 1600, height: 1000 },
      { src: ph(32), alt: "和室", width: 1600, height: 1000 },
      { src: ph(33), alt: "庭", width: 1600, height: 1000 },
    ],
    splatUrl: SAMPLE_SPLAT,
    splatSizeMb: 410,
    scannedAt: "2026-05-02",
    hasNaturalLight: true,
    parking: false,
    loadingDock: false,
  },
  {
    id: "sh-004",
    title: "Daikanyama Concept Cafe｜営業時間外貸出",
    category: "shop",
    area: "東京中心エリア",
    prefecture: "東京都",
    city: "渋谷区",
    hourlyPrice: 28000,
    capacity: 20,
    floorAreaSqm: 95,
    ceilingHeightM: 3.1,
    tags: ["カフェ", "造作", "間接照明", "夜間貸出"],
    summary:
      "代官山の人気カフェ。営業終了後 22:00〜貸出。MV/Web CM の撮影に。",
    description:
      "オーナー監修の什器・グラスウェア・植栽。スタイリングの差し替え可。\n3DGS スキャンには夜の店内照明状態が含まれており、照明合わせが事前に検証できます。",
    cover: { src: ph(4), alt: "Daikanyama カフェ", width: 1600, height: 1000 },
    gallery: [
      { src: ph(41), alt: "店内", width: 1600, height: 1000 },
      { src: ph(42), alt: "カウンター", width: 1600, height: 1000 },
      { src: ph(43), alt: "ファサード", width: 1600, height: 1000 },
    ],
    splatUrl: SAMPLE_SPLAT,
    splatSizeMb: 410,
    scannedAt: "2026-05-09",
    hasNaturalLight: false,
    parking: false,
    loadingDock: false,
  },
  {
    id: "od-005",
    title: "Tama River Riverside｜許可済オープンロケ地",
    category: "outdoor",
    area: "東京西エリア",
    prefecture: "東京都",
    city: "調布市",
    hourlyPrice: 8000,
    capacity: 50,
    floorAreaSqm: 1500,
    ceilingHeightM: 0,
    tags: ["屋外", "河川敷", "撮影許可済", "車両進入可"],
    summary:
      "撮影許可取得済の多摩川河川敷。土手・草地・水際の 3 シーン分のロケ地。",
    description:
      "管理者と撮影協定済の常設ロケ地。仮設テント設営可、簡易電源あり。\n地形は 3DGS でスキャン済。陽の入る方角・障害物・トラックの動線をブラウザで確認できます。",
    cover: { src: ph(5), alt: "多摩川河川敷", width: 1600, height: 1000 },
    gallery: [
      { src: ph(51), alt: "土手俯瞰", width: 1600, height: 1000 },
      { src: ph(52), alt: "水際", width: 1600, height: 1000 },
    ],
    splatUrl: SAMPLE_SPLAT,
    splatSizeMb: 410,
    scannedAt: "2026-04-29",
    hasNaturalLight: true,
    parking: true,
    loadingDock: false,
  },
  {
    id: "stg-006",
    title: "Osaka South Studio｜関西最大級ハウススタジオ",
    category: "studio",
    area: "関西エリア",
    prefecture: "大阪府",
    city: "堺市",
    hourlyPrice: 32000,
    capacity: 80,
    floorAreaSqm: 620,
    ceilingHeightM: 6.0,
    tags: ["ハウススタジオ", "プール", "屋上", "車両進入"],
    summary:
      "1F 駐車場〜屋上プールまで 4 フロア。1 棟貸し対応、関西で長尺撮影の定番。",
    description:
      "ファッション・ドラマ・MV で実績多数。ロケバス 4 台駐車可、フローティングルーム完備。\n3DGS スキャンは 4 フロアすべて取得済。ヘリ撮影の代替プリビズとしてもご利用いただけます。",
    cover: { src: ph(6), alt: "Osaka スタジオ外観", width: 1600, height: 1000 },
    gallery: [
      { src: ph(61), alt: "屋上プール", width: 1600, height: 1000 },
      { src: ph(62), alt: "3F リビング", width: 1600, height: 1000 },
      { src: ph(63), alt: "1F ガレージ", width: 1600, height: 1000 },
    ],
    splatUrl: SAMPLE_SPLAT,
    splatSizeMb: 410,
    scannedAt: "2026-05-12",
    hasNaturalLight: true,
    parking: true,
    loadingDock: true,
  },
];

export const CATEGORY_LABEL: Record<PropertyCategory, string> = {
  studio: "スタジオ",
  warehouse: "倉庫",
  house: "住宅",
  shop: "店舗",
  outdoor: "屋外",
};

export function getProperty(id: string): Property | undefined {
  return PROPERTIES.find((p) => p.id === id);
}

export interface PropertyFilters {
  q?: string;
  category?: PropertyCategory | "all";
  area?: string;
  maxPrice?: number;
  minCeiling?: number;
}

export function filterProperties(
  list: Property[],
  f: PropertyFilters,
): Property[] {
  return list.filter((p) => {
    if (f.category && f.category !== "all" && p.category !== f.category) {
      return false;
    }
    if (f.area && f.area !== "all" && p.area !== f.area) return false;
    if (typeof f.maxPrice === "number" && p.hourlyPrice > f.maxPrice) {
      return false;
    }
    if (typeof f.minCeiling === "number" && p.ceilingHeightM < f.minCeiling) {
      return false;
    }
    if (f.q) {
      const q = f.q.toLowerCase();
      const haystack = `${p.title} ${p.summary} ${p.city} ${p.tags.join(" ")}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export const AREAS = Array.from(new Set(PROPERTIES.map((p) => p.area)));
