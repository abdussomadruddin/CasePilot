import { getSupabaseClient } from "@/lib/supabase";

export type LeadConnector = {
  id: string;
  source: "meta_ads" | "tiktok_ads";
  label: string;
  ownerId: string;
  keyHint: string;
  active: boolean;
  lastUsedAt: string;
  createdAt: string;
};

type ConnectorRow = {
  id: string;
  source: LeadConnector["source"];
  label: string;
  owner_id: string;
  key_hint: string;
  active: boolean;
  last_used_at: string | null;
  created_at: string;
};

function mapConnector(row: ConnectorRow): LeadConnector {
  return {
    id: row.id,
    source: row.source,
    label: row.label,
    ownerId: row.owner_id,
    keyHint: row.key_hint,
    active: row.active,
    lastUsedAt: row.last_used_at || "",
    createdAt: row.created_at,
  };
}

export async function loadLeadConnectors(): Promise<LeadConnector[]> {
  const { data, error } = await getSupabaseClient().from("lead_connectors")
    .select("id,source,label,owner_id,key_hint,active,last_used_at,created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data || []) as ConnectorRow[]).map(mapConnector);
}

async function makeKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const key = `cp_${Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)));
  return {
    key,
    hash: Array.from(digest).map((byte) => byte.toString(16).padStart(2, "0")).join(""),
    hint: key.slice(-8),
  };
}

export async function createLeadConnector(input: {
  source: LeadConnector["source"];
  label: string;
  ownerId: string;
}) {
  const generated = await makeKey();
  const { error } = await getSupabaseClient().from("lead_connectors").insert({
    source: input.source,
    label: input.label.trim(),
    owner_id: input.ownerId,
    key_hash: generated.hash,
    key_hint: generated.hint,
  });
  if (error) throw error;
  return generated.key;
}

export async function rotateLeadConnector(id: string) {
  const generated = await makeKey();
  const { data, error } = await getSupabaseClient().from("lead_connectors")
    .update({ key_hash: generated.hash, key_hint: generated.hint, active: true })
    .eq("id", id).select("id").single();
  if (error) throw error;
  if (!data) throw new Error("Connector was not updated.");
  return generated.key;
}

export async function updateLeadConnector(id: string, changes: { ownerId?: string; active?: boolean }) {
  const values = {
    ...(changes.ownerId ? { owner_id: changes.ownerId } : {}),
    ...(changes.active !== undefined ? { active: changes.active } : {}),
  };
  const { data, error } = await getSupabaseClient().from("lead_connectors")
    .update(values).eq("id", id).select("id").single();
  if (error) throw error;
  if (!data) throw new Error("Connector was not updated.");
}
