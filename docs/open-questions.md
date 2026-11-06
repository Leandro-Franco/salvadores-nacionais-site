# Pendências

Atualizado em 2026-11-03.

## Feito

- Inscrição grava no Postgres (`DATA_STORE=postgres`), sem duplicar mesmo com envios simultâneos.
- Rate limit compartilhado entre instâncias, no banco, com chave HMAC (IP nunca é gravado).
- RLS ligado em todas as tabelas; edição `belem-2026` criada com inscrições **fechadas** até aprovação.
  Legenda: **[DEV]** bloqueia código · **[P]** bloqueia publicar · **[C]** bloqueia vender.

## Para decidir agora

| #   | Pendência                                                  | Impacto                                                                                  | Hipótese adotada                                                                    |
| --- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | **Repositório GitHub** (D.2 respondeu "ok", sem URL) [DEV] | Sem ele não há CI, PRs nem deploy                                                        | Projeto criado localmente; subir para um repositório privado `salvadores-nacionais` |
| 2   | **Filas × DDoS (C.9)**                                     | Um broker externo aumenta custo e manutenção sem proteger contra DDoS                    | Inbox/outbox no PostgreSQL + WAF/rate limit da Vercel                               |
| 3   | **Recuperação: E.3 × F.2** [C]                             | PITR no Supabase é pago (add-on) e pesa no orçamento de R$ 200/mês                       | Backup diário agora; PITR só ao ligar vendas, se couber no orçamento                |
| 4   | **Orçamento R$ 200/mês (F.5)**                             | Vercel Pro (~US$ 20) + Supabase Pro (~US$ 25) + domínio já somam perto do teto, sem PITR | Validar custos reais em `docs/costs.md` (a fazer)                                   |

## Novo requisito registrado

- **Plano de metas (B.9):** barra que avança conforme os kits confirmados pelo PSP. Implementado com
  número ilustrativo (`DEMO_KITS_SOLD`); na Fase 3 passa a contar só pedidos confirmados (RF-12).

## Ajustes de escopo vindos da pauta

- **Kit (B.3):** kit padrão único (sem variantes), com **envio por frete calculado** além da retirada.
  A spec previa só retirada em Belém (N4.12); cálculo de frete precisa de provedor (ex.: Correios,
  Melhor Envio) — decidir antes da Fase 3. [C]
- **Administração (B.6):** só um administrador (o desenvolvedor) por enquanto. Papéis e convites ficam
  preparados, MFA continua obrigatório.
- **Nome "Rap sem Fome" (N1.2):** não aparece no site; o evento é "Salvadores Nacionais".
- **Primeiro lançamento (A.2):** página informativa **com inscrição**.

## Bloqueiam publicar (Fase 2)

- Nome oficial e edição (N1.1), data/horário (N1.4), local e coordenadas (N1.6–N1.8) [P]
- Line-up: bios e links dos artistas (N5) [P]
- Canal oficial de doação (Pix ou link da campanha) [P]
- Preço, fotos da estampa "estrela" e estoque da camiseta [C]
- Local e mapa: seção saiu da página até o local ser confirmado (N1.6–N1.8) [P]
- Causa, beneficiários e texto beneficente aprovados (N3.4, N3.9) [P]
- Regras de inscrição, responsável LGPD e retenção (N2.2, N6.4, N6.5) — necessárias antes de coletar
  inscrições reais
- CSP com nonce (hoje `script-src` permite `'unsafe-inline'`, exigido por página estática)
- Proteção de bots além do honeypot + rate limit (ex.: Vercel BotID ou Turnstile) — decidir antes de
  abrir inscrições reais
- Limpeza periódica de `rate_limit_buckets`: feita pela conciliação; depende do cron agendado
- Chaves do Google reCAPTCHA obrigatórias no checkout e aviso de privacidade citando o Google
  (`docs/decisions/0005-protecao-de-bots.md`)

## Bloqueiam vender (Fase 3)

- Gateway (C.6/F.7): **Mercado Pago Checkout Pro via Orders** (decidido em 2026-11-03). Código pronto e testado
  com provedor simulado; falta homologar no sandbox da conta recebedora. Ver `docs/decisions/0004-pagamentos.md`
- Vercel Pro antes de vender ou anunciar o kit à venda (Hobby proíbe uso comercial; doação é permitida), com o
  cron de conciliação a cada 5 min
- Consumidor da outbox (e-mail), tela de pedido, recuperação por e-mail e painel admin com MFA
- Prazo de reserva aprovado (hoje 30 min, valor de demonstração)
- Domínio remetente do e-mail (F.3)
- Itens N3, N4 e N6 do anexo da pauta
- Todos os itens de `SEGURANCA.md` e seção 19.3 da spec
