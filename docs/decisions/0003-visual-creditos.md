# 0003 — Visual "tela de créditos" e menu da line-up

Data: 2026-11-03

## Decisão

- Referência visual principal: `referencias/index-new.html` + `salvadores-tailwind.zip` (enviados pelo
  organizador). Substitui o visual provisório de cartaz HQ.
- Fundo preto, texto branco, títulos em **Playball** (via `next/font`, auto-hospedada; sem dependência nova)
  e menu em Arial, como os créditos de um jogo antigo. Tokens só em `src/app/globals.css`.
- Página em telas, com pouca informação: Home → Sobre → Doação → Merch → Line up.
- Line-up como seleção de personagem: clicar no nome (ou nas setas) mostra o boneco 3D do artista.
  Imagens em `public/lineup/`, declaradas em `src/content/edition.ts`.

## Removido da página

Como participar, A causa, Kit (virou Merch), Local/mapa, Dúvidas, Plano de metas e Inscrição. Os dados ilustrativos dessas seções
saíram do conteúdo. `VenueMap`, `GoalPlan` e `RegistrationForm` (com a action de inscrição) continuam no código para voltar
quando o organizador pedir.

## Fora do escopo

- Vendas continuam desligadas: escolher estampa e tamanho é só prévia, sem carrinho.
- Doação: botão abre aviso até existir canal oficial (`links.crowdfunding`).
