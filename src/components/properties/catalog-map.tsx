"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Property } from "@/lib/schemas";
import { mapTileConfig } from "@/lib/map-tiles";

/**
 * Default Leaflet marker images fail to load with bundlers because of broken
 * resolution to /marker-icon.png at runtime. We don't use the default marker
 * (CircleMarker only), but explicit reset avoids console warnings on hot reload.
 */
const noopIcon = L.divIcon({ className: "", iconSize: [0, 0] });
L.Marker.prototype.options.icon = noopIcon;

interface Props {
  /** Properties with coords. Items without coords should be filtered out before passing. */
  items: Property[];
  /** Currently hovered card id (highlighted bigger + accent ring). */
  hoveredId: string | null;
  /** Optional reference point — drawn as a different colour to anchor "X km from here". */
  reference?: { lat: number; lng: number; label?: string } | null;
  /** Called when a marker is clicked. */
  onMarkerClick?: (id: string) => void;
  /** Called when a marker is hovered (so map → list sync also works). */
  onMarkerHover?: (id: string | null) => void;
}

/**
 * Fits the view to a ~50 km radius box around the reference point.
 *
 * 1° latitude ≈ 111 km. 1° longitude ≈ 111 × cos(lat) km.
 * So a 50 km half-box around `reference` ≈ ±0.45° lat × ±(50 / 111·cosφ)° lng.
 * Markers outside this box are still rendered — the user can pan / zoom out.
 */
function fitToReference(map: L.Map, reference: NonNullable<Props["reference"]>) {
  const RADIUS_KM = 50;
  const latDelta = RADIUS_KM / 111;
  const lngDelta =
    RADIUS_KM / (111 * Math.cos((reference.lat * Math.PI) / 180));
  const bounds = L.latLngBounds(
    [reference.lat - latDelta, reference.lng - lngDelta],
    [reference.lat + latDelta, reference.lng + lngDelta],
  );
  map.fitBounds(bounds, { padding: [20, 20], animate: true });
}

/**
 * Re-runs whenever the reference changes (preset click, geolocation, typed search),
 * which intentionally snaps the view back.
 */
function ViewportFitter({ reference }: { reference: Props["reference"] }) {
  const map = useMap();
  useEffect(() => {
    if (reference) fitToReference(map, reference);
  }, [reference, map]);
  return null;
}

/**
 * ズーム(+/−)コントロールの直下に置く「最初の表示に戻る」ボタン。
 * パン/ズームで迷子になっても、参照地点±50kmの初期ビューへワンタップで復帰。
 * Leaflet純正の leaflet-bar スタイルに乗せて +/− と見た目を揃える。
 */
function ResetViewControl({ reference }: { reference: Props["reference"] }) {
  const map = useMap();
  // クリック時点の最新 reference を参照する（コントロールDOMは初回のみ生成）。
  // ⚠ レンダー中に ref へ書かないこと（React はレンダーを破棄・再実行できるため
  //   不正。React Compiler も "Cannot access refs during render" で弾く）。
  //   代入はコミット後の effect で行う。onClick が読むのは常にコミット後なので
  //   最新値を参照できるという性質は変わらない。
  const refLatest = useRef(reference);
  useEffect(() => {
    refLatest.current = reference;
  }, [reference]);

  useEffect(() => {
    const control = new L.Control({ position: "topleft" });
    control.onAdd = () => {
      const div = L.DomUtil.create("div", "leaflet-bar");
      const a = L.DomUtil.create("a", "", div);
      a.href = "#";
      a.title = "最初の表示に戻る / Reset view";
      a.setAttribute("role", "button");
      a.setAttribute("aria-label", "最初の表示に戻る");
      a.textContent = "⊕";
      a.style.fontSize = "15px";
      L.DomEvent.on(a, "click", (e) => {
        L.DomEvent.preventDefault(e);
        L.DomEvent.stopPropagation(e);
        const r = refLatest.current;
        if (r) fitToReference(map, r);
      });
      L.DomEvent.disableClickPropagation(div);
      return div;
    };
    control.addTo(map);
    return () => {
      control.remove();
    };
  }, [map]);
  return null;
}

export default function CatalogMap({
  items,
  hoveredId,
  reference,
  onMarkerClick,
  onMarkerHover,
}: Props) {
  const withCoords = useMemo(() => items.filter((p) => p.coords), [items]);
  const containerRef = useRef<HTMLDivElement>(null);
  const tile = useMemo(() => mapTileConfig(), []);

  return (
    <div
      ref={containerRef}
      // Middle-button (wheel) click over the map would otherwise trigger the
      // browser's autoscroll, scrolling the whole page. Suppress its default.
      onMouseDown={(e) => {
        if (e.button === 1) e.preventDefault();
      }}
      // isolate: Leaflet の内部ペイン(tile/marker/tooltip/popup)は z-index
      // 200〜700 を持つが、.leaflet-container 自体は position:absolute の
      // くせに z-index:auto（=独自のスタッキングコンテキストを作らない）。
      // そのため、この z-index はここでせき止められず親の比較に漏れ出し、
      // ヘッダー(z-50)より高い値としてグローバルに競合し、スクロールで
      // マップがヘッダーの上に乗ってしまう。isolate でこの階層に確実に
      // 閉じ込める。
      className="relative isolate w-full h-full overscroll-contain border border-line bg-[#222] [&_.leaflet-container]:bg-[#222] [&_.leaflet-control-attribution]:text-[9px] [&_.leaflet-control-attribution]:bg-bg/60 [&_.leaflet-control-attribution]:text-muted [&_.leaflet-control-attribution_a]:text-muted"
    >
      <MapContainer
        // Initial center / zoom — ViewportFitter immediately recenters on `reference`
        // (Shibuya by default) at ~100 km radius, so these values are just a holdover
        // before the first effect runs.
        center={reference ? [reference.lat, reference.lng] : [35.6580, 139.7016]}
        zoom={10}
        // 地図上のホイールでズームできるようにする（ユーザー要望）。
        // ページのスクロールは地図外（フィルター/結果カード上）で行う。
        scrollWheelZoom={true}
        // absolute + inset-0: Leaflet fills the parent without contributing to its
        // intrinsic height, breaking the scroll-triggered layout feedback loop where
        // invalidateSize() would cause the grid cell to grow and overflow the header.
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        worldCopyJump
      >
        <TileLayer attribution={tile.attribution} url={tile.url} detectRetina />

        <ViewportFitter reference={reference} />
        <ResetViewControl reference={reference} />

        {/* Reference marker */}
        {reference && (
          <CircleMarker
            center={[reference.lat, reference.lng]}
            radius={7}
            pathOptions={{
              color: "#ffffff",
              weight: 2,
              fillColor: "#ffffff",
              fillOpacity: 0.85,
            }}
          >
            <Tooltip permanent direction="top" offset={[0, -8]} opacity={0.9}>
              <span style={{ fontFamily: "JetBrains Mono", fontSize: 10 }}>
                ⊕ {reference.label ?? "Reference"}
              </span>
            </Tooltip>
          </CircleMarker>
        )}

        {/* Property markers */}
        {withCoords.map((p) => {
          const active = p.id === hoveredId;
          return (
            <CircleMarker
              key={p.id}
              center={[p.coords!.lat, p.coords!.lng]}
              radius={active ? 11 : 6}
              pathOptions={{
                color: "#5ec8e8",
                weight: active ? 3 : 2,
                // 非アクティブは白地＋青枠（白青〇）。以前は暗色 #1a1a1a で
                // 地図上で黒丸に見えてしまっていた。
                fillColor: active ? "#5ec8e8" : "#ffffff",
                fillOpacity: active ? 0.95 : 1,
              }}
              eventHandlers={{
                click: () => onMarkerClick?.(p.id),
                mouseover: () => onMarkerHover?.(p.id),
                mouseout: () => onMarkerHover?.(null),
              }}
            >
              <Tooltip
                direction="top"
                offset={[0, -8]}
                opacity={0.95}
                permanent={active}
              >
                <span style={{ fontFamily: "JetBrains Mono", fontSize: 10 }}>
                  {p.title.slice(0, 30)}
                  {p.title.length > 30 ? "…" : ""}
                </span>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
