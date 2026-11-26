import { cartAdd, cartCreate, cartGet, cartRemove, cartUpdate, type Cart } from "@/lib/shopify";

export async function POST(req: Request) {
  let b: any;
  try {
    b = await req.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const { action, cartId, variantId, quantity, lineId } = b ?? {};
  // sirf string key/value, chhoti length
  const props: Record<string, string> = {};
  if (b?.properties && typeof b.properties === "object") {
    for (const [k, v] of Object.entries(b.properties).slice(0, 20)) {
      if (typeof v === "string") props[k.slice(0, 60)] = v.slice(0, 500);
    }
  }

  try {
    let cart: Cart | null = null;

    if (action === "get") {
      cart = cartId ? await cartGet(cartId) : null;
    } else if (action === "add") {
      if (!/^\d+$/.test(String(variantId))) {
        return Response.json({ error: "Invalid product" }, { status: 400 });
      }
      if (cartId) {
        try {
          cart = await cartAdd(cartId, String(variantId), 1, props);
        } catch {
          cart = null; // cart expire ho gaya ho to naya banao
        }
      }
      if (!cart) cart = await cartCreate(String(variantId), 1, props);
    } else if (action === "update" && cartId && lineId) {
      const q = Number(quantity);
      cart = q <= 0 ? await cartRemove(cartId, lineId) : await cartUpdate(cartId, lineId, q);
    } else if (action === "remove" && cartId && lineId) {
      cart = await cartRemove(cartId, lineId);
    } else {
      return Response.json({ error: "Invalid action" }, { status: 400 });
    }

    return Response.json({ cart });
  } catch (e) {
    console.error("[cart]", e);
    return Response.json({ error: "Cart update failed. Please try again." }, { status: 500 });
  }
}