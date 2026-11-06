"use client";

import { useActionState } from "react";
import { register, type RegisterState } from "@/app/actions/register";

const initial: RegisterState = { status: "idle" };

export function RegistrationForm() {
  const [state, action, pending] = useActionState(register, initial);

  if (state.status === "received") {
    return (
      <div role="status" className="rounded-xl border-2 border-white p-6">
        <p className="font-script text-4xl">Inscrição recebida!</p>
        <p className="mt-2">
          Valeu, salvador. Se este e-mail ainda não estava inscrito, ele entrou na lista desta edição. Os
          avisos chegam por e-mail.
        </p>
      </div>
    );
  }

  const errors = state.status === "invalid" ? state.fieldErrors : {};
  const values = state.status === "invalid" ? state.values : { name: "", email: "" };

  return (
    <form
      action={action}
      noValidate
      className="space-y-5 rounded-xl border-2 border-white p-6"
      aria-describedby="form-status"
    >
      <div>
        <label htmlFor="name" className="block font-bold">
          Nome
        </label>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          required
          maxLength={80}
          defaultValue={values.name}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? "name-error" : undefined}
          className="field"
        />
        {errors.name && (
          <p id="name-error" className="field-error">
            {errors.name}
          </p>
        )}
      </div>
      <div>
        <label htmlFor="email" className="block font-bold">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          defaultValue={values.email}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? "email-error" : undefined}
          className="field"
        />
        {errors.email && (
          <p id="email-error" className="field-error">
            {errors.email}
          </p>
        )}
      </div>
      {/* Honeypot for simple bots; hidden from people and assistive tech. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">Não preencha</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <div>
        <label className="flex items-start gap-3">
          <input
            name="acceptedRules"
            type="checkbox"
            required
            aria-invalid={errors.acceptedRules ? true : undefined}
            aria-describedby={errors.acceptedRules ? "rules-error" : undefined}
            className="mt-1 size-5 accent-white"
          />
          <span>
            Li as regras acima e concordo com o uso do meu nome e e-mail para avisos sobre o evento.
          </span>
        </label>
        {errors.acceptedRules && (
          <p id="rules-error" className="field-error">
            {errors.acceptedRules}
          </p>
        )}
      </div>
      <p id="form-status" role="status" className="min-h-6 font-bold">
        {state.status === "limited" && "Muitas tentativas seguidas. Espere alguns minutos e tente de novo."}
        {state.status === "closed" && "As inscrições desta edição ainda não estão abertas."}
        {state.status === "unavailable" && "Não conseguimos registrar agora. Tente novamente mais tarde."}
        {state.status === "invalid" && "Confira os campos destacados."}
      </p>
      <button type="submit" disabled={pending} className="pill w-full px-5 py-3 text-3xl">
        {pending ? "Enviando…" : "Quero me inscrever"}
      </button>
    </form>
  );
}
