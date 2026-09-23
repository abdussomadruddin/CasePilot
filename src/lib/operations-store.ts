import { getSupabaseClient } from "@/lib/supabase";
import type {
  AppointmentRecord,
  LeadNote,
  LeadRecord,
  LeadStatus,
} from "@/lib/types";

type LeadRow = {
  id: string;
  owner_id: string;
  customer_name: string;
  customer_phone: string;
  phone_revealed_at: string | null;
  email: string | null;
  car_brand: string;
  car_model: string;
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
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    phoneRevealedAt: row.phone_revealed_at || "",
    email: row.email || "",
    carBrand: row.car_brand,
    carModel: row.car_model,
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
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("leads").upsert({
    id: lead.id,
    owner_id: lead.ownerId,
    customer_name: lead.customerName.trim(),
    customer_phone: lead.customerPhone.trim(),
    phone_revealed_at: lead.phoneRevealedAt || null,
    email: lead.email.trim() || null,
    car_brand: lead.carBrand,
    car_model: lead.carModel,
    status: lead.status,
    created_at: lead.createdAt,
  });
  if (error) throw error;
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

export async function revealLeadPhone(leadId: string) {
  const { error } = await getSupabaseClient()
    .from("leads")
    .update({ phone_revealed_at: new Date().toISOString() })
    .eq("id", leadId);
  if (error) throw error;
}

export async function deleteLead(leadId: string) {
  const { error } = await getSupabaseClient()
    .from("leads")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", leadId);
  if (error) throw error;
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
