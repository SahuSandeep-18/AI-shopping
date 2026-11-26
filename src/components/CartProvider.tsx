"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Cart } from "@/lib/shopify";
import { track } from "@/lib/track";

type Ctx = {
  cart: Cart | null;
  open: boolean;
  busy: boolean;
  error: string;
  onStore: boolean;
  setOpen: (v: boolean) => void;
  add: (
    variantId: string,
    properties?: Record<string, string>,
    meta?: { title?: string; price?: number; productId?: string },
  ) => Promise<void>;
  setQty: (lineId: string, quantity: number) => Promise<void>;
  remove: (lineId: string) => Promise<void>;
};

const CartCtx = createContext<Ctx | null>(null);
export const useCart = () => {
  const c = useContext(CartCtx);
  if (!c) throw new Error("useCart must be used inside CartProvider");
  return c;
};

const KEY = "cartId";
const readId = () => {
  try {
    return localStorage.getItem(KEY) ?? undefined;
  } catch {
    return undefined;
  }
};
const writeId = (id: string | null) => {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {}
};

// Shopify Ajax /cart.js -> hamara Cart type
function shapeAjax(c: any): Cart {
  return {
    id: c.token ?? "ajax",
    checkoutUrl: "/checkout",
    totalQuantity: c.item_count ?? 0,
    subtotal: (c.items_subtotal_price ?? c.total_price ?? 0) / 100,
    currency: c.currency ?? "USD",
    lines: (c.items ?? []).map((i: any) => ({
      id: i.key,
      quantity: i.quantity,
      title: i.product_title,
      variantTitle: i.variant_title && i.variant_title !== "Default Title" ? i.variant_title : "",
      image: i.featured_image?.url ?? i.image ?? "",
      total: (i.final_line_price ?? i.line_price ?? 0) / 100,
      url: i.url ?? "#",
      properties: Object.entries(i.properties ?? {})
        .filter(([k, v]) => k && v && !k.startsWith("_"))
        .map(([key, value]) => ({ key, value: String(value) })),
    })),
  };
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<Cart | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [onStore, setOnStore] = useState(false);

  useEffect(() => {
    setOnStore(/(^|\.)(ourosjewels\.com|myshopify\.com)$/.test(window.location.hostname));
  }, []);

  // ---- Store domain: Ajax Cart API ----
  const refreshAjax = useCallback(async () => {
    const res = await fetch("/cart.js", { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("Could not load cart");
    setCart(shapeAjax(await res.json()));
    document.dispatchEvent(new CustomEvent("cart:refresh"));
    document.dispatchEvent(new CustomEvent("cart:updated"));
  }, []);

  // ---- Localhost: Storefront API cart via /api/cart ----
  const callApi = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, cartId: readId() }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Cart update failed.");
    setCart(data.cart ?? null);
    writeId(data.cart?.id ?? null);
  }, []);

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cart update failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  // page khulte hi cart wapas laao
  useEffect(() => {
    if (onStore) refreshAjax().catch(() => {});
    else if (readId()) run(() => callApi({ action: "get" }));
  }, [onStore, refreshAjax, callApi, run]);

  const add = useCallback(
    async (variantId: string, properties?: Record<string, string>, meta?: { title?: string; price?: number; productId?: string }) => {
      const ok = await run(async () => {
        if (onStore) {
          const res = await fetch("/cart/add.js", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ items: [{ id: Number(variantId), quantity: 1, properties: properties ?? {} }] }),
          });
          if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            throw new Error(d.description ?? d.message ?? "Could not add to cart");
          }
          await refreshAjax();
        } else {
          await callApi({ action: "add", variantId, properties });
        }
      });
      if (ok)
        track({
          type: "cart_add",
          variantId,
          productId: meta?.productId,
          productTitle: meta?.title,
          price: meta?.price,
          quantity: 1,
          source: "variant_picker",
        });
      if (ok) setOpen(true);
    },
    [onStore, run, refreshAjax, callApi],
  );

  const setQty = useCallback(
    async (lineId: string, quantity: number) => {
      const line = cart?.lines.find((l) => l.id === lineId);
      track({
        type: quantity <= 0 ? "cart_remove" : "cart_qty",
        productTitle: line?.title,
        quantity: Math.max(0, quantity),
        price: line ? line.total / Math.max(1, line.quantity) : undefined,
        source: "cart_drawer",
      });
      await run(async () => {
        if (onStore) {
          const res = await fetch("/cart/change.js", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ id: lineId, quantity: Math.max(0, quantity) }),
          });
          if (!res.ok) throw new Error("Could not update cart");
          await refreshAjax();
        } else {
          await callApi({ action: "update", lineId, quantity });
        }
      });
    },
    [onStore, run, refreshAjax, callApi, cart],
  );

  const remove = useCallback((lineId: string) => setQty(lineId, 0), [setQty]);

  return (
    <CartCtx.Provider value={{ cart, open, busy, error, onStore, setOpen, add, setQty, remove }}>
      {children}
      <CartDrawer />
    </CartCtx.Provider>
  );
}

const money = (n: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);

export function CartButton() {
  const { cart, setOpen } = useCart();
  return (
    <button
      onClick={() => setOpen(true)}
      className="relative rounded-full border border-[#CECBF6] bg-white px-4 py-2 text-sm font-medium text-[#2D2B5A] transition hover:bg-[#F3F2FC]"
    >
      Cart
      {cart && cart.totalQuantity > 0 ? (
        <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#2D2B5A] px-1 text-[11px] text-white">
          {cart.totalQuantity}
        </span>
      ) : null}
    </button>
  );
}

const GIFT_THRESHOLD = 999;
const GIFT_NAME = "1.00 CT Round Diamond Pendant";

function GiftBar({ subtotal }: { subtotal: number }) {
  const left = Math.max(0, GIFT_THRESHOLD - subtotal);
  const pct = Math.min(100, (subtotal / GIFT_THRESHOLD) * 100);
  return (
    <div className="rounded-xl bg-[#F3F2FC] p-3 text-sm text-[#2D2B5A]">
      <p className="font-medium">
        {left > 0
          ? `Add $${left.toFixed(0)} more to get a free ${GIFT_NAME}`
          : `You unlocked a free ${GIFT_NAME}`}
      </p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#CECBF6]">
        <div className="h-full rounded-full bg-[#2D2B5A] transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function CartDrawer() {
  const { cart, open, busy, error, onStore, setOpen, setQty, remove } = useCart();
  if (!open) return null;
  const lines = cart?.lines ?? [];

  return (
    <div
      className="fade-in fixed inset-0 z-50 flex justify-end bg-[#2D2B5A]/40 backdrop-blur-[2px]"
      onClick={() => setOpen(false)}
    >
      <aside
        className="drawer-in flex h-dvh w-105 max-w-full flex-col bg-white text-[#2D2B5A] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-[#E6E4F7] px-5 py-4">
          <h2 className="font-serif text-lg uppercase tracking-[0.14em]">
            Your Cart{" "}
            <span className="ml-1 font-sans text-xs normal-case tracking-normal text-[#534AB7]">
              {cart?.totalQuantity ?? 0} items
            </span>
          </h2>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close cart"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#CECBF6] text-lg leading-none transition hover:bg-[#F3F2FC]"
          >
            ×
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {lines.length > 0 && cart ? <GiftBar subtotal={cart.subtotal} /> : null}

          {lines.length === 0 && (
            <div className="flex flex-col items-center py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F3F2FC]">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="#7F77DD" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 7h12l-1 13H7L6 7zM9 7a3 3 0 0 1 6 0" />
                </svg>
              </div>
              <p className="mt-4 font-serif text-lg uppercase tracking-[0.12em]">Your cart is empty</p>
              <button
                onClick={() => setOpen(false)}
                className="mt-5 rounded-full border border-[#2D2B5A] px-6 py-2 text-xs font-medium uppercase tracking-[0.15em] transition hover:bg-[#2D2B5A] hover:text-white"
              >
                Continue shopping
              </button>
            </div>
          )}

          {lines.map((l) => (
            <div key={l.id} className="flex gap-3 border-b border-[#F0EFFA] pb-4 last:border-0">
              {l.image ? (
                <img src={l.image} alt="" className="h-24 w-24 shrink-0 rounded-xl bg-[#F3F2FC] object-cover" />
              ) : (
                <div className="h-24 w-24 shrink-0 rounded-xl bg-[#F3F2FC]" />
              )}
              <div className="min-w-0 flex-1">
                <a
                  href={l.url}
                  target={onStore ? undefined : "_blank"}
                  rel="noopener noreferrer"
                  className="line-clamp-2 text-sm font-medium leading-snug hover:underline"
                >
                  {l.title}
                </a>
                {l.variantTitle ? <p className="mt-0.5 text-xs text-[#534AB7]">{l.variantTitle}</p> : null}
                {l.properties?.map((p) => (
                  <p key={p.key} className="text-xs text-[#534AB7]">
                    {p.key}: {p.value}
                  </p>
                ))}

                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center rounded-full border border-[#CECBF6] text-sm">
                    <button
                      disabled={busy}
                      onClick={() => setQty(l.id, l.quantity - 1)}
                      aria-label="Decrease quantity"
                      className="h-8 w-8 rounded-full transition hover:bg-[#F3F2FC] disabled:opacity-40"
                    >
                      −
                    </button>
                    <span className="w-6 text-center">{l.quantity}</span>
                    <button
                      disabled={busy}
                      onClick={() => setQty(l.id, l.quantity + 1)}
                      aria-label="Increase quantity"
                      className="h-8 w-8 rounded-full transition hover:bg-[#F3F2FC] disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                  <span className="text-sm font-semibold">{money(l.total, cart!.currency)}</span>
                </div>

                <button
                  disabled={busy}
                  onClick={() => remove(l.id)}
                  className="mt-2 text-xs text-[#534AB7] underline underline-offset-2 transition hover:text-[#2D2B5A] disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        {error ? <p className="px-5 pb-2 text-xs text-red-600">{error}</p> : null}

        {lines.length > 0 && cart ? (
          <footer className="space-y-3 border-t border-[#E6E4F7] bg-[#F6F5FD] p-5">
            <div className="flex items-center justify-between text-sm">
              <span>Subtotal</span>
              <span className="text-base font-semibold">{money(cart.subtotal, cart.currency)}</span>
            </div>
            <a
              href={cart.checkoutUrl}
              onClick={() =>
                track({ type: "checkout_click", price: cart.subtotal, quantity: cart.totalQuantity, source: "cart_drawer" })
              }
              className="block rounded-full bg-[#2D2B5A] py-3 text-center text-xs font-medium uppercase tracking-[0.18em] text-white transition hover:bg-[#3C3489]"
            >
              Checkout
            </a>
            <p className="text-center text-xs text-[#534AB7]">Discounts are applied at checkout.</p>
          </footer>
        ) : null}
      </aside>
    </div>
  );
}