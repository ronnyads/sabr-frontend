# Login Page — Overrides

## Layout
- Grid 2 col (hero + painel), breakpoint 1024px colapsa para 1 col; esconder hero em <768px.
- Hero: gradiente brand; mesh decorativo; cards de estatísticas (3 col); feature cards opcional (2 col).
- Painel: largura 460–520px, card raio 20–24px, padding 28/32; toolbar superior com toggle de tema.

## Conteúdo
- Headline: “Sua operação de dropshipping escala aqui.”; ênfase em *dropshipping* com gradiente.
- Subhead: texto breve logístico.
- CTA primário: “Acessar painel”.
- Erro 401: “E-mail ou senha inválidos. Confira os dados e tente novamente.”
- Backend offline: usar mensagem do BACKEND_OFFLINE_MESSAGE (ver service), manter layout estável.
- Link “Esqueceu a senha?” → mailto suporte.

## Tema
- Light: hero com gradiente azul vivo; painel claro; links `--sabr-primary`.
- Dark: hero gradiente azul-profundo (#0b1940 → #070e22); painel `color-mix(surface 95%, transparent)`; bordas 0.10; texto-muted `#CBD5E1`.
- Glass tiles usam `surface 80%` + borda brand; hover aumenta opacidade.

## Estados
- Loading: botão mostra “Entrando...”, desabilita hover/active.
- Retry cooldown: mensagem “Aguarde Ns” já existente; manter cor primária.
- Toggle tema sempre visível quando darkModeV1 ativo (produção).

## Acessibilidade
- Foco visível em inputs e botões; `aria-label` no toggle; mensagens de erro com `role="alert"`.
- Evitar scroll horizontal em 375px; padding 20px no mobile.
