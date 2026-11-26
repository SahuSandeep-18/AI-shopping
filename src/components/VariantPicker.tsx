"use client";

import { useEffect, useState } from "react";

type Variant = {
  id: string;
  options: string[];
  price: number;
  compareAt: number | null;
  available: boolean;
  image: string;
};
type Data = { title: string; options: { name: string; values: string[] }[]; variants: Variant[] };

export default function VariantPicker({
  handle,
  fallbackImage,
  onClose,
  onAdd,
}: {
  handle: string;
  fallbackImage: string;
  onClose: () => void;
  onAdd: (
    variantId: string,
    properties?: Record<string, string>,
    meta?: { title?: string; price?: number },
  ) => Promise<void>;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [engraving, setEngraving] = useState("");

  useEffect(() => {
    fetch(`/api/product?handle=${encodeURIComponent(handle)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
        const first = d.variants.find((v: Variant) => v.available) ?? d.variants[0];
        setSelected(first?.options ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load options"));
  }, [handle]);

  const current = data?.variants.find((v) => v.options.every((o, i) => o === selected[i]));

  const isAvailable = (optIndex: number, value: string) =>
    !!data?.variants.some(
      (v) =>
        v.available &&
        v.options[optIndex] === value &&
        v.options.every((o, i) => i === optIndex || o === selected[i]),
    );

  async function addNow() {
    if (!current || !current.available) return;
    setAdding(true);
    await onAdd(current.id, engraving.trim() ? { Engraving: engraving.trim() } : undefined, {
      title: data?.title,
      price: current.price,
    });
    setAdding(false);
  }

  const off =
    current?.compareAt && current.compareAt > current.price
      ? Math.round((1 - current.price / current.compareAt) * 100)
      : 0;

  return (
    <div
      className="fade-in fixed inset-0 z-50 flex items-end justify-center bg-[#2D2B5A]/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="drawer-in max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 text-[#2D2B5A] shadow-2xl sm:rounded-3xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-serif text-lg leading-snug">{data?.title ?? "Choose options"}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#CECBF6] text-lg leading-none transition hover:bg-[#F3F2FC]"
          >
            ×
          </button>
        </div>

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        {!data && !error ? (
          <div className="mt-5 space-y-3">
            <div className="aspect-square w-full animate-pulse rounded-2xl bg-[#F3F2FC]" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-[#F3F2FC]" />
          </div>
        ) : null}

        {data ? (
          <>
            <img
              src={current?.image || fallbackImage}
              alt=""
              className="mt-4 aspect-square w-full rounded-2xl bg-[#F3F2FC] object-cover"
            />

            {data.options.map((opt, i) => (
              <div key={opt.name} className="mt-5">
                <p className="mb-2 text-xs font-medium uppercase tracking-[0.15em]">
                  {opt.name}: <span className="font-normal normal-case tracking-normal text-[#534AB7]">{selected[i]}</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {opt.values.map((val) => {
                    const active = selected[i] === val;
                    const ok = isAvailable(i, val);
                    return (
                      <button
                        key={val}
                        onClick={() => setSelected((s) => s.map((x, idx) => (idx === i ? val : x)))}
                        className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
                          active
                            ? "border-[#2D2B5A] bg-[#2D2B5A] text-white"
                            : "border-[#CECBF6] hover:border-[#2D2B5A]"
                        } ${!ok && !active ? "text-neutral-400 line-through" : ""}`}
                      >
                        {val}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <label className="mt-5 block text-xs font-medium uppercase tracking-[0.15em]">
              Engraving (optional)
              <input
                value={engraving}
                onChange={(e) => setEngraving(e.target.value)}
                maxLength={40}
                placeholder="e.g. Forever yours"
                className="mt-2 w-full rounded-xl border border-[#E6E4F7] bg-[#F6F5FD] px-3 py-2.5 text-base font-normal normal-case tracking-normal outline-none transition placeholder:text-neutral-400 focus:border-[#7F77DD] sm:text-sm"
              />
            </label>

            <div className="mt-5 flex items-center gap-2">
              {current ? (
                <>
                  <span className="text-xl font-semibold">${current.price}</span>
                  {off ? (
                    <>
                      <span className="text-sm text-neutral-400 line-through">${current.compareAt}</span>
                      <span className="rounded-full bg-[#2D2B5A] px-2.5 py-0.5 text-[11px] font-medium tracking-wide text-white">
                        {off}% OFF
                      </span>
                    </>
                  ) : null}
                </>
              ) : (
                <span className="text-sm text-[#534AB7]">This combination is not available.</span>
              )}
            </div>

            <button
              onClick={addNow}
              disabled={!current || !current.available || adding}
              className="mt-4 w-full rounded-full bg-[#2D2B5A] py-3 text-xs font-medium uppercase tracking-[0.18em] text-white transition hover:bg-[#3C3489] disabled:opacity-40"
            >
              {!current ? "Unavailable" : !current.available ? "Sold out" : adding ? "Adding…" : "Add to cart"}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}