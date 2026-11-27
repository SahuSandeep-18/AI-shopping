import { api } from "./api";

export function track(e: {
  type:
    | "product_click" | "options_open" | "cart_add" | "cart_remove"
    | "cart_qty" | "checkout_click" | "wishlist_add" | "wishlist_remove";
  productId?: string;
  productTitle?: string;
  variantId?: string;
  price?: number;
  quantity?: number;
  source?: string;
}) {
  try {
    const sessionId = localStorage.getItem("sid") ?? "anon";
    const conversationId = sessionStorage.getItem("cid") ?? undefined;
    // keepalive: link khulne ya page badalne par bhi request pahunch jaye
    fetch(api("/api/event"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...e, sessionId, conversationId }),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}