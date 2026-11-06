import Link from "next/link";
import { edition } from "@/content/edition";
import { DonationButton } from "@/components/donation-button";
import { LineupMenu } from "@/components/lineup-menu";
import { MerchPicker } from "@/components/merch-picker";

const nav = [
  ["#home", "Home"],
  ["#merch", "Merch"],
  ["#doacao", "Doação"],
  ["#lineup", "Line up"],
] as const;

export default function Home() {
  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/60 bg-black/95 backdrop-blur-md">
        <div className="mx-auto flex h-[70px] max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
          <a href="#home" className="font-script text-lg whitespace-nowrap sm:text-2xl">
            {edition.eventName}
          </a>
          <nav aria-label="Navegação principal">
            <ul className="flex items-center gap-3 sm:gap-6 lg:gap-8">
              {nav.map(([href, label], i) => (
                <li key={href} className={i === 0 ? "hidden sm:block" : undefined}>
                  <a className="nav-link" href={href}>
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      <main id="conteudo">
        <section id="home" className="screen flex flex-col items-center justify-center px-5 pt-[70px]">
          <h1 className="font-script text-center leading-[1.15]">
            <span className="block text-5xl sm:text-6xl md:text-7xl">{edition.hero.kicker}</span>
            <span className="block text-6xl sm:text-7xl md:text-[clamp(5rem,8.5vw,9rem)]">
              {edition.hero.title}
            </span>
          </h1>
        </section>

        <section id="sobre" className="screen flex items-center justify-center px-6 pt-[70px]">
          <p className="font-script max-w-6xl text-center text-3xl leading-[1.5] sm:text-5xl md:text-6xl">
            {edition.about}
          </p>
        </section>

        <section
          id="doacao"
          className="screen flex flex-col items-center justify-center gap-12 px-5 pt-[70px]"
        >
          <h2 className="font-script max-w-5xl text-center text-4xl leading-[1.3] sm:text-5xl md:text-7xl">
            {edition.donation.title}
          </h2>
          <div className="flex flex-wrap justify-center gap-4 sm:gap-8">
            <a href="#merch" className="pill px-7 py-3 text-2xl sm:px-10 sm:py-4 sm:text-4xl">
              <svg aria-hidden="true" className="size-7 sm:size-9" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 3 4 5 1 10l4 3 2-2v10h10V11l2 2 4-3-3-5-4-2c-.7 1.5-2 2.2-4 2.2S8.7 4.5 8 3Z" />
              </svg>
              Comprar merch
            </a>
            <DonationButton href={edition.links.crowdfunding} pendingText={edition.donation.pendingText} />
          </div>
        </section>

        <section id="merch" className="screen flex items-center px-5 pt-[115px] pb-16 sm:px-10">
          {/* Display only: the checkout action re-checks the validated SALES_ENABLED. */}
          <MerchPicker kit={edition.kit} salesOpen={process.env.SALES_ENABLED === "true"} />
        </section>

        <section
          id="lineup"
          className="screen flex flex-col items-center justify-center px-5 pt-[100px] pb-14"
        >
          <h2 className="sr-only">Line up</h2>
          <LineupMenu artists={edition.artists} />
        </section>
      </main>

      <footer className="border-t border-white/40 px-5 py-8 text-center text-xs text-white/60">
        <p>
          {edition.eventName} — evento beneficente · {edition.organizer}
        </p>
        {edition.synthetic && <p className="mt-2 text-white/40">Versão de demonstração.</p>}
        <ul className="font-menu mt-4 flex flex-wrap justify-center gap-6 tracking-[0.09em] uppercase">
          <li>
            <Link className="hover:underline" href="/termos">
              Termos
            </Link>
          </li>
          <li>
            <Link className="hover:underline" href="/privacidade">
              Privacidade
            </Link>
          </li>
          {edition.contactEmail && (
            <li>
              <a className="hover:underline" href={`mailto:${edition.contactEmail}`}>
                Contato
              </a>
            </li>
          )}
        </ul>
      </footer>
    </>
  );
}
