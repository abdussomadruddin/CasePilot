"use client";

import {
  CalendarClock,
  CheckCircle2,
  FilePlus2,
  MessageCircle,
  PhoneCall,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import {
  addLeadNote,
  deleteLead,
  saveAppointment,
  saveLead,
  revealLeadPhone,
} from "@/lib/operations-store";
import {
  leadStatuses,
  leadStatusLabels,
  roleLabels,
  type AppointmentKind,
  type AppointmentRecord,
  type CaseRecord,
  type LeadRecord,
  type LeadStatus,
  type Profile,
} from "@/lib/types";

export type VehicleOption = {
  brand: string;
  model: string;
};

type CommonProps = {
  profile: Profile;
  teamMembers: Profile[];
  leads: LeadRecord[];
  cases: CaseRecord[];
  onRefresh: () => Promise<void>;
};

function displayTime(value: string) {
  return new Intl.DateTimeFormat("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function ownerLabel(ownerId: string, members: Profile[]) {
  const owner = members.find((member) => member.id === ownerId);
  return owner ? `${owner.fullName} · ${roleLabels[owner.role]}` : "Owner";
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="mx-auto max-w-xl rounded-md border border-zinc-700 bg-zinc-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 p-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function newLead(profile: Profile): LeadRecord {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    ownerId: profile.id,
    customerName: "",
    customerPhone: "",
    phoneRevealedAt: "",
    email: "",
    carBrand: "",
    carModel: "",
    status: "new",
    createdAt: now,
    updatedAt: now,
    notes: [],
    events: [],
  };
}

export function LeadPanel({
  profile,
  teamMembers,
  leads,
  cases,
  catalog,
  onRefresh,
  onCreateCase,
  onAppointment,
  initialFilter = "all",
}: CommonProps & {
  catalog: VehicleOption[];
  onCreateCase: (lead: LeadRecord) => void;
  onAppointment: (lead: LeadRecord) => void;
  initialFilter?: LeadStatus | "all";
}) {
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<LeadRecord | null>(null);
  const [initialNote, setInitialNote] = useState("");
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState<LeadStatus | "all">(initialFilter);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selected = leads.find((lead) => lead.id === selectedId);
  const shown = leads.filter((lead) => filter === "all" || lead.status === filter);
  const brands = [...new Set(catalog.map((item) => item.brand))];
  const models = draft ? catalog.filter((item) => item.brand === draft.carBrand) : [];

  async function submitLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError("");
    try {
      const previous = leads.find((lead) => lead.id === draft.id);
      await saveLead(draft, profile.id, initialNote, previous?.status);
      await onRefresh();
      setSelectedId(draft.id);
      setDraft(null);
      setInitialNote("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save lead.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(lead: LeadRecord, status: LeadStatus) {
    setSaving(true);
    setError("");
    try {
      await saveLead({ ...lead, status }, profile.id, "", lead.status);
      await onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update status.");
    } finally {
      setSaving(false);
    }
  }

  async function submitNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !note.trim()) return;
    setSaving(true);
    setError("");
    try {
      await addLeadNote(selected.id, profile.id, note);
      setNote("");
      await onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save note.");
    } finally {
      setSaving(false);
    }
  }

  async function removeLead() {
    if (!selected || !window.confirm(`Delete lead ${selected.customerName}?`)) return;
    setSaving(true);
    setError("");
    try {
      await deleteLead(selected.id);
      setSelectedId("");
      await onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete lead.");
    } finally {
      setSaving(false);
    }
  }

  async function callLead(lead: LeadRecord) {
    setError("");
    try {
      if (!lead.phoneRevealedAt) {
        await revealLeadPhone(lead.id);
        await onRefresh();
      }
      window.location.href = `tel:${lead.customerPhone.replace(/[^\d+]/g, "")}`;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to open phone number.");
    }
  }

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-bold text-white">Lead</h2><p className="text-sm text-zinc-400">{leads.length} leads</p></div>
        <button type="button" className="primary-button" onClick={() => { const lead = newLead(profile); if (profile.role === "admin") lead.ownerId = teamMembers.find((member) => member.active && ["customer_service", "broker"].includes(member.role))?.id || ""; setDraft(lead); setInitialNote(""); }}><Plus className="h-4 w-4" /> New Lead</button>
      </div>
      {error ? <p className="rounded-md border border-red-800 bg-red-950/50 p-3 text-sm text-red-100" role="alert">{error}</p> : null}
      <select className="field max-w-xs" value={filter} onChange={(event) => setFilter(event.target.value as LeadStatus | "all")} aria-label="Filter leads by status">
        <option value="all">All statuses ({leads.length})</option>
        {leadStatuses.map((status) => <option key={status} value={status}>{leadStatusLabels[status]} ({leads.filter((lead) => lead.status === status).length})</option>)}
      </select>
      <div className="grid gap-2">
        {shown.map((lead) => (
          <button key={lead.id} type="button" className="surface-card grid w-full gap-2 p-4 text-left hover:border-zinc-500 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" onClick={() => setSelectedId(lead.id)}>
            <div className="min-w-0"><p className="truncate font-semibold text-white">{lead.customerName}</p><p className="text-sm text-zinc-400">{lead.phoneRevealedAt ? `${lead.customerPhone} · ` : ""}{lead.carModel}</p><p className="text-xs text-zinc-500">{ownerLabel(lead.ownerId, teamMembers)}</p></div>
            <span className="w-fit rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-100">{leadStatusLabels[lead.status]}</span>
          </button>
        ))}
        {!shown.length ? <p className="surface-card p-6 text-sm text-zinc-400">No leads in this status.</p> : null}
      </div>

      {selected ? (
        <Modal title={selected.customerName} onClose={() => setSelectedId("")}>
          <div className="grid gap-4 p-4">
            <div className="grid gap-1 text-sm"><p className="text-zinc-400">{selected.phoneRevealedAt ? selected.customerPhone : "Phone hidden"}{selected.email ? ` · ${selected.email}` : ""}</p><p>{selected.carBrand} · {selected.carModel}</p><p className="text-zinc-400">{ownerLabel(selected.ownerId, teamMembers)}</p><p className="text-xs text-zinc-500">Created {displayTime(selected.createdAt)}</p></div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button className="secondary-button" type="button" onClick={() => void callLead(selected)}><PhoneCall className="h-4 w-4" /> Call</button>
              {selected.phoneRevealedAt ? <a className="secondary-button text-emerald-200" href={`https://wa.me/${selected.customerPhone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /> WhatsApp</a> : null}
              <select className="field" aria-label="Lead status" value={selected.status} disabled={saving} onChange={(event) => void updateStatus(selected, event.target.value as LeadStatus)}>{leadStatuses.map((status) => <option key={status} value={status}>{leadStatusLabels[status]}</option>)}</select>
            </div>
            <form className="grid gap-2" onSubmit={submitNote}><label className="text-sm font-medium">Note</label><textarea className="field min-h-20" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add follow-up note" /><button className="secondary-button w-fit" disabled={saving || !note.trim()}><Save className="h-4 w-4" /> Save note</button></form>
            {selected.notes.length || selected.events.length ? <div className="grid max-h-48 gap-2 overflow-y-auto border-t border-zinc-800 pt-3 text-sm"><p className="font-semibold">History</p>{[
              ...selected.notes.map((entry) => ({ id: entry.id, time: entry.createdAt, text: entry.body })),
              ...selected.events.map((entry) => ({ id: entry.id, time: entry.createdAt, text: `Status: ${leadStatusLabels[entry.status]}` })),
            ].sort((a, b) => +new Date(b.time) - +new Date(a.time)).map((entry) => <p key={entry.id} className="rounded-md bg-zinc-900 p-2"><span className="text-xs text-zinc-500">{displayTime(entry.time)}</span><br />{entry.text}</p>)}</div> : null}
            <div className="grid gap-2 border-t border-zinc-800 pt-3 sm:grid-cols-2">
              <button className="secondary-button" type="button" onClick={() => { setDraft(selected); setSelectedId(""); }}><Pencil className="h-4 w-4" /> Edit</button>
              <button className="secondary-button" type="button" onClick={() => { onAppointment(selected); setSelectedId(""); }}><CalendarClock className="h-4 w-4" /> Appointment</button>
              {cases.some((item) => item.leadId === selected.id) ? <span className="flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 className="h-4 w-4" /> Case created</span> : <button className="primary-button" type="button" onClick={() => { onCreateCase(selected); setSelectedId(""); }}><FilePlus2 className="h-4 w-4" /> Create Case</button>}
              <button className="secondary-button border-red-900 text-red-200" type="button" disabled={saving} onClick={() => void removeLead()}><Trash2 className="h-4 w-4" /> Delete</button>
            </div>
          </div>
        </Modal>
      ) : null}

      {draft ? (
        <Modal title={leads.some((lead) => lead.id === draft.id) ? "Edit Lead" : "New Lead"} onClose={() => setDraft(null)}>
          <form className="grid gap-4 p-4" onSubmit={submitLead}>
            {profile.role === "admin" ? <label className="grid gap-1 text-sm">Owner<select className="field" value={draft.ownerId} onChange={(event) => setDraft({ ...draft, ownerId: event.target.value })} required>{teamMembers.filter((member) => member.active && ["customer_service", "broker"].includes(member.role)).map((member) => <option key={member.id} value={member.id}>{ownerLabel(member.id, teamMembers)}</option>)}</select></label> : null}
            <label className="grid gap-1 text-sm">Name<input className="field" value={draft.customerName} onChange={(event) => setDraft({ ...draft, customerName: event.target.value })} required /></label>
            <label className="grid gap-1 text-sm">Phone{leads.some((lead) => lead.id === draft.id) && !draft.phoneRevealedAt ? <input className="field" value="Call the lead to reveal the number" disabled /> : <input className="field" type="tel" value={draft.customerPhone} onChange={(event) => setDraft({ ...draft, customerPhone: event.target.value })} required />}</label>
            <label className="grid gap-1 text-sm">Email (optional)<input className="field" type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">Brand<select className="field" value={draft.carBrand} onChange={(event) => setDraft({ ...draft, carBrand: event.target.value, carModel: "" })} required><option value="">Select brand</option>{brands.map((brand) => <option key={brand}>{brand}</option>)}</select></label>
              <label className="grid gap-1 text-sm">Model<select className="field" value={draft.carModel} onChange={(event) => setDraft({ ...draft, carModel: event.target.value })} required disabled={!draft.carBrand}><option value="">Select model</option>{models.map((model) => <option key={model.model}>{model.model}</option>)}</select></label>
            </div>
            <label className="grid gap-1 text-sm">Status<select className="field" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as LeadStatus })}>{leadStatuses.map((status) => <option key={status} value={status}>{leadStatusLabels[status]}</option>)}</select></label>
            <label className="grid gap-1 text-sm">Note (optional)<textarea className="field min-h-20" value={initialNote} onChange={(event) => setInitialNote(event.target.value)} /></label>
            <div className="flex gap-2"><button className="primary-button" disabled={saving}><Save className="h-4 w-4" /> {saving ? "Saving..." : "Save Lead"}</button><button type="button" className="secondary-button" onClick={() => setDraft(null)}>Cancel</button></div>
          </form>
        </Modal>
      ) : null}
    </section>
  );
}

function appointmentInputTime(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value || "00";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function newAppointment(profile: Profile, subject = ""): AppointmentRecord {
  const now = new Date();
  const isLead = subject.startsWith("lead:");
  return {
    id: crypto.randomUUID(), ownerId: profile.id,
    leadId: isLead ? subject.slice(5) : "",
    caseId: subject.startsWith("case:") ? subject.slice(5) : "",
    kind: "test_drive", status: "scheduled",
    startsAt: new Date(+now + 25 * 60 * 60 * 1000).toISOString(),
    location: "", notes: "", createdAt: now.toISOString(), updatedAt: now.toISOString(),
  };
}

export function AppointmentPanel({
  profile, teamMembers, leads, cases, appointments, initialSubject = "", onRefresh,
}: CommonProps & {
  appointments: AppointmentRecord[];
  initialSubject?: string;
}) {
  const [draft, setDraft] = useState<AppointmentRecord | null>(initialSubject ? newAppointment(profile, initialSubject) : null);
  const [localTime, setLocalTime] = useState(initialSubject ? appointmentInputTime(new Date(+new Date() + 25 * 60 * 60 * 1000).toISOString()) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const now = Date.now();
  const upcoming = appointments.filter((appointment) => appointment.status === "scheduled" && +new Date(appointment.startsAt) >= now);
  const previous = appointments.filter((appointment) => !upcoming.includes(appointment));
  const availableCases = profile.role === "admin" ? cases : cases.filter((record) => record.ownerId === profile.id);
  const availableLeads = profile.role === "admin" ? leads : leads.filter((lead) => lead.ownerId === profile.id);
  const subjectOptions = useMemo(() => [
    ...availableLeads.map((lead) => ({ value: `lead:${lead.id}`, label: `Lead · ${lead.customerName}`, ownerId: lead.ownerId })),
    ...availableCases.map((record) => ({ value: `case:${record.id}`, label: `Case · ${record.customerName}`, ownerId: record.ownerId })),
  ], [availableCases, availableLeads]);

  function openNew() {
    const next = newAppointment(profile);
    setDraft(next);
    setLocalTime(appointmentInputTime(next.startsAt));
    setError("");
  }

  function openEdit(appointment: AppointmentRecord) {
    setDraft(appointment);
    setLocalTime(appointmentInputTime(appointment.startsAt));
    setError("");
  }

  async function submitAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const startsAt = new Date(`${localTime}:00+08:00`).toISOString();
    if (+new Date(startsAt) <= Date.now() && draft.status === "scheduled") {
      setError("Choose a future date and time.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await saveAppointment({ ...draft, startsAt });
      await onRefresh();
      setDraft(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save appointment.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(appointment: AppointmentRecord, status: "completed" | "cancelled") {
    setSaving(true);
    setError("");
    try {
      await saveAppointment({ ...appointment, status });
      await onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update appointment.");
    } finally {
      setSaving(false);
    }
  }

  function appointmentItem(appointment: AppointmentRecord) {
    const subject = subjectOptions.find((item) => item.value === (appointment.leadId ? `lead:${appointment.leadId}` : `case:${appointment.caseId}`));
    return <div key={appointment.id} className="surface-card grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0"><p className="font-semibold text-white">{appointment.kind === "test_drive" ? "Test Drive" : "Delivery"} · {subject?.label || "Record"}</p><p className="text-sm text-zinc-300">{displayTime(appointment.startsAt)}</p><p className="text-xs text-zinc-500">{ownerLabel(appointment.ownerId, teamMembers)}{appointment.location ? ` · ${appointment.location}` : ""}</p>{appointment.notes ? <p className="mt-2 break-words text-sm text-zinc-400">{appointment.notes}</p> : null}</div>
      {appointment.status === "scheduled" ? <div className="flex flex-wrap gap-2"><button type="button" className="secondary-button" onClick={() => openEdit(appointment)}><Pencil className="h-4 w-4" /> Edit</button><button type="button" className="secondary-button" disabled={saving} onClick={() => void updateStatus(appointment, "completed")}><CheckCircle2 className="h-4 w-4" /> Done</button><button type="button" className="secondary-button border-red-900 text-red-200" disabled={saving} onClick={() => void updateStatus(appointment, "cancelled")}><X className="h-4 w-4" /> Cancel</button></div> : <span className="text-sm text-zinc-500">{appointment.status === "completed" ? "Completed" : "Cancelled"}</span>}
    </div>;
  }

  return <section className="grid gap-4">
    <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-white">Appointment</h2><p className="text-sm text-zinc-400">{upcoming.length} upcoming</p></div><button className="primary-button" onClick={openNew}><Plus className="h-4 w-4" /> New Appointment</button></div>
    {error ? <p className="rounded-md border border-red-800 bg-red-950/50 p-3 text-sm text-red-100" role="alert">{error}</p> : null}
    <h3 className="text-sm font-semibold text-zinc-300">Upcoming</h3>
    <div className="grid gap-2">{upcoming.length ? upcoming.map(appointmentItem) : <p className="surface-card p-6 text-sm text-zinc-400">No upcoming appointments.</p>}</div>
    {previous.length ? <><h3 className="mt-4 text-sm font-semibold text-zinc-400">Past and cancelled</h3><div className="grid gap-2">{previous.map(appointmentItem)}</div></> : null}
    {draft ? <Modal title={appointments.some((item) => item.id === draft.id) ? "Edit Appointment" : "New Appointment"} onClose={() => setDraft(null)}>
      <form className="grid gap-4 p-4" onSubmit={submitAppointment}>
        <label className="grid gap-1 text-sm">Type<select className="field" value={draft.kind} onChange={(event) => { const kind = event.target.value as AppointmentKind; setDraft({ ...draft, kind, leadId: kind === "delivery" ? "" : draft.leadId }); }}><option value="test_drive">Test Drive</option><option value="delivery">Delivery</option></select></label>
        <label className="grid gap-1 text-sm">Lead or Case<select className="field" value={draft.leadId ? `lead:${draft.leadId}` : draft.caseId ? `case:${draft.caseId}` : ""} required onChange={(event) => { const option = subjectOptions.find((item) => item.value === event.target.value); setDraft({ ...draft, ownerId: option?.ownerId || profile.id, leadId: event.target.value.startsWith("lead:") ? event.target.value.slice(5) : "", caseId: event.target.value.startsWith("case:") ? event.target.value.slice(5) : "" }); }}><option value="">Select record</option>{subjectOptions.filter((item) => draft.kind === "test_drive" || item.value.startsWith("case:")).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        {draft.leadId || draft.caseId ? <p className="text-xs text-zinc-400">Alerts to {ownerLabel(draft.ownerId, teamMembers)} at 3 days, 1 day, 4 hours and 1 hour. Admin receives the 1-day alert.</p> : null}
        <label className="grid gap-1 text-sm">Date and time (Kuala Lumpur)<input className="field" type="datetime-local" value={localTime} onChange={(event) => setLocalTime(event.target.value)} required /></label>
        <label className="grid gap-1 text-sm">Location (optional)<input className="field" value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} /></label>
        <label className="grid gap-1 text-sm">Notes (optional)<textarea className="field min-h-20" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
        <div className="flex gap-2"><button className="primary-button" disabled={saving}><Save className="h-4 w-4" /> {saving ? "Saving..." : "Save Appointment"}</button><button type="button" className="secondary-button" onClick={() => setDraft(null)}>Cancel</button></div>
      </form>
    </Modal> : null}
  </section>;
}
