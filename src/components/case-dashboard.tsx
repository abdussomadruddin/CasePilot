"use client";

import {
  AlertTriangle,
  Banknote,
  Bell,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  FileText,
  FolderKanban,
  ListChecks,
  LogIn,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Shield,
  Trash2,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { getCurrentProfile, signInWithPassword, signOut } from "@/lib/auth";
import { createEmptyCase } from "@/lib/demo-data";
import {
  loadCases,
  removeCase,
  saveCase,
  uploadDocuments,
  usingSupabase,
} from "@/lib/case-store";
import {
  caseStatuses,
  documentTypeLabels,
  documentTypes,
  roleLabels,
  roles,
  statusLabels,
  type BankDetail,
  type CaseFormValues,
  type CaseRecord,
  type CaseStatus,
  type DashboardTab,
  type DocumentType,
  type Profile,
  type Role,
  type UploadDocumentInput,
} from "@/lib/types";
import {
  canCreateCase,
  canDeleteCase,
  canEditBanks,
  canEditCase,
  canUpdateToStatus,
  canUploadDocuments,
  describeAssignedTeam,
  formatRole,
  formatStatus,
  getAssignedRoles,
  getLatestRemark,
  getLatestUpdateTime,
  getNextFollowUpTime,
  getVisibleCases,
  isFollowUpDue,
  isMyTask,
  isTerminalStatus,
  needsAttentionForRole,
  nextFollowUpFrom,
} from "@/lib/workflow";

type TabDefinition = {
  id: DashboardTab;
  label: string;
  icon: LucideIcon;
};

const tabs: TabDefinition[] = [
  { id: "all", label: "All Cases", icon: FolderKanban },
  { id: "tasks", label: "My Tasks", icon: ListChecks },
  { id: "attention", label: "Need Attention", icon: Bell },
  { id: "followup", label: "Follow Up Due", icon: CalendarClock },
  { id: "completed", label: "Completed", icon: CheckCircle2 },
];

const statusTone: Record<CaseStatus, string> = {
  documents_collected: "border-blue-200 bg-blue-50 text-blue-800",
  more_documents_needed: "border-amber-200 bg-amber-50 text-amber-800",
  submission: "border-indigo-200 bg-indigo-50 text-indigo-800",
  rejected: "border-rose-200 bg-rose-50 text-rose-800",
  lou_received: "border-emerald-200 bg-emerald-50 text-emerald-800",
  lou_submitted_for_order: "border-cyan-200 bg-cyan-50 text-cyan-800",
  car_registered: "border-violet-200 bg-violet-50 text-violet-800",
  car_delivered: "border-green-200 bg-green-50 text-green-800",
  cancelled: "border-slate-300 bg-slate-100 text-slate-700",
};

const statusAccent: Record<CaseStatus, string> = {
  documents_collected: "border-l-blue-500",
  more_documents_needed: "border-l-amber-500",
  submission: "border-l-indigo-500",
  rejected: "border-l-rose-500",
  lou_received: "border-l-emerald-500",
  lou_submitted_for_order: "border-l-cyan-500",
  car_registered: "border-l-violet-500",
  car_delivered: "border-l-green-500",
  cancelled: "border-l-slate-400",
};

const initialLogin = {
  email: "",
  password: "",
};

const workflowSteps: CaseStatus[] = [
  "documents_collected",
  "submission",
  "lou_received",
  "lou_submitted_for_order",
  "car_registered",
  "car_delivered",
];

const documentDisplayTypes: DocumentType[] = [
  ...documentTypes,
  "other",
];

function downloadDocuments(documents: Array<{ name: string; url: string }>) {
  documents.forEach((doc, index) => {
    window.setTimeout(() => {
      const link = window.document.createElement("a");
      link.href = doc.url;
      link.download = doc.name;
      link.rel = "noopener";
      window.document.body.appendChild(link);
      link.click();
      link.remove();
    }, index * 150);
  });
}

function formatDateTime(value: string) {
  if (!value) return "Not required";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatShort(value: string) {
  if (!value) return "None";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function normalizedPhone(phone: string) {
  return phone.replace(/[^\d+]/g, "");
}

export function CaseDashboard() {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [role, setRole] = useState<Role>("admin");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [source, setSource] = useState<"supabase" | "demo">("demo");
  const [activeTab, setActiveTab] = useState<DashboardTab>("all");
  const [editingCase, setEditingCase] = useState<CaseRecord | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [login, setLogin] = useState(initialLogin);
  const [authLoading, setAuthLoading] = useState(false);
  const supabaseConfigured = usingSupabase();

  useEffect(() => {
    let mounted = true;

    async function boot() {
      try {
        setLoading(true);
        setError("");

        if (supabaseConfigured) {
          const currentProfile = await getCurrentProfile();

          if (!mounted) return;

          setProfile(currentProfile);
          if (currentProfile) {
            setRole(currentProfile.role);
            const result = await loadCases();
            if (!mounted) return;
            setCases(result.cases);
            setSource(result.source);
          }
        } else {
          const result = await loadCases();
          if (!mounted) return;
          setCases(result.cases);
          setSource(result.source);
        }
      } catch (caught) {
        if (!mounted) return;
        setError(caught instanceof Error ? caught.message : "Unable to load cases.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    boot();

    return () => {
      mounted = false;
    };
  }, [supabaseConfigured]);

  const visibleCases = useMemo(
    () => getVisibleCases(cases, role),
    [cases, role],
  );

  const tabCases = useMemo(() => {
    switch (activeTab) {
      case "tasks":
        return visibleCases.filter((record) => isMyTask(record, role));
      case "attention":
        return visibleCases.filter((record) => needsAttentionForRole(record, role));
      case "followup":
        return visibleCases.filter((record) => isFollowUpDue(record));
      case "completed":
        return visibleCases.filter((record) => isTerminalStatus(record.status));
      case "all":
      default:
        return visibleCases;
    }
  }, [activeTab, role, visibleCases]);

  const metrics = useMemo(
    () => ({
      all: visibleCases.length,
      tasks: visibleCases.filter((record) => isMyTask(record, role)).length,
      attention: visibleCases.filter((record) => needsAttentionForRole(record, role))
        .length,
      followup: visibleCases.filter((record) => isFollowUpDue(record)).length,
      completed: visibleCases.filter((record) => isTerminalStatus(record.status))
        .length,
    }),
    [role, visibleCases],
  );

  async function refreshCases() {
    try {
      setLoading(true);
      setError("");
      const result = await loadCases();
      setCases(result.cases);
      setSource(result.source);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to refresh cases.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setAuthLoading(true);
      setError("");
      const currentProfile = await signInWithPassword(login.email, login.password);
      setProfile(currentProfile);

      if (currentProfile) {
        setRole(currentProfile.role);
        const result = await loadCases();
        setCases(result.cases);
        setSource(result.source);
      } else {
        setError("Signed in, but no role profile was found.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign in.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignOut() {
    try {
      setAuthLoading(true);
      await signOut();
      setProfile(null);
      setCases([]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign out.");
    } finally {
      setAuthLoading(false);
    }
  }

  function openCreateForm() {
    setEditingCase(null);
    setIsFormOpen(true);
  }

  function openEditForm(record: CaseRecord) {
    setEditingCase(record);
    setIsFormOpen(true);
  }

  async function handleSave(values: CaseFormValues, documents: UploadDocumentInput[]) {
    const base = editingCase || createEmptyCase();
    const now = new Date().toISOString();
    const record: CaseRecord = {
      ...base,
      customerName: values.customerName.trim(),
      customerPhone: values.customerPhone.trim(),
      carModel: values.carModel.trim(),
      carVariant: values.carVariant.trim(),
      carColor: values.carColor.trim(),
      status: values.status,
      remark: values.remark.trim(),
      banks: values.banks,
      createdBy: editingCase?.createdBy || role,
      updatedBy: role,
      createdAt: editingCase?.createdAt || now,
      updatedAt: now,
      nextFollowUpAt: isTerminalStatus(values.status) ? "" : base.nextFollowUpAt || nextFollowUpFrom(),
    };

    try {
      setSaving(true);
      setError("");
      const nextCases = await saveCase(record, role, editingCase || undefined);
      setCases(nextCases);

      if (documents.length) {
        const withDocs = await uploadDocuments(record.id, documents, role);
        setCases(withDocs);
      }

      setIsFormOpen(false);
      setEditingCase(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save case.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(record: CaseRecord) {
    try {
      setSaving(true);
      setError("");
      const next = await removeCase(record.id);
      setCases(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete case.");
    } finally {
      setSaving(false);
    }
  }

  if (supabaseConfigured && !profile && !loading) {
    return (
      <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
        <section className="surface-card mx-auto max-w-md overflow-hidden p-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-md bg-ink text-white shadow-sm">
              <Shield className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-ink">
                Honda Case Operation System
              </h1>
              <p className="text-sm text-muted">Supabase sign in</p>
            </div>
          </div>

          <form className="space-y-4" onSubmit={handleLogin}>
            <Field label="Email">
              <input
                className="field"
                type="email"
                value={login.email}
                onChange={(event) =>
                  setLogin((current) => ({ ...current, email: event.target.value }))
                }
                required
              />
            </Field>
            <Field label="Password">
              <input
                className="field"
                type="password"
                value={login.password}
                onChange={(event) =>
                  setLogin((current) => ({
                    ...current,
                    password: event.target.value,
                  }))
                }
                required
              />
            </Field>

            {error ? <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}

            <button className="primary-button w-full" disabled={authLoading}>
              <LogIn className="h-4 w-4" aria-hidden="true" />
              {authLoading ? "Signing in" : "Sign in"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1480px] flex-col gap-5">
        <header className="surface-card overflow-hidden">
          <div className="flex flex-col gap-5 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-ink text-white shadow-sm">
                <FolderKanban className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold text-ink sm:text-2xl">
                  Honda Case Operation System
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
                  <span className="rounded-full border border-line bg-white px-2.5 py-1">
                    {source === "supabase" ? "Supabase connected" : "Demo mode"}
                  </span>
                  <span className="rounded-full border border-line bg-slate-50 px-2.5 py-1">
                    {formatRole(role)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {!supabaseConfigured ? (
                <label className="relative">
                  <span className="sr-only">Role</span>
                  <select
                    className="field min-w-48 appearance-none pr-9"
                    value={role}
                    onChange={(event) => setRole(event.target.value as Role)}
                  >
                    {roles.map((item) => (
                      <option key={item} value={item}>
                        {roleLabels[item]}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-muted" />
                </label>
              ) : profile ? (
                <button
                  className="secondary-button"
                  onClick={handleSignOut}
                  disabled={authLoading}
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Sign out
                </button>
              ) : null}

              <button className="secondary-button" onClick={refreshCases} disabled={loading}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Refresh
              </button>

              {canCreateCase(role) ? (
                <button className="primary-button" onClick={openCreateForm}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  New Case
                </button>
              ) : null}
            </div>
          </div>
        </header>

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <MetricCard
            label="All Cases"
            value={metrics.all}
            icon={FolderKanban}
            toneClass="bg-ink text-white"
          />
          <MetricCard
            label="My Tasks"
            value={metrics.tasks}
            icon={ListChecks}
            toneClass="bg-blue-600 text-white"
          />
          <MetricCard
            label="Need Attention"
            value={metrics.attention}
            icon={Bell}
            toneClass="bg-amber-500 text-white"
          />
          <MetricCard
            label="Follow Up Due"
            value={metrics.followup}
            icon={CalendarClock}
            toneClass="bg-cyan-600 text-white"
          />
          <MetricCard
            label="Completed"
            value={metrics.completed}
            icon={CheckCircle2}
            toneClass="bg-emerald-600 text-white"
          />
        </section>

        <section className="surface-card overflow-x-auto p-1.5">
          <div className="flex min-w-max gap-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  className={`flex items-center gap-2 rounded-md px-3.5 py-2.5 text-sm font-semibold transition ${
                    isActive
                      ? "bg-ink text-white shadow-sm"
                      : "text-muted hover:bg-slate-100 hover:text-ink"
                  }`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </section>

        <section className="grid gap-4">
          {loading ? (
            <div className="surface-card p-8 text-center text-sm text-muted">
              Loading cases
            </div>
          ) : tabCases.length ? (
            tabCases.map((record) => (
              <CaseCard
                key={record.id}
                record={record}
                role={role}
                saving={saving}
                onEdit={openEditForm}
                onDelete={handleDelete}
              />
            ))
          ) : (
            <div className="surface-card p-8 text-center text-sm text-muted">
              No cases in this tab
            </div>
          )}
        </section>
      </div>

      {isFormOpen ? (
        <CaseForm
          role={role}
          record={editingCase}
          saving={saving}
          onClose={() => {
            setIsFormOpen(false);
            setEditingCase(null);
          }}
          onSave={handleSave}
        />
      ) : null}
    </main>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  toneClass,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  toneClass: string;
}) {
  return (
    <div className="surface-card group p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-lift">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
        </div>
        <div className={`grid h-11 w-11 place-items-center rounded-md shadow-sm ${toneClass}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

function CaseCard({
  record,
  role,
  saving,
  onEdit,
  onDelete,
}: {
  record: CaseRecord;
  role: Role;
  saving: boolean;
  onEdit: (record: CaseRecord) => void;
  onDelete: (record: CaseRecord) => void;
}) {
  const assignedRoles = getAssignedRoles(record.status);
  const latestRemark = getLatestRemark(record);
  const nextFollowUp = getNextFollowUpTime(record);
  const needsAttention = needsAttentionForRole(record, role);
  const followUpDue = isFollowUpDue(record);
  const allowEdit = canEditCase(role, record);
  const allowDelete = canDeleteCase(role);
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <article
      className={`surface-card overflow-hidden border-l-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-lift ${statusAccent[record.status]}`}
    >
      <button
        type="button"
        className="flex w-full flex-col gap-3 p-4 text-left transition hover:bg-slate-50/80 sm:p-5 md:flex-row md:items-center md:justify-between"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((current) => !current)}
      >
        <div className="grid min-w-0 gap-1">
          <h2 className="truncate text-base font-semibold text-ink sm:text-lg">
            {record.customerName || "Unnamed customer"}
          </h2>
          <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-1 text-sm text-muted">
            <span className="truncate">{record.carModel}</span>
            <span className="text-slate-300" aria-hidden="true">
              /
            </span>
            <span className="truncate">{record.carVariant}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 md:justify-end">
          <span
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone[record.status]}`}
          >
            {formatStatus(record.status)}
          </span>
          <span className="grid h-9 w-9 place-items-center rounded-md border border-line bg-white text-muted shadow-sm">
            <ChevronDown
              className={`h-4 w-4 transition ${isExpanded ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </span>
        </div>
      </button>

      {isExpanded ? (
        <>
          <div className="border-t border-line/80 px-4 py-3 sm:px-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                {needsAttention ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    Need attention
                  </span>
                ) : null}
                {followUpDue ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-800">
                    <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                    Follow up due
                  </span>
                ) : null}
                {!needsAttention && !followUpDue ? (
                  <span className="text-sm text-muted">Case details</span>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2 lg:justify-end">
                {allowEdit ? (
                  <button className="secondary-button" onClick={() => onEdit(record)}>
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                    Edit / Upload
                  </button>
                ) : null}
                {allowDelete ? (
                  <button
                    className="danger-button"
                    onClick={() => onDelete(record)}
                    disabled={saving}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Delete
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid gap-5 p-4 pt-0 sm:p-5 sm:pt-0 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="grid gap-4">
              <WorkflowRail status={record.status} />

              <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <InfoItem label="Assigned team" value={describeAssignedTeam(record.status)} />
                <InfoItem label="Latest update" value={formatShort(getLatestUpdateTime(record))} />
                <InfoItem label="Next follow up" value={formatShort(nextFollowUp)} />
                <InfoItem label="Customer phone" value={record.customerPhone} />
              </dl>

              <div className="rounded-md bg-slate-50 p-4 ring-1 ring-line/80">
                <p className="mb-1 text-xs font-semibold uppercase tracking-normal text-muted">
                  Latest remark
                </p>
                <p className="text-sm leading-6 text-ink">{latestRemark}</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Panel title="Document files" icon={FileText}>
                  {record.documents.length ? (
                    <div className="grid gap-3">
                      <button
                        type="button"
                        className="secondary-button w-full"
                        onClick={() => downloadDocuments(record.documents)}
                      >
                        <Download className="h-4 w-4" aria-hidden="true" />
                        Download all documents
                      </button>

                      <div className="grid gap-2">
                        {documentDisplayTypes.map((documentType) => {
                          const documents = record.documents.filter(
                            (doc) => doc.documentType === documentType,
                          );

                          return (
                            <div
                              key={documentType}
                              className="rounded-md bg-white p-3 ring-1 ring-line/80"
                            >
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-ink">
                                  {documentTypeLabels[documentType]}
                                </p>
                                {documents.length ? (
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-1.5 rounded-md border border-line bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-ink transition hover:bg-white"
                                    onClick={() => downloadDocuments(documents)}
                                  >
                                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                                    Download
                                  </button>
                                ) : null}
                              </div>

                              {documents.length ? (
                                <ul className="grid gap-2">
                                  {documents.map((doc) => (
                                    <li
                                      key={doc.id}
                                      className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 text-sm"
                                    >
                                      <div className="min-w-0">
                                        <p className="truncate font-medium text-ink">{doc.name}</p>
                                        <p className="text-xs text-muted">
                                          {roleLabels[doc.uploadedBy]} · {formatShort(doc.uploadedAt)}
                                        </p>
                                      </div>
                                      <a
                                        className="icon-button"
                                        href={doc.url}
                                        download={doc.name}
                                        aria-label={`Download ${doc.name}`}
                                      >
                                        <Download className="h-4 w-4" aria-hidden="true" />
                                      </a>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-sm text-muted">No file uploaded</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted">No files uploaded</p>
                  )}
                </Panel>

                <Panel title="Bank list" icon={Banknote}>
                  {record.banks.length ? (
                    <ul className="grid gap-2">
                      {record.banks.map((bank) => (
                        <li
                          key={bank.id}
                          className="rounded-md bg-white px-3 py-2 text-sm ring-1 ring-line/80"
                        >
                          <p className="font-medium text-ink">{bank.bankName}</p>
                          <p className="text-slate-600">{bank.bankerName}</p>
                          <p className="text-muted">{bank.bankerPhone}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted">No bank added</p>
                  )}
                </Panel>
              </div>
            </div>

            <Panel title="Activity timeline" icon={Clock3}>
              <ol className="relative grid gap-3 before:absolute before:bottom-2 before:left-3 before:top-2 before:w-px before:bg-line">
                {[...record.activities]
                  .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
                  .map((activity) => (
                    <li key={activity.id} className="flex gap-3">
                      <span className="relative z-10 mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-muted ring-1 ring-line">
                        <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">{activity.message}</p>
                        <p className="text-xs text-muted">
                          {activity.actorName} · {formatDateTime(activity.createdAt)}
                        </p>
                      </div>
                    </li>
                  ))}
              </ol>
            </Panel>
          </div>

          {assignedRoles.includes(role) && !isTerminalStatus(record.status) ? (
            <div className="border-t border-line/80 bg-slate-50/70 px-4 py-3 text-sm text-slate-600 sm:px-5">
              <span className="font-medium text-ink">{roleLabels[role]}</span> should add a
              remark or update the case status before the reminder window closes.
            </div>
          ) : null}
        </>
      ) : null}
    </article>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white p-3 ring-1 ring-line/80">
      <dt className="text-xs font-semibold uppercase tracking-normal text-muted">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-medium text-ink">{value || "None"}</dd>
    </div>
  );
}

function WorkflowRail({ status }: { status: CaseStatus }) {
  const currentIndex = workflowSteps.indexOf(status);
  const isSpecialStatus = currentIndex === -1;

  return (
    <div className="overflow-x-auto rounded-md bg-slate-50 px-3 py-3 ring-1 ring-line/80">
      <div className="flex min-w-max items-center gap-2">
        {workflowSteps.map((step, index) => {
          const isDone = !isSpecialStatus && index < currentIndex;
          const isCurrent = step === status || (isSpecialStatus && index === 0);

          return (
            <div key={step} className="flex items-center gap-2">
              <div
                className={`flex items-center gap-2 rounded-full px-2.5 py-1.5 text-xs font-semibold transition ${
                  isCurrent
                    ? "bg-ink text-white shadow-sm"
                    : isDone
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                      : "bg-white text-muted ring-1 ring-line"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    isCurrent
                      ? "bg-white"
                      : isDone
                        ? "bg-emerald-500"
                        : "bg-slate-300"
                  }`}
                />
                {statusLabels[isSpecialStatus && index === 0 ? status : step]}
              </div>
              {index < workflowSteps.length - 1 ? (
                <span className="h-px w-5 bg-line" aria-hidden="true" />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md bg-slate-50 p-3 ring-1 ring-line/80">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}

function DocumentUploadField({
  documentType,
  files,
  onChange,
}: {
  documentType: (typeof documentTypes)[number];
  files: File[];
  onChange: (files: File[]) => void;
}) {
  return (
    <label className="flex min-h-32 cursor-pointer flex-col justify-between gap-3 rounded-md border border-dashed border-slate-300 bg-white p-3 text-sm text-muted transition hover:border-honda hover:bg-red-50/30">
      <span className="flex items-center gap-2 font-semibold text-ink">
        <Upload className="h-4 w-4 text-muted" aria-hidden="true" />
        {documentTypeLabels[documentType]}
      </span>
      <span className="text-xs leading-5">
        {files.length
          ? files.map((file) => file.name).join(", ")
          : `Upload ${documentTypeLabels[documentType]}`}
      </span>
      <input
        className="sr-only"
        type="file"
        multiple
        onChange={(event) =>
          onChange(event.target.files ? Array.from(event.target.files) : [])
        }
      />
    </label>
  );
}

function CaseForm({
  role,
  record,
  saving,
  onClose,
  onSave,
}: {
  role: Role;
  record: CaseRecord | null;
  saving: boolean;
  onClose: () => void;
  onSave: (values: CaseFormValues, documents: UploadDocumentInput[]) => Promise<void>;
}) {
  const isNew = !record;
  const empty = createEmptyCase();
  const source = record || empty;
  const [values, setValues] = useState<CaseFormValues>({
    customerName: source.customerName,
    customerPhone: source.customerPhone,
    carModel: source.carModel,
    carVariant: source.carVariant,
    carColor: source.carColor,
    status: source.status,
    remark: source.remark,
    banks: source.banks.length ? source.banks : [emptyBank()],
  });
  const [documentFiles, setDocumentFiles] = useState<Record<DocumentType, File[]>>(
    emptyDocumentFiles,
  );
  const canManageBanks = isNew || canEditBanks(role);
  const canAttachDocuments = canUploadDocuments(role);
  const allowedStatuses = caseStatuses.filter((status) => canUpdateToStatus(role, status));
  const statusOptions = allowedStatuses.includes(values.status)
    ? allowedStatuses
    : [values.status, ...allowedStatuses];

  function updateField<K extends keyof CaseFormValues>(
    key: K,
    value: CaseFormValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function updateBank(index: number, key: keyof BankDetail, value: string) {
    setValues((current) => ({
      ...current,
      banks: current.banks.map((bank, bankIndex) =>
        bankIndex === index ? { ...bank, [key]: value } : bank,
      ),
    }));
  }

  function addBank() {
    setValues((current) => {
      if (current.banks.length >= 5) return current;
      return { ...current, banks: [...current.banks, emptyBank()] };
    });
  }

  function removeBank(index: number) {
    setValues((current) => ({
      ...current,
      banks: current.banks.filter((_, bankIndex) => bankIndex !== index),
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave(
      {
        ...values,
        banks: values.banks.filter(
          (bank) =>
            bank.bankName.trim() || bank.bankerName.trim() || bank.bankerPhone.trim(),
        ),
      },
      documentTypes.flatMap((documentType) =>
        documentFiles[documentType].map((file) => ({ file, documentType })),
      ),
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/50 p-4 backdrop-blur-sm">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-lg border border-white/80 bg-white shadow-lift">
        <div className="flex items-center justify-between gap-3 border-b border-line bg-slate-50/80 p-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">
              {isNew ? "New Case" : "Edit Case"}
            </h2>
            <p className="text-sm text-muted">{roleLabels[role]}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form className="grid gap-5 p-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Customer name">
              <input
                className="field"
                value={values.customerName}
                onChange={(event) => updateField("customerName", event.target.value)}
                required
              />
            </Field>
            <Field label="Customer phone">
              <input
                className="field"
                value={values.customerPhone}
                onChange={(event) => updateField("customerPhone", normalizedPhone(event.target.value))}
                required
              />
            </Field>
            <Field label="Car model">
              <input
                className="field"
                value={values.carModel}
                onChange={(event) => updateField("carModel", event.target.value)}
                required
              />
            </Field>
            <Field label="Car variant">
              <input
                className="field"
                value={values.carVariant}
                onChange={(event) => updateField("carVariant", event.target.value)}
                required
              />
            </Field>
            <Field label="Car color">
              <input
                className="field"
                value={values.carColor}
                onChange={(event) => updateField("carColor", event.target.value)}
                required
              />
            </Field>
            <Field label="Status">
              <select
                className="field"
                value={values.status}
                onChange={(event) =>
                  updateField("status", event.target.value as CaseStatus)
                }
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {statusLabels[status]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Remark">
            <textarea
              className="field min-h-28 resize-y"
              value={values.remark}
              onChange={(event) => updateField("remark", event.target.value)}
              required
            />
          </Field>

          <section className="grid gap-3 rounded-md bg-slate-50 p-3 ring-1 ring-line/80">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Banknote className="h-4 w-4 text-muted" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-ink">Bank details</h3>
              </div>
              {canManageBanks && values.banks.length < 5 ? (
                <button type="button" className="secondary-button" onClick={addBank}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add Bank
                </button>
              ) : null}
            </div>

            <div className="grid gap-3">
              {values.banks.map((bank, index) => (
                <div
                  key={bank.id}
                  className="grid gap-3 rounded-md bg-white p-3 ring-1 ring-line/80 md:grid-cols-[1fr_1fr_1fr_auto]"
                >
                  <Field label="Bank name">
                    <input
                      className="field"
                      value={bank.bankName}
                      disabled={!canManageBanks}
                      onChange={(event) =>
                        updateBank(index, "bankName", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Banker name">
                    <input
                      className="field"
                      value={bank.bankerName}
                      disabled={!canManageBanks}
                      onChange={(event) =>
                        updateBank(index, "bankerName", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Banker phone">
                    <input
                      className="field"
                      value={bank.bankerPhone}
                      disabled={!canManageBanks}
                      onChange={(event) =>
                        updateBank(index, "bankerPhone", event.target.value)
                      }
                    />
                  </Field>
                  {canManageBanks ? (
                    <button
                      type="button"
                      className="icon-button self-end"
                      onClick={() => removeBank(index)}
                      aria-label="Remove bank"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          {canAttachDocuments ? (
            <section className="grid gap-2 rounded-md bg-slate-50 p-3 ring-1 ring-line/80">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-ink">Document upload</h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {documentTypes.map((documentType) => (
                  <DocumentUploadField
                    key={documentType}
                    documentType={documentType}
                    files={documentFiles[documentType]}
                    onChange={(files) =>
                      setDocumentFiles((current) => ({
                        ...current,
                        [documentType]: files,
                      }))
                    }
                  />
                ))}
              </div>
            </section>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancel
            </button>
            <button className="primary-button" disabled={saving}>
              <Save className="h-4 w-4" aria-hidden="true" />
              {saving ? "Saving" : "Save Case"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function emptyBank(): BankDetail {
  return {
    id: crypto.randomUUID(),
    bankName: "",
    bankerName: "",
    bankerPhone: "",
  };
}

function emptyDocumentFiles(): Record<DocumentType, File[]> {
  return {
    ic: [],
    license: [],
    pay_slip: [],
    bank_statement: [],
    other: [],
  };
}
