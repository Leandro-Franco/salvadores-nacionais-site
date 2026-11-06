import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Política de privacidade — Salvadores Nacionais" };

export default function Page() {
  return (
    <main id="conteudo" className="mx-auto max-w-3xl px-4 py-16">
      <Link href="/" className="nav-link underline">
        ← Voltar
      </Link>
      <h1 className="section-title mt-6">Política de privacidade</h1>
      <div className="mt-6 space-y-4 text-lg">
        <p>
          Na inscrição coletamos apenas <strong>nome e e-mail</strong>, para enviar avisos sobre o evento. O
          e-mail é usado para evitar inscrições duplicadas e não é compartilhado para fins de marketing.
        </p>
        <p>
          Responsável pelos dados, contato de privacidade e prazos de retenção: <strong>a confirmar</strong>.
          Este texto é provisório e será revisado antes da coleta de dados reais.
        </p>
      </div>
    </main>
  );
}
