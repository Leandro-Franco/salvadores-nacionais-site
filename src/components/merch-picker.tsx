"use client";

import Image from "next/image";
import { useState } from "react";
import type { Kit } from "@/content/schema";
import { CheckoutForm } from "./checkout-form";

/**
 * Merch picker. With sales closed, print and size are local UI state only;
 * with `salesOpen`, they feed the checkout form (the server re-checks
 * SALES_ENABLED and the price, so this flag only changes what is shown).
 */
export function MerchPicker({ kit, salesOpen }: { kit: Kit; salesOpen: boolean }) {
  const [print, setPrint] = useState(kit.prints[0].id);
  const [size, setSize] = useState<string | null>(null);
  const isDefaultPrint = print === kit.prints[0].id;

  return (
    <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-12">
      <div className="flex flex-col items-center">
        <div className="relative aspect-square w-full max-w-[570px]">
          <Image
            src={kit.image}
            alt={isDefaultPrint ? kit.imageAlt : `${kit.imageAlt} (foto da estampa escolhida em breve)`}
            fill
            sizes="(max-width: 1024px) 90vw, 570px"
            className={`object-contain transition-opacity ${isDefaultPrint ? "" : "opacity-40"}`}
          />
          {!isDefaultPrint && (
            <p className="font-script absolute inset-x-0 bottom-6 text-center text-3xl">Foto em breve</p>
          )}
        </div>
      </div>

      <div className="lg:border-l-2 lg:border-white/80 lg:pl-10 xl:pl-14">
        <h2 className="font-script mb-6 text-4xl leading-tight sm:text-5xl xl:text-6xl">{kit.name}</h2>
        <p className="mb-9 text-lg leading-snug font-extrabold tracking-tight uppercase sm:text-2xl">
          {kit.pitch}
        </p>

        <fieldset className="mb-8">
          <legend className="font-script mb-3 text-3xl sm:text-4xl">Estampa</legend>
          <div className="flex gap-3">
            {kit.prints.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={print === p.id}
                onClick={() => setPrint(p.id)}
                className="choice font-script min-h-24 w-36 rounded-xl p-3 text-2xl leading-tight sm:w-44"
              >
                {p.id === "estrela" ? (
                  <span className="text-5xl" aria-label={p.label}>
                    ★
                  </span>
                ) : (
                  p.label
                )}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="mb-10">
          <legend className="font-script mb-3 text-3xl sm:text-4xl">Tamanho</legend>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            {kit.sizes.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={size === s}
                onClick={() => setSize(s)}
                className="choice h-12 w-14 rounded-lg font-bold sm:w-16"
              >
                {s}
              </button>
            ))}
          </div>
        </fieldset>

        {salesOpen ? (
          <>
            {kit.priceCents !== null && (
              <p className="font-script mb-6 text-4xl">
                {(kit.priceCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </p>
            )}
            <CheckoutForm print={print} size={size} />
          </>
        ) : (
          <>
            <button type="button" disabled className="pill w-full max-w-xl px-5 py-4 text-3xl sm:text-4xl">
              Vendas em breve
            </button>
            <p className="mt-5 text-xs text-white/50">Prévia. Valores e envio serão publicados em breve.</p>
          </>
        )}
      </div>
    </div>
  );
}
