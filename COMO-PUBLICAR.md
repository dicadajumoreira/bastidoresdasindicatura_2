# Bastidores da Sindicatura · Guia GitHub + Netlify

Este pacote contém a **versão completa** do site: landing pública + painel admin com senha + funções serverless.

## Estrutura

```
deploy/
├── netlify.toml          → configuração do Netlify
├── package.json          → dependências das funções
├── site/                 → arquivos públicos (a landing + o admin)
│   ├── index.html
│   ├── admin/
│   ├── assets/
│   └── ... (CSS e JSX)
└── netlify/
    └── functions/        → backend serverless (auth, submit, leads, update-status)
```

## Parte 1 — Subir o código no GitHub

1. Vá em [github.com/new](https://github.com/new)
2. **Repository name:** `bastidores-da-sindicatura`
3. **Description:** Site de aplicação para a mentoria
4. **Visibility:** Private (mais seguro)
5. **NÃO marque** "Add a README", "Add .gitignore" ou "Choose a license"
6. Clique em **"Create repository"**
7. Na tela seguinte do repositório vazio, no meio da página tem um link **"uploading an existing file"** — clique nele
8. **Abra a pasta `deploy` extraída** no seu computador
9. Selecione **TUDO O QUE ESTÁ DENTRO** dela: `netlify.toml`, `package.json`, `site/`, `netlify/`, `COMO-PUBLICAR.md`
   (NÃO arraste a pasta `deploy` em si — arraste o conteúdo dela)
10. Arraste tudo na área do GitHub que diz "Drag files here"
11. Aguarde o upload (pode demorar 1–2 minutos pelas imagens)
12. Em **"Commit changes"** lá no fim, digite "Versão inicial" e clique no botão **"Commit changes"**

## Parte 2 — Conectar o Git ao site no Netlify

Aqui mantemos o site atual (`bastidores-da-sindicatura.netlify.app`) e suas configurações.

1. No Netlify, abra o seu site `bastidores-da-sindicatura`
2. Vá em **Site configuration → Build & deploy**
3. Procure a seção **"Continuous deployment"** → clique em **"Link site to Git"** (ou "Link repository")
4. Escolha **GitHub** → autorize → selecione `bastidores-da-sindicatura`
5. Configurações de build:
   - **Branch to deploy:** `main`
   - **Base directory:** *(deixe vazio)*
   - **Build command:** `npm install`
   - **Publish directory:** `site`
   - **Functions directory:** `netlify/functions`
6. Clique em **"Save"** ou **"Deploy site"**
7. Aguarde o build terminar (2–3 minutos, vai aparecer "Published" em verde)

## Parte 3 — Variáveis de ambiente

Confirma que as duas estão configuradas em **Site configuration → Environment variables**:

| Nome | Valor |
|------|-------|
| `ADMIN_PASSWORD` | (a senha escolhida para o painel admin — nunca coloque no código) |
| `AUTH_SECRET` | (qualquer string longa aleatória — nunca coloque no código) |

Se você já tinha configurado antes, continuam ativas — só conferir.

Depois de adicionar/conferir, vá em **Deploys → Trigger deploy → Clear cache and deploy site**.

## Parte 4 — Notificação de aplicações por e-mail

1. No site, vá em **Forms** (no menu superior do site)
2. Aguarde o formulário `bastidores-aplicacao` aparecer na lista (ele aparece após o primeiro envio de teste, ou imediatamente após o build se ele detectar o form HTML)
3. **Form notifications → Add notification → Email notification**
4. **Email to notify:** `contato@dicadajumoreira.com.br`
5. Save

## Resultado

- **Landing pública:** `https://bastidores-da-sindicatura.netlify.app/` (e seu domínio próprio se já apontado)
- **Painel admin:** `https://bastidores-da-sindicatura.netlify.app/admin`
- **Senha admin:** (definida na variável de ambiente `ADMIN_PASSWORD` no Netlify)
- **Notificação por e-mail:** automática para `contato@dicadajumoreira.com.br`

## Atualizações futuras

A partir daqui, sempre que eu te entregar uma nova versão dos arquivos:
1. Vá no repositório no GitHub
2. Clique nos arquivos modificados → "Edit" (ícone de lápis) ou faça upload de novo
3. Commit
4. O Netlify rebuilda automaticamente em 2 minutos

Ou se preferir, podemos sempre fazer pelo método mais simples: você baixa um pacote novo aqui no chat e eu te oriento como atualizar.
