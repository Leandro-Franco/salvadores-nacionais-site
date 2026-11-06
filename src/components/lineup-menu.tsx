"use client";

import Image from "next/image";
import { useState } from "react";
import type { Artist } from "@/content/schema";

/**
 * Character-select style line-up: picking a name in the menu (or using the
 * arrows) shows that artist's 3D character.
 */
export function LineupMenu({ artists }: { artists: Artist[] }) {
  const [current, setCurrent] = useState(0);
  if (artists.length === 0) return null;

  const artist = artists[current];
  const go = (delta: number) => setCurrent((i) => (i + delta + artists.length) % artists.length);
  const label = (a: Artist, i: number) =>
    a.confirmed ? a.name : `${String(i + 1).padStart(2, "0")} · ${a.name}`;

  return (
    <div className="mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <nav aria-label="Artistas da line-up" className="order-2 lg:order-1">
        <ul className="mx-auto w-fit space-y-1 lg:mx-0">
          {artists.map((a, i) => {
            const active = i === current;
            return (
              <li key={a.slug}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCurrent(i)}
                  className={`font-script group flex w-full items-baseline gap-3 py-1 text-left text-3xl whitespace-nowrap transition-opacity sm:text-4xl ${
                    active ? "opacity-100" : "opacity-50 hover:opacity-90"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`font-menu text-base ${active ? "visible" : "invisible"}`}
                  >
                    ▶
                  </span>
                  <span className={active ? "underline underline-offset-8" : ""}>{label(a, i)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="order-1 flex flex-col items-center lg:order-2">
        <div className="flex w-full items-center justify-center gap-4 sm:gap-10">
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Artista anterior"
            className="px-1 font-mono text-6xl transition-opacity hover:opacity-60 sm:text-8xl"
          >
            ‹
          </button>
          <div className="relative flex h-[min(50svh,460px)] w-[min(55vw,280px)] items-center justify-center">
            {artist.image ? (
              <Image
                key={artist.slug}
                src={artist.image}
                alt={artist.imageAlt ?? ""}
                fill
                sizes="(max-width: 640px) 55vw, 300px"
                className="animate-[sn-fade_.35s_ease-out] object-contain motion-reduce:animate-none"
              />
            ) : (
              <div className="font-script flex h-full w-full items-center justify-center border border-white/30 text-4xl text-white/60">
                Em breve
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Próximo artista"
            className="px-1 font-mono text-6xl transition-opacity hover:opacity-60 sm:text-8xl"
          >
            ›
          </button>
        </div>
        <p aria-live="polite" className="font-script mt-3 text-center text-4xl uppercase sm:text-5xl">
          {artist.confirmed ? artist.name : "A confirmar"}
        </p>
        <div className="mt-6 flex gap-3" aria-hidden="true">
          {artists.map((a, i) => (
            <span key={a.slug} className={`size-3 border border-white ${i === current ? "bg-white" : ""}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
