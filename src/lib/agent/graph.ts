import { ChatGroq } from "@langchain/groq";
import { END, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";
import { ToolNode, toolsCondition } from "@langchain/langgraph/prebuilt";
import { SystemMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { StoreConfig } from "@/config/store";

// ---------------------------------------------------------------------------
// Store products (Shopify /products.json), cached in memory for 10 minutes
// ---------------------------------------------------------------------------

type Slim = {
  id: string;
  title: string;
  handle: string;
  base: string; // title + type + tags, lowercase
  image: string;
  image2: string;
  createdAt: number;
  variants: { id: string; title: string; price: number; compareAt: number | null }[];
};

let cache: { at: number; data: Slim[] } | null = null;
let inflight: Promise<Slim[]> | null = null;

function toSlim(p: any): Slim {
  return {
    id: String(p.id),
    title: p.title,
    handle: p.handle,
    base: `${p.title} ${p.product_type} ${(p.tags ?? []).toString()}`.toLowerCase(),
    image: p.images?.[0]?.src ?? "",
    image2: p.images?.[1]?.src ?? "",
    createdAt: Date.parse(p.published_at ?? p.created_at ?? "") || 0,
    variants: (p.variants ?? []).map((v: any) => ({
      id: String(v.id),
      title: String(v.title ?? "").toLowerCase(),
      price: Number(v.price),
      compareAt: v.compare_at_price ? Number(v.compare_at_price) : null,
    })),
  };
}

async function loadAllProducts(domain: string): Promise<Slim[]> {
  if (cache && Date.now() - cache.at < 10 * 60 * 1000) return cache.data;
  if (inflight) return inflight;

  inflight = (async () => {
    const all: Slim[] = [];
    for (let page = 1; page <= 10; page++) {
      const res = await fetch(`https://${domain}/products.json?limit=250&page=${page}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`Could not load products from the store (${res.status})`);
      const { products } = (await res.json()) as { products: any[] };

            for (const p of products) all.push(toSlim(p));
      if (products.length < 250) break;
    }
    cache = { at: Date.now(), data: all };
    return all;
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

// "ring" sirf poore word "ring"/"rings" se match ho, "earrings" se nahi
function hasWord(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}(s|es)?($|[^a-z0-9])`, "i").test(text);
}

// Short forms / alternative names
const SYNONYMS: Record<string, string[]> = {
  oec: ["oec", "old european"],
  omc: ["omc", "old mine"],
  necklace: ["necklace", "pendant"],
  pendant: ["pendant", "necklace"],
};

function alternatives(word: string): string[] {
  const w = word.replace(/s$/, "");
  return SYNONYMS[w] ?? [w];
}

// Product ka "type" word: ring search par earring/pendant wale nahi aane chahiye
const EXCLUDES: Record<string, string[]> = {
  ring: ["earring", "pendant", "necklace", "bracelet"],
};

async function findProducts({
  query,
  minPrice,
  maxPrice,
}: {
  query: string;
  minPrice?: number;
  maxPrice?: number;
}) {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  if (!domain) throw new Error("SHOPIFY_STORE_DOMAIN is not set");

  const products = await loadAllProducts(domain);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);

  const out: {
    id: string;
    title: string;
    price: number;
    compareAt?: number;
    discount: number;
    image: string;
    image2: string;
    variantId: string;
    url: string;
  }[] = [];

  for (const p of products) {
    const matching = p.variants
      .filter((v) => {
        const hay = `${p.base} ${v.title}`;
        return words.every((w) => alternatives(w).some((alt) => hasWord(hay, alt)));
      })
      .filter((v) => !isNaN(v.price))
      .filter((v) => (minPrice === undefined || v.price >= minPrice) && (maxPrice === undefined || v.price <= maxPrice));

    if (!matching.length) continue;

    const title = p.title.toLowerCase();
    const blocked = words.some((w) => {
      const ex = EXCLUDES[w.replace(/s$/, "")];
      return ex?.some((x) => hasWord(title, x));
    });
    if (blocked) continue;

    // sabse sasta matching variant, aur uska original (compare-at) price
    const best = matching.reduce((a, b) => (b.price < a.price ? b : a));
    const compareAt = best.compareAt && best.compareAt > best.price ? best.compareAt : undefined;
    const discount = compareAt ? Math.round((1 - best.price / compareAt) * 100) : 0;

    out.push({
      id: p.id,
      title: p.title,
      price: best.price,
      compareAt,
      discount,
      image: p.image,
      image2: p.image2,
      variantId: best.id,
      url: `https://${domain}/products/${p.handle}`,
    });
  }
    return readyFirst(out, await readyToShipIds(domain));
}


type Collection = { title: string; handle: string; count: number };
let collCache: { at: number; data: Collection[] } | null = null;
const collProducts = new Map<string, { at: number; data: Slim[] }>();
const TEN_MIN = 10 * 60 * 1000;

async function loadCollections(domain: string): Promise<Collection[]> {
  if (collCache && Date.now() - collCache.at < TEN_MIN) return collCache.data;
  const res = await fetch(`https://${domain}/collections.json?limit=250`, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Could not load collections (${res.status})`);
  const { collections } = (await res.json()) as { collections: any[] };
  const data = collections
    .filter((c) => c.products_count > 0)
    .map((c) => ({ title: String(c.title), handle: String(c.handle), count: Number(c.products_count) }));
  collCache = { at: Date.now(), data };
  return data;
}

async function loadCollectionProducts(domain: string, handle: string): Promise<Slim[]> {
  if (!/^[a-z0-9-]+$/i.test(handle)) throw new Error("Invalid collection");
  const hit = collProducts.get(handle);
  if (hit && Date.now() - hit.at < TEN_MIN) return hit.data;

  const all: Slim[] = [];
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(`https://${domain}/collections/${handle}/products.json?limit=250&page=${page}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Collection not found (${res.status})`);
    const { products } = (await res.json()) as { products: any[] };
    for (const p of products) all.push(toSlim(p));
    if (products.length < 250) break;
  }
  collProducts.set(handle, { at: Date.now(), data: all });
  return all;
}

// Ready to Ship collection ke product ids (10 minute cache)
async function readyToShipIds(domain: string): Promise<Set<string>> {
  try {
    const items = await loadCollectionProducts(domain, "ready-to-ship");
    return new Set(items.map((p) => p.id));
  } catch {
    return new Set(); // collection na mile to sort bina ready-to-ship ke chalega
  }
}

// stable sort: ready-to-ship pehle, baaki ka order waisa hi rahe
function readyFirst<T extends { id: string }>(items: T[], ready: Set<string>): T[] {
  if (!ready.size) return items;
  const yes: T[] = [];
  const no: T[] = [];
  for (const it of items) (ready.has(it.id) ? yes : no).push(it);

  // 1 RTS, 2 regular ka mix; ek khatam ho to baaki doosre ke
  const out: T[] = [];
  let i = 0;
  let j = 0;
  while (i < yes.length || j < no.length) {
    if (i < yes.length) out.push(yes[i++]);
    for (let k = 0; k < 2 && j < no.length; k++) out.push(no[j++]);
  }
  return out;
}

async function browseProducts(opts: {
  collection?: string;
  onlySale?: boolean;
  newest?: boolean;
  minPrice?: number;
  maxPrice?: number;
}) {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  if (!domain) throw new Error("SHOPIFY_STORE_DOMAIN is not set");

  const products = opts.collection
    ? await loadCollectionProducts(domain, opts.collection)
    : await loadAllProducts(domain);

  const out: {
    id: string; title: string; price: number; compareAt?: number; discount: number;
    image: string; image2: string; variantId: string; url: string; createdAt: number;
  }[] = [];

  for (const p of products) {
    const ok = p.variants
      .filter((v) => !isNaN(v.price))
      .filter((v) => (opts.minPrice === undefined || v.price >= opts.minPrice) && (opts.maxPrice === undefined || v.price <= opts.maxPrice))
      .filter((v) => !opts.onlySale || (v.compareAt !== null && v.compareAt > v.price));
    if (!ok.length) continue;

    const best = ok.reduce((a, b) => (b.price < a.price ? b : a));
    const compareAt = best.compareAt && best.compareAt > best.price ? best.compareAt : undefined;
    out.push({
      id: p.id,
      title: p.title,
      price: best.price,
      compareAt,
      discount: compareAt ? Math.round((1 - best.price / compareAt) * 100) : 0,
      image: p.image,
      image2: p.image2,
      variantId: best.id,
      url: `https://${domain}/products/${p.handle}`,
      createdAt: p.createdAt,
    });
  }

    if (opts.newest) out.sort((a, b) => b.createdAt - a.createdAt);
  else if (opts.onlySale) out.sort((a, b) => b.discount - a.discount);
  // jab khud ready-to-ship collection khol rahe ho to dobara sort ki zaroorat nahi
  if (opts.collection === "ready-to-ship") return out;
  return readyFirst(out, await readyToShipIds(domain));
}



const listCollections = tool(
  async () => {
    try {
      const domain = process.env.SHOPIFY_STORE_DOMAIN;
      if (!domain) throw new Error("SHOPIFY_STORE_DOMAIN is not set");
      const cols = await loadCollections(domain);
      return cols.slice(0, 80).map((c) => `${c.handle} | ${c.title} (${c.count})`).join("\n");
    } catch (e) {
      return `error: ${e instanceof Error ? e.message : "failed"}`;
    }
  },
  {
    name: "list_collections",
    description: "List the store's collections as 'handle | title (product count)'. Use it to find the right collection handle (sales, categories, themes).",
    schema: z.object({}),
  },
);

const browseStore = tool(
  async ({ collection, onlySale, newest, minPrice, maxPrice }) => {
    try {
      const results = await browseProducts({ collection, onlySale, newest, minPrice, maxPrice });
      const top = results.slice(0, 5).map((p) => ({
        title: p.title, price: p.price, compareAt: p.compareAt, discount: p.discount, url: p.url,
      }));
      return [JSON.stringify({ total: results.length, top }), results.slice(0, 400)];
    } catch (e) {
      return [JSON.stringify({ error: e instanceof Error ? e.message : "browse failed" }), []];
    }
  },
  {
    name: "browse_store",
    description:
      "Browse products without a keyword: a whole collection (by handle), only discounted items (onlySale), or new arrivals (newest). Optional price range in USD.",
    responseFormat: "content_and_artifact",
    schema: z.object({
      collection: z.string().optional().describe("collection handle from list_collections"),
      onlySale: z.boolean().optional().describe("true to show only discounted products"),
      newest: z.boolean().optional().describe("true to sort by newest first"),
      minPrice: z.number().optional(),
      maxPrice: z.number().optional(),
    }),
  },
);

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

const searchProducts = tool(
  async ({ query, minPrice, maxPrice }) => {
    try {
      const results = await findProducts({ query, minPrice, maxPrice });
      // Model ko sirf 5 chhote items + total count (token bachane ke liye)
      const top = results.slice(0, 5).map((p) => ({
        title: p.title,
        price: p.price,
        compareAt: p.compareAt,
        discount: p.discount,
        url: p.url,
      }));
      const content = JSON.stringify({ total: results.length, top });
      // Poori list grid ke liye artifact mein jaati hai, model ko nahi dikhti
      return [content, results.slice(0, 400)];
    } catch (e) {
      return [JSON.stringify({ error: e instanceof Error ? e.message : "search failed" }), []];
    }
  },
  {
    name: "search_products",
    description:
      "Search the store's products by keyword with an optional price range (in USD). Returns the total count and the top 5 matches.",
    responseFormat: "content_and_artifact",
    schema: z.object({
      query: z.string().describe("1-3 product keywords, e.g. 'pendant' or 'oec round'"),
      minPrice: z.number().optional().describe("minimum price in USD"),
      maxPrice: z.number().optional().describe("maximum price in USD"),
    }),
  },
);

const tools = [searchProducts, listCollections, browseStore];

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function systemPrompt(store: StoreConfig) {
  return `LANGUAGE: Always reply in simple, friendly English, no matter what language the shopper writes in. Never use Hindi or Hinglish words.

You are a friendly shopping assistant for the store "${store.name}".

- Keep replies short and warm.
- When the shopper wants to see or find products, ALWAYS call the search_products tool. Never invent products, prices or availability; use only what the tool returns.
- Use only 1-3 simple keywords in the search query (e.g. "oec round", "platinum ring", "pendant"). Do not add filler words like "items", "show", "under" or "between". Put price limits in minPrice and maxPrice.
- All prices are in US dollars ($). Products come in different materials (silver, gold, platinum) as variants, so include the material word in the query when the shopper asks for it.
- The products are also shown in the store grid next to the chat. In your reply, list each product on its own line exactly like this: [Product Name](url) - $price. If a product has a discount above 0, write it like this instead: [Product Name](url) - $price (was $compareAt, X% off). Use the exact url from the tool result. Do not put ** bold around the link. NEVER write images or markdown images.
- The tool returns "total" (how many matched) and "top" (the 5 best). List the products from "top" and mention the total count, saying all matches are in the grid.
- At the very end of EVERY reply that shows or discusses products, add exactly one final line in this format: [[suggestions: Show lab diamond studs | Show eternity bands | Show pendants under $200]]
  Each suggestion is a short, complete request (2-6 words) the shopper could send to you as-is, related to what they searched (e.g. after "ring" suggest a matching band, studs or a pendant; after "platinum" suggest white gold; after "under $80" suggest a higher budget). Use 2-3 suggestions separated by " | ". Do not write any other "You could also try" sentence.
- If the search returns nothing, say so briefly and put 2-3 similar searches in that same [[suggestions: ...]] line.
- For "what's new", "new arrivals" or "latest": call browse_store with newest=true.
- For "sale", "offers", "deals" or "discounts": call browse_store with onlySale=true, and also mention the current offers: ${process.env.STORE_OFFERS ?? "none listed"}.
- For a category, collection or theme (e.g. "black friday", "engagement rings", "ready to ship"): call list_collections first, pick the best matching handle, then call browse_store with that collection. For a specific item type or keyword, use search_products instead.
- Results are already ordered as a mix of Ready to Ship and regular items. Keep that order and do not reorder them.
- You can also greet the shopper and ask about budget, occasion and style.`;
}

// ---------------------------------------------------------------------------
// Graph
// ---------------------------------------------------------------------------

export function buildGraph(store: StoreConfig) {
  const model = new ChatGroq({
    model: process.env.GROQ_MODEL ?? "openai/gpt-oss-120b",
    apiKey: process.env.GROQ_API_KEY,
    temperature: 0.3,
    maxRetries: 1,
  }).bindTools(tools);

  async function callModel(state: typeof MessagesAnnotation.State) {
    const reply = await model.invoke(
      [new SystemMessage(systemPrompt(store)), ...state.messages],
      { signal: AbortSignal.timeout(30_000) },
    );
    return { messages: [reply] };
  }

  return new StateGraph(MessagesAnnotation)
    .addNode("model", callModel)
    .addNode("tools", new ToolNode(tools))
    .addEdge(START, "model")
    .addConditionalEdges("model", toolsCondition) // tool call -> "tools", otherwise END
    .addEdge("tools", "model")
    .compile();
}