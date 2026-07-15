import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentUser } from "@/lib/dal";
import { purchaseRepo, resolvePurchasedItem } from "@/lib/purchases";
import { repo as propertyRepo } from "@/lib/store";
import { pickDownloadFile } from "@/lib/downloads";
import { pickDownloadVersion } from "@/lib/download-versions";
import { createPresignedGet } from "@/lib/uploads";

export const runtime = "nodejs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBucket = any;

async function getBucket(): Promise<AnyBucket | null> {
  try {
    const { env } = await getCloudflareContext();
    return (env as Record<string, unknown>).R2_ASSETS ?? null;
  } catch {
    return null;
  }
}

/** 保存済みURL（公開r2.dev / 相対 /uploads / /api/r2 ...）から R2 オブジェクトキーを導く。 */
function toR2Key(url: string): string | null {
  if (!url) return null;
  let path = url;
  if (/^https?:\/\//.test(url)) {
    try {
      path = new URL(url).pathname;
    } catch {
      return null;
    }
  }
  path = path.replace(/^\/+/, "");
  path = path.replace(/^api\/r2\//, "");
  return path || null;
}

/**
 * R2キーから「管理者が実際にアップロードした元のファイル名」を復元する。
 * buildAssetKey() は `assets/{kind}/{10文字nanoid}-{元のファイル名}` という
 * 形式でキーを作る（衝突回避のためだけの内部識別子）。買い手にはこの内部
 * 識別子を見せず、元のファイル名をそのままダウンロード名として使う
 * （リネームしない・元のZIP名の通りダウンロードさせる）。
 * レガシーな /uploads/... キー（nanoid接頭辞なし）はそのまま返す。
 */
function originalFilenameFromKey(key: string): string {
  const rawName = key.split("/").pop() || "locahun3d-data";
  if (/^assets\//.test(key)) {
    const m = /^.{10}-(.+)$/.exec(rawName);
    if (m) return m[1];
  }
  return rawName;
}

/**
 * 購入者本人だけが購入済み3DGSデータをダウンロードできるゲート付き配信。
 * Worker 経由でオブジェクト本体をストリームすると、大容量ファイル(数百MB〜
 * 数GB)で負荷時に途中切断が実測されている（presign-get route と同じ理由）。
 * 存在確認だけ Worker 側で行い、実データ転送は R2 直の署名付き GET URL へ
 * 302 リダイレクトすることでこれを回避する。ダウンロードファイル名は元の
 * アップロードファイル名をそのまま使う（内部の nanoid 接頭辞だけ除去）。
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(req.url);
  const format = url.searchParams.get("format");
  const date = url.searchParams.get("date");

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const purchase = await purchaseRepo.get(id);
  if (!purchase) {
    return NextResponse.json({ error: "購入が見つかりません" }, { status: 404 });
  }
  if (purchase.userId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }
  if (purchase.status !== "completed") {
    return NextResponse.json({ error: "この購入は完了していません" }, { status: 403 });
  }

  const property = await propertyRepo.get(purchase.propertyId);
  const item = property ? resolvePurchasedItem(property.splatItems, purchase) : null;
  if (!item) {
    return NextResponse.json({ error: "データが見つかりません" }, { status: 404 });
  }

  // 日付指定: 日付別バージョン管理から該当日付のファイル。価格差は無いため
  // 購入時の検証は不要（購入済みであれば良い）。存在しない日付を明確に404。
  // 形式指定: その形式の個別ファイル。存在しない形式が指定された場合は
  // splatUrl（ビューアー用ファイル）へフォールバックせず明確に404を返す
  // （以前はここが空文字になり下の共通フォールバックに落ちて、購入者が
  //   指定と異なるファイルを気付かずダウンロードしてしまっていた）。
  // 形式なし（一括DL）: バンドルZip(downloadFileUrl)を優先、無ければ先頭形式、
  // それも無ければ splatUrl にフォールバック。
  let sourceUrl: string;
  if (date) {
    sourceUrl = pickDownloadVersion(item, property?.scannedAt, date)?.url || "";
    if (!sourceUrl) {
      return NextResponse.json(
        { error: `指定された日付（${date}）のバージョンが見つかりません` },
        { status: 404 },
      );
    }
  } else if (format) {
    sourceUrl = pickDownloadFile(item, format)?.url || "";
    if (!sourceUrl) {
      return NextResponse.json(
        { error: `指定された形式（${format}）のファイルが見つかりません` },
        { status: 404 },
      );
    }
  } else {
    // 日付別バージョンがあれば最新(先頭)を既定に。無ければ従来通り。
    sourceUrl =
      pickDownloadVersion(item, property?.scannedAt, null)?.url ||
      pickDownloadFile(item, null)?.url ||
      item.splatUrl ||
      "";
  }
  const key = toR2Key(sourceUrl);
  if (!key) {
    return NextResponse.json({ error: "ダウンロードファイルが未設定です" }, { status: 404 });
  }

  const bucket = await getBucket();
  if (!bucket) {
    return NextResponse.json({ error: "ストレージが利用できません" }, { status: 503 });
  }

  // 本体は取得せず存在確認のみ（head）。実データは署名付きURLへ302で逃がす。
  const head = await bucket.head(key);
  if (!head) {
    // ユーザー向け文言は変えない（原因の詳細を外部に漏らさない）が、運営が
    // 問い合わせ対応時にログから原因(R2にオブジェクトが実在しない＝データ破損/
    // 誤削除か、一時的なR2障害か)を切り分けられるよう記録しておく。
    console.error(
      `[purchase-download] R2 object not found: key="${key}" purchaseId=${id} format=${format ?? "(none)"}`,
    );
    return NextResponse.json({ error: "ファイルが見つかりません" }, { status: 404 });
  }

  const filename = originalFilenameFromKey(key);

  const signedUrl = await createPresignedGet(key, { downloadFilename: filename });
  return NextResponse.redirect(signedUrl, { status: 302, headers: { "Cache-Control": "private, no-store" } });
}
