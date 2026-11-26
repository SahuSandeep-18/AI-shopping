import { wishlistAdd, wishlistList, wishlistRemove } from "@/lib/db";

const s = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");

export async function GET(req: Request) {
  const sid = s(new URL(req.url).searchParams.get("sessionId"), 100);
  if (!sid) return Response.json({ items: [] });
  try {
    return Response.json({ items: await wishlistList(sid) });
  } catch (e) {
    console.error("[wishlist]", e);
    return Response.json({ items: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const b = await req.json();
    const sid = s(b?.sessionId, 100);
    if (!sid) return Response.json({ ok: false }, { status: 400 });

    if (b.action === "add" && b.product?.id) {
      const p = b.product;
      await wishlistAdd(sid, {
        id: s(p.id, 40),
        title: s(p.title, 300),
        price: typeof p.price === "number" && isFinite(p.price) ? p.price : 0,
        image: s(p.image, 500),
        url: s(p.url, 500),
      });
    } else if (b.action === "remove" && b.productId) {
      await wishlistRemove(sid, s(b.productId, 40));
    } else {
      return Response.json({ ok: false }, { status: 400 });
    }
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[wishlist]", e);
    return Response.json({ ok: false }, { status: 500 });
  }
}