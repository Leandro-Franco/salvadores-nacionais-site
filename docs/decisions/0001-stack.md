# 0001 — Stack inicial

Data: 2026-11-02 · Fonte: `PAUTA-PRE-DESENVOLVIMENTO.md` (Partes C e D)

| Camada              | Decisão                                                                            | Versão usada            |
| ------------------- | ---------------------------------------------------------------------------------- | ----------------------- |
| Framework           | Next.js App Router + React + TypeScript estrito                                    | Next 16.4.3, React 19.3 |
| Estilo              | Tailwind CSS                                                                       | 4.3                     |
| Validação           | Zod (ambiente, conteúdo, entradas)                                                 | 4.6                     |
| Banco               | PostgreSQL no Supabase via Drizzle ORM, migrações versionadas                      | drizzle-orm 0.45        |
| Login da equipe     | Supabase Auth com convite e MFA (só o administrador por enquanto)                  | — (Fase 3)              |
| Mapa                | Leaflet + tiles públicos do OpenStreetMap, carregado sob demanda                   | 1.9                     |
| E-mail transacional | Amazon SES                                                                         | — (Fase 3)              |
| Hospedagem          | Vercel Pro                                                                         | —                       |
| Logs e alertas      | Logs da Vercel; alertas para o desenvolvedor                                       | —                       |
| Analytics           | Nenhum por enquanto                                                                | —                       |
| Pacotes             | pnpm 10, Node 22 LTS                                                               | —                       |
| Testes              | Vitest; PostgreSQL descartável e Playwright quando houver fluxos de banco/checkout | Vitest 5.1              |
| CI                  | GitHub Actions: typecheck, lint, formatação, testes, build, audit, gitleaks        | —                       |
| Idioma              | Código em inglês, conteúdo em português do Brasil                                  | —                       |
| IA                  | typesafe-ai só como ferramenta de desenvolvimento; nenhuma IA no produto           | —                       |

## Observações

- **Filas (C.9):** a resposta pediu "um broker suficientemente preocupado com DDoS". Mantivemos a
  sugestão da spec (inbox/outbox no PostgreSQL) porque a proteção contra DDoS acontece antes da
  aplicação: firewall/WAF da Vercel + limites de requisição. Ver `open-questions.md`.
- **Recuperação (E.3 × F.2):** E.3 aceitou uma meta menor que RPO 15 min, mas F.2 pede backup diário
  com PITR (que é o que garante a meta maior e tem custo). Ver `open-questions.md`.
- `cacheComponents` vem ligado pelo template do Next 16; a página principal é pré-renderizada.
