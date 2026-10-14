/**
 * 3DGS シーンの容量表示を R2 の実ファイルの大きさに合わせる定期処理（2026-10-14）。
 *
 * なぜ要るか: 物件ページのウォークスルー欄に「1 MB」と出る不具合が繰り返し起きていた（本人
 * 2026-09-26「これ全部壊れてる」、2026-10-14「1mbになるバグなおして」）。大きい 3DGS は、管理画面に
 * 小さな仮ファイル（約66KB）で登録してから R2 の同じキーを本物で上書きする手順で入れており、
 * 登録時に記録した仮ファイルの大きさ（1MB）がそのまま残る。オンライン編集で保存すると、その 1MB が
 * streamSizeMb にも引き継がれる。登録の経路を問わず直せるよう、記録が 1MB 以下の項目だけ R2 に
 * 大きさを問い合わせ、実物と違えば書き直す。
 *
 * 触るのは容量の欄だけ（sizeMb / streamSizeMb と、素材一覧の size）。他の欄が変わる差分なら書かない。
 * 編集後の入れ物（…-project.zip）は数KBが正しいので、その sizeMb は直さない。
 */
type Stmt = { bind(...v: unknown[]): Stmt; all(): Promise<{ results?: unknown[] }>; run(): Promise<{ meta?: { changes?: number } }> };
export type SceneSizeDb = { prepare(sql: string): Stmt };
export type SceneSizeBucket = { head(key: string): Promise<{ size: number } | null> };

type Row = { id: string; updated_at: string; data: string };
type Scene = { id?: string; label?: string; splatUrl?: string; sizeMb?: number; streamUrl?: string; streamSizeMb?: number };
export type SceneSizeReport = { id: string; scene: string; field: "sizeMb" | "streamSizeMb"; from: number; to: number };

/** 記録が 1MB 以下のときだけ疑う（正しく登録されたものは R2 に問い合わせない）。 */
const SUSPECT_MB = 1;
const toMb = (bytes: number) => Math.max(1, Math.round(bytes / 1024 / 1024));

/** `/api/r2/<key>` からキーを取り出す。R2 以外（外部 URL・/uploads）は null。 */
export function r2KeyOf(url: string | undefined): string | null {
  if (!url) return null;
  const m = /^(?:https?:\/\/[^/]+)?\/api\/r2\/(.+)$/.exec(url.split(/[?#]/)[0]);
  return m ? decodeURIComponent(m[1]) : null;
}

const isEditArchive = (url: string | undefined) => /-project\.zip$/i.test((url ?? "").split(/[?#]/)[0]);

/** 1物件分の直すべき値を求める（純粋な計算。R2 の問い合わせは head に任せる）。 */
export async function sceneSizeFixes(
  scenes: Scene[],
  head: (key: string) => Promise<number | null>,
): Promise<{ index: number; field: "sizeMb" | "streamSizeMb"; from: number; to: number }[]> {
  const out: { index: number; field: "sizeMb" | "streamSizeMb"; from: number; to: number }[] = [];
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i] ?? {};
    const checks: ["sizeMb" | "streamSizeMb", string | undefined, number][] = [];
    if (!isEditArchive(s.splatUrl)) checks.push(["sizeMb", s.splatUrl, s.sizeMb ?? 0]);
    if (s.streamUrl) checks.push(["streamSizeMb", s.streamUrl, s.streamSizeMb ?? 0]);
    for (const [field, url, recorded] of checks) {
      if (recorded > SUSPECT_MB) continue;
      const key = r2KeyOf(url);
      if (!key) continue;
      const bytes = await head(key);
      if (bytes == null || bytes <= 0) continue;
      const mb = toMb(bytes);
      if (mb !== recorded) out.push({ index: i, field, from: recorded, to: mb });
    }
  }
  return out;
}

export async function runSceneSizeFix(
  db: SceneSizeDb,
  bucket: SceneSizeBucket,
  now = Date.now(),
): Promise<{ fixed: number; report: SceneSizeReport[] }> {
  const rows = ((await db.prepare("SELECT id, updated_at, data FROM properties WHERE status != 'archived'").all()).results ?? []) as Row[];
  const report: SceneSizeReport[] = [];
  const sizes = new Map<string, number | null>();
  const head = async (key: string) => {
    if (!sizes.has(key)) sizes.set(key, (await bucket.head(key))?.size ?? null);
    return sizes.get(key)!;
  };
  for (const row of rows) {
    let property: { splatItems?: Scene[]; updatedAt?: string };
    try { property = JSON.parse(row.data); } catch { continue; }
    const scenes = Array.isArray(property.splatItems) ? property.splatItems : [];
    const fixes = await sceneSizeFixes(scenes, head);
    if (!fixes.length) continue;
    for (const f of fixes) {
      (scenes[f.index] as Record<string, unknown>)[f.field] = f.to;
      report.push({ id: row.id, scene: scenes[f.index].label || scenes[f.index].id || String(f.index), field: f.field, from: f.from, to: f.to });
    }
    const updatedAt = new Date(Math.max(now, Date.parse(row.updated_at) + 1)).toISOString();
    property.updatedAt = updatedAt;
    // 読んだ時点と完全に同じときだけ書く（その間に管理画面で保存されていたら、次の回に回す）。
    await db.prepare("UPDATE properties SET data = ?, updated_at = ? WHERE id = ? AND updated_at = ? AND data = ?")
      .bind(JSON.stringify(property), updatedAt, row.id, row.updated_at, row.data).run();
  }
  // 素材一覧の記録も同じ理由で仮ファイルの大きさのまま残っている（管理画面の素材一覧の表示用）。
  const assets = ((await db.prepare("SELECT id, data FROM assets WHERE json_extract(data, '$.kind') = 'splat' AND CAST(json_extract(data, '$.size') AS INTEGER) <= 1048576").all()).results ?? []) as { id: string; data: string }[];
  for (const a of assets) {
    let asset: { r2Key?: string; size?: number; status?: string };
    try { asset = JSON.parse(a.data); } catch { continue; }
    if (asset.status !== "ready" || !asset.r2Key || isEditArchive(asset.r2Key)) continue;
    const bytes = await head(asset.r2Key);
    if (bytes == null || bytes <= 0 || bytes === asset.size) continue;
    await db.prepare("UPDATE assets SET data = ? WHERE id = ? AND data = ?")
      .bind(JSON.stringify({ ...asset, size: bytes }), a.id, a.data).run();
  }
  return { fixed: report.length, report };
}
