export type AiDevice = { sessionId: string; phone: string; name: string; status?: string; userId?: string };
export type AiSettings = {
  configured: boolean; murpatiConfigured: boolean; encryptionReady: boolean; revision: number;
  devices: AiDevice[]; selectedDevice: string; dailyLimit: number;
  members?: { id: string; name: string }[];
};
export type AiDraft = {
  provider?: "openai" | "murpati_manual";
  id: string; text: string; blocked: boolean; reason: string; device: AiDevice;
  recipient: string; customerName: string; source: "conversation" | "notes";
  lastMessageAt: string | null; expiresAt: string;
};
