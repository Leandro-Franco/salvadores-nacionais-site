"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";

const TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION =
  process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ??
  '&copy; <a href="https://www.openstreetmap.org/copyright">colaboradores do OpenStreetMap</a>';

export default function MapCanvas({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const map = L.map(ref.current, { scrollWheelZoom: false }).setView([lat, lng], 15);
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
    L.circleMarker([lat, lng], {
      radius: 12,
      color: "#141217",
      weight: 3,
      fillColor: "#c8102e",
      fillOpacity: 1,
    })
      .addTo(map)
      .bindTooltip(label, { permanent: false });
    return () => {
      map.remove();
    };
  }, [lat, lng, label]);

  return <div ref={ref} className="h-full w-full" role="region" aria-label={`Mapa: ${label}`} />;
}
