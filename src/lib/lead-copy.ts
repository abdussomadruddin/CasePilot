import type { LeadRecord } from "./types";

type CopyableLead = Pick<LeadRecord,
  "source" | "sourceNote" | "customerName" | "customerPhone" | "email" | "carBrand" | "carModel" | "notes"
>;

const sourceTitles: Record<LeadRecord["source"], string> = {
  tiktok_ads: "Tiktok",
  meta_ads: "Meta",
  manual_upload: "Manual",
};

export function formatLeadCopy(lead: CopyableLead): string {
  const title = `*New Car Sales Inquiry From ${sourceTitles[lead.source]}*`;
  const sourceNote = lead.sourceNote.trim();
  const missingContact = [lead.customerName, lead.customerPhone, lead.email]
    .map((value) => value.trim())
    .filter((value) => value && !sourceNote.toLowerCase().includes(value.toLowerCase()));
  const details = sourceNote
    ? [...missingContact, sourceNote]
    : [lead.customerName, lead.customerPhone, lead.email, lead.carModel || lead.carBrand]
      .map((value) => value.trim()).filter(Boolean);
  const followUpNotes = lead.notes
    .slice().reverse()
    .map((entry) => entry.body.trim())
    .filter(Boolean);
  const body = [...details, ...(followUpNotes.length ? ["", "Follow-up notes:", ...followUpNotes] : [])].join("\n");
  return `${title}\n\n${body}`.trimEnd();
}
