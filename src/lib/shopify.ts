const FRAGMENT = `
fragment CartFields on Cart {
  id
  checkoutUrl
  totalQuantity
  cost { subtotalAmount { amount currencyCode } }
  lines(first: 100) {
    nodes {
      id
      quantity
      attributes { key value }
      cost { totalAmount { amount } }
      merchandise {
        ... on ProductVariant {
          id
          title
          image { url }
          product { title handle }
        }
      }
    }
  }
}`;

async function storefront(query: string, variables: Record<string, unknown>) {
  const domain = process.env.SHOPIFY_STOREFRONT_DOMAIN ?? process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_STOREFRONT_TOKEN;
  const version = process.env.SHOPIFY_API_VERSION ?? "2026-07";
  if (!domain || !token) throw new Error("Storefront credentials are not set");

  const res = await fetch(`https://${domain}/api/${version}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Shopify-Storefront-Private-Token": token,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Shopify error (${res.status})`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

export type CartLine = {
  id: string;
  quantity: number;
  title: string;
  variantTitle: string;
  image: string;
  total: number;
  url: string;
  properties: { key: string; value: string }[];
};
export type Cart = {
  id: string;
  checkoutUrl: string;
  totalQuantity: number;
  subtotal: number;
  currency: string;
  lines: CartLine[];
};

function shape(c: any): Cart | null {
  if (!c) return null;
  return {
    id: c.id,
    checkoutUrl: c.checkoutUrl,
    totalQuantity: c.totalQuantity,
    subtotal: Number(c.cost.subtotalAmount.amount),
    currency: c.cost.subtotalAmount.currencyCode,
    lines: c.lines.nodes.map((l: any) => ({
      id: l.id,
      quantity: l.quantity,
      title: l.merchandise.product.title,
      variantTitle: l.merchandise.title === "Default Title" ? "" : l.merchandise.title,
      image: l.merchandise.image?.url ?? "",
      total: Number(l.cost.totalAmount.amount),
      properties: (l.attributes ?? []).filter((a: any) => a.key && !a.key.startsWith("_")),
      url: `https://${process.env.SHOPIFY_STORE_DOMAIN}/products/${l.merchandise.product.handle}`,
    })),
  };
}

function check(payload: any) {
  if (payload?.userErrors?.length) throw new Error(payload.userErrors[0].message);
  return shape(payload?.cart);
}

const gid = (id: string) => `gid://shopify/ProductVariant/${id}`;

export async function cartGet(cartId: string) {
  const d = await storefront(
    `query($id: ID!) { cart(id: $id) { ...CartFields } } ${FRAGMENT}`,
    { id: cartId },
  );
  return shape(d.cart);
}

export type Props = Record<string, string>;
const toAttrs = (p?: Props) =>
  Object.entries(p ?? {})
    .filter(([k, v]) => k && v)
    .map(([key, value]) => ({ key, value }));

export async function cartCreate(variantId: string, quantity: number, props?: Props) {
  const d = await storefront(
    `mutation($lines: [CartLineInput!]) {
      cartCreate(input: { lines: $lines }) { cart { ...CartFields } userErrors { message } }
    } ${FRAGMENT}`,
    { lines: [{ merchandiseId: gid(variantId), quantity, attributes: toAttrs(props) }] },
  );
  return check(d.cartCreate);
}

export async function cartAdd(cartId: string, variantId: string, quantity: number, props?: Props) {
  const d = await storefront(
    `mutation($cartId: ID!, $lines: [CartLineInput!]!) {
      cartLinesAdd(cartId: $cartId, lines: $lines) { cart { ...CartFields } userErrors { message } }
    } ${FRAGMENT}`,
    { cartId, lines: [{ merchandiseId: gid(variantId), quantity, attributes: toAttrs(props) }] },
  );
  return check(d.cartLinesAdd);
}

export async function cartUpdate(cartId: string, lineId: string, quantity: number) {
  const d = await storefront(
    `mutation($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
      cartLinesUpdate(cartId: $cartId, lines: $lines) { cart { ...CartFields } userErrors { message } }
    } ${FRAGMENT}`,
    { cartId, lines: [{ id: lineId, quantity }] },
  );
  return check(d.cartLinesUpdate);
}

export async function cartRemove(cartId: string, lineId: string) {
  const d = await storefront(
    `mutation($cartId: ID!, $lineIds: [ID!]!) {
      cartLinesRemove(cartId: $cartId, lineIds: $lineIds) { cart { ...CartFields } userErrors { message } }
    } ${FRAGMENT}`,
    { cartId, lineIds: [lineId] },
  );
  return check(d.cartLinesRemove);
}