export type ReminderLead = { id: string; owner_id: string };
export type ReminderProfile = { id: string; role: string };
export type ReminderCounts = { newCount: number; contactedCount: number };

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
  if (contactedLeads.length) {
    for (const profile of profiles) {
      if (profile.role === "admin") grouped.set(profile.id, { newCount: 0, contactedCount: contactedLeads.length });
    }
  }
  return grouped;
}

export function reminderMessage({ newCount, contactedCount }: ReminderCounts): string {
  const parts = [];
  if (newCount) parts.push(`${newCount} new lead${newCount === 1 ? "" : "s"} waiting for a call`);
  if (contactedCount) parts.push(`${contactedCount} contacted lead${contactedCount === 1 ? " needs" : "s need"} follow-up`);
  return `${parts.join("; ")}.`;
}
