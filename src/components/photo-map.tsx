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
  const [sel, setSel] = useState<number[]>([]);   // 各カードで選ばれている地点（右の眺め・図の濃い印）
  if (!usable.length) return null;
  const cur = open && usable[open.m];
  const pick = (m: number, i: number, show = true) => { setSel((s) => { const n = [...s]; n[m] = i; return n; }); if (show) setOpen({ m, i }); };
  return (
    <div data-photo-map className="space-y-6">
      {usable.map((m, mi) => (
        <OneMap key={m.image.src} map={m} en={en} sel={sel[mi] ?? 0} onPick={(i) => pick(mi, i)} />
      ))}
      {cur && open && (
        <Lightbox map={cur} index={open.i} en={en} onIndex={(i) => pick(open.m, i)} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}

/** 図の印: ピンクの丸＋向きの矢じり（画面上の大きさは図の縮尺に関係なく一定）。選ばれている地点は濃い色＋輪 */
function Marker({ yaw, active, size = 26 }: { yaw: number; active?: boolean; size?: number }) {
  return (
    <svg viewBox="-16 -16 32 32" width={size} height={size} aria-hidden className="block overflow-visible">
      {active && <><circle r={10} fill="none" stroke="#fff" strokeWidth={3.4} /><circle r={10} fill="none" stroke="#1a1a1a" strokeWidth={1.5} /></>}
      <path d="M -7.2 -3.4 L 0 -15.5 L 7.2 -3.4 Z" transform={`rotate(${yaw})`} fill={active ? "#d9534f" : PINK} stroke="#fff" strokeWidth={1} strokeLinejoin="round" />
      <circle r={4.8} fill={active ? "#d9534f" : PINK} stroke="#fff" strokeWidth={1.4} />
    </svg>
  );
}

/** 縮尺バー（図の横幅の実寸から。1・2・5・10m のうち図の幅の 1/5〜1/3 に収まるもの） */
function ScaleBar({ metersWide, maxWidth }: { metersWide: number; maxWidth: string }) {
  const m = [1, 2, 5, 10, 20].find((v) => v / metersWide >= 0.15) ?? 20;
  return (
    <div className="mx-auto mt-2" style={{ maxWidth }}>
      <div className="flex items-center gap-2 text-[11px] text-ink/70 mono">
        <div className="relative h-2" style={{ width: `${(m / metersWide) * 100}%` }}>
          <div className="absolute inset-x-0 bottom-0 h-[2px] bg-ink" />
          <div className="absolute left-0 bottom-0 w-[2px] h-2 bg-ink" />
          <div className="absolute right-0 bottom-0 w-[2px] h-2 bg-ink" />
        </div>
        <span>{m}m</span>
      </div>
    </div>
  );
}

/** 平面図（線・名前・印）。カードの中と、スマホの「拡大」画面で同じものを描く */
function Plan({ map, en, sel, onPick, style, full }: { map: PhotoMapData; en: boolean; sel: number; onPick: (i: number) => void; style: React.CSSProperties; full?: boolean }) {
  const W = map.image.width, H = map.image.height;
  const name = (en ? map.labelEn || map.label : map.label) || "";
  return (
    <div
    className="relative mx-auto"
    style={{ ...style, aspectRatio: `${W} / ${H}` }}
    role="group"
    aria-label={en ? `${name} floor plan` : `${name}の平面図`}
  >
    {map.plan ? (
      // 線の形がある図は SVG で描く（線の太さが画面の大きさによらず一定。外壁 2.5px・間仕切り 1.25px）
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full" aria-hidden>
        {/* 造り付けの大きな家具（灰の細線）→ 壁が沿っていない外形（破線）→ 間仕切り → 外壁 → 柱 */}
        {map.plan.furn.map((a, i) => (
          <polygon key={`f${i}`} points={a.join(" ")} fill="#f1f1ef" stroke="#8c8c8c" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        {map.plan.flines.map(([x1, y1, x2, y2], i) => (
          <line key={`fl${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#9a9a9a" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        {map.plan.dashed.map(([x1, y1, x2, y2], i) => (
          <line key={`d${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#141414" strokeWidth={1} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        ))}
        {map.plan.walls.map(([x1, y1, x2, y2], i) => (
          <line key={`w${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#141414" strokeWidth={1.25} strokeLinecap="square" vectorEffect="non-scaling-stroke" />
        ))}
        {map.plan.outer.map(([x1, y1, x2, y2], i) => (
          <line key={`o${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#141414" strokeWidth={2.5} strokeLinecap="square" vectorEffect="non-scaling-stroke" />
        ))}
        {map.plan.cols.map(([x, y, w, h], i) => (h < 0 ? <circle key={`c${i}`} cx={x + w / 2} cy={y + w / 2} r={w / 2} fill="#141414" /> : <rect key={`c${i}`} x={x} y={y} width={w} height={h} fill="#141414" />))}
      </svg>
    ) : null}
    {map.plan ? (
      // 部屋・設備の名前（文字は画面 px で一定の大きさ。HTML で重ねる）
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        {/* スマホ（640px 未満）は部屋の名前だけ・3 つまで（印に隠れないように）。5 番目 = 1 が部屋、0 が設備 */}
        {map.plan.labels.map(([x, y, t, te, k = 1], i, all) => (
          <span key={i} className={`${full || (k === 1 && all.slice(0, i).filter((l) => (l[4] ?? 1) === 1).length < 3) ? "" : "max-sm:hidden "}absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] sm:text-[12px] font-bold tracking-[0.04em] text-ink/85 [text-shadow:0_0_2px_#fff,0_0_2px_#fff,0_0_3px_#fff,0_0_4px_#fff]`} style={{ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` }}>
            {en ? te || t : t}
          </span>
        ))}
      </div>
    ) : null}
    {!map.plan ? (
      <img src={map.image.src} alt="" width={W} height={H} className="absolute inset-0 w-full h-full" />
    ) : null}

    {map.points.map((q, i) => (
      <button
        key={(q.base ?? "") + q.id}
        type="button"
        onClick={() => onPick(i)}
        aria-label={en ? `View from position ${i + 1}` : `地点 ${i + 1} からの眺め`}
        className={`absolute -translate-x-1/2 -translate-y-1/2 w-9 h-9 grid place-items-center rounded-full outline-none ${full ? "" : "max-sm:scale-[0.78]"} hover:scale-110 focus-visible:ring-2 focus-visible:ring-black transition-transform`}
        style={{ left: `${q.x * 100}%`, top: `${q.y * 100}%`, zIndex: i === sel ? 2 : 1 }}
      >
        <Marker yaw={q.yaw} active={i === sel} size={30} />
      </button>
    ))}
  </div>
  );
}

function OneMap({ map, en, sel, onPick }: { map: PhotoMapData; en: boolean; sel: number; onPick: (i: number) => void }) {
  const [zoom, setZoom] = useState(false);
  useEffect(() => { if (!zoom) return; const k = (e: KeyboardEvent) => { if (e.key === "Escape") setZoom(false); }; window.addEventListener("keydown", k); const o = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { window.removeEventListener("keydown", k); document.body.style.overflow = o; }; }, [zoom]);
  const W = map.image.width;
  const name = (en ? map.labelEn || map.label : map.label) || "";
  const p0 = map.points[Math.min(sel, map.points.length - 1)];
  return (
    <div className="bg-white border border-line p-4 sm:p-6">
      {name && <div className="font-bold text-[16px] sm:text-[19px] leading-tight mb-4">{name}</div>}
      <div className="grid gap-5 md:grid-cols-2 items-start">
        <div>
          <Plan map={map} en={en} sel={sel} onPick={onPick} style={{ maxWidth: map.plan ? `min(100%, max(300px, ${Math.round(W / 2)}px))` : "100%" }} />
          {/* スマホは図が小さく印が混むので、全画面で 2 倍に広げて見られるように（横にスクロール） */}
          <button type="button" onClick={() => setZoom(true)} className="sm:hidden mt-2 mx-auto block text-[12.5px] border border-line px-3 py-1.5 bg-white">{en ? "Enlarge plan" : "図面を拡大"}</button>
          {zoom && (
            <div className="fixed inset-0 z-50 bg-white overflow-auto" role="dialog" aria-label={en ? `${name} floor plan` : `${name}の平面図`}>
              <div className="sticky top-0 left-0 z-10 flex items-center justify-between px-4 py-2 bg-white/95 border-b border-line text-[13px]">
                <span className="font-bold">{name}</span>
                <button type="button" onClick={() => setZoom(false)} className="w-9 h-9 grid place-items-center text-[20px]" aria-label={en ? "Close" : "閉じる"}>×</button>
              </div>
              <div className="p-4" style={{ width: "max(200vw, 700px)" }}>
                <Plan map={map} en={en} sel={sel} onPick={(i) => { setZoom(false); onPick(i); }} style={{ width: "100%" }} full />
              </div>
            </div>
          )}
          {map.metersWide ? <ScaleBar metersWide={map.metersWide} maxWidth={`min(100%, max(300px, ${Math.round(W / 2)}px))`} /> : null}
        </div>
        {/* 右の列: 眺め＋説明（PC では説明を写真の下に置き、図面の横の空きを埋める） */}
        <div className="md:sticky md:top-20">
          {/* 横にドラッグ（長押ししたまま動かす）で見回せる。動かさずに押したら大きく見る */}
          <PanoView key={(p0.base ?? "") + p0.id} base={p0.base ?? map.photoBase} pt={p0} interactive="h" onTap={() => onPick(sel)} label={en ? "Open the view" : "眺めを大きく見る"} className="aspect-[4/3] w-full bg-[#111]" />
          <p className="mt-4 text-[13px] text-ink/75 flex items-start gap-2">
            <span className="shrink-0 -mt-[2px]"><Marker yaw={0} size={20} /></span>
            <span>{en ? "Click an arrow on the plan to see the view from that position. Drag the view to look around." : <TitleText text="平面図の矢印を押すと、その位置からの眺めが表示されます。写真は横にドラッグすると見回せます。" />}</span>
          </p>
          <p className="mt-1 text-[12px] text-muted">{map.plan
            ? (en ? "* Plan and views are generated from the 3D scan. Actual conditions take precedence." : <TitleText text="※ 図面と画像は3Dスキャンから作ったものです。現況と違う場合は現況が優先されます。" />)
            : (en ? "* Floor plan from the venue; views from the 3D scan. Actual conditions take precedence." : <TitleText text="※ 図面は施設の資料、画像は3Dスキャンから作ったものです。現況と違う場合は現況が優先されます。" />)}</p>
        </div>
      </div>
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
        <PanoView key={(p.base ?? "") + p.id} base={p.base ?? map.photoBase} pt={p} interactive className="aspect-[4/3] w-full bg-[#111]" />
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
function PanoView({ base, pt, interactive = false, onTap, label, className = "" }: { base: string; pt: Pt; interactive?: boolean | "h"; onTap?: () => void; label?: string; className?: string }) {
  const tapRef = useRef(onTap);
  useEffect(() => { tapRef.current = onTap; }, [onTap]);
  const rootRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [noGl, setNoGl] = useState(false);
  const src = useCallback((f: string, small = false) => `${base}${pt.id}-${f}${small ? ".s" : ""}.jpg`, [base, pt.id]);

  useEffect(() => {
    const root = rootRef.current, cv = cvRef.current;
    if (!root || !cv) return;
    let alive = true, raf = 0, yaw = pt.o ?? 0, pitch = 0, dirty = true;
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
    // interactive="h": カードの中。横だけ回す（縦のスワイプはページのスクロールに残す）。動かさずに離したら onTap
    let drag: { x: number; y: number; yaw: number; pitch: number; moved: boolean } | null = null;
    const down = (e: PointerEvent) => { if ((!interactive && !tapRef.current) || e.button !== 0) return; drag = { x: e.clientX, y: e.clientY, yaw, pitch, moved: false }; root.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) drag.moved = true;
      if (!interactive || !drag.moved) return;
      const k = HFOV / (root.clientWidth || 1);
      yaw = drag.yaw - (e.clientX - drag.x) * k;
      if (interactive !== "h") pitch = Math.max(-70, Math.min(70, drag.pitch + (e.clientY - drag.y) * k));
      dirty = true;
    };
    const up = () => { if (drag && !drag.moved) tapRef.current?.(); drag = null; };
    root.addEventListener("pointerdown", down);
    root.addEventListener("pointermove", move);
    root.addEventListener("pointerup", up);
    root.addEventListener("pointercancel", up);
    return () => {
      alive = false; cancelAnimationFrame(raf); ro.disconnect();
      root.removeEventListener("pointerdown", down); root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerup", up); root.removeEventListener("pointercancel", up);
    };
  }, [src, interactive, pt.o]);

  return (
    <div
      ref={rootRef}
      className={`relative overflow-hidden select-none ${interactive ? `cursor-grab active:cursor-grabbing ${interactive === "h" ? "touch-pan-y" : "touch-none"}` : ""} ${className}`}
      {...(onTap ? { role: "button", tabIndex: 0, "aria-label": label, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTap(); } } } : {})}
    >
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
