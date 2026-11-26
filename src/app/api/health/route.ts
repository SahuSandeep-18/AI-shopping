import { getStoreConfig } from "@/config/store";

// Quick check that setup is correct: open http://localhost:3000/api/health
export async function GET() {
  const missing = ["SHOPIFY_STORE_DOMAIN", "GROQ_API_KEY"].filter((k) => !process.env[k]);
  if (missing.length > 0) {
    return Response.json(
      { ok: false, message: "Add these to .env.local and restart", missing },
      { status: 500 },
    );
  }
  const store = getStoreConfig();
  return Response.json({
    ok: true,
    store: { domain: store.domain, name: store.name },
    groqKeySet: true, // never return the key itself
    groqModel: process.env.GROQ_MODEL ?? "openai/gpt-oss-120b",
  });
}
