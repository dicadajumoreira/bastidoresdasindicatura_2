// Edge Function que intercepta pretty URLs e serve o index.html estático.
// Necessário pra bypassar o pre-renderer legacy do Netlify que estava
// servindo HTML antigo sem as meta tags og:* pra bots (WhatsApp, Facebook).

import type { Context } from "https://edge.netlify.com";

const MAP: Record<string, string> = {
  "/": "/index.html",
  "/checklist/": "/checklist/index.html",
  "/ebook-ia/": "/ebook-ia/index.html",
  "/sindico-profissional/": "/sindico-profissional/index.html",
  "/sobrevivencia-whatsapp/": "/sobrevivencia-whatsapp/index.html",
  "/50-frases/": "/50-frases/index.html",
  "/nr1/": "/nr1/index.html",
  "/conflitos/": "/conflitos/index.html",
  "/saude-mental/": "/saude-mental/index.html",
  "/gestao-sob-ataque/": "/gestao-sob-ataque/index.html",
  "/bombeiro/": "/bombeiro/index.html",
};

export default async (request: Request, context: Context) => {
  const url = new URL(request.url);
  const target = MAP[url.pathname];
  if (!target) return; // deixa o request seguir normalmente

  // Busca o arquivo estático real (force=true rewrite interno)
  const fileUrl = new URL(target + "?_og_bypass=" + Date.now(), url.origin);
  const upstream = await fetch(fileUrl.toString(), {
    headers: {
      // UA "neutro" pra evitar pre-renderer
      "User-Agent": "Mozilla/5.0 (compatible; NetlifyEdge/1.0)",
      "Cache-Control": "no-cache",
    },
  });

  const body = await upstream.text();
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=0, must-revalidate",
      "netlify-cdn-cache-control": "public, max-age=0, must-revalidate",
    },
  });
};

export const config = {
  path: ["/", "/checklist/", "/ebook-ia/", "/sindico-profissional/", "/sobrevivencia-whatsapp/", "/50-frases/", "/nr1/", "/conflitos/", "/saude-mental/", "/gestao-sob-ataque/", "/bombeiro/"],
};
