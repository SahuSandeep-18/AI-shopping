const HANDLE = "ready-to-ship";

async function fetchAll(url: (page: number) => string) {
  const all: any[] = [];
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(url(page), { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      if (page === 1) throw new Error(`fetch failed (${res.status})`);
      break;
    }
    const data = (await res.json()) as { products: any[] };
    all.push(...data.products);
    if (data.products.length < 250) break;
  }
  return all;
}

export async function GET() {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  if (!domain) return Response.json({ products: [] }, { status: 500 });

  try {
    // RTS collection + poora store, ek saath
    const rts = await fetchAll(
      (p) => `https://${domain}/collections/${HANDLE}/products.json?limit=250&page=${p}`,
    );

    const shape = (p: any, isRts: boolean) => {
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
    };

    // default grid: sirf RTS
    const items = rts.map((p) => shape(p, true));

    return Response.json(
      { products: items },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch {
    return Response.json({ products: [] }, { status: 500 });
  }
}