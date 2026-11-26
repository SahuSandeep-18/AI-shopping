// One store for now, read from environment variables.
// Later this becomes: getStoreConfig(storeId) -> look the store up (multi-store).

export type StoreConfig = {
  domain: string;
  name: string;
  buyerCountry: string;
  ucpAgentProfile: string;
};

export function getStoreConfig(): StoreConfig {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  if (!domain) {
    throw new Error("SHOPIFY_STORE_DOMAIN is missing. Add it to .env.local");
  }
  return {
    domain: domain.replace(/^https?:\/\//, "").replace(/\/$/, ""),
    name: process.env.STORE_NAME ?? domain,
    buyerCountry: process.env.BUYER_COUNTRY ?? "IN",
    ucpAgentProfile:
      process.env.UCP_AGENT_PROFILE ??
      "https://shopify.dev/ucp/agent-profiles/examples/2026-04-08/valid-with-capabilities.json",
  };
}
