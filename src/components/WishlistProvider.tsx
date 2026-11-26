"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { track } from "@/lib/track";

export type WishItem = { id: string; title: string; price: number; image: string; url: string };

type Ctx = {
  items: WishItem[];
  open: boolean;
  setOpen: (v: boolean) => void;
  has: (id: string) => boolean;
  toggle: (p: WishItem) => void;
};

const WishCtx = createContext<Ctx | null>(null);
export const useWishlist = () => {
  const c = useContext(WishCtx);
  if (!c) throw new Error("useWishlist must be used inside WishlistProvider");
  return c;
};

function sessionId() {
  try {
    let id = localStorage.getItem("sid");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("sid", id);
    }
    return id;
  } catch {
    return "anon";
  }
}

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/wishlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, sessionId: sessionId() }),
  });
  if (!res.ok) throw new Error("wishlist request failed");
}

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<WishItem[]>([]);
  const [open, setOpen] = useState(false);

  // load saved items when the page opens
  useEffect(() => {
    fetch(`/api/wishlist?sessionId=${encodeURIComponent(sessionId())}`)
      .then((r) => r.json())
      .then((d) => {
        const loaded: WishItem[] = Array.isArray(d.items) ? d.items : [];
        setItems((cur) => [...cur, ...loaded.filter((l) => !cur.some((c) => c.id === l.id))]);
      })
      .catch(() => {});
  }, []);

  const has = useCallback((id: string) => items.some((i) => i.id === id), [items]);

  const toggle = useCallback(
    (p: WishItem) => {
      const exists = items.some((i) => i.id === p.id);
      const before = items;

      // optimistic update: UI changes instantly, rolled back if the server fails
      setItems((cur) => (exists ? cur.filter((i) => i.id !== p.id) : [p, ...cur.filter((i) => i.id !== p.id)]));
      track({
        type: exists ? "wishlist_remove" : "wishlist_add",
        productId: p.id,
        productTitle: p.title,
        price: p.price,
        source: "wishlist",
      });

      (exists ? post({ action: "remove", productId: p.id }) : post({ action: "add", product: p })).catch((err) => {
        console.error("[wishlist] request failed, rolling back", err);
        setItems(before);
      });
    },
    [items],
  );

  return (
    <WishCtx.Provider value={{ items, open, setOpen, has, toggle }}>
      {children}
      <WishlistDrawer />
    </WishCtx.Provider>
  );
}

export function WishlistButton() {
  const { items, setOpen } = useWishlist();
  return (
    <button
      onClick={() => setOpen(true)}
      className="relative rounded-full border border-[#CECBF6] bg-white px-4 py-2 text-sm font-medium text-[#2D2B5A] transition hover:bg-[#F3F2FC]"
    >
      Wishlist
      {items.length > 0 ? (
        <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#7F77DD] px-1 text-[11px] text-white">
          {items.length}
        </span>
      ) : null}
    </button>
  );
}

export function HeartButton({ product, className = "" }: { product: WishItem; className?: string }) {
  const { has, toggle } = useWishlist();
  const on = has(product.id);
  return (
    <button
      type="button"
      aria-label={on ? "Remove from wishlist" : "Add to wishlist"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(product);
      }}
      className={`flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm transition hover:scale-110 ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4.5 w-4.5"
        fill={on ? "#2D2B5A" : "none"}
        stroke="#2D2B5A"
        strokeWidth="2"
      >
        <path d="M12 21s-7-4.6-9.3-9A5.5 5.5 0 0 1 12 6.6 5.5 5.5 0 0 1 21.3 12C19 16.4 12 21 12 21z" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function WishlistDrawer() {
  const { items, open, setOpen, toggle } = useWishlist();
  if (!open) return null;

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
            Wishlist{" "}
            <span className="ml-1 font-sans text-xs normal-case tracking-normal text-[#534AB7]">
              {items.length} items
            </span>
          </h2>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close wishlist"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#CECBF6] text-lg leading-none transition hover:bg-[#F3F2FC]"
          >
            ×
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {items.length === 0 && (
            <div className="flex flex-col items-center py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F3F2FC]">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="#7F77DD" strokeWidth="1.8" strokeLinejoin="round">
                  <path d="M12 21s-7-4.6-9.3-9A5.5 5.5 0 0 1 12 6.6 5.5 5.5 0 0 1 21.3 12C19 16.4 12 21 12 21z" />
                </svg>
              </div>
              <p className="mt-4 font-serif text-lg uppercase tracking-[0.12em]">Nothing saved yet</p>
              <p className="mt-1 text-sm text-[#534AB7]">Tap the heart on a product to save it.</p>
            </div>
          )}

          {items.map((p) => (
            <div key={p.id} className="flex gap-3 border-b border-[#F0EFFA] pb-4 last:border-0">
              {p.image ? (
                <img src={p.image} alt="" className="h-24 w-24 shrink-0 rounded-xl bg-[#F3F2FC] object-cover" />
              ) : (
                <div className="h-24 w-24 shrink-0 rounded-xl bg-[#F3F2FC]" />
              )}
              <div className="min-w-0 flex-1">
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() =>
                    track({ type: "product_click", productId: p.id, productTitle: p.title, price: p.price, source: "wishlist" })
                  }
                  className="line-clamp-2 text-sm font-medium leading-snug hover:underline"
                >
                  {p.title}
                </a>
                <p className="mt-1 text-sm font-semibold">${p.price}</p>
                <button
                  onClick={() => toggle(p)}
                  className="mt-2 text-xs text-[#534AB7] underline underline-offset-2 transition hover:text-[#2D2B5A]"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}