export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/produto\/(\d+)\/?$/);

  if (!match) {
    return env.ASSETS.fetch(new Request(new URL("/", url.origin), request));
  }

  const asset = await env.ASSETS.fetch(new Request(new URL("/", url.origin), request));
  if (!asset.ok) return asset;

  const html = await asset.text();
  const produtosMatch = html.match(/const PRODUTOS = (\[[\s\S]*?\]);/);
  const fotosMatch = html.match(/const FOTOS = (\{[\s\S]*?\});/);

  if (!produtosMatch || !fotosMatch) {
    return new Response(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=UTF-8" }
    });
  }

  let produtos, fotos;
  try {
    produtos = JSON.parse(produtosMatch[1]);
    fotos = JSON.parse(fotosMatch[1]);
  } catch {
    return new Response(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=UTF-8" }
    });
  }

  const produto = produtos.find(item => item.id === Number(match[1]));
  if (!produto) {
    return new Response("Produto não encontrado.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=UTF-8" }
    });
  }

  const titulo = `${produto.nome} | Charmant`;
  const descricao = String(produto.desc || produto.detalhes || "Confira esta peça na Charmant.")
    .replace(/\s+/g, " ")
    .slice(0, 250);
  const imagem = fotos[produto.foto] || fotos[(produto.mais || [])[0]] || "";
  const canonical = `${url.origin}/produto/${produto.id}`;

  const esc = value => String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);

  const tags = `
    <title>${esc(titulo)}</title>
    <meta name="description" content="${esc(descricao)}">
    <link rel="canonical" href="${esc(canonical)}">
    <meta property="og:type" content="product">
    <meta property="og:site_name" content="Charmant">
    <meta property="og:title" content="${esc(titulo)}">
    <meta property="og:description" content="${esc(descricao)}">
    <meta property="og:url" content="${esc(canonical)}">
    ${imagem ? `<meta property="og:image" content="${esc(imagem)}"><meta property="og:image:secure_url" content="${esc(imagem)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(imagem)}">` : ""}
  `;

  const page = html.replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<\/head>/i, `${tags}\n</head>`);

  return new Response(page, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=UTF-8",
      "cache-control": "public, max-age=300"
    }
  });
}
