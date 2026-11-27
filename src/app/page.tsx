"use client";

import { useEffect, useRef, useState } from "react";
import { useCart } from "@/components/CartProvider";
import { HeartButton } from "@/components/WishlistProvider";
import ChatDrawer from "@/components/ChatDrawer";
import VariantPicker from "@/components/VariantPicker";
import StoreHeader from "@/components/StoreHeader";
import { track } from "@/lib/track";
import { api } from "@/lib/api";

export type Product = {
  id: string;
  title: string;
  price: number;
  image: string;
  url?: string;
  compareAt?: number;
  discount?: number;
  image2?: string;
  variantId?: string;
  rts?: boolean;
};

// On the store domain (/apps/chat) products can be read straight from the store
async function loadFromStore(): Promise<Product[]> {
  const res = await fetch("/collections/ready-to-ship/products.json?limit=250");
  if (!res.ok) return [];
  const { products } = (await res.json()) as { products: any[] };
  return products.map((p) => {
    const variants = ((p.variants ?? []) as any[]).filter((v) => !isNaN(Number(v.price)));
    const best = variants.length
      ? variants.reduce((a, b) => (Number(b.price) < Number(a.price) ? b : a))
      : null;
    const price = best ? Number(best.price) : 0;
    const cmp = best?.compare_at_price ? Number(best.compare_at_price) : 0;
    const compareAt = cmp > price ? cmp : undefined;
    return {
      id: String(p.id),
      title: p.title,
      price,
      compareAt,
      discount: compareAt ? Math.round((1 - price / compareAt) * 100) : 0,
      image: p.images?.[0]?.src ?? "",
      image2: p.images?.[1]?.src ?? "",
      variantId: best ? String(best.id) : "",
      url: `${window.location.origin}/products/${p.handle}`,
      rts: true,
    };
  });
}

const BATCH = 12;

export default function Home() {
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searchLabel, setSearchLabel] = useState("");
  const [gridKey, setGridKey] = useState(0);
  const [defaults, setDefaults] = useState<Product[]>([]);
  const [loadingDefaults, setLoadingDefaults] = useState(true);
  const [visibleCount, setVisibleCount] = useState(BATCH);
  const [picking, setPicking] = useState<Product | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  const { add } = useCart();

  useEffect(() => {
    (async () => {
      let list: Product[] = [];
      try {
        const r = await fetch(api("/api/collection"));
        const d = await r.json();
        list = Array.isArray(d.products) ? d.products : [];
      } catch {}

      // fallback: running on the store domain, read the collection directly
      if (list.length === 0 && window.location.pathname.startsWith("/apps/chat")) {
        try {
          list = await loadFromStore();
        } catch {}
      }
      setDefaults(list);
      setLoadingDefaults(false);
    })();
  }, []);

  const showingSearch = searchResults.length > 0;
  const shown = showingSearch ? searchResults : defaults;
  const visible = shown.slice(0, visibleCount);
  const hasMore = visibleCount < shown.length;

  // new list (search / back / new chat): start from the top, animate the grid
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setVisibleCount(BATCH);
    setGridKey((k) => k + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [searchResults]);

  // load the next batch when the sentinel nears the screen
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setVisibleCount((c) => c + BATCH);
      },
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, visibleCount]);

  return (
    <div className="flex min-h-screen flex-col bg-white text-[#2D2B5A]">
      <StoreHeader
        onBack={
          showingSearch
            ? () => {
                setSearchResults([]);
                setSearchLabel("");
              }
            : undefined
        }
      />

      <div className="flex flex-1">
        <main className="min-w-0 flex-1 px-4 pb-44 pt-6 sm:px-6 md:pb-8 lg:px-8 lg:pt-8">
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="truncate font-serif text-2xl uppercase tracking-[0.12em] sm:text-3xl">
                {showingSearch ? `Results for "${searchLabel}"` : "Ready to Ship"}
              </h1>
              <p className="mt-1 text-sm text-[#534AB7]">
                {showingSearch
                  ? `${shown.length} products`
                  : shown.length
                    ? `${shown.length} products, ships fast`
                    : "Ships fast, straight from our collection"}
              </p>
            </div>
            <div className="mb-2 hidden h-0.5 w-14 shrink-0 bg-[#7F77DD] sm:block" />
          </div>

          <div
            key={gridKey}
            className="grid-in mt-6 grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-x-4 lg:mt-8 xl:grid-cols-3"
          >
            {loadingDefaults && !showingSearch
              ? Array.from({ length: 6 }).map((_, i) => (
                  <div key={i}>
                    <div className="aspect-square animate-pulse rounded-xl bg-[#F3F2FC]" />
                    <div className="mt-3 h-3 w-4/5 animate-pulse rounded bg-[#F3F2FC]" />
                    <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-[#F3F2FC]" />
                  </div>
                ))
              : visible.map((p) => (
                  <div key={p.id} className="group">
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                      onClick={() =>
                        track({
                          type: "product_click",
                          productId: p.id,
                          productTitle: p.title,
                          price: p.price,
                          source: showingSearch ? "search" : "grid",
                        })
                      }
                    >
                      <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-[#F3F2FC]">
                        <img
                          src={p.image}
                          alt={p.title}
                          loading="lazy"
                          decoding="async"
                          className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        />
                        {p.image2 ? (
                          <img
                            src={p.image2}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                          />
                        ) : null}

                        {p.discount ? (
                          <span className="absolute left-2.5 top-2.5 z-10 rounded-full bg-[#2D2B5A] px-2.5 py-1 text-[11px] font-medium tracking-wide text-white">
                            {p.discount}% OFF
                          </span>
                        ) : null}

                        <HeartButton
                          className="absolute right-2.5 top-2.5 z-10"
                          product={{ id: p.id, title: p.title, price: p.price, image: p.image, url: p.url ?? "" }}
                        />
                      </div>

                      <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-snug">{p.title}</p>
                      <div className="mt-1.5 flex items-baseline gap-2">
                        <span className="text-base font-semibold">${p.price}</span>
                        {p.compareAt ? (
                          <span className="text-xs text-neutral-400 line-through">${p.compareAt}</span>
                        ) : null}
                      </div>
                    </a>

                    {p.url ? (
                      <button
                        onClick={() => {
                          track({
                            type: "options_open",
                            productId: p.id,
                            productTitle: p.title,
                            price: p.price,
                            source: showingSearch ? "search" : "grid",
                          });
                          setPicking(p);
                        }}
                        className="mt-3 w-full rounded-full border border-[#2D2B5A] py-2 text-xs font-medium uppercase tracking-[0.15em] text-[#2D2B5A] transition hover:bg-[#2D2B5A] hover:text-white"
                      >
                        Choose options
                      </button>
                    ) : null}
                  </div>
                ))}
          </div>

          {hasMore && (
            <div ref={sentinelRef} className="mt-8 flex justify-center py-6">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#CECBF6] border-t-[#2D2B5A]" />
            </div>
          )}
        </main>

        <ChatDrawer
          onProducts={(p, label) => {
            setSearchResults(p);
            setSearchLabel(label ?? "");
          }}
        />
      </div>

      {picking?.url ? (
        <VariantPicker
          handle={picking.url.split("/products/")[1]?.split(/[?#]/)[0] ?? ""}
          fallbackImage={picking.image}
          onClose={() => setPicking(null)}
          onAdd={async (variantId, properties, meta) => {
            await add(variantId, properties, { ...meta, productId: picking.id });
            setPicking(null);
          }}
        />
      ) : null}
    </div>
  );
}