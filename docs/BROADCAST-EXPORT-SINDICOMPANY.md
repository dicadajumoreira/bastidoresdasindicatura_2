# Handoff · Exportar disparador de e-mail pro site Sindicompany

**Este documento é o briefing completo pro Claude Code do repo `dicadajumoreira/sindicompanysite` executar a implantação do sistema de disparo de e-mail com fluxo double opt-in adaptado pra Sindicompany.**

Origem: `dicadajumoreira/bastidoresdasindicatura_2` (branch `main`)
Destino: `dicadajumoreira/sindicompanysite`
Autora: Juliana Moreira · Sindicompany

---

## 0 · Contexto de negócio (leitura obrigatória)

**Marca:** Sindicompany · sindicatura profissional · sindicompany.com.br
**Papel legal:** A Sindicompany é síndica profissional dos condomínios geridos → é **controladora dos dados** dos moradores (LGPD art. 5º VI), com base legal do art. 7º V (execução de contrato via convenção condominial).

**Objetivo:** Importar bases de moradores dos condomínios geridos (~100k pessoas) e disparar comunicação institucional + educativa + comercial da Sindicompany por e-mail.

**Restrição LGPD:** Ser controladora não autoriza cross-marketing automático. Por isso o sistema opera com **double opt-in em 4 tentativas** — só quem confirmar explicitamente entra na base de disparo real. Base bruta importada nunca é usada pra broadcast direto.

**Volume esperado:**
- Base importada: ~100.000 moradores
- Base final "verified" esperada: 15.000-25.000 (15-25% conversão típica de double opt-in)
- Disparos mensais: 4-8 broadcasts

**Serviços externos obrigatórios:**
- Netlify (hosting + Blobs + Background Functions) — Sindicompany já hospeda aqui
- Resend Business (~$85-90/mês pra 100k contatos + 100k envios/mês)
- Domínio sindicompany.com.br com SPF+DKIM+DMARC configurados no Resend

---

## 1 · Arquitetura geral

```
┌─────────────────────────────────────────────────────────────┐
│  ADMIN /admin  (React JSX no browser, sem build)            │
│  ├─ BroadcastPanel · compositor + histórico + polling       │
│  ├─ ImportPanel · upload CSV de moradores                   │
│  ├─ OptinPanel · funil verified/pending/declined            │
│  └─ MATERIAL_BROADCASTS · rascunhos prontos                 │
└─────────────────┬───────────────────────────────────────────┘
                  │ Bearer token (JWT-like)
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  NETLIFY FUNCTIONS (Node 20, ESM)                           │
│                                                              │
│  Broadcast core (7 funções):                                 │
│  ├─ broadcast.mjs · worker envia 40 emails por chamada      │
│  ├─ broadcast-run-background.mjs · orquestrador (15 min)    │
│  ├─ broadcast-start.mjs · trigger inicial                   │
│  ├─ broadcast-delete.mjs · exclusão limpa                   │
│  ├─ broadcast-history.mjs · lista histórico                 │
│  ├─ broadcast-recipients.mjs · logs por destinatário        │
│  └─ broadcast-sweeper-background.mjs · cron 1min self-heal  │
│                                                              │
│  Opt-in core (novo · Sindicompany):                          │
│  ├─ import-csv.mjs · upload/parse/dedupe                    │
│  ├─ optin-send-batch.mjs · dispara próxima tentativa        │
│  ├─ optin-attempts-cron-background.mjs · cron diário        │
│  ├─ optin-confirm.mjs · endpoint do clique "Sim"            │
│  ├─ optin-decline.mjs · endpoint do clique "Não"            │
│  └─ resend-sync-background.mjs · sync com Audiences         │
│                                                              │
│  Libs compartilhadas:                                        │
│  ├─ auth-token.mjs · JWT-like sign/verify                   │
│  ├─ leads-index.mjs · indexação de Blobs (100k-ready)       │
│  ├─ email-resend.mjs · sendOne + makeUnsubscribeUrl         │
│  └─ broadcast-footer.mjs · rodapé HTML padrão               │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  STORAGE (Netlify Blobs)                                     │
│                                                              │
│  Broadcast:                                                  │
│  ├─ broadcasts/{id} · registro de cada disparo              │
│  ├─ broadcast-recipients/{id}__{offset} · logs por batch    │
│  └─ broadcast-schedules/{id} · agendamentos pendentes       │
│                                                              │
│  Leads Sindicompany (novos):                                 │
│  ├─ sindicompany-leads-pending/{id} · importado, sem resp.  │
│  ├─ sindicompany-leads-verified/{id} · opt-in confirmado    │
│  ├─ sindicompany-leads-declined/{id} · opt-out ou timeout   │
│  ├─ sindicompany-optin-attempts/{email} · state por email   │
│  └─ sindicompany-condominios/{slug} · metadata de condom.   │
│                                                              │
│  Auditoria:                                                  │
│  └─ optin-audit-logs/{ts}__{rand} · cada opt-in com          │
│     data/IP/token/user-agent (prova em auditoria LGPD)      │
└─────────────────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  APIs EXTERNAS                                                │
│  ├─ Resend · envio (5 req/s, 4 req/s constantes usados)      │
│  └─ Resend Audiences · sync bidirecional de contatos         │
└─────────────────────────────────────────────────────────────┘
```

---

## 2 · Arquivos a copiar do Bastidores

Todos os arquivos estão em `dicadajumoreira/bastidoresdasindicatura_2` na branch `main`. Base URL raw:
`https://raw.githubusercontent.com/dicadajumoreira/bastidoresdasindicatura_2/main/`

### Grupo A · Backend (copiar 1:1, ajustar hardcodes marcados)

| Arquivo destino | Arquivo origem | Ajuste |
|---|---|---|
| `netlify/functions/broadcast.mjs` | `netlify/functions/broadcast.mjs` | `FROM`, `MATERIAL_NAMES` |
| `netlify/functions/broadcast-run-background.mjs` | idem | nenhum |
| `netlify/functions/broadcast-start.mjs` | idem | nenhum |
| `netlify/functions/broadcast-delete.mjs` | idem | nenhum |
| `netlify/functions/broadcast-history.mjs` | idem | nenhum |
| `netlify/functions/broadcast-recipients.mjs` | idem | nenhum |
| `netlify/functions/broadcast-sweeper-background.mjs` | idem | nenhum |
| `netlify/lib/auth-token.mjs` | idem | nenhum |
| `netlify/lib/leads-index.mjs` | idem | **REESCREVER** pra suportar 100k (paginação otimizada) |
| `netlify/lib/email-resend.mjs` | idem | `FROM`, `ADMIN_TO`, `SITE`, `MATERIALS` (esvaziar ou adaptar) |
| `netlify/lib/broadcast-footer.mjs` | idem | textos + links de marca |

### Grupo B · Frontend

| Arquivo destino | Arquivo origem | Ajuste |
|---|---|---|
| `site/admin/admin.jsx` (BroadcastPanel section) | `site/admin/admin.jsx` linhas ~5100-6090 aprox | `MATERIAL_BROADCASTS` (esvaziar ou adaptar), cores/paleta se diferentes, textos |
| `site/admin/admin.css` | idem | manter, ou adaptar paleta Sindicompany |
| `site/admin/index.html` | idem | favicon + title |

### Grupo C · Config Netlify

| Arquivo | Ajuste |
|---|---|
| `netlify.toml` | adicionar `[[edge_functions]]` da landing `/opt-in/` + `[functions]` timeout config |

### Grupo D · Novos arquivos exclusivos Sindicompany

**Backend (novos):**
- `netlify/functions/import-csv.mjs`
- `netlify/functions/optin-send-batch.mjs`
- `netlify/functions/optin-attempts-cron-background.mjs`
- `netlify/functions/optin-confirm.mjs`
- `netlify/functions/optin-decline.mjs`
- `netlify/functions/resend-sync-background.mjs`
- `netlify/functions/optin-audit-log.mjs` (leitura de auditoria pro admin)

**Frontend (novos):**
- `site/opt-in/index.html` · página confirmação/descadastro
- `site/opt-in-confirmado/index.html` · página sucesso
- `site/opt-in-descadastrado/index.html` · página opt-out
- Novas seções no admin: `ImportPanel`, `OptinFunnelPanel`, `CondominiosPanel`

---

## 3 · Variáveis de ambiente (Netlify)

Configurar em: `Site settings → Environment variables` (Sindicompany site no Netlify).

| Variável | Como obter | Notas |
|---|---|---|
| `RESEND_API_KEY` | Resend dashboard → API Keys | Business tier · $85+/mês |
| `AUTH_SECRET` | Gerar string aleatória 64+ chars | `openssl rand -hex 32` |
| `RESEND_AUDIENCE_ID` | Resend → Audiences → criar "Sindicompany Verified" | UUID |
| `RESEND_FROM_EMAIL` | `contato@sindicompany.com.br` (ou similar) | Domínio precisa estar verificado no Resend |
| `RESEND_FROM_NAME` | `Sindicompany` | display name |
| `SITE_URL` | `https://sindicompany.com.br` | usado em unsubscribe URLs e links |
| `OPTIN_TOKEN_TTL_DAYS` | `90` | validade do link de opt-in |

Domínio no Resend precisa ter DNS configurado antes de qualquer envio:
- **SPF:** `v=spf1 include:_spf.resend.com ~all`
- **DKIM:** Resend dá 3 records CNAME automaticamente ao verificar
- **DMARC:** `v=DMARC1; p=none; rua=mailto:dmarc@sindicompany.com.br` (relaxado no início, apertar depois)

---

## 4 · Hardcodes de marca a substituir

Buscar/substituir globalmente ao copiar cada arquivo:

| De (Bastidores) | Para (Sindicompany) | Onde |
|---|---|---|
| `Bastidores da Sindicatura` | `Sindicompany` | todo lugar |
| `bastidoresdasindicatura.com.br` | `sindicompany.com.br` | todo lugar |
| `contato@dicadajumoreira.com.br` | `contato@sindicompany.com.br` (definir) | `FROM`, `ADMIN_TO`, `reply_to` |
| `@dicadajumoreira` (Instagram/YouTube) | `@sindicompanybr` | footers de e-mail |
| `#B89579` (sand) | paleta Sindicompany | CSS admin, footers HTML |
| `#1A1C29` (onix) | paleta Sindicompany | CSS admin, footers HTML |
| `Bodoni Moda` (font-display) | tipografia Sindicompany | CSS |
| Reagentes de `MATERIALS` | esvaziar ou substituir por serviços Sindicompany | `email-resend.mjs` |
| Rascunhos `MATERIAL_BROADCASTS` | esvaziar ou criar novos | `admin.jsx` |
| `/politica-de-privacidade/` | verificar se existe em sindicompany.com.br | footers |
| `/membros/` | remover (não existe em Sindicompany) ou adaptar | links |

**Dica pro Claude do Sindicompany:** olhar o skill `site-sindicompany` e `sindicompany-brand-book` (deve existir na sessão) pra pegar paleta oficial, tipografia, tom de voz.

---

## 5 · Fluxo double opt-in (spec completa)

### 5.1 · Regras invioáveis
- Base importada NUNCA é usada pra broadcast direto
- Só entra na base "verified" quem clicar explicitamente em "Sim, quero receber"
- Clique em "Não, obrigada" → exclusão IMEDIATA e permanente do email (vai pra `sindicompany-leads-declined` com flag `optout: true`)
- Sem resposta em 4 tentativas → exclusão automática (`declined` com flag `timeout: true`)
- Cada opt-in registra: data, IP, user-agent, token (prova em auditoria LGPD)

### 5.2 · Cronograma das 4 tentativas

| # | Dia | Ângulo | Assunto |
|---|---|---|---|
| 1 | D+0 | Institucional, apresenta a Sindicompany | *"[Nome], podemos manter contato com você?"* |
| 2 | D+7 | Lembrete gentil + preview do valor | *"[Nome], não recebemos sua resposta ainda…"* |
| 3 | D+14 | Oferta de valor · guia gratuito de brinde | *"Um material gratuito pra você, morador de condomínio"* |
| 4 | D+21 | Última chance, tom direto | *"[Nome], vamos remover seu e-mail em 10 dias"* |
| ⊘ | D+31 | Exclusão automática de quem não respondeu | *(nenhum envio)* |

### 5.3 · Estados do lead

Cada email na base tem uma entrada em `sindicompany-optin-attempts/{email}`:
```json
{
  "email": "morador@exemplo.com",
  "nome": "Fulano da Silva",
  "condominio": "Ed. Exemplo",
  "importadoEm": "2026-09-01T10:00:00Z",
  "tentativa": 2,
  "ultimoEnvio": "2026-09-08T10:00:00Z",
  "proximoEnvioEm": "2026-09-15T10:00:00Z",
  "respondeu": false,
  "respostaTipo": null,
  "respostaEm": null,
  "status": "pending"
}
```

Estados possíveis:
- `pending` · aguardando próximo envio ou resposta
- `verified` · clicou "Sim" · move pra `sindicompany-leads-verified`
- `declined-optout` · clicou "Não" · move pra `sindicompany-leads-declined`
- `declined-timeout` · não respondeu em 4 tentativas · move pra `declined`
- `bounced` · Resend retornou hard bounce · move pra `declined`

### 5.4 · Motor de tentativas (cron diário)

`optin-attempts-cron-background.mjs` roda diariamente às 10h BRT:

```
1. Lista todos os leads em `pending`
2. Filtra os com `proximoEnvioEm <= agora`
3. Filtra os com `tentativa < 4`
4. Pra cada um, dispara `optin-send-batch` com a tentativa atual
5. Respeita throttle configurável (warmup):
   - Semana 1: máx 500 envios/dia
   - Semana 2: máx 2.000/dia
   - Semana 3: máx 5.000/dia
   - Semana 4: máx 20.000/dia
   - Semana 5+: sem limite (5 req/s do Resend)
```

Cron config em `netlify.toml`:
```toml
[[functions]]
  schedule = "0 10 * * *"  # 10h todos os dias
  path = "optin-attempts-cron-background"
```

### 5.5 · Endpoints de resposta

**`/api/optin-confirm?t=<token>`** (GET)
1. Verifica token válido (JWT com email + exp)
2. Move lead de `sindicompany-leads-pending/{id}` pra `sindicompany-leads-verified/{id}`
3. Marca `sindicompany-optin-attempts/{email}` como `verified`
4. Grava em `optin-audit-logs/` (data, IP, UA, token)
5. Adiciona no Resend Audiences (via `resend-sync-background`)
6. Redireciona pra `/opt-in-confirmado/?nome=<nome>`

**`/api/optin-decline?t=<token>`** (GET)
1. Verifica token válido
2. Move pra `sindicompany-leads-declined` com `optout: true`
3. Marca attempts como `declined-optout`
4. Remove do Resend Audiences (se estiver)
5. Grava em `optin-audit-logs/`
6. Redireciona pra `/opt-in-descadastrado/`

### 5.6 · Templates dos 4 e-mails de opt-in

Estrutura HTML padrão de todos:
```
[Header: logo Sindicompany + linha divisória]
[Corpo específico da tentativa]
[Box com 2 CTAs: SIM / NÃO — cores contrastantes]
[Divisor]
[P.S. explicando LGPD e por que estamos falando com você]
[Footer institucional com endereço físico e link política]
```

Textos base pra cada tentativa (adaptar no Claude do Sindicompany):

**Tentativa 1 · D+0**
> Olá [nome], somos a Sindicompany, responsável pela sindicatura do seu condomínio. Como controladora dos dados dos moradores (LGPD art. 5º VI), coletamos seu e-mail no ato do cadastro. Queremos te enviar comunicados oficiais, conteúdos práticos de convivência e novidades do mercado condominial que podem te ajudar como morador. Podemos manter contato?

**Tentativa 2 · D+7**
> [nome], ainda não recebemos sua resposta sobre receber nossos conteúdos. É rapidinho — 1 clique e você entra na lista. Uma vez por mês, no máximo, mandamos os comunicados mais importantes e algumas dicas práticas. Se preferir não receber, também é 1 clique.

**Tentativa 3 · D+14**
> Sabia que 8 em cada 10 moradores não conhecem seus direitos na convenção do próprio condomínio? Preparamos um guia gratuito em PDF: "10 direitos que todo morador tem" (baixa direto, sem cadastro). É nosso presente pra você conhecer nosso trabalho antes de decidir se quer continuar recebendo. **[Baixar o guia grátis]**
> Depois de ler, se quiser continuar nas nossas comunicações: **[Sim, quero receber]** ou **[Não, obrigada]**

**Tentativa 4 · D+21**
> [nome], essa é a última mensagem que vamos te mandar sem sua confirmação. Se você não responder em 10 dias, seu e-mail sai automaticamente da nossa lista — em respeito à LGPD e à sua caixa. Se quiser ficar: **[Sim, quero receber]**. Se prefere sair: **[Não, obrigada]**. Qualquer dos dois cliques resolve.

Botões (assinados):
- `Sim`: `${SITE_URL}/api/optin-confirm?t=${jwt({email, exp: 90d})}`
- `Não`: `${SITE_URL}/api/optin-decline?t=${jwt({email, exp: 90d})}`

---

## 6 · Import CSV de moradores (spec)

### 6.1 · Formato esperado do CSV

Colunas obrigatórias:
- `nome` (string, obrigatório)
- `email` (string, obrigatório, único)
- `condominio` (string, obrigatório — nome ou slug do condomínio)

Colunas opcionais (extras vão pro `raw` do lead):
- `unidade`, `bloco`, `telefone`, `cpf`, `tipo` (morador/proprietário/inquilino/conselheiro)

Encoding: UTF-8 (fallback ISO-8859-1 se detectar caracteres estranhos).
Separador: vírgula ou ponto-e-vírgula (auto-detect).

### 6.2 · Fluxo do import

`POST /api/import-csv` (multipart/form-data com arquivo)

```
1. Parse CSV com PapaParse (biblioteca) ou custom parser leve
2. Valida colunas obrigatórias
3. Normaliza emails (lowercase, trim)
4. Dedupe interno do CSV
5. Pra cada linha:
   a. Checa se email já existe em pending/verified/declined
   b. Se existe em declined → PULA (respeita opt-out permanente)
   c. Se existe em verified → PULA (já está na base)
   d. Se existe em pending → atualiza dados sem resetar tentativas
   e. Se novo → cria em `sindicompany-leads-pending/{id}` + `sindicompany-optin-attempts/{email}` com tentativa=0
6. Cria/atualiza `sindicompany-condominios/{slug}` com contadores
7. Retorna resumo: {importados, atualizados, pulados_declined, pulados_verified, erros}
```

### 6.3 · UI (ImportPanel no admin)

- Botão "Importar planilha"
- Drag-and-drop de CSV
- Preview das primeiras 5 linhas com mapeamento de colunas
- Selector: "Este arquivo é de qual condomínio?" (dropdown com condomínios existentes + opção "novo")
- Botão "Importar" → mostra progress bar (POST paginado se > 5k linhas)
- Sumário pós-import com contadores

---

## 7 · Sync com Resend Audiences

### 7.1 · Setup no Resend
1. Criar Audience "Sindicompany Verified" no Resend Dashboard
2. Copiar o UUID → env var `RESEND_AUDIENCE_ID`

### 7.2 · Sync bidirecional (`resend-sync-background.mjs`)

Roda 2x/dia (cron 9h e 21h BRT):

**Sindicompany → Resend:**
- Lista todos os leads em `sindicompany-leads-verified` sem `resendContactId`
- Pra cada um, chama `POST /audiences/{id}/contacts` com `{email, first_name, last_name, unsubscribed: false}`
- Grava `resendContactId` no lead

**Resend → Sindicompany:**
- Lista todos os contatos do Audience via `GET /audiences/{id}/contacts` (paginado)
- Pra cada contato com `unsubscribed: true` → move o lead correspondente pra `sindicompany-leads-declined` com flag `optout-external: true`

### 7.3 · Vantagem
- Disparos em massa podem usar Resend Broadcast (nativo) em vez da nossa lógica custom, se quiser (mais rápido, mas menos flexível)
- Se alguém clica "unsubscribe" em qualquer e-mail do Resend, sistema respeita
- Métricas de open/click sincronizadas

---

## 8 · Escalonamento pra 100k

### 8.1 · Reescrita do `leads-index.mjs`

Versão atual (Bastidores) foi feita pra 14k leads. Pra 100k, ela vai timeoutar. Reescrever com:

1. **Índice pré-computado em blob único**: `sindicompany-leads-index/summary` — atualizado por background function após cada import ou mudança de status. Contém só `[{id, email, nome, status, condominio}]` compactado.
2. **Broadcast lê o index** em vez de escanear blob-por-blob (1 read vs 100k reads).
3. **Rebuild do index** rodando em background function separada, chamada:
   - Após cada import CSV
   - Após cada mudança de status significativa (opt-in confirmado, etc.)
   - Diariamente pelo cron pra garantir consistência

### 8.2 · Ajuste no `broadcast-run-background.mjs`

Sistema atual encadeia auto (14min por chunk). Pra 100k emails a 4 req/s = ~7 horas de disparo. Isso são ~30 chunks encadeados. Ajustes:

- Manter auto-encadeamento
- Adicionar `maxDailyEmails` no job (respeita warmup: 500/dia semana 1, etc.)
- Se atingir o limite diário, pausa e re-agenda pra próximo dia via `broadcast-schedules`

### 8.3 · Warmup do domínio

Antes de qualquer disparo massivo, sindicompany.com.br precisa de 4-6 semanas de warmup:
- Semana 1: 500 emails/dia
- Semana 2: 2.000/dia
- Semana 3: 5.000/dia
- Semana 4: 20.000/dia
- Semana 5+: sem limite

Isso é IDEAL pro fluxo de opt-in (que já é gradual naturalmente).

---

## 9 · Plano de execução em fases

Cada fase pode ser feita em uma sessão separada do Claude Code. Sequencial.

### Fase 0 · Preparação (você, ~2h)
- [ ] Contratar Resend Business
- [ ] Verificar domínio sindicompany.com.br no Resend (SPF+DKIM+DMARC)
- [ ] Criar API Key no Resend, guardar
- [ ] Criar Audience "Sindicompany Verified" no Resend, guardar UUID
- [ ] Configurar env vars no Netlify (seção 3)
- [ ] Confirmar acesso admin ao repo `sindicompanysite`

### Fase 1 · Backend core (Claude Code, ~4h)
- [ ] Copiar libs (Grupo A do sec. 2) e adaptar hardcodes de marca
- [ ] Reescrever `leads-index.mjs` pra 100k (sec. 8.1)
- [ ] Copiar 7 funções de broadcast e adaptar
- [ ] Adaptar `email-resend.mjs` (esvaziar MATERIALS, ajustar FROM)
- [ ] Config `netlify.toml`
- [ ] Testar deploy inicial

### Fase 2 · Admin básico (Claude Code, ~3h)
- [ ] Copiar BroadcastPanel do admin.jsx
- [ ] Esvaziar MATERIAL_BROADCASTS (Sindicompany não tem os mesmos rascunhos)
- [ ] Adaptar paleta/tipografia (usar `sindicompany-brand-book` skill)
- [ ] Setup do login admin (mesmo padrão do Bastidores)
- [ ] Testar disparo pra 1 email

### Fase 3 · Import CSV (Claude Code, ~3h)
- [ ] Criar `import-csv.mjs` (spec sec. 6)
- [ ] Criar UI ImportPanel no admin
- [ ] Testar com CSV de 100 linhas (~1 condomínio)
- [ ] Testar com CSV de 5.000 linhas

### Fase 4 · Motor double opt-in (Claude Code, ~4h)
- [ ] Criar 6 funções de opt-in (Grupo D do sec. 2, exceto resend-sync)
- [ ] Criar landings `/opt-in-confirmado/` e `/opt-in-descadastrado/`
- [ ] Escrever HTML dos 4 templates de e-mail
- [ ] Config cron do `optin-attempts-cron-background`
- [ ] Testar fluxo completo com 3-5 emails próprios

### Fase 5 · Sync Resend + Warmup (Claude Code, ~2h)
- [ ] Criar `resend-sync-background.mjs`
- [ ] Config cron
- [ ] Config throttle de warmup no broadcast-run
- [ ] UI OptinFunnelPanel no admin (mostrar funil)

### Fase 6 · Testes finais (~2h)
- [ ] Import de 1 CSV real (condomínio pequeno, ~100 moradores)
- [ ] Deixar rodar as 4 tentativas em ambiente controlado (comprimir timing pra teste: D+0, D+1, D+2, D+3)
- [ ] Validar que verified vai pro Resend Audiences
- [ ] Validar que declined-optout é permanente

**Total estimado: ~18h distribuído em 6 fases**

---

## 10 · Referências úteis

**Docs Resend:**
- Audiences API: https://resend.com/docs/api-reference/audiences
- Rate limits: https://resend.com/docs/api-reference/api-reference-conventions
- Webhooks: https://resend.com/docs/dashboard/webhooks/introduction

**Docs Netlify:**
- Blobs: https://docs.netlify.com/blobs/overview/
- Background functions: https://docs.netlify.com/functions/background-functions/
- Scheduled functions: https://docs.netlify.com/functions/scheduled-functions/

**LGPD:**
- Art. 7º V (execução de contrato): base legal principal
- Art. 8º § 4º (facilidade de revogação): sistema de opt-out em 1 clique cumpre
- Resolução CD/ANPD 15/2024 (comunicação de incidente): 3 dias úteis pra reportar vazamento

**Arquivos do Bastidores (pra consulta via WebFetch):**

Base URL: `https://raw.githubusercontent.com/dicadajumoreira/bastidoresdasindicatura_2/main/`

- `netlify/functions/broadcast.mjs`
- `netlify/functions/broadcast-run-background.mjs`
- `netlify/functions/broadcast-start.mjs`
- `netlify/functions/broadcast-delete.mjs`
- `netlify/functions/broadcast-history.mjs`
- `netlify/functions/broadcast-recipients.mjs`
- `netlify/functions/broadcast-sweeper-background.mjs`
- `netlify/lib/auth-token.mjs`
- `netlify/lib/leads-index.mjs`
- `netlify/lib/email-resend.mjs`
- `netlify/lib/broadcast-footer.mjs`
- `site/admin/admin.jsx` (buscar seção `BroadcastPanel` a partir da linha ~5100)
- `netlify.toml`

---

## 11 · Perguntas em aberto (respondam antes de começar)

Antes da Fase 1, resposta necessária:

1. **Formato exato do CSV de moradores** que a Sindicompany vai importar. Idealmente: uma amostra com 3-5 linhas anonimizadas. Quais colunas vêm de fato?
2. **Endereço físico da Sindicompany** (obrigatório no rodapé de e-mail marketing por lei anti-spam CAN-SPAM/LGPD).
3. **Paleta e tipografia** da Sindicompany — provavelmente definido no skill `sindicompany-brand-book`, confirmar.
4. **Politica de privacidade** — URL da política vigente do sindicompany.com.br (se não tiver, precisa criar antes de começar).
5. **"Guia gratuito" pra tentativa 3** — que material o Sindicompany quer oferecer de brinde? Precisa existir em PDF ou landing antes da tentativa 3 ser disparada.

---

## 12 · Checklist final antes do primeiro import massivo

- [ ] Todas as fases concluídas e testadas
- [ ] Domínio verificado no Resend com SPF+DKIM+DMARC verdes
- [ ] Warmup semana 1 executada (500/dia) sem complaint
- [ ] Página `/opt-in-confirmado/` funcional
- [ ] Página `/opt-in-descadastrado/` funcional
- [ ] Política de privacidade Sindicompany publicada e linkada
- [ ] Endereço físico configurado no rodapé
- [ ] Guia gratuito da tentativa 3 pronto em PDF ou landing
- [ ] Backup do índice de leads
- [ ] Time avisado que a operação vai começar (suporte pode receber dúvidas)

---

**Este documento vive em:** `docs/BROADCAST-EXPORT-SINDICOMPANY.md` (repo bastidoresdasindicatura_2)
**Última atualização:** 2026-08-07
**Autor da spec:** Claude (via sessão da Juliana Moreira)
