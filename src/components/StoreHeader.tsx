"use client";

import { CartButton } from "@/components/CartProvider";
import { WishlistButton } from "@/components/WishlistProvider";

const STORE_URL = process.env.NEXT_PUBLIC_STORE_ORIGIN ?? "https://www.ourosjewels.com";
const LOGO =
  "https://cdn.shopify.com/s/files/1/0527/7669/8040/files/Ouros_Logo_Correction-04_head_599x200_6d581343-9b38-4bbd-a0c4-d60baf7f2ec0.webp?v=1659678322";

export default function StoreHeader({ onBack }: { onBack?: () => void }) {
  return (
    <header className="sticky top-0 z-30 border-b border-[#E6E4F7] bg-white/95 backdrop-blur">
      <div className="flex h-14 items-center gap-2 px-3 sm:h-16 sm:px-6 lg:relative lg:px-8">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to home"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#CECBF6] text-[#2D2B5A] transition hover:bg-[#F3F2FC]"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4 shrink-0"
              aria-hidden="true"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        ) : null}

        <a
          href={STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Ouros Jewels home"
          className="shrink-0 lg:absolute lg:left-1/2 lg:-translate-x-1/2"
        >
          <img src={LOGO} alt="Ouros Jewels" className="h-8 w-auto sm:h-10" />
        </a>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2 [&_button]:rounded-full [&_button]:border-[#CECBF6] [&_button]:px-3 [&_button]:py-1.5 [&_button]:text-xs [&_button]:text-[#2D2B5A] [&_button:hover]:bg-[#F3F2FC] sm:[&_button]:px-4 sm:[&_button]:py-2 sm:[&_button]:text-sm">
          <a
            href={STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-2 rounded-full border border-[#CECBF6] px-4 py-2 text-sm font-medium text-[#2D2B5A] transition hover:bg-[#F3F2FC] md:flex"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6" strokeLinejoin="round" />
            </svg>
            Ouros Jewels
          </a>
          <WishlistButton />
          <CartButton />
        </div>
      </div>
    </header>
  );
}