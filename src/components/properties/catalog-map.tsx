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
 * Centers the map on the reference point with a ~50 km radius default view.
 *
 * 1° latitude ≈ 111 km. 1° longitude ≈ 111 × cos(lat) km.
 * So a 50 km half-box around `reference` ≈ ±0.45° lat × ±(50 / 111·cosφ)° lng.
 * Markers outside this box are still rendered — the user can pan / zoom out.
 *
 * Re-runs whenever the reference changes (preset click, geolocation, typed search),
 * which intentionally snaps the view back. If you want to add a manual "fit all
 * markers" button later, call map.fitBounds(items + reference) from a control.
 */
function ViewportFitter({ reference }: { reference: Props["reference"] }) {
  const map = useMap();
  useEffect(() => {
    if (!reference) return;
    const RADIUS_KM = 50;
    const latDelta = RADIUS_KM / 111;
    const lngDelta =
      RADIUS_KM / (111 * Math.cos((reference.lat * Math.PI) / 180));
    const bounds = L.latLngBounds(
      [reference.lat - latDelta, reference.lng - lngDelta],
      [reference.lat + latDelta, reference.lng + lngDelta],
    );
    map.fitBounds(bounds, { padding: [20, 20], animate: true });
  }, [reference, map]);
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

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full border border-line bg-[#222] [&_.leaflet-container]:bg-[#222] [&_.leaflet-control-attribution]:text-[9px] [&_.leaflet-control-attribution]:bg-bg/60 [&_.leaflet-control-attribution]:text-muted [&_.leaflet-control-attribution_a]:text-muted"
    >
      <MapContainer
        // Initial center / zoom — ViewportFitter immediately recenters on `reference`
        // (Shibuya by default) at ~100 km radius, so these values are just a holdover
        // before the first effect runs.
        center={reference ? [reference.lat, reference.lng] : [35.6580, 139.7016]}
        zoom={10}
        scrollWheelZoom
        style={{ width: "100%", height: "100%" }}
        worldCopyJump
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          subdomains={["a", "b", "c", "d"]}
        />

        <ViewportFitter reference={reference} />

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
                color: active ? "#ffb454" : "#ffb454",
                weight: active ? 3 : 1,
                fillColor: active ? "#ffb454" : "#1a1a1a",
                fillOpacity: active ? 0.95 : 0.9,
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
