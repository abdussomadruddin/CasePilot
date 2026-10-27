export type AiDevice = { sessionId: string; phone: string; name: string; status?: string; userId?: string };
export type AiSettings = {
  morningEnabled?: boolean; morningSummary?: {ready:number;pending:number;blocked:number;failed:number};
  configured: boolean; murpatiConfigured: boolean; encryptionReady: boolean; revision: number;
  devices: AiDevice[]; selectedDevice: string; dailyLimit: number;
  members?: { id: string; name: string }[];
};
export type AiDraft = {
  stageId?: string; previousStageId?: string; stageReason?: string; nextAction?: string; stageRevision?: number; playbookRevision?: number;
  stages?: {id:string;name:string}[]; references?: {id:string;title:string}[]; knowledgeIds?: string[];
  preparedAt?: string;
  provider?: "openai" | "murpati_manual";
  id: string; text: string; blocked: boolean; reason: string; device: AiDevice;
  recipient: string; customerName: string; source: "conversation" | "notes";
  lastMessageAt: string | null; expiresAt: string;
};
