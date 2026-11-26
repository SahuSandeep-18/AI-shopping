import { saveEvent } from "@/lib/db";

const TYPES = [
  "product_click", "options_open", "cart_add", "cart_remove", "cart_qty",
  "checkout_click", "wishlist_add", "wishlist_remove",
];
const s = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : undefined);
const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : undefined);

export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (!TYPES.includes(b?.type)) return Response.json({ ok: false }, { status: 400 });
    await saveEvent({
      sessionId: s(b.sessionId, 100) ?? "anon",
      conversationId: s(b.conversationId, 40),
      type: b.type,
      productId: s(b.productId, 40),
      productTitle: s(b.productTitle, 300),
      variantId: s(b.variantId, 40),
      price: num(b.price),
      quantity: num(b.quantity),
      source: s(b.source, 30),
    });
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[event]", e);
    return Response.json({ ok: false }, { status: 500 });
  }
}