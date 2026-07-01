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

function openCaptureWindow(url: string): Window | null {
  return window.open(url, '_blank', 'width=1920,height=1080,menubar=no,toolbar=no,location=no');
}

export function usePreviewCapture(): UseCaptureResult {
  const [state, setState] = useState<CaptureState>("idle");
  const [progress, setProgress] = useState("");
  const [progressPct, setProgressPct] = useState(0);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [capturedIdx, setCapturedIdx] = useState<number | null>(null);
  const [queueLength, setQueueLength] = useState(0);
  const winRef = useRef<Window | null>(null);
  const abortRef = useRef(false);
  const queueRef = useRef<QueueItem[]>([]);
  const busyRef = useRef(false);

  useEffect(() => {
    return () => {
      abortRef.current = true;
      try { winRef.current?.close(); } catch {}
    };
  }, []);

  const cancel = useCallback(() => {
    abortRef.current = true;
    queueRef.current = [];
    setQueueLength(0);
    try { winRef.current?.close(); } catch {}
    winRef.current = null;
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

      try { winRef.current?.close(); } catch {}
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
      const capWin = openCaptureWindow(url);
      winRef.current = capWin;
      if (!capWin) {
        setState("error");
        setProgress("ポップアップがブロックされました。許可してください。");
        busyRef.current = false;
        return;
      }

      const cleanup = () => {
        window.removeEventListener("message", handler);
        try { capWin.close(); } catch {}
        winRef.current = null;
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
        if (e.source !== capWin) return;
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
          try { capWin?.close(); } catch {}
          winRef.current = null;
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
              window.removeEventListener("message", handler);
              busyRef.current = false;
              if (abortRef.current) return;
              setState("done");
              setProgress("プレビュー動画を生成しました");
              setCapturedUrl(videoUrl);
              processQueue();
            })
            .catch((err) => {
              window.removeEventListener("message", handler);
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
