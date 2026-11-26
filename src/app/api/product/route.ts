export async function GET(req: Request) {
  const handle = new URL(req.url).searchParams.get("handle") ?? "";
  if (!/^[a-z0-9-]+$/i.test(handle)) {
    return Response.json({ error: "Invalid product" }, { status: 400 });
  }
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  if (!domain) return Response.json({ error: "Store not configured" }, { status: 500 });

  try {
    const res = await fetch(`https://${domain}/products/${handle}.js`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return Response.json({ error: "Product not found" }, { status: 502 });
    const p = await res.json();

    const variants = (p.variants ?? []).map((v: any) => ({
      id: String(v.id),
      options: [v.option1, v.option2, v.option3].filter((x) => x != null) as string[],
      price: Number(v.price) / 100, // .js endpoint gives cents
      compareAt: v.compare_at_price ? Number(v.compare_at_price) / 100 : null,
      available: !!v.available,
      image: v.featured_image?.src ?? "",
    }));

    const names: string[] = (p.options ?? []).map((o: any) => (typeof o === "string" ? o : o.name));
    const options = names.map((name, i) => ({
      name,
      values: Array.from(new Set(variants.map((v: any) => v.options[i]).filter(Boolean))),
    }));

    return Response.json({ title: p.title, options, variants });
  } catch {
    return Response.json({ error: "Could not load options" }, { status: 500 });
  }
}