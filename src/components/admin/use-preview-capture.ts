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
  startCapture: (splatUrl: string, propertyId: string, itemIdx: number) => void;
  queueCaptures: (items: QueueItem[]) => void;
  cancel: () => void;
  clearResult: () => void;
}

import { buildViewerUrl, CORS_PROXY } from "@/lib/viewer";

/**
 * キャプチャは別ウィンドウ(window.open)ではなく「同じタブ内の iframe」で実行する。
 *  - ポップアップブロックに殺されない／別窓を放置監視しなくてよい。
 *  - ビューアーの ?capture=1 は postMessage を `window.opener || parent` に送る
 *    ため、iframe(parent) でもそのまま動く（ビューアー側の変更は不要）。
 *  - ⚠ iframe を display:none にすると requestAnimationFrame が止まり
 *    キャプチャが進まない。必ず「見える」状態でレンダリングさせる。
 *    → 右下に縮小サムネイル（1920×1080 を CSS transform で 320×180 に縮小）
 *      として表示し、進行が目視できるようにする。
 */
const FRAME_W = 1920;
const FRAME_H = 1080;
const THUMB_W = 320;
const THUMB_H = 180;

interface CaptureFrame {
  container: HTMLDivElement;
  iframe: HTMLIFrameElement;
}

function createCaptureFrame(url: string): CaptureFrame {
  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;right:16px;bottom:16px;z-index:9999;" +
    "background:#111;border:1px solid #ffb454;box-shadow:0 8px 32px rgba(0,0,0,.6);";
  const label = document.createElement("div");
  label.textContent = "プレビュー録画中（このタブ内で自動実行）";
  label.style.cssText =
    "font:10px/1.6 ui-monospace,monospace;letter-spacing:.08em;color:#ffb454;" +
    "padding:6px 10px;border-bottom:1px solid #333;user-select:none;";
  const stage = document.createElement("div");
  stage.style.cssText = `width:${THUMB_W}px;height:${THUMB_H}px;overflow:hidden;position:relative;background:#000;`;
  const iframe = document.createElement("iframe");
  iframe.src = url;
  iframe.setAttribute("title", "3DGS preview capture");
  // iframe 自体は 1920×1080 のビューポートを持たせ（キャプチャ解像度と一致）、
  // CSS transform で右下サムネイルに縮小表示する。ユーザー操作は不要なので
  // pointer-events は切る。
  iframe.style.cssText =
    `width:${FRAME_W}px;height:${FRAME_H}px;border:0;` +
    `transform:scale(${THUMB_W / FRAME_W});transform-origin:top left;pointer-events:none;`;
  stage.appendChild(iframe);
  container.appendChild(label);
  container.appendChild(stage);
  document.body.appendChild(container);
  return { container, iframe };
}

function destroyCaptureFrame(frame: CaptureFrame | null) {
  if (!frame) return;
  try {
    frame.iframe.src = "about:blank"; // レンダリング/エンコードを確実に停止
  } catch {}
  try {
    frame.container.remove();
  } catch {}
}

export function usePreviewCapture(): UseCaptureResult {
  const [state, setState] = useState<CaptureState>("idle");
  const [progress, setProgress] = useState("");
  const [progressPct, setProgressPct] = useState(0);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [capturedIdx, setCapturedIdx] = useState<number | null>(null);
  const [queueLength, setQueueLength] = useState(0);
  const frameRef = useRef<CaptureFrame | null>(null);
  const abortRef = useRef(false);
  const queueRef = useRef<QueueItem[]>([]);
  const busyRef = useRef(false);

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
      // /api/r2/ blocks .rad/.splat/.ply files (security); for capture the admin
      // is authenticated, so route 3DGS assets through viewer-stream instead.
      // Other relative paths still go through the CORS proxy.
      let directSplatUrl: string;
      if (/^\/api\/r2\//i.test(splatUrl) && /\.(splat|ply|ksplat|rad)$/i.test(splatUrl)) {
        directSplatUrl = splatUrl.replace(/^\/api\/r2\//, "/api/viewer-stream/");
      } else if (splatUrl.startsWith("/")) {
        directSplatUrl = `${CORS_PROXY}${splatUrl}`;
      } else {
        directSplatUrl = splatUrl;
      }
      const url = buildViewerUrl(directSplatUrl, { orbit: true, capture: true });
      const frame = createCaptureFrame(url);
      frameRef.current = frame;

      const cleanup = () => {
        window.removeEventListener("message", handler);
        destroyCaptureFrame(frame);
        if (frameRef.current === frame) frameRef.current = null;
        busyRef.current = false;
      };

      const timeout = setTimeout(() => {
        if (abortRef.current) return;
        cleanup();
        setState("error");
        setProgress("タイムアウト（6分経過）");
        processQueue();
      }, 360_000);

      function processQueue() {
        const next = queueRef.current.shift();
        setQueueLength(queueRef.current.length);
        if (next) {
          setTimeout(() => runOne(next.splatUrl, next.propertyId, next.itemIdx), 500);
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

        if (d.type === "capture-done" && d.blob instanceof Blob) {
          clearTimeout(timeout);
          if (abortRef.current) { cleanup(); return; }
          // 録画は完了 — レンダリング用 iframe はもう不要なので撤去
          window.removeEventListener("message", handler);
          destroyCaptureFrame(frame);
          if (frameRef.current === frame) frameRef.current = null;
          setState("uploading");
          setProgress("アップロード準備中…");

          const ext = d.ext || "webm";
          const contentType = d.mimeType || "video/webm";
          const cleanBlob = new Blob([d.blob], { type: contentType });

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

      window.addEventListener("message", handler);
    },
    [],
  );

  const startCapture = useCallback(
    (splatUrl: string, propertyId: string, itemIdx: number) => {
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
    (items: QueueItem[]) => {
      if (!items.length) return;
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
