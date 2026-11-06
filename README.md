<h1 align="center">Salvadores Nacionais — site do evento</h1>

<p align="center">
  Site de um evento beneficente de rap (edição Belém): apresentação, line-up, inscrições e
  venda de merch com <b>Mercado Pago</b>. Feito em <b>Next.js 16 + TypeScript + PostgreSQL</b>.
</p>

<p align="center">
  <a href="https://github.com/Leandro-Franco/salvadores-nacionais-site/actions/workflows/ci.yml"><img src="https://github.com/Leandro-Franco/salvadores-nacionais-site/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/Next.js-16-informational" alt="Next.js 16">
  <img src="https://img.shields.io/badge/TypeScript-strict-informational" alt="TypeScript estrito">
  <img src="https://img.shields.io/badge/PostgreSQL-Drizzle-informational" alt="PostgreSQL + Drizzle">
  <img src="https://img.shields.io/badge/licen%C3%A7a-MIT-green" alt="MIT">
</p>

<p align="center"><a href="https://salvadores-nacionais.vercel.app"><b>Ver o site no ar →</b></a></p>

---

## O que é

O **Salvadores Nacionais** reúne artistas de rap numa noite para arrecadar alimentos
e brinquedos. O site apresenta o evento no visual de "tela de créditos", com a
line-up como uma seleção de personagens, e prepara o caminho para vender a
camiseta do evento, que custeia a ida dos artistas.

**Estado:** Fase 1, demonstração. Datas, local e números são ilustrativos e
aparecem marcados assim na página. As vendas estão desligadas (`SALES_ENABLED=false`)
até a homologação do pagamento.

## Diferenciais técnicos

| Destaque                          | Como foi feito                                                                                                                                                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pagamento sem SDK**             | Mercado Pago Checkout Pro pela API **Orders**, com três chamadas `fetch` para um host fixo e nenhuma dependência nova. Preço, kit e vendedor vêm só do servidor ([ADR 0004](docs/decisions/0004-pagamentos.md)). |
| **Webhook confiável**             | Assinatura HMAC-SHA256 conferida no mesmo formato do SDK oficial, processamento idempotente para reentregas e uma rota de reconciliação para o Vercel Cron, protegida por `CRON_SECRET`.                         |
| **Privacidade por padrão (LGPD)** | E-mail deduplicado por HMAC, IP nunca guardado em claro, e a mesma resposta para inscrição nova ou repetida — o site não revela quem já se inscreveu ([ADR 0002](docs/decisions/0002-data-store.md)).            |
| **Banco fechado**                 | Supabase com RLS ligado e **nenhuma** policy: as chaves públicas da API não leem nem escrevem nada. O acesso é só pelo servidor.                                                                                 |
| **Falha fechada**                 | Rate limit em Postgres com upsert atômico, reCAPTCHA v2 verificado no servidor: se o banco ou o Google falham, a ação é bloqueada, não liberada ([ADR 0005](docs/decisions/0005-protecao-de-bots.md)).           |
| **Sessão de visitante segura**    | Token opaco de 256 bits em cookie `__Host-` (`Secure`, `HttpOnly`, `SameSite=Lax`); o banco guarda só o SHA-256.                                                                                                 |
| **Tudo validado com Zod**         | Variáveis de ambiente, conteúdo editorial (no build) e toda entrada de formulário. Fora do ambiente local, a configuração insegura é recusada.                                                                   |
| **Pagamento trocável**            | Um adaptador simulado e o do Mercado Pago (`sandbox`/`live`) atrás da mesma interface: com `PAYMENTS_MODE=mock`, o site roda inteiro sem conta no Mercado Pago.                                                  |
| **CI completa**                   | Typecheck, lint, Prettier, testes (incluindo integração com Postgres real), build, `pnpm audit` e varredura de segredos com gitleaks.                                                                            |

## Como rodar

**Requisitos:** Node.js 22 LTS (`.nvmrc`) e pnpm 10 (`corepack enable`).

```bash
cp .env.example .env.local
pnpm install
pnpm dev            # http://localhost:3000
```

Sem nenhuma configuração extra, o site usa inscrições em memória e pagamento
simulado (`PAYMENTS_MODE=mock`).

### Configuração

Todos os segredos ficam vazios no [`.env.example`](.env.example). Em produção
eles vão para o cofre de variáveis da hospedagem, um conjunto por ambiente.

| Variável                                                                        | Para quê                                   | Como obter                                                                           |
| ------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------ |
| `DATA_STORE`                                                                    | `memory` (só local) ou `postgres`          | —                                                                                    |
| `DATABASE_URL`                                                                  | conexão do app, com privilégio mínimo      | Postgres local ou projeto Supabase (pooler, porta 6543)                              |
| `DATABASE_MIGRATION_URL`                                                        | só para migrações, nunca no runtime        | usuário dono das tabelas                                                             |
| `IDENTITY_HMAC_KEY`, `RATE_LIMIT_HMAC_KEY`                                      | HMAC de e-mail e de IP — chaves diferentes | `openssl rand -base64 32`                                                            |
| `PAYMENTS_MODE`                                                                 | `mock`, `sandbox` ou `live`                | —                                                                                    |
| `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `MERCADOPAGO_USER_ID` | pagamento e webhook                        | painel de desenvolvedor do Mercado Pago (no sandbox, o token de um usuário de teste) |
| `RECAPTCHA_SECRET_KEY`, `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`                        | caixa "não sou um robô" no checkout        | console do Google reCAPTCHA v2                                                       |
| `CRON_SECRET`                                                                   | autentica a rota de reconciliação          | `openssl rand -base64 32`                                                            |

### Com Postgres

1. Suba um Postgres local (ou um projeto Supabase de desenvolvimento).
2. `DATABASE_MIGRATION_URL=postgres://... pnpm db:migrate` — cria as tabelas, liga
   o RLS e cadastra a edição `belem-2026` **com inscrições fechadas**.
3. No `.env.local`: `DATA_STORE=postgres` e `DATABASE_URL=postgres://...`.

## Testes e qualidade

| Comando                                              | O que faz                                                                                |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `pnpm test`                                          | testes Vitest (regras de meta, inscrição, pagamento, reCAPTCHA)                          |
| `TEST_DATABASE_URL=postgres://... pnpm test`         | inclui a integração com Postgres — **use um banco descartável**, o teste recria o schema |
| `pnpm typecheck` / `pnpm lint` / `pnpm format:check` | tipos, lint e formatação                                                                 |
| `pnpm build`                                         | build de produção                                                                        |

## Estrutura

```
src/
  app/            páginas, layout, server actions, webhook e cron
  components/     seções e componentes de interface
  content/        conteúdo editorial versionado + schema Zod
  config/         validação das variáveis de ambiente
  domain/         regras puras (metas, inscrição, pedido)
  server/         repositórios, rate limit, sessão, pagamento, reCAPTCHA (só servidor)
db/               schema Drizzle e migrações SQL
docs/decisions/   registros de decisão (ADRs)
tests/            testes Vitest
```

## Como o projeto é organizado

- **Branches:** cada funcionalidade nasce numa branch própria e entra na `main`
  por pull request, com a CI verde.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/pt-br/) —
  `feat(payments): ...`, `feat(checkout): ...`.
- **Decisões:** cada escolha que não é óbvia vira um ADR em
  [`docs/decisions`](docs/decisions), com data e motivo.
- **Código em inglês, conteúdo em português do Brasil.**

## Sobre esta versão pública

Este repositório é um **retrato público** do projeto, que é desenvolvido num
repositório privado (estado da `main` em 06/11/2026). Ficaram de fora só as
instruções de ferramentas locais. Não há chave, senha ou token aqui: tudo vem de
variável de ambiente.

## Licença

O **código** está sob a licença [MIT](LICENSE) © 2026 Leandro Franco.

O nome do evento, a identidade visual e as imagens em `public/` (artistas e
merch) pertencem à organização do Salvadores Nacionais e **não** estão cobertos
pela licença MIT.

---

### In English

**Salvadores Nacionais** is the website for a charity rap event in Belém, Brazil,
built with **Next.js 16, React 19, strict TypeScript and PostgreSQL (Drizzle)**.
Highlights: Mercado Pago Checkout Pro through the Orders API without an SDK,
HMAC-verified idempotent webhooks plus a reconciliation cron; privacy by default
(HMAC-hashed e-mails and IPs, identical responses for new and repeated sign-ups);
Supabase with RLS on and no policies; fail-closed rate limiting and reCAPTCHA;
Zod validation of environment, content and input; and a CI pipeline with
typecheck, lint, formatting, tests against real Postgres, build, dependency audit
and gitleaks. This is a public snapshot of a private repository; all secrets come
from environment variables. Code is MIT-licensed; event branding and images are not.
