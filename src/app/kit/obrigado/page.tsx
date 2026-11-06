import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pedido recebido — Salvadores Nacionais",
  robots: { index: false },
};

/**
 * Return page from the hosted checkout. It never says the payment is
 * confirmed: only the provider notification does that (spec RF-11).
 */
export default function Page() {
  return (
    <main id="conteudo" className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-5 py-16">
      <h1 className="font-script text-5xl sm:text-6xl">Valeu, salvador!</h1>
      <div className="mt-8 space-y-4 text-lg">
        <p>
          Estamos aguardando a confirmação do pagamento. Assim que ela chegar, você recebe um e-mail com os
          detalhes do seu kit.
        </p>
        <p className="text-white/70">
          Se o pagamento não for concluído, a reserva do kit é liberada automaticamente em 30 minutos.
        </p>
      </div>
      <Link href="/" className="pill mt-10 self-start px-8 py-2 text-2xl">
        Voltar ao site
      </Link>
    </main>
  );
}
