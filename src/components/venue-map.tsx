"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

const MapCanvas = dynamic(() => import("./map-canvas"), {
  ssr: false,
  loading: () => <p className="p-6 text-black">Carregando mapa…</p>,
});

type Props = { lat: number; lng: number; label: string };

/**
 * The interactive map loads only on request: it keeps the initial page light and
 * avoids contacting the tile provider before the visitor asks for it (spec §15).
 */
export function VenueMap(props: Props) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl border-2 border-white bg-black sm:aspect-video">
      {show ? (
        <MapCanvas {...props} />
      ) : (
        <button type="button" className="pill px-6 py-2 text-2xl" onClick={() => setShow(true)}>
          Abrir mapa interativo
        </button>
      )}
    </div>
  );
}
