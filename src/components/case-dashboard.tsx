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
  ExternalLink,
  FileText,
  FolderKanban,
  ListChecks,
  LogIn,
  LogOut,
  MessageCircle,
  MoreVertical,
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
import { getSupabaseClient } from "@/lib/supabase";
import {
  createTeamMember,
  updateTeamMember,
  type TeamMemberFormValues,
} from "@/lib/team-store";
import {
  caseStatuses,
  caseDealerLabels,
  caseDealers,
  roles,
  roleLabels,
  statusLabels,
  type BankDetail,
  type CaseDocument,
  type CaseFormValues,
  type CaseRecord,
  type CaseStatus,
  type DashboardTab,
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

const uploadTimeoutMs = 5 * 60 * 1000;

type WhatsAppRecipient = {
  id: string;
  name: string;
  phone: string;
  subtitle: string;
};

type PushStatus = "unsupported" | "default" | "denied" | "enabled" | "loading" | "error";

type CarCatalogItem = {
  model: string;
  segment: string;
  variants: string[];
  colors: string[];
};

const tabs: TabDefinition[] = [
  { id: "all", label: "All Cases", icon: FolderKanban },
  { id: "tasks", label: "My Tasks", icon: ListChecks },
  { id: "attention", label: "Need Attention", icon: Bell },
  { id: "followup", label: "Follow Up Due", icon: CalendarClock },
  { id: "completed", label: "Completed", icon: CheckCircle2 },
  { id: "team", label: "Team", icon: Users },
];

const carCatalog: CarCatalogItem[] = [
  {
    model: "Honda City",
    segment: "Sedan",
    variants: ["1.5 S", "1.5 E", "1.5 V", "1.5 RS", "1.5 e:HEV RS"],
    colors: [
      "Crystal Black Pearl",
      "Meteoroid Gray Metallic",
      "Platinum White Pearl",
      "Lunar Silver Metallic",
      "Ignite Red Metallic",
      "Phoenix Orange Pearl",
    ],
  },
  {
    model: "Honda City Hatchback",
    segment: "Hatchback",
    variants: ["1.5 S", "1.5 E", "1.5 V", "1.5 RS", "1.5 e:HEV RS"],
    colors: [
      "Crystal Black Pearl",
      "Meteoroid Gray Metallic",
      "Platinum White Pearl",
      "Lunar Silver Metallic",
      "Ignite Red Metallic",
      "Phoenix Orange Pearl",
    ],
  },
  {
    model: "Honda WR-V",
    segment: "SUV",
    variants: ["1.5 S", "1.5 E", "1.5 V", "1.5 RS"],
    colors: [
      "Platinum White Pearl",
      "Meteoroid Gray Metallic",
      "Lunar Silver Metallic",
      "Crystal Black Pearl",
      "Ignite Red Metallic",
    ],
  },
  {
    model: "Honda HR-V",
    segment: "SUV",
    variants: ["1.5 S", "1.5 Turbo E", "1.5 Turbo V", "1.5 e:HEV RS"],
    colors: [
      "Platinum White Pearl",
      "Meteoroid Gray Metallic",
      "Crystal Black Pearl",
      "Phoenix Orange Pearl",
      "Stellar Diamond Pearl",
    ],
  },
  {
    model: "Honda Civic",
    segment: "Sedan",
    variants: ["1.5 Turbo E", "1.5 Turbo V", "1.5 Turbo RS", "2.0 e:HEV RS"],
    colors: [
      "Platinum White Pearl",
      "Crystal Black Pearl",
      "Meteoroid Gray Metallic",
      "Ignite Red Metallic",
      "Canyon River Blue Metallic",
    ],
  },
  {
    model: "Honda CR-V",
    segment: "SUV",
    variants: ["2.0 e:HEV E", "1.5 Turbo V", "2.0 e:HEV RS"],
    colors: [
      "Platinum White Pearl",
      "Crystal Black Pearl",
      "Meteoroid Gray Metallic",
      "Canyon River Blue Metallic",
      "Ignite Red Metallic",
    ],
  },
  {
    model: "Honda e:N1",
    segment: "SUV / EV",
    variants: ["e:N1 (EV)"],
    colors: [
      "Platinum White Pearl",
      "Crystal Black Pearl",
      "Aqua Topaz Metallic",
      "Urban Gray Pearl",
    ],
  },
  {
    model: "Honda Prelude",
    segment: "Sports Coupe",
    variants: ["e:HEV S+ Shift"],
    colors: [
      "Platinum White Pearl",
      "Crystal Black Pearl",
      "Flame Red",
      "Sonic Gray Pearl",
      "Seabed Blue Pearl (bergantung stok)",
    ],
  },
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

function getCarCatalogItem(model: string) {
  return carCatalog.find((item) => item.model === model);
}

function optionsWithCurrent(options: readonly string[], current: string) {
  if (!current || options.includes(current)) return options;
  return [current, ...options];
}

function getDocumentDownloadUrl(doc: { name: string; url: string }) {
  if (isGoogleDriveUrl(doc.url)) return doc.url;

  const params = new URLSearchParams({ url: doc.url, name: doc.name });
  return `/api/download-document?${params.toString()}`;
}

function getCaseDriveFolderUrl(documents: CaseDocument[]) {
  return documents.find((document) => document.folderUrl)?.folderUrl || "";
}

function isGoogleDriveUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith("drive.google.com");
  } catch {
    return false;
  }
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
      if (isGoogleDriveUrl(doc.url)) {
        link.target = "_blank";
      }
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
  const [uploadingMessage, setUploadingMessage] = useState("");
  const [teamSaving, setTeamSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [login, setLogin] = useState(initialLogin);
  const [authLoading, setAuthLoading] = useState(false);
  const [pushStatus, setPushStatus] = useState<PushStatus>("default");
  const [pushMessage, setPushMessage] = useState("");
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);

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

  useEffect(() => {
    if (!profile) return;

    const supabase = getSupabaseClient();
    let refreshTimer: number | null = null;
    let disposed = false;

    async function refreshFromRealtime() {
      if (disposed) return;

      try {
        const result = await loadCases();
        if (!disposed) setCases(result.cases);
      } catch (caught) {
        if (!disposed) {
          console.warn(
            "Unable to refresh cases from realtime",
            caught instanceof Error ? caught.message : caught,
          );
        }
      }
    }

    function scheduleRefresh() {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(refreshFromRealtime, 250);
    }

    const channel = supabase
      .channel("casepilot-dashboard-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cases" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "case_banks" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "case_documents" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "case_activities" },
        scheduleRefresh,
      )
      .subscribe();

    return () => {
      disposed = true;
      if (refreshTimer) window.clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
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
      setIsHeaderMenuOpen(false);
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
      setIsHeaderMenuOpen(false);
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
      setIsHeaderMenuOpen(false);
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
    setUploadingMessage("");
    setEditingCase(null);
    setIsFormOpen(true);
  }

  function openEditForm(record: CaseRecord) {
    setUploadingMessage("");
    setEditingCase(record);
    setIsFormOpen(true);
  }

  async function handleSave(values: CaseFormValues, documents: UploadDocumentInput[]) {
    const base = editingCase || createEmptyCase();
    const now = new Date().toISOString();
    const record: CaseRecord = {
      ...base,
      dealer: values.dealer,
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
      setUploadingMessage(documents.length ? "Saving case..." : "");
      setError("");
      setSuccessMessage("");
      const nextCases = await saveCase(record, role, editingCase || undefined);
      setCases(nextCases);

      if (documents.length) {
        setUploadingMessage(`UPLOADING... 0/${documents.length}`);

        try {
          const withDocs = await uploadDocuments(record, documents, role, {
            timeoutMs: uploadTimeoutMs,
            onProgress: (progress) => {
              if (progress.phase === "syncing") {
                setUploadingMessage("UPLOADING... syncing Google Drive");
                return;
              }

              setUploadingMessage(
                `UPLOADING... ${progress.completed}/${progress.total}${
                  progress.fileName ? ` ${progress.fileName}` : ""
                }`,
              );
            },
          });
          setCases(withDocs);
          setSuccessMessage("Case saved. Documents uploaded.");
          setIsFormOpen(false);
          setEditingCase(null);
        } catch (caught) {
          const message =
            caught instanceof Error ? caught.message : "Unable to upload documents.";
          const fresh = await loadCases();
          setCases(fresh.cases);
          setIsFormOpen(false);
          setEditingCase(null);
          setSuccessMessage("");
          setError(
            `Case saved, but upload did not finish: ${message} Please submit the missing file(s) again.`,
          );
        }
      } else {
        setIsFormOpen(false);
        setEditingCase(null);
        setSuccessMessage("Case saved.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save case.");
    } finally {
      setSaving(false);
      setUploadingMessage("");
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
      setSuccessMessage("");
      const passwordRequested = Boolean(values.password.trim());
      const result = await createTeamMember(values);
      await refreshTeamMembers();
      setSuccessMessage(
        result.passwordUpdated || passwordRequested
          ? "Team member created. Password saved in Supabase Auth."
          : "Team member created.",
      );
    } catch (caught) {
      setSuccessMessage("");
      setError(caught instanceof Error ? caught.message : "Unable to create team member.");
    } finally {
      setTeamSaving(false);
    }
  }

  async function handleUpdateTeamMember(values: TeamMemberFormValues) {
    try {
      setTeamSaving(true);
      setError("");
      setSuccessMessage("");
      const passwordRequested = Boolean(values.password.trim());
      const result = await updateTeamMember(values);
      await refreshTeamMembers();
      setSuccessMessage(
        result.passwordUpdated || passwordRequested
          ? "Team updated. Password changed in Supabase Auth."
          : "Team updated. Password unchanged.",
      );
    } catch (caught) {
      setSuccessMessage("");
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
                Case Operation System
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
                Case Operation System
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
        <header className="surface-card relative z-20">
          <div className="flex flex-col gap-5 rounded-lg bg-gradient-to-r from-red-950/70 via-zinc-950 to-zinc-950 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-honda text-white shadow-sm shadow-red-950/60">
                <FolderKanban className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-extrabold tracking-normal text-white sm:text-2xl">
                  Case Operation System
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
                  <span className="rounded-full border border-red-500/30 bg-red-950/50 px-2.5 py-1 text-red-100">
                    LIVE
                  </span>
                  <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-zinc-200">
                    {formatRole(role)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              {canCreateCase(role) ? (
                <button
                  className="primary-button"
                  onClick={() => {
                    setIsHeaderMenuOpen(false);
                    openCreateForm();
                  }}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  New Case
                </button>
              ) : null}

              <div className="relative">
                <button
                  type="button"
                  className="secondary-button h-11 w-11 justify-center px-0"
                  onClick={() => setIsHeaderMenuOpen((current) => !current)}
                  aria-haspopup="menu"
                  aria-expanded={isHeaderMenuOpen}
                  aria-label="Open dashboard menu"
                >
                  <MoreVertical className="h-5 w-5" aria-hidden="true" />
                </button>

                {isHeaderMenuOpen ? (
                  <>
                    <button
                      type="button"
                      className="fixed inset-0 z-40 cursor-default bg-transparent"
                      aria-label="Close dashboard menu"
                      onClick={() => setIsHeaderMenuOpen(false)}
                    />
                    <div
                      className="absolute right-0 top-full z-50 mt-2 w-[min(17rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/50"
                      role="menu"
                    >
                      {profile ? (
                        <button
                          type="button"
                          className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold transition hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 ${
                            pushStatus === "enabled"
                              ? "text-emerald-100"
                              : "text-zinc-100"
                          }`}
                          onClick={handleEnableAlerts}
                          disabled={
                            pushStatus === "loading" ||
                            pushStatus === "unsupported"
                          }
                          title={pushMessage || "Enable web, iOS, and Android alerts"}
                          role="menuitem"
                        >
                          <Bell className="h-4 w-4 shrink-0" aria-hidden="true" />
                          <span className="truncate">
                            {pushStatus === "loading"
                              ? "Turning on"
                              : pushStatus === "enabled"
                                ? "Alerts on"
                                : pushStatus === "denied"
                                  ? "Alerts blocked"
                                  : "Enable alerts"}
                          </span>
                        </button>
                      ) : null}

                      {profile ? (
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-zinc-100 transition hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={handleSignOut}
                          disabled={authLoading}
                          role="menuitem"
                        >
                          <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
                          <span className="truncate">Sign out</span>
                        </button>
                      ) : null}

                      <button
                        type="button"
                        className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-zinc-100 transition hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={refreshCases}
                        disabled={loading}
                        role="menuitem"
                      >
                        <RefreshCw className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">Refresh</span>
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        {error ? (
          <div className="rounded-lg border border-red-900 bg-red-950/70 p-4 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        {successMessage ? (
          <div className="rounded-lg border border-emerald-900 bg-emerald-950/60 p-4 text-sm text-emerald-100">
            {successMessage}
          </div>
        ) : null}

        <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          <MetricCard
            label="All Cases"
            value={metrics.all}
            icon={FolderKanban}
            toneClass="bg-honda text-white"
            className="col-span-2 sm:col-span-1"
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
          key={editingCase?.id || "new"}
          role={role}
          record={editingCase}
          saving={saving}
          uploadingMessage={uploadingMessage}
          onClose={() => {
            if (saving) return;
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
  className = "",
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  toneClass: string;
  className?: string;
}) {
  return (
    <div className={`surface-card touch-tile group p-2.5 transition duration-200 hover:border-zinc-600 hover:shadow-lift sm:p-3 ${className}`}>
      <div className="flex min-h-[64px] items-center justify-between gap-2 sm:min-h-[70px]">
        <div className="min-w-0">
          <p className="text-xs font-semibold leading-tight text-zinc-400 sm:text-sm">
            {label}
          </p>
          <p className="mt-1 text-xl font-bold leading-none text-white sm:text-2xl">
            {value}
          </p>
        </div>
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-md shadow-sm shadow-black/40 sm:h-10 sm:w-10 ${toneClass}`}>
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
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
  const showContactLists = role !== "sales_manager";
  const [isExpanded, setIsExpanded] = useState(false);
  const [whatsAppRecipient, setWhatsAppRecipient] =
    useState<WhatsAppRecipient | null>(null);
  const hasCustomerPhone = Boolean(record.customerPhone.trim());
  const activeTeamMembers = showContactLists
    ? teamMembers.filter((member) => member.active !== false && member.phone?.trim())
    : [];
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
          <span className="max-w-full rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs font-semibold leading-snug text-zinc-200">
            {record.dealer ? caseDealerLabels[record.dealer] : "No dealer"}
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

          <div
            className={`grid gap-3 p-3 pt-0 sm:p-4 sm:pt-0 ${
              showContactLists
                ? "xl:grid-cols-[0.8fr_1fr_0.9fr_0.8fr]"
                : "xl:grid-cols-[0.8fr_1fr_0.9fr]"
            }`}
          >
            <div className="grid content-start gap-3">
              <dl className="grid gap-1.5 rounded-md bg-zinc-950 p-3 ring-1 ring-zinc-800">
                <CompactInfoItem
                  label="Team"
                  value={describeAssignedTeam(record.status, record.dealer)}
                />
                <CompactInfoItem
                  label="Dealer"
                  value={record.dealer ? caseDealerLabels[record.dealer] : "None"}
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
                      getCaseDriveFolderUrl(record.documents) ? (
                        <a
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 text-xs font-semibold text-zinc-100 shadow-sm transition hover:bg-zinc-900"
                          href={getCaseDriveFolderUrl(record.documents)}
                          target="_blank"
                          rel="noopener"
                          aria-label="Open case Drive folder"
                        >
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          Folder
                        </a>
                      ) : (
                        <button
                          type="button"
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 text-xs font-semibold text-zinc-100 shadow-sm transition hover:bg-zinc-900"
                          onClick={() => downloadDocuments(record.documents)}
                        >
                          <Download className="h-3.5 w-3.5" aria-hidden="true" />
                          All
                        </button>
                      )
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
                            <p className="line-clamp-2 min-w-0 break-words font-semibold leading-5 text-ink">
                              {doc.name}
                            </p>
                            <p className="break-words text-xs leading-5 text-muted">
                              {roleLabels[doc.uploadedBy]} · {formatShort(doc.uploadedAt)}
                            </p>
                          </div>
                          <a
                            className="icon-button h-8 w-8"
                            href={getDocumentDownloadUrl(doc)}
                            target={isGoogleDriveUrl(doc.url) ? "_blank" : undefined}
                            rel="noopener"
                            aria-label={`Open ${doc.name}`}
                          >
                            <ExternalLink className="h-4 w-4" aria-hidden="true" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted">No files uploaded</p>
                  )}
                </Panel>
            </div>

            {showContactLists ? (
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
            ) : null}

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
      selectedDocuments.map(async (document, index) => {
        const documentUrl = await shortenDocumentUrl(document.url);
        return `Document ${index + 1} : ${documentUrl}`;
      }),
    );

    return [
      trimmed,
      "",
      "Documents:",
      "",
      documentLines.join("\n\n"),
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
                      <span className="block line-clamp-2 break-words font-medium text-ink">
                        {document.name}
                      </span>
                      <span className="block text-xs text-muted">
                        {isGoogleDriveUrl(document.url) ? "Google Drive" : "Saved file"}
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

function CaseForm({
  role,
  record,
  saving,
  uploadingMessage,
  onClose,
  onSave,
}: {
  role: Role;
  record: CaseRecord | null;
  saving: boolean;
  uploadingMessage: string;
  onClose: () => void;
  onSave: (values: CaseFormValues, documents: UploadDocumentInput[]) => Promise<void>;
}) {
  const isNew = !record;
  const empty = createEmptyCase();
  const source = record || empty;
  const [values, setValues] = useState<CaseFormValues>({
    dealer: record?.dealer || "",
    customerName: source.customerName,
    customerPhone: source.customerPhone,
    carModel: source.carModel,
    carVariant: source.carVariant,
    carColor: source.carColor,
    status: source.status,
    remark: source.remark,
    banks: source.banks.length ? source.banks : [emptyBank()],
  });
  const [documentFiles, setDocumentFiles] = useState<File[]>([]);
  const normalizedFormRole = String(role).toLowerCase().replace(/[\s-]+/g, "_");
  const canManageBanks =
    isNew || normalizedFormRole === "customer_service" || canEditBanks(role);
  const canAttachDocuments = canUploadDocuments(role);
  const allowedStatuses = caseStatuses.filter((status) => canUpdateToStatus(role, status));
  const statusOptions = allowedStatuses.includes(values.status)
    ? allowedStatuses
    : [values.status, ...allowedStatuses];
  const selectedCar = getCarCatalogItem(values.carModel);
  const modelOptions = optionsWithCurrent(
    carCatalog.map((item) => item.model),
    values.carModel,
  );
  const variantOptions = optionsWithCurrent(
    selectedCar?.variants || [],
    values.carVariant,
  );
  const colorOptions = optionsWithCurrent(selectedCar?.colors || [], values.carColor);

  function updateField<K extends keyof CaseFormValues>(
    key: K,
    value: CaseFormValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function updateCarModel(model: string) {
    const nextCar = getCarCatalogItem(model);

    setValues((current) => ({
      ...current,
      carModel: model,
      carVariant:
        nextCar && nextCar.variants.includes(current.carVariant)
          ? current.carVariant
          : "",
      carColor:
        nextCar && nextCar.colors.includes(current.carColor) ? current.carColor : "",
    }));
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

  function addBulkDocuments(files: File[]) {
    if (!files.length) return;

    setDocumentFiles((current) => [...current, ...files]);
  }

  function removeDocumentFile(fileIndex: number) {
    setDocumentFiles((current) => current.filter((_, index) => index !== fileIndex));
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
      documentFiles.map((file) => ({ file, documentType: "other" })),
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
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close"
            disabled={saving}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form className="grid gap-5 p-4" onSubmit={submit}>
          {uploadingMessage ? (
            <div className="rounded-md border border-red-500/40 bg-red-950/30 p-3 text-sm text-red-50">
              <div className="flex items-center gap-2 font-semibold">
                <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                {uploadingMessage}
              </div>
              <p className="mt-1 text-xs leading-5 text-red-100/80">
                Please wait until every file is saved to Google Drive and synced to the
                dashboard. Timeout is 5 minutes.
              </p>
            </div>
          ) : null}

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
            <Field label="Model">
              <select
                className="field"
                value={values.carModel}
                onChange={(event) => updateCarModel(event.target.value)}
                required
              >
                <option value="">Select model</option>
                {modelOptions.map((model) => {
                  const option = getCarCatalogItem(model);

                  return (
                    <option key={model} value={model}>
                      {model}
                      {option ? ` · ${option.segment}` : ""}
                    </option>
                  );
                })}
              </select>
            </Field>
            <Field label="Variant">
              <select
                className="field"
                value={values.carVariant}
                onChange={(event) => updateField("carVariant", event.target.value)}
                disabled={!values.carModel}
                required
              >
                <option value="">Select variant</option>
                {variantOptions.map((variant) => (
                  <option key={variant} value={variant}>
                    {variant}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Color">
              <select
                className="field"
                value={values.carColor}
                onChange={(event) => updateField("carColor", event.target.value)}
                disabled={!values.carModel}
                required
              >
                <option value="">Select color</option>
                {colorOptions.map((color) => (
                  <option key={color} value={color}>
                    {color}
                  </option>
                ))}
              </select>
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
                {canManageBanks ? (
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-normal text-emerald-200">
                    Editable
                  </span>
                ) : null}
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

              <label className="touch-tile flex min-h-20 cursor-pointer items-center justify-between gap-3 rounded-md border border-zinc-700 bg-zinc-950 p-3 text-sm transition hover:border-honda hover:bg-red-950/30">
                <span className="min-w-0">
                  <span className="flex items-center gap-2 font-semibold text-ink">
                    <Upload className="h-4 w-4 text-muted" aria-hidden="true" />
                    Upload files
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-muted">
                    Files will be saved in the case Google Drive folder.
                  </span>
                </span>
                <span className="shrink-0 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs font-semibold text-zinc-200">
                  {documentFiles.length ? `${documentFiles.length} selected` : "Choose files"}
                </span>
                <input
                  className="sr-only"
                  type="file"
                  multiple
                  onChange={(event) => {
                    addBulkDocuments(event.target.files ? Array.from(event.target.files) : []);
                    event.currentTarget.value = "";
                  }}
                />
              </label>

              {documentFiles.length ? (
                <ul className="grid gap-1.5">
                  {documentFiles.map((file, index) => (
                    <li
                      key={`${file.name}-${file.lastModified}-${index}`}
                      className="flex min-w-0 items-center justify-between gap-2 rounded-md bg-zinc-950 px-3 py-2 text-sm ring-1 ring-zinc-800"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-zinc-100">{file.name}</p>
                        <p className="text-xs text-muted">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                      <button
                        type="button"
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-zinc-700 text-zinc-400 transition hover:border-red-500 hover:text-red-200"
                        onClick={() => removeDocumentFile(index)}
                        aria-label={`Remove ${file.name}`}
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}

          <section className="grid gap-3 rounded-md bg-zinc-900/70 p-3 ring-1 ring-zinc-800">
            <p className="text-sm font-semibold text-ink">Case dealer</p>
            <div className="grid grid-cols-2 gap-2">
              {caseDealers.map((dealer) => {
                const selected = values.dealer === dealer;

                return (
                  <button
                    key={dealer}
                    type="button"
                    className={`h-12 rounded-md border px-3 text-sm font-semibold transition ${
                      selected
                        ? "border-red-500 bg-red-600 text-white shadow-[0_0_22px_rgba(229,9,20,0.32)]"
                        : "border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-zinc-500 hover:text-white"
                    }`}
                    onClick={() => updateField("dealer", dealer)}
                    aria-pressed={selected}
                  >
                    {caseDealerLabels[dealer]}
                  </button>
                );
              })}
            </div>
          </section>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button className="primary-button" disabled={saving || !values.dealer}>
              {uploadingMessage ? (
                <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              {uploadingMessage ? "UPLOADING..." : saving ? "Saving" : "Save Case"}
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
