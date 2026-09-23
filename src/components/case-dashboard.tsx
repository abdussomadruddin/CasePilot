"use client";

import {
  AlertTriangle,
  Banknote,
  Bell,
  CalendarDays,
  CalendarClock,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  Filter,
  FolderKanban,
  ListChecks,
  LayoutDashboard,
  Menu,
  LogIn,
  LogOut,
  MessageCircle,
  MoreVertical,
  Pencil,
  PhoneCall,
  Plus,
  RefreshCw,
  Save,
  Share2,
  Shield,
  Smartphone,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import {
  getCurrentProfile,
  isSessionExpiredError,
  sessionExpiredMessage,
  signInWithPassword,
  signOut,
} from "@/lib/auth";
import { createEmptyCase } from "@/lib/case-factory";
import { AppointmentPanel, LeadPanel } from "@/components/operations-panels";
import { loadAppointments, loadLeads, revealLeadPhone } from "@/lib/operations-store";
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
  deleteTeamMember,
  updateTeamMember,
  type TeamMemberFormValues,
} from "@/lib/team-store";
import {
  caseStatuses,
  isLeadFollowUpDue,
  caseDealerLabels,
  caseDealers,
  roles,
  roleLabels,
  statusLabels,
  type ActivityEvent,
  type BankDetail,
  type CaseDealer,
  type CaseDocument,
  type CaseFormValues,
  type CaseRecord,
  type CaseStatus,
  type DashboardTab,
  type Profile,
  type LeadRecord,
  type LeadStatus,
  type AppointmentRecord,
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
  id: Exclude<DashboardTab, "team">;
  label: string;
  icon: LucideIcon;
  toneClass: string;
};

const uploadTimeoutMs = 5 * 60 * 1000;

type WhatsAppRecipient = {
  id: string;
  name: string;
  phone: string;
  subtitle: string;
};

type PushStatus = "unsupported" | "default" | "denied" | "enabled" | "loading" | "error";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type AppEnvironment = {
  checked: boolean;
  mobile: boolean;
  standalone: boolean;
  ios: boolean;
};

type StatusFilter = "all" | CaseStatus;
type DealerFilter = "all" | CaseDealer;

const caseMonthFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kuala_Lumpur",
  year: "numeric",
  month: "2-digit",
});

const caseMonthLabelFormatter = new Intl.DateTimeFormat("en-MY", {
  timeZone: "UTC",
  year: "numeric",
  month: "long",
});

type CarCatalogItem = {
  brand: CarBrand;
  model: string;
  segment: string;
  variants: string[];
  colors: string[];
};

type CarBrand = "Honda" | "Proton" | "JAECOO" | "JETOUR" | "Chery";

const carBrands: CarBrand[] = ["Honda", "Proton", "JAECOO", "JETOUR", "Chery"];

const metricTabs: TabDefinition[] = [
  { id: "all", label: "All Cases", icon: FolderKanban, toneClass: "bg-honda text-white" },
  { id: "this_month", label: "This Month Cases", icon: CalendarDays, toneClass: "bg-violet-600 text-white" },
  { id: "last_month", label: "Last Month Cases", icon: CalendarRange, toneClass: "bg-amber-500 text-white" },
  { id: "tasks", label: "My Tasks", icon: ListChecks, toneClass: "bg-blue-600 text-white" },
  { id: "followup", label: "Follow Up Due", icon: CalendarClock, toneClass: "bg-cyan-600 text-white" },
  { id: "completed", label: "Completed", icon: CheckCircle2, toneClass: "bg-emerald-600 text-white" },
];

const carCatalog: CarCatalogItem[] = [
  {
    brand: "Proton",
    model: "Proton S70",
    segment: "Sedan",
    variants: ["1.5T Executive", "1.5T Premium", "1.5T Flagship", "1.5T Flagship X"],
    colors: [
      "Quartz Black",
      "Marine Blue",
      "Space Grey",
      "Snow White",
      "Armour Silver",
      "Ruby Red",
    ],
  },
  {
    brand: "Proton",
    model: "Proton NEW S70 1.5 i-GT",
    segment: "Sedan",
    variants: ["LITE", "PRIME"],
    colors: [
      "Quartz Black",
      "Marine Blue",
      "Space Grey",
      "Snow White",
      "Armour Silver",
      "Ruby Red",
    ],
  },
  {
    brand: "Proton",
    model: "Proton Saga",
    segment: "Sedan",
    variants: ["Standard", "Executive", "Premium"],
    colors: [],
  },
  {
    brand: "Proton",
    model: "Proton Persona",
    segment: "Sedan",
    variants: ["Standard", "Executive", "Premium"],
    colors: [],
  },
  {
    brand: "Proton",
    model: "Proton Iriz",
    segment: "Hatchback",
    variants: ["Standard", "Executive", "Active"],
    colors: [],
  },
  {
    brand: "Proton",
    model: "Proton X50",
    segment: "SUV",
    variants: ["Executive", "Premium", "Flagship"],
    colors: [],
  },
  {
    brand: "Proton",
    model: "Proton X70",
    segment: "SUV",
    variants: ["Standard", "Executive", "Premium"],
    colors: [],
  },
  {
    brand: "Proton",
    model: "Proton X90",
    segment: "SUV",
    variants: ["Standard", "Executive", "Premium", "Flagship"],
    colors: [],
  },
  {
    brand: "Proton",
    model: "Proton e.MAS 5",
    segment: "Hatchback / EV",
    variants: ["Prime", "Premium"],
    colors: [],
  },
  {
    brand: "Proton",
    model: "Proton e.MAS 7",
    segment: "SUV / EV",
    variants: ["Prime", "Premium"],
    colors: [],
  },
  {
    brand: "JAECOO",
    model: "JAECOO J5",
    segment: "SUV",
    variants: ["Comfort", "Premium"],
    colors: [],
  },
  {
    brand: "JAECOO",
    model: "JAECOO J5 EV",
    segment: "SUV / EV",
    variants: ["Comfort", "Premium"],
    colors: [],
  },
  {
    brand: "JAECOO",
    model: "JAECOO J7",
    segment: "SUV",
    variants: ["2WD", "AWD"],
    colors: [],
  },
  {
    brand: "JAECOO",
    model: "JAECOO J7 PHEV",
    segment: "SUV / PHEV",
    variants: ["PHEV"],
    colors: [],
  },
  {
    brand: "JAECOO",
    model: "JAECOO J8",
    segment: "SUV",
    variants: ["2WD", "AWD"],
    colors: [],
  },
  {
    brand: "JETOUR",
    model: "JETOUR Dashing",
    segment: "SUV",
    variants: ["Comfort", "Prime"],
    colors: [],
  },
  {
    brand: "JETOUR",
    model: "JETOUR VT9",
    segment: "SUV",
    variants: ["Comfort", "Prime"],
    colors: [],
  },
  {
    brand: "JETOUR",
    model: "JETOUR T1",
    segment: "SUV",
    variants: ["1.5L TGDi 2WD", "2.0L TGDi XWD"],
    colors: [],
  },
  {
    brand: "JETOUR",
    model: "JETOUR T2",
    segment: "SUV",
    variants: ["2.0L TGDi XWD"],
    colors: [],
  },
  {
    brand: "JETOUR",
    model: "JETOUR T2 i-DM",
    segment: "SUV / PHEV",
    variants: ["i-DM PHEV"],
    colors: [],
  },
  {
    brand: "Chery",
    model: "Chery TIGGO Cross",
    segment: "SUV",
    variants: ["Turbo", "Hybrid"],
    colors: [],
  },
  {
    brand: "Chery",
    model: "Chery O5",
    segment: "Sedan",
    variants: ["C", "H"],
    colors: [],
  },
  {
    brand: "Chery",
    model: "Chery OMODA E5",
    segment: "SUV / EV",
    variants: ["C", "H"],
    colors: [],
  },
  {
    brand: "Chery",
    model: "Chery TIGGO 7 Pro",
    segment: "SUV",
    variants: ["Comfort", "Premium"],
    colors: [],
  },
  {
    brand: "Chery",
    model: "Chery TIGGO 7 PHEV",
    segment: "SUV / PHEV",
    variants: ["CSH PHEV"],
    colors: [],
  },
  {
    brand: "Chery",
    model: "Chery TIGGO 8",
    segment: "SUV",
    variants: ["Pro"],
    colors: [],
  },
  {
    brand: "Chery",
    model: "Chery TIGGO 8 PHEV",
    segment: "SUV / PHEV",
    variants: ["CSH PHEV"],
    colors: [],
  },
  {
    brand: "Chery",
    model: "Chery TIGGO 9",
    segment: "SUV",
    variants: ["Premium", "Signature"],
    colors: [],
  },
  {
    brand: "Honda",
    model: "Honda City",
    segment: "Sedan",
    variants: ["1.5L S", "1.5L E", "1.5L V", "1.5L RS", "1.5L e:HEV RS"],
    colors: [
      "Crystal Black Pearl",
      "Meteoroid Gray Metallic",
      "Platinum White Pearl",
      "Lunar Silver Metallic",
      "Ignite Red Metallic",
      "Phoenix Orange Pearl",
      "Stellar Diamond Pearl",
    ],
  },
  {
    brand: "Honda",
    model: "Honda City Hatchback",
    segment: "Hatchback",
    variants: ["1.5L S", "1.5L E", "1.5L V", "1.5L RS", "1.5L e:HEV RS"],
    colors: [
      "Crystal Black Pearl",
      "Meteoroid Gray Metallic",
      "Platinum White Pearl",
      "Lunar Silver Metallic",
      "Ignite Red Metallic",
      "Phoenix Orange Pearl",
      "Stellar Diamond Pearl",
    ],
  },
  {
    brand: "Honda",
    model: "Honda WR-V",
    segment: "SUV",
    variants: ["1.5L S", "1.5L E", "1.5L V", "1.5L RS"],
    colors: [
      "Platinum White Pearl",
      "Meteoroid Gray Metallic",
      "Lunar Silver Metallic",
      "Crystal Black Pearl",
      "Ignite Red Metallic",
      "Stellar Diamond Pearl",
    ],
  },
  {
    brand: "Honda",
    model: "Honda HR-V",
    segment: "SUV",
    variants: [
      "1.5L S",
      "1.5L Turbocharged E",
      "1.5L Turbocharged V",
      "1.5L Turbocharged V with 360° Camera",
      "1.5L e:HEV RS",
      "1.5L e:HEV RS with 360° Camera",
    ],
    colors: [
      "Platinum White Pearl",
      "Meteoroid Gray Metallic",
      "Crystal Black Pearl",
      "Phoenix Orange Pearl",
      "Ignite Red Metallic",
      "Stellar Diamond Pearl",
    ],
  },
  {
    brand: "Honda",
    model: "Honda Civic",
    segment: "Sedan",
    variants: [
      "1.5L Turbocharged E",
      "1.5L Turbocharged V",
      "1.5L Turbocharged RS",
      "2.0L e:HEV RS",
    ],
    colors: [
      "Platinum White Pearl",
      "Crystal Black Pearl",
      "Meteoroid Gray Metallic",
      "Ignite Red Metallic",
      "Canyon River Blue Metallic",
      "Stellar Diamond Pearl",
    ],
  },
  {
    brand: "Honda",
    model: "Honda CR-V",
    segment: "SUV",
    variants: ["2.0L e:HEV E", "1.5L Turbocharged V", "2.0L e:HEV RS"],
    colors: [
      "Platinum White Pearl",
      "Crystal Black Pearl",
      "Meteoroid Gray Metallic",
      "Canyon River Blue Metallic",
      "Ignite Red Metallic",
      "Stellar Diamond Pearl",
    ],
  },
  {
    brand: "Honda",
    model: "Honda e:N1",
    segment: "SUV / EV",
    variants: ["e:N1"],
    colors: [
      "Platinum White Pearl",
      "Crystal Black Pearl",
      "Aqua Topaz Metallic",
      "Urban Gray Pearl",
    ],
  },
  {
    brand: "Honda",
    model: "Honda Civic Type R",
    segment: "Sports",
    variants: ["Type R"],
    colors: [
      "Championship White",
      "Rallye Red",
      "Crystal Black Pearl",
      "Sonic Gray Pearl",
      "Racing Blue Pearl",
    ],
  },
  {
    brand: "Honda",
    model: "Honda Prelude",
    segment: "Sports Coupe",
    variants: ["Prelude e:HEV"],
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
  pending_sign_agreement: "border-cyan-400/50 bg-cyan-400/15 text-cyan-100",
  pending_allocation: "border-fuchsia-400/50 bg-fuchsia-400/15 text-fuchsia-100",
  waiting_ehakmilik: "border-violet-400/50 bg-violet-400/15 text-violet-100",
  registered: "border-sky-400/50 bg-sky-400/15 text-sky-100",
  grant_roadtax_collected: "border-orange-400/50 bg-orange-400/15 text-orange-100",
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
  pending_sign_agreement: "border-l-cyan-500",
  pending_allocation: "border-l-fuchsia-500",
  waiting_ehakmilik: "border-l-violet-500",
  registered: "border-l-sky-500",
  grant_roadtax_collected: "border-l-orange-500",
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
  if (/^https:\/\/[^/]+\/storage\/v1\/object\/public\/case-documents\//.test(doc.url)) return doc.url;

  const params = new URLSearchParams({ url: doc.url, name: doc.name });
  return `/api/download-document?${params.toString()}`;
}

function getCaseDriveFolderUrl(documents: CaseDocument[]) {
  const folderUrl = documents[0]?.folderUrl;
  return folderUrl && documents.every((document) => document.folderUrl === folderUrl) ? folderUrl : "";
}

function isGoogleDriveUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith("drive.google.com");
  } catch {
    return false;
  }
}

function downloadDocuments(documents: Array<{ name: string; url: string }>) {
  documents.filter((doc) => doc.url && doc.url !== "#").forEach((doc, index) => {
    window.setTimeout(() => {
      const link = window.document.createElement("a");
      link.href = getDocumentDownloadUrl(doc);
      link.download = doc.name;
      link.rel = "noopener";
      if (doc.url.startsWith("https://")) {
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

function isVisibleTimelineActivity(activity: ActivityEvent) {
  return activity.type !== "notification" && activity.type !== "follow_up";
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

function caseMonthKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(+date)) return "";

  const parts = caseMonthFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;

  return year && month ? `${year}-${month}` : "";
}

function caseMonthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) return value;

  return caseMonthLabelFormatter.format(new Date(Date.UTC(year, month - 1, 1)));
}

function previousCaseMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) return "";

  const previousYear = month === 1 ? year - 1 : year;
  const previousMonth = month === 1 ? 12 : month - 1;
  return `${previousYear}-${String(previousMonth).padStart(2, "0")}`;
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
  const [appSection, setAppSection] = useState<"dashboard" | "cases" | "leads" | "appointments" | "team">("dashboard");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [callingLeadId, setCallingLeadId] = useState("");
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [prefillCase, setPrefillCase] = useState<CaseRecord | null>(null);
  const [appointmentSubject, setAppointmentSubject] = useState("");
  const [leadStatusJump, setLeadStatusJump] = useState<LeadStatus | "all">("all");
  const [leadViewJump, setLeadViewJump] = useState<"all" | "followup">("all");
  const [leadNowMs, setLeadNowMs] = useState(() => Date.now());
  const currentMonth = caseMonthKey(new Date().toISOString());
  const lastMonth = previousCaseMonth(currentMonth);
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [teamMembers, setTeamMembers] = useState<Profile[]>([]);
  const [role, setRole] = useState<Role>("admin");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeTab, setActiveTab] = useState<DashboardTab>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dealerFilter, setDealerFilter] = useState<DealerFilter>("all");
  const [monthFilter, setMonthFilter] = useState("");
  const [editingCase, setEditingCase] = useState<CaseRecord | null>(null);
  const [caseToDelete, setCaseToDelete] = useState<CaseRecord | null>(null);
  const [deleteError, setDeleteError] = useState("");
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
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    if (!filtersOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFiltersOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", close);
    };
  }, [filtersOpen]);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);
  const [appEnvironment, setAppEnvironment] = useState<AppEnvironment>({
    checked: false,
    mobile: false,
    standalone: false,
    ios: false,
  });

  useEffect(() => {
    function readEnvironment() {
      const userAgent = navigator.userAgent;
      const ios = /iPhone|iPad|iPod/i.test(userAgent) ||
        (/Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1);
      const mobile = ios || /Android|Mobile/i.test(userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches ||
        Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

      setAppEnvironment({ checked: true, mobile, standalone, ios });
    }

    function captureInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    }

    readEnvironment();
    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    window.addEventListener("appinstalled", readEnvironment);
    window.addEventListener("pageshow", readEnvironment);
    document.addEventListener("visibilitychange", readEnvironment);

    return () => {
      window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
      window.removeEventListener("appinstalled", readEnvironment);
      window.removeEventListener("pageshow", readEnvironment);
      document.removeEventListener("visibilitychange", readEnvironment);
    };
  }, []);

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
          const canUseOperations = ["admin", "customer_service", "broker"].includes(currentProfile.role);
          const [result, members, nextLeads, nextAppointments] = await Promise.all([
            loadCases(),
            loadTeamMembers(currentProfile.role === "admin"),
            canUseOperations ? loadLeads() : Promise.resolve([]),
            canUseOperations ? loadAppointments() : Promise.resolve([]),
          ]);
          if (!mounted) return;
          setCases(result.cases);
          setTeamMembers(members);
          setLeads(nextLeads);
          setAppointments(nextAppointments);
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
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setDrawerOpen(false); };
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", close);
    };
  }, [drawerOpen]);

  useEffect(() => {
    const section = new URLSearchParams(window.location.search).get("section");
    if (section === "appointments" || section === "leads" || section === "cases") setAppSection(section);
    if (section === "leads" && new URLSearchParams(window.location.search).get("view") === "followup") setLeadViewJump("followup");
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setLeadNowMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let ignoreGesture = false;
    const touchStart = (event: TouchEvent) => {
      const target = event.target;
      ignoreGesture = event.touches.length !== 1 ||
        (target instanceof Element && Boolean(target.closest("input, textarea, select, [role='dialog']:not(.casepilot-drawer)")));
      startX = event.touches[0]?.clientX ?? 0;
      startY = event.touches[0]?.clientY ?? 0;
    };
    const touchEnd = (event: TouchEvent) => {
      if (ignoreGesture || event.changedTouches.length !== 1) return;
      const deltaX = (event.changedTouches[0]?.clientX ?? 0) - startX;
      const deltaY = (event.changedTouches[0]?.clientY ?? 0) - startY;
      if (Math.abs(deltaX) < 80 || Math.abs(deltaX) < Math.abs(deltaY) * 1.5) return;
      if (!drawerOpen && deltaX > 0) setDrawerOpen(true);
      if (drawerOpen && deltaX < 0) setDrawerOpen(false);
    };
    window.addEventListener("touchstart", touchStart, { passive: true });
    window.addEventListener("touchend", touchEnd, { passive: true });
    return () => { window.removeEventListener("touchstart", touchStart); window.removeEventListener("touchend", touchEnd); };
  }, [drawerOpen]);

  useEffect(() => {
    if (role !== "admin" && activeTab === "team") {
      setActiveTab("all");
    }

    if (role === "sales_manager") {
      setDealerFilter("all");
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

    const currentProfile = profile;
    const supabase = getSupabaseClient();
    let disposed = false;
    const canUseOperations = ["admin", "customer_service", "broker"].includes(currentProfile.role);

    function makeRefresh<T>(load: () => Promise<T>, apply: (value: T) => void) {
      let refreshing = false;
      let pending = false;
      return async () => {
        pending = true;
        if (refreshing || disposed) return;
        refreshing = true;
        while (pending && !disposed) {
          pending = false;
          try {
            const value = await load();
            if (!disposed) apply(value);
          } catch (caught) {
            if (!disposed) console.warn("Unable to refresh dashboard", caught);
          }
        }
        refreshing = false;
      };
    }

    const refreshCasesNow = makeRefresh(async () => (await loadCases()).cases, setCases);
    const refreshTeamNow = makeRefresh(() => loadTeamMembers(currentProfile.role === "admin"), setTeamMembers);
    const refreshLeadsNow = makeRefresh(loadLeads, setLeads);
    const refreshAppointmentsNow = makeRefresh(loadAppointments, setAppointments);

    function refreshAll() {
      void refreshCasesNow();
      void refreshTeamNow();
      if (canUseOperations) {
        void refreshLeadsNow();
        void refreshAppointmentsNow();
      }
    }

    function refreshProfile() {
      void getCurrentProfile().then((current) => {
        if (disposed || !current || current.id !== currentProfile.id) return;
        if (current.role !== currentProfile.role || current.fullName !== currentProfile.fullName || current.active !== currentProfile.active) {
          setProfile(current);
          setRole(current.role);
        }
      }).catch((caught) => console.warn("Unable to refresh profile", caught));
      void refreshTeamNow();
      void refreshCasesNow();
    }

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        refreshProfile();
        if (canUseOperations) {
          void refreshLeadsNow();
          void refreshAppointmentsNow();
        }
      }
    }

    let channel = supabase.channel("casepilot-dashboard-sync");
    for (const table of ["cases", "case_banks", "case_documents", "case_activities"]) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, () => { void refreshCasesNow(); });
    }
    if (canUseOperations) {
      for (const table of ["leads", "lead_notes", "lead_events"]) {
        channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, () => { void refreshLeadsNow(); });
      }
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => { void refreshAppointmentsNow(); });
    }
    channel = channel.on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, refreshProfile);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") refreshAll();
    });
    window.addEventListener("focus", refreshWhenVisible);
    window.addEventListener("pageshow", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      disposed = true;
      window.removeEventListener("focus", refreshWhenVisible);
      window.removeEventListener("pageshow", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      void supabase.removeChannel(channel);
    };
  }, [profile]);

  const visibleCases = useMemo(
    () => getVisibleCases(cases, role, profile?.id),
    [cases, profile?.id, role],
  );
  const newOwnLeads = role === "customer_service" || role === "broker"
    ? leads.filter((lead) => lead.ownerId === profile?.id && lead.status === "new" && !lead.phoneRevealedAt)
    : [];

  const tabCases = useMemo(() => {
    switch (activeTab) {
      case "this_month":
        return visibleCases.filter(
          (record) => caseMonthKey(record.createdAt) === currentMonth,
        );
      case "last_month":
        return visibleCases.filter(
          (record) => caseMonthKey(record.createdAt) === lastMonth,
        );
      case "tasks":
        return visibleCases.filter((record) => isMyTask(record, role, profile?.id));
      case "followup":
        return visibleCases.filter((record) => isFollowUpDue(record));
      case "completed":
        return visibleCases.filter((record) => isTerminalStatus(record.status));
      case "all":
      default:
        return visibleCases;
    }
  }, [activeTab, currentMonth, lastMonth, profile?.id, role, visibleCases]);

  const dealerFilterActive = role !== "sales_manager" && dealerFilter !== "all";
  const monthFilterActive = monthFilter !== "";
  const filtersActive =
    statusFilter !== "all" || dealerFilterActive || monthFilterActive;

  const statusFilterCounts = useMemo(() => {
    const counts = Object.fromEntries(
      caseStatuses.map((status) => [status, 0]),
    ) as Record<CaseStatus, number>;
    let total = 0;

    for (const record of tabCases) {
      if (dealerFilterActive && record.dealer !== dealerFilter) continue;
      if (monthFilterActive && caseMonthKey(record.createdAt) !== monthFilter) {
        continue;
      }

      counts[record.status] += 1;
      total += 1;
    }

    return { counts, total };
  }, [
    dealerFilter,
    dealerFilterActive,
    monthFilter,
    monthFilterActive,
    tabCases,
  ]);

  const monthFilterCounts = useMemo(() => {
    const counts = new Map<string, number>();
    let total = 0;

    for (const record of tabCases) {
      if (dealerFilterActive && record.dealer !== dealerFilter) continue;
      if (statusFilter !== "all" && record.status !== statusFilter) continue;

      const month = caseMonthKey(record.createdAt);
      if (!month) continue;

      counts.set(month, (counts.get(month) ?? 0) + 1);
      total += 1;
    }

    if (monthFilter && !counts.has(monthFilter)) {
      counts.set(monthFilter, 0);
    }

    const months = Array.from(counts, ([value, count]) => ({
      value,
      count,
      label: caseMonthLabel(value),
    })).sort((left, right) => right.value.localeCompare(left.value));

    return { months, total };
  }, [
    dealerFilter,
    dealerFilterActive,
    monthFilter,
    statusFilter,
    tabCases,
  ]);

  const filteredCases = useMemo(
    () =>
      tabCases.filter(
        (record) =>
          (statusFilter === "all" || record.status === statusFilter) &&
          (!dealerFilterActive || record.dealer === dealerFilter) &&
          (!monthFilterActive || caseMonthKey(record.createdAt) === monthFilter),
      ),
    [
      dealerFilter,
      dealerFilterActive,
      monthFilter,
      monthFilterActive,
      statusFilter,
      tabCases,
    ],
  );

  const metricCases = useMemo(
    () =>
      monthFilterActive
        ? visibleCases.filter(
            (record) => caseMonthKey(record.createdAt) === monthFilter,
          )
        : visibleCases,
    [monthFilter, monthFilterActive, visibleCases],
  );

  const metrics = useMemo(
    () => ({
      all: metricCases.length,
      this_month: visibleCases.filter(
        (record) => caseMonthKey(record.createdAt) === currentMonth,
      ).length,
      last_month: visibleCases.filter(
        (record) => caseMonthKey(record.createdAt) === lastMonth,
      ).length,
      tasks: metricCases.filter((record) => isMyTask(record, role, profile?.id)).length,
      followup: metricCases.filter((record) => isFollowUpDue(record)).length,
      completed: metricCases.filter((record) => isTerminalStatus(record.status))
        .length,
    }),
    [currentMonth, lastMonth, metricCases, profile?.id, role, visibleCases],
  );

  async function refreshCases() {
    try {
      setIsHeaderMenuOpen(false);
      setLoading(true);
      setError("");
      const canUseOperations = ["admin", "customer_service", "broker"].includes(role);
      const [result, members, nextLeads, nextAppointments] = await Promise.all([
        loadCases(),
        loadTeamMembers(role === "admin"),
        canUseOperations ? loadLeads() : Promise.resolve([]),
        canUseOperations ? loadAppointments() : Promise.resolve([]),
      ]);
      setCases(result.cases);
      setTeamMembers(members);
      setLeads(nextLeads);
      setAppointments(nextAppointments);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to refresh cases.");
    } finally {
      setLoading(false);
    }
  }

  async function callNewLead(lead: LeadRecord) {
    if (!profile || lead.ownerId !== profile.id || lead.status !== "new" || lead.phoneRevealedAt) return;
    setCallingLeadId(lead.id);
    setError("");
    try {
      await revealLeadPhone(lead.id, profile.id);
      await refreshCases();
      window.location.href = `tel:${lead.customerPhone.replace(/[^\d+]/g, "")}`;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to call lead.");
    } finally {
      setCallingLeadId("");
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
        const canUseOperations = ["admin", "customer_service", "broker"].includes(currentProfile.role);
        const [result, members, nextLeads, nextAppointments] = await Promise.all([
          loadCases(),
          loadTeamMembers(currentProfile.role === "admin"),
          canUseOperations ? loadLeads() : Promise.resolve([]),
          canUseOperations ? loadAppointments() : Promise.resolve([]),
        ]);
        setCases(result.cases);
        setTeamMembers(members);
        setLeads(nextLeads);
        setAppointments(nextAppointments);
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
      setLeads([]);
      setAppointments([]);
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
          icon: "/icon-192.png",
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

  async function handleInstallApp() {
    if (!installPrompt) return;

    try {
      setInstalling(true);
      await installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
    } finally {
      setInstalling(false);
    }
  }

  function openCreateForm() {
    setUploadingMessage("");
    setEditingCase(null);
    setPrefillCase(null);
    setAppSection("cases");
    setIsFormOpen(true);
  }

  function openCreateFromLead(lead: LeadRecord) {
    const base = createEmptyCase();
    setPrefillCase({ ...base, leadId: lead.id, ownerId: lead.ownerId,
      customerName: lead.customerName, customerPhone: lead.customerPhone,
      carModel: lead.carModel, dealer: profile?.role === "broker" ? "other_dealer" : "" });
    setEditingCase(null);
    setAppSection("cases");
    setIsFormOpen(true);
  }

  function openEditForm(record: CaseRecord) {
    setUploadingMessage("");
    setEditingCase(record);
    setPrefillCase(null);
    setIsFormOpen(true);
  }

  async function handleSave(values: CaseFormValues, documents: UploadDocumentInput[]) {
    if (!profile) return;
    const base = editingCase || prefillCase || createEmptyCase();
    const now = new Date().toISOString();
    const ownerId = role === "admin" ? values.ownerId : editingCase?.ownerId || profile.id;
    const owner = teamMembers.find((member) => member.id === ownerId);
    if (!ownerId || !owner || !["customer_service", "broker"].includes(owner.role)) {
      setError("Please select a Customer Service or Broker owner.");
      return;
    }
    const record: CaseRecord = {
      ...base,
      dealer: role === "broker" ? "other_dealer" : values.dealer,
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
      ownerId,
      ownerName: owner.fullName,
      ownerRole: owner.role === "broker" ? "broker" : "customer_service",
    };

    try {
      setSaving(true);
      setUploadingMessage(documents.length ? "Saving case..." : "");
      setError("");
      setSuccessMessage("");
      const nextCases = await saveCase(record, role, profile.id, editingCase || undefined);
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
          setPrefillCase(null);
        } catch (caught) {
          const message =
            caught instanceof Error ? caught.message : "Unable to upload documents.";
          const fresh = await loadCases();
          setCases(fresh.cases);
          setIsFormOpen(false);
          setEditingCase(null);
          setPrefillCase(null);
          setSuccessMessage("");
          setError(
            `Case saved, but upload did not finish: ${message} Please submit the missing file(s) again.`,
          );
        }
      } else {
        setIsFormOpen(false);
        setEditingCase(null);
        setPrefillCase(null);
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

  async function handleDeleteTeamMember(member: Profile) {
    if (
      !window.confirm(
        `Delete ${member.fullName || member.email}? This removes their login permanently and cannot be undone.`,
      )
    ) {
      return;
    }

    if (
      !window.confirm(
        `Final confirmation: permanently delete team member ${member.fullName || member.email}?`,
      )
    ) {
      return;
    }

    try {
      setTeamSaving(true);
      setError("");
      setSuccessMessage("");
      await deleteTeamMember(member.id);
      await refreshTeamMembers();
      setSuccessMessage("Team member deleted.");
    } catch (caught) {
      setSuccessMessage("");
      setError(caught instanceof Error ? caught.message : "Unable to delete team member.");
    } finally {
      setTeamSaving(false);
    }
  }

  function handleDelete(record: CaseRecord) {
    setDeleteError("");
    setCaseToDelete(record);
  }

  async function confirmDelete() {
    if (!caseToDelete) return;

    const record = caseToDelete;

    if (
      !window.confirm(
        `Final confirmation: permanently delete case ${record.customerName || "Unnamed case"} and its Google Drive folder?`,
      )
    ) {
      return;
    }

    try {
      setSaving(true);
      setError("");
      setDeleteError("");
      setSuccessMessage("");
      const next = await removeCase(record.id);
      setCases(next);
      setCaseToDelete(null);
      setSuccessMessage(`${record.customerName || "Case"} deleted.`);
    } catch (caught) {
      if (isSessionExpiredError(caught)) {
        setCaseToDelete(null);
        setProfile(null);
        setCases([]);
        setTeamMembers([]);
        setError(sessionExpiredMessage);
      } else {
        setDeleteError(
          caught instanceof Error ? caught.message : "Unable to delete case.",
        );
      }
    } finally {
      setSaving(false);
    }
  }

  if (!appEnvironment.checked || (!profile && loading)) {
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

  if (role !== "admin" && (!appEnvironment.mobile || !appEnvironment.standalone)) {
    return (
      <RequiredAppSetup
        environment={appEnvironment}
        canInstall={Boolean(installPrompt)}
        installing={installing}
        onInstall={handleInstallApp}
      />
    );
  }

  if (pushStatus !== "enabled") {
    return (
      <RequiredNotificationSetup
        status={pushStatus}
        message={pushMessage}
        onEnable={handleEnableAlerts}
        onSignOut={handleSignOut}
        signingOut={authLoading}
      />
    );
  }

  return (
    <main className="mobile-dashboard min-h-screen px-3 py-3 sm:px-5 sm:py-5 lg:px-8">
      <div className="mx-auto flex max-w-[1560px] flex-col gap-5">
        <header className="dashboard-header surface-card relative z-20">
          <div className="mobile-header flex items-center gap-2 px-1 py-1 sm:hidden">
            <button type="button" className="mobile-header-icon" onClick={() => setDrawerOpen(true)} aria-label="Open navigation menu" aria-expanded={drawerOpen}><Menu className="h-5 w-5" /></button>
            <div className="min-w-0 flex-1 leading-tight">
              <span className="block text-xs text-zinc-400">Selamat datang,</span>
              <strong className="block truncate text-base font-semibold text-white">{profile?.fullName || formatRole(role)}</strong>
            </div>
            <span className="mobile-header-icon text-emerald-300" role="status" aria-label="Alerts on" title="Alerts on"><Bell className="h-5 w-5" /></span>
            <button type="button" className="mobile-header-icon" onClick={refreshCases} disabled={loading} aria-label="Refresh" title="Refresh"><RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} /></button>
            <button type="button" className="mobile-header-icon" onClick={handleSignOut} disabled={authLoading} aria-label="Sign out" title="Sign out"><LogOut className="h-5 w-5" /></button>
          </div>
          <div className="hidden flex-col gap-5 rounded-lg bg-gradient-to-r from-red-950/70 via-zinc-950 to-zinc-950 p-4 sm:flex sm:p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <button type="button" className="secondary-button h-11 w-11 shrink-0 justify-center px-0" onClick={() => setDrawerOpen(true)} aria-label="Open navigation menu" aria-expanded={drawerOpen}><Menu className="h-5 w-5" /></button>
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-honda text-white shadow-sm shadow-red-950/60">
                <FolderKanban className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-extrabold tracking-normal text-white sm:text-2xl">
                  {appSection === "dashboard" ? "Dashboard" : appSection === "cases" ? "Case" : appSection === "leads" ? "Lead" : appSection === "appointments" ? "Appointment" : "Team"}
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
              {appSection === "cases" && canCreateCase(role) ? (
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
                        <div
                          className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-emerald-100"
                          title="Notifications are enabled"
                          role="status"
                        >
                          <Bell className="h-4 w-4 shrink-0" aria-hidden="true" />
                          <span className="truncate">Alerts on</span>
                        </div>
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

        {appSection === "dashboard" ? (
          <section className="grid gap-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <button type="button" className="surface-card p-4 text-left" onClick={() => { setActiveTab("all"); setStatusFilter("all"); setDealerFilter("all"); setMonthFilter(""); setAppSection("cases"); }}><FolderKanban className="mb-3 h-5 w-5 text-red-400" /><span className="block text-sm text-zinc-400">Cases</span><strong className="text-2xl">{visibleCases.length}</strong></button>
              <button type="button" className="surface-card p-4 text-left" onClick={() => { setActiveTab("this_month"); setStatusFilter("all"); setDealerFilter("all"); setMonthFilter(currentMonth); setAppSection("cases"); }}><CalendarDays className="mb-3 h-5 w-5 text-violet-400" /><span className="block text-sm text-zinc-400">This Month Cases</span><strong className="text-2xl">{metrics.this_month}</strong></button>
              <button type="button" className="surface-card p-4 text-left" onClick={() => { setActiveTab("last_month"); setStatusFilter("all"); setDealerFilter("all"); setMonthFilter(lastMonth); setAppSection("cases"); }}><CalendarRange className="mb-3 h-5 w-5 text-amber-400" /><span className="block text-sm text-zinc-400">Last Month Cases</span><strong className="text-2xl">{metrics.last_month}</strong></button>
              <button type="button" className="surface-card p-4 text-left" onClick={() => { setActiveTab("tasks"); setStatusFilter("all"); setDealerFilter("all"); setMonthFilter(""); setAppSection("cases"); }}><ListChecks className="mb-3 h-5 w-5 text-blue-400" /><span className="block text-sm text-zinc-400">My Tasks</span><strong className="text-2xl">{visibleCases.filter((record) => isMyTask(record, role, profile?.id)).length}</strong></button>
              <button type="button" className="surface-card p-4 text-left" onClick={() => { setActiveTab("followup"); setStatusFilter("all"); setDealerFilter("all"); setMonthFilter(""); setAppSection("cases"); }}><CalendarClock className="mb-3 h-5 w-5 text-cyan-400" /><span className="block text-sm text-zinc-400">Follow Up Due</span><strong className="text-2xl">{metrics.followup}</strong></button>
              {role === "customer_service" || role === "broker" ? <>
                <button type="button" className="surface-card p-4 text-left" onClick={() => { setLeadStatusJump("all"); setLeadViewJump("all"); setAppSection("leads"); }}><Users className="mb-3 h-5 w-5 text-amber-400" /><span className="block text-sm text-zinc-400">Leads</span><strong className="text-2xl">{leads.length}</strong></button>
                <button type="button" className="surface-card p-4 text-left" onClick={() => { setLeadStatusJump("all"); setLeadViewJump("followup"); setAppSection("leads"); }}><Clock3 className="mb-3 h-5 w-5 text-cyan-400" /><span className="block text-sm text-zinc-400">Lead Follow Up</span><strong className="text-2xl">{leads.filter((lead) => isLeadFollowUpDue(lead, leadNowMs)).length}</strong></button>
              </> : null}
              {["admin", "customer_service", "broker"].includes(role) ? <button type="button" className="surface-card p-4 text-left" onClick={() => setAppSection("appointments")}><CalendarDays className="mb-3 h-5 w-5 text-emerald-400" /><span className="block text-sm text-zinc-400">Upcoming appointments</span><strong className="text-2xl">{appointments.filter((item) => item.status === "scheduled" && +new Date(item.startsAt) >= Date.now()).length}</strong></button> : null}
            </div>
            {role === "customer_service" || role === "broker" ? (
              <section className="grid gap-2">
                <h2 className="text-sm font-semibold text-zinc-300">New leads ({newOwnLeads.length})</h2>
                {newOwnLeads.length ? newOwnLeads.map((lead) => (
                  <article key={lead.id} className="surface-card flex min-w-0 items-start justify-between gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-white">{lead.customerName}</p>
                      {lead.carBrand || lead.carModel ? <p className="truncate text-sm text-zinc-400">{[lead.carBrand, lead.carModel].filter(Boolean).join(" · ")}</p> : null}
                      {lead.notes[0] ? <p className="mt-2 break-words whitespace-pre-wrap text-sm text-zinc-300"><span className="font-medium text-zinc-400">Latest note: </span>{lead.notes[0].body}</p> : null}
                    </div>
                    <button type="button" className="lead-call-pending inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-md border border-red-400 px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60" disabled={Boolean(callingLeadId)} onClick={() => void callNewLead(lead)}><PhoneCall className="h-4 w-4" />{callingLeadId === lead.id ? "Calling..." : "Call"}</button>
                  </article>
                )) : <p className="text-sm text-zinc-500">No new leads to contact.</p>}
              </section>
            ) : null}
          </section>
        ) : null}

        {appSection === "cases" ? <>
        {canCreateCase(role) ? <button type="button" className="primary-button w-full sm:hidden" onClick={openCreateForm}><Plus className="h-4 w-4" aria-hidden="true" />New Case</button> : null}
        <section className="dashboard-metrics grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {metricTabs.map((tab) => (
            <MetricCard
              key={tab.id}
              label={tab.label}
              value={metrics[tab.id]}
              icon={tab.icon}
              toneClass={tab.toneClass}
              active={activeTab === tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.id === "this_month") setMonthFilter(currentMonth);
                if (tab.id === "last_month") setMonthFilter(lastMonth);
                if (tab.id === "all") setMonthFilter("");
              }}
            />
          ))}
        </section>

        <section className="grid gap-3">
          <>
              <div className="flex min-w-0 flex-col gap-3 py-2 lg:flex-row lg:items-center lg:justify-between">
                <button type="button" className="secondary-button sm:hidden" onClick={() => setFiltersOpen(true)} aria-expanded={filtersOpen}>
                  <Filter className="h-4 w-4" /> Filters {filtersActive ? "· Active" : ""}
                  <span className="ml-auto text-zinc-400">{filteredCases.length} cases</span>
                </button>
                <div className="hidden min-w-0 items-center gap-2 sm:flex">
                  <Filter className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">Filter Cases</p>
                    <p className="text-xs text-zinc-500">
                      Showing {filteredCases.length} of {tabCases.length} cases
                    </p>
                  </div>
                </div>

                {filtersOpen ? <button className="fixed inset-0 z-40 bg-black/70 sm:hidden" aria-label="Close filters" onClick={() => setFiltersOpen(false)} /> : null}
                <div
                  role={filtersOpen ? "dialog" : undefined}
                  aria-label="Case filters"
                  className={`${filtersOpen ? "mobile-filter-sheet grid" : "hidden sm:grid"} min-w-0 gap-3 sm:grid-cols-2 lg:w-auto ${
                    role === "sales_manager"
                      ? "xl:grid-cols-[18rem_12rem_auto]"
                      : "xl:grid-cols-[14rem_18rem_12rem_auto]"
                  }`}
                >
                  <div className="flex items-center justify-between sm:hidden"><h2 className="text-lg font-semibold">Filter cases</h2><button type="button" className="icon-button" aria-label="Close filters" onClick={() => setFiltersOpen(false)}><X className="h-5 w-5" /></button></div>
                  {role !== "sales_manager" ? (
                    <select
                      className="field min-w-0"
                      value={dealerFilter}
                      onChange={(event) =>
                        setDealerFilter(event.target.value as DealerFilter)
                      }
                      aria-label="Filter cases by dealer"
                    >
                      <option value="all">All Dealers</option>
                      {caseDealers.map((dealer) => (
                        <option key={dealer} value={dealer}>
                          {caseDealerLabels[dealer]}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <select
                    className="field min-w-0"
                    value={statusFilter}
                    onChange={(event) =>
                      setStatusFilter(event.target.value as StatusFilter)
                    }
                    aria-label="Filter cases by status"
                  >
                    <option value="all">
                      All Statuses ({statusFilterCounts.total})
                    </option>
                    {caseStatuses.map((status) => (
                      <option key={status} value={status}>
                        {statusLabels[status]} ({statusFilterCounts.counts[status]})
                      </option>
                    ))}
                  </select>
                  <select
                    className="field min-w-0"
                    value={monthFilter}
                    onChange={(event) => {
                      const nextMonth = event.target.value;
                      setMonthFilter(nextMonth);
                      if (
                        (activeTab === "this_month" && nextMonth !== currentMonth) ||
                        (activeTab === "last_month" && nextMonth !== lastMonth)
                      ) {
                        setActiveTab("all");
                      }
                    }}
                    aria-label="Filter cases by month and year"
                  >
                    <option value="">All Months ({monthFilterCounts.total})</option>
                    {monthFilterCounts.months.map((month) => (
                      <option key={month.value} value={month.value}>
                        {month.label} ({month.count})
                      </option>
                    ))}
                  </select>
                  {filtersActive ? (
                    <button
                      type="button"
                      className="secondary-button shrink-0 px-3"
                      onClick={() => {
                        setStatusFilter("all");
                        setDealerFilter("all");
                        setMonthFilter("");
                        if (
                          activeTab === "this_month" ||
                          activeTab === "last_month"
                        ) {
                          setActiveTab("all");
                        }
                      }}
                      aria-label="Clear case filters"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                      <span className="hidden sm:inline">Clear</span>
                    </button>
                  ) : null}
                  <button type="button" className="primary-button sm:hidden" onClick={() => setFiltersOpen(false)}>Show {filteredCases.length} cases</button>
                </div>
              </div>

              {loading ? (
                <div className="surface-card p-8 text-center text-sm text-muted">
                  Loading cases
                </div>
              ) : filteredCases.length ? (
                filteredCases.map((record) => (
                  <CaseCard
                    key={record.id}
                    record={record}
                    role={role}
                    userId={profile?.id || ""}
                    saving={saving}
                    teamMembers={teamMembers}
                    onEdit={openEditForm}
                    onDelete={handleDelete}
                  />
                ))
              ) : (
                <div className="surface-card p-8 text-center text-sm text-muted">
                  {filtersActive
                    ? "No cases match the selected filters"
                    : "No cases in this tab"}
                </div>
              )}
          </>
        </section>
        </> : null}
        {appSection === "team" && role === "admin" ? <TeamManagementPanel members={teamMembers} saving={teamSaving} onCreate={handleCreateTeamMember} onUpdate={handleUpdateTeamMember} onDelete={handleDeleteTeamMember} /> : null}
        {appSection === "leads" && profile && ["admin", "customer_service", "broker"].includes(role) ? <LeadPanel key={`${leadStatusJump}:${leadViewJump}`} profile={profile} teamMembers={teamMembers} leads={leads} cases={visibleCases} catalog={carCatalog.map((item) => ({ brand: item.brand, model: item.model }))} initialFilter={leadStatusJump} initialView={leadViewJump} onViewChange={setLeadViewJump} onRefresh={refreshCases} onCreateCase={openCreateFromLead} onAppointment={(lead) => { setAppointmentSubject(`lead:${lead.id}`); setAppSection("appointments"); }} /> : null}
        {appSection === "appointments" && profile && ["admin", "customer_service", "broker"].includes(role) ? <AppointmentPanel key={appointmentSubject} profile={profile} teamMembers={teamMembers} leads={leads} cases={visibleCases} appointments={appointments} initialSubject={appointmentSubject} onRefresh={refreshCases} /> : null}
      </div>
      <div
        className={`casepilot-drawer fixed inset-0 z-50 ${drawerOpen ? "casepilot-drawer-open" : ""}`}
        role={drawerOpen ? "dialog" : undefined}
        aria-modal={drawerOpen ? "true" : undefined}
        aria-label="Navigation"
        aria-hidden={!drawerOpen}
        inert={!drawerOpen}
      >
        <button
          type="button"
          className="casepilot-drawer-backdrop absolute inset-0 bg-black/70 backdrop-blur-sm"
          aria-label="Close navigation"
          onClick={() => setDrawerOpen(false)}
        />
        <nav
          className="casepilot-drawer-panel absolute inset-y-0 left-0 flex w-[min(19rem,84vw)] flex-col gap-2 border-r border-zinc-700 bg-zinc-950 p-5 shadow-2xl"
          aria-label="Main navigation"
        >
          <div className="mb-5 flex items-center justify-between">
            <span className="font-bold">CasePilot</span>
            <button className="icon-button" type="button" onClick={() => setDrawerOpen(false)} aria-label="Close navigation"><X className="h-5 w-5" /></button>
          </div>
          {([
            { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
            { id: "cases", label: "Case", icon: FolderKanban },
            ...(["admin", "customer_service", "broker"].includes(role)
              ? [{ id: "leads", label: "Lead", icon: Users }, { id: "lead_followup", label: "Lead Follow Up", icon: Clock3 }, { id: "appointments", label: "Appointment", icon: CalendarDays }]
              : []),
            ...(role === "admin" ? [{ id: "team", label: "Team", icon: UserPlus }] : []),
          ] as const).map(({ id, label, icon: Icon }) => {
            const active = id === "lead_followup"
              ? appSection === "leads" && leadViewJump === "followup"
              : id === "leads"
                ? appSection === "leads" && leadViewJump === "all"
                : appSection === id;
            return (
            <button
              key={id}
              type="button"
              className={`flex items-center gap-3 rounded-md px-4 py-3 text-left ${active ? "bg-red-950 text-white" : "text-zinc-300 hover:bg-zinc-900"}`}
              aria-current={active ? "page" : undefined}
              onClick={() => {
                if (id === "lead_followup" || id === "leads") {
                  setLeadStatusJump("all");
                  setLeadViewJump(id === "lead_followup" ? "followup" : "all");
                  setAppSection("leads");
                } else setAppSection(id as typeof appSection);
                setDrawerOpen(false);
                window.scrollTo({ top: 0 });
              }}
            >
              <Icon className="h-5 w-5" />{label}
            </button>
          );
          })}
          <div className="mt-auto border-t border-zinc-800 pt-4 text-sm text-zinc-400">{profile?.fullName}</div>
        </nav>
      </div>

      {isFormOpen ? (
        <CaseForm
          key={editingCase?.id || prefillCase?.leadId || "new"}
          role={role}
          profile={profile}
          teamMembers={teamMembers}
          record={editingCase}
          initialRecord={prefillCase}
          saving={saving}
          uploadingMessage={uploadingMessage}
          onClose={() => {
            if (saving) return;
            setIsFormOpen(false);
            setEditingCase(null);
            setPrefillCase(null);
          }}
          onSave={handleSave}
        />
      ) : null}

      {caseToDelete ? (
        <DeleteCaseConfirmation
          record={caseToDelete}
          saving={saving}
          error={deleteError}
          onCancel={() => {
            if (saving) return;
            setCaseToDelete(null);
            setDeleteError("");
          }}
          onConfirm={confirmDelete}
        />
      ) : null}
    </main>
  );
}

function RequiredAppSetup({
  environment,
  canInstall,
  installing,
  onInstall,
}: {
  environment: AppEnvironment;
  canInstall: boolean;
  installing: boolean;
  onInstall: () => void;
}) {
  const desktopBlocked = environment.checked && !environment.mobile;

  return (
    <main className="grid min-h-screen place-items-center px-4 py-6">
      <section
        className={`surface-card w-full overflow-hidden ${desktopBlocked ? "max-w-2xl" : "max-w-md"}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-setup-title"
      >
        <div className="border-b border-zinc-800 bg-gradient-to-r from-red-950/70 to-zinc-950 p-5">
          <div className="grid h-12 w-12 place-items-center rounded-md bg-honda text-white shadow-sm shadow-red-950/60">
            <Smartphone className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 id="app-setup-title" className="mt-4 text-xl font-bold text-white">
            {desktopBlocked ? "Phone required" : "Add CasePilot to Home Screen"}
          </h1>
          <p className="mt-1 text-sm leading-6 text-zinc-400">
            {desktopBlocked
              ? "CasePilot hanya boleh digunakan melalui telefon selepas dipasang pada Home Screen."
              : "Pasang CasePilot dahulu untuk teruskan."}
          </p>
        </div>

        <div className="grid gap-4 p-5">
          {desktopBlocked ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <InstallGuide
                title="iPhone / iPad"
                steps={[
                  "Buka coshonda.vercel.app menggunakan Safari.",
                  "Tekan ikon Share di bahagian bawah Safari.",
                  "Scroll dan pilih Add to Home Screen.",
                  "Tekan Add di penjuru kanan atas.",
                  "Buka CasePilot melalui ikon pada Home Screen.",
                ]}
              />
              <InstallGuide
                title="Android"
                steps={[
                  "Buka coshonda.vercel.app menggunakan Chrome.",
                  "Tekan menu tiga titik di penjuru Chrome.",
                  "Pilih Install app atau Add to Home screen.",
                  "Tekan Install atau Add untuk sahkan.",
                  "Buka CasePilot melalui ikon pada Home Screen.",
                ]}
              />
              <p className="rounded-md border border-red-900/70 bg-red-950/40 p-4 text-sm leading-6 text-red-100 sm:col-span-2">
                Selepas login, tekan Allow notifications apabila popup keluar. Notification wajib
                diaktifkan sebelum dashboard boleh digunakan.
              </p>
            </div>
          ) : environment.ios ? (
            <ol className="grid gap-3 text-sm text-zinc-200">
              <li className="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-950 p-3">
                <Share2 className="h-5 w-5 shrink-0 text-red-300" aria-hidden="true" />
                <span>Tekan butang Share dalam Safari.</span>
              </li>
              <li className="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-950 p-3">
                <Plus className="h-5 w-5 shrink-0 text-red-300" aria-hidden="true" />
                <span>Pilih Add to Home Screen.</span>
              </li>
              <li className="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-950 p-3">
                <Smartphone className="h-5 w-5 shrink-0 text-red-300" aria-hidden="true" />
                <span>Buka CasePilot daripada ikon Home Screen.</span>
              </li>
            </ol>
          ) : (
            <>
              <p className="rounded-md border border-zinc-800 bg-zinc-950 p-4 text-sm leading-6 text-zinc-300">
                Pasang CasePilot, kemudian buka melalui ikon pada Home Screen.
              </p>
              {canInstall ? (
                <button
                  type="button"
                  className="primary-button w-full"
                  onClick={onInstall}
                  disabled={installing}
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  {installing ? "Installing" : "Install CasePilot"}
                </button>
              ) : (
                <p className="text-sm leading-6 text-zinc-400">
                  Dalam menu Chrome, pilih <strong className="text-zinc-200">Add to Home screen</strong>,
                  kemudian buka CasePilot melalui ikon tersebut.
                </p>
              )}
            </>
          )}
        </div>
      </section>
    </main>
  );
}

function InstallGuide({ title, steps }: { title: string; steps: string[] }) {
  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-950 p-4">
      <h2 className="font-semibold text-white">{title}</h2>
      <ol className="mt-3 grid gap-3">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-3 text-sm leading-5 text-zinc-300">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-red-600 text-xs font-bold text-white">
              {index + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function RequiredNotificationSetup({
  status,
  message,
  onEnable,
  onSignOut,
  signingOut,
}: {
  status: PushStatus;
  message: string;
  onEnable: () => void;
  onSignOut: () => void;
  signingOut: boolean;
}) {
  const blocked = status === "denied";
  const unsupported = status === "unsupported";

  return (
    <main className="grid min-h-screen place-items-center px-4 py-6">
      <section
        className="surface-card w-full max-w-md overflow-hidden"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="notification-setup-title"
      >
        <div className="border-b border-zinc-800 bg-gradient-to-r from-red-950/70 to-zinc-950 p-5">
          <div className="grid h-12 w-12 place-items-center rounded-md bg-honda text-white shadow-sm shadow-red-950/60">
            <Bell className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 id="notification-setup-title" className="mt-4 text-xl font-bold text-white">
            Notification required
          </h1>
          <p className="mt-1 text-sm leading-6 text-zinc-400">
            Benarkan notification sebelum menggunakan CasePilot.
          </p>
        </div>

        <div className="grid gap-3 p-5">
          {blocked ? (
            <p className="rounded-md border border-red-900 bg-red-950/60 p-4 text-sm leading-6 text-red-100">
              Notification telah disekat. Buka Phone Settings, pilih CasePilot, aktifkan Notifications,
              kemudian buka semula aplikasi.
            </p>
          ) : unsupported ? (
            <p className="rounded-md border border-amber-800 bg-amber-950/50 p-4 text-sm leading-6 text-amber-100">
              Peranti atau versi browser ini belum menyokong push notification. Kemas kini sistem dan
              browser, kemudian buka semula CasePilot dari Home Screen.
            </p>
          ) : message && status === "error" ? (
            <p className="rounded-md border border-red-900 bg-red-950/60 p-4 text-sm leading-6 text-red-100">
              {message}
            </p>
          ) : null}

          <button
            type="button"
            className="primary-button w-full"
            onClick={onEnable}
            disabled={status === "loading" || blocked || unsupported}
          >
            <Bell className="h-4 w-4" aria-hidden="true" />
            {status === "loading" ? "Turning on notifications" : "Allow notifications"}
          </button>
          <button
            type="button"
            className="secondary-button w-full"
            onClick={onSignOut}
            disabled={signingOut}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {signingOut ? "Signing out" : "Sign out"}
          </button>
        </div>
      </section>
    </main>
  );
}

function DeleteCaseConfirmation({
  record,
  saving,
  error,
  onCancel,
  onConfirm,
}: {
  record: CaseRecord;
  saving: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <section
        className="w-full max-w-md overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-lift"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-case-title"
        aria-describedby="delete-case-description"
      >
        <div className="flex items-start gap-3 border-b border-zinc-800 bg-red-950/35 p-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-red-600/20 text-red-300 ring-1 ring-red-500/40">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 id="delete-case-title" className="text-lg font-semibold text-ink">
              Delete this case?
            </h2>
            <p id="delete-case-description" className="mt-1 text-sm text-muted">
              This cannot be undone. The case and its Google Drive folder will be
              removed.
            </p>
          </div>
        </div>

        <div className="grid gap-3 p-4">
          <div className="min-w-0 border-b border-zinc-800 pb-3">
            <p className="break-words font-semibold text-ink">
              {record.customerName || "Unnamed case"}
            </p>
            <p className="mt-1 break-words text-sm text-muted">
              {record.carModel} {record.carVariant}
            </p>
          </div>

          {error ? (
            <p className="rounded-md border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-100">
              {error}
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="secondary-button w-full"
              onClick={onCancel}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="danger-button w-full"
              onClick={onConfirm}
              disabled={saving}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {saving ? "Deleting..." : "Confirm Delete"}
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  toneClass,
  active,
  onClick,
  className = "",
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  toneClass: string;
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`surface-card touch-tile group min-w-0 p-2.5 text-left transition duration-200 hover:border-zinc-600 hover:shadow-lift focus:outline-none focus:ring-2 focus:ring-honda/70 sm:p-3 ${
        active
          ? "border-honda bg-honda/10 shadow-lift shadow-red-950/30"
          : ""
      } ${className}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <div className="flex min-h-[64px] items-center justify-between gap-2 sm:min-h-[70px]">
        <div className="min-w-0">
          <p className={`text-xs font-semibold leading-tight sm:text-sm ${
            active ? "text-white" : "text-zinc-400"
          }`}>
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
    </button>
  );
}

function TeamManagementPanel({
  members,
  saving,
  onCreate,
  onUpdate,
  onDelete,
}: {
  members: Profile[];
  saving: boolean;
  onCreate: (values: TeamMemberFormValues) => Promise<void>;
  onUpdate: (values: TeamMemberFormValues) => Promise<void>;
  onDelete: (member: Profile) => Promise<void>;
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
            onDelete={onDelete}
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
  onDelete,
}: {
  member: Profile;
  saving: boolean;
  onUpdate: (values: TeamMemberFormValues) => Promise<void>;
  onDelete: (member: Profile) => Promise<void>;
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
      className={`grid gap-3 rounded-md border p-3 lg:grid-cols-[1fr_1fr_1fr_1fr_150px_130px_auto_auto] ${
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
      <div className="flex items-end">
        <button
          type="button"
          role="switch"
          aria-checked={values.active}
          aria-label={`${values.active ? "Deactivate" : "Activate"} ${member.fullName || member.email}`}
          className={`flex h-11 w-full items-center justify-between gap-2 rounded-md border px-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-red-500/70 ${
            values.active
              ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-100"
              : "border-zinc-700 bg-zinc-900 text-zinc-400"
          }`}
          onClick={() =>
            setValues((current) => ({ ...current, active: !current.active }))
          }
        >
          <span
            className={`relative h-6 w-11 shrink-0 rounded-full transition ${
              values.active ? "bg-emerald-500" : "bg-zinc-700"
            }`}
            aria-hidden="true"
          >
            <span
              className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                values.active ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </span>
          <span>{values.active ? "Active" : "Inactive"}</span>
        </button>
      </div>
      <button className="secondary-button self-end" disabled={saving}>
        <Save className="h-4 w-4" aria-hidden="true" />
        Save
      </button>
      <button
        className="danger-button self-end"
        type="button"
        disabled={saving}
        onClick={() => void onDelete(member)}
        title={`Delete ${member.fullName || member.email}`}
        aria-label={`Delete ${member.fullName || member.email}`}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
        Delete
      </button>
    </form>
  );
}

function CaseCard({
  record,
  role,
  userId,
  saving,
  teamMembers,
  onEdit,
  onDelete,
}: {
  record: CaseRecord;
  role: Role;
  userId: string;
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
  const allowEdit = canEditCase(role, record, userId);
  const allowDelete = canDeleteCase(role);
  const showContactLists = role !== "sales_manager";
  const [isExpanded, setIsExpanded] = useState(false);
  const [whatsAppRecipient, setWhatsAppRecipient] =
    useState<WhatsAppRecipient | null>(null);
  const hasCustomerPhone = Boolean(record.customerPhone.trim());
  const activeTeamMembers = showContactLists
    ? teamMembers.filter((member) => member.active !== false && member.phone?.trim())
    : [];
  const visibleTimelineActivities = record.activities
    .filter(isVisibleTimelineActivity)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
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
      className={`mobile-case-card surface-card overflow-hidden border-l-4 transition duration-200 hover:border-zinc-600 hover:shadow-lift ${statusAccent[record.status]}`}
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
          <p className="mt-1 line-clamp-1 text-xs font-semibold text-zinc-300">
            {record.ownerRole === "broker"
              ? `Broker${record.ownerName ? `: ${record.ownerName}` : ""}`
              : `Customer Service${record.ownerName ? `: ${record.ownerName}` : ""}`}
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
                            target={doc.url.startsWith("https://") ? "_blank" : undefined}
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
              {visibleTimelineActivities.length ? (
                <ol className="relative grid max-h-80 gap-2 overflow-y-auto pr-1 before:absolute before:bottom-2 before:left-3 before:top-2 before:w-px before:bg-zinc-800">
                  {visibleTimelineActivities.map((activity) => (
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
              ) : (
                <p className="text-sm text-muted">No activity yet</p>
              )}
            </Panel>
          </div>

          {assignedRoles.includes(role) && !isTerminalStatus(record.status) ? (
            <div className="border-t border-zinc-800 bg-zinc-900/70 px-4 py-3 text-sm text-zinc-400 sm:px-5">
              <span className="font-medium text-ink">{roleLabels[role]}</span> should review
              this case and update the remark or status when needed.
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

  const caseFolderUrl = getCaseDriveFolderUrl(record.documents);
  const [message, setMessage] = useState(defaultWhatsAppMessage(record));
  const [isPreparingWhatsApp, setIsPreparingWhatsApp] = useState(false);
  const canSend = whatsappPhone(recipient.phone) && message.trim();

  async function messageWithCaseFolder() {
    const trimmed = message.trim();
    if (!record.documents.length) return trimmed;
    const documentLinks = caseFolderUrl
      ? [`Case Folder : ${caseFolderUrl}`]
      : record.documents.map((document) => `${document.name}: ${document.url}`);
    return [trimmed, "", "Documents:", "", ...documentLinks].join("\n");
  }

  async function sendWhatsApp() {
    if (!canSend) return;

    const pendingWindow = window.open("about:blank", "_blank");
    if (pendingWindow) {
      pendingWindow.opener = null;
    }

    try {
      setIsPreparingWhatsApp(true);
      const whatsAppUrl = buildWhatsAppUrl(recipient.phone, await messageWithCaseFolder());

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

            {caseFolderUrl ? (
              <a
                className="touch-tile flex min-h-12 items-center justify-between gap-3 rounded-md bg-zinc-950 px-3 py-2 text-sm ring-1 ring-zinc-800 transition hover:bg-zinc-900"
                href={caseFolderUrl}
                target="_blank"
                rel="noopener"
              >
                <span className="min-w-0">
                  <span className="block font-medium text-ink">Case folder</span>
                  <span className="block text-xs text-muted">
                    Google Drive · {record.documents.length} file
                    {record.documents.length === 1 ? "" : "s"}
                  </span>
                </span>
                <ExternalLink className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
              </a>
            ) : (
              <p className="text-sm text-muted">{record.documents.length ? "Individual document links will be included." : "No documents available."}</p>
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
  profile,
  teamMembers,
  record,
  initialRecord,
  saving,
  uploadingMessage,
  onClose,
  onSave,
}: {
  role: Role;
  profile: Profile | null;
  teamMembers: Profile[];
  record: CaseRecord | null;
  initialRecord: CaseRecord | null;
  saving: boolean;
  uploadingMessage: string;
  onClose: () => void;
  onSave: (values: CaseFormValues, documents: UploadDocumentInput[]) => Promise<void>;
}) {
  const isNew = !record;
  const empty = createEmptyCase();
  const source = record || initialRecord || empty;
  const [values, setValues] = useState<CaseFormValues>({
    ownerId: source.ownerId || (role === "admin" ? "" : profile?.id || ""),
    dealer: role === "broker" ? "other_dealer" : source.dealer || "",
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
  const [selectedBrand, setSelectedBrand] = useState<CarBrand | "">(
    getCarCatalogItem(source.carModel)?.brand || "",
  );
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
    carCatalog
      .filter((item) => item.brand === selectedBrand)
      .map((item) => item.model),
    values.carModel,
  );
  const variantOptions = optionsWithCurrent(
    selectedCar?.variants || [],
    values.carVariant,
  );
  const colorOptions = optionsWithCurrent(selectedCar?.colors || [], values.carColor);
  const ownerOptions = teamMembers.filter(
    (member) => member.active !== false && ["customer_service", "broker"].includes(member.role),
  );

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

  function updateCarBrand(brand: CarBrand | "") {
    setSelectedBrand(brand);
    setValues((current) => {
      const currentCar = getCarCatalogItem(current.carModel);

      if (currentCar?.brand === brand) return current;

      return {
        ...current,
        carModel: "",
        carVariant: "",
        carColor: "",
      };
    });
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
    <div className="case-form-overlay fixed inset-0 z-50 overflow-y-auto bg-black/80 p-4 backdrop-blur-sm">
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
            {role === "admin" ? (
              <Field label="Case owner">
                <select
                  className="field"
                  value={values.ownerId}
                  onChange={(event) => updateField("ownerId", event.target.value)}
                  required
                >
                  <option value="">Select Customer Service or Broker</option>
                  {ownerOptions.map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {owner.fullName} · {roleLabels[owner.role]}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
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
            <Field label="Brand">
              <select
                className="field"
                value={selectedBrand}
                onChange={(event) => updateCarBrand(event.target.value as CarBrand | "")}
                required
              >
                <option value="">Select brand</option>
                {carBrands.map((brand) => (
                  <option key={brand} value={brand}>
                    {brand}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Model">
              <select
                className="field"
                value={values.carModel}
                onChange={(event) => updateCarModel(event.target.value)}
                disabled={!selectedBrand}
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
              {selectedCar && selectedCar.colors.length > 0 ? (
                <select
                  className="field"
                  value={values.carColor}
                  onChange={(event) => updateField("carColor", event.target.value)}
                  required
                >
                  <option value="">Select color</option>
                  {colorOptions.map((color) => (
                    <option key={color} value={color}>
                      {color}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="field"
                  value={values.carColor}
                  onChange={(event) => updateField("carColor", event.target.value)}
                  disabled={!values.carModel}
                  placeholder="Enter vehicle color"
                  required
                />
              )}
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

          {role !== "broker" ? <section className="grid gap-3 rounded-md bg-zinc-900/70 p-3 ring-1 ring-zinc-800">
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
          </section> : null}

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
                    Files are saved with the case. Google Drive is used when available.
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

          {role !== "broker" ? (
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
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button className="primary-button" disabled={saving || (role !== "broker" && !values.dealer) || !values.ownerId}>
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
