# CLAUDE.md — Bastidores da Sindicatura

Contexto e regras pra qualquer sessão futura do Claude trabalhar neste repositório.

## O projeto

Site institucional + sistema de captura de leads do **Bastidores da Sindicatura**, projeto editorial da Juliana Moreira (CEO Sindicompany / Condo Academy). Stack:

- **Static site** em `site/`, JSX renderizado no browser por Babel standalone (sem build step)
- **Netlify Functions v2** (`export default async (req) => Response`) em `netlify/functions/`
- **Netlify Blobs** como armazenamento (stores: `leads`, `leads-backup`, `cold-leads`, `cold-leads-summary`, `broadcasts`, `broadcast-recipients`, `broadcast-schedules`)
- **Resend** pra envio de e-mails (transacionais + disparo em massa)
- **Edge function** `serve-html` (`netlify/edge-functions/serve-html.ts`) intercepta pretty URLs

## Branch e deploy

- Trabalhe na branch da sessão (ex.: `claude/<slug>`).
- O Netlify deploya da branch **`main`**. Pra mudanças chegarem em produção, faça **fast-forward merge** da branch da sessão pra `main` e dê push em ambas. Sem PR (a usuária é não-técnica).
- Sempre que mexer em `site/admin/admin.jsx` ou `admin.css`, bumpe a query string `?v=...` em `site/admin/index.html` pra invalidar cache do browser dela.

## Regras invioláveis

### 1. Política de privacidade em TODO formulário de captura

**Toda página com formulário que captura dados pessoais DEVE ter, logo abaixo do botão de envio**, o consentimento:

> Ao se inscrever você aceita a [política de privacidade](/politica-de-privacidade/).

Padrão de markup:

```jsx
<p className="ck-micro" style={{marginTop: 6}}>
  Ao se inscrever você aceita a{' '}
  <a href="/politica-de-privacidade/" style={{color: 'var(--sand)', textDecoration: 'underline'}}>política de privacidade</a>.
</p>
```

Páginas que entregam material via download direto (sem capturar dados) não precisam. Páginas do MBA (sorteio) usam variação estendida com o regulamento:

> Ao se inscrever você aceita o [regulamento do sorteio](/regulamento-mba/) e a [política de privacidade](/politica-de-privacidade/).

### 2. Não renomear identificadores internos de origem

Cada material tem um **`origem`** salvo no banco (ex.: `'sorteio-mba'`, `'checklist'`, `'bombeiro'`). **Nunca renomeie** esses identificadores ao mudar uma URL pública. Mantém a continuidade dos cadastros e do histórico de disparos.

Exemplo: a URL `/sorteio-mba/` foi renomeada pra `/mba/`, mas o `origem: 'sorteio-mba'` continua o mesmo em `submit.mjs`, `admin.jsx`, broadcast templates etc.

### 3. Leads frios e quentes ficam separados

Stores diferentes (`leads` vs `cold-leads`), com lógica de merge **apenas dos frios**. Nunca aplicar merge nos quentes — instrução explícita da Juliana.

### 4. Horário sempre em Brasília (UTC-3)

Agendamento de disparos, formatação de datas pra UI, qualquer coisa visível. O fuso do navegador do operador é irrelevante. Helpers em `admin.jsx`: `fmtDate`, `brasiliaInputToUtcIso`.

### 5. Rate limit do Resend

Marketing Pro permite ~5 req/s. Disparos em massa usam **envio sequencial** com 250ms entre cada (~4 req/s constantes) pra evitar rajadas que tropeçam o limit. Não alterar sem motivo.

### 6. Página `/admin` é sensível a cache

Bug histórico: cache antigo do browser segurou versão quebrada do admin.jsx e travou tudo. Já tem `no-cache` em `netlify.toml` e query string `?v=...`. Toda mudança no admin precisa do bump da query string.

### 7. Controladora dos dados

**HubStation · CNPJ 32.932.966/0001-53** é a controladora dos dados pessoais coletados. Sempre que mencionar a empresa na política de privacidade, regulamentos, ou termos legais, use esse nome e CNPJ.

### 8. Área de Membros · botão flutuante em TODA página pública

A `/membros/` é a área restrita pra leads quentes (quem se cadastrou em qualquer formulário do site). **Toda página pública (atual e futura) DEVE incluir** o script global do botão flutuante, logo antes de `</body>`:

```html
  <script src="/bs-members-link.js" defer></script>
</body>
```

O script já trata: skip em `/admin/` e `/membros/`, troca de label quando o membro está logado, layout mobile.

**Quem é membro:** apenas leads quentes ativos (store `leads`, com `unsubscribed: false` e `ativo !== false`). Leads frios NÃO viram membros automaticamente — só depois que preencherem qualquer formulário do site.

**Login:** e-mail + senha (senha hasheada em scrypt na store `member-passwords`). Primeiro acesso passa por magic link de "Criar senha".

**Índice de e-mails:** a função background `members-email-index-build-background.mjs` constrói o blob `members-email-index/index` com mapeamento email → {id, nome}. Submit.mjs atualiza incrementalmente.

## Convenções

- **Português coloquial** em mensagens UI e nos commits (a Juliana lê tudo).
- **Sem emojis** em arquivos do código.
- **Cache-bust de assets do admin**: bumpe `?v=20260612X` (incrementa letra) em `site/admin/index.html` ao mudar `admin.jsx` ou `admin.css`.
- **Validar JSX antes de pushar**: babel cli vs babel-standalone do navegador podem divergir. Comando rápido:
  ```
  node -e "require('/tmp/node_modules/@babel/core').transformSync(require('fs').readFileSync('site/admin/admin.jsx','utf8'), {presets:['/tmp/node_modules/@babel/preset-react'], filename:'admin.jsx'}); console.log('OK')"
  ```
- **Funções Netlify de longa duração**: usar suffix `-background` no nome do arquivo pra ganhar 15min de runtime (ex.: `cold-leads-summary-build-background.mjs`).
- **Pre-bilt indices**: pra evitar timeout em loops sobre Netlify Blobs grandes (~14k cold leads), construir índice resumo num blob único via background function. Ver `cold-leads-summary-build-background.mjs` como referência.

## Disparo em massa (broadcast)

- Frontend pagina chamando `/api/broadcast` com `offset` + `limit=40` em loop, cap de 600 iterações (~24k destinatários).
- Botão **Continuar** no histórico retoma disparos incompletos via `resumeFrom: broadcastId`, mesmo broadcastId, ordenação determinística garante que não duplica.
- Pra incluir leads frios, **`cold-leads-summary`** precisa estar construído. Existe botão "Reconstruir índice" no painel de leads frios.
- **Footer obrigatório nos rascunhos**: todo rascunho de disparo (em `admin.jsx`, próximo a `MATERIAL_BROADCASTS`) DEVE terminar com `${DRAFT_FOOTER_HTML}` interpolado dentro do `<table>` do corpo. Esse rodapé tem 3 linhas: aviso de "recebendo este material por estar cadastrado em bastidoresdasindicatura.com.br", oferta de reduzir frequência / descadastrar (link `{{unsubscribe_url}}` que o backend troca por URL assinada por destinatário) e link da política de privacidade. Não criar rascunho novo com footer próprio — usar a constante.

## Formulários de captura existentes

| Página | Origem | Endpoint |
|--|--|--|
| `/checklist/` | `checklist` | submit.mjs |
| `/ebook-ia/` | `ebook-ia` | submit.mjs |
| `/sindico-profissional/` | `sindico-profissional` | submit.mjs |
| `/sobrevivencia-whatsapp/` | `sobrevivencia-whatsapp` | submit.mjs |
| `/50-frases/` | `50-frases` | submit.mjs |
| `/nr1/` | `nr1` | submit.mjs |
| `/conflitos/` | `conflitos` | submit.mjs |
| `/saude-mental/` | `saude-mental` | submit.mjs |
| `/gestao-sob-ataque/` | `gestao-sob-ataque` | submit.mjs |
| `/terceirizados/` | `terceirizados` | submit.mjs |
| `/carregadores/` | `carregadores` | submit.mjs |
| `/mba/` | `sorteio-mba` | submit.mjs |
| `/quiz/` | (por arquétipo) | submit.mjs |
| `/comprar-experience/` | `mentoria-paga` | stripe-webhook.mjs |
| `/comprar-executive/` | `mentoria-paga` | stripe-webhook.mjs |
| Home (mentoria) | `mentoria` | submit.mjs (via bs-form.jsx) |

Páginas de download direto (sem captura): `/bombeiro/` `/politico/` `/solitario/` `/burocrata/` `/estrategista/` `/sargento/`.

Lista completa de origens válidas em `netlify/functions/submit.mjs` — `VALID_ORIGENS`.

## Stripe (pagamento da Mentoria)

Pagamento integrado via Stripe Checkout. Páginas:
- `/comprar-experience/` · 12 aulas grupo · R$ 4.997 cartão (12x) ou R$ 4.497,30 Pix (10% off)
- `/comprar-executive/` · 12 grupo + 2 particulares · R$ 8.997 cartão (12x) ou R$ 8.097,30 Pix (10% off)

Após pagamento confirmado, `stripe-webhook.mjs`:
1. Cria/atualiza lead com `origem: 'mentoria-paga'`, `mentoria: true`, `mentoriaModalidade`
2. Atualiza cache `members-email-index` (libera Sala da Mentoria na hora)
3. Manda e-mail de boas-vindas com link de criar senha (`/membros/?action=set-password&t=...`)
4. Idempotência via chave `stripe:{sessionId}` no blob de leads (Stripe pode reenviar webhook)

**Variáveis de ambiente obrigatórias no Netlify:**
- `STRIPE_SECRET_KEY` (sk_live_... ou sk_test_...)
- `STRIPE_WEBHOOK_SECRET` (whsec_...)
- `STRIPE_PRICE_EXP_CARD` · price ID Experience cartão
- `STRIPE_PRICE_EXP_PIX` · price ID Experience Pix
- `STRIPE_PRICE_EXEC_CARD` · price ID Executive cartão
- `STRIPE_PRICE_EXEC_PIX` · price ID Executive Pix

Webhook configurado em Stripe Dashboard → Developers → Webhooks → endpoint:
`https://bastidoresdasindicatura.com.br/api/stripe-webhook`
Eventos: `checkout.session.completed`, `payment_intent.payment_failed`.
