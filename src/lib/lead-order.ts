import type { LeadRecord } from "./types";

function latestActivity(lead: LeadRecord) {
  return Math.max(...[
    lead.receivedAt || lead.createdAt, lead.updatedAt,
    ...lead.notes.map((note) => note.createdAt),
    ...lead.events.map((event) => event.createdAt),
    ...lead.followUps.map((action) => action.createdAt),
  ].map((time) => Date.parse(time) || 0));
}

export function compareLeadActivity(left: LeadRecord, right: LeadRecord) {
  return latestActivity(right) - latestActivity(left) || left.id.localeCompare(right.id);
}
