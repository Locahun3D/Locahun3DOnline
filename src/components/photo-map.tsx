"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Property } from "@/lib/schemas";

type PhotoMapData = Property["photoMaps"][number];

/**
 * 位置から見る写真（2026-11-26 本人「2D表示、3Dビューアーと併用するのやめよう。3Dは3Dにしよう。
 * 代わりに物件ページに建物ごとにこのような形で画像をのせよう」）。
 * - 左に平面図（3DGS を真上から見た図）と点。点の矢印は今見ている写真の向き。押すとその位置からの写真を右に出す。
 * - 写真の下の ◀ ▶（とキーボードの ← →）で、その場で 90° ずつ向きを変える（6 方向の画像の横 4 枚）。矢印も一緒に回る。
 * - 場所（シーン・階）が 2 つ以上あるときだけ上にタブを出す。
 * - 画像は先に軽い版（.s.jpg）を出し、本体が届いたら差し替える。
 */
const DIRS = ["f", "r", "b", "l"] as const;

// next/image は使わない（Workers + 相対パスで最適化が 404 になる。CLAUDE.md）
/* eslint-disable @next/next/no-img-element */
export default function PhotoMap({ maps, en }: { maps: PhotoMapData[]; en: boolean }) {
  const usable = maps.filter((m) => m.points.length > 0);
  const [mi, setMi] = useState(0);
  const map = usable[Math.min(mi, usable.length - 1)];
  if (!map) return null;
  return (
    <div data-photo-map>
      {usable.length > 1 && (
        <div role="tablist" aria-label={en ? "Areas" : "場所"} className="flex flex-wrap gap-1.5 mb-4">
          {usable.map((m, i) => (
            <button
              key={m.image.src}
              type="button"
              role="tab"
              aria-selected={i === mi}
              onClick={() => setMi(i)}
              className={`min-h-[40px] px-4 text-[13px] border transition ${
                i === mi ? "bg-ink text-white border-ink font-bold" : "bg-white border-line text-ink/75 hover:border-ink"
              }`}
            >
              {(en ? m.labelEn || m.label : m.label) || (en ? `Area ${i + 1}` : `場所 ${i + 1}`)}
            </button>
          ))}
        </div>
      )}
      <OneMap key={map.image.src} map={map} en={en} />
    </div>
  );
}

function OneMap({ map, en }: { map: PhotoMapData; en: boolean }) {
  const [sel, setSel] = useState(0);
  const [dir, setDir] = useState(0);
  const p = map.points[sel];
  const W = map.image.width, H = map.image.height;
  const r = Math.max(W, H) * 0.014; // 点の大きさ（図の長い辺の 1.4%）
  const url = useCallback((id: string, d: number, small: boolean) => `${map.photoBase}${id}-${DIRS[d]}${small ? ".s" : ""}.jpg`, [map.photoBase]);
  const [loaded, setLoaded] = useState<Record<string, true>>({});
  const photoRef = useRef<HTMLDivElement>(null);
  // 1 列の画面（図の下に写真）では、点を押したら写真が見える所まで送る（見えていれば動かさない）
  const pick = (i: number) => {
    setSel(i); setDir(0);
    const el = photoRef.current;
    if (el && window.matchMedia("(max-width: 767px)").matches) {
      const b = el.getBoundingClientRect();
      if (b.top < 0 || b.bottom > window.innerHeight) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };
  const full = url(p.id, dir, false);

  // 横の 4 枚を先に読んでおく（回したときに待たせない）
  useEffect(() => {
    for (let d = 0; d < 4; d++) { const im = new Image(); im.src = url(p.id, d, false); }
  }, [p.id, url]);

  const turn = useCallback((step: number) => setDir((d) => (d + step + 4) % 4), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t?.closest?.("[data-photo-map-root]")) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); turn(-1); }
      if (e.key === "ArrowRight") { e.preventDefault(); turn(1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [turn]);

  const arrow = useMemo(() => {
    // 上向きの矢じり（点の中心から外へ）。回転は各点で付ける
    const a = r * 1.3, b = r * 2.7;
    return `M ${-a * 0.85} ${-a * 0.45} L 0 ${-b} L ${a * 0.85} ${-a * 0.45} Z`;
  }, [r]);
  const dirName = en ? ["Front", "Right", "Back", "Left"][dir] : ["正面", "右", "後ろ", "左"][dir];

  return (
    <div data-photo-map-root tabIndex={-1} className="grid gap-5 md:grid-cols-2 items-start outline-none">
      <div className="border border-line bg-white">
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto" role="group" aria-label={en ? "Floor map with photo positions" : "撮影位置の図"}>
          <image href={map.image.src} x={0} y={0} width={W} height={H} />
          {map.points.map((q, i) => {
            const on = i === sel;
            const yaw = q.yaw + (on ? dir * 90 : 0);
            return (
              <g
                key={q.id}
                transform={`translate(${q.x * W} ${q.y * H})`}
                onClick={() => pick(i)}
                role="button"
                tabIndex={0}
                aria-label={en ? `Position ${i + 1}` : `地点 ${i + 1}`}
                aria-pressed={on}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(i); } }}
                className="cursor-pointer outline-none [&:focus-visible>circle.ring]:opacity-100"
              >
                {/* 押しやすいよう見た目より広い当たり */}
                <circle r={r * 2.6} fill="transparent" />
                <circle className="ring" r={r * 2.0} fill="none" stroke="#fff" strokeWidth={r * 0.25} opacity={0} />
                <path d={arrow} transform={`rotate(${yaw})${on ? " scale(1.35)" : ""}`} fill={on ? "#ffb454" : "#f08a8a"} stroke="#000" strokeOpacity={0.35} strokeWidth={r * 0.12} />
                <circle r={on ? r * 1.25 : r} fill={on ? "#ffb454" : "#f08a8a"} stroke={on ? "#fff" : "#000"} strokeOpacity={on ? 1 : 0.35} strokeWidth={on ? r * 0.3 : r * 0.12} />
              </g>
            );
          })}
        </svg>
      </div>

      <div>
        <div ref={photoRef} className="relative aspect-square bg-[#0b0d10] border border-line overflow-hidden">
          <img src={url(p.id, dir, true)} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover" />
          <img
            key={full}
            src={full}
            alt={en ? `View from position ${sel + 1} (${dirName})` : `地点 ${sel + 1} からの眺め（${dirName}）`}
            onLoad={() => setLoaded((s) => ({ ...s, [full]: true }))}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ${loaded[full] ? "opacity-100" : "opacity-0"}`}
          />
          <button
            type="button"
            onClick={() => turn(-1)}
            aria-label={en ? "Turn left" : "左を向く"}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-11 h-11 grid place-items-center bg-black/55 text-white text-[18px] hover:bg-black/75"
          >
            ◀
          </button>
          <button
            type="button"
            onClick={() => turn(1)}
            aria-label={en ? "Turn right" : "右を向く"}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 grid place-items-center bg-black/55 text-white text-[18px] hover:bg-black/75"
          >
            ▶
          </button>
          <div className="absolute left-0 bottom-0 mono text-[11px] tracking-[0.14em] text-white bg-black/55 px-2.5 py-1">
            {String(sel + 1).padStart(2, "0")} / {String(map.points.length).padStart(2, "0")} · {dirName}
          </div>
        </div>
        <p className="mt-3 text-[13px] text-ink/70">
          {en ? (
            <>Tap an arrow on the map to see the view from that spot. Use ◀ ▶ to look around.</>
          ) : (
            <>
              図の矢印を押すと、その位置からの眺めが出ます。
              <br />
              ◀ ▶ で向きを変えられます。
            </>
          )}
        </p>
        <p className="mt-1 text-[12px] text-muted">
          {en ? "* Images are rendered from the 3D scan." : "※ 画像は3Dスキャンから作ったものです。"}
        </p>
      </div>
    </div>
  );
}
