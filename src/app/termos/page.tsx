import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Termos de uso — Salvadores Nacionais" };

export default function Page() {
  return (
    <main id="conteudo" className="mx-auto max-w-3xl px-4 py-16">
      <Link href="/" className="nav-link underline">
        ← Voltar
      </Link>
      <h1 className="section-title mt-6">Termos de uso</h1>
      <div className="mt-6 space-y-4 text-lg">
        <p>
          Os termos de participação e de compra do kit serão publicados aqui antes da abertura das vendas.
        </p>
        <p>Este texto é provisório.</p>
      </div>
    </main>
  );
}
