// This transport exposes an explicit read-only allowlist, never arbitrary AI tools.
export function isMcpCredential(value: string) { return value.startsWith("https://mcp.murpati.com/"); }
export function validateMcpUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "mcp.murpati.com" || url.port || url.username || url.password || url.hash || url.search || !/^\/c\/sk_[a-zA-Z0-9_-]+\/mcp$/.test(url.pathname)) throw new Error("Gunakan connector link rasmi daripada Murpati Settings → API Keys.");
  return url.toString();
}
export type McpDevice = { id: string; phone?: string; name: string; status: string; kind: string; readable: boolean };
export type McpConversation = { conversation_id: string; phone_number?: string; device_phone?: string; channel: string; is_group: boolean };
export type McpMessage = { from: string; at: string; text: string };
export class MurpatiMcp {
  private session = "";
  private sequence = 0;
  private initialized = false;
  private url: string;
  private fetcher: typeof fetch;
  constructor(credential: string, fetcher = fetch) { this.url = validateMcpUrl(credential); this.fetcher = fetcher; }
  private async rpc(method: string, params: unknown): Promise<unknown> {
    const id = ++this.sequence;
    let res;
    try {
      res = await this.fetcher(this.url, { method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000),
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(this.session ? { "Mcp-Session-Id": this.session, "MCP-Protocol-Version": "2025-03-26" } : {}) },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
    } catch { throw new Error("MCP Murpati tidak dapat dihubungi. Cuba semula."); }
    if (!res.ok) throw new Error(res.status === 429 ? "Had bacaan MCP Murpati dicapai. Cuba semula kemudian." : res.status === 401 || res.status === 403 ? "Connector MCP Murpati tidak sah atau akses ditolak. Hubungi Admin." : "Bacaan MCP Murpati gagal. Cuba semula.");
    this.session = res.headers.get("mcp-session-id") || this.session;
    let envelope;
    try {
      const raw = await res.text();
      if (raw.length > 2000000) throw new Error();
      if (res.headers.get("content-type")?.includes("text/event-stream")) {
        envelope = raw.split(/\r?\n\r?\n/).map((event) => event.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n")).filter(Boolean).map((data) => JSON.parse(data)).find((event) => event.id === id);
      } else envelope = JSON.parse(raw);
    } catch { throw new Error("Respons MCP Murpati tidak dapat disahkan."); }
    if (envelope?.id !== id || envelope.error || !envelope.result) throw new Error("MCP Murpati menolak bacaan. Semak connector dan akses.");
    return envelope.result;
  }
  async read<T>(name: "list_devices" | "list_conversations" | "read_conversations", args: Record<string, unknown>): Promise<T> {
    // Runtime guard also protects against untyped callers.
    if (!["list_devices", "list_conversations", "read_conversations"].includes(name)) throw new Error("Alat MCP ini tidak dibenarkan.");
    if (!this.initialized) {
      await this.rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "CasePilot", version: "1.0" } });
      this.initialized = true;
    }
    const result = await this.rpc("tools/call", { name, arguments: args }) as { isError?: boolean; structuredContent?: T; content?: { type: string; text?: string }[] };
    if (result.isError) throw new Error("MCP Murpati tidak dapat membaca conversation ini.");
    if (result.structuredContent) return result.structuredContent;
    try { return JSON.parse(result.content?.filter((c) => c.type === "text").map((c) => c.text || "").join("\n") || "") as T; }
    catch { throw new Error("Format bacaan MCP Murpati tidak sah."); }
  }
}
export function murpatiMessageTime(value: string) {
  const match = value.match(/^(\d{4}-\d{2}-\d{2}) (\d{1,2}):(\d{2})(am|pm)$/i);
  if (!match) throw new Error("Masa mesej MCP Murpati tidak dapat disahkan.");
  let hour = Number(match[2]);
  if (hour < 1 || hour > 12 || Number(match[3]) > 59) throw new Error("Masa mesej MCP Murpati tidak sah.");
  hour = hour % 12 + (match[4].toLowerCase() === "pm" ? 12 : 0);
  const date = new Date(`${match[1]}T${String(hour).padStart(2, "0")}:${match[3]}:00+08:00`);
  if (!Number.isFinite(date.getTime())) throw new Error("Masa mesej MCP Murpati tidak sah.");
  return date.toISOString();
}
