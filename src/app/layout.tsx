import type { Metadata, Viewport } from "next";
import { Inter, Playball } from "next/font/google";
import { edition } from "@/content/edition";
import "./globals.css";

const playball = Playball({
  variable: "--font-playball",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

const title = `${edition.eventName} — ${edition.hero.kicker} ${edition.hero.title.toLowerCase()}`;

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_BASE_URL ?? "http://localhost:3000"),
  title,
  description: edition.tagline,
  openGraph: { title, description: edition.tagline, locale: "pt_BR", type: "website" },
  // Keep the demo out of search engines until the public launch (Phase 2).
  robots: process.env.APP_ENV === "production" ? undefined : { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#000000" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${playball.variable} ${inter.variable} antialiased`}>
      <body className="min-h-screen">
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[60] focus:bg-white focus:p-3 focus:text-black"
        >
          Pular para o conteúdo
        </a>
        {children}
      </body>
    </html>
  );
}
