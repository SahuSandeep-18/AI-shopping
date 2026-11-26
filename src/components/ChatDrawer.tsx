"use client";

import { useEffect, useRef, useState } from "react";
import type { Product } from "@/app/page";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
  products?: Product[];
  label?: string;
};

const GREETING = "Hi! I can help you find the perfect piece. What are you looking for?";
const QUICK = ["What's new?", "Current sales", "Help me find a gift"];

function getSessionId() {
  try {
    let id = localStorage.getItem("sid");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("sid", id);
    }
    return id;
  } catch {
    return "anon";
  }
}

function splitSuggestions(raw: string): { text: string; suggestions: string[] } {
  const m = raw.match(/\[\[\s*suggestions\s*:\s*([^\]]*)\]\]/i);
  const suggestions = m ? m[1].split("|").map((s) => s.trim()).filter(Boolean).slice(0, 3) : [];
  const text = raw.replace(/\[\[\s*suggestions[^\]]*\]\]/gi, "").trim();
  return { text, suggestions };
}

function renderText(raw: string) {
  const text = raw.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\n{3,}/g, "\n\n");
  return text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g).map((part, i) => {
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (link) {
      return (
        <a
          key={i}
          href={link[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-[#2D2B5A] underline decoration-[#AFA9EC] underline-offset-2 transition hover:decoration-[#2D2B5A]"
        >
          {link[1]}
        </a>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function Avatar({ small = false }: { small?: boolean }) {
  return (
    <div
      className={`${small ? "h-[22px] w-[22px] text-[9px]" : "h-9 w-9 text-xs"} flex shrink-0 items-center justify-center rounded-full bg-[#2D2B5A] font-medium text-white`}
    >
      AI
    </div>
  );
}

export default function ChatDrawer({
  onProducts,
}: {
  onProducts: (p: Product[], label?: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false); // mobile bottom sheet
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = scrollRef.current;
    if (box) box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
  }, [messages, loading, expanded]);

  async function send(override?: string) {
    const text = (override ?? input).trim();
    if (!text || loading) return;

    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setExpanded(true);

    try {
      const history = next
        .filter((m) => !m.isError)
        .map(({ role, content }) => ({
          role,
          content: role === "assistant" ? splitSuggestions(content).text || content : content,
        }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, conversationId, sessionId: getSessionId() }),
        signal: AbortSignal.timeout(45_000),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");

      const products: Product[] = Array.isArray(data.products) ? data.products : [];
      setMessages([...next, { role: "assistant", content: data.reply, products, label: text }]);

      if (data.conversationId) {
        setConversationId(data.conversationId);
        try {
          sessionStorage.setItem("cid", data.conversationId);
        } catch {}
      }
      if (products.length > 0) onProducts(products, text);
    } catch (e) {
      const msg =
        e instanceof Error && e.name === "TimeoutError"
          ? "This is taking too long. Please try again."
          : e instanceof Error
            ? e.message
            : "Something went wrong.";
      setMessages([...next, { role: "assistant", content: msg, isError: true }]);
    } finally {
      setLoading(false);
    }
  }

  function newChat() {
    setMessages([]);
    onProducts([]);
    setConversationId(null);
    try {
      sessionStorage.removeItem("cid");
    } catch {}
  }

  return (
    <aside
      className={`z-40 flex flex-col bg-white text-[#2D2B5A]
        max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:rounded-t-3xl max-md:border max-md:border-[#E6E4F7] max-md:shadow-[0_-8px_30px_rgba(45,43,90,0.18)]
        ${expanded ? "max-md:h-[65dvh]" : "max-md:h-auto"}
        md:sticky md:top-16 md:h-[calc(100dvh-4rem)] md:w-[340px] md:shrink-0 md:self-start md:border-l md:border-[#E6E4F7] lg:w-[380px]`}
    >
      {/* mobile handle */}
      <button
        type="button"
        aria-label={expanded ? "Collapse chat" : "Expand chat"}
        onClick={() => setExpanded((v) => !v)}
        className="flex justify-center py-2 md:hidden"
      >
        <span className="h-1 w-10 rounded-full bg-[#CECBF6]" />
      </button>

      <header
        className={`${expanded ? "flex" : "max-md:hidden"} items-center gap-3 border-b border-[#E6E4F7] px-4 py-3 md:flex md:px-5 md:py-4`}
      >
        <Avatar />
        <div className="min-w-0">
          <p className="text-sm font-medium leading-tight">Ouros Jewels AI</p>
          <p className="text-xs text-[#534AB7]">AI shopping assistant</p>
        </div>
        <button
          onClick={newChat}
          className="ml-auto rounded-full border border-[#CECBF6] px-3 py-1 text-xs transition hover:bg-[#F3F2FC]"
        >
          New chat
        </button>
        <button
          onClick={() => setExpanded(false)}
          aria-label="Minimize chat"
          className="rounded-full border border-[#CECBF6] px-2.5 py-0.5 text-lg leading-none transition hover:bg-[#F3F2FC] md:hidden"
        >
          ×
        </button>
      </header>

      <div
        ref={scrollRef}
        className={`${expanded ? "block" : "max-md:hidden"} flex-1 space-y-3 overflow-y-auto p-4 md:block md:p-5`}
      >
        <div className="flex items-end gap-2">
          <Avatar small />
          <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-[#F3F2FC] px-4 py-3 text-sm leading-relaxed">
            {GREETING}
          </div>
        </div>

        {messages.map((m, i) => {
          const { text, suggestions } =
            m.role === "assistant" && !m.isError
              ? splitSuggestions(m.content)
              : { text: m.content, suggestions: [] as string[] };
          const isLast = i === messages.length - 1;

          if (m.role === "user") {
            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[#2D2B5A] px-4 py-3 text-sm leading-relaxed text-white">
                  {m.content}
                </div>
              </div>
            );
          }

          return (
            <div key={i} className="flex items-end gap-2">
              <Avatar small />
              <div className="min-w-0 max-w-[85%]">
                <div
                  className={`whitespace-pre-wrap rounded-2xl rounded-bl-md px-4 py-3 text-sm leading-relaxed ${
                    m.isError ? "bg-red-50 text-red-700" : "bg-[#F3F2FC]"
                  }`}
                >
                  {renderText(text)}
                </div>

                {m.products && m.products.length > 0 && (
                  <button
                    onClick={() => {
                      onProducts(m.products!, m.label);
                      setExpanded(false);
                    }}
                    className="mt-2 flex w-full items-center gap-2 rounded-full border border-[#CECBF6] bg-white py-1.5 pl-2 pr-3 text-left transition hover:bg-[#F3F2FC]"
                  >
                    <span className="flex -space-x-2">
                      {m.products.slice(0, 3).map((p) => (
                        <img
                          key={p.id}
                          src={p.image}
                          alt=""
                          className="h-7 w-7 rounded-md border-2 border-white bg-[#F3F2FC] object-cover"
                        />
                      ))}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-[#534AB7]">
                      Showing results for {m.label}
                    </span>
                    <span className="text-[#7F77DD]">›</span>
                  </button>
                )}

                {isLast && suggestions.length > 0 && !loading && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="rounded-full border border-[#CECBF6] bg-white px-3 py-1.5 text-xs transition hover:border-[#2D2B5A] hover:bg-[#2D2B5A] hover:text-white"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex items-end gap-2">
            <Avatar small />
            <div className="inline-flex items-center gap-1 rounded-2xl rounded-bl-md bg-[#F3F2FC] px-4 py-3">
              <span className="dot h-1.5 w-1.5 rounded-full bg-[#7F77DD]" />
              <span className="dot h-1.5 w-1.5 rounded-full bg-[#7F77DD] [animation-delay:0.15s]" />
              <span className="dot h-1.5 w-1.5 rounded-full bg-[#7F77DD] [animation-delay:0.3s]" />
            </div>
          </div>
        )}
      </div>

      {messages.length === 0 && (
        <div className="flex gap-2 overflow-x-auto px-4 pb-2 md:flex-wrap md:px-5">
          {QUICK.map((q) => (
            <button
              key={q}
              onClick={() => send(q)}
              className="shrink-0 rounded-full border border-[#CECBF6] bg-white px-3 py-1.5 text-xs transition hover:border-[#2D2B5A] hover:bg-[#2D2B5A] hover:text-white"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-[#E6E4F7] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:p-4">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => setExpanded(true)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask anything about our products…"
          maxLength={2000}
          className="min-w-0 flex-1 rounded-full border border-[#E6E4F7] bg-[#F6F5FD] px-4 py-3 text-base outline-none transition placeholder:text-neutral-400 focus:border-[#7F77DD] md:text-sm"
        />
        <button
          onClick={() => send()}
          disabled={loading || !input.trim()}
          aria-label="Send"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2D2B5A] text-white transition hover:bg-[#3C3489] disabled:opacity-40"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </button>
      </div>
    </aside>
  );
}