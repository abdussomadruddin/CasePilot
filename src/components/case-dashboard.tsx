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
  MessageCircle,
  Pencil,
  PhoneCall,
  Plus,
  RefreshCw,
  Save,
  Shield,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { getCurrentProfile, signInWithPassword, signOut } from "@/lib/auth";
import { createEmptyCase } from "@/lib/case-factory";
import {
  loadCases,
  loadTeamMembers,
  removeCase,
  saveCase,
  uploadDocuments,
} from "@/lib/case-store";
import {
  enablePushNotifications,
  getNotificationPermission,
  isNotificationSupported,
} from "@/lib/notifications";
import {
  createTeamMember,
  updateTeamMember,
  type TeamMemberFormValues,
} from "@/lib/team-store";
import {
  caseStatuses,
  documentTypeLabels,
  documentTypes,
  roles,
  roleLabels,
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

type WhatsAppRecipient = {
  id: string;
  name: string;
  phone: string;
  subtitle: string;
};

type PushStatus = "unsupported" | "default" | "denied" | "enabled" | "loading" | "error";

const tabs: TabDefinition[] = [
  { id: "all", label: "All Cases", icon: FolderKanban },
  { id: "tasks", label: "My Tasks", icon: ListChecks },
  { id: "attention", label: "Need Attention", icon: Bell },
  { id: "followup", label: "Follow Up Due", icon: CalendarClock },
  { id: "completed", label: "Completed", icon: CheckCircle2 },
  { id: "team", label: "Team", icon: Users },
];

const statusTone: Record<CaseStatus, string> = {
  documents_collected: "border-blue-500/50 bg-blue-500/15 text-blue-100",
  more_documents_needed: "border-amber-400/50 bg-amber-400/15 text-amber-100",
  submission: "border-indigo-400/50 bg-indigo-400/15 text-indigo-100",
  rejected: "border-red-500/60 bg-red-600/20 text-red-100",
  lou_received: "border-emerald-400/50 bg-emerald-400/15 text-emerald-100",
  hint_submitted: "border-cyan-400/50 bg-cyan-400/15 text-cyan-100",
  booking_form_received: "border-fuchsia-400/50 bg-fuchsia-400/15 text-fuchsia-100",
  registration_needed: "border-violet-400/50 bg-violet-400/15 text-violet-100",
  roadtax_grant_process: "border-orange-400/50 bg-orange-400/15 text-orange-100",
  prepare_delivery: "border-teal-400/50 bg-teal-400/15 text-teal-100",
  car_delivery: "border-green-400/50 bg-green-400/15 text-green-100",
  cancelled: "border-zinc-600 bg-zinc-800 text-zinc-200",
};

const statusAccent: Record<CaseStatus, string> = {
  documents_collected: "border-l-blue-500",
  more_documents_needed: "border-l-amber-500",
  submission: "border-l-indigo-500",
  rejected: "border-l-rose-500",
  lou_received: "border-l-emerald-500",
  hint_submitted: "border-l-cyan-500",
  booking_form_received: "border-l-fuchsia-500",
  registration_needed: "border-l-violet-500",
  roadtax_grant_process: "border-l-orange-500",
  prepare_delivery: "border-l-teal-500",
  car_delivery: "border-l-green-500",
  cancelled: "border-l-slate-400",
};

const initialLogin = {
  email: "",
  password: "",
};

function getDocumentDownloadUrl(doc: { name: string; url: string }) {
  const params = new URLSearchParams({ url: doc.url, name: doc.name });
  return `/api/download-document?${params.toString()}`;
}

function getAbsoluteDocumentDownloadUrl(doc: { name: string; url: string }) {
  if (typeof window === "undefined") return getDocumentDownloadUrl(doc);
  return new URL(getDocumentDownloadUrl(doc), window.location.origin).toString();
}

async function shortenDocumentUrl(url: string) {
  try {
    const response = await fetch("/api/shorten-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) return url;

    const result = (await response.json()) as { shortUrl?: string };
    return result.shortUrl || url;
  } catch {
    return url;
  }
}

function downloadDocuments(documents: Array<{ name: string; url: string }>) {
  documents.filter((doc) => doc.url && doc.url !== "#").forEach((doc, index) => {
    window.setTimeout(() => {
      const link = window.document.createElement("a");
      link.href = getDocumentDownloadUrl(doc);
      link.download = doc.name;
      link.rel = "noopener";
      window.document.body.appendChild(link);
      link.click();
      link.remove();
    }, index * 150);
  });
}

function getDocumentTypeLabel(documentType?: DocumentType) {
  if (!documentType) return documentTypeLabels.other;
  return documentTypeLabels[documentType] || documentTypeLabels.other;
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

function whatsappPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return `60${digits.slice(1)}`;
  return digits;
}

function buildWhatsAppUrl(phone: string, message: string) {
  return `https://wa.me/${whatsappPhone(phone)}?text=${encodeURIComponent(message)}`;
}

function buildTelUrl(phone: string) {
  const cleanPhone = normalizedPhone(phone);
  return cleanPhone ? `tel:${cleanPhone}` : "#";
}

function defaultWhatsAppMessage(record: CaseRecord) {
  return [
    `Hi, sharing case update for ${record.customerName}.`,
    "",
    `Car: ${record.carModel} ${record.carVariant}`,
    `Status: ${statusLabels[record.status]}`,
    `Remark: ${getLatestRemark(record)}`,
  ].join("\n");
}

export function CaseDashboard() {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [teamMembers, setTeamMembers] = useState<Profile[]>([]);
  const [role, setRole] = useState<Role>("admin");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeTab, setActiveTab] = useState<DashboardTab>("all");
  const [editingCase, setEditingCase] = useState<CaseRecord | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [teamSaving, setTeamSaving] = useState(false);
  const [error, setError] = useState("");
  const [login, setLogin] = useState(initialLogin);
  const [authLoading, setAuthLoading] = useState(false);
  const [pushStatus, setPushStatus] = useState<PushStatus>("default");
  const [pushMessage, setPushMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function boot() {
      try {
        setLoading(true);
        setError("");

        const currentProfile = await getCurrentProfile();

        if (!mounted) return;

        setProfile(currentProfile);
        if (currentProfile) {
          setRole(currentProfile.role);
          const [result, members] = await Promise.all([
            loadCases(),
            loadTeamMembers(currentProfile.role === "admin"),
          ]);
          if (!mounted) return;
          setCases(result.cases);
          setTeamMembers(members);
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
  }, []);

  useEffect(() => {
    if (role !== "admin" && activeTab === "team") {
      setActiveTab("all");
    }
  }, [activeTab, role]);

  useEffect(() => {
    if (!profile) return;

    if (!isNotificationSupported()) {
      setPushStatus("unsupported");
      setPushMessage("Alerts unsupported");
      return;
    }

    const permission = getNotificationPermission();
    if (permission === "granted") {
      setPushStatus("enabled");
      setPushMessage("Alerts on");
    } else if (permission === "denied") {
      setPushStatus("denied");
      setPushMessage("Alerts blocked");
    } else {
      setPushStatus("default");
      setPushMessage("");
    }
  }, [profile]);

  const visibleCases = useMemo(
    () => getVisibleCases(cases, role),
    [cases, role],
  );

  const visibleTabs = useMemo(
    () => tabs.filter((tab) => role === "admin" || tab.id !== "team"),
    [role],
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
      const [result, members] = await Promise.all([
        loadCases(),
        loadTeamMembers(role === "admin"),
      ]);
      setCases(result.cases);
      setTeamMembers(members);
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
        const [result, members] = await Promise.all([
          loadCases(),
          loadTeamMembers(currentProfile.role === "admin"),
        ]);
        setCases(result.cases);
        setTeamMembers(members);
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
      setTeamMembers([]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign out.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleEnableAlerts() {
    if (!profile) return;

    try {
      setPushStatus("loading");
      setPushMessage("Turning alerts on");
      await enablePushNotifications(profile);
      setPushStatus("enabled");
      setPushMessage("Alerts on");

      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("CasePilot alerts enabled", {
          body: "You will receive case reminders on this device.",
          icon: "/icon-192.svg",
        });
      }
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Unable to enable alerts.";
      setPushStatus(
        getNotificationPermission() === "denied" ? "denied" : "error",
      );
      setPushMessage(message);
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

  async function refreshTeamMembers() {
    const members = await loadTeamMembers(role === "admin");
    setTeamMembers(members);

    if (profile) {
      const currentMember = members.find((member) => member.id === profile.id);
      if (currentMember) setProfile(currentMember);
    }
  }

  async function handleCreateTeamMember(values: TeamMemberFormValues) {
    try {
      setTeamSaving(true);
      setError("");
      await createTeamMember(values);
      await refreshTeamMembers();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create team member.");
    } finally {
      setTeamSaving(false);
    }
  }

  async function handleUpdateTeamMember(values: TeamMemberFormValues) {
    try {
      setTeamSaving(true);
      setError("");
      await updateTeamMember(values);
      await refreshTeamMembers();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update team member.");
    } finally {
      setTeamSaving(false);
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

  if (!profile && loading) {
    return (
      <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
        <section className="surface-card mx-auto max-w-md overflow-hidden p-6">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-md bg-honda text-white shadow-sm shadow-red-950/60">
              <Shield className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-ink">
                Honda Case Operation System
              </h1>
              <p className="text-sm text-muted">Checking Supabase session</p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (!profile && !loading) {
    return (
      <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
        <section className="surface-card mx-auto max-w-md overflow-hidden p-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-md bg-honda text-white shadow-sm shadow-red-950/60">
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

            {error ? (
              <p className="rounded-md border border-red-900 bg-red-950/70 p-3 text-sm text-red-100">
                {error}
              </p>
            ) : null}

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
    <main className="min-h-screen px-3 py-3 sm:px-5 sm:py-5 lg:px-8">
      <div className="mx-auto flex max-w-[1560px] flex-col gap-5">
        <header className="surface-card overflow-hidden">
          <div className="flex flex-col gap-5 bg-gradient-to-r from-red-950/70 via-zinc-950 to-zinc-950 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-honda text-white shadow-sm shadow-red-950/60">
                <FolderKanban className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-extrabold tracking-normal text-white sm:text-2xl">
                  Honda Case Operation System
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
                  <span className="rounded-full border border-red-500/30 bg-red-950/50 px-2.5 py-1 text-red-100">
                    Supabase connected
                  </span>
                  <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-zinc-200">
                    {formatRole(role)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {profile ? (
                <button
                  className={`secondary-button ${
                    pushStatus === "enabled"
                      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-100"
                      : ""
                  }`}
                  onClick={handleEnableAlerts}
                  disabled={pushStatus === "loading" || pushStatus === "unsupported"}
                  title={pushMessage || "Enable web, iOS, and Android alerts"}
                >
                  <Bell className="h-4 w-4" aria-hidden="true" />
                  {pushStatus === "loading"
                    ? "Turning on"
                    : pushStatus === "enabled"
                      ? "Alerts on"
                      : pushStatus === "denied"
                        ? "Alerts blocked"
                        : "Enable alerts"}
                </button>
              ) : null}

              {profile ? (
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
          <div className="rounded-lg border border-red-900 bg-red-950/70 p-4 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
          <MetricCard
            label="All Cases"
            value={metrics.all}
            icon={FolderKanban}
            toneClass="bg-honda text-white"
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

        <section className="surface-card overflow-hidden p-1.5">
          <div className="grid grid-cols-2 gap-1 sm:flex sm:flex-wrap">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  className={`flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-md px-2.5 py-2.5 text-center text-xs font-semibold leading-tight transition sm:gap-2 sm:px-3.5 sm:text-sm ${
                    isActive
                      ? "bg-honda text-white shadow-sm shadow-red-950/60"
                      : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                  }`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden="true" />
                  <span className="min-w-0 break-words">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="grid gap-3">
          {activeTab === "team" && role === "admin" ? (
            <TeamManagementPanel
              members={teamMembers}
              saving={teamSaving}
              onCreate={handleCreateTeamMember}
              onUpdate={handleUpdateTeamMember}
            />
          ) : (
            <>
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
                    teamMembers={teamMembers}
                    onEdit={openEditForm}
                    onDelete={handleDelete}
                  />
                ))
              ) : (
                <div className="surface-card p-8 text-center text-sm text-muted">
                  No cases in this tab
                </div>
              )}
            </>
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
    <div className="surface-card touch-tile group p-4 transition duration-200 hover:-translate-y-1 hover:scale-[1.01] hover:border-zinc-600 hover:shadow-lift">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-400">{label}</p>
          <p className="mt-1 text-2xl font-bold text-white">{value}</p>
        </div>
        <div className={`grid h-11 w-11 place-items-center rounded-md shadow-sm shadow-black/40 ${toneClass}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

function TeamManagementPanel({
  members,
  saving,
  onCreate,
  onUpdate,
}: {
  members: Profile[];
  saving: boolean;
  onCreate: (values: TeamMemberFormValues) => Promise<void>;
  onUpdate: (values: TeamMemberFormValues) => Promise<void>;
}) {
  return (
    <div className="surface-card grid gap-4 p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-ink">Team Management</h2>
          <p className="text-sm text-muted">
            Manage login ID, password, name, phone and role.
          </p>
        </div>
        <span className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs font-semibold text-zinc-400">
          {members.length} members
        </span>
      </div>

      <TeamMemberCreateForm saving={saving} onCreate={onCreate} />

      <div className="grid gap-2">
        {members.map((member) => (
          <TeamMemberEditor
            key={member.id}
            member={member}
            saving={saving}
            onUpdate={onUpdate}
          />
        ))}
      </div>
    </div>
  );
}

function TeamMemberCreateForm({
  saving,
  onCreate,
}: {
  saving: boolean;
  onCreate: (values: TeamMemberFormValues) => Promise<void>;
}) {
  const [values, setValues] = useState<TeamMemberFormValues>({
    email: "",
    password: "",
    fullName: "",
    phone: "",
    role: "customer_service",
    active: true,
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onCreate(values);
    setValues({
      email: "",
      password: "",
      fullName: "",
      phone: "",
      role: "customer_service",
      active: true,
    });
  }

  return (
    <form
      className="grid gap-3 rounded-md bg-zinc-900/70 p-3 ring-1 ring-zinc-800 lg:grid-cols-[1fr_1fr_1fr_1fr_150px_auto]"
      onSubmit={submit}
    >
      <Field label="Login ID / Email">
        <input
          className="field"
          type="email"
          value={values.email}
          onChange={(event) =>
            setValues((current) => ({ ...current, email: event.target.value }))
          }
          required
        />
      </Field>
      <Field label="Password">
        <input
          className="field"
          type="password"
          value={values.password}
          onChange={(event) =>
            setValues((current) => ({ ...current, password: event.target.value }))
          }
          required
        />
      </Field>
      <Field label="Name">
        <input
          className="field"
          value={values.fullName}
          onChange={(event) =>
            setValues((current) => ({ ...current, fullName: event.target.value }))
          }
          required
        />
      </Field>
      <Field label="Phone">
        <input
          className="field"
          type="tel"
          value={values.phone}
          onChange={(event) =>
            setValues((current) => ({ ...current, phone: event.target.value }))
          }
        />
      </Field>
      <Field label="Role">
        <select
          className="field"
          value={values.role}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              role: event.target.value as Role,
            }))
          }
        >
          {roles.map((role) => (
            <option key={role} value={role}>
              {roleLabels[role]}
            </option>
          ))}
        </select>
      </Field>
      <button className="primary-button self-end" disabled={saving}>
        <UserPlus className="h-4 w-4" aria-hidden="true" />
        Add
      </button>
    </form>
  );
}

function TeamMemberEditor({
  member,
  saving,
  onUpdate,
}: {
  member: Profile;
  saving: boolean;
  onUpdate: (values: TeamMemberFormValues) => Promise<void>;
}) {
  const [values, setValues] = useState<TeamMemberFormValues>({
    id: member.id,
    email: member.email,
    password: "",
    fullName: member.fullName,
    phone: member.phone || "",
    role: member.role,
    active: member.active ?? true,
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onUpdate(values);
    setValues((current) => ({ ...current, password: "" }));
  }

  return (
    <form
      className={`grid gap-3 rounded-md border p-3 lg:grid-cols-[1fr_1fr_1fr_1fr_150px_110px_auto] ${
        values.active
          ? "border-zinc-800 bg-zinc-950"
          : "border-zinc-800 bg-zinc-900/70 opacity-75"
      }`}
      onSubmit={submit}
    >
      <Field label="Login ID / Email">
        <input
          className="field"
          type="email"
          value={values.email}
          onChange={(event) =>
            setValues((current) => ({ ...current, email: event.target.value }))
          }
          required
        />
      </Field>
      <Field label="New Password">
        <input
          className="field"
          type="password"
          value={values.password}
          placeholder="No change"
          onChange={(event) =>
            setValues((current) => ({ ...current, password: event.target.value }))
          }
        />
      </Field>
      <Field label="Name">
        <input
          className="field"
          value={values.fullName}
          onChange={(event) =>
            setValues((current) => ({ ...current, fullName: event.target.value }))
          }
          required
        />
      </Field>
      <Field label="Phone">
        <input
          className="field"
          type="tel"
          value={values.phone}
          onChange={(event) =>
            setValues((current) => ({ ...current, phone: event.target.value }))
          }
        />
      </Field>
      <Field label="Role">
        <select
          className="field"
          value={values.role}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              role: event.target.value as Role,
            }))
          }
        >
          {roles.map((role) => (
            <option key={role} value={role}>
              {roleLabels[role]}
            </option>
          ))}
        </select>
      </Field>
      <label className="flex items-end gap-2 pb-2 text-sm font-semibold text-ink">
        <input
          type="checkbox"
          checked={values.active}
          onChange={(event) =>
            setValues((current) => ({ ...current, active: event.target.checked }))
          }
        />
        Active
      </label>
      <button className="secondary-button self-end" disabled={saving}>
        <Save className="h-4 w-4" aria-hidden="true" />
        Save
      </button>
    </form>
  );
}

function CaseCard({
  record,
  role,
  saving,
  teamMembers,
  onEdit,
  onDelete,
}: {
  record: CaseRecord;
  role: Role;
  saving: boolean;
  teamMembers: Profile[];
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
  const [whatsAppRecipient, setWhatsAppRecipient] =
    useState<WhatsAppRecipient | null>(null);
  const hasCustomerPhone = Boolean(record.customerPhone.trim());
  const activeTeamMembers = teamMembers.filter(
    (member) => member.active !== false && member.phone?.trim(),
  );
  const customerRecipient: WhatsAppRecipient = {
    id: `${record.id}-customer`,
    name: record.customerName || "Customer",
    phone: record.customerPhone,
    subtitle: "Customer",
  };

  function toggleExpanded() {
    setIsExpanded((current) => !current);
  }

  return (
    <article
      className={`surface-card overflow-hidden border-l-4 transition duration-200 hover:border-zinc-600 hover:shadow-lift ${statusAccent[record.status]}`}
    >
      <div
        role="button"
        tabIndex={0}
        className="grid w-full cursor-pointer gap-3 bg-gradient-to-r from-zinc-950 via-zinc-950 to-zinc-900/80 p-3 text-left transition hover:from-zinc-900 hover:via-zinc-950 hover:to-red-950/30 sm:p-4 md:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)] lg:grid-cols-[minmax(190px,1.25fr)_minmax(170px,1fr)_minmax(160px,0.9fr)_auto_auto] lg:items-center"
        aria-expanded={isExpanded}
        onClick={toggleExpanded}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggleExpanded();
          }
        }}
      >
        <div className="min-w-0">
          <h2 className="line-clamp-2 break-words text-base font-bold leading-tight text-white">
            {record.customerName || "Unnamed customer"}
          </h2>
          <p className="mt-1 break-words text-xs font-medium text-zinc-400">
            {record.customerPhone || "No phone"}
          </p>
        </div>

        <div className="min-w-0">
          <p className="line-clamp-2 break-words text-sm font-semibold text-zinc-100">
            {record.carModel} {record.carVariant}
          </p>
          <p className="mt-1 break-words text-xs text-zinc-500">{record.carColor || "No color"}</p>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span
            className={`max-w-full rounded-full border px-2.5 py-1 text-xs font-semibold leading-snug ${statusTone[record.status]}`}
          >
            {formatStatus(record.status)}
          </span>
        </div>

        <div
          className="grid grid-cols-2 gap-2 md:col-span-2 lg:col-span-1 lg:flex lg:flex-wrap lg:items-center lg:justify-end"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2.5 text-xs font-semibold text-emerald-100 shadow-sm transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50 lg:w-auto lg:min-h-9"
            disabled={!hasCustomerPhone}
            onClick={() => setWhatsAppRecipient(customerRecipient)}
            aria-label={`WhatsApp ${record.customerName || "customer"}`}
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            WhatsApp
          </button>
          <a
            className={`inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold shadow-sm transition lg:w-auto lg:min-h-9 ${
              hasCustomerPhone
                ? "border-zinc-600 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                : "pointer-events-none border-zinc-800 bg-zinc-900 text-zinc-600 opacity-50"
            }`}
            href={buildTelUrl(record.customerPhone)}
            aria-label={`Call ${record.customerName || "customer"}`}
          >
            <PhoneCall className="h-4 w-4" aria-hidden="true" />
            Call
          </a>
        </div>

        <div className="flex min-w-0 items-center justify-between gap-3 md:col-span-2 lg:col-span-1 lg:justify-end">
          <p className="line-clamp-2 min-w-0 text-xs leading-5 text-zinc-400 lg:hidden">
            {latestRemark}
          </p>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-zinc-700 bg-zinc-900 text-zinc-300 shadow-sm">
            <ChevronDown
              className={`h-4 w-4 transition ${isExpanded ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </span>
        </div>

        <div className="hidden min-w-0 border-t border-zinc-800 pt-2 lg:col-span-5 lg:block">
          <p className="truncate text-xs leading-5 text-zinc-400">
            <span className="font-semibold text-zinc-200">Remark:</span> {latestRemark}
          </p>
        </div>
      </div>

      {isExpanded ? (
        <>
          <div className="border-t border-zinc-800 px-3 py-2.5 sm:px-4">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                {needsAttention ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/15 px-2.5 py-1 text-xs font-semibold text-amber-100">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    Need attention
                  </span>
                ) : null}
                {followUpDue ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-cyan-400/40 bg-cyan-400/15 px-2.5 py-1 text-xs font-semibold text-cyan-100">
                    <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                    Follow up due
                  </span>
                ) : null}
                {!needsAttention && !followUpDue ? (
                  <span className="text-sm text-muted">Case details</span>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap lg:justify-end">
                {allowEdit ? (
                  <button className="secondary-button w-full sm:w-auto" onClick={() => onEdit(record)}>
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                    Edit / Upload
                  </button>
                ) : null}
                {allowDelete ? (
                  <button
                    className="danger-button w-full sm:w-auto"
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

          <div className="grid gap-3 p-3 pt-0 sm:p-4 sm:pt-0 xl:grid-cols-[0.8fr_1fr_0.9fr_0.8fr]">
            <div className="grid content-start gap-3">
              <dl className="grid gap-1.5 rounded-md bg-zinc-950 p-3 ring-1 ring-zinc-800">
                <CompactInfoItem
                  label="Team"
                  value={describeAssignedTeam(record.status)}
                />
                <CompactInfoItem
                  label="Updated"
                  value={formatShort(getLatestUpdateTime(record))}
                />
                <CompactInfoItem label="Next" value={formatShort(nextFollowUp)} />
                <CompactInfoItem label="Phone" value={record.customerPhone} />
              </dl>

              <div className="rounded-md bg-zinc-900/70 p-3 ring-1 ring-zinc-800">
                <p className="mb-1 text-xs font-semibold uppercase tracking-normal text-muted">
                  Latest remark
                </p>
                <p className="line-clamp-3 text-sm leading-6 text-ink">{latestRemark}</p>
              </div>
            </div>

            <div className="grid content-start gap-3">
                <Panel
                  title="Document files"
                  icon={FileText}
                  action={
                    record.documents.length ? (
                      <button
                        type="button"
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 text-xs font-semibold text-zinc-100 shadow-sm transition hover:bg-zinc-900"
                        onClick={() => downloadDocuments(record.documents)}
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        All
                      </button>
                    ) : null
                  }
                >
                  {record.documents.length ? (
                    <ul className="grid gap-1.5">
                      {record.documents.map((doc) => (
                        <li
                          key={doc.id}
                          className="touch-tile flex items-center justify-between gap-2 rounded-md bg-zinc-950 px-2.5 py-1.5 text-sm ring-1 ring-zinc-800 transition hover:bg-zinc-900"
                        >
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="shrink-0 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-normal text-zinc-400">
                                {getDocumentTypeLabel(doc.documentType)}
                              </span>
                              <p className="line-clamp-2 min-w-0 break-words font-semibold leading-5 text-ink">
                                {doc.name}
                              </p>
                            </div>
                            <p className="break-words text-xs leading-5 text-muted">
                              {roleLabels[doc.uploadedBy]} · {formatShort(doc.uploadedAt)}
                            </p>
                          </div>
                          <a
                            className="icon-button h-8 w-8"
                            href={getDocumentDownloadUrl(doc)}
                            download={doc.name}
                            aria-label={`Download ${doc.name}`}
                          >
                            <Download className="h-4 w-4" aria-hidden="true" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted">No files uploaded</p>
                  )}
                </Panel>
            </div>

            <div className="grid content-start gap-3">
                <Panel title="Bank list" icon={Banknote}>
                  <div className="grid gap-2">
                    {record.banks.length ? (
                      <ul className="grid gap-1.5">
                        {record.banks.map((bank) => (
                          <li
                            key={bank.id}
                            className="touch-tile flex items-center justify-between gap-2 rounded-md bg-zinc-950 px-2.5 py-1.5 text-sm ring-1 ring-zinc-800 transition hover:bg-zinc-900"
                          >
                            <div className="min-w-0">
                              <p className="break-words font-semibold leading-5 text-ink">
                                {bank.bankName}
                              </p>
                              <p className="break-words text-xs leading-5 text-slate-600">
                                {bank.bankerName} · {bank.bankerPhone}
                              </p>
                            </div>
                            {bank.bankerPhone.trim() ? (
                              <button
                                type="button"
                                className="icon-button h-8 w-8 text-emerald-300"
                                onClick={() =>
                                  setWhatsAppRecipient({
                                    id: bank.id,
                                    name: bank.bankerName || bank.bankName,
                                    phone: bank.bankerPhone,
                                    subtitle: bank.bankName,
                                  })
                                }
                                aria-label={`WhatsApp ${bank.bankerName || bank.bankName}`}
                              >
                                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                              </button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted">No bank added</p>
                    )}

                    <div className="border-t border-zinc-800 pt-2">
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-normal text-muted">
                        Team WhatsApp
                      </p>
                      {activeTeamMembers.length ? (
                        <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-1">
                          {activeTeamMembers.map((member) => (
                            <li
                              key={member.id}
                              className="touch-tile flex items-center justify-between gap-2 rounded-md bg-zinc-950 px-2.5 py-1.5 text-sm ring-1 ring-zinc-800 transition hover:bg-zinc-900"
                            >
                              <div className="min-w-0">
                                <p className="break-words font-semibold leading-5 text-ink">
                                  {member.fullName}
                                </p>
                                <p className="break-words text-xs leading-5 text-muted">
                                  {roleLabels[member.role]} · {member.phone}
                                </p>
                              </div>
                              <button
                                type="button"
                                className="icon-button h-8 w-8 text-emerald-300"
                                onClick={() =>
                                  setWhatsAppRecipient({
                                    id: member.id,
                                    name: member.fullName,
                                    phone: member.phone || "",
                                    subtitle: roleLabels[member.role],
                                  })
                                }
                                aria-label={`WhatsApp ${member.fullName}`}
                              >
                                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted">No team phone added</p>
                      )}
                    </div>
                  </div>
                </Panel>
            </div>

            <Panel title="Activity timeline" icon={Clock3}>
              <ol className="relative grid max-h-80 gap-2 overflow-y-auto pr-1 before:absolute before:bottom-2 before:left-3 before:top-2 before:w-px before:bg-zinc-800">
                {[...record.activities]
                  .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
                  .map((activity) => (
                    <li key={activity.id} className="flex gap-2">
                      <span className="relative z-10 mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-zinc-950 text-muted ring-1 ring-zinc-800">
                        <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-sm font-medium text-ink">
                          {activity.message}
                        </p>
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
            <div className="border-t border-zinc-800 bg-zinc-900/70 px-4 py-3 text-sm text-zinc-400 sm:px-5">
              <span className="font-medium text-ink">{roleLabels[role]}</span> should add a
              remark or update the case status before the reminder window closes.
            </div>
          ) : null}
        </>
      ) : null}

      {whatsAppRecipient ? (
        <WhatsAppComposer
          record={record}
          recipient={whatsAppRecipient}
          onClose={() => setWhatsAppRecipient(null)}
        />
      ) : null}
    </article>
  );
}

function CompactInfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-3 text-xs">
      <dt className="shrink-0 font-semibold uppercase tracking-normal text-muted">
        {label}
      </dt>
      <dd className="min-w-0 break-words text-right font-semibold text-ink">
        {value || "None"}
      </dd>
    </div>
  );
}

function WhatsAppComposer({
  record,
  recipient,
  onClose,
}: {
  record: CaseRecord;
  recipient: WhatsAppRecipient;
  onClose: () => void;
}) {
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const availableDocuments = record.documents.filter(
    (document) => document.url && document.url !== "#",
  );
  const [message, setMessage] = useState(defaultWhatsAppMessage(record));
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>(
    availableDocuments.map((document) => document.id),
  );
  const [isPreparingWhatsApp, setIsPreparingWhatsApp] = useState(false);
  const selectedDocuments = availableDocuments.filter((document) =>
    selectedDocumentIds.includes(document.id),
  );
  const canSend = whatsappPhone(recipient.phone) && message.trim();

  function toggleDocument(documentId: string) {
    setSelectedDocumentIds((current) =>
      current.includes(documentId)
        ? current.filter((id) => id !== documentId)
        : [...current, documentId],
    );
  }

  async function messageWithDocuments() {
    const trimmed = message.trim();

    if (!selectedDocuments.length) return trimmed;

    const documentLines = await Promise.all(
      selectedDocuments.map(async (document) => {
        const shortUrl = await shortenDocumentUrl(getAbsoluteDocumentDownloadUrl(document));
        return `${documentTypeLabels[document.documentType]} : ${shortUrl}`;
      }),
    );

    return [
      trimmed,
      "",
      "Documents:",
      ...documentLines,
    ].join("\n");
  }

  async function sendWhatsApp() {
    if (!canSend) return;

    const pendingWindow = window.open("about:blank", "_blank");
    if (pendingWindow) {
      pendingWindow.opener = null;
    }

    try {
      setIsPreparingWhatsApp(true);
      const whatsAppUrl = buildWhatsAppUrl(recipient.phone, await messageWithDocuments());

      if (pendingWindow) {
        pendingWindow.location.href = whatsAppUrl;
      } else {
        window.location.href = whatsAppUrl;
      }

      onClose();
    } catch {
      pendingWindow?.close();
    } finally {
      setIsPreparingWhatsApp(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/80 p-3 backdrop-blur-sm sm:p-4">
      <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-lift sm:max-w-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-800 bg-gradient-to-r from-red-950/60 via-zinc-950 to-zinc-950 p-3 sm:p-4">
          <div className="min-w-0">
            <h2 className="line-clamp-2 break-words text-lg font-semibold text-ink">
              WhatsApp {recipient.name}
            </h2>
            <p className="break-words text-sm text-muted">
              {recipient.subtitle} · {recipient.phone}
            </p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="grid flex-1 gap-3 overflow-y-auto p-3 sm:gap-4 sm:p-4">
          <Field label="Message">
            <textarea
              className="field min-h-28 resize-y sm:min-h-36"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </Field>

          <section className="grid gap-2 rounded-md bg-zinc-900/70 p-3 ring-1 ring-zinc-800">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-ink">Documents to forward</h3>
            </div>

            {availableDocuments.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {availableDocuments.map((document) => (
                  <label
                    key={document.id}
                    className="touch-tile flex min-h-12 cursor-pointer items-center gap-3 rounded-md bg-zinc-950 px-3 py-2 text-sm ring-1 ring-zinc-800 transition hover:bg-zinc-900"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 rounded border-line text-honda focus:ring-honda"
                      checked={selectedDocumentIds.includes(document.id)}
                      onChange={() => toggleDocument(document.id)}
                    />
                    <span className="min-w-0">
                      <span className="block break-words font-medium text-ink">
                        {documentTypeLabels[document.documentType]}
                      </span>
                      <span className="block line-clamp-2 break-words text-xs text-muted">
                        {document.name}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">No document link available</p>
            )}
          </section>
        </div>

        <div className="grid shrink-0 gap-2 border-t border-zinc-800 bg-zinc-950 p-3 sm:flex sm:flex-row-reverse sm:justify-start sm:p-4">
          <button
            type="button"
            className="primary-button bg-emerald-600 hover:bg-emerald-700"
            onClick={sendWhatsApp}
            disabled={!canSend || isPreparingWhatsApp}
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            {isPreparingWhatsApp ? "Preparing link" : "Send WhatsApp"}
          </button>
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Panel({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: LucideIcon;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md bg-zinc-900/70 p-2.5 ring-1 ring-zinc-800">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
          <h3 className="truncate text-sm font-semibold text-ink">{title}</h3>
        </div>
        {action}
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
    <label className="touch-tile flex min-h-32 cursor-pointer flex-col justify-between gap-3 rounded-md border border-dashed border-zinc-700 bg-zinc-950 p-3 text-sm text-muted transition hover:border-honda hover:bg-red-950/30">
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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-4 backdrop-blur-sm">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-lift">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 bg-gradient-to-r from-red-950/60 via-zinc-950 to-zinc-950 p-4">
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

          <section className="grid gap-3 rounded-md bg-zinc-900/70 p-3 ring-1 ring-zinc-800">
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
                  className="grid gap-3 rounded-md bg-zinc-950 p-3 ring-1 ring-zinc-800 md:grid-cols-[1fr_1fr_1fr_auto]"
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
            <section className="grid gap-2 rounded-md bg-zinc-900/70 p-3 ring-1 ring-zinc-800">
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
    offer_letter: [],
    vso: [],
    lou: [],
    booking_form: [],
    jpj_registration_slip: [],
    roadtax_grant: [],
    other: [],
  };
}
