"use client";

import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Copy,
  FilePlus2,
  MessageCircle,
  PhoneCall,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { formatLeadCopy } from "@/lib/lead-copy";
import { hideLeadPhoneInNote } from "../../supabase/functions/_shared/lead-contact";
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
  leadSourceLabels,
  latestLeadNote,
  isLeadFollowUpDue,
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

function leadName(lead: LeadRecord) {
  return lead.customerName || "Unnamed lead";
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
      <div className="mx-auto w-full max-w-xl min-w-0 rounded-md border border-zinc-700 bg-zinc-950 shadow-2xl">
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
    source: "manual_upload",
    sourceLeadId: "",
    sourceDetail: "",
    sourceNote: "",
    connectorId: "",
    customerName: "",
    customerPhone: "",
    phoneRevealedAt: "",
    followUpActivityAt: "",
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
  initialView = "all",
  onViewChange,
}: CommonProps & {
  catalog: VehicleOption[];
  onCreateCase: (lead: LeadRecord) => void;
  onAppointment: (lead: LeadRecord) => void;
  initialFilter?: LeadStatus | "all";
  initialView?: "all" | "followup";
  onViewChange?: (view: "all" | "followup") => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<LeadRecord | null>(null);
  const [initialNote, setInitialNote] = useState("");
  const [note, setNote] = useState("");
  const [inlineNoteId, setInlineNoteId] = useState("");
  const [inlineNote, setInlineNote] = useState("");
  const [pendingRejectId, setPendingRejectId] = useState("");
  const [filter, setFilter] = useState<LeadStatus | "all">(initialFilter);
  const [view, setView] = useState<"all" | "followup">(initialView);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState("");
  const [error, setError] = useState("");
  const selected = leads.find((lead) => lead.id === selectedId);
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const dueLeads = leads.filter((lead) => isLeadFollowUpDue(lead, nowMs));
  const shown = view === "followup" ? dueLeads : leads.filter((lead) => filter === "all" || lead.status === filter);
  const brands = [...new Set(catalog.map((item) => item.brand))];
  const models = draft ? catalog.filter((item) => item.brand === draft.carBrand) : [];

  async function submitLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError("");
    try {
      const previous = leads.find((lead) => lead.id === draft.id);
      await saveLead(draft, profile.id, initialNote, previous?.status, profile.role !== "admin");
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

  async function updateStatus(lead: LeadRecord, status: LeadStatus, statusNote = note) {
    if (status === "rejected" && profile.role !== "admin" && !statusNote.trim()) {
      setInlineNoteId(lead.id);
      setPendingRejectId(lead.id);
      setError("Add a note explaining why the lead was rejected before changing status.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await saveLead({ ...lead, status }, profile.id, status === "rejected" ? statusNote : "", lead.status, profile.role !== "admin");
      if (status === "rejected") {
        setNote("");
        setInlineNote("");
        setInlineNoteId("");
        setPendingRejectId("");
      }
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

  async function submitInlineNote(event: FormEvent<HTMLFormElement>, leadId: string) {
    event.preventDefault();
    if (!inlineNote.trim()) return;
    if (pendingRejectId === leadId) {
      const lead = leads.find((item) => item.id === leadId);
      if (lead) await updateStatus(lead, "rejected", inlineNote);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await addLeadNote(leadId, profile.id, inlineNote);
      setInlineNote("");
      setInlineNoteId("");
      await onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save note.");
    } finally {
      setSaving(false);
    }
  }

  async function removeLead() {
    if (profile.role !== "admin" || !selected || !window.confirm(`Delete lead ${selected.customerName}?`)) return;
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
    if (!lead.customerPhone) {
      setError("This lead has no phone number yet. Add one before calling.");
      return;
    }
    setError("");
    try {
      if (!lead.phoneRevealedAt) {
        await revealLeadPhone(lead.id, profile.id);
        await onRefresh();
      }
      window.location.href = `tel:${lead.customerPhone.replace(/[^\d+]/g, "")}`;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to open phone number.");
    }
  }

  async function copyLead(lead: LeadRecord) {
    if (lead.customerPhone && !lead.phoneRevealedAt) return;
    try {
      await navigator.clipboard.writeText(formatLeadCopy(lead));
      setCopiedId(lead.id);
      setError("");
      window.setTimeout(() => setCopiedId((current) => current === lead.id ? "" : current), 2000);
    } catch {
      setError("Unable to copy lead details. Please try again.");
    }
  }

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-bold text-white">Lead</h2><p className="text-sm text-zinc-400">{leads.length} leads</p></div>
        <button type="button" className="primary-button" onClick={() => { const lead = newLead(profile); if (profile.role === "admin") lead.ownerId = teamMembers.find((member) => member.active && ["customer_service", "broker"].includes(member.role))?.id || ""; setDraft(lead); setInitialNote(""); }}><Plus className="h-4 w-4" /> New Lead</button>
      </div>
      {error ? <p className="rounded-md border border-red-800 bg-red-950/50 p-3 text-sm text-red-100" role="alert">{error}</p> : null}
      <div className="flex gap-2 border-b border-zinc-800 pb-2" role="tablist" aria-label="Lead views">
        <button type="button" role="tab" aria-selected={view === "all"} className={view === "all" ? "primary-button" : "secondary-button"} onClick={() => { setView("all"); onViewChange?.("all"); }}>All Leads <span>{leads.length}</span></button>
        <button type="button" role="tab" aria-selected={view === "followup"} className={view === "followup" ? "primary-button" : "secondary-button"} onClick={() => { setView("followup"); onViewChange?.("followup"); }}>Follow Up Due <span>{dueLeads.length}</span></button>
      </div>
      {view === "all" ? <select className="field max-w-xs" value={filter} onChange={(event) => setFilter(event.target.value as LeadStatus | "all")} aria-label="Filter leads by status">
        <option value="all">All statuses ({leads.length})</option>
        {leadStatuses.map((status) => <option key={status} value={status}>{leadStatusLabels[status]} ({leads.filter((lead) => lead.status === status).length})</option>)}
      </select> : null}
      <div className="grid gap-2">
        {shown.map((lead) => (
          <article key={lead.id} className="surface-card min-w-0 p-4">
            <div className="flex items-start justify-between gap-3">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setNote(""); setError(""); setSelectedId(lead.id); }} aria-label={`Open ${lead.customerName} details`}>
                <span className="block truncate font-semibold text-white">{leadName(lead)}</span>
                {lead.phoneRevealedAt || lead.carModel ? <span className="block truncate text-sm text-zinc-400">{[lead.phoneRevealedAt ? lead.customerPhone : "", lead.carModel].filter(Boolean).join(" · ")}</span> : null}
                <span className="block truncate text-xs text-zinc-500">{ownerLabel(lead.ownerId, teamMembers)}</span>
                <span className="block truncate text-xs text-zinc-400">{leadSourceLabels[lead.source]}{lead.sourceDetail ? ` · ${lead.sourceDetail}` : ""}</span>
              </button>
              <div className="flex shrink-0 items-center gap-2">
                {!lead.phoneRevealedAt ? <span className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-100">{leadStatusLabels[lead.status]}</span> : null}
                <button className="icon-button disabled:cursor-not-allowed disabled:opacity-40" type="button" aria-label={`Copy ${leadName(lead)} details`} title={lead.customerPhone && !lead.phoneRevealedAt ? "Call to unlock copy" : copiedId === lead.id ? "Copied" : "Copy lead details"} disabled={Boolean(lead.customerPhone && !lead.phoneRevealedAt)} onClick={() => void copyLead(lead)}>{copiedId === lead.id ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button>
                <button className="icon-button" type="button" aria-label={`Open ${leadName(lead)} details`} title="Open lead details" onClick={() => { setNote(""); setError(""); setSelectedId(lead.id); }}><ChevronDown className="h-4 w-4" /></button>
              </div>
            </div>
            {latestLeadNote(lead) ? <p className="mt-3 break-words whitespace-pre-wrap border-t border-zinc-800 pt-3 text-sm text-zinc-300"><span className="font-medium text-zinc-400">Latest note: </span>{hideLeadPhoneInNote(latestLeadNote(lead), Boolean(lead.phoneRevealedAt))}</p> : null}
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-3">
              {lead.customerPhone ? <button className={lead.phoneRevealedAt ? "secondary-button" : "lead-call-pending inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-red-400 px-4 py-2 font-semibold text-white disabled:opacity-60"} type="button" disabled={saving} onClick={() => void callLead(lead)}><PhoneCall className="h-4 w-4" /> Call</button> : <button className="secondary-button" type="button" onClick={() => { setDraft(lead); setSelectedId(""); }}><Pencil className="h-4 w-4" /> Add phone</button>}
              {lead.phoneRevealedAt ? <a className="secondary-button text-emerald-200" href={`https://wa.me/${lead.customerPhone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /> WhatsApp</a> : null}
              {lead.phoneRevealedAt ? <select className="field min-w-0 flex-1 basis-36" aria-label={`Status for ${lead.customerName}`} value={lead.status} disabled={saving} onChange={(event) => void updateStatus(lead, event.target.value as LeadStatus, inlineNoteId === lead.id ? inlineNote : "")}>{leadStatuses.filter((status) => profile.role === "admin" || status !== "new" || lead.status === "new").map((status) => <option key={status} value={status}>{leadStatusLabels[status]}</option>)}</select> : null}
              {lead.phoneRevealedAt ? <button className="icon-button" type="button" aria-label={`Add note for ${lead.customerName}`} title="Add note" onClick={() => { setError(""); setInlineNoteId(inlineNoteId === lead.id ? "" : lead.id); setInlineNote(""); setPendingRejectId(""); }}><Pencil className="h-4 w-4" /></button> : null}
            </div>
            {inlineNoteId === lead.id ? <form className="mt-3 grid gap-2" onSubmit={(event) => void submitInlineNote(event, lead.id)}><label className="sr-only" htmlFor={`lead-note-${lead.id}`}>Note for {lead.customerName}</label><textarea id={`lead-note-${lead.id}`} className="field min-h-20" value={inlineNote} onChange={(event) => setInlineNote(event.target.value)} placeholder={pendingRejectId === lead.id ? "Reason for rejection" : "Add follow-up note"} /><div className="flex gap-2"><button className="secondary-button" disabled={saving || !inlineNote.trim()}><Save className="h-4 w-4" /> {pendingRejectId === lead.id ? "Reject lead" : "Save note"}</button><button className="icon-button" type="button" aria-label="Close note" onClick={() => { setInlineNoteId(""); setInlineNote(""); setPendingRejectId(""); }}><X className="h-4 w-4" /></button></div></form> : null}
          </article>
        ))}
        {!shown.length ? <p className="surface-card p-6 text-sm text-zinc-400">{view === "followup" ? "No contacted leads are due for follow-up." : "No leads in this status."}</p> : null}
      </div>

      {selected ? (
        <Modal title={leadName(selected)} onClose={() => { setNote(""); setSelectedId(""); }}>
          <div className="grid gap-4 p-4">
            <div className="grid gap-1 text-sm"><p className="text-zinc-400">{selected.customerPhone ? selected.phoneRevealedAt ? selected.customerPhone : "Phone hidden" : "No phone number"}{selected.email ? ` · ${selected.email}` : ""}</p>{selected.carBrand || selected.carModel ? <p>{[selected.carBrand, selected.carModel].filter(Boolean).join(" · ")}</p> : null}<p className="text-zinc-400">{ownerLabel(selected.ownerId, teamMembers)}</p><p className="text-zinc-300">Source: {leadSourceLabels[selected.source]}{selected.sourceDetail ? ` · ${selected.sourceDetail}` : ""}</p>{selected.sourceNote ? <p className="whitespace-pre-wrap text-zinc-300">Inquiry: {hideLeadPhoneInNote(selected.sourceNote, Boolean(selected.phoneRevealedAt))}</p> : null}<p className="text-xs text-zinc-500">Created {displayTime(selected.createdAt)}</p></div>
            <div className="grid gap-2 sm:grid-cols-2">
              {selected.customerPhone ? <button className={selected.phoneRevealedAt ? "secondary-button" : "lead-call-pending inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-red-400 px-4 py-2 font-semibold text-white"} type="button" onClick={() => void callLead(selected)}><PhoneCall className="h-4 w-4" /> Call</button> : <button className="secondary-button" type="button" onClick={() => { setDraft(selected); setSelectedId(""); }}><Pencil className="h-4 w-4" /> Add phone</button>}
              {selected.phoneRevealedAt ? <a className="secondary-button text-emerald-200" href={`https://wa.me/${selected.customerPhone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /> WhatsApp</a> : null}
              {selected.phoneRevealedAt ? <select className="field" aria-label="Lead status" value={selected.status} disabled={saving} onChange={(event) => void updateStatus(selected, event.target.value as LeadStatus)}>{leadStatuses.filter((status) => profile.role === "admin" || status !== "new" || selected.status === "new").map((status) => <option key={status} value={status}>{leadStatusLabels[status]}</option>)}</select> : null}
            </div>
            {selected.phoneRevealedAt ? <form className="grid gap-2" onSubmit={submitNote}><label className="text-sm font-medium">Note</label><textarea className="field min-h-20" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add follow-up note or rejection reason" /><button className="secondary-button w-fit" disabled={saving || !note.trim()}><Save className="h-4 w-4" /> Save note</button></form> : null}
            {selected.notes.length || selected.events.length ? <div className="grid max-h-48 gap-2 overflow-y-auto border-t border-zinc-800 pt-3 text-sm"><p className="font-semibold">History</p>{[
              ...selected.notes.map((entry) => ({ id: entry.id, time: entry.createdAt, text: hideLeadPhoneInNote(entry.body, Boolean(selected.phoneRevealedAt)) })),
              ...selected.events.map((entry) => ({ id: entry.id, time: entry.createdAt, text: `Status: ${leadStatusLabels[entry.status]}` })),
            ].sort((a, b) => +new Date(b.time) - +new Date(a.time)).map((entry) => <p key={entry.id} className="rounded-md bg-zinc-900 p-2"><span className="text-xs text-zinc-500">{displayTime(entry.time)}</span><br />{entry.text}</p>)}</div> : null}
            <div className="grid gap-2 border-t border-zinc-800 pt-3 sm:grid-cols-2">
              {selected.phoneRevealedAt ? <button className="secondary-button" type="button" onClick={() => { setDraft(selected); setSelectedId(""); }}><Pencil className="h-4 w-4" /> Edit</button> : null}
              <button className="secondary-button" type="button" onClick={() => { onAppointment(selected); setSelectedId(""); }}><CalendarClock className="h-4 w-4" /> Appointment</button>
              {cases.some((item) => item.leadId === selected.id) ? <span className="flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 className="h-4 w-4" /> Case created</span> : <button className="primary-button" type="button" onClick={() => { onCreateCase(selected); setSelectedId(""); }}><FilePlus2 className="h-4 w-4" /> Create Case</button>}
              {profile.role === "admin" ? <button className="secondary-button border-red-900 text-red-200" type="button" disabled={saving} onClick={() => void removeLead()}><Trash2 className="h-4 w-4" /> Delete</button> : null}
            </div>
          </div>
        </Modal>
      ) : null}

      {draft ? (
        <Modal title={leads.some((lead) => lead.id === draft.id) ? "Edit Lead" : "New Lead"} onClose={() => setDraft(null)}>
          <form className="grid gap-4 p-4" onSubmit={submitLead}>
            {profile.role === "admin" ? <label className="grid gap-1 text-sm">Owner<select className="field" value={draft.ownerId} onChange={(event) => setDraft({ ...draft, ownerId: event.target.value })} required>{teamMembers.filter((member) => member.active && ["customer_service", "broker"].includes(member.role)).map((member) => <option key={member.id} value={member.id}>{ownerLabel(member.id, teamMembers)}</option>)}</select></label> : null}
            <label className="grid gap-1 text-sm">Name (optional)<input className="field" value={draft.customerName} onChange={(event) => setDraft({ ...draft, customerName: event.target.value })} /></label>
            <label className="grid gap-1 text-sm">Phone (optional){leads.some((lead) => lead.id === draft.id) && draft.customerPhone && !draft.phoneRevealedAt ? <input className="field" value="Call the lead to reveal the number" disabled /> : <input className="field" type="tel" value={draft.customerPhone} onChange={(event) => setDraft({ ...draft, customerPhone: event.target.value })} />}</label>
            <label className="grid gap-1 text-sm">Email (optional)<input className="field" type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">Brand (optional)<select className="field" value={draft.carBrand} onChange={(event) => setDraft({ ...draft, carBrand: event.target.value, carModel: "" })}><option value="">Select brand</option>{brands.map((brand) => <option key={brand}>{brand}</option>)}</select></label>
              <label className="grid gap-1 text-sm">Model (optional)<select className="field" value={draft.carModel} onChange={(event) => setDraft({ ...draft, carModel: event.target.value })} disabled={!draft.carBrand}><option value="">Select model</option>{models.map((model) => <option key={model.model}>{model.model}</option>)}</select></label>
            </div>
            {draft.phoneRevealedAt ? <label className="grid gap-1 text-sm">Status<select className="field" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as LeadStatus })}>{leadStatuses.filter((status) => profile.role === "admin" || status !== "new" || draft.status === "new").map((status) => <option key={status} value={status}>{leadStatusLabels[status]}</option>)}</select></label> : null}
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
    customerName: "", customerPhone: "",
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
  const canChooseSubject = (ownerId: string) => profile.role === "admin" || ownerId === profile.id;
  const availableCases = cases.filter((record) => canChooseSubject(record.ownerId));
  const availableLeads = leads.filter((lead) => canChooseSubject(lead.ownerId));
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
    const subjectValue = draft.leadId ? `lead:${draft.leadId}` : draft.caseId ? `case:${draft.caseId}` : "";
    const subject = subjectOptions.find((item) => item.value === subjectValue);
    if (subjectValue && (!subject || !canChooseSubject(subject.ownerId))) {
      setError("Select your own lead or case for this appointment.");
      return;
    }
    if (!subjectValue && (!draft.customerName.trim() || !draft.customerPhone.trim())) {
      setError("Enter a name and phone number for a standalone appointment.");
      return;
    }
    const startsAt = new Date(`${localTime}:00+08:00`).toISOString();
    if (+new Date(startsAt) <= Date.now() && draft.status === "scheduled") {
      setError("Choose a future date and time.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await saveAppointment({ ...draft, ownerId: subject?.ownerId || profile.id, startsAt });
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
      <div className="min-w-0"><p className="font-semibold text-white">{appointment.kind === "test_drive" ? "Test Drive" : "Delivery"} · {subject?.label || appointment.customerName}</p><p className="text-sm text-zinc-300">{displayTime(appointment.startsAt)}</p>{appointment.customerPhone ? <a className="text-sm text-emerald-200" href={`tel:${appointment.customerPhone.replace(/[^\d+]/g, "")}`}>{appointment.customerPhone}</a> : null}<p className="text-xs text-zinc-500">{ownerLabel(appointment.ownerId, teamMembers)}{appointment.location ? ` · ${appointment.location}` : ""}</p>{appointment.notes ? <p className="mt-2 break-words text-sm text-zinc-400">{appointment.notes}</p> : null}</div>
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
      <form className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 p-4" onSubmit={submitAppointment}>
        <label className="grid gap-1 text-sm">Type<select className="field" value={draft.kind} onChange={(event) => { const kind = event.target.value as AppointmentKind; setDraft({ ...draft, kind, leadId: kind === "delivery" ? "" : draft.leadId }); }}><option value="test_drive">Test Drive</option><option value="delivery">Delivery</option></select></label>
        <label className="grid gap-1 text-sm">Lead or Case (optional)<select className="field" value={draft.leadId ? `lead:${draft.leadId}` : draft.caseId ? `case:${draft.caseId}` : ""} onChange={(event) => { const option = subjectOptions.find((item) => item.value === event.target.value); setDraft({ ...draft, ownerId: option?.ownerId || profile.id, leadId: event.target.value.startsWith("lead:") ? event.target.value.slice(5) : "", caseId: event.target.value.startsWith("case:") ? event.target.value.slice(5) : "" }); }}><option value="">No linked record</option>{subjectOptions.filter((item) => draft.kind === "test_drive" || item.value.startsWith("case:")).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        {!draft.leadId && !draft.caseId ? <div className="grid gap-3 sm:grid-cols-2"><label className="grid min-w-0 gap-1 text-sm">Name<input className="field min-w-0" value={draft.customerName} onChange={(event) => setDraft({ ...draft, customerName: event.target.value })} required /></label><label className="grid min-w-0 gap-1 text-sm">Phone<input className="field min-w-0" type="tel" value={draft.customerPhone} onChange={(event) => setDraft({ ...draft, customerPhone: event.target.value })} required /></label></div> : null}
        <p className="text-xs text-zinc-400">Alerts to {ownerLabel(draft.ownerId, teamMembers)} at 3 days, 1 day, 4 hours and 1 hour. Admin receives the 1-day alert.</p>
        <label className="grid min-w-0 gap-1 text-sm">Date and time (Kuala Lumpur)<input className="field appointment-datetime min-w-0 max-w-full" type="datetime-local" value={localTime} onChange={(event) => setLocalTime(event.target.value)} required /></label>
        <label className="grid gap-1 text-sm">Location (optional)<input className="field" value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} /></label>
        <label className="grid gap-1 text-sm">Notes (optional)<textarea className="field min-h-20" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
        <div className="flex gap-2"><button className="primary-button" disabled={saving}><Save className="h-4 w-4" /> {saving ? "Saving..." : "Save Appointment"}</button><button type="button" className="secondary-button" onClick={() => setDraft(null)}>Cancel</button></div>
      </form>
    </Modal> : null}
  </section>;
}
