import {
  caseStatuses,
  roleLabels,
  statusLabels,
  type ActivityEvent,
  type CaseDealer,
  type CaseRecord,
  type CaseStatus,
  type Role,
} from "@/lib/types";

const twoDaysMs = 2 * 24 * 60 * 60 * 1000;

export const activeStatuses = caseStatuses.filter(
  (status) => !["rejected", "car_delivery", "cancelled"].includes(status),
);

export const completedStatuses: CaseStatus[] = ["rejected", "car_delivery", "cancelled"];

export const roleStatusPermissions: Record<Role, CaseStatus[]> = {
  admin: [...caseStatuses],
  customer_service: [...caseStatuses],
  finance: [
    "documents_collected",
    "more_documents_needed",
    "submission",
    "rejected",
    "lou_received",
    "hint_submitted",
    "booking_form_received",
    "registration_needed",
    "roadtax_grant_process",
    "prepare_delivery",
    "car_delivery",
    "cancelled",
  ],
  caller: [
    "documents_collected",
    "submission",
    "rejected",
    "lou_received",
    "hint_submitted",
    "booking_form_received",
    "registration_needed",
    "roadtax_grant_process",
    "prepare_delivery",
    "car_delivery",
    "cancelled",
  ],
  operator: ["prepare_delivery", "car_delivery", "cancelled"],
  sales_manager: [],
};

export function getAssignedRoles(status: CaseStatus): Role[] {
  switch (status) {
    case "documents_collected":
      return ["finance", "caller"];
    case "submission":
      return ["customer_service", "finance", "caller"];
    case "more_documents_needed":
      return ["customer_service", "finance"];
    case "rejected":
      return ["customer_service", "finance", "caller"];
    case "lou_received":
    case "hint_submitted":
    case "booking_form_received":
    case "registration_needed":
    case "roadtax_grant_process":
      return ["customer_service", "finance", "caller"];
    case "prepare_delivery":
    case "car_delivery":
      return ["customer_service", "finance", "caller", "operator"];
    case "cancelled":
      return ["customer_service", "finance", "caller", "operator"];
    default:
      return [];
  }
}

export function getMonitoringRoles(dealer?: CaseDealer | ""): Role[] {
  return dealer === "kah_motor" ? ["sales_manager"] : [];
}

export function getProgressRoles(status: CaseStatus, dealer?: CaseDealer | ""): Role[] {
  return [...new Set([...getAssignedRoles(status), ...getMonitoringRoles(dealer)])];
}

export function getNotificationRoles(status: CaseStatus, dealer?: CaseDealer | ""): Role[] {
  return ["admin", ...getProgressRoles(status, dealer)];
}

export function canCreateCase(role: Role) {
  return role === "admin" || role === "customer_service";
}

export function canDeleteCase(role: Role) {
  return role === "admin";
}

export function canEditBanks(role: Role) {
  return role === "admin" || role === "customer_service" || role === "finance";
}

export function canUploadDocuments(role: Role) {
  return role === "admin" || role === "customer_service";
}

export function canUpdateToStatus(role: Role, status: CaseStatus) {
  return roleStatusPermissions[role].includes(status);
}

function isCallerDocumentCollectedTask(record: CaseRecord, role: Role) {
  return role === "caller" && record.status === "documents_collected";
}

export function canEditCase(role: Role, record: CaseRecord) {
  if (role === "sales_manager") return false;
  if (role === "admin") return true;
  if (role === "customer_service" && canCreateCase(role)) return true;
  if (isCallerDocumentCollectedTask(record, role)) return true;
  return getAssignedRoles(record.status).includes(role);
}

export function isTerminalStatus(status: CaseStatus) {
  return completedStatuses.includes(status);
}

export function getLatestRemark(record: CaseRecord) {
  const latestRemark = [...record.activities]
    .filter((activity) => activity.type === "remark" && activity.message.trim())
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];

  return latestRemark?.message || record.remark || "No remark yet";
}

export function getLatestUpdateTime(record: CaseRecord) {
  const latestActivity = [...record.activities].sort(
    (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
  )[0];

  return latestActivity?.createdAt || record.updatedAt;
}

export function getNextFollowUpTime(record: CaseRecord) {
  if (isTerminalStatus(record.status)) return "";
  return record.nextFollowUpAt;
}

export function isFollowUpDue(record: CaseRecord, now = new Date()) {
  if (isTerminalStatus(record.status)) return false;
  return +new Date(record.nextFollowUpAt) <= +now;
}

const attentionActivityTypes: ActivityEvent["type"][] = [
  "case",
  "status",
  "remark",
  "document",
  "bank",
];

export function needsAttentionForRole(record: CaseRecord, role: Role): boolean {
  if (role === "sales_manager") return false;

  if (role === "admin") {
    return getAssignedRoles(record.status).some((assignedRole) =>
      needsAttentionForRole(record, assignedRole),
    );
  }

  if (isTerminalStatus(record.status)) return false;
  if (!getAssignedRoles(record.status).includes(role)) return false;

  const meaningfulActivities = [...record.activities]
    .filter((activity) => attentionActivityTypes.includes(activity.type))
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];

  if (!meaningfulActivities) return false;

  const latestActivityTime = +new Date(meaningfulActivities.createdAt);
  const roleActivity = [...record.activities]
    .filter(
      (activity) =>
        activity.actorRole === role &&
        attentionActivityTypes.includes(activity.type) &&
        +new Date(activity.createdAt) >= latestActivityTime,
    )
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];

  return !roleActivity;
}

export function isMyTask(record: CaseRecord, role: Role) {
  if (isTerminalStatus(record.status)) return false;
  if (role === "sales_manager") return false;
  if (role === "admin") return true;
  if (isCallerDocumentCollectedTask(record, role)) return true;
  return getAssignedRoles(record.status).includes(role);
}

export function getVisibleCases(records: CaseRecord[], role: Role) {
  if (role === "admin" || role === "customer_service") return records;
  if (role === "sales_manager") {
    return records.filter((record) => record.dealer === "kah_motor");
  }

  return records.filter((record) => {
    if (record.createdBy === role || record.updatedBy === role) return true;
    if (isCallerDocumentCollectedTask(record, role)) return true;
    return getAssignedRoles(record.status).includes(role);
  });
}

export function formatStatus(status: CaseStatus) {
  return statusLabels[status];
}

export function formatRole(role: Role) {
  return roleLabels[role];
}

export function createActivity(
  type: ActivityEvent["type"],
  actorRole: Role,
  message: string,
  status?: CaseStatus,
): ActivityEvent {
  return {
    id: crypto.randomUUID(),
    type,
    actorRole,
    actorName: roleLabels[actorRole],
    message,
    status,
    createdAt: new Date().toISOString(),
  };
}

export function nextFollowUpFrom(date = new Date()) {
  return new Date(+date + twoDaysMs).toISOString();
}

export function describeAssignedTeam(status: CaseStatus, dealer?: CaseDealer | "") {
  const assignedRoles = getProgressRoles(status, dealer);
  if (!assignedRoles.length) return "Unassigned";
  return assignedRoles.map((role) => roleLabels[role]).join(", ");
}
