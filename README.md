# AI Shopping Web (Next.js + TypeScript + LangGraph)

Setup
1. `npm install`
2. Copy `.env.example` to `.env.local` and fill it in
3. `npm run dev`, then open http://localhost:3000 and http://localhost:3000/api/health

Folders
- `src/app`          pages and API routes
- `src/components`   UI (chat drawer, product cards, cart)  [next]
- `src/lib/shopify`  talks to the store (UCP MCP tools)      [next]
- `src/lib/agent`    LangGraph agent                          [next]
- `src/config`       store config (single store for now)
