// Cloudflare Pages Function
// Rota: /produto/:id
// Serve o catálogo normalmente, mas injeta metadados Open Graph específicos
// para que WhatsApp, Facebook e outros crawlers mostrem a peça compartilhada.

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
}

function extractAssignedJson(html, variableName, closing) {
  const marker = `const ${variableName} =`;
  const start = html.indexOf(marker);
  if (start < 0) throw new Error(`Não encontrei ${marker}`);

  const valueStart = html.indexOf(variableName === "PRODUTOS" ? "[" : "{", start);
  if (valueStart < 0) throw new Error(`Declaração ${variableName} inválida`);

  // Os dados do catálogo são JSON válido. Localiza o fechamento do array/objeto
  // respeitando strings e caracteres escapados.
  const open = html[valueStart];
  const close = open === "[" ? "]" : "}";
  let depth = 0, inString = false, escaped = false;

  for (let i = valueStart; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) {
      return JSON.parse(html.slice(valueStart, i + 1));
    }
  }
  throw new Error(`Não consegui ler os dados de ${variableName}`);
}

function setMeta(html, property, content) {
  const safe = escapeHtml(content);
  const tag = `<meta property="${property}" content="${safe}">`;
  const re = new RegExp(`<meta\\s+property=["']${property}["'][^>]*>`, "i");
  return re.test(html) ? html.replace(re, tag) : html.replace("</head>", `  ${tag}\n</head>`);
}

export async function onRequest(context) {
  const id = String(context.params.id || "");
  const assetUrl = new URL("/", context.request.url);
  const assetResponse = await context.env.ASSETS.fetch(new Request(assetUrl, {
    headers: context.request.headers
  }));
  if (!assetResponse.ok) return new Response("Catálogo indisponível", { status: 502 });

  let html = await assetResponse.text();

  try {
    const produtos = extractAssignedJson(html, "PRODUTOS");
    const fotos = extractAssignedJson(html, "FOTOS");
    const produto = produtos.find((item) => String(item.id) === id);

    if (!produto) {
      return new Response(html, {
        status: 404,
        headers: { "content-type": "text/html; charset=utf-8" }
      });
    }

    const imageKey = produto.foto;
    const image = fotos[imageKey] || "";
    const origin = new URL(context.request.url).origin;
    const canonical = `${origin}/produto/${encodeURIComponent(id)}`;
    const description = produto.desc || produto.detalhes || "Conheça esta peça da Charmant.";
    const title = `${produto.nome} | Charmant`;

    html = setMeta(html, "og:type", "product");
    html = setMeta(html, "og:title", title);
    html = setMeta(html, "og:description", description);
    html = setMeta(html, "og:url", canonical);
    if (image) html = setMeta(html, "og:image", image);
    html = setMeta(html, "twitter:card", "summary_large_image");
    html = setMeta(html, "twitter:title", title);
    html = setMeta(html, "twitter:description", description);
    if (image) html = setMeta(html, "twitter:image", image);

    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=300, s-maxage=600"
      }
    });
  } catch (error) {
    // Em caso de estrutura inesperada, entrega a loja sem quebrar a página.
    return new Response(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" }
    });
  }
}
