"use client";

import Link from "next/link";
import { useActionState } from "react";
import { cancelCheckout, checkout, type CheckoutState } from "@/app/actions/checkout";
import { Recaptcha } from "./recaptcha";

const initial: CheckoutState = { status: "idle" };

/**
 * Collects only name and e-mail, then hands the buyer to the provider's hosted
 * checkout. Print and size come from the picker; the server re-validates them.
 */
export function CheckoutForm({ print, size }: { print: string; size: string | null }) {
  const [state, action, pending] = useActionState(checkout, initial);
  const [cancelState, cancelAction, canceling] = useActionState(cancelCheckout, initial);
  const errors = state.status === "invalid" ? state.fieldErrors : {};
  const values = state.status === "invalid" ? state.values : { name: "", email: "" };

  return (
    <form action={action} noValidate className="max-w-xl space-y-4" aria-describedby="checkout-status">
      <input type="hidden" name="print" value={print} />
      <input type="hidden" name="size" value={size ?? ""} />
      <div>
        <label htmlFor="buyer-name" className="block font-bold">
          Nome
        </label>
        <input
          id="buyer-name"
          name="name"
          autoComplete="name"
          required
          maxLength={80}
          defaultValue={values.name}
          aria-invalid={errors.name ? true : undefined}
          className="field"
        />
        {errors.name && <p className="field-error">{errors.name}</p>}
      </div>
      <div>
        <label htmlFor="buyer-email" className="block font-bold">
          E-mail
        </label>
        <input
          id="buyer-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          defaultValue={values.email}
          aria-invalid={errors.email ? true : undefined}
          className="field"
        />
        {errors.email && <p className="field-error">{errors.email}</p>}
      </div>
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="checkout-website">Não preencha</label>
        <input id="checkout-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <label className="flex items-start gap-3">
        <input name="acceptedTerms" type="checkbox" required className="mt-1 size-5 accent-white" />
        <span>
          Li os{" "}
          <Link href="/termos" className="underline">
            termos de compra
          </Link>{" "}
          e a{" "}
          <Link href="/privacidade" className="underline">
            política de privacidade
          </Link>
          .
        </span>
      </label>
      {(errors.acceptedTerms || errors.size || errors.print) && (
        <p className="field-error">{errors.size ?? errors.print ?? errors.acceptedTerms}</p>
      )}
      <Recaptcha resetKey={state} />
      <p id="checkout-status" role="status" className="min-h-6 font-bold">
        {state.status === "sold_out" && "Os kits esgotaram. Valeu pela força!"}
        {state.status === "closed" && "As vendas ainda não estão abertas."}
        {state.status === "limited" && "Aguarde 15 segundos antes de tentar de novo."}
        {state.status === "unavailable" &&
          "Não conseguimos abrir o pagamento agora. Tente de novo em instantes."}
        {state.status === "invalid" && "Confira os campos destacados."}
        {state.status === "bot_check" && "Marque a caixa “não sou um robô” e tente de novo."}
        {state.status === "in_progress" &&
          "Seu pagamento ainda está sendo aberto. Aguarde alguns segundos e tente de novo."}
        {cancelState.status === "canceled" && "Pedido anterior cancelado. Pode fazer um novo."}
        {cancelState.status === "in_progress" &&
          "Ainda não deu para cancelar o pedido anterior. Tente de novo em instantes."}
      </p>
      {state.status === "other_open_order" && cancelState.status !== "canceled" && (
        <div className="space-y-3 rounded-xl border border-white/60 p-4">
          <p>Você já tem um pedido em aberto com outra escolha.</p>
          {state.url && (
            <a href={state.url} rel="noopener noreferrer" className="pill px-5 py-2 text-xl">
              Continuar pagamento
            </a>
          )}
          <button
            type="submit"
            formAction={cancelAction}
            disabled={canceling}
            className="block text-sm underline"
          >
            {canceling ? "Cancelando…" : "Cancelar o pedido anterior"}
          </button>
        </div>
      )}
      <button type="submit" disabled={pending} className="pill w-full px-5 py-4 text-3xl sm:text-4xl">
        {pending ? "Abrindo pagamento…" : "Comprar kit"}
      </button>
      <p className="text-xs text-white/50">Pagamento por Pix ou cartão na página segura do Mercado Pago.</p>
    </form>
  );
}
