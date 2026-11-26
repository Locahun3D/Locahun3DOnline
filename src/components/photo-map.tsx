"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Property } from "@/lib/schemas";
import { PANO_FS, PANO_VS } from "@/components/pano-preview";
import TitleText from "@/components/title-text";

type PhotoMapData = Property["photoMaps"][number];
type Pt = PhotoMapData["points"][number];

/**
 * 位置から見る写真（2026-11-26 本人「2D表示、3Dビューアーと併用するのやめよう。3Dは3Dにしよう。
 * 代わりに物件ページに建物ごとにこのような形で画像をのせよう」。参考: planear.co.jp/studio/multi/kisarazuekimae.html）。
 * 参考ページと同じ組み方:
 * - 場所（階・シーン）ごとに 1 枚のカードを縦に並べる。左に簡易図面（右上に場所の名前）、右にその場所の代表の眺め。
 * - 図面の点は小さな丸と、向きを示す小さな矢印。押すと大きく開いて、その位置からの眺めを出す（← → で前後の地点、× か Esc で閉じる）。
 * - 開いた眺めはドラッグで見回せる（6 方向の画像から描く。WebGL が無い端末は正面の 1 枚）。図面の下に使い方の 1 行。
 */
const FACES = ["f", "r", "b", "l", "u", "d"] as const;
const PINK = "#f08a8a";

// next/image は使わない（Workers + 相対パスで最適化が 404 になる。CLAUDE.md）
/* eslint-disable @next/next/no-img-element */
export default function PhotoMap({ maps, en }: { maps: PhotoMapData[]; en: boolean }) {
  const usable = maps.filter((m) => m.points.length > 0);
  const [open, setOpen] = useState<{ m: number; i: number } | null>(null);
  if (!usable.length) return null;
  const cur = open && usable[open.m];
  return (
    <div data-photo-map className="space-y-6">
      {usable.map((m, mi) => (
        <OneMap key={m.image.src} map={m} en={en} onPick={(i) => setOpen({ m: mi, i })} />
      ))}
      {cur && open && (
        <Lightbox map={cur} index={open.i} en={en} onIndex={(i) => setOpen({ m: open.m, i })} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}

function OneMap({ map, en, onPick }: { map: PhotoMapData; en: boolean; onPick: (i: number) => void }) {
  const W = map.image.width, H = map.image.height;
  const r = Math.max(W, H) * 0.0085; // 点の丸（図の長い辺の 0.85%。参考ページくらいの小ささ）
  const name = (en ? map.labelEn || map.label : map.label) || "";
  return (
    <div className="bg-white border border-line p-4 sm:p-6">
      <div className="grid gap-5 md:grid-cols-2 items-start">
        <div className="relative pt-7 sm:pt-0">
          {name && (
            <div className="absolute right-0 top-0 text-right font-bold text-[16px] sm:text-[19px] leading-tight pointer-events-none">{name}</div>
          )}
          <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto mx-auto" style={{ maxWidth: `max(320px, ${Math.round(W / 2)}px)` }} role="group" aria-label={en ? `${name} floor plan` : `${name}の平面図`}>
            <image href={map.image.src} x={0} y={0} width={W} height={H} />
            {map.points.map((q, i) => (
              <g
                key={q.id}
                transform={`translate(${q.x * W} ${q.y * H})`}
                onClick={() => onPick(i)}
                role="button"
                tabIndex={0}
                aria-label={en ? `View from position ${i + 1}` : `地点 ${i + 1} からの眺め`}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(i); } }}
                className="cursor-pointer outline-none [&:hover>.dot]:opacity-75 [&:focus-visible>.ring]:opacity-100"
              >
                <circle r={r * 3.6} fill="transparent" />
                <circle className="ring" r={r * 2.4} fill="none" stroke="#000" strokeWidth={r * 0.3} opacity={0} />
                <circle className="dot" r={r} fill={PINK} />
                {/* 向き: 丸の外側に小さな矢じり */}
                <path d={`M ${-r * 0.9} ${-r * 1.5} L 0 ${-r * 2.5} L ${r * 0.9} ${-r * 1.5} Z`} transform={`rotate(${q.yaw})`} fill={PINK} />
              </g>
            ))}
          </svg>
        </div>
        <button type="button" onClick={() => onPick(0)} className="block w-full" aria-label={en ? "Open the view" : "眺めを大きく見る"}>
          <PanoView base={map.photoBase} pt={map.points[0]} className="aspect-[4/3] w-full bg-[#111]" />
        </button>
      </div>
      <p className="mt-4 text-[13px] text-ink/75 flex items-start gap-2">
        <svg viewBox="-10 -14 20 24" className="w-3.5 h-4 shrink-0 mt-[3px]" aria-hidden>
          <circle r={5} fill={PINK} />
          <path d="M -4.5 -7.5 L 0 -12.5 L 4.5 -7.5 Z" fill={PINK} />
        </svg>
        <span>{en ? "Click an arrow on the plan to see the view from that position." : <TitleText text="平面図の矢印を押すと、その位置からの眺めが表示されます。" />}</span>
      </p>
      <p className="mt-1 text-[12px] text-muted">{en ? "* Views are rendered from the 3D scan." : <TitleText text="※ 画像は3Dスキャンから作ったものです。" />}</p>
    </div>
  );
}

function Lightbox({ map, index, en, onIndex, onClose }: { map: PhotoMapData; index: number; en: boolean; onIndex: (i: number) => void; onClose: () => void }) {
  const n = map.points.length;
  const step = useCallback((d: number) => onIndex((index + d + n) % n), [index, n, onIndex]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose, step]);
  const p = map.points[index];
  return (
    <div data-photo-map-box className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-5 sm:p-10" onClick={onClose} role="dialog" aria-modal aria-label={en ? "View from position" : "位置からの眺め"}>
      <div className="relative bg-white p-2 sm:p-2.5 w-full max-w-[min(1100px,calc((100vh-120px)*4/3))] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <PanoView key={p.id} base={map.photoBase} pt={p} interactive className="aspect-[4/3] w-full bg-[#111]" />
        <div className="flex items-center justify-between gap-3 pt-2 px-1 text-[12.5px] text-ink/70">
          <span className="mono tracking-[0.12em]">{String(index + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}</span>
          <span>{en ? "Drag to look around" : "ドラッグで見回せます"}</span>
        </div>
        <button type="button" onClick={onClose} aria-label={en ? "Close" : "閉じる"} className="absolute -top-3.5 -right-3.5 w-9 h-9 rounded-full bg-black text-white text-[18px] leading-none grid place-items-center border-2 border-white">×</button>
        <button type="button" onClick={() => step(-1)} aria-label={en ? "Previous position" : "前の地点"} className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-black text-white text-[20px] grid place-items-center border-2 border-white">‹</button>
        <button type="button" onClick={() => step(1)} aria-label={en ? "Next position" : "次の地点"} className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-10 h-10 rounded-full bg-black text-white text-[20px] grid place-items-center border-2 border-white">›</button>
      </div>
    </div>
  );
}

/** 地点の 6 方向の画像から、正面（地点の向き）を 4:3 で描く。interactive ならドラッグで見回せる。WebGL が無ければ正面の 1 枚。 */
function PanoView({ base, pt, interactive = false, className = "" }: { base: string; pt: Pt; interactive?: boolean; className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [noGl, setNoGl] = useState(false);
  const src = useCallback((f: string, small = false) => `${base}${pt.id}-${f}${small ? ".s" : ""}.jpg`, [base, pt.id]);

  useEffect(() => {
    const root = rootRef.current, cv = cvRef.current;
    if (!root || !cv) return;
    let alive = true, raf = 0, yaw = 0, pitch = 0, dirty = true;
    const gl = cv.getContext("webgl", { antialias: false, premultipliedAlpha: false });
    if (!gl) { setNoGl(true); return; }
    const sh = (type: number, s: string) => { const o = gl.createShader(type)!; gl.shaderSource(o, s); gl.compileShader(o); return o; };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, PANO_VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, PANO_FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { setNoGl(true); return; }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(prog, "res"), uFp = gl.getUniformLocation(prog, "fp");
    const uYaw = gl.getUniformLocation(prog, "yaw"), uPitch = gl.getUniformLocation(prog, "pitch");
    const HFOV = 96;
    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(root.clientWidth * dpr)), h = Math.max(1, Math.round(root.clientHeight * dpr));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
      gl.uniform1f(uFp, w / 2 / Math.tan((HFOV * Math.PI) / 360));
      gl.uniform1f(uYaw, (yaw * Math.PI) / 180);
      gl.uniform1f(uPitch, (pitch * Math.PI) / 180);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    const tick = () => { if (dirty) { draw(); dirty = false; } raf = requestAnimationFrame(tick); };
    // 先に軽い版で描き、本体が届いたら差し替える
    const load = (small: boolean) => Promise.all(FACES.map((f) => new Promise<HTMLImageElement>((ok, ng) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => ok(im); im.onerror = ng; im.src = src(f, small); })));
    const upload = (imgs: HTMLImageElement[]) => {
      imgs.forEach((img, i) => {
        const t = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.uniform1i(gl.getUniformLocation(prog, "t" + FACES[i]), i);
      });
      dirty = true;
    };
    load(true)
      .then((a) => { if (!alive) return null; upload(a); setReady(true); return load(false); })
      .then((a) => { if (alive && a) upload(a); })
      .catch(() => { if (alive) setNoGl(true); });
    raf = requestAnimationFrame(tick);
    const ro = new ResizeObserver(() => { dirty = true; });
    ro.observe(root);
    let drag: { x: number; y: number; yaw: number; pitch: number } | null = null;
    const down = (e: PointerEvent) => { if (!interactive || e.button !== 0) return; drag = { x: e.clientX, y: e.clientY, yaw, pitch }; root.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const k = HFOV / (root.clientWidth || 1);
      yaw = drag.yaw - (e.clientX - drag.x) * k;
      pitch = Math.max(-70, Math.min(70, drag.pitch + (e.clientY - drag.y) * k));
      dirty = true;
    };
    const up = () => { drag = null; };
    root.addEventListener("pointerdown", down);
    root.addEventListener("pointermove", move);
    root.addEventListener("pointerup", up);
    root.addEventListener("pointercancel", up);
    return () => {
      alive = false; cancelAnimationFrame(raf); ro.disconnect();
      root.removeEventListener("pointerdown", down); root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerup", up); root.removeEventListener("pointercancel", up);
    };
  }, [src, interactive]);

  return (
    <div ref={rootRef} className={`relative overflow-hidden select-none ${interactive ? "cursor-grab active:cursor-grabbing touch-none" : ""} ${className}`}>
      {noGl ? (
        <img src={src("f")} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <>
          {!ready && <img src={src("f", true)} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover" />}
          <canvas ref={cvRef} className="absolute inset-0 w-full h-full" />
        </>
      )}
    </div>
  );
}
