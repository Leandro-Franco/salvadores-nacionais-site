import { editionContentSchema, type EditionContent } from "./schema";

/**
 * Content of the Belém edition.
 *
 * ⚠️ ILLUSTRATIVE DATA. Everything marked "ilustrativo" is a placeholder agreed
 * for the Phase 1 demo (see docs/open-questions.md). Replace each field with
 * approved information before publishing (spec §19.2).
 */
const raw: EditionContent = {
  synthetic: true,
  eventName: "Salvadores Nacionais",
  editionName: "Edição Belém",
  organizer: "Uma iniciativa de Franco The Sir",
  tagline: "Salvadores Nacionais: rap, solidariedade e uma noite para fazer a diferença.",
  city: "Belém",
  state: "PA",
  timeZone: "America/Belem",
  startsAt: null,
  gatesOpenAt: null,
  venue: {
    name: "Local ilustrativo (a confirmar)",
    address: "Endereço a confirmar — Belém, PA",
    lat: -1.4558,
    lng: -48.4902,
    arrivalNotes: [
      "As orientações de chegada, transporte e acessibilidade serão publicadas quando o local for confirmado.",
    ],
  },
  hero: { kicker: "Seja um", title: "Salvador Nacional" },
  about:
    "“Salvadores Nacionais” é um evento beneficente, que reúne as pessoas para arrecadação de alimentos e brinquedos em uma noite de muito rap.",
  donation: {
    title: "Adquira o merch ou faça uma doação e seja um salvador nacional.",
    pendingText:
      "O canal oficial de doação (Pix ou link da campanha) será publicado aqui em breve. Até lá, nenhuma doação é recebida por este site.",
  },
  registration: {
    open: true,
    rules: [
      "Regra ilustrativa: a inscrição registra seu interesse em participar desta edição.",
      "Pedimos apenas nome e e-mail, usados somente para avisos sobre o evento.",
      "Cada e-mail conta uma vez por edição.",
    ],
  },
  kit: {
    name: "Camiseta Salvadores Nacionais",
    pitch: "Adquirindo o merch você está custeando a ida dos artistas da line.",
    image: "/merch/camiseta.png",
    imageAlt: "Camiseta branca Salvadores Nacionais",
    prints: [
      { id: "logo", label: "Salvadores Nacionais" },
      { id: "estrela", label: "Estrela" },
    ],
    sizes: ["P", "M", "G", "GG", "XG"],
    priceCents: null,
    shipping: "Envio com frete calculado no checkout, além da retirada em Belém (condições a confirmar).",
  },
  goalPlan: {
    intro: "Cada kit confirmado empurra a barra. Quando uma meta é batida, ela é destravada para todo mundo.",
    milestones: [
      { kits: 50, title: "Meta 1 (ilustrativa)", description: "Estrutura básica do evento garantida." },
      { kits: 150, title: "Meta 2 (ilustrativa)", description: "Primeira entrega para a ação social." },
      { kits: 300, title: "Meta 3 (ilustrativa)", description: "Ampliação da ação social." },
    ],
  },
  artists: [
    {
      slug: "franco-the-sir",
      name: "Franco, The Sir!",
      confirmed: true,
      image: "/lineup/franco-the-sir.png",
      imageAlt: "Personagem 3D de Franco, The Sir",
    },
    {
      slug: "obelga",
      name: "OBELGA",
      confirmed: true,
      image: "/lineup/obelga.png",
      imageAlt: "Personagem 3D de OBELGA",
    },
    {
      slug: "majiis",
      name: "MAJIIS",
      confirmed: true,
      image: "/lineup/majiis.png",
      imageAlt: "Personagem 3D de MAJIIS",
    },
    {
      slug: "ian-trunks",
      name: "IAN TRUNKS",
      confirmed: true,
      image: "/lineup/ian-trunks.png",
      imageAlt: "Personagem 3D de IAN TRUNKS",
    },
    {
      slug: "ryuchi",
      name: "RYUCHI",
      confirmed: true,
      image: "/lineup/ryuchi.png",
      imageAlt: "Personagem 3D de RYUCHI",
    },
    {
      slug: "mdep",
      name: "M’DEP",
      confirmed: true,
      image: "/lineup/mdep.png",
      imageAlt: "Personagem 3D de M’DEP",
    },
    {
      slug: "chapuh",
      name: "CHAPUH",
      confirmed: true,
      image: "/lineup/chapuh.png",
      imageAlt: "Personagem 3D de CHAPUH",
    },
    {
      slug: "dney",
      name: "DNEY",
      confirmed: true,
      image: "/lineup/dney.png",
      imageAlt: "Personagem 3D de DNEY",
    },
  ],
  links: {
    crowdfunding: null,
    instagram: null,
    youtube: null,
  },
  contactEmail: null,
};

export const edition = editionContentSchema.parse(raw);
