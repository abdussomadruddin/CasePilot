import { emptyInvoice, type InvoiceData } from "@/lib/invoice";
import { emptyVsoData, type VsoData } from "@/lib/honda-vso.mjs";
import { emptyReceipt, type ReceiptData } from "@/lib/receipt";
import { getSupabaseClient } from "@/lib/supabase";

export type DocumentKind = "invoice" | "honda_vso" | "receipt";
export type DocumentData = Record<string, string | boolean>;
export type ClientRow = { id: string; owner_id: string; data: Record<string, string>; version: number; updated_at: string };
export type PurchaseRow = { id: string; client_id: string; data: Record<string, string>; version: number; updated_at: string };
export type DraftRow = { id: string; purchase_id: string; kind: DocumentKind; data: DocumentData; version: number; updated_at: string };
export type ClientBundle = { client: ClientRow; purchase: PurchaseRow; documents: DraftRow[] };
export const clientFields = { customerName: "Nama client", phone: "Telefon", email: "Email", nric: "NRIC / Passport", address: "Alamat" };
export const purchaseFields = { label: "Nama set pembelian", make: "Brand", model: "Model", variant: "Variant", colour: "Warna", chassisNo: "Chassis no.", engineNo: "Engine no.", plate: "Plate no.", transmission: "Transmission" };
const fieldMap: Record<DocumentKind, Record<string, string>> = {
  invoice: { customerName: "customerName", model: "model", variant: "variant", colour: "colour", chassis: "chassisNo", plate: "plate" },
  honda_vso: { customerName: "customerName", mobilePhone: "phone", nric: "nric", address: "address", model: "model", variant: "variant", colour: "colour", chassisNo: "chassisNo", engineNo: "engineNo" },
  receipt: { customerName: "customerName", address: "address", make: "make", model: "model", variant: "variant", colour: "colour", chassisNo: "chassisNo", engineNo: "engineNo", transmission: "transmission" },
};
export function normalizedClientPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("60") ? digits : digits.startsWith("0") ? `60${digits.slice(1)}` : /^[1]\d{8,9}$/.test(digits) ? `60${digits}` : digits;
}
export function blankBundle(ownerId: string): ClientBundle {
  const cid = crypto.randomUUID(), pid = crypto.randomUUID();
  return { client: { id: cid, owner_id: ownerId, data: {}, version: 0, updated_at: "" }, purchase: { id: pid, client_id: cid, data: {}, version: 0, updated_at: "" }, documents: [] };
}
export function newDraft(kind: DocumentKind, purchaseId: string, preparedName: string, preparedPhone: string): DraftRow {
  const data = kind === "invoice" ? { ...emptyInvoice(), preparedName, preparedPhone } : kind === "receipt" ? { ...emptyReceipt(), preparedName, preparedPhone } : { ...emptyVsoData(), salesAdvisorName: preparedName };
  return { id: crypto.randomUUID(), purchase_id: purchaseId, kind, data, version: 0, updated_at: "" };
}
export function documentWithShared(kind: DocumentKind, draft: DocumentData, clientData: Record<string, string>, purchaseData: Record<string, string>): DocumentData {
  const data = { ...draft };
  for (const [field, shared] of Object.entries(fieldMap[kind])) {
    const source = shared in clientFields ? clientData : purchaseData;
    if (shared in source) data[field] = source[shared];
  }
  return data;
}
export function updateDocument(bundle: ClientBundle, draft: DraftRow, data: DocumentData): ClientBundle {
  const client = { ...bundle.client, data: { ...bundle.client.data } };
  const purchase = { ...bundle.purchase, data: { ...bundle.purchase.data } };
  for (const [field, shared] of Object.entries(fieldMap[draft.kind])) {
    const value = data[field];
    if (typeof value === "string") (shared in clientFields ? client.data : purchase.data)[shared] = value;
  }
  client.data.normalizedPhone = normalizedClientPhone(client.data.phone || "");
  return { client, purchase, documents: bundle.documents.map(item => item.id === draft.id ? { ...item, data } : item) };
}
export async function listClients(): Promise<ClientRow[]> {
  const { data, error } = await getSupabaseClient().from("document_clients").select("*").order("updated_at", { ascending: false });
  if (error) throw error;
  return data || [];
}
export async function listPurchases(clientId: string): Promise<PurchaseRow[]> {
  const { data, error } = await getSupabaseClient().from("client_purchases").select("*").eq("client_id", clientId).order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}
export async function loadBundle(client: ClientRow, purchase: PurchaseRow): Promise<ClientBundle> {
  const { data, error } = await getSupabaseClient().from("client_document_drafts").select("*").eq("purchase_id", purchase.id).order("created_at");
  if (error) throw error;
  return { client, purchase, documents: data || [] };
}
export async function saveBundle(bundle: ClientBundle, saveToken: string): Promise<ClientBundle> {
  const { data, error } = await getSupabaseClient().rpc("save_client_document_bundle", { payload: { ...bundle, saveToken } });
  if (error) throw error;
  return data as ClientBundle;
}
export function asInvoice(data: DocumentData) { return data as InvoiceData; }
export function asVso(data: DocumentData) { return data as VsoData; }
export function asReceipt(data: DocumentData) { return data as ReceiptData; }
