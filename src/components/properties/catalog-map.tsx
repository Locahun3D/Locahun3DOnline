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

function ViewportFitter({
  items,
  reference,
}: {
  items: Property[];
  reference: Props["reference"];
}) {
  const map = useMap();
  useEffect(() => {
    const pts: [number, number][] = items
      .filter((p) => p.coords)
      .map((p) => [p.coords!.lat, p.coords!.lng]);
    if (reference) pts.push([reference.lat, reference.lng]);
    if (pts.length === 0) return;
    if (pts.length === 1) {
      map.setView(pts[0], 11);
      return;
    }
    const bounds = L.latLngBounds(pts);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
  }, [items, reference, map]);
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
      className="relative w-full h-full border border-line bg-[#070707] [&_.leaflet-container]:bg-[#070707] [&_.leaflet-control-attribution]:text-[9px] [&_.leaflet-control-attribution]:bg-bg/60 [&_.leaflet-control-attribution]:text-muted [&_.leaflet-control-attribution_a]:text-muted"
    >
      <MapContainer
        center={[36.2, 138]}
        zoom={5}
        scrollWheelZoom
        style={{ width: "100%", height: "100%" }}
        worldCopyJump
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          subdomains={["a", "b", "c", "d"]}
        />

        <ViewportFitter items={withCoords} reference={reference} />

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
