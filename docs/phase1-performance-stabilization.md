# Fase 1 - Estabilizacao de Performance e Cache

## Escopo aplicado
- Frontend/build/cache apenas.
- Sem alteracao de schema SQL ou contratos de API.
- Publicacao mantida no fluxo atual (Lovable).
- PWA explicitamente desativado no build (`serviceWorker: false`).

## Baseline de build (antes)
Data: 2026-03-01

- Client (`npm run build:client`)
  - Initial total: `1.48 MB` (estimated transfer `260.33 kB`)
  - Chunk principal: `main.8034c3ebf963d686.js` (`1.12 MB`)
- Admin (`npm run build:admin`)
  - Initial total: `1.37 MB` (estimated transfer `234.28 kB`)
  - Chunk principal: `main.8b3000503099cfe1.js` (`1.02 MB`)

## Resultado apos ajustes
Data: 2026-03-01

- Client (`npm run build:client`)
  - Initial total: `1.39 MB` (estimated transfer `270.24 kB`)
  - Chunk principal: `main.bfcfb338a662b524.js` (`1.04 MB`)
  - Lazy chunks relevantes:
    - `client-publications-client-publication-wizard-page`: `152.78 kB`
    - `client-client-onboarding`: `58.39 kB`
    - `client-client-ml-integration`: `33.58 kB`
- Admin (`npm run build:admin`)
  - Initial total: `1.40 MB` (estimated transfer `269.03 kB`)
  - Chunk principal: `main.d989a1c96606898f.js` (`1.04 MB`)
  - Lazy chunks relevantes:
    - `admin-admin-products`: `43.16 kB`
    - `clients-clients`: `24.96 kB`
    - `admin-admin-categories`: `20.68 kB`

## Mudancas implementadas
- Roteamento convertido para `loadComponent` em client/admin.
- Indicador global de carregamento de rota lazy (barra superior).
- Observabilidade adicionada:
  - `@sentry/browser` (captura de erro + breadcrumbs de navegacao)
  - `web-vitals` (LCP/INP/CLS com envio para Sentry quando DSN estiver configurado)
- TTL de cache de listas padronizado:
  - `CatalogService`
  - `MyProductsService`
  - Valor default: `30s` (`environment.dataCache.listTtlMs`)

## Canary interno (checklist)
1. Configurar `environment.production.ts` com `observability.sentryDsn`.
2. Publicar para grupo interno (admin/suporte) por 24-48h.
3. Validar no Sentry:
   - erros JS por rota
   - eventos `web-vital` com tags `realm` e `route`
4. Validar navegacao:
   - login -> dashboard sem travamento
   - modulos lazy abrindo sem erro de chunk
5. Confirmar sem SW ativo no browser:
   - `navigator.serviceWorker.getRegistrations()`
   - esperado: array vazio

## Criterios de aceite
1. Sem relato de cache antigo (stale) no canary.
2. Sem aumento de erro JS no periodo de observacao.
3. Fluxos criticos funcionando (auth, dashboards, cadastros, publicacoes).
4. Bundle inicial sem regressao severa e com carregamento lazy ativo.
