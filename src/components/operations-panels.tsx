"use client";

import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Copy,
  FilePlus2,
  LoaderCircle,
  MessageCircle,
  PhoneCall,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, useAnimationControls, useReducedMotion } from "motion/react";
import { readUiContext, writeUiContext } from "@/lib/ui-context";
import { PriorContactBadge } from "@/components/prior-contact-badge";
import { compareLeadActivity } from "@/lib/lead-order";
import { createPortal } from "react-dom";
import { OwnerFilterSelect } from "@/components/owner-filter-select";
import { formatLeadCopy } from "@/lib/lead-copy";
import { hasLeadWhatsApp, leadWhatsAppUrl } from "@/lib/whatsapp-contact";
import { getSupabaseClient } from "@/lib/supabase";
import { matchesOwnerFilter, type OwnerFilter } from "@/lib/owner-filter";
import { hideLeadPhoneInNote } from "../../supabase/functions/_shared/lead-contact";
import {
  addLeadNote,
  deleteLead,
  saveAppointment,
  deleteAppointment,
  saveLead,
  revealLeadPhone,
  loadLeads,
  recordLeadFollowUp,
} from "@/lib/operations-store";
import {
  leadStatuses,
  leadStatusLabels,
  leadSourceLabels,
  latestLeadNote,
  isLeadFollowUpDue,
  availableLeadFollowUpStages,
  canRecordLeadFollowUp,
  leadFollowUpAction,
  maxLeadFollowUps,
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

function followUpLabel(count: number) {
  return `Follow Up ${Math.min(count + 1, maxLeadFollowUps)}`;
}

const followUpColors = [
  "border-emerald-500 bg-emerald-700 hover:bg-emerald-600",
  "border-cyan-500 bg-cyan-700 hover:bg-cyan-600",
  "border-blue-500 bg-blue-700 hover:bg-blue-600",
  "border-violet-500 bg-violet-700 hover:bg-violet-600",
  "border-amber-500 bg-amber-700 hover:bg-amber-600",
  "border-rose-500 bg-rose-700 hover:bg-rose-600",
] as const;

function followUpButtonClass(count: number) {
  return `inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${followUpColors[Math.min(Math.max(count, 0), maxLeadFollowUps - 1)]}`;
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex='0']") || []).filter((element) => element.getClientRects().length);
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <div ref={dialogRef} className="app-modal fixed inset-0 z-50 overflow-y-auto bg-black/80 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="app-modal-panel mx-auto w-full max-w-xl min-w-0 rounded-md border border-zinc-700 bg-zinc-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 p-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>, document.body,
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
    followUpCount: 0,
    email: "",
    carBrand: "",
    carModel: "",
    status: "new",
    createdAt: now,
    updatedAt: now,
    notes: [],
    events: [],
    followUps: [],
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
  cohortLeadIds,
  cohortLabel,
  onClearCohort,
  dashboardFollowUp = false,
}: CommonProps & {
  catalog: VehicleOption[];
  onCreateCase: (lead: LeadRecord) => void;
  onAppointment: (lead: LeadRecord) => void;
  initialFilter?: LeadStatus | "all";
  initialView?: "all" | "new" | "contacted" | "followup";
  onViewChange?: (view: "all" | "new" | "contacted" | "followup") => void;
  cohortLeadIds?: string[];
  cohortLabel?: string;
  onClearCohort?: () => void;
  dashboardFollowUp?: boolean;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<LeadRecord | null>(null);
  const [initialNote, setInitialNote] = useState("");
  const [note, setNote] = useState("");
  const [inlineNoteId, setInlineNoteId] = useState("");
  const [inlineNote, setInlineNote] = useState("");
  const [pendingRejectId, setPendingRejectId] = useState("");
  const [filter, setFilter] = useState<LeadStatus | "all">(initialFilter);
  const [followUpFilter, setFollowUpFilter] = useState<number | "all">("all");
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>("all");
  const [view, setView] = useState<"all" | "new" | "contacted" | "followup">(initialView);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState("");
  const [followingUpId, setFollowingUpId] = useState("");
  const [contactingLeadId, setContactingLeadId] = useState("");
  const contactInFlight = useRef(false);
  const followUpInFlight = useRef(false);
  const [followUpCounts, setFollowUpCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const selectedSummary = leads.find((lead) => lead.id === selectedId);
  const [historyDetail, setHistoryDetail] = useState<{ source: LeadRecord; record: LeadRecord } | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [historyRetry, setHistoryRetry] = useState(0);
  const selected = historyDetail && historyDetail.source === selectedSummary ? historyDetail.record : selectedSummary;
  useEffect(() => {
    if (!selectedSummary) return;
    let cancelled = false;
    setHistoryError("");
    void loadLeads([selectedSummary.id], true).then((rows) => {
      if (!cancelled && rows[0]) setHistoryDetail({ source: selectedSummary, record: rows[0] });
      else if (!cancelled) setHistoryError("History unavailable. Refresh or try again.");
    }).catch(() => { if (!cancelled) setHistoryError("Unable to load History. Try again."); });
    return () => { cancelled = true; };
  }, [selectedSummary, historyRetry]);
  const reduce = useReducedMotion();
  const listRef = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ id: string; top: number; scroll: number } | null>(null);
  const [notice, setNotice] = useState("");
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    const saved = readUiContext<{ filter: LeadStatus | "all"; followUp: number | "all"; owner: OwnerFilter; selected: string }>(`cp:leads:${profile.id}:${dashboardFollowUp ? "dashboard" : "tab"}`);
    if (saved.filter && (saved.filter === "all" || leadStatuses.includes(saved.filter))) setFilter(saved.filter);
    if (saved.followUp === "all" || (typeof saved.followUp === "number" && saved.followUp >= 0 && saved.followUp <= 6)) setFollowUpFilter(saved.followUp);
    if (saved.owner) setOwnerFilter(saved.owner);
    if (typeof saved.selected === "string") setSelectedId(saved.selected);
    setRestored(true);
  }, [profile.id, dashboardFollowUp]);
  useEffect(() => {
    if (restored) writeUiContext(`cp:leads:${profile.id}:${dashboardFollowUp ? "dashboard" : "tab"}`, { filter, followUp: followUpFilter, owner: ownerFilter, selected: selectedId });
  }, [restored, profile.id, dashboardFollowUp, filter, followUpFilter, ownerFilter, selectedId]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2500);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => setView(initialView), [initialView]);
  const scopedLeads = cohortLeadIds ? leads.filter((lead) => cohortLeadIds.includes(lead.id)) : leads;
  const ownerLeads = scopedLeads.filter((lead) => matchesOwnerFilter(lead, ownerFilter, teamMembers))
    .sort((left, right) => view === "all" ? compareLeadActivity(left, right)
      : Number(["number_invalid", "rejected"].includes(left.status)) - Number(["number_invalid", "rejected"].includes(right.status)));
  const dueLeads = ownerLeads.filter((lead) => isLeadFollowUpDue({
    ...lead, followUpCount: Math.max(lead.followUpCount, followUpCounts[lead.receiptId || lead.id] ?? 0),
  }, nowMs));
  const newLeads = ownerLeads.filter((lead) => lead.status === "new");
  const contactedLeads = ownerLeads.filter((lead) => lead.status === "contacted");
  const statusLeads = ownerLeads.filter((lead) => filter === "all" || lead.status === filter);
  const followUpStages = availableLeadFollowUpStages(statusLeads.map((lead) => ({
    phoneRevealedAt: lead.phoneRevealedAt,
    followUpCount: Math.max(lead.followUpCount, followUpCounts[lead.receiptId || lead.id] ?? 0),
    status: lead.status,
  })));
  const activeFollowUpFilter = followUpFilter === "all" || followUpStages.some((stage) => stage.count === followUpFilter) ? followUpFilter : "all";
  const shown = view === "followup" ? dueLeads : view === "new" ? newLeads : view === "contacted" ? contactedLeads : statusLeads.filter((lead) => activeFollowUpFilter === "all" || (lead.status !== "rejected" && lead.phoneRevealedAt && Math.max(lead.followUpCount, followUpCounts[lead.receiptId || lead.id] ?? 0) === activeFollowUpFilter));
  const order = shown.map((lead) => lead.id).join(":");
  const listContext = `${view}:${filter}:${activeFollowUpFilter}:${ownerFilter}`;
  const listMotion = useAnimationControls();
  useEffect(() => {
    listMotion.set({ opacity: reduce ? 1 : .65, y: reduce ? 0 : 12 });
    void listMotion.start({ opacity: 1, y: 0, transition: reduce ? { duration: 0 } : { type: "spring", visualDuration: .26, bounce: 0 } });
  }, [listContext, listMotion, reduce]);
  const previousContext = useRef(listContext);
  useLayoutEffect(() => {
    const cards = () => Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-lead-id]") || []);
    const layoutTop = (card: HTMLElement) => {
      let top = 0;
      let element: HTMLElement | null = card;
      while (element) { top += element.offsetTop; element = element.offsetParent as HTMLElement | null; }
      return top - window.scrollY;
    };
    const old = anchor.current;
    if (old && previousContext.current === listContext && window.scrollY > 160) {
      const card = cards().find((item) => item.dataset.leadId === old.id);
      if (card) {
        const delta = layoutTop(card) - (old.top - (window.scrollY - old.scroll));
        if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: "instant" });
      }
    }
    previousContext.current = listContext;
    const capture = () => {
      const card = cards().find((item) => item.getBoundingClientRect().bottom > 100);
      anchor.current = card ? { id: card.dataset.leadId!, top: layoutTop(card), scroll: window.scrollY } : null;
    };
    capture();
    window.addEventListener("scroll", capture, { passive: true });
    return () => window.removeEventListener("scroll", capture);
  }, [order, listContext]);
  useEffect(() => {
    if (followUpFilter !== activeFollowUpFilter) setFollowUpFilter(activeFollowUpFilter);
  }, [followUpFilter, activeFollowUpFilter]);
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
      setNotice("Lead saved");
      if (!previous && draft.status === "new") {
        const { error: notificationError } = await getSupabaseClient().functions.invoke("notify-manual-lead", {
          body: { leadId: draft.id },
        });
        if (notificationError) console.warn("Manual lead saved but push notification failed", notificationError);
      }
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
      setNotice("Status updated");
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
      setNotice("Note saved");
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
      setNotice("Note saved");
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

  async function contactLead(lead: LeadRecord, channel: "call" | "whatsapp") {
    if (channel === "call" ? !lead.customerPhone : !hasLeadWhatsApp(lead)) {
      setError("This lead has no phone number yet. Add one before contacting.");
      return;
    }
    if (contactInFlight.current) return;
    contactInFlight.current = true;
    setContactingLeadId(lead.id);
    setError("");
    try {
      const destination = channel === "call" ? `tel:${lead.customerPhone.replace(/[^\d+]/g, "")}` : leadWhatsAppUrl(lead);
      if (!lead.phoneRevealedAt || lead.status === "new") {
        await revealLeadPhone(lead.id, profile.id);
      }
      window.location.href = destination;
      void onRefresh().catch(() => setError("Contact saved. Unable to refresh; retry refresh."));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to contact lead.");
    } finally {
      contactInFlight.current = false;
      setContactingLeadId("");
    }
  }

  async function followUpLead(lead: LeadRecord) {
    const action = leadFollowUpAction(Math.max(lead.followUpCount, followUpCounts[lead.receiptId || lead.id] ?? 0), lead.status);
    if (!lead.phoneRevealedAt || !hasLeadWhatsApp(lead) || followUpInFlight.current || action === "blocked") return;
    followUpInFlight.current = true;
    setFollowingUpId(lead.id);
    setError("");
    try {
      const destination = leadWhatsAppUrl(lead);
      if (action === "record") {
        const count = await recordLeadFollowUp(lead.id);
        setFollowUpCounts((current) => ({ ...current, [lead.receiptId || lead.id]: count }));
      }
      window.location.assign(destination);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to record follow-up.");
    } finally {
      followUpInFlight.current = false;
      setFollowingUpId("");
    }
  }

  async function copyLead(lead: LeadRecord) {
    try {
      const details = formatLeadCopy(lead, Boolean(lead.phoneRevealedAt));
      let copied = false;
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(details);
          copied = true;
        } catch {
          // Safari may expose the Clipboard API but reject writes in installed apps.
        }
      }
      if (!copied) {
        const field = document.createElement("textarea");
        field.value = details;
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.appendChild(field);
        try {
          field.select();
          if (!document.execCommand("copy")) throw new Error("Copy failed");
        } finally {
          field.remove();
        }
      }
      setCopiedId(lead.id);
      setError("");
      window.setTimeout(() => setCopiedId((current) => current === lead.id ? "" : current), 2000);
    } catch {
      setError("Unable to copy lead details. Please try again.");
    }
  }

  return (
    <section className="screen-enter grid gap-4">
      {dashboardFollowUp ? <h2 className="text-sm font-semibold text-zinc-300">Lead Follow Up Due ({dueLeads.length})</h2> : <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-bold text-white">Lead</h2><p className="text-sm text-zinc-400">{scopedLeads.length} leads</p></div>
        <button type="button" className="primary-button" onClick={() => { const lead = newLead(profile); if (profile.role === "admin") lead.ownerId = teamMembers.find((member) => member.active && ["customer_service", "broker"].includes(member.role))?.id || ""; setDraft(lead); setInitialNote(""); }}><Plus className="h-4 w-4" /> New Lead</button>
      </div>}
      {error ? <p className="rounded-md border border-red-800 bg-red-950/50 p-3 text-sm text-red-100" role="alert">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-300" role="status">{notice}</p> : null}
      {saving ? <p className="flex items-center gap-2 text-sm text-zinc-400" role="status"><LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />Saving...</p> : null}
      {cohortLeadIds ? <div className="flex items-center justify-between gap-3 border-b border-cyan-800 py-2 text-sm"><span className="text-cyan-200">{cohortLabel}</span><button type="button" className="secondary-button" onClick={onClearCohort}>All leads</button></div> : null}
      {!dashboardFollowUp ? <div className="lead-view-tabs flex gap-2 border-b border-zinc-800 pb-2" role="tablist" aria-label="Lead views">
        <button type="button" role="tab" aria-selected={view === "all"} className={view === "all" ? "primary-button" : "secondary-button"} onClick={() => { setView("all"); onViewChange?.("all"); }}>All Leads <span>{ownerLeads.length}</span></button>
        <button type="button" role="tab" aria-selected={view === "new"} className={view === "new" ? "primary-button" : "secondary-button"} onClick={() => { setView("new"); onViewChange?.("new"); }}>New Leads <span>{newLeads.length}</span></button>
        <button type="button" role="tab" aria-selected={view === "contacted"} className={view === "contacted" ? "primary-button" : "secondary-button"} onClick={() => { setView("contacted"); onViewChange?.("contacted"); }}>Contacted <span>{contactedLeads.length}</span></button>
        <button type="button" role="tab" aria-selected={view === "followup"} className={view === "followup" ? "primary-button" : "secondary-button"} onClick={() => { setView("followup"); onViewChange?.("followup"); }}>Follow Up Due <span>{dueLeads.length}</span></button>
      </div> : null}
      <div className="grid gap-2 sm:flex sm:flex-wrap">
        {profile.role === "admin" ? <OwnerFilterSelect value={ownerFilter} onChange={setOwnerFilter} members={teamMembers} records={scopedLeads} className="sm:max-w-xs" /> : null}
        {view === "all" ? <select className="field min-w-0 sm:max-w-xs" value={filter} onChange={(event) => setFilter(event.target.value as LeadStatus | "all")} aria-label="Filter leads by status">
          <option value="all">All statuses ({ownerLeads.length})</option>
          {leadStatuses.map((status) => <option key={status} value={status}>{leadStatusLabels[status]} ({ownerLeads.filter((lead) => lead.status === status).length})</option>)}
        </select> : null}
        {view === "all" && followUpStages.length ? <select className="field min-w-0 sm:max-w-xs" value={activeFollowUpFilter} onChange={(event) => setFollowUpFilter(event.target.value === "all" ? "all" : Number(event.target.value))} aria-label="Filter leads by follow-up count">
          <option value="all">All follow-ups</option>
          {followUpStages.map(({ count, total }) => <option key={count} value={count}>{count ? `Follow Up ${count}` : "Follow Up"} ({total})</option>)}
        </select> : null}
      </div>
      <motion.div ref={listRef} className="grid gap-2" animate={listMotion}>
        {shown.map((lead) => (
          <motion.article key={lead.id} layout={reduce ? false : "position"} data-lead-id={lead.id} transition={{ type: "spring", visualDuration: .26, bounce: 0 }} className="mobile-lead-card surface-card min-w-0 p-4">
            <div className="flex items-start justify-between gap-3">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setNote(""); setError(""); setSelectedId(lead.id); }} aria-label={`Open ${lead.customerName} details`}>
                <span className="block truncate font-semibold text-white">{leadName(lead)}</span>
                <PriorContactBadge lead={lead} />
                {lead.whatsappUsername ? <span className="block break-words text-sm text-emerald-300">WhatsApp: @{lead.whatsappUsername}</span> : null}{lead.phoneRevealedAt || lead.carModel ? <span className="block truncate text-sm text-zinc-400">{[lead.phoneRevealedAt ? lead.customerPhone : "", lead.carModel].filter(Boolean).join(" · ")}</span> : null}
                <span className="block truncate text-xs text-zinc-500">{ownerLabel(lead.ownerId, teamMembers)}</span>
                <span className="block truncate text-xs text-zinc-400">{leadSourceLabels[lead.source]}{lead.sourceDetail ? ` · ${lead.sourceDetail}` : ""}</span>
              </button>
              <div className="flex shrink-0 items-center gap-2">
                {!lead.phoneRevealedAt ? <span className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-100">{leadStatusLabels[lead.status]}</span> : null}
                <button className="icon-button" type="button" aria-label={`Copy ${leadName(lead)} details`} title={copiedId === lead.id ? "Copied" : lead.phoneRevealedAt ? "Copy lead details" : "Copy details without phone until Call"} onClick={() => void copyLead(lead)}>{copiedId === lead.id ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button>
                {view === "followup" && lead.status !== "rejected" && lead.phoneRevealedAt && hasLeadWhatsApp(lead) ? <button className={followUpButtonClass(Math.max(followUpCounts[lead.receiptId || lead.id] ?? 0, lead.followUpCount))} type="button" aria-busy={followingUpId === lead.id} disabled={Boolean(followingUpId)} title={canRecordLeadFollowUp(Math.max(followUpCounts[lead.receiptId || lead.id] ?? 0, lead.followUpCount), lead.status) ? "Record follow-up and open WhatsApp" : "Open WhatsApp"} onClick={() => void followUpLead(lead)}><MessageCircle className="h-4 w-4" />{followUpLabel(Math.max(followUpCounts[lead.receiptId || lead.id] ?? 0, lead.followUpCount))}</button> : view !== "followup" ? <button className="icon-button" type="button" aria-label={`Open ${leadName(lead)} details`} title="Open lead details" onClick={() => { setNote(""); setError(""); setSelectedId(lead.id); }}><ChevronDown className="h-4 w-4" /></button> : null}
              </div>
            </div>
            {latestLeadNote(lead) ? <p className="mt-3 break-words whitespace-pre-wrap border-t border-zinc-800 pt-3 text-sm text-zinc-300"><span className="font-medium text-zinc-400">Latest note: </span>{hideLeadPhoneInNote(latestLeadNote(lead), lead.status === "new" || Boolean(lead.phoneRevealedAt))}</p> : null}
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-3">
              {lead.customerPhone ? <button className={lead.phoneRevealedAt ? "secondary-button" : "lead-call-pending inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-red-400 px-4 py-2 font-semibold text-white disabled:opacity-60"} type="button" aria-busy={contactingLeadId === lead.id} disabled={saving || Boolean(contactingLeadId)} onClick={() => void contactLead(lead, "call")}><PhoneCall className="h-4 w-4" /> Call</button> : !hasLeadWhatsApp(lead) ? <button className="secondary-button" type="button" onClick={() => { setDraft(lead); setSelectedId(""); }}><Pencil className="h-4 w-4" /> Edit contact</button> : null}
              {lead.status === "new" && hasLeadWhatsApp(lead) ? <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-emerald-500 bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-600 disabled:opacity-60" type="button" aria-busy={contactingLeadId === lead.id} disabled={saving || Boolean(contactingLeadId)} onClick={() => void contactLead(lead, "whatsapp")}><MessageCircle className="h-4 w-4" /> WhatsApp</button> : null}
              {view !== "followup" && lead.status !== "rejected" && lead.phoneRevealedAt && hasLeadWhatsApp(lead) ? <button className={followUpButtonClass(Math.max(followUpCounts[lead.receiptId || lead.id] ?? 0, lead.followUpCount))} type="button" aria-busy={followingUpId === lead.id} disabled={Boolean(followingUpId)} title={canRecordLeadFollowUp(Math.max(followUpCounts[lead.receiptId || lead.id] ?? 0, lead.followUpCount), lead.status) ? "Record follow-up and open WhatsApp" : "Open WhatsApp"} onClick={() => void followUpLead(lead)}><MessageCircle className="h-4 w-4" /> {followUpLabel(Math.max(followUpCounts[lead.receiptId || lead.id] ?? 0, lead.followUpCount))}</button> : null}
              {lead.phoneRevealedAt ? <select className="field min-w-0 flex-1 basis-36" aria-label={`Status for ${lead.customerName}`} value={lead.status} disabled={saving} onChange={(event) => void updateStatus(lead, event.target.value as LeadStatus, inlineNoteId === lead.id ? inlineNote : "")}>{leadStatuses.filter((status) => profile.role === "admin" || status !== "new" || lead.status === "new").map((status) => <option key={status} value={status}>{leadStatusLabels[status]}</option>)}</select> : null}
              {lead.phoneRevealedAt ? <button className="icon-button" type="button" aria-label={`Add note for ${lead.customerName}`} title="Add note" onClick={() => { setError(""); setInlineNoteId(inlineNoteId === lead.id ? "" : lead.id); setInlineNote(""); setPendingRejectId(""); }}><Pencil className="h-4 w-4" /></button> : null}
            </div>
            {inlineNoteId === lead.id ? <form className="mt-3 grid gap-2" onSubmit={(event) => void submitInlineNote(event, lead.id)}><label className="sr-only" htmlFor={`lead-note-${lead.id}`}>Note for {lead.customerName}</label><textarea id={`lead-note-${lead.id}`} className="field min-h-20" value={inlineNote} onChange={(event) => setInlineNote(event.target.value)} placeholder={pendingRejectId === lead.id ? "Reason for rejection" : "Add follow-up note"} /><div className="flex gap-2"><button className="secondary-button" disabled={saving || !inlineNote.trim()}><Save className="h-4 w-4" /> {pendingRejectId === lead.id ? "Reject lead" : "Save note"}</button><button className="icon-button" type="button" aria-label="Close note" onClick={() => { setInlineNoteId(""); setInlineNote(""); setPendingRejectId(""); }}><X className="h-4 w-4" /></button></div></form> : null}
          </motion.article>
        ))}
        {!shown.length ? <p className="surface-card p-6 text-sm text-zinc-400">{view === "followup" ? "No contacted leads are due for follow-up." : view === "new" ? "No new leads." : view === "contacted" ? "No contacted leads." : "No leads in this status."}</p> : null}
      </motion.div>

      {selected ? (
        <Modal title={leadName(selected)} onClose={() => { setNote(""); setSelectedId(""); }}>
          <div className="px-4 pt-3"><PriorContactBadge lead={selected} /></div>
          <div className="grid gap-4 p-4">
            <div className="grid gap-1 text-sm"><p className="text-zinc-400">{selected.customerPhone ? selected.phoneRevealedAt ? selected.customerPhone : "Phone hidden" : "No phone number"}{selected.email ? ` · ${selected.email}` : ""}</p>{selected.whatsappUsername ? <p className="break-words text-emerald-300">WhatsApp: @{selected.whatsappUsername}</p> : null}{selected.carBrand || selected.carModel ? <p>{[selected.carBrand, selected.carModel].filter(Boolean).join(" · ")}</p> : null}<p className="text-zinc-400">{ownerLabel(selected.ownerId, teamMembers)}</p><p className="text-zinc-300">Source: {leadSourceLabels[selected.source]}{selected.sourceDetail ? ` · ${selected.sourceDetail}` : ""}</p>{selected.sourceNote ? <p className="whitespace-pre-wrap text-zinc-300">Inquiry: {hideLeadPhoneInNote(selected.sourceNote, selected.status === "new" || Boolean(selected.phoneRevealedAt))}</p> : null}<p className="text-xs text-zinc-500">Created {displayTime(selected.createdAt)}</p></div>
            <div className="grid gap-2 sm:grid-cols-2">
              {selected.customerPhone ? <button className={selected.phoneRevealedAt ? "secondary-button" : "lead-call-pending inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-red-400 px-4 py-2 font-semibold text-white"} type="button" aria-busy={contactingLeadId === selected.id} disabled={saving || Boolean(contactingLeadId)} onClick={() => void contactLead(selected, "call")}><PhoneCall className="h-4 w-4" /> Call</button> : !hasLeadWhatsApp(selected) ? <button className="secondary-button" type="button" onClick={() => { setDraft(selected); setSelectedId(""); }}><Pencil className="h-4 w-4" /> Edit contact</button> : null}
              {selected.status === "new" && hasLeadWhatsApp(selected) ? <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-emerald-500 bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-600 disabled:opacity-60" type="button" aria-busy={contactingLeadId === selected.id} disabled={saving || Boolean(contactingLeadId)} onClick={() => void contactLead(selected, "whatsapp")}><MessageCircle className="h-4 w-4" /> WhatsApp</button> : null}
              {selected.status !== "rejected" && selected.phoneRevealedAt && hasLeadWhatsApp(selected) ? <button className={followUpButtonClass(Math.max(followUpCounts[selected.receiptId || selected.id] ?? 0, selected.followUpCount))} type="button" aria-busy={followingUpId === selected.id} disabled={Boolean(followingUpId)} title={canRecordLeadFollowUp(Math.max(followUpCounts[selected.receiptId || selected.id] ?? 0, selected.followUpCount), selected.status) ? "Record follow-up and open WhatsApp" : "Open WhatsApp"} onClick={() => void followUpLead(selected)}><MessageCircle className="h-4 w-4" /> {followUpLabel(Math.max(followUpCounts[selected.receiptId || selected.id] ?? 0, selected.followUpCount))}</button> : null}
              {selected.phoneRevealedAt ? <select className="field" aria-label="Lead status" value={selected.status} disabled={saving} onChange={(event) => void updateStatus(selected, event.target.value as LeadStatus)}>{leadStatuses.filter((status) => profile.role === "admin" || status !== "new" || selected.status === "new").map((status) => <option key={status} value={status}>{leadStatusLabels[status]}</option>)}</select> : null}
            </div>
            {selected.phoneRevealedAt ? <form className="grid gap-2" onSubmit={submitNote}><label className="text-sm font-medium">Note</label><textarea className="field min-h-20" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add follow-up note or rejection reason" /><button className="secondary-button w-fit" disabled={saving || !note.trim()}><Save className="h-4 w-4" /> Save note</button></form> : null}
            {historyError ? <button type="button" className="secondary-button text-red-300" onClick={() => setHistoryRetry((n) => n + 1)}>{historyError}</button> : historyDetail?.source !== selectedSummary ? <p role="status" className="text-sm text-zinc-400">Loading History…</p> : null}
            {selected.notes.length || selected.events.length || selected.followUps.length ? <div className="grid max-h-48 gap-2 overflow-y-auto border-t border-zinc-800 pt-3 text-sm"><p className="font-semibold">History</p>{[
              ...selected.notes.map((entry) => ({ id: entry.id, time: entry.createdAt, text: hideLeadPhoneInNote(entry.body, selected.status === "new" || Boolean(selected.phoneRevealedAt)) })),
              ...selected.events.map((entry) => ({ id: entry.id, time: entry.createdAt, text: entry.kind === "reentered" ? `Lead masuk semula · ${entry.previousOwnerId && entry.previousOwnerId !== entry.actorId ? `${ownerLabel(entry.previousOwnerId, teamMembers)} → ` : ""}${ownerLabel(entry.actorId, teamMembers)} · New` : `Status: ${leadStatusLabels[entry.status]}` })),
              ...selected.followUps.map((entry) => ({ id: entry.id, time: entry.createdAt, text: `Follow Up ${entry.number}` })),
            ].sort((a, b) => +new Date(b.time) - +new Date(a.time)).map((entry) => <p key={entry.id} className="rounded-md bg-zinc-900 p-2"><span className="text-xs text-zinc-500">{displayTime(entry.time)}</span><br />{entry.text}</p>)}</div> : null}
            <div className="grid gap-2 border-t border-zinc-800 pt-3 sm:grid-cols-2">
              {selected.phoneRevealedAt || selected.status === "new" ? <button className="secondary-button" type="button" onClick={() => { setDraft(selected); setSelectedId(""); }}><Pencil className="h-4 w-4" /> Edit</button> : null}
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
            {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}
            {profile.role === "admin" ? <label className="grid gap-1 text-sm">Owner<select className="field" value={draft.ownerId} onChange={(event) => setDraft({ ...draft, ownerId: event.target.value })} required>{teamMembers.filter((member) => member.active && ["customer_service", "broker"].includes(member.role)).map((member) => <option key={member.id} value={member.id}>{ownerLabel(member.id, teamMembers)}</option>)}</select></label> : null}
            <label className="grid gap-1 text-sm">Name (optional)<input className="field" value={draft.customerName} onChange={(event) => setDraft({ ...draft, customerName: event.target.value })} /></label>
            <label className="grid gap-1 text-sm">Username / pautan WhatsApp<input className="field" value={draft.whatsappUsername || ""} placeholder="@username atau https://wa.me/username" autoCapitalize="none" autoCorrect="off" onChange={(event) => { setError(""); setDraft({ ...draft, whatsappUsername: event.target.value }); }} /><span className="text-xs text-zinc-400">Username aktif sahaja. Jika ada telefon, WhatsApp menggunakan telefon dahulu.</span></label>
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
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>("all");
  const [notice, setNotice] = useState("");
  const [contextReady, setContextReady] = useState(false);
  useEffect(() => {
    const saved = readUiContext<{ owner: OwnerFilter }>(`cp:appointments:${profile.id}`);
    if (saved.owner) setOwnerFilter(saved.owner);
    setContextReady(true);
  }, [profile.id]);
  useEffect(() => {
    if (contextReady) writeUiContext(`cp:appointments:${profile.id}`, { owner: ownerFilter });
  }, [contextReady, profile.id, ownerFilter]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2500);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const now = Date.now();
  const ownerAppointments = appointments.filter((appointment) => matchesOwnerFilter(appointment, ownerFilter, teamMembers));
  const upcoming = ownerAppointments.filter((appointment) => appointment.status === "scheduled" && +new Date(appointment.startsAt) >= now);
  const previous = ownerAppointments.filter((appointment) => !upcoming.includes(appointment));
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
      setNotice("Appointment saved");
      await onRefresh();
      setDraft(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save appointment.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(appointment: AppointmentRecord, status: AppointmentRecord["status"]) {
    setSaving(true);
    setError("");
    try {
      await saveAppointment({ ...appointment, status });
      setNotice("Status updated");
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
      {profile.role === "admin" ? <button type="button" className="secondary-button justify-self-end text-red-300 sm:col-span-2" disabled={saving} onClick={async () => { if (!window.confirm("Padam appointment ini? Reminder akan dihentikan.")) return; setSaving(true); setError(""); try { await deleteAppointment(appointment.id); await onRefresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to delete appointment."); } finally { setSaving(false); } }}><Trash2 className="h-4 w-4" />Delete</button> : null}
      <div className="min-w-0"><p className="font-semibold text-white">{appointment.kind === "test_drive" ? "Test Drive" : "Delivery"} · {subject?.label || appointment.customerName}</p><p className="text-sm text-zinc-300">{displayTime(appointment.startsAt)}</p>{appointment.customerPhone ? <a className="text-sm text-emerald-200" href={`tel:${appointment.customerPhone.replace(/[^\d+]/g, "")}`}>{appointment.customerPhone}</a> : null}<p className="text-xs text-zinc-500">{ownerLabel(appointment.ownerId, teamMembers)}{appointment.location ? ` · ${appointment.location}` : ""}</p>{appointment.notes ? <p className="mt-2 break-words text-sm text-zinc-400">{appointment.notes}</p> : null}</div>
      {appointment.status === "scheduled" ? <div className="flex flex-wrap gap-2"><button type="button" className="secondary-button" onClick={() => openEdit(appointment)}><Pencil className="h-4 w-4" /> Edit</button>{+new Date(appointment.startsAt) <= now ? <><button type="button" className="secondary-button text-emerald-200" disabled={saving} onClick={() => void updateStatus(appointment, "show_up")}><CheckCircle2 className="h-4 w-4" /> Show Up</button><button type="button" className="secondary-button text-amber-200" disabled={saving} onClick={() => void updateStatus(appointment, "no_show")}><X className="h-4 w-4" /> Tidak Hadir</button></> : null}<button type="button" className="secondary-button" disabled={saving} onClick={() => void updateStatus(appointment, "completed")}><CheckCircle2 className="h-4 w-4" /> Done</button><button type="button" className="secondary-button border-red-900 text-red-200" disabled={saving} onClick={() => void updateStatus(appointment, "cancelled")}><X className="h-4 w-4" /> Cancel</button></div> : <span className="text-sm text-zinc-500">{{ completed: "Done", cancelled: "Cancelled", show_up: "Show Up", no_show: "Tidak Hadir" }[appointment.status]}</span>}
    </div>;
  }

  return <section className="screen-enter grid gap-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-white">Appointment</h2><p className="text-sm text-zinc-400">{upcoming.length} upcoming</p></div><button className="primary-button" onClick={openNew}><Plus className="h-4 w-4" /> New Appointment</button></div>
    {error ? <p className="rounded-md border border-red-800 bg-red-950/50 p-3 text-sm text-red-100" role="alert">{error}</p> : null}
    {profile.role === "admin" ? <OwnerFilterSelect value={ownerFilter} onChange={setOwnerFilter} members={teamMembers} records={appointments} className="sm:max-w-xs" /> : null}
    <h3 className="text-sm font-semibold text-zinc-300">Upcoming</h3>
    {notice ? <p className="text-sm text-emerald-300" role="status">{notice}</p> : null}
    {saving ? <p className="flex items-center gap-2 text-sm text-zinc-400" role="status"><LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />Saving...</p> : null}
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
