import { AIMessage, HumanMessage, type BaseMessage } from "@langchain/core/messages";
import { getStoreConfig } from "@/config/store";
import { buildGraph } from "@/lib/agent/graph";
import { saveMessages } from "@/lib/db";

// Nothing is stored on the server: the browser sends the whole conversation each time.

type ChatMessage = { role: "user" | "assistant"; content: string };

const MAX_MESSAGES = 30;
const MAX_CHARS = 2000;

function parseMessages(body: unknown): ChatMessage[] | null {
  const raw = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MESSAGES) return null;
  const out: ChatMessage[] = [];
  for (const m of raw) {
    const role = (m as ChatMessage)?.role;
    const content = (m as ChatMessage)?.content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;
    const text = content.trim();
    if (!text || text.length > MAX_CHARS) return null;
    out.push({ role, content: text });
  }
  return out[out.length - 1].role === "user" ? out : null; // last one must be the shopper's
}

// Model replies can be a string or a list of parts; get plain text either way.
function textOf(message: BaseMessage): string {
  const c = message.content;
  if (typeof c === "string") return c;
  return c.map((part) => (part.type === "text" ? part.text : "")).join("");
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const messages = parseMessages(body);
  if (!messages) return Response.json({ error: "Invalid messages" }, { status: 400 });

  try {
    const graph = buildGraph(getStoreConfig());
    console.time("[graph]");
    const result = await graph.invoke(
      {
        messages: messages
        .slice(-10)
        .map((m) => (m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content))),
      },
      { recursionLimit: 8 },
    );
    console.timeEnd("[graph]");
    const last = result.messages[result.messages.length - 1];

    // Sirf is turn ka latest search_products result (purani searches ke products nahi)
    const lastUser = result.messages.map((m) => m.getType()).lastIndexOf("human");
    const toolMsg = result.messages
      .slice(lastUser + 1)
      .reverse()
      .find(
        (m) =>
          m.getType() === "tool" &&
          ["search_products", "browse_store"].includes((m as { name?: string }).name ?? ""),
      );

    const artifact = (toolMsg as { artifact?: unknown } | undefined)?.artifact;
    const products: unknown[] = Array.isArray(artifact) ? artifact : [];

    let conversationId: string | null =
      typeof (body as any)?.conversationId === "string" ? (body as any).conversationId : null;
    const sessionId =
      typeof (body as any)?.sessionId === "string" ? (body as any).sessionId.slice(0, 100) : "anon";

    // DB fail ho to bhi chat chalti rahe
    try {
      conversationId = await saveMessages(sessionId, conversationId, [
        { role: "user", content: messages[messages.length - 1].content },
        { role: "assistant", content: textOf(last), products: products as unknown[] },
      ]);
    } catch (e) {
      console.error("[db]", e);
    }

    return Response.json({ reply: textOf(last), products, conversationId });
  } catch (e) {
    console.error("[chat]", e);
    const detail = e instanceof Error ? e.message : String(e);
    return Response.json(
      {
        error: "The AI did not respond. Please try again in a moment.",
        ...(process.env.NODE_ENV !== "production" && { detail: detail.slice(0, 400) }),
      },
      { status: 500 },
    );
  }
}
