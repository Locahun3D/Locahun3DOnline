"use client";

import { useState, useCallback, useRef, useEffect } from "react";

export type CaptureState = "idle" | "loading" | "recording" | "uploading" | "done" | "error";

interface QueueItem {
  splatUrl: string;
  propertyId: string;
  itemIdx: number;
}

interface UseCaptureResult {
  state: CaptureState;
  progress: string;
  progressPct: number;
  capturedUrl: string | null;
  capturedIdx: number | null;
  queueLength: number;
  startCapture: (splatUrl: string, propertyId: string, itemIdx: number, warmupExtraMs?: number) => void;
  queueCaptures: (items: QueueItem[], warmupExtraMs?: number) => void;
  cancel: () => void;
  clearResult: () => void;
}

import { buildViewerUrl } from "@/lib/viewer";

/**
 * キャプチャは別ウィンドウ(window.open)ではなく「同じタブ内の iframe」で実行する。
 *  - ポップアップブロックに殺されない／別窓を放置監視しなくてよい。
 *  - ビューアーの ?capture=1 は postMessage を `window.opener || parent` に送る
 *    ため、iframe(parent) でもそのまま動く（ビューアー側の変更は不要）。
 *  - ⚠ iframe を display:none / visibility:hidden にすると
 *    requestAnimationFrame が止まりキャプチャが進まない。必ずレイアウトに
 *    存在させ、合成され続ける状態にしておくこと。
 *
 * ── 2026-08-13: 「完全にバックグラウンド」化 ───────────────────
 * 以前は右下に 320×180 のサムネイルを出して録画中の映像を見せていたが、
 * 運用上プレビュー映像を見る必要はなく（進捗さえ分かればよい）、大きな
 * 黒い箱が編集画面の上に居座って邪魔になっていた。
 * そこで iframe 自体は 1920×1080 のまま（＝キャプチャ解像度を維持し
 * rAF も回り続ける）レイアウトに残しつつ、
 *   ① 表示サイズを極小（THUMB_W×THUMB_H）に縮小し
 *   ② 不透明カバーを被せて映像を隠し、代わりに文言だけ出す
 * という形にした。display:none にはしていないので録画は従来どおり動く。
 */
const FRAME_W = 1920;
const FRAME_H = 1080;
const THUMB_W = 168;
const THUMB_H = 26;

/**
 * 2026-09-21: 録画の完了通知（capture-done）に載ってくる Blob の判定。
 * 専用ウィンドウで録画するようになってから、この Blob は「そのウィンドウのレルム」で
 * 組み立てられて届く。レルムが違うと `blob instanceof Blob`（編集画面側の Blob）は
 * **false** になり、録画は終わっているのに完了処理へ進まず、進捗が 93% のまま
 * 15分のタイムアウトまで止まる（＝3DGSを保存しても動画が撮り直されない）。
 * 実測: instanceof(録画ウィンドウ側)=true / instanceof(編集画面側)=false。
 * そのためコンストラクタではなく「Blob として振る舞うか」で判定する。
 */
function isBlobLike(value: unknown): value is Blob {
  return !!value && typeof value === "object"
    && typeof (value as Blob).size === "number"
    && typeof (value as Blob).arrayBuffer === "function"
    && typeof (value as Blob).slice === "function";
}

interface CaptureFrame {
  container: HTMLDivElement;
  iframe: HTMLIFrameElement;
  /** 別ウィンドウで走らせている場合、そのウィンドウ（終わったら閉じる）。 */
  popup?: Window | null;
}

/**
 * 2026-09-21 本人指示「アップロードしたら動画を自動で生成するように／別ウィンドウで開いて処理がいいのでは／
 * 終わったらウィンドウ消せばいいし」。
 *
 * 録画は別ウィンドウで走らせる。物件編集の画面を占有しないうえ、Chrome は他のウィンドウに隠れた
 * ウィンドウの描画を絞るため、専用ウィンドウを前面に置いておけるほうが確実に終わる。
 * 録画の解像度は窓の大きさに左右されないよう、中に 1920×1080 の iframe を置いて縮小して見せる
 * （従来の埋め込みと同じ作り）。ポップアップが塞がれている場合は、従来どおり編集画面の中で走らせる。
 */
function openCaptureWindow(): Window | null {
  // ⚠ 2026-09-21 本番で確認: 別ウィンドウは**前面に出ていないと1フレームも録画できない**
  //    （「録画中… 0%(0/240)」のまま進まない）。Chrome は他のウィンドウに隠れた
  //    ウィンドウの描画を止めるため、WebGL キャンバスから映像が出てこない。
  //    編集画面の中の枠なら、そのタブを開いている限り描画が続く（従来どおり動く）。
  //    そのため既定は編集画面の中に戻し、別ウィンドウは明示的に選んだときだけにする
  //    （録画中そのウィンドウを前面に置いておける場合のみ有効）。
  //    URL に ?capturewindow=1 を付けるか、localStorage の l3d-capture-window を 1 にする。
  try {
    const params = new URLSearchParams(location.search);
    const wanted = params.get("capturewindow") === "1"
      || (() => { try { return localStorage.getItem("l3d-capture-window") === "1"; } catch { return false; } })();
    if (!wanted) return null;
    const width = Math.min(960, Math.max(480, screen.availWidth - 80));
    const height = Math.round((width * FRAME_H) / FRAME_W) + 64;
    const w = window.open("", "locahun-preview-capture", `popup,width=${width},height=${height}`);
    if (!w) return null;
    w.document.title = "プレビュー動画を生成中 — ロケハン3D";
    w.document.body.style.cssText = "margin:0;background:#111;color:#ffb454;font:12px/1.6 ui-monospace,monospace;overflow:hidden;";
    w.document.body.innerHTML =
      '<div id="cap-msg" style="padding:8px 12px;letter-spacing:.08em;">プレビュー動画を生成しています。終わると自動で閉じます。</div>';
    return w;
  } catch {
    return null;
  }
}

function createCaptureFrame(url: string, popup?: Window | null): CaptureFrame {
  // 別ウィンドウで走らせる場合は、そのウィンドウの中に 1920×1080 の iframe を置く
  // （同じオリジンなので、こちらから直接組み立てられる）。
  if (popup && !popup.closed) {
    const doc = popup.document;
    const container = doc.createElement("div");
    container.style.cssText = "position:fixed;left:0;right:0;bottom:0;top:32px;overflow:hidden;";
    const iframe = doc.createElement("iframe");
    iframe.src = url;
    iframe.setAttribute("title", "3DGS preview capture");
    const scale = Math.min(1, (popup.innerWidth || FRAME_W) / FRAME_W);
    iframe.style.cssText =
      `position:absolute;top:0;left:0;width:${FRAME_W}px;height:${FRAME_H}px;border:0;` +
      `transform:scale(${scale});transform-origin:top left;`;
    container.appendChild(iframe);
    doc.body.appendChild(container);
    return { container: container as unknown as HTMLDivElement, iframe: iframe as unknown as HTMLIFrameElement, popup };
  }
  const container = document.createElement("div");
  // 画面のどこにも重ならない右下の小さな帯。編集中のフォームを塞がない。
  container.style.cssText =
    "position:fixed;right:12px;bottom:12px;z-index:9999;pointer-events:none;" +
    `width:${THUMB_W}px;height:${THUMB_H}px;overflow:hidden;` +
    "background:#111;border:1px solid #ffb454;box-shadow:0 4px 16px rgba(0,0,0,.45);";
  const iframe = document.createElement("iframe");
  iframe.src = url;
  iframe.setAttribute("title", "3DGS preview capture");
  iframe.setAttribute("tabindex", "-1");
  iframe.setAttribute("aria-hidden", "true");
  // iframe 自体は 1920×1080 のビューポートを持たせ（キャプチャ解像度と一致）、
  // CSS transform で極小に縮小する。display:none にすると rAF が止まるので
  // 「隠す」のは上に被せるカバーで行う。ユーザー操作は不要なので
  // pointer-events は切る。
  iframe.style.cssText =
    `position:absolute;top:0;left:0;width:${FRAME_W}px;height:${FRAME_H}px;border:0;` +
    `transform:scale(${THUMB_W / FRAME_W});transform-origin:top left;pointer-events:none;`;
  // 映像を見せる必要はない（進捗さえ分かればよい）のでカバーで覆う。
  // ⚠ 完全不透明ではなく alpha .94 にしてある。不透明だとブラウザが背後の
  //    iframe の描画を省略しうる（オクルージョンカリング）ため、確実に
  //    合成させ続けて rAF を止めないための保険。見た目は不透明と同じ。
  const cover = document.createElement("div");
  cover.textContent = "プレビュー動画を生成中…";
  cover.style.cssText =
    "position:absolute;inset:0;background:rgba(17,17,17,.94);color:#ffb454;user-select:none;" +
    "font:10px/26px ui-monospace,monospace;letter-spacing:.08em;text-align:center;";
  container.appendChild(iframe);
  container.appendChild(cover);
  document.body.appendChild(container);
  return { container, iframe };
}

/**
 * 大容量ファイルの信頼できるダウンローダ（親ページ用）。
 * Workers 経由の 1 本ストリームは途中切断され得るため、HTTP Range で
 * 8MB ずつ取得し、各チャンク長を検証・リトライして Blob に組み立てる。
 * cache:'no-store' で HTTP キャッシュを完全バイパス（切断本体で汚染された
 * キャッシュにも当たらない）。
 */
async function downloadChunkedBlob(
  url: string,
  onPct: (pct: number) => void,
  abortRef: { current: boolean },
): Promise<Blob> {
  // 切断バグはこのアプリ自身の Worker 経由プロキシ（同一オリジン）で実測された
  // もので、R2 の署名付き直リンク（別オリジン）は対象外。別オリジンは 1 本の
  // fetch で取得し、無駄なチャンク分割リクエストを避ける。
  try {
    const u = new URL(url, typeof location !== "undefined" ? location.href : url);
    if (typeof location !== "undefined" && u.origin !== location.origin) {
      const resp = await fetch(url, { cache: "no-store" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const buf = await resp.arrayBuffer();
      const cl = parseInt(resp.headers.get("content-length") || "0", 10);
      if (cl && buf.byteLength !== cl) throw new Error(`truncated (${buf.byteLength}/${cl})`);
      onPct(100);
      return new Blob([buf]);
    }
  } catch (e) {
    if (e instanceof Error && /truncated/.test(e.message)) throw e;
  }
  const CHUNK = 8 * 1024 * 1024;
  const ATTEMPTS = 5;
  // probe: 先頭 1 byte の Range 応答から総サイズを得る
  let total = 0;
  try {
    const probe = await fetch(url, { cache: "no-store", headers: { range: "bytes=0-0" } });
    if (probe.status === 206) {
      const m = (probe.headers.get("content-range") || "").match(/\/(\d+)\s*$/);
      if (m) total = parseInt(m[1], 10);
      try { await probe.arrayBuffer(); } catch {}
    }
  } catch {}
  if (!total) {
    // Range 非対応: 一括 fetch（content-length 検証つき）
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const buf = await resp.arrayBuffer();
    const cl = parseInt(resp.headers.get("content-length") || "0", 10);
    if (cl && buf.byteLength !== cl) throw new Error(`truncated (${buf.byteLength}/${cl})`);
    return new Blob([buf]);
  }
  const parts: BlobPart[] = [];
  let got = 0;
  while (got < total) {
    if (abortRef.current) throw new Error("aborted");
    const end = Math.min(got + CHUNK, total) - 1;
    let ok = false;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < ATTEMPTS && !ok; attempt++) {
      try {
        const r = await fetch(url, { cache: "no-store", headers: { range: `bytes=${got}-${end}` } });
        if (r.status !== 206 && r.status !== 200) throw new Error(`HTTP ${r.status}`);
        const buf = await r.arrayBuffer();
        if (r.status === 200) {
          if (buf.byteLength !== total) throw new Error(`range ignored + truncated (${buf.byteLength}/${total})`);
          return new Blob([buf]);
        }
        if (buf.byteLength !== end - got + 1) throw new Error(`chunk truncated (${buf.byteLength}/${end - got + 1})`);
        parts.push(buf);
        got += buf.byteLength;
        ok = true;
      } catch (e) {
        lastErr = e;
        await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
      }
    }
    if (!ok) throw new Error(`chunk failed @${got}: ${lastErr instanceof Error ? lastErr.message : lastErr}`);
    onPct(Math.round((got / total) * 100));
  }
  return new Blob(parts);
}

function destroyCaptureFrame(frame: CaptureFrame | null, keepWindow = false) {
  if (!frame) return;
  try {
    frame.iframe.src = "about:blank"; // レンダリング/エンコードを確実に停止
  } catch {}
  try {
    frame.container.remove();
  } catch {}
  // 続けて撮るものが無ければ、専用ウィンドウは閉じる（本人指示）。
  if (frame.popup && !keepWindow) {
    try { frame.popup.close(); } catch {}
  }
}

export function usePreviewCapture(): UseCaptureResult {
  const [state, setState] = useState<CaptureState>("idle");
  const [progress, setProgress] = useState("");
  const [progressPct, setProgressPct] = useState(0);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [capturedIdx, setCapturedIdx] = useState<number | null>(null);
  const [queueLength, setQueueLength] = useState(0);
  const frameRef = useRef<CaptureFrame | null>(null);
  const popupRef = useRef<Window | null>(null);
  const abortRef = useRef(false);
  const queueRef = useRef<QueueItem[]>([]);
  const busyRef = useRef(false);
  // このバッチ（単発 or キュー全体）に適用する録画前ウォームアップの追加ms。
  // startCapture/queueCaptures 開始時にセットし、runOne が毎回読む。
  const warmupRef = useRef(0);

  useEffect(() => {
    return () => {
      abortRef.current = true;
      destroyCaptureFrame(frameRef.current);
      frameRef.current = null;
    };
  }, []);

  const cancel = useCallback(() => {
    abortRef.current = true;
    queueRef.current = [];
    setQueueLength(0);
    destroyCaptureFrame(frameRef.current);
    frameRef.current = null;
    busyRef.current = false;
    setState("idle");
    setProgress("");
    setProgressPct(0);
  }, []);

  const clearResult = useCallback(() => {
    setCapturedUrl(null);
    setCapturedIdx(null);
  }, []);

  /** startOne から runOne を呼び返すための穴。実体は下の useEffect で入る。 */
  const runOneRef = useRef<((s: string, p: string, i: number) => void) | null>(null);

  // ⚠ startOne は runOne より **前** に置くこと。以前は runOne の後ろにあり、
  //    runOne の useCallback から前方参照していた（関数宣言の巻き上げで実行時は
  //    動くが、React Compiler が "Cannot access variable before it is declared" で
  //    エラーにする）。startOne が閉じ込めているのは ref と setState だけなので
  //    毎レンダー作り直されても実体は安定している。
  // 相互再帰 startOne → processQueueOuter → runOne は ref 経由に変えた
  //    （runOne はこの下で定義されるため直接は参照できない）。
  async function startOne(splatUrl: string, propertyId: string, itemIdx: number) {
      function processQueueOuter() {
        const next = queueRef.current.shift();
        setQueueLength(queueRef.current.length);
        if (next) {
          setTimeout(() => runOneRef.current?.(next.splatUrl, next.propertyId, next.itemIdx), 500);
        }
      }

      // /api/r2/ blocks .rad/.splat/.ply files (security); for capture the admin
      // is authenticated, so route 3DGS assets through viewer-stream instead.
      // .rad は Spark が Range でストリーミングするので URL をそのまま渡す。
      let directSplatUrl: string;
      let blobUrl: string | null = null;
      if (/^\/api\/r2\//i.test(splatUrl) && /\.(splat|ply|ksplat|rad)$/i.test(splatUrl)) {
        directSplatUrl = splatUrl.replace(/^\/api\/r2\//, "/api/viewer-stream/");
      } else if (/\.rad(\?|#|$)/i.test(splatUrl)) {
        // .rad は Spark の Range ストリーミング前提 — blob 化せず URL のまま渡す
        directSplatUrl = splatUrl;
      } else {
        // 非 RAD（.zip 等の一括読み込みファイル）は「親ページ側」でダウンロード
        // して Blob URL を iframe に渡す。iframe 内からの大容量 fetch は途中で
        // 切断される事象が再現性をもって実測された（同じチャンクループが
        // 親ページでは 15/15 成功、viewer iframe 内では途中 truncate）。
        // 親でダウンロード → blob: URL なら iframe 内の読み込みはローカルで完結する。
        try {
          // Worker 経由 (/api/r2) の大容量ストリームは負荷時に途中切断が
          // 実測されたため、可能なら署名付き URL で R2 から直接読む。
          // /api/r2 は 3DGS 形式(.zip 含む)を認証なしでは配信しない（セキュリティ
          // 修正済み）ため、署名発行に失敗した場合は認証付きの /api/viewer-stream
          // にフォールバックする（/api/r2 に投げ直すと 403 になる）。
          const keyMatch = splatUrl.match(/^\/api\/r2\/(.+)$/i);
          let downloadUrl = keyMatch ? `/api/viewer-stream/${keyMatch[1]}` : splatUrl;
          if (keyMatch) {
            try {
              const pres = await fetch(
                `/api/admin/assets/presign-get?key=${encodeURIComponent(keyMatch[1])}`,
              );
              if (pres.ok) {
                const j = (await pres.json()) as { url?: string };
                if (j.url) downloadUrl = j.url;
              }
            } catch {
              /* 署名発行に失敗したら /api/viewer-stream 経由にフォールバック（上で設定済み） */
            }
          }
          const blob = await downloadChunkedBlob(downloadUrl, (pct) => {
            if (abortRef.current) return;
            setProgress(`3DGSデータをダウンロード中… ${pct}%`);
          }, abortRef);
          if (abortRef.current) { busyRef.current = false; return; }
          blobUrl = URL.createObjectURL(blob);
          directSplatUrl = blobUrl;
        } catch (e) {
          if (abortRef.current) { busyRef.current = false; return; }
          if (/^https?:\/\//i.test(splatUrl)) {
            // 外部 URL は CORS でダウンロードできないことがある → 従来通り URL を渡す
            directSplatUrl = splatUrl;
          } else {
            console.error("[preview-capture] download failed:", e);
            busyRef.current = false;
            setState("error");
            setProgress("3DGSデータのダウンロードに失敗しました");
            processQueueOuter();
            return;
          }
        }
      }
      const fileName = splatUrl.split("/").pop()?.split("?")[0] || "";
      // 参照保存のシーン（編集後の小さい .zip）は本体を含まない。元の RAD の場所を渡す。
      // どのファイルかはサーバーが物件データから決める（?ref=stream）。該当が無ければ 404 になり、ビューアーは無視する。
      const zipKey = /\.zip(\?|#|$)/i.test(splatUrl) ? splatUrl.match(/^\/api\/r2\/(.+)$/i)?.[1] : undefined;
      let url = buildViewerUrl(directSplatUrl, { orbit: true, capture: true, orbitSec: 10, warmupExtraMs: warmupRef.current,
        streamRef: zipKey ? `/api/viewer-stream/${zipKey}?ref=stream` : undefined });
      // blob: URL は拡張子を持たないため、ファイル名を autoname で渡して
      // ビューアー側の形式判定（zip/ply/splat…）に使わせる。
      if (blobUrl && fileName) url += `&autoname=${encodeURIComponent(fileName)}`;
      // 専用ウィンドウは1つだけ開き、キューの間は使い回す。塞がれていたら編集画面の中で走らせる。
      if (popupRef.current?.closed) popupRef.current = null;
      if (!popupRef.current) popupRef.current = openCaptureWindow();
      const frame = createCaptureFrame(url, popupRef.current);
      frameRef.current = frame;

      const cleanup = () => {
        window.removeEventListener("message", handler);
        frame.popup?.removeEventListener("message", handler);
        destroyCaptureFrame(frame);
        if (frameRef.current === frame) frameRef.current = null;
        if (blobUrl) { try { URL.revokeObjectURL(blobUrl); } catch {} blobUrl = null; }
        busyRef.current = false;
      };

      // ⚠ Chrome はウィンドウが他のウィンドウに隠れている（occluded）と
      // rAF を絞るため、キャプチャ中はこのタブを前面に表示しておくこと。
      // 実測: 240フレーム(10秒×24fps)の録画は重いシーンで約1フレーム/秒まで
      // 落ちることがある。タイムアウトは旧仕様(480フレーム)の余裕を残したまま維持。
      const timeout = setTimeout(() => {
        if (abortRef.current) return;
        cleanup();
        setState("error");
        setProgress("タイムアウト（15分経過）— キャプチャ中はこのタブを前面に表示したままにしてください");
        processQueue();
      }, 900_000);

      function processQueue() {
        const next = queueRef.current.shift();
        setQueueLength(queueRef.current.length);
        if (next) {
          setTimeout(() => runOneRef.current?.(next.splatUrl, next.propertyId, next.itemIdx), 500);
        }
      }

      function handler(e: MessageEvent) {
        // 送信元がこのキャプチャ用 iframe であるものだけ処理する
        if (e.source !== frame.iframe.contentWindow) return;
        const d = e.data;
        if (!d || typeof d.type !== "string") return;

        if (d.type === "capture-progress") {
          if (abortRef.current) return;
          setState(d.phase === "recording" ? "recording" : "loading");
          if (d.pct != null) setProgressPct(d.pct);
          if (d.text) setProgress(d.text);
        }

        if (d.type === "capture-started") {
          if (abortRef.current) return;
          setState("recording");
          setProgress("録画中…");
        }

        if (d.type === "capture-done" && isBlobLike(d.blob)) {
          clearTimeout(timeout);
          if (abortRef.current) { cleanup(); return; }
          // 録画は完了 — レンダリング用 iframe はもう不要なので撤去
          window.removeEventListener("message", handler);
          frame.popup?.removeEventListener("message", handler);

          const ext = d.ext || "webm";
          const contentType = d.mimeType || "video/webm";
          // ⚠ ウィンドウを閉じる **前** にこちらのレルムの Blob へ写す。専用ウィンドウを
          //    閉じてから元の Blob を読もうとすると、読めずにアップロードが落ちる。
          const cleanBlob = new Blob([d.blob], { type: contentType });

          // アップロード中も、次に撮るものがあるならウィンドウは開けておく。
          destroyCaptureFrame(frame, queueRef.current.length > 0);
          if (frameRef.current === frame) frameRef.current = null;
          if (blobUrl) { try { URL.revokeObjectURL(blobUrl); } catch {} blobUrl = null; }
          setState("uploading");
          setProgress("アップロード準備中…");

          async function uploadWithRetry(retries = 3): Promise<string> {
            await new Promise((r) => setTimeout(r, 2000));

            for (let i = 0; i < retries; i++) {
              if (i > 0) {
                const wait = 5000 * (i + 1);
                setProgress(`リトライ待ち… (${Math.round(wait / 1000)}秒)`);
                await new Promise((r) => setTimeout(r, wait));
              }
              setProgress(i === 0 ? "動画をアップロード中…" : `アップロードリトライ中… (${i + 1}/${retries})`);
              const fd = new FormData();
              fd.append("file", cleanBlob, `preview.${ext}`);
              fd.append("propertyId", propertyId);
              fd.append("itemIdx", String(itemIdx));
              try {
                const res = await fetch("/api/admin/capture-upload", { method: "POST", body: fd });
                console.log(`[preview-capture] upload attempt ${i + 1}: ${res.status}`);
                if (res.ok) {
                  const json = await res.json();
                  return json.url as string;
                }
                const text = await res.text().catch(() => "");
                console.log(`[preview-capture] upload attempt ${i + 1} body:`, text);
              } catch (e) {
                console.log(`[preview-capture] upload attempt ${i + 1} network error:`, e);
              }
            }
            throw new Error("Upload failed after retries");
          }

          uploadWithRetry()
            .then((videoUrl: string) => {
              busyRef.current = false;
              if (abortRef.current) return;
              setState("done");
              setProgress("プレビュー動画を生成しました");
              setCapturedUrl(videoUrl);
              processQueue();
            })
            .catch((err) => {
              busyRef.current = false;
              console.error("[preview-capture] upload error:", err);
              setState("error");
              setProgress("アップロード失敗");
              processQueue();
            });
        }

        if (d.type === "capture-error") {
          clearTimeout(timeout);
          cleanup();
          setState("error");
          setProgress(d.error || "キャプチャ失敗");
          processQueue();
        }
      }

      // ビューアーは `window.opener || parent` へ送る。別ウィンドウの中の iframe なら、
      // 送り先はその別ウィンドウになるので、そちらでも受け取る（同じオリジンなので購読できる）。
      window.addEventListener("message", handler);
      frame.popup?.addEventListener("message", handler as EventListener);
  }

  const runOne = useCallback(
    (splatUrl: string, propertyId: string, itemIdx: number) => {
      abortRef.current = false;
      busyRef.current = true;
      setState("loading");
      setProgress("3DGS 読み込み中…");
      setProgressPct(0);
      setCapturedUrl(null);
      setCapturedIdx(itemIdx);

      destroyCaptureFrame(frameRef.current);
      frameRef.current = null;
      void startOne(splatUrl, propertyId, itemIdx);
    },
     
    [],
  );

  // startOne(→processQueueOuter) からキューの続きを再開するための後方参照。
  // レンダー中に ref へ書かない（コミット後にだけ更新する）。
  useEffect(() => {
    runOneRef.current = runOne;
  }, [runOne]);


  const startCapture = useCallback(
    (splatUrl: string, propertyId: string, itemIdx: number, warmupExtraMs = 0) => {
      warmupRef.current = Math.max(0, warmupExtraMs);
      if (busyRef.current) {
        queueRef.current.push({ splatUrl, propertyId, itemIdx });
        setQueueLength(queueRef.current.length);
        return;
      }
      runOne(splatUrl, propertyId, itemIdx);
    },
    [runOne],
  );

  const queueCaptures = useCallback(
    (items: QueueItem[], warmupExtraMs = 0) => {
      if (!items.length) return;
      warmupRef.current = Math.max(0, warmupExtraMs);
      const [first, ...rest] = items;
      if (!busyRef.current) {
        queueRef.current.push(...rest);
        setQueueLength(queueRef.current.length);
        runOne(first.splatUrl, first.propertyId, first.itemIdx);
      } else {
        queueRef.current.push(...items);
        setQueueLength(queueRef.current.length);
      }
    },
    [runOne],
  );

  return { state, progress, progressPct, capturedUrl, capturedIdx, queueLength, startCapture, queueCaptures, cancel, clearResult };
}
