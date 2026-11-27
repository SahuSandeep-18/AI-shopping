import { connection } from "next/server";

const HANDLE = process.env.COLLECTION_HANDLE || "ready-to-ship";

async function fetchAll(url: (page: number) => string) {
  const all: any[] = [];
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(url(page), { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      if (page === 1) throw new Error(`fetch failed (${res.status}) ${url(page)}`);
      break;
    }
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("json")) throw new Error(`not JSON (${ct}) ${url(page)}`);
    const data = (await res.json()) as { products: any[] };
    all.push(...data.products);
    if (data.products.length < 250) break;
  }
  return all;
}

export async function GET() {
  await connection(); // always run per request, never at build time
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  console.log("[collection] domain =", domain, "handle =", HANDLE);
  if (!domain) return Response.json({ products: [], error: "SHOPIFY_STORE_DOMAIN not set" });

  let list: any[] = [];
  let isRts = true;
  let error = "";

  try {
    list = await fetchAll((p) => `https://${domain}/collections/${HANDLE}/products.json?limit=250&page=${p}`);
  } catch (e) {
    error = String(e);
    console.error("[collection] collection failed:", e);
  }

  if (list.length === 0) {
    isRts = false;
    try {
      list = await fetchAll((p) => `https://${domain}/products.json?limit=250&page=${p}`);
    } catch (e) {
      error += " | " + String(e);
      console.error("[collection] products.json failed:", e);
    }
  }

  const items = list.map((p) => {
    const variants = ((p.variants ?? []) as any[]).filter((v) => !isNaN(Number(v.price)));
    const best = variants.length
      ? variants.reduce((a, b) => (Number(b.price) < Number(a.price) ? b : a))
      : null;
    const price = best ? Number(best.price) : 0;
    const cmp = best?.compare_at_price ? Number(best.compare_at_price) : 0;
    const compareAt = cmp > price ? cmp : undefined;
    return {
      id: String(p.id),
      title: p.title as string,
      price,
      compareAt,
      discount: compareAt ? Math.round((1 - price / compareAt) * 100) : 0,
      image: (p.images?.[0]?.src as string) ?? "",
      image2: (p.images?.[1]?.src as string) ?? "",
      variantId: best ? String(best.id) : "",
      url: `https://${domain}/products/${p.handle}`,
      rts: isRts,
    };
  });

  return Response.json(
    { products: items, ...(items.length === 0 && error ? { error } : {}) },
    { headers: { "Cache-Control": "no-store" } },
  );
}