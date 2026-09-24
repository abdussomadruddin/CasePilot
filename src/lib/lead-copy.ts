import type { LeadRecord } from "./types";
import { hideLeadPhoneInNote } from "../../supabase/functions/_shared/lead-contact.ts";

type CopyableLead = Pick<LeadRecord,
  "source" | "sourceNote" | "customerName" | "customerPhone" | "email" | "carBrand" | "carModel" | "notes"
>;

const sourceTitles: Record<LeadRecord["source"], string> = {
  tiktok_ads: "Tiktok",
  meta_ads: "Meta",
  manual_upload: "Manual",
};

export function formatLeadCopy(lead: CopyableLead, phoneRevealed = true): string {
  const title = `*New Car Sales Inquiry From ${sourceTitles[lead.source]}*`;
  const sourceNote = hideLeadPhoneInNote(lead.sourceNote.trim(), phoneRevealed);
  const missingContact = [lead.customerName, phoneRevealed ? lead.customerPhone : "", lead.email]
    .map((value) => value.trim())
    .filter((value) => value && !sourceNote.toLowerCase().includes(value.toLowerCase()));
  const details = sourceNote
    ? [...missingContact, sourceNote]
    : [lead.customerName, phoneRevealed ? lead.customerPhone : "", lead.email, lead.carModel || lead.carBrand]
      .map((value) => value.trim()).filter(Boolean);
  const followUpNotes = lead.notes
    .slice().reverse()
    .map((entry) => hideLeadPhoneInNote(entry.body.trim(), phoneRevealed))
    .filter(Boolean);
  const body = [...details, ...(followUpNotes.length ? ["", "Follow-up notes:", ...followUpNotes] : [])].join("\n");
  return `${title}\n\n${body}`.trimEnd();
}
