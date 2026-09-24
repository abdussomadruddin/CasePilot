export type ReminderLead = { id: string; owner_id: string };
export type ReminderProfile = { id: string; role: string };
export type ReminderCounts = { newCount: number; contactedCount: number };

const newLeadHoursUtc = new Set([2, 3, 4, 6, 8]);
const contactedHoursUtc = new Set([1, 7, 13]);

export function reminderTypeAt(now: Date): "new" | "contacted" | null {
  if (now.getUTCMinutes() > 10) return null;
  if (newLeadHoursUtc.has(now.getUTCHours())) return "new";
  if (contactedHoursUtc.has(now.getUTCHours())) return "contacted";
  return null;
}

export function groupLeadReminders(
  newLeads: ReminderLead[],
  contactedLeads: ReminderLead[],
  profiles: ReminderProfile[],
): Map<string, ReminderCounts> {
  const grouped = new Map<string, ReminderCounts>();
  const owners = new Set(profiles.filter((profile) => ["customer_service", "broker"].includes(profile.role)).map((profile) => profile.id));

  for (const lead of newLeads) {
    if (!owners.has(lead.owner_id)) continue;
    const counts = grouped.get(lead.owner_id) || { newCount: 0, contactedCount: 0 };
    counts.newCount += 1;
    grouped.set(lead.owner_id, counts);
  }
  for (const lead of contactedLeads) {
    if (!owners.has(lead.owner_id)) continue;
    const counts = grouped.get(lead.owner_id) || { newCount: 0, contactedCount: 0 };
    counts.contactedCount += 1;
    grouped.set(lead.owner_id, counts);
  }
  return grouped;
}

export function reminderMessage({ newCount, contactedCount }: ReminderCounts): string {
  const parts = [];
  if (newCount) parts.push(`${newCount} new lead${newCount === 1 ? "" : "s"} waiting for a call`);
  if (contactedCount) parts.push(`${contactedCount} contacted lead${contactedCount === 1 ? " needs" : "s need"} follow-up`);
  return `${parts.join("; ")}.`;
}
