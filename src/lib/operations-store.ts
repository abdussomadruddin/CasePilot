import { getSupabaseClient } from "@/lib/supabase";
import { extractLeadContact } from "../../supabase/functions/_shared/lead-contact";
import { extractLeadVehicle } from "../../supabase/functions/_shared/lead-vehicle";
import type {
  AppointmentRecord,
  LeadNote,
  LeadRecord,
  LeadStatus,
} from "@/lib/types";

type LeadRow = {
  id: string;
  owner_id: string;
  source: LeadRecord["source"];
  source_lead_id: string | null;
  source_detail: string | null;
  source_note: string | null;
  connector_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  phone_revealed_at: string | null;
  follow_up_activity_at: string | null;
  email: string | null;
  car_brand: string | null;
  car_model: string | null;
  status: LeadStatus;
  created_at: string;
  updated_at: string;
  lead_notes?: Array<{
    id: string;
    author_id: string;
    body: string;
    created_at: string;
  }>;
  lead_events?: Array<{
    id: string;
    actor_id: string;
    status: LeadStatus;
    created_at: string;
  }>;
};

type AppointmentRow = {
  id: string;
  owner_id: string;
  lead_id: string | null;
  case_id: string | null;
  kind: AppointmentRecord["kind"];
  status: AppointmentRecord["status"];
  starts_at: string;
  location: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function mapLead(row: LeadRow): LeadRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    source: row.source || "manual_upload",
    sourceLeadId: row.source_lead_id || "",
    sourceDetail: row.source_detail || "",
    sourceNote: row.source_note || "",
    connectorId: row.connector_id || "",
    customerName: row.customer_name || "",
    customerPhone: row.customer_phone || "",
    phoneRevealedAt: row.phone_revealed_at || "",
    followUpActivityAt: row.follow_up_activity_at || "",
    email: row.email || "",
    carBrand: row.car_brand || "",
    carModel: row.car_model || "",
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    notes: (row.lead_notes || [])
      .map((note): LeadNote => ({
        id: note.id,
        authorId: note.author_id,
        body: note.body,
        createdAt: note.created_at,
      }))
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    events: (row.lead_events || [])
      .map((event) => ({
        id: event.id,
        actorId: event.actor_id,
        status: event.status,
        createdAt: event.created_at,
      }))
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
  };
}

export async function loadLeads(): Promise<LeadRecord[]> {
  const { data, error } = await getSupabaseClient()
    .from("leads")
    .select("*,lead_notes(*),lead_events(*)")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return ((data || []) as LeadRow[]).map(mapLead);
}

export async function saveLead(
  lead: LeadRecord,
  actorId: string,
  note = "",
  previousStatus?: LeadStatus,
  requireRejectionNote = true,
): Promise<void> {
  const supabase = getSupabaseClient();
  const isRejecting = lead.status === "rejected" && previousStatus !== "rejected";
  if (isRejecting && requireRejectionNote && !note.trim()) throw new Error("Add a note explaining why the lead was rejected.");
  const contact = extractLeadContact(note, {
    name: lead.customerName,
    phone: lead.customerPhone,
    email: lead.email,
  });
  const vehicle = extractLeadVehicle(note, { brand: lead.carBrand, model: lead.carModel });
  const values = {
    owner_id: lead.ownerId,
    customer_name: contact.name || null,
    customer_phone: contact.phone || null,
    phone_revealed_at: lead.phoneRevealedAt || null,
    email: contact.email || null,
    car_brand: vehicle.brand || null,
    car_model: vehicle.model || null,
    status: lead.status,
    ...(isRejecting ? { rejection_reason: note.trim() } : {}),
  };
  const { data, error } = previousStatus === undefined
    ? await supabase.from("leads").insert({ id: lead.id, ...values, source: "manual_upload", created_at: lead.createdAt }).select("id").single()
    : await supabase.from("leads").update(values).eq("id", lead.id).select("id").single();
  if (error) throw error;
  if (!data) throw new Error("Lead was not saved. Please refresh and try again.");
  if (!previousStatus || previousStatus !== lead.status) {
    const { error: eventError } = await supabase.from("lead_events").insert({
      lead_id: lead.id,
      actor_id: actorId,
      status: lead.status,
    });
    if (eventError) throw eventError;
  }
  if (note.trim()) await addLeadNote(lead.id, actorId, note);
}

export async function addLeadNote(leadId: string, actorId: string, body: string) {
  const { error } = await getSupabaseClient().from("lead_notes").insert({
    lead_id: leadId,
    author_id: actorId,
    body: body.trim(),
  });
  if (error) throw error;
}

export async function revealLeadPhone(leadId: string, actorId: string) {
  const { data, error } = await getSupabaseClient()
    .from("leads")
    .update({ phone_revealed_at: new Date().toISOString(), status: "contacted" })
    .eq("id", leadId)
    .is("phone_revealed_at", null)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Lead could not be contacted. Please refresh and try again.");
  const { error: eventError } = await getSupabaseClient().from("lead_events").insert({
    lead_id: leadId,
    actor_id: actorId,
    status: "contacted",
  });
  if (eventError) console.warn("Unable to record lead contact event:", eventError);
}

export async function deleteLead(leadId: string) {
  const { data, error } = await getSupabaseClient()
    .from("leads")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", leadId)
    .is("deleted_at", null)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Lead was not deleted. Please refresh and try again.");
}

function mapAppointment(row: AppointmentRow): AppointmentRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    leadId: row.lead_id || "",
    caseId: row.case_id || "",
    kind: row.kind,
    status: row.status,
    startsAt: row.starts_at,
    location: row.location || "",
    notes: row.notes || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function loadAppointments(): Promise<AppointmentRecord[]> {
  const { data, error } = await getSupabaseClient()
    .from("appointments")
    .select("*")
    .order("starts_at", { ascending: true });
  if (error) throw error;
  return ((data || []) as AppointmentRow[]).map(mapAppointment);
}

export async function saveAppointment(appointment: AppointmentRecord): Promise<void> {
  const { error } = await getSupabaseClient().from("appointments").upsert({
    id: appointment.id,
    owner_id: appointment.ownerId,
    lead_id: appointment.leadId || null,
    case_id: appointment.caseId || null,
    kind: appointment.kind,
    status: appointment.status,
    starts_at: appointment.startsAt,
    location: appointment.location.trim() || null,
    notes: appointment.notes.trim() || null,
    created_at: appointment.createdAt,
  });
  if (error) throw error;
}
