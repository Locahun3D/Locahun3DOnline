"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 3DGS カードのプレビュー: 開始位置の 360° 画像（6 方向・各 90°）をゆっくり回して見せる
 * （2026-11-10 本人「3DGSビューのプレビュー動画、最初の3Dから用意した画像を回転させて表示させるのはどうか / 動画より軽く360度回せるのでは」）。
 *
 * - 画像はビューアー（Locahun3D src/js/292b_start_pano.js）が開いた直後に 3D の上にかぶせるものと同じ
 *   （/api/pano/<key>.json と /api/pano/<key>-{f,r,b,l,u,d}.jpg。scripts/bake-pano.mjs が作る）。
 * - キーもビューアーと同じ計算: シーンの配信（/api/viewer-stream/…）の HEAD の ETag と長さから
 *   sha256('l3d-pano-v1:' + 'etag:<etag>:<長さ>' または 'content:<id>:<長さ>')。だからカードとビューアーで食い違わない。
 * - 描画は CSS の 3D 変形で作った立方体（ライブラリ・WebGL なし。スタイルはインラインだけで完結させてある）。6 枚で計 0.4MB 前後で、動画より軽い。
 * - 自動でゆっくり回り、ドラッグで見回せる（ドラッグした後のクリックはビューアーを開かない）。動きを減らす設定の端末では回さない。
 * - 画像が無い・確かめられないときは onMissing を呼ぶ（呼び出し側が従来のプレビュー動画に戻す）。
 */

const FACES = ["f", "r", "b", "l", "u", "d"] as const;
const FACE_TRANSFORM: Record<(typeof FACES)[number], string> = {
  f: "rotateY(0deg)",
  r: "rotateY(-90deg)",
  b: "rotateY(180deg)",
  l: "rotateY(90deg)",
  u: "rotateX(-90deg)",
  d: "rotateX(90deg)",
};
const HFOV = 100; // カード幅に対する横の画角（度）
const AUTO_DEG_PER_SEC = 9; // 40 秒で 1 周
const keyCache = new Map<string, Promise<string | null>>();

async function sha256hex(s: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((n) => n.toString(16).padStart(2, "0")).join("");
}

/** ビューアーの 292b と同じ手順で 360° 画像のキーを求め、画像があればキーを返す。 */
function findPano(streamUrl: string): Promise<string | null> {
  const hit = keyCache.get(streamUrl);
  if (hit) return hit;
  const p = (async () => {
    try {
      const res = await fetch(streamUrl, { method: "HEAD", credentials: "same-origin", cache: "no-cache" });
      if (!res.ok) return null;
      const etag = res.headers.get("etag") || "";
      const len = res.headers.get("content-length") || "";
      if (!/^\d+$/.test(len)) return null;
      const content = /^"l3d-content-([A-Za-z0-9_-]{8,200})"$/.exec(etag);
      const r2 = /^"([A-Za-z0-9_-]{8,200})"$/.exec(etag);
      const id = content ? `content:${content[1]}:${len}` : r2 ? `etag:${r2[1]}:${len}` : null;
      if (!id) return null;
      const key = await sha256hex(`l3d-pano-v1:${id}`);
      const meta = await fetch(`/api/pano/${key}.json`);
      return meta.ok ? key : null;
    } catch {
      return null;
    }
  })();
  keyCache.set(streamUrl, p);
  return p;
}

export function PanoPreview({ streamUrl, onMissing }: { streamUrl: string; onMissing: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const cubeRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [panoKey, setPanoKey] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [size, setSize] = useState({ p: 0, s: 0 });
  const missingRef = useRef(onMissing);
  useEffect(() => { missingRef.current = onMissing; }, [onMissing]);

  // 画面付近に入ってから調べる（1 物件に複数シーンがあっても一度に全部取りに行かない）
  useEffect(() => {
    const el = rootRef.current;
    if (!el || visible) return;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        setVisible(true);
        io.disconnect();
      }
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    findPano(streamUrl).then((key) => {
      if (!alive) return;
      if (key) setPanoKey(key);
      else missingRef.current();
    });
    return () => { alive = false; };
  }, [visible, streamUrl]);

  // 6 枚そろってから見せる（途中の欠けた立方体を見せない）。1 枚でも失敗したら動画へ。
  useEffect(() => {
    if (!panoKey) return;
    let left = FACES.length, alive = true;
    for (const f of FACES) {
      const img = new Image();
      img.onload = () => { if (alive && --left === 0) setLoaded(true); };
      img.onerror = () => { if (alive) { alive = false; missingRef.current(); } };
      img.src = `/api/pano/${panoKey}-${f}.jpg`;
    }
    return () => { alive = false; };
  }, [panoKey]);

  // カード幅に合わせて透視の距離と面の大きさを決める
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth || 1;
      const p = w / 2 / Math.tan((HFOV * Math.PI) / 360);
      setSize({ p, s: 2 * p + 2 });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 自動回転とドラッグ。イベントはカード全体（親要素）で受ける（上に重なる「開く」ボタンの下からでも回せるように）。
  useEffect(() => {
    if (!loaded || !size.p) return;
    const card = rootRef.current?.parentElement;
    const cube = cubeRef.current;
    if (!card || !cube) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let yaw = 0, pitch = 0, last = performance.now(), raf = 0, idleUntil = 0;
    let drag: { x: number; y: number; yaw: number; pitch: number; moved: boolean } | null = null;
    let suppressClick = false;
    const apply = () => { cube.style.transform = `translateZ(${size.p}px) rotateX(${pitch}deg) rotateY(${yaw}deg)`; };
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (!drag && !reduce && now > idleUntil) yaw += AUTO_DEG_PER_SEC * dt;
      apply();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const down = (e: PointerEvent) => { if (e.button !== 0) return; drag = { x: e.clientX, y: e.clientY, yaw, pitch, moved: false }; suppressClick = false; };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 6) return;
      drag.moved = true;
      const degPerPx = HFOV / (card.clientWidth || 1);
      yaw = drag.yaw - dx * degPerPx;
      pitch = Math.max(-60, Math.min(60, drag.pitch + dy * degPerPx));
    };
    const up = () => { if (drag?.moved) { suppressClick = true; idleUntil = performance.now() + 2500; } drag = null; };
    // ドラッグして離したときのクリックでビューアーが開かないようにする
    const click = (e: MouseEvent) => { if (suppressClick) { e.preventDefault(); e.stopPropagation(); suppressClick = false; } };
    card.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    card.addEventListener("click", click, true);
    // 縦スクロールは残し、横のドラッグで見回す（カードは呼び出し側の要素なので DOM を直接触る）
    // eslint-disable-next-line react-hooks/immutability
    card.style.touchAction = "pan-y";
    return () => {
      cancelAnimationFrame(raf);
      card.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      card.removeEventListener("click", click, true);
    };
  }, [loaded, size.p]);

  return (
    <div ref={rootRef} style={{ position: "absolute", inset: 0, overflow: "hidden" }} aria-hidden="true">
      {panoKey && size.p > 0 && (
        <div
          style={{ position: "absolute", inset: 0, perspective: `${size.p}px`, opacity: loaded ? 1 : 0, transition: "opacity .5s" }}
        >
          <div ref={cubeRef} style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0, transformStyle: "preserve-3d", transform: `translateZ(${size.p}px)` }}>
            {FACES.map((f) => (
              <div
                key={f}
                style={{
                  position: "absolute",
                  width: size.s,
                  height: size.s,
                  left: -size.s / 2,
                  top: -size.s / 2,
                  backgroundImage: `url(/api/pano/${panoKey}-${f}.jpg)`,
                  backgroundSize: "cover",
                  backfaceVisibility: "hidden",
                  transform: `${FACE_TRANSFORM[f]} translateZ(${-size.p}px)`,
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
