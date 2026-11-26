import { Pool } from "pg";

// dev mein hot reload par baar baar naya pool na bane
const g = globalThis as unknown as { pgPool?: Pool };

export const pool =
  g.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
  });

if (process.env.NODE_ENV !== "production") g.pgPool = pool;

// ---------------------------------------------------------------------------
// Chat messages
// ---------------------------------------------------------------------------

export async function saveMessages(
  sessionId: string,
  conversationId: string | null,
  rows: { role: "user" | "assistant"; content: string; products?: unknown[] }[],
): Promise<string> {
  let convId = conversationId;

  if (!convId) {
    const r = await pool.query<{ id: string }>(
      "INSERT INTO conversations (session_id) VALUES ($1) RETURNING id",
      [sessionId],
    );
    convId = r.rows[0].id;
  }

  for (const m of rows) {
    await pool.query(
      "INSERT INTO messages (conversation_id, role, content, products) VALUES ($1, $2, $3, $4)",
      [convId, m.role, m.content, m.products?.length ? JSON.stringify(m.products) : null],
    );
  }
  return convId;
}

// ---------------------------------------------------------------------------
// Events (clicks, cart actions, wishlist actions)
// ---------------------------------------------------------------------------

export async function saveEvent(e: {
  sessionId: string;
  conversationId?: string | null;
  type: string;
  productId?: string;
  productTitle?: string;
  variantId?: string;
  price?: number;
  quantity?: number;
  source?: string;
}) {
  await pool.query(
    `INSERT INTO events
       (session_id, conversation_id, type, product_id, product_title, variant_id, price, quantity, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      e.sessionId, e.conversationId ?? null, e.type, e.productId ?? null,
      e.productTitle ?? null, e.variantId ?? null, e.price ?? null, e.quantity ?? null, e.source ?? null,
    ],
  );
}

// ---------------------------------------------------------------------------
// Wishlist
// ---------------------------------------------------------------------------

export type WishItem = {
  id: string;
  title: string;
  price: number;
  image: string;
  url: string;
};

export async function wishlistList(sessionId: string): Promise<WishItem[]> {
  const r = await pool.query(
    `SELECT product_id, product_title, price, image, url
     FROM wishlist_items WHERE session_id = $1 ORDER BY created_at DESC`,
    [sessionId],
  );
  return r.rows.map((x) => ({
    id: x.product_id,
    title: x.product_title,
    price: Number(x.price ?? 0),
    image: x.image ?? "",
    url: x.url ?? "",
  }));
}

export async function wishlistAdd(sessionId: string, p: WishItem) {
  // ON CONFLICT DO NOTHING: already saved -> ignore silently
  await pool.query(
    `INSERT INTO wishlist_items (session_id, product_id, product_title, price, image, url)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (session_id, product_id) DO NOTHING`,
    [sessionId, p.id, p.title, p.price, p.image, p.url],
  );
}

export async function wishlistRemove(sessionId: string, productId: string) {
  await pool.query("DELETE FROM wishlist_items WHERE session_id = $1 AND product_id = $2", [
    sessionId,
    productId,
  ]);
}