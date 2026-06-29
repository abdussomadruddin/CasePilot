import {
  caseStatuses,
  roleLabels,
  statusLabels,
  type ActivityEvent,
  type CaseRecord,
  type CaseStatus,
  type Role,
} from "@/lib/types";

const sixHoursMs = 6 * 60 * 60 * 1000;
const twoDaysMs = 2 * 24 * 60 * 60 * 1000;

export const activeStatuses = caseStatuses.filter(
  (status) => status !== "car_delivered" && status !== "cancelled",
);

export const completedStatuses: CaseStatus[] = ["car_delivered", "cancelled"];

export const roleStatusPermissions: Record<Role, CaseStatus[]> = {
  admin: [...caseStatuses],
  customer_service: [
    "documents_collected",
    "more_documents_needed",
    "rejected",
    "cancelled",
  ],
  finance: ["documents_collected", "submission", "lou_received"],
  caller: ["lou_received", "lou_submitted_for_order"],
  operator: ["car_registered", "car_delivered"],
};

export function getAssignedRoles(status: CaseStatus): Role[] {
  switch (status) {
    case "documents_collected":
      return ["finance", "caller"];
    case "submission":
      return ["finance"];
    case "more_documents_needed":
    case "rejected":
      return ["customer_service"];
    case "lou_received":
      return ["finance", "caller"];
    case "lou_submitted_for_order":
      return ["caller"];
    case "car_registered":
    case "car_delivered":
      return ["operator"];
    case "cancelled":
      return ["customer_service", "finance", "caller"];
    default:
      return [];
  }
}

export function canCreateCase(role: Role) {
  return role === "admin" || role === "customer_service";
}

export function canDeleteCase(role: Role) {
  return role === "admin";
}

export function canEditBanks(role: Role) {
  return role === "admin" || role === "finance";
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

export function needsAttentionForRole(
  record: CaseRecord,
  role: Role,
  now = new Date(),
): boolean {
  if (role === "admin") {
    return getAssignedRoles(record.status).some((assignedRole) =>
      needsAttentionForRole(record, assignedRole, now),
    );
  }

  if (isTerminalStatus(record.status)) return false;
  if (!getAssignedRoles(record.status).includes(role)) return false;

  const roleActivity = [...record.activities]
    .filter(
      (activity) =>
        activity.actorRole === role &&
        (activity.type === "remark" || activity.type === "status"),
    )
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];

  const lastActionTime = roleActivity?.createdAt || record.updatedAt;
  return +now - +new Date(lastActionTime) >= sixHoursMs;
}

export function isMyTask(record: CaseRecord, role: Role) {
  if (role === "admin") return true;
  if (isTerminalStatus(record.status)) return false;
  if (isCallerDocumentCollectedTask(record, role)) return true;
  return getAssignedRoles(record.status).includes(role);
}

export function getVisibleCases(records: CaseRecord[], role: Role) {
  if (role === "admin") return records;

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

export function describeAssignedTeam(status: CaseStatus) {
  const assignedRoles = getAssignedRoles(status);
  if (!assignedRoles.length) return "Unassigned";
  return assignedRoles.map((role) => roleLabels[role]).join(", ");
}
