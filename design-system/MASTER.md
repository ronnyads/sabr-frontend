# Design System — SABR 3.0 (Login + Shell)

## Identidade
- **Paleta primária**: Azul royal `#2563EB` (light) / `#3B82F6` (dark)
- **Acento**: Verde `#059669` (light) / `#00E5A0` (dark)
- **Background**: Light `#FFFFFF` → `#F8FAFC`; Dark `#000` → `#0D0D0D`
- **Texto**: Light `#0F172A`; Muted `#64748B`; Dark `#F8FAFC`; Muted `#CBD5E1`
- **Bordas**: Light rgba(15,23,42,0.08); Dark rgba(255,255,255,0.10)
- **Gradiente de marca**: `linear-gradient(135deg, #2563EB 0%, #059669 100%)` (usa variáveis `--sabr-gradient-brand`)

## Tipografia
- **Título/hero**: Outfit 800 (ou Inter 800 fallback)
- **Corpo**: Inter 400–600
- **Botões**: Inter 700
- **Letter-spacing hero**: -2%

## Componentes-base
- **Card**: raio 16px, `--sabr-surface` com borda `--sabr-border`, sombra suave `--sabr-shadow-soft`; em hover usar `--sabr-shadow-hover`.
- **Input**: fundo `--sabr-surface-soft`, borda `--sabr-border`, foco `--sabr-primary`.
- **Botão primário**: gradiente de marca; texto branco; sombra brand em hover.
- **Links**: cor `--sabr-primary`, sublinhar no hover, foco visível (outline 2px `--sabr-primary`).
- **Glass tiles (hero stats)**: fundo `color-mix(surface 80%, transparent)`, borda `--sabr-border`, blur 16px.

## Tema
- Usa `data-theme="light|dark"` no `html` + `body.sabr-theme-{light,dark}`.
- Dark: reforçar contraste (texto-muted `#CBD5E1`, border 0.10, card fundo `#0D0D0D`).
- `color-scheme` definido pelo ThemeService (já aplica).

## Acessibilidade
- Contraste AA mínimo; botões e links com foco; inputs com label explícita.
- Evitar dependência apenas de cor para estados de erro (mensagem textual).

## Anti-patterns
- Não usar transparência <10% em fundo claro (fica ilegível).
- Não deixar links azuis sobre fundo azul sem sublinhado.
- Evitar sombras que mudam layout; usar translateY pequeno.
