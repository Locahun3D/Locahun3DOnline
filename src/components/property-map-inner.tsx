"use client";

import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { mapTileConfig } from "@/lib/map-tiles";

/**
 * 単一物件の位置を示すミニ地図（詳細ページ ACCESS 用）。
 * デフォルトマーカー画像はバンドラで壊れがちなので CircleMarker のみ使用し、
 * leaflet 本体を直接 import しない（= モジュール読込時の window アクセスを回避）。
 * このコンポーネントは property-map.tsx から dynamic(ssr:false) で読み込む。
 */
export default function PropertyMapInner({
  lat,
  lng,
  label,
}: {
  lat: number;
  lng: number;
  label?: string;
}) {
  const tile = mapTileConfig();
  return (
    <div className="relative isolate w-full h-full border border-line bg-[#e9edf1] [&_.leaflet-container]:bg-[#e9edf1] [&_.leaflet-control-attribution]:text-[9px] [&_.leaflet-control-attribution]:bg-white/70 [&_.leaflet-control-attribution]:text-muted [&_.leaflet-control-attribution_a]:text-muted">
      <MapContainer
        center={[lat, lng]}
        zoom={15}
        scrollWheelZoom={false}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      >
        <TileLayer attribution={tile.attribution} url={tile.url} detectRetina />
        <CircleMarker
          center={[lat, lng]}
          radius={9}
          pathOptions={{
            color: "#2aa7c7",
            weight: 3,
            fillColor: "#2aa7c7",
            fillOpacity: 0.85,
          }}
        >
          {label && (
            <Tooltip permanent direction="top" offset={[0, -8]} opacity={0.95}>
              <span style={{ fontFamily: "JetBrains Mono", fontSize: 10 }}>
                {label.slice(0, 30)}
              </span>
            </Tooltip>
          )}
        </CircleMarker>
      </MapContainer>
    </div>
  );
}
