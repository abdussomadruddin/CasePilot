import type { CaseRecord, LeadRecord } from "./types";

export type FunnelPeriod = "today" | "yesterday" | "7d" | "30d" | "90d";
export type FunnelRole = "admin" | "sales_manager";

export const funnelPeriods: { id: FunnelPeriod; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "7 Days" },
  { id: "30d", label: "30 Days" },
  { id: "90d", label: "90 Days" },
];

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kuala_Lumpur",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function klDayKey(value: string | number) {
  const date = new Date(value);
  if (Number.isNaN(+date)) return "";
  const parts = dayFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : "";
}

function shiftDay(key: string, days: number) {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function funnelDayRange(period: FunnelPeriod, nowMs: number) {
  const today = klDayKey(nowMs);
  const days = period === "7d" ? 7 : period === "30d" ? 30 : period === "90d" ? 90 : 1;
  const end = period === "yesterday" ? shiftDay(today, -1) : today;
  return { start: shiftDay(end, 1 - days), end };
}

export function funnelRate(numerator: number, denominator: number) {
  return denominator ? `${Math.round((numerator / denominator) * 1000) / 10}%` : "—";
}

export function buildFunnel(
  role: FunnelRole,
  leads: LeadRecord[],
  cases: CaseRecord[],
  period: FunnelPeriod,
  nowMs: number,
) {
  const { start, end } = funnelDayRange(period, nowMs);
  const inPeriod = (value: string) => {
    const day = klDayKey(value);
    return day >= start && day <= end;
  };

  if (role === "sales_manager") {
    const cohortCases = cases.filter((record) => record.dealer === "kah_motor" && inPeriod(record.createdAt));
    const delivered = cohortCases.filter((record) => record.status === "car_delivery");
    return {
      leadIds: [],
      caseIds: cohortCases.map((record) => record.id),
      deliveredIds: delivered.map((record) => record.id),
      directCaseIds: [],
      leadToCase: "—",
      caseToDelivered: funnelRate(delivered.length, cohortCases.length),
      leadToDelivered: "—",
      notConverted: 0,
      notDelivered: cohortCases.length - delivered.length,
    };
  }

  const cohortLeads = leads.filter((lead) => inPeriod(lead.createdAt));
  const leadIds = new Set(cohortLeads.map((lead) => lead.id));
  const linkedCases = cases.filter((record) => record.leadId && leadIds.has(record.leadId));
  const directCases = cases.filter((record) => !record.leadId && inPeriod(record.createdAt));
  const funnelCases = [...linkedCases, ...directCases];
  const delivered = funnelCases.filter((record) => record.status === "car_delivery");
  const linkedDelivered = linkedCases.filter((record) => record.status === "car_delivery");
  return {
    leadIds: cohortLeads.map((lead) => lead.id),
    caseIds: funnelCases.map((record) => record.id),
    deliveredIds: delivered.map((record) => record.id),
    directCaseIds: directCases.map((record) => record.id),
    leadToCase: funnelRate(linkedCases.length, cohortLeads.length),
    caseToDelivered: funnelRate(delivered.length, funnelCases.length),
    leadToDelivered: funnelRate(linkedDelivered.length, cohortLeads.length),
    notConverted: cohortLeads.length - linkedCases.length,
    notDelivered: funnelCases.length - delivered.length,
  };
}
