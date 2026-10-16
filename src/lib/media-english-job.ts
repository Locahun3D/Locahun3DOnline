/**
 * 図面とビューアー注釈の英訳（2026-10-16 本人指示「スタジオ図面も、翻訳して画像を載せる工程を自動処理に
 * 含ませる」「3DGSビュー注釈、画像も翻訳するように／画像の英訳を載せるでもいい」）。
 *
 * - 図面（blueprints の画像）: 画像の中の日本語を読み取って英訳し、blueprints[i].textEn に {ja,en} の一覧で持つ。
 *   英語ページでは図面の下に一覧で出す（画像そのものは描き直さない。線や寸法を崩さないため）。
 * - ビューアー注釈（シーンの project.json の写真ピン・区画ラベル）: 案内文・ラベル・画像名を英訳し、
 *   写真ピンの画像は中の日本語の英訳を一覧にする。splatItems[i].sceneTextEn に持ち、ビューアーへは
 *   /api/scene-text-en/... から渡す（?lang=en&sceneTextEn=...）。
 *
 * Worker の定期実行（custom-worker.ts）から直接呼ぶ。english-fill-job と同じく Next の外で動く部品だけで組む
 * （"server-only" / getCloudflareContext を import しない）。英語欄だけを書き、読んだ時点と同じときだけ書く。
 * 更新日時は進めない（編集画面を開いている人の保存を止めないため）。
 */
import { r2KeyOf } from "./scene-size-job";

export const MEDIA_MAX_PER_RUN = 3; // 1回に訳す図面・シーンの数
export const MEDIA_QUIET_MS = 5 * 60 * 1000;
const MODEL = "claude-opus-4-8";
const JP = /[ぁ-ゖァ-ヺ一-鿿]/;
const MAX_IMAGE_BYTES = 3.5 * 1024 * 1024; // Anthropic の画像上限（base64 で約5MB）に収まる大きさ

type Stmt = { bind(...v: unknown[]): Stmt; all(): Promise<{ results?: unknown[] }>; run(): Promise<{ meta?: { changes?: number } }> };
export type MediaEnglishDb = { prepare(sql: string): Stmt };
export type MediaEnglishBucket = { get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; httpMetadata?: { contentType?: string } } | null> };
type Row = { id: string; updated_at: string; data: string };
export type Pair = { ja: string; en: string };
export type SceneTextEn = { source: string; texts: Record<string, string>; images: Record<string, Pair[]> };
export type MediaEnglishReport = { id: string; kind: "plan" | "scene"; index: number; pairs?: number; error?: string };

/** ビューアー（offline-viewer.html の _sceneImageKey）と同じ計算。写真ピンの画像を見分ける鍵。 */
export function sceneImageKey(d: string): string {
  const s = d.length + ":" + d.slice(0, 8192) + d.slice(-8192);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

const isImageUrl = (u: string) => /\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(u);

// ── ZIP から1ファイルを取り出す（シーンの入れ物は数KB〜数MB。全部読んで中央ディレクトリを引く） ──
async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readZipEntry(buf: ArrayBuffer, name: string): Promise<Uint8Array | null> {
  const v = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) return null;
    const method = v.getUint16(p + 10, true);
    const csize = v.getUint32(p + 20, true);
    const nlen = v.getUint16(p + 28, true), xlen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const fname = dec.decode(new Uint8Array(buf, p + 46, nlen));
    if (fname === name || fname.endsWith("/" + name)) {
      const lnl = v.getUint16(local + 26, true), lxl = v.getUint16(local + 28, true);
      const data = new Uint8Array(buf, local + 30 + lnl + lxl, csize);
      if (method === 0) return data.slice();
      if (method === 8) return inflateRaw(data);
      return null;
    }
    p += 46 + nlen + xlen + clen;
  }
  return null;
}

type Layer = { type?: string; name?: string; eventGuide?: string | null; eventImageName?: string | null; eventImage?: string | null; pathLabel?: string | null };

/** project.json から、訳す文字と画像を集める（日本語を含むものだけ）。 */
export function collectSceneMedia(project: { layers?: Layer[] }): { texts: string[]; images: { key: string; dataUrl: string }[] } {
  const texts = new Set<string>();
  const images = new Map<string, string>();
  for (const L of project.layers ?? []) {
    for (const s of [L.name, L.eventGuide, L.eventImageName, L.pathLabel]) {
      if (typeof s === "string" && s.trim() && JP.test(s)) texts.add(s);
    }
    if (L.type === "event" && typeof L.eventImage === "string" && /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(L.eventImage)) {
      images.set(sceneImageKey(L.eventImage), L.eventImage);
    }
  }
  return { texts: [...texts], images: [...images].map(([key, dataUrl]) => ({ key, dataUrl })) };
}

// ── 翻訳（Anthropic）。失敗は例外で返し、次の回にやり直す ──
async function callClaude(apiKey: string, content: unknown[], maxTokens = 4096): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages: [{ role: "user", content }] }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}`);
  const j = (await res.json()) as { content?: { type: string; text?: string }[] };
  return (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
}

const jsonOf = <T>(text: string, fallback: T): T => {
  const m = text.match(/[[{][\s\S]*[\]}]/);
  if (!m) return fallback;
  try { return JSON.parse(m[0]) as T; } catch { return fallback; }
};

const cleanPairs = (v: unknown): Pair[] =>
  (Array.isArray(v) ? v : [])
    .filter((x): x is Pair => !!x && typeof (x as Pair).ja === "string" && typeof (x as Pair).en === "string")
    .map((x) => ({ ja: x.ja.trim().slice(0, 200), en: x.en.trim().slice(0, 400) }))
    .filter((x) => x.ja && x.en)
    .slice(0, 120);

export async function translateImageText(apiKey: string, bytesB64: string, mediaType: string, what: "floor plan" | "photo"): Promise<Pair[]> {
  const prompt =
    `This is a ${what} from a Japanese filming-location listing. List every piece of Japanese text that appears in the image ` +
    `(room names, labels, notes, dimensions with Japanese units, signs). For each, give a natural English translation suitable for ` +
    `an international film production team. Keep numbers and units (m, ㎡, mm) as they are. Skip text that is already English. ` +
    `Return ONLY a JSON array like [{"ja":"控室","en":"Green room"}]. Return [] if there is no Japanese text.`;
  const text = await callClaude(apiKey, [
    { type: "image", source: { type: "base64", media_type: mediaType, data: bytesB64 } },
    { type: "text", text: prompt },
  ]);
  return cleanPairs(jsonOf(text, []));
}

export async function translateTexts(apiKey: string, texts: string[]): Promise<Record<string, string>> {
  if (!texts.length) return {};
  const prompt =
    `Translate these Japanese annotations from a 3D walkthrough of a filming location into natural English for an ` +
    `international film production team. Keep line breaks. Return ONLY a JSON object mapping each original string to its translation.\n\n` +
    JSON.stringify(texts);
  const obj = jsonOf<Record<string, unknown>>(await callClaude(apiKey, [{ type: "text", text: prompt }], 8192), {});
  const out: Record<string, string> = {};
  for (const t of texts) if (typeof obj[t] === "string" && (obj[t] as string).trim()) out[t] = (obj[t] as string).trim().slice(0, 2000);
  return out;
}

const b64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const mediaTypeOf = (key: string, ct?: string) =>
  ct && /^image\/(png|jpeg|webp|gif)$/.test(ct) ? ct : /\.png$/i.test(key) ? "image/png" : /\.webp$/i.test(key) ? "image/webp" : /\.gif$/i.test(key) ? "image/gif" : "image/jpeg";

type Plan = { url?: string; textEn?: Pair[]; textEnFor?: string };
type Scene = { splatUrl?: string; sceneTextEn?: SceneTextEn };

/** この物件で次に訳すもの（図面 → シーンの順に1件）。無ければ null。 */
export function nextMediaTask(p: { blueprints?: Plan[]; splatItems?: Scene[] }): { kind: "plan" | "scene"; index: number } | null {
  const plans = p.blueprints ?? [];
  for (let i = 0; i < plans.length; i++) {
    const u = plans[i].url ?? "";
    if (u && isImageUrl(u) && r2KeyOf(u) && plans[i].textEnFor !== u) return { kind: "plan", index: i };
  }
  const scenes = p.splatItems ?? [];
  for (let i = 0; i < scenes.length; i++) {
    const u = scenes[i].splatUrl ?? "";
    if (/\.zip(\?|#|$)/i.test(u) && r2KeyOf(u) && scenes[i].sceneTextEn?.source !== u) return { kind: "scene", index: i };
  }
  return null;
}

export async function runMediaEnglish(
  db: MediaEnglishDb,
  bucket: MediaEnglishBucket,
  apiKey: string,
  now = Date.now(),
): Promise<{ done: number; report: MediaEnglishReport[] }> {
  const rows = ((await db.prepare("SELECT id, updated_at, data FROM properties WHERE status != 'archived' ORDER BY updated_at DESC").all()).results ?? []) as Row[];
  const report: MediaEnglishReport[] = [];
  let done = 0;
  for (const row of rows) {
    if (done >= MEDIA_MAX_PER_RUN) break;
    if (now - Date.parse(row.updated_at) < MEDIA_QUIET_MS) continue;
    let p: { blueprints?: Plan[]; splatItems?: Scene[] };
    try { p = JSON.parse(row.data); } catch { continue; }
    const task = nextMediaTask(p);
    if (!task) continue;
    done++;
    try {
      if (task.kind === "plan") {
        const plan = p.blueprints![task.index];
        const key = r2KeyOf(plan.url)!;
        const obj = await bucket.get(key);
        let pairs: Pair[] = [];
        if (obj) {
          const bytes = new Uint8Array(await obj.arrayBuffer());
          if (bytes.length <= MAX_IMAGE_BYTES) pairs = await translateImageText(apiKey, b64(bytes), mediaTypeOf(key, obj.httpMetadata?.contentType), "floor plan");
        }
        plan.textEn = pairs;
        plan.textEnFor = plan.url; // 訳せない大きさ・読めない画像も「済み」にして、毎回やり直さない
        report.push({ id: row.id, kind: "plan", index: task.index, pairs: pairs.length });
      } else {
        const scene = p.splatItems![task.index];
        const key = r2KeyOf(scene.splatUrl)!;
        const obj = await bucket.get(key);
        const result: SceneTextEn = { source: scene.splatUrl!, texts: {}, images: {} };
        if (obj) {
          const raw = await readZipEntry(await obj.arrayBuffer(), "project.json");
          if (raw) {
            const project = JSON.parse(new TextDecoder().decode(raw)) as { layers?: Layer[] };
            const { texts, images } = collectSceneMedia(project);
            result.texts = await translateTexts(apiKey, texts);
            for (const im of images.slice(0, 20)) {
              const m = /^data:(image\/[a-z]+);base64,(.*)$/i.exec(im.dataUrl);
              if (!m || m[2].length > MAX_IMAGE_BYTES * 1.37) continue;
              const pairs = await translateImageText(apiKey, m[2], m[1].toLowerCase().replace("image/jpg", "image/jpeg"), "photo");
              if (pairs.length) result.images[im.key] = pairs;
            }
          }
        }
        scene.sceneTextEn = result;
        report.push({ id: row.id, kind: "scene", index: task.index, pairs: Object.keys(result.texts).length + Object.keys(result.images).length });
      }
    } catch (e) {
      report.push({ id: row.id, kind: task.kind, index: task.index, error: String(e).slice(0, 200) });
      continue;
    }
    // 英語欄だけを足す。読んだ時点と同じときだけ書く。更新日時は進めない。
    await db.prepare("UPDATE properties SET data = ? WHERE id = ? AND updated_at = ? AND data = ?")
      .bind(JSON.stringify(p), row.id, row.updated_at, row.data).run();
  }
  return { done, report };
}
